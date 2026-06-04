import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  importVerifiedLegalCandidate,
  validateSaasWikiCandidatePackage,
} from "../src/use-cases/admin/verified-legal-candidate-import-service";

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const serviceSource = await readFile("src/use-cases/admin/verified-legal-candidate-import-service.ts", "utf8");
  const routeSource = await readFile("src/app/api/admin/knowledge/verified-legal-candidates/import/route.ts", "utf8");

  assert.match(serviceSource, /candidateState:\s*"pending_review"/);
  assert.match(serviceSource, /assistantRepository\.createRecord/);
  assert.doesNotMatch(serviceSource, /reviewKnowledgeCandidate|\/approve|candidateState:\s*"approved"|central_knowledge/);
  assert.match(routeSource, /requireKnowledgeAdmin\(\)/);
  assert.match(routeSource, /requireCurrentProjectAccess\(user\)/);
  assert.doesNotMatch(routeSource, /reviewKnowledgeCandidate|\/approve|candidateState:\s*"approved"|central_knowledge/);

  const pkg = validPackage();
  assert.equal(validateSaasWikiCandidatePackage(pkg).status, "saas_wiki_candidate");
  expectErrorCode(() => validateSaasWikiCandidatePackage({ ...pkg, packageVersion: 2 }), "VERIFIED_LEGAL_CANDIDATE_VERSION_INVALID");
  expectErrorCode(() => validateSaasWikiCandidatePackage({ ...pkg, status: "other" }), "VERIFIED_LEGAL_CANDIDATE_STATUS_INVALID");
  expectErrorCode(() => validateSaasWikiCandidatePackage({ ...pkg, saasWikiApproved: true }), "VERIFIED_LEGAL_CANDIDATE_APPROVAL_FORBIDDEN");
  expectErrorCode(() => validateSaasWikiCandidatePackage({ ...pkg, sourceDigests: [] }), "VERIFIED_LEGAL_CANDIDATE_DIGESTS_INVALID");
  expectErrorCode(() => validateSaasWikiCandidatePackage({ ...pkg, candidateState: "pending_review" }), "VERIFIED_LEGAL_CANDIDATE_STATE_FORBIDDEN");
  expectErrorCode(
    () => validateSaasWikiCandidatePackage({
      ...pkg,
      approvedKnowledgeItem: { ...pkg.approvedKnowledgeItem, approvedBy: "browser" },
    }),
    "VERIFIED_LEGAL_CANDIDATE_APPROVAL_METADATA_FORBIDDEN",
  );
  expectErrorCode(
    () => validateSaasWikiCandidatePackage({
      ...pkg,
      approvedKnowledgeItem: { ...pkg.approvedKnowledgeItem, bodyMarkdown: "credential marker OC=value" },
    }),
    "VERIFIED_LEGAL_CANDIDATE_CREDENTIAL_TEXT",
  );
  expectErrorCode(
    () => validateSaasWikiCandidatePackage({
      ...pkg,
      approvedKnowledgeItem: { ...pkg.approvedKnowledgeItem, bodyMarkdown: "credential marker OC = value" },
    }),
    "VERIFIED_LEGAL_CANDIDATE_CREDENTIAL_TEXT",
  );
  const created = await importVerifiedLegalCandidate({
    pkg,
    taskId: "task-a",
    projectId: "project-a",
    user: {
      id: "admin-user",
      email: "admin@example.com",
      displayName: "Admin",
      name: "Admin",
      role: "admin",
      accessStatus: "active",
    },
    dependencies: {
      findTaskById: async () => ({ id: "task-a", projectId: "project-a", purgedAt: null }),
      createRecord: async (input) => ({
        id: "record-a",
        cleanupState: "draft",
        metadata: {},
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        ...input,
        candidateState: input.candidateState ?? "candidate",
      }),
    },
  });
  assert.equal(created.candidateState, "pending_review");
  assert.equal(created.taskId, "task-a");
  await assert.rejects(
    () => importVerifiedLegalCandidate({
      pkg,
      taskId: "task-b",
      projectId: "project-a",
      user: {
        id: "admin-user",
        email: "admin@example.com",
        displayName: "Admin",
        name: "Admin",
        role: "admin",
        accessStatus: "active",
      },
      dependencies: {
        findTaskById: async () => ({ id: "task-b", projectId: "project-b", purgedAt: null }),
        createRecord: async () => {
          throw new Error("createRecord must not run for mismatched task project.");
        },
      },
    }),
    (error) => {
      assert.equal((error as { code?: unknown }).code, "VERIFIED_LEGAL_CANDIDATE_TASK_SCOPE_INVALID");
      return true;
    },
  );

  console.log(JSON.stringify({ status: "verified-legal-candidate-import-pass", cases: 12 }));
}

function expectErrorCode(action: () => unknown, code: string) {
  assert.throws(action, (error) => {
    assert.equal((error as { code?: unknown }).code, code);
    return true;
  });
}

function validPackage() {
  return {
    packageVersion: 1,
    status: "saas_wiki_candidate",
    generatedAt: "2026-06-01T00:00:00.000Z",
    source: "verified-legal-evidence-api",
    sourceApprovedPath: "data/approved/legal-topics/site-road-slope.md",
    sourceDigests: ["digest-a"],
    saasWikiApproved: false,
    approvedKnowledgeItem: {
      title: "Site Road Slope Evidence Draft",
      summary: "Reviewed evidence body.",
      bodyMarkdown: "# Site Road Slope Evidence Draft\n\nReviewed evidence body.",
      tags: ["verified-legal"],
      scope: "organization",
      sourceRecordId: "verified-legal:site-road-slope",
      sourceTaskId: "verified-legal-task",
      sourceProjectId: "verified-legal-project",
    },
  };
}
