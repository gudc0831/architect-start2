import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/domains/auth/types";
import { forbidden, notFound } from "@/lib/api/errors";
import { canManageProjectMembers } from "@/lib/auth/project-capabilities";
import { requireProjectAccess, requireProjectManager } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";

export type ProjectContextVersionStatusAction = "active" | "rejected" | "archived";

export type ProjectContextUploadPreview = {
  uploadId: string;
  sourceId: string;
  versionId: string;
  projectId: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedTaskId: string | null;
  applicationScope: "project-wide";
  rawRetentionUntil: string;
  rawDeletionStatus: string;
  rawDeletionWarning: string;
  normalizationRuleVersion: string;
  parserVersion: string;
  processedAt: string | null;
  extractedText: string | null;
  versionStatus: string;
  chunks: ProjectContextPreviewChunk[];
};

export type ProjectContextPreviewChunk = {
  chunkId: string;
  normalizedText: string;
  sourceQuote: string;
  location: unknown;
  contextType: string;
  chunkQualityScore: number;
  injectionRisk: string;
};

export type ProjectContextUploadListItem = {
  uploadId: string;
  sourceId: string;
  versionId: string;
  projectId: string;
  fileName: string;
  uploadedByUserId: string;
  uploadedTaskId: string | null;
  createdAt: string;
  rawRetentionUntil: string;
  rawDeletionStatus: string;
  normalizationRuleVersion: string;
  parserVersion: string;
  processedAt: string | null;
  versionStatus: string;
  failureCode: string | null;
  failureMessage: string | null;
  chunkCount: number;
  canApprove: boolean;
  applicationScope: "project-wide";
};

export async function listProjectContextUploads(input: {
  projectId: string;
  user: AuthUser;
}): Promise<{ items: ProjectContextUploadListItem[]; canApprove: boolean }> {
  const access = await requireProjectAccess(input.projectId, input.user);
  const canApprove = canManageProjectMembers({
    globalRole: input.user.role,
    projectRole: access.membership?.role ?? null,
  });
  const rows = await prisma.$queryRaw<ProjectContextUploadListRow[]>(Prisma.sql`
    select
      upload.upload_id,
      upload.source_id,
      upload.version_id,
      upload.project_id,
      upload.original_filename,
      upload.uploaded_by_user_id,
      upload.uploaded_task_id,
      upload.created_at,
      upload.raw_retention_until,
      upload.raw_deletion_status,
      version.normalization_rule_version,
      version.parser_version,
      version.processed_at,
      version.status as version_status,
      version.failure_code,
      version.failure_message,
      count(chunk.chunk_id)::int as chunk_count
    from upload_reference upload
    join project_upload_version version on version.version_id = upload.version_id
    left join project_upload_chunk chunk on chunk.upload_id = upload.upload_id
    where upload.project_id = ${input.projectId}::uuid
    group by
      upload.upload_id,
      upload.source_id,
      upload.version_id,
      upload.project_id,
      upload.original_filename,
      upload.uploaded_by_user_id,
      upload.uploaded_task_id,
      upload.created_at,
      upload.raw_retention_until,
      upload.raw_deletion_status,
      version.normalization_rule_version,
      version.parser_version,
      version.processed_at,
      version.status,
      version.failure_code,
      version.failure_message
    order by upload.created_at desc, upload.upload_id desc
    limit 100
  `);

  return {
    canApprove,
    items: rows.map((row) => ({
      uploadId: row.upload_id,
      sourceId: row.source_id,
      versionId: row.version_id,
      projectId: row.project_id,
      fileName: row.original_filename,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedTaskId: row.uploaded_task_id,
      createdAt: toIsoString(row.created_at),
      rawRetentionUntil: toIsoString(row.raw_retention_until),
      rawDeletionStatus: row.raw_deletion_status,
      normalizationRuleVersion: row.normalization_rule_version,
      parserVersion: row.parser_version,
      processedAt: row.processed_at ? toIsoString(row.processed_at) : null,
      versionStatus: row.version_status,
      failureCode: row.failure_code,
      failureMessage: row.failure_message,
      chunkCount: Number(row.chunk_count),
      canApprove,
      applicationScope: "project-wide",
    })),
  };
}

export async function getProjectContextUploadPreview(input: {
  projectId: string;
  uploadId: string;
  user: AuthUser;
}): Promise<ProjectContextUploadPreview> {
  const access = await requireProjectAccess(input.projectId, input.user);
  const [upload] = await prisma.$queryRaw<ProjectContextUploadPreviewRow[]>(Prisma.sql`
    select
      upload.upload_id,
      upload.source_id,
      upload.version_id,
      upload.project_id,
      upload.original_filename,
      upload.uploaded_by_user_id,
      upload.uploaded_task_id,
      upload.raw_retention_until,
      upload.raw_deletion_status,
      version.normalization_rule_version,
      version.parser_version,
      version.processed_at,
      version.status as version_status
    from upload_reference upload
    join project_upload_version version on version.version_id = upload.version_id
    where upload.project_id = ${input.projectId}::uuid
      and upload.upload_id = ${input.uploadId}::uuid
  `);

  if (!upload) {
    throw notFound("Project context upload not found.", "PROJECT_CONTEXT_UPLOAD_NOT_FOUND");
  }

  const canManage = canManageProjectMembers({
    globalRole: input.user.role,
    projectRole: access.membership?.role ?? null,
  });
  if (!canManage && upload.uploaded_by_user_id !== input.user.id) {
    throw forbidden("Only the uploader or project manager can preview this upload.", "PROJECT_CONTEXT_PREVIEW_FORBIDDEN");
  }

  const chunks = await prisma.$queryRaw<ProjectContextPreviewChunkRow[]>(Prisma.sql`
    select
      chunk.chunk_id,
      chunk.normalized_text,
      chunk.source_quote,
      chunk.context_type,
      chunk.chunk_quality_score,
      chunk.injection_risk,
      jsonb_build_object(
        'locationType', location.location_type,
        'lineStart', location.line_start,
        'lineEnd', location.line_end,
        'pageNumber', location.page_number,
        'paragraphIndex', location.paragraph_index,
        'sheetName', location.sheet_name,
        'rowStart', location.row_start,
        'rowEnd', location.row_end,
        'cellRange', location.cell_range,
        'messageIndexStart', location.message_index_start,
        'messageIndexEnd', location.message_index_end,
        'sender', location.sender,
        'timestampStart', location.timestamp_start,
        'timestampEnd', location.timestamp_end,
        'headingPath', location.heading_path
      ) as location
    from project_upload_chunk chunk
    join chunk_location location on location.chunk_id = chunk.chunk_id
    where chunk.project_id = ${input.projectId}::uuid
      and chunk.upload_id = ${input.uploadId}::uuid
    order by chunk.created_at asc, chunk.chunk_id asc
  `);

  return {
    uploadId: upload.upload_id,
    sourceId: upload.source_id,
    versionId: upload.version_id,
    projectId: upload.project_id,
    fileName: upload.original_filename,
    uploadedByUserId: upload.uploaded_by_user_id,
    uploadedTaskId: upload.uploaded_task_id,
    applicationScope: "project-wide",
    rawRetentionUntil: toIsoString(upload.raw_retention_until),
    rawDeletionStatus: upload.raw_deletion_status,
    rawDeletionWarning: "Original files are temporarily retained for 7 days by default and then deleted.",
    normalizationRuleVersion: upload.normalization_rule_version,
    parserVersion: upload.parser_version,
    processedAt: upload.processed_at ? toIsoString(upload.processed_at) : null,
    extractedText: null,
    versionStatus: upload.version_status,
    chunks: chunks.map((chunk) => ({
      chunkId: chunk.chunk_id,
      normalizedText: chunk.normalized_text,
      sourceQuote: chunk.source_quote,
      location: chunk.location,
      contextType: chunk.context_type,
      chunkQualityScore: Number(chunk.chunk_quality_score),
      injectionRisk: chunk.injection_risk,
    })),
  };
}

export async function updateProjectContextVersionStatus(input: {
  projectId: string;
  versionId: string;
  status: ProjectContextVersionStatusAction;
  user: AuthUser;
}) {
  await requireProjectManager(input.projectId, input.user);

  const [version] = await prisma.$queryRaw<Array<{ source_id: string; version_id: string }>>(Prisma.sql`
    select source_id, version_id
    from project_upload_version
    where project_id = ${input.projectId}::uuid
      and version_id = ${input.versionId}::uuid
  `);

  if (!version) {
    throw notFound("Project context version not found.", "PROJECT_CONTEXT_VERSION_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    if (input.status === "active") {
      await tx.$executeRaw(Prisma.sql`
        update project_upload_version
        set status = 'active',
            activated_at = now(),
            activated_by_user_id = ${input.user.id}::uuid,
            updated_at = now()
        where project_id = ${input.projectId}::uuid
          and version_id = ${input.versionId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        update project_upload_source
        set latest_active_version_id = ${input.versionId}::uuid,
            updated_at = now()
        where project_id = ${input.projectId}::uuid
          and source_id = ${version.source_id}::uuid
      `);
    } else {
      await tx.$executeRaw(Prisma.sql`
        update project_upload_version
        set status = ${input.status},
            rejected_at = case when ${input.status} = 'rejected' then now() else rejected_at end,
            archived_at = case when ${input.status} = 'archived' then now() else archived_at end,
            updated_at = now()
        where project_id = ${input.projectId}::uuid
          and version_id = ${input.versionId}::uuid
      `);
      if (input.status === "archived") {
        await tx.$executeRaw(Prisma.sql`
          update project_upload_source
          set latest_active_version_id = null,
              updated_at = now()
          where project_id = ${input.projectId}::uuid
            and source_id = ${version.source_id}::uuid
            and latest_active_version_id = ${input.versionId}::uuid
        `);
      }
    }

    const [updated] = await tx.$queryRaw<Array<{ version_id: string; status: string; source_id: string }>>(Prisma.sql`
      select version_id, status, source_id
      from project_upload_version
      where project_id = ${input.projectId}::uuid
        and version_id = ${input.versionId}::uuid
    `);
    return {
      versionId: updated?.version_id ?? input.versionId,
      sourceId: updated?.source_id ?? version.source_id,
      status: updated?.status ?? input.status,
      applicationScope: "project-wide" as const,
      appliesToNewTaskReviewsOnly: true,
    };
  });
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : String(value);
}

type ProjectContextUploadPreviewRow = {
  upload_id: string;
  source_id: string;
  version_id: string;
  project_id: string;
  original_filename: string;
  uploaded_by_user_id: string;
  uploaded_task_id: string | null;
  raw_retention_until: Date | string;
  raw_deletion_status: string;
  normalization_rule_version: string;
  parser_version: string;
  processed_at: Date | string | null;
  version_status: string;
};

type ProjectContextUploadListRow = ProjectContextUploadPreviewRow & {
  created_at: Date | string;
  failure_code: string | null;
  failure_message: string | null;
  chunk_count: number | string;
};

type ProjectContextPreviewChunkRow = {
  chunk_id: string;
  normalized_text: string;
  source_quote: string;
  context_type: string;
  chunk_quality_score: number | string;
  injection_risk: string;
  location: unknown;
};
