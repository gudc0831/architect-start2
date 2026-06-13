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
  ["src/app/api/admin/knowledge/candidates/[recordId]/approve/route.ts", "knowledge.candidates.review", false],
  ["src/app/api/admin/knowledge/candidates/[recordId]/reject/route.ts", "knowledge.candidates.review", false],
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
assert.match(postgresStore, /candidateState:\s*\{\s*in:\s*\["candidate", "pending_review"\]/s);
assert.match(postgresStore, /targetType:\s*\{\s*notIn:\s*\[\.\.\.nonDeletableWorkflowAuditTargetTypes\]/);
assert.match(localStore, /protectedTargetTypes\.has\(event\.targetType\)/);
assert.doesNotMatch(importService, /console\.log|console\.error/);

console.log("knowledge-wiki-security-validate: ok");
