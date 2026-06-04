import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/domains/auth/types";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";
import { deleteProjectContextRawObject } from "@/use-cases/project-context-raw-storage";

export const projectContextRetentionAuditEvents = [
  "project_context.upload_created",
  "project_context.malware_scan_result",
  "project_context.extraction_result",
  "project_context.normalization_result",
  "project_context.preview_viewed",
  "project_context.review_pending_set",
  "project_context.active_set",
  "project_context.reject_set",
  "project_context.archive_set",
  "project_context.raw_retention_extended",
  "project_context.raw_deleted",
  "project_context.raw_deletion_failed",
  "project_context.review_time_context_searched",
  "project_context.review_time_chunk_included",
] as const;

export const projectContextOperationMetrics = [
  "project_context.malware_scan_failure_count",
  "project_context.extraction_failure_count",
  "project_context.normalization_failure_count",
  "project_context.stuck_job_count",
  "project_context.raw_deletion_failure_count",
  "project_context.search_failure_count",
  "project_context.quota_exceeded_count",
  "project_context.large_corpus_count",
  "project_context.retry_exhaustion_count",
] as const;

export async function deleteExpiredProjectContextRawBlobs(input: { now?: Date; limit?: number } = {}) {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 1_000));
  const rows = await prisma.$queryRaw<Array<{ upload_id: string; raw_storage_key: string }>>(Prisma.sql`
    select upload_id, raw_storage_key
    from upload_reference
    where raw_storage_key is not null
      and raw_deleted_at is null
      and raw_deletion_status in ('pending', 'retention_extended', 'delete_failed')
      and raw_retention_until <= ${now.toISOString()}::timestamptz
    order by raw_retention_until asc
    limit ${limit}
  `);
  const deletedUploadIds: string[] = [];
  const failedUploadIds: string[] = [];

  for (const row of rows) {
    try {
      await deleteProjectContextRawObject(row.raw_storage_key);
      await prisma.$executeRaw(Prisma.sql`
        update upload_reference
        set raw_storage_key = null,
            raw_deleted_at = now(),
            raw_deletion_status = 'deleted'
        where upload_id = ${row.upload_id}::uuid
          and raw_storage_key = ${row.raw_storage_key}
      `);
      deletedUploadIds.push(row.upload_id);
    } catch (error) {
      failedUploadIds.push(row.upload_id);
      await markProjectContextRawDeletionFailed({
        uploadId: row.upload_id,
        errorCode: error instanceof Error ? error.message.slice(0, 120) : "RAW_DELETE_FAILED",
      });
    }
  }

  return {
    deletedUploadIds,
    failedUploadIds,
    auditEventType: "project_context.raw_deleted" as const,
    chunksRemainUntouched: true,
  };
}

export async function markProjectContextRawDeletionFailed(input: { uploadId: string; errorCode: string }) {
  await prisma.$executeRaw(Prisma.sql`
    update upload_reference
    set raw_deletion_status = 'delete_failed',
        raw_deleted_at = null
    where upload_id = ${input.uploadId}::uuid
  `);
  return {
    uploadId: input.uploadId,
    errorCode: input.errorCode,
    auditEventType: "project_context.raw_deletion_failed" as const,
    retryMetric: "project_context.raw_deletion_failure_count" as const,
  };
}

export async function extendProjectContextRawRetention(input: {
  projectId: string;
  uploadId: string;
  retentionUntil: Date;
  user: AuthUser;
}) {
  await requireProjectManager(input.projectId, input.user);
  await prisma.$executeRaw(Prisma.sql`
    update upload_reference
    set raw_retention_until = ${input.retentionUntil.toISOString()}::timestamptz,
        raw_deletion_status = 'retention_extended'
    where project_id = ${input.projectId}::uuid
      and upload_id = ${input.uploadId}::uuid
      and raw_deleted_at is null
  `);
  return {
    uploadId: input.uploadId,
    rawRetentionUntil: input.retentionUntil.toISOString(),
    auditEventType: "project_context.raw_retention_extended" as const,
  };
}
