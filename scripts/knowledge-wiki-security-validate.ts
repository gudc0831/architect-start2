import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const routeCapabilities: Array<[string, string, boolean]> = [
  ["src/app/api/admin/knowledge/discovery-requests/route.ts", "knowledge.discovery.scan", true],
  ["src/app/api/admin/knowledge/discovery-requests/scan/route.ts", "knowledge.discovery.scan", true],
  ["src/app/api/admin/knowledge/discovery-requests/[requestId]/promote/route.ts", "knowledge.discovery.promote", true],
  ["src/app/api/admin/knowledge/discovery-requests/[requestId]/dismiss/route.ts", "knowledge.discovery.dismiss", true],
  ["src/app/api/admin/knowledge/import-previews/route.ts", "knowledge.import.preview", true],
  ["src/app/api/admin/knowledge/import-previews/[previewId]/confirm/route.ts", "knowledge.import.confirm", true],
  ["src/app/api/admin/knowledge/import-previews/[previewId]/import/route.ts", "knowledge.import.confirm", true],
  ["src/app/api/admin/knowledge/rubrics/route.ts", "knowledge.rubric.manage", false],
  ["src/app/api/admin/knowledge/rubrics/[rubricId]/activate/route.ts", "knowledge.rubric.activate", false],
  ["src/app/api/admin/knowledge/rubrics/[rubricId]/rollback/route.ts", "knowledge.rubric.activate", false],
  ["src/app/api/admin/knowledge/generation-profiles/route.ts", "knowledge.generation.manage", false],
  ["src/app/api/admin/knowledge/generation-profiles/[profileId]/activate/route.ts", "knowledge.generation.activate", false],
  ["src/app/api/admin/knowledge/generation-profiles/[profileId]/rollback/route.ts", "knowledge.generation.activate", false],
  ["src/app/api/admin/knowledge/candidates/[recordId]/route.ts", "knowledge.candidates.review", true],
  ["src/app/api/admin/knowledge/candidates/[recordId]/approve/route.ts", "knowledge.candidates.review", true],
  ["src/app/api/admin/knowledge/candidates/[recordId]/reject/route.ts", "knowledge.candidates.review", true],
  ["src/app/api/admin/knowledge/candidates/[recordId]/source-buckets/route.ts", "knowledge.candidates.review", true],
  ["src/app/api/admin/knowledge/candidates/[recordId]/structured-draft/route.ts", "knowledge.candidates.review", true],
];

for (const [path, capability, projectScoped] of routeCapabilities) {
  const source = readFileSync(path, "utf8");
  assert.match(source, /assertRequestIntegrity\(request\)/, `${path} missing request integrity`);
  assert.match(source, /requireKnowledgeAdmin\(\)/, `${path} missing admin auth`);
  assert.match(source, new RegExp(`assertKnowledgeCapability\\(user, "${capability.replaceAll(".", "\\.")}"\\)`), `${path} missing exact capability`);
  if (projectScoped) {
    assert.match(source, /requireCurrentProjectAccess\(user\)/, `${path} missing current project access`);
  }
}

const candidateListRoute = readFileSync("src/app/api/admin/knowledge/candidates/route.ts", "utf8");
assert.match(candidateListRoute, /requireKnowledgeAdmin\(\)/, "candidate list route missing admin auth");
assert.match(candidateListRoute, /assertKnowledgeCapability\(user, "knowledge\.candidates\.review"\)/, "candidate list route missing review capability");
assert.match(candidateListRoute, /requireCurrentProjectAccess\(user\)/, "candidate list route missing current project access");
assert.match(candidateListRoute, /listKnowledgeCandidates\(\{ projectId: projectContext\.project\.id \}\)/, "candidate list route must scope to current project");

const approvedItemsRoute = readFileSync("src/app/api/admin/knowledge/items/route.ts", "utf8");
assert.match(approvedItemsRoute, /requireKnowledgeAdmin\(\)/, "approved items route missing admin auth");
assert.match(approvedItemsRoute, /assertKnowledgeCapability\(user, "knowledge\.approved_wiki\.export"\)/, "approved items route missing export capability");
assert.match(approvedItemsRoute, /requireCurrentProjectAccess\(user\)/, "approved items route missing current project access");
assert.match(approvedItemsRoute, /projectId !== projectContext\.project\.id/, "approved items route must block cross-project reads");

const discoveryService = readFileSync("src/use-cases/admin/knowledge-discovery-service.ts", "utf8");
const importService = readFileSync("src/use-cases/admin/knowledge-import-preview-service.ts", "utf8");
const rubricService = readFileSync("src/use-cases/admin/knowledge-rubric-service.ts", "utf8");
const knowledgeService = readFileSync("src/use-cases/admin/knowledge-service.ts", "utf8");
const postgresStore = readFileSync("src/repositories/assistant/postgres-store.ts", "utf8");
const localStore = readFileSync("src/repositories/assistant/local-store.ts", "utf8");

assert.match(discoveryService, /findUnique\(\{\s*where:\s*\{\s*projectId_id/s);
assert.match(discoveryService, /prisma\.\$transaction/);
assert.match(discoveryService, /tx\.assistantTaskRecord\.create/);
assert.match(discoveryService, /tx\.knowledgeDiscoveryRequest\.updateMany/);
assert.match(discoveryService, /tx\.assistantAuditEvent\.create/);
assert.match(importService, /assertTaskInProject/);
assert.match(importService, /prisma\.\$transaction/);
assert.match(importService, /tx\.knowledgeImportPreview\.updateMany/);
assert.match(importService, /tx\.assistantTaskRecord\.create/);
assert.match(importService, /tx\.assistantAuditEvent\.create/);
assert.match(importService, /readBlockedReason/);
assert.match(importService, /redactSensitiveText/);
assert.match(importService, /createWorkspaceFingerprint/);
assert.match(importService, /excludedItems\.push/);
assert.match(rubricService, /prisma\.\$transaction/);
assert.match(knowledgeService, /assertKnowledgeCandidateReviewTransition/);
assert.match(knowledgeService, /record\.projectId !== projectId/);
assert.match(postgresStore, /candidateState:\s*\{\s*in:\s*\["candidate", "pending_review"\]/s);
assert.match(postgresStore, /projectId: input\.projectId/);
assert.match(postgresStore, /targetType:\s*\{\s*notIn:\s*\[\.\.\.nonDeletableWorkflowAuditTargetTypes\]/);
assert.match(localStore, /protectedTargetTypes\.has\(event\.targetType\)/);
assert.doesNotMatch(importService, /console\.log|console\.error/);

console.log("knowledge-wiki-security-validate: ok");
