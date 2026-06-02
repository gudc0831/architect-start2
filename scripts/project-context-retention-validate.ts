import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  projectContextOperationMetrics,
  projectContextRetentionAuditEvents,
} from "../src/use-cases/project-context-retention-service";

const root = process.cwd();
const serviceSource = readFileSync(join(root, "src", "use-cases", "project-context-retention-service.ts"), "utf8");
const schemaSource = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const migrationSource = readFileSync(join(root, "prisma", "migrations", "202606020001_add_project_context_uploads", "migration.sql"), "utf8");

for (const eventType of [
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
]) {
  assert.ok(projectContextRetentionAuditEvents.includes(eventType as (typeof projectContextRetentionAuditEvents)[number]));
}

for (const metric of [
  "project_context.malware_scan_failure_count",
  "project_context.extraction_failure_count",
  "project_context.normalization_failure_count",
  "project_context.stuck_job_count",
  "project_context.raw_deletion_failure_count",
  "project_context.search_failure_count",
  "project_context.quota_exceeded_count",
  "project_context.large_corpus_count",
  "project_context.retry_exhaustion_count",
]) {
  assert.ok(projectContextOperationMetrics.includes(metric as (typeof projectContextOperationMetrics)[number]));
}

assert.match(schemaSource, /rawRetentionUntil\s+DateTime\s+@default\(dbgenerated\("\(now\(\) \+ '7 days'::interval\)"\)\)/);
assert.match(migrationSource, /"raw_retention_until"\s+timestamptz\(6\)\s+not null\s+default \(now\(\) \+ interval '7 days'\)/i);
assert.match(serviceSource, /deleteExpiredProjectContextRawBlobs/);
assert.match(serviceSource, /deleteProjectContextRawObject\(row\.raw_storage_key\)/);
assert.match(serviceSource, /raw_storage_key = null/);
assert.match(serviceSource, /raw_deleted_at = now\(\)/);
assert.match(serviceSource, /raw_deletion_status = 'deleted'/);
assert.match(serviceSource, /failedUploadIds/);
assert.doesNotMatch(serviceSource, /delete from project_upload_chunk/i);
assert.doesNotMatch(serviceSource, /delete from chunk_location/i);
assert.doesNotMatch(serviceSource, /delete from review_corpus_trace/i);
assert.match(serviceSource, /markProjectContextRawDeletionFailed/);
assert.match(serviceSource, /raw_deletion_status = 'delete_failed'/);
assert.match(serviceSource, /extendProjectContextRawRetention/);
assert.match(serviceSource, /requireProjectManager\(input\.projectId, input\.user\)/);
assert.match(serviceSource, /chunksRemainUntouched: true/);

console.log(JSON.stringify({ status: "passed", retention: "project_context" }));
