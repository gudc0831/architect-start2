import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function exportedTypeBody(source: string, name: string) {
  const prefix = `export type ${name} = {`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `${name} type body missing`);
  const bodyStart = start + prefix.length;
  const end = source.indexOf("\n};", bodyStart);
  assert.notEqual(end, -1, `${name} type body end missing`);
  return source.slice(bodyStart, end);
}

function methodBody(source: string, name: string) {
  const start = source.indexOf(`async ${name}(`);
  assert.notEqual(start, -1, `${name} method missing`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `${name} method signature end missing`);
  const braceStart = source.indexOf("{", signatureEnd);
  assert.notEqual(braceStart, -1, `${name} method body missing`);
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, index);
      }
    }
  }
  assert.fail(`${name} method body not closed`);
}

function assertBefore(source: string, first: RegExp, second: RegExp, message: string) {
  const firstIndex = source.search(first);
  const secondIndex = source.search(second);
  assert.notEqual(firstIndex, -1, `${message}: first pattern missing`);
  assert.notEqual(secondIndex, -1, `${message}: second pattern missing`);
  assert.ok(firstIndex < secondIndex, message);
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260615090000_structured_approved_wiki/migration.sql");
const assistantTypes = read("src/domains/assistant/types.ts");
const contracts = read("src/repositories/assistant/contracts.ts");
const postgresStore = read("src/repositories/assistant/postgres-store.ts");
const localStore = read("src/repositories/assistant/local-store.ts");
const knowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const discoveryService = read("src/use-cases/admin/knowledge-discovery-service.ts");
const importService = read("src/use-cases/admin/knowledge-import-preview-service.ts");
const assistantPostgresListCandidates = methodBody(postgresStore, "listKnowledgeCandidateRecords");
const assistantLocalListCandidates = methodBody(localStore, "listKnowledgeCandidateRecords");

const approvedKnowledgeItem = exportedTypeBody(assistantTypes, "ApprovedKnowledgeItem");
for (const field of [
  "id",
  "title",
  "summary",
  "bodyMarkdown",
  "tags",
  "scope",
  "sourceRecordId",
  "sourceTaskId",
  "sourceProjectId",
  "sourceReferences",
  "approvedBy",
  "approvedAt",
]) {
  assert.ok(approvedKnowledgeItem.includes(`${field}:`), `ApprovedKnowledgeItem legacy field ${field} missing`);
}

for (const optionalField of ["structuredKnowledgeItemId", "structuredKnowledgeVersionId", "generationRunId"]) {
  assert.ok(
    approvedKnowledgeItem.includes(`${optionalField}?: string`),
    `ApprovedKnowledgeItem optional lineage field ${optionalField} missing`,
  );
}

assert.match(schema, /publicId\s+String\s+@unique\s+@map\("public_id"\)/, "structured publicId must preserve legacy IDs");
assert.match(schema, /sourceRecordId\s+String\?\s+@unique\s+@map\("source_record_id"\)\s+@db\.Uuid/, "sourceRecordId idempotency guard missing");
assert.match(schema, /sourceRefId\s+String\s+@map\("source_ref_id"\)/, "structured source refs must preserve logical IDs");
assert.match(schema, /versionId\s+String\s+@map\("version_id"\)\s+@db\.Uuid/, "KnowledgeSourceReference.versionId missing");
assert.match(migration, /create unique index "knowledge_items_public_id_key"[\s\S]*\("public_id"\)/);
assert.match(migration, /create unique index "knowledge_item_versions_source_record_id_key"[\s\S]*\("source_record_id"\)/);
assert.match(migration, /create unique index "knowledge_source_references_version_id_source_ref_id_key"[\s\S]*\("version_id", "source_ref_id"\)/);
assert.match(migration, /constraint "knowledge_source_references_item_version_id_fkey"/);
assert.match(
  migration,
  /foreign key \("item_id", "version_id"\) references "knowledge_item_versions" \("item_id", "id"\)/,
);

assert.match(
  contracts,
  /searchApprovedKnowledge\(input:\s*SearchApprovedKnowledgeInput\): Promise<ApprovedKnowledgeItem\[]>/,
  "searchApprovedKnowledge must still return ApprovedKnowledgeItem[]",
);
assert.match(
  knowledgeService,
  /export async function listApprovedKnowledgeItems\(input: \{ projectId: string \}\): Promise<ApprovedKnowledgeItem\[]>/,
  "approved WIKI readback must still expose ApprovedKnowledgeItem[]",
);
assert.match(knowledgeService, /record\.metadata\.approvedKnowledgeItem/, "legacy approvedKnowledgeItem readback missing");
assert.match(
  knowledgeService,
  /const records = useLegacyFallback[\s\S]*includeOrganizationApproved: true/,
  "approved WIKI readback must query organization fallback only when explicitly enabled",
);
assert.match(
  knowledgeService,
  /item\.sourceProjectId === projectId \|\| item\.scope === "organization"/,
  "approved WIKI readback must be scoped to project plus organization",
);
assert.match(knowledgeService, /dedupeApprovedKnowledgeItems\(items\)/, "approved WIKI readback must dedupe result items");
assert.match(knowledgeService, /seenPublicIds\.has\(item\.id\)/, "approved WIKI readback must dedupe by public id");
assert.match(knowledgeService, /seenSourceRecordIds\.has\(item\.sourceRecordId\)/, "approved WIKI readback must dedupe by source record id");

assert.match(postgresStore, /metadata->'approvedKnowledgeItem' as item/, "postgres search must still read legacy snapshot item");
assert.match(postgresStore, /candidate_state = 'approved'/, "postgres search must require approved candidate state");
assert.match(postgresStore, /metadata \? 'approvedKnowledgeItem'/, "postgres search must require approvedKnowledgeItem metadata");
assert.match(postgresStore, /project_id = \$\{input\.projectId\}::uuid/, "postgres search must include same project items");
assert.match(
  postgresStore,
  /metadata #>> '\{approvedKnowledgeItem,scope\}' = 'organization'/,
  "postgres search must include organization scope",
);
assert.match(postgresStore, /candidateState:\s*"approved"/, "postgres fallback must require approved candidate state");
assert.match(
  assistantPostgresListCandidates,
  /includeOrganizationApproved/,
  "postgres fallback must gate organization scope by explicit flag",
);
assert.match(
  assistantPostgresListCandidates,
  /path:\s*\["approvedKnowledgeItem",\s*"scope"\][\s\S]*equals:\s*"organization"/,
  "postgres fallback must include organization scope",
);
assertBefore(
  assistantPostgresListCandidates,
  /OR:\s*\[\s*\{ projectId: input\.projectId \}/,
  /take:\s*100/,
  "postgres fallback candidate listing must scope before limiting",
);

assert.match(localStore, /record\.candidateState === "approved"/, "local search must require approved candidate state");
assert.match(localStore, /record\.projectId === input\.projectId/, "local search must include same project items");
assert.match(
  assistantLocalListCandidates,
  /includeOrganizationApproved/,
  "local search must gate organization scope by explicit flag",
);
assert.match(
  assistantLocalListCandidates,
  /record\.metadata\.approvedKnowledgeItem\?\.scope === "organization"/,
  "local search must include organization scope",
);
assertBefore(
  assistantLocalListCandidates,
  /record\.projectId === input\.projectId/,
  /\.sort\(/,
  "local fallback candidate listing must scope before sorting",
);

assert.doesNotMatch(discoveryService, /approvedKnowledgeItem|central_knowledge|candidateState:\s*"approved"/);
assert.match(discoveryService, /candidateState:\s*"pending_review"/, "discovery candidates must remain pending_review");
assert.doesNotMatch(importService, /approvedKnowledgeItem|central_knowledge|candidateState:\s*"approved"/);
assert.match(importService, /candidateState:\s*"pending_review"/, "import candidates must remain pending_review");

console.log("structured-knowledge-parity-validate: ok");
