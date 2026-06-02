import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = "202606020001_add_project_context_uploads";
const root = process.cwd();
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const migrationSql = readFileSync(join(root, "prisma", "migrations", migration, "migration.sql"), "utf8");

const tableModels = [
  ["project_upload_source", "ProjectUploadSource"],
  ["project_upload_version", "ProjectUploadVersion"],
  ["project_upload_chunk", "ProjectUploadChunk"],
  ["chunk_location", "ChunkLocation"],
  ["upload_reference", "UploadReference"],
  ["review_corpus_trace", "ReviewCorpusTrace"],
] as const;

for (const [tableName, modelName] of tableModels) {
  assert.match(schema, new RegExp(`model ${modelName} \\{`), `${modelName} model is missing`);
  assert.match(schema, new RegExp(`@@map\\("${tableName}"\\)`), `${modelName} @@map is missing`);
  assert.match(migrationSql, new RegExp(`create table if not exists "${tableName}"`, "i"), `${tableName} table is missing`);
  assert.match(
    migrationSql,
    new RegExp(`alter table public\\.${tableName} enable row level security`, "i"),
    `${tableName} RLS enablement is missing`,
  );
}

assert.doesNotMatch(schema, /legal_evidence_project_upload/i);
assert.doesNotMatch(migrationSql, /legal_evidence_project_upload/i);

const taskModel = extractModel(schema, "Task");
assert.match(taskModel, /@@unique\(\[projectId, id\]\)/);
assert.match(
  migrationSql,
  /create unique index if not exists "tasks_project_id_id_key"\s+on "tasks"\("project_id", "id"\)/i,
);

const versionModel = extractModel(schema, "ProjectUploadVersion");
assert.match(versionModel, /status\s+String\s+@default\("uploaded"\)/);
assert.match(versionModel, /@@unique\(\[projectId, sourceId, versionId\]\)/);

const versionTable = extractCreateTable(migrationSql, "project_upload_version");
assert.match(versionTable, /"status"\s+text\s+not null\s+default 'uploaded'/i);
assert.match(
  versionTable,
  /constraint "project_upload_version_status_check" check \("status" in \('uploaded', 'extracting', 'normalized_draft', 'review_pending', 'active', 'archived', 'rejected', 'failed'\)\)/i,
);
assert.doesNotMatch(versionTable, /'processing'/i);

const uploadReferenceModel = extractModel(schema, "UploadReference");
assert.match(
  uploadReferenceModel,
  /rawRetentionUntil\s+DateTime\s+@default\(dbgenerated\("\(now\(\) \+ '7 days'::interval\)"\)\)\s+@map\("raw_retention_until"\)/,
);
assert.match(uploadReferenceModel, /rawDeletionStatus\s+String\s+@default\("pending"\)\s+@map\("raw_deletion_status"\)/);
assert.match(
  uploadReferenceModel,
  /uploadedTask\s+Task\?\s+@relation\("UploadReferenceUploadedTask", fields: \[projectId, uploadedTaskId\], references: \[projectId, id\], onDelete: NoAction\)/,
);
assert.match(uploadReferenceModel, /@@unique\(\[projectId, sourceId, versionId, uploadId\]\)/);

const uploadReferenceTable = extractCreateTable(migrationSql, "upload_reference");
assert.match(uploadReferenceTable, /"raw_retention_until"\s+timestamptz\(6\)\s+not null\s+default \(now\(\) \+ interval '7 days'\)/i);
assert.match(uploadReferenceTable, /"raw_deletion_status"\s+text\s+not null\s+default 'pending'/i);
assert.match(uploadReferenceTable, /constraint "upload_reference_raw_retention_after_created" check \("raw_retention_until" >= "created_at"\)/i);
assert.match(
  uploadReferenceTable,
  /constraint "upload_reference_raw_deletion_status_check" check \("raw_deletion_status" in \('pending', 'deleted', 'delete_failed', 'retention_extended'\)\)/i,
);
assert.match(
  uploadReferenceTable,
  /constraint "upload_reference_raw_deletion_status_consistency" check \([\s\S]*?"raw_deletion_status" = 'deleted'[\s\S]*?"raw_deleted_at" is not null[\s\S]*?"raw_deletion_status" <> 'deleted'[\s\S]*?"raw_deleted_at" is null[\s\S]*?\)/i,
);
assert.doesNotMatch(
  uploadReferenceTable,
  /constraint "upload_reference_raw_deletion_status_check" check \("raw_deletion_status" in \([^)]*'failed'/i,
);

const chunkModel = extractModel(schema, "ProjectUploadChunk");
assert.match(chunkModel, /normalizedText\s+String\s+@map\("normalized_text"\)/);
assert.match(chunkModel, /sourceQuote\s+String\s+@map\("source_quote"\)/);
assert.match(chunkModel, /authority\s+String\s+@default\("project_context"\)/);
assert.match(chunkModel, /allowedUse\s+String\s+@default\("task_review_context_only"\)\s+@map\("allowed_use"\)/);
assert.match(chunkModel, /injectionRisk\s+String\s+@default\("none"\)\s+@map\("injection_risk"\)/);

const chunkTable = extractCreateTable(migrationSql, "project_upload_chunk");
assert.match(chunkTable, /"normalized_text"\s+text\s+not null/i);
assert.match(chunkTable, /"source_quote"\s+text\s+not null/i);
assert.match(chunkTable, /"authority"\s+text\s+not null\s+default 'project_context'/i);
assert.match(chunkTable, /"allowed_use"\s+text\s+not null\s+default 'task_review_context_only'/i);
assert.match(chunkTable, /"injection_risk"\s+text\s+not null\s+default 'none'/i);
assert.match(chunkTable, /constraint "project_upload_chunk_normalized_text_nonempty" check/i);
assert.match(chunkTable, /constraint "project_upload_chunk_source_quote_nonempty" check/i);
assert.match(chunkTable, /constraint "project_upload_chunk_authority_check" check \("authority" = 'project_context'\)/i);
assert.match(
  chunkTable,
  /constraint "project_upload_chunk_allowed_use_check" check \("allowed_use" = 'task_review_context_only'\)/i,
);
assert.match(
  chunkTable,
  /constraint "project_upload_chunk_injection_risk_check" check \("injection_risk" in \('none', 'suspected', 'blocked'\)\)/i,
);
assert.doesNotMatch(
  chunkTable,
  /constraint "project_upload_chunk_injection_risk_check" check \("injection_risk" in \([^)]*'(low|medium|high)'/i,
);

const locationTable = extractCreateTable(migrationSql, "chunk_location");
assert.match(locationTable, /constraint "chunk_location_locator_present_check" check \([\s\S]*?"page_number" is not null[\s\S]*?"heading_path" is not null[\s\S]*?\)/i);
assert.match(
  migrationSql,
  /create or replace function public\.ensure_project_upload_chunk_location\(\)[\s\S]*?set search_path = public, pg_temp[\s\S]*?project_upload_chunk requires chunk_location/i,
);
assert.match(
  migrationSql,
  /create constraint trigger "project_upload_chunk_location_required"[\s\S]*?deferrable initially deferred[\s\S]*?execute function public\.ensure_project_upload_chunk_location\(\)/i,
);
assert.match(
  migrationSql,
  /create constraint trigger "chunk_location_parent_guard"[\s\S]*?deferrable initially deferred[\s\S]*?execute function public\.ensure_project_upload_chunk_location\(\)/i,
);

const traceModel = extractModel(schema, "ReviewCorpusTrace");
assert.match(traceModel, /corpusStatus\s+String\s+@map\("corpus_status"\)/);
assert.match(traceModel, /fallbackMode\s+String\s+@default\("none"\)\s+@map\("fallback_mode"\)/);
assert.match(traceModel, /searchErrorCode\s+String\?\s+@map\("search_error_code"\)/);
assert.match(
  traceModel,
  /task\s+Task\s+@relation\(fields: \[projectId, taskId\], references: \[projectId, id\], onDelete: Cascade\)/,
);

const traceTable = extractCreateTable(migrationSql, "review_corpus_trace");
assert.match(traceTable, /"corpus_status"\s+text\s+not null/i);
assert.match(traceTable, /"fallback_mode"\s+text\s+not null\s+default 'none'/i);
assert.match(traceTable, /"search_error_code"\s+text/i);
assert.match(
  traceTable,
  /constraint "review_corpus_trace_corpus_status_check" check \("corpus_status" in \('chunks_found', 'active_corpus_missing', 'no_relevant_chunks', 'search_failed'\)\)/i,
);
assert.match(
  traceTable,
  /constraint "review_corpus_trace_fallback_mode_check" check \("fallback_mode" in \('none', 'legal_only_after_project_context_error'\)\)/i,
);
assert.match(
  traceTable,
  /constraint "review_corpus_trace_status_payload_check" check \([\s\S]*?"corpus_status" = 'search_failed'[\s\S]*?"fallback_mode" = 'legal_only_after_project_context_error'[\s\S]*?"search_error_code"[\s\S]*?"corpus_status" = 'no_relevant_chunks'[\s\S]*?"no_relevant_chunk_reason"[\s\S]*?\)/i,
);
assert.doesNotMatch(
  traceTable,
  /constraint "review_corpus_trace_corpus_status_check" check \("corpus_status" in \([^)]*'(ready|empty|fallback|error)'/i,
);

const projectOwnedTables = [
  "project_upload_source",
  "project_upload_version",
  "upload_reference",
  "project_upload_chunk",
] as const;
for (const tableName of projectOwnedTables) {
  assertProjectPolicy(tableName, "select", "can_access_project");
  assertProjectPolicy(tableName, "insert", "can_write_project");
  assertProjectPolicy(tableName, "update", "can_write_project");
}

assertProjectPolicy("chunk_location", "select", "can_access_project");
assertProjectPolicy("chunk_location", "insert", "can_write_project");
assertProjectPolicy("chunk_location", "update", "can_write_project");
assert.match(migrationSql, /from public\.project_upload_chunk chunk/i);

assertProjectPolicy("review_corpus_trace", "select", "can_access_task");
assertProjectPolicy("review_corpus_trace", "insert", "can_write_task");
assertProjectPolicy("review_corpus_trace", "update", "can_write_task");

assert.match(
  migrationSql,
  /create policy "upload_reference_[^"]*insert[^"]*"[\s\S]*?\(uploaded_task_id is null or app_private\.can_write_task\(project_id, uploaded_task_id\)\)/i,
);
assert.match(
  migrationSql,
  /create policy "upload_reference_[^"]*update[^"]*"[\s\S]*?\(uploaded_task_id is null or app_private\.can_write_task\(project_id, uploaded_task_id\)\)/i,
);

const requiredIndexes = [
  /constraint "project_upload_source_project_source_key" unique \("project_id", "source_id"\)/i,
  /project_upload_source_project_latest_active_idx[\s\S]*?\("project_id", "latest_active_version_id"\)/i,
  /project_upload_version_project_status_idx[\s\S]*?\("project_id", "status"\)/i,
  /project_upload_version_source_status_activated_idx[\s\S]*?\("source_id", "status", "activated_at" desc\)/i,
  /upload_reference_project_uploader_created_idx[\s\S]*?\("project_id", "uploaded_by_user_id", "created_at" desc\)/i,
  /upload_reference_raw_retention_deleted_idx[\s\S]*?\("raw_retention_until", "raw_deleted_at"\)/i,
  /project_upload_chunk_project_version_idx[\s\S]*?\("project_id", "version_id"\)/i,
  /project_upload_chunk_project_context_type_idx[\s\S]*?\("project_id", "context_type"\)/i,
  /review_corpus_trace_review_corpus_type_idx[\s\S]*?\("review_id", "corpus_type"\)/i,
  /review_corpus_trace_project_task_searched_idx[\s\S]*?\("project_id", "task_id", "searched_at" desc\)/i,
];
for (const requiredIndex of requiredIndexes) {
  assert.match(migrationSql, requiredIndex);
}

const requiredProjectConsistencyConstraints = [
  /constraint "project_upload_version_project_source_version_key" unique \("project_id", "source_id", "version_id"\)/i,
  /constraint "project_upload_version_project_source_fkey" foreign key \("project_id", "source_id"\) references "project_upload_source"\("project_id", "source_id"\)/i,
  /constraint "project_upload_source_latest_active_version_project_source_fkey"[\s\S]*?foreign key \("project_id", "source_id", "latest_active_version_id"\)[\s\S]*?references "project_upload_version"\("project_id", "source_id", "version_id"\)/i,
  /constraint "upload_reference_project_source_version_upload_key" unique \("project_id", "source_id", "version_id", "upload_id"\)/i,
  /constraint "upload_reference_project_source_fkey" foreign key \("project_id", "source_id"\) references "project_upload_source"\("project_id", "source_id"\)/i,
  /constraint "upload_reference_project_source_version_fkey" foreign key \("project_id", "source_id", "version_id"\) references "project_upload_version"\("project_id", "source_id", "version_id"\)/i,
  /constraint "upload_reference_project_uploaded_task_fkey" foreign key \("project_id", "uploaded_task_id"\) references "tasks"\("project_id", "id"\) on delete no action/i,
  /constraint "project_upload_chunk_project_source_fkey" foreign key \("project_id", "source_id"\) references "project_upload_source"\("project_id", "source_id"\)/i,
  /constraint "project_upload_chunk_project_source_version_fkey" foreign key \("project_id", "source_id", "version_id"\) references "project_upload_version"\("project_id", "source_id", "version_id"\)/i,
  /constraint "project_upload_chunk_project_source_version_upload_fkey" foreign key \("project_id", "source_id", "version_id", "upload_id"\) references "upload_reference"\("project_id", "source_id", "version_id", "upload_id"\)/i,
  /constraint "review_corpus_trace_project_task_fkey" foreign key \("project_id", "task_id"\) references "tasks"\("project_id", "id"\) on delete cascade/i,
];
for (const requiredConstraint of requiredProjectConsistencyConstraints) {
  assert.match(migrationSql, requiredConstraint);
}

assert.match(
  migrationSql,
  /create or replace function public\.ensure_project_upload_latest_active_version\(\)[\s\S]*?set search_path = public, pg_temp[\s\S]*?latest_active_version_id must reference an active version/i,
);
assert.match(
  migrationSql,
  /create constraint trigger "project_upload_source_latest_active_status_guard"[\s\S]*?deferrable initially deferred[\s\S]*?execute function public\.ensure_project_upload_latest_active_version\(\)/i,
);
assert.match(
  migrationSql,
  /create constraint trigger "project_upload_version_latest_active_status_guard"[\s\S]*?deferrable initially deferred[\s\S]*?execute function public\.ensure_project_upload_latest_active_version\(\)/i,
);

console.log(JSON.stringify({ status: "passed", migration }));

function extractModel(source: string, modelName: string): string {
  const match = new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`, "m").exec(source);
  assert.ok(match, `${modelName} model block is missing`);
  return match[0];
}

function extractCreateTable(source: string, tableName: string): string {
  const match = new RegExp(`create table if not exists "${tableName}" \\([\\s\\S]*?\\n\\);`, "i").exec(source);
  assert.ok(match, `${tableName} create table block is missing`);
  return match[0];
}

function assertProjectPolicy(tableName: string, operation: "select" | "insert" | "update", helperName: string): void {
  assert.match(
    migrationSql,
    new RegExp(
      `create policy "${tableName}_[^"]*${operation}[^"]*"\\s+on public\\.${tableName}[\\s\\S]*?app_private\\.${helperName}\\(`,
      "i",
    ),
    `${tableName} ${operation} policy missing ${helperName}`,
  );
}
