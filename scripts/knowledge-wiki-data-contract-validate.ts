import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260612170000_knowledge_wiki_simplification/migration.sql");
const guards = read("src/lib/auth/knowledge-guards.ts");
const workflow = read("src/domains/admin/knowledge-workflow.ts");
const types = read("src/domains/assistant/types.ts");
const knowledgeService = read("src/use-cases/admin/knowledge-service.ts");
const discoveryService = read("src/use-cases/admin/knowledge-discovery-service.ts");
const importService = read("src/use-cases/admin/knowledge-import-preview-service.ts");
const rubricService = read("src/use-cases/admin/knowledge-rubric-service.ts");

for (const model of ["KnowledgeDiscoveryRequest", "KnowledgeImportPreview", "KnowledgeImportRubric"]) {
  assert.match(schema, new RegExp(`model\\s+${model}\\s+\\{`), `${model} model missing`);
}

for (const relation of [
  "knowledgeDiscoveryRequests",
  "knowledgeImportPreviews",
  "defaultKnowledgeImportPreviews",
  "promotedFromKnowledgeDiscoveryRequests",
]) {
  assert.match(schema, new RegExp(relation), `${relation} backref missing`);
}

assert.match(schema, /defaultTaskId\s+String\?/);
assert.match(schema, /defaultTask\s+Task\?\s+@relation\("KnowledgeImportPreviewDefaultTask"/);
assert.match(migration, /knowledge_discovery_requests_state_check/);
assert.match(migration, /knowledge_import_previews_state_check/);
assert.match(migration, /knowledge_import_rubrics_state_check/);
assert.match(migration, /knowledge_import_rubrics_one_active/);
assert.match(migration, /foreign key \("project_id", "task_id"\) references "tasks"/);

for (const capability of [
  "knowledge.candidates.review",
  "knowledge.approved_wiki.export",
  "knowledge.legal_sources.review",
  "knowledge.sync.preflight",
  "knowledge.operations.debug",
  "knowledge.discovery.scan",
  "knowledge.discovery.promote",
  "knowledge.discovery.dismiss",
  "knowledge.import.preview",
  "knowledge.import.confirm",
  "knowledge.rubric.manage",
  "knowledge.rubric.activate",
]) {
  assert.match(guards, new RegExp(capability.replaceAll(".", "\\.")), `${capability} missing`);
}

assert.match(types, /knowledgeCandidateSource\?: KnowledgeCandidateSource/);
assert.match(workflow, /knowledgeCandidateStateTransitions/);
assert.match(workflow, /assertKnowledgeCandidateReviewTransition/);
assert.match(workflow, /nonDeletableWorkflowAuditTargetTypes/);
assert.match(knowledgeService, /assertKnowledgeCandidateReviewTransition\(record\.candidateState,\s*"approved"\)/);
assert.match(knowledgeService, /assertKnowledgeCandidateReviewTransition\(record\.candidateState,\s*"rejected"\)/);
assert.match(knowledgeService, /assistantRepository\.createAuditEvent/);
assert.match(discoveryService, /candidateState:\s*"pending_review"/);
assert.match(discoveryService, /metadata:\s*\{\s*knowledgeCandidateSource:/s);
assert.match(importService, /readBlockedReason/);
assert.match(importService, /candidateState:\s*"pending_review"/);
assert.match(importService, /assertTaskInProject/);
assert.match(rubricService, /prisma\.\$transaction/);
assert.match(rubricService, /rubricRolledBack/);

console.log("knowledge-wiki-data-contract-validate: ok");
