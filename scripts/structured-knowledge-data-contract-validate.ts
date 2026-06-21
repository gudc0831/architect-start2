import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function modelBody(source: string, name: string) {
  const prefix = `model ${name} {`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} model missing`);
  const bodyStart = start + prefix.length;
  const end = source.indexOf("\n}", bodyStart);
  assert.notEqual(end, -1, `${name} model body end missing`);
  return source.slice(bodyStart, end);
}

const migrationPath = "prisma/migrations/20260615090000_structured_approved_wiki/migration.sql";
const schema = read("prisma/schema.prisma");
const migration = read(migrationPath);
const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };

for (const [model, table] of [
  ["KnowledgeItem", "knowledge_items"],
  ["KnowledgeItemVersion", "knowledge_item_versions"],
  ["KnowledgeSourceReference", "knowledge_source_references"],
  ["KnowledgeGenerationProfile", "knowledge_generation_profiles"],
  ["KnowledgeGenerationRun", "knowledge_generation_runs"],
] as const) {
  const body = modelBody(schema, model);
  assert.ok(body.includes(`@@map("${table}")`), `${model} table map missing`);
  assert.ok(migration.includes(`create table "${table}"`), `${table} migration table missing`);
}

const item = modelBody(schema, "KnowledgeItem");
assert.match(item, /publicId\s+String\s+@unique\s+@map\("public_id"\)/, "KnowledgeItem.publicId unique map missing");
assert.match(item, /@@unique\(\[projectId,\s*slug\]\)/, "KnowledgeItem project slug uniqueness missing");
assert.match(item, /@@index\(\[state,\s*updatedAt\]\)/, "KnowledgeItem state updatedAt index missing");
assert.match(item, /@@index\(\[projectId,\s*state,\s*updatedAt\]\)/, "KnowledgeItem project state updatedAt index missing");

const version = modelBody(schema, "KnowledgeItemVersion");
assert.match(version, /sourceRecordId\s+String\?\s+@unique\s+@map\("source_record_id"\)\s+@db\.Uuid/, "sourceRecordId unique guard missing");
assert.match(version, /generationRunId\s+String\?\s+@map\("generation_run_id"\)\s+@db\.Uuid/, "generationRunId missing");
assert.match(version, /structuredDraft\s+Json\s+@default\("\{\}"\)\s+@map\("structured_draft"\)/, "structuredDraft JSON missing");
assert.match(version, /toc\s+Json\s+@default\("\[\]"\)/, "toc JSON missing");
assert.match(version, /sectionBlocks\s+Json\s+@default\("\[\]"\)\s+@map\("section_blocks"\)/, "sectionBlocks JSON missing");
assert.match(version, /@@unique\(\[itemId,\s*version\]\)/, "item version uniqueness missing");
assert.match(version, /@@unique\(\[itemId,\s*id\]\)/, "item version composite identity missing");
assert.match(version, /@@index\(\[sourceProjectId,\s*state,\s*approvedAt\]\)/, "source project approval index missing");

const sourceReference = modelBody(schema, "KnowledgeSourceReference");
assert.match(sourceReference, /sourceRefId\s+String\s+@map\("source_ref_id"\)/, "KnowledgeSourceReference.sourceRefId missing");
assert.match(sourceReference, /versionId\s+String\s+@map\("version_id"\)\s+@db\.Uuid/, "KnowledgeSourceReference.versionId missing");
assert.match(
  sourceReference,
  /version\s+KnowledgeItemVersion\s+@relation\(fields:\s*\[itemId,\s*versionId\],\s*references:\s*\[itemId,\s*id\],\s*onDelete:\s*Cascade\)/,
  "KnowledgeSourceReference composite version relation missing",
);
assert.match(sourceReference, /@@index\(\[versionId,\s*sourceKind\]\)/, "source ref version sourceKind index missing");
assert.match(sourceReference, /@@unique\(\[versionId,\s*sourceRefId\]\)/, "source ref version logical id uniqueness missing");

const profile = modelBody(schema, "KnowledgeGenerationProfile");
assert.match(profile, /sourceBucketRules\s+Json\s+@default\("\{\}"\)\s+@map\("source_bucket_rules"\)/, "sourceBucketRules missing");
assert.match(profile, /tocTemplate\s+Json\s+@default\("\[\]"\)\s+@map\("toc_template"\)/, "tocTemplate missing");
assert.match(profile, /@@unique\(\[name,\s*version\]\)/, "generation profile name version uniqueness missing");

const run = modelBody(schema, "KnowledgeGenerationRun");
assert.match(run, /recordId\s+String\s+@map\("record_id"\)\s+@db\.Uuid/, "generation run recordId missing");
assert.match(run, /profileVersion\s+Int\s+@map\("profile_version"\)/, "generation run profileVersion missing");
assert.match(run, /sourceBundleDigest\s+String\s+@map\("source_bundle_digest"\)/, "sourceBundleDigest missing");
assert.match(run, /promptDigest\s+String\s+@map\("prompt_digest"\)/, "promptDigest missing");

for (const constraint of [
  "knowledge_items_state_check",
  "knowledge_items_scope_check",
  "knowledge_items_scope_project_check",
  "knowledge_item_versions_state_check",
  "knowledge_source_references_source_kind_check",
  "knowledge_source_references_allowed_use_check",
  "knowledge_generation_profiles_state_check",
]) {
  assert.ok(migration.includes(constraint), `${constraint} missing`);
}

for (const state of ["draft", "active", "archived"]) {
  assert.ok(migration.includes(`'${state}'`), `knowledge item/profile state ${state} missing`);
}

for (const state of ["approved", "superseded"]) {
  assert.ok(migration.includes(`'${state}'`), `knowledge version state ${state} missing`);
}

for (const scope of ["admin_only", "organization", "project_members", "project"]) {
  assert.ok(migration.includes(`'${scope}'`), `scope ${scope} missing`);
}

for (const sourceKind of [
  "legal_evidence",
  "task_context",
  "project_document",
  "approved_wiki",
  "local_wiki",
  "external_evidence",
]) {
  assert.ok(migration.includes(`'${sourceKind}'`), `source kind ${sourceKind} missing`);
}

for (const allowedUse of ["legal_basis", "context", "comparison", "citation", "do_not_publish"]) {
  assert.ok(migration.includes(`'${allowedUse}'`), `allowed use ${allowedUse} missing`);
}

assert.match(migration, /create unique index "knowledge_generation_profiles_one_active"[\s\S]*where "state" = 'active'/);
assert.match(migration, /create unique index "knowledge_items_organization_slug_unique"[\s\S]*where "scope" = 'organization'/);
assert.match(migration, /create unique index "knowledge_items_public_id_key"[\s\S]*\("public_id"\)/);
assert.match(migration, /create unique index "knowledge_item_versions_item_id_id_key"[\s\S]*\("item_id", "id"\)/);
assert.match(migration, /create unique index "knowledge_item_versions_source_record_id_key"[\s\S]*\("source_record_id"\)/);
assert.match(migration, /"source_ref_id" text not null/, "source_ref_id migration column missing");
assert.match(
  migration,
  /create unique index "knowledge_source_references_version_id_source_ref_id_key"[\s\S]*\("version_id", "source_ref_id"\)/,
  "source_ref_id version uniqueness migration missing",
);
assert.match(migration, /constraint "knowledge_item_versions_source_record_id_fkey"/);
assert.match(migration, /constraint "knowledge_source_references_item_version_id_fkey"/);
assert.match(
  migration,
  /foreign key \("item_id", "version_id"\) references "knowledge_item_versions" \("item_id", "id"\)/,
);
assert.match(migration, /create index "knowledge_item_versions_search_idx"[\s\S]*using gin \(to_tsvector\('simple'/);

assert.equal(
  packageJson.scripts?.["structured-knowledge:data-contract:validate"],
  "tsx scripts/structured-knowledge-data-contract-validate.ts",
  "package script structured-knowledge:data-contract:validate missing",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:parity:validate"],
  "tsx scripts/structured-knowledge-parity-validate.ts",
  "package script structured-knowledge:parity:validate missing",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:schema-preflight"],
  "tsx scripts/structured-knowledge-schema-preflight.ts",
  "package script structured-knowledge:schema-preflight missing",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:behavior:validate"],
  "tsx scripts/structured-knowledge-behavior-validate.ts",
  "package script structured-knowledge:behavior:validate missing",
);
assert.equal(
  packageJson.scripts?.["structured-knowledge:preview-smoke:release"],
  "tsx scripts/structured-knowledge-preview-smoke.ts --no-skip",
  "package script structured-knowledge:preview-smoke:release missing",
);

console.log("structured-knowledge-data-contract-validate: ok");
