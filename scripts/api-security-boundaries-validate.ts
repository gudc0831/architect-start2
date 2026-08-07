import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFileOwnedArtifactStoragePrefix,
  resolveCanonicalFileStorageBucket,
  resolveCanonicalUploadContentType,
  resolveFileContentResponsePolicy,
  resolveOwnedFileStorageObjects,
  validateFileOwnedArtifactStorage,
  validateTaskOwnedStorageObject,
  validateUploadedStorageObjectPath,
} from "../src/domains/file/content-security";
import type { FileRecord } from "../src/domains/task/types";
import { badRequest } from "../src/lib/api/errors";
import { handleRouteError } from "../src/lib/api/route-error";
import { ASSISTANT_PROVIDER_TIMEOUT_MS } from "../src/lib/assistant/saas-provider-adapter";
import {
  ASSISTANT_BUDGET_RESERVATION_TTL_MS,
  isAssistantBudgetReservationAllowed,
} from "../src/use-cases/assistant-saas-mode-service";

const root = process.cwd();
const uploadRouteSource = readSource("src/app/api/upload/route.ts");
const fileContentRouteSource = readSource("src/app/api/files/[fileId]/content/route.ts");
const materialsRouteSource = readSource("src/app/api/projects/[projectId]/materials/uploads/route.ts");
const accessRequestServiceSource = readSource("src/use-cases/access-request-service.ts");
const assistantServiceSource = readSource("src/use-cases/assistant-saas-mode-service.ts");
const routeErrorSource = readSource("src/lib/api/route-error.ts");
const fileServiceSource = readSource("src/use-cases/file-service.ts");
const postgresStoreSource = readSource("src/repositories/postgres/store.ts");
const firestoreStoreSource = readSource("src/repositories/firestore/store.ts");
const memoryStoreSource = readSource("src/repositories/memory/store.ts");
const assistantLocalStoreSource = readSource("src/repositories/assistant/local-store.ts");

assert.ok(ASSISTANT_PROVIDER_TIMEOUT_MS < ASSISTANT_BUDGET_RESERVATION_TTL_MS);
assert.equal(resolveCanonicalUploadContentType("payload.txt"), "text/plain");
assert.equal(resolveCanonicalUploadContentType("payload.html"), "application/octet-stream");
assert.equal(resolveCanonicalUploadContentType("drawing.DWG"), "application/octet-stream");
assert.deepEqual(resolveFileContentResponsePolicy("text/html; charset=utf-8", "inline"), {
  contentType: "application/octet-stream",
  disposition: "attachment",
});
assert.deepEqual(resolveFileContentResponsePolicy("image/svg+xml", "inline"), {
  contentType: "application/octet-stream",
  disposition: "attachment",
});
assert.deepEqual(resolveFileContentResponsePolicy("image/png", "inline"), {
  contentType: "image/png",
  disposition: "inline",
});
assert.equal(resolveCanonicalFileStorageBucket("supabase-storage", "file-bucket"), "file-bucket");
assert.equal(resolveCanonicalFileStorageBucket("local-dev-storage", "unused"), "local-dev");

const ownedFile: FileRecord = {
  id: "file-1",
  taskId: "task-1",
  projectId: "project-1",
  fileGroupId: "group-1",
  originalName: "drawing.pdf",
  mimeType: "application/pdf",
  sizeBytes: 10,
  storageBucket: "file-bucket",
  objectPath: "projects/project-1/tasks/task-1/object.pdf",
  version: 1,
  versionNumber: 1,
  versionLabel: "v1",
  createdAt: "2026-07-30T00:00:00.000Z",
  updatedAt: "2026-07-30T00:00:00.000Z",
  uploadedBy: null,
  deletedAt: null,
  purgedAt: null,
  metadata: {},
};
assert.equal(validateTaskOwnedStorageObject({
  owner: ownedFile,
  object: ownedFile,
  canonicalStorageBucket: "file-bucket",
}).ok, true);
const wrongBucket = validateTaskOwnedStorageObject({
  owner: ownedFile,
  object: { storageBucket: "attacker-bucket", objectPath: ownedFile.objectPath },
  canonicalStorageBucket: "file-bucket",
});
assert.equal(wrongBucket.ok, false);
if (!wrongBucket.ok) {
  assert.equal(wrongBucket.code, "FILE_STORAGE_BUCKET_INVALID");
}
const siblingTaskObject = validateTaskOwnedStorageObject({
  owner: ownedFile,
  object: {
    storageBucket: "file-bucket",
    objectPath: "projects/project-1/tasks/task-2/object.pdf",
  },
  canonicalStorageBucket: "file-bucket",
});
assert.equal(siblingTaskObject.ok, false);
if (!siblingTaskObject.ok) {
  assert.equal(siblingTaskObject.code, "FILE_OBJECT_PATH_INVALID");
}
const staleUploadPath = validateUploadedStorageObjectPath({
  object: {
    storageBucket: "file-bucket",
    objectPath: "projects/project-1/tasks/task-1/stale-object.pdf",
  },
  expectedObjectPath: "projects/project-1/tasks/task-1/new-object.pdf",
});
assert.equal(staleUploadPath.ok, false);
if (!staleUploadPath.ok) {
  assert.equal(staleUploadPath.code, "FILE_UPLOAD_OBJECT_PATH_MISMATCH");
}

const ownedArtifact = {
  kind: "image_crop" as const,
  storageBucket: "file-bucket",
  objectPath: `${buildFileOwnedArtifactStoragePrefix(ownedFile)}crop.png`,
  mimeType: "image/png",
  sizeBytes: 5,
};
assert.equal(validateFileOwnedArtifactStorage({
  owner: ownedFile,
  artifact: ownedArtifact,
  canonicalStorageBucket: "file-bucket",
}).ok, true);
const siblingFileArtifact = validateFileOwnedArtifactStorage({
  owner: ownedFile,
  artifact: {
    ...ownedArtifact,
    objectPath: "projects/project-1/tasks/task-1/files/file-2/artifacts/crop.png",
  },
  canonicalStorageBucket: "file-bucket",
});
assert.equal(siblingFileArtifact.ok, false);
if (!siblingFileArtifact.ok) {
  assert.equal(siblingFileArtifact.code, "FILE_ANALYSIS_ARTIFACT_PATH_INVALID");
}
const activeArtifact = validateFileOwnedArtifactStorage({
  owner: ownedFile,
  artifact: {
    ...ownedArtifact,
    objectPath: `${buildFileOwnedArtifactStoragePrefix(ownedFile)}crop.svg`,
    mimeType: "image/svg+xml",
  },
  canonicalStorageBucket: "file-bucket",
});
assert.equal(activeArtifact.ok, false);
if (!activeArtifact.ok) {
  assert.equal(activeArtifact.code, "FILE_ANALYSIS_ARTIFACT_TYPE_INVALID");
}
const poisonedPurge = resolveOwnedFileStorageObjects({
  file: {
    ...ownedFile,
    metadata: {
      analysis: [{
        id: "analysis-1",
        sourceType: "image_region",
        extractedText: "",
        summary: "crop",
        tags: [],
        confidenceWeight: 0.5,
        verificationState: "unverified",
        artifact: {
          ...ownedArtifact,
          objectPath: "projects/project-1/tasks/task-1/files/file-2/artifacts/crop.png",
        },
        createdBy: null,
        createdAt: ownedFile.createdAt,
        updatedAt: ownedFile.updatedAt,
      }],
    },
  },
  canonicalStorageBucket: "file-bucket",
});
assert.equal(poisonedPurge.ok, false);
if (!poisonedPurge.ok) {
  assert.equal(poisonedPurge.code, "FILE_ANALYSIS_ARTIFACT_PATH_INVALID");
}

assert.match(uploadRouteSource, /resolveCanonicalUploadContentType\(file\.name\)/);
assert.doesNotMatch(uploadRouteSource, /contentType:\s*file\.type/);
assert.match(fileContentRouteSource, /Content-Security-Policy"[\s\S]*sandbox; default-src 'none'/);
assert.match(fileContentRouteSource, /X-Content-Type-Options": "nosniff"/);
assert.match(sourceBlock(fileServiceSource, "createFileUploadIntent", "commitFileUpload"), /resolveCanonicalUploadContentType/);
const commitUploadSource = sourceBlock(fileServiceSource, "commitFileUpload", "createFileDownloadUrl");
assert.match(commitUploadSource, /resolveCanonicalUploadContentType/);
assert.match(commitUploadSource, /FILE_UPLOAD_OBJECT_ALREADY_ATTACHED/);
assert.doesNotMatch(commitUploadSource, /compensateUploadedObject/);
const downloadUrlSource = sourceBlock(fileServiceSource, "createFileDownloadUrl", "attachUploadedFile");
assert.match(downloadUrlSource, /buildFallbackDownloadUrl/);
assert.doesNotMatch(downloadUrlSource, /createSignedDownloadUrl/);
assert.match(fileServiceSource, /outcome is ambiguous; uploaded object was retained for safe reconciliation/);
assert.match(fileServiceSource, /requireFreshUploadPath\(stored, objectPath\)/);
assert.match(fileServiceSource, /resolveFileAnalysisArtifactInput\(file, input\.artifact\)/);
assert.match(fileServiceSource, /const artifact = requireFileOwnedArtifact\(file, targetAnalysis\.artifact\)/);
assert.match(fileServiceSource, /const artifact = requireFileOwnedArtifact\(file, analysis\.artifact\)/);
for (const repositorySource of [postgresStoreSource, firestoreStoreSource, memoryStoreSource]) {
  assert.match(repositorySource, /resolveOwnedFileStorageObjects/);
}

assert.match(materialsRouteSource, /requireProjectEditor\(projectId, user\)[\s\S]*request\.formData\(\)/);

const managerGuardIndex = accessRequestServiceSource.indexOf(
  "managerContext = await requireProjectManager(projectId, input.actor)",
);
const rejectBranchIndex = accessRequestServiceSource.indexOf('if (input.action === "reject")');
assert.ok(managerGuardIndex >= 0 && managerGuardIndex < rejectBranchIndex);
assert.equal(
  [...accessRequestServiceSource.matchAll(/where: \{ id: request\.id, status: "pending" \}/g)].length,
  2,
);
assert.equal([...accessRequestServiceSource.matchAll(/if \(claimed\.count !== 1\)/g)].length, 2);

assert.equal(
  isAssistantBudgetReservationAllowed({
    spentCents: 70,
    reservedCents: 20,
    projectedCostCents: 10,
    monthlyBudgetCents: 100,
  }),
  true,
);
assert.equal(
  isAssistantBudgetReservationAllowed({
    spentCents: 70,
    reservedCents: 20,
    projectedCostCents: 11,
    monthlyBudgetCents: 100,
  }),
  false,
);
assert.match(assistantServiceSource, /pg_advisory_xact_lock/);
assert.match(assistantServiceSource, /ASSISTANT_BUDGET_RESERVATION_RUNTIME_MODE/);
assert.match(assistantServiceSource, /status: "cancelled"[\s\S]*reservationState: "pending"/);
assert.match(assistantServiceSource, /status: "cancelled"[\s\S]*status: "success"/);
assert.match(assistantServiceSource, /ASSISTANT_REQUEST_IN_PROGRESS/);
assert.match(assistantServiceSource, /ASSISTANT_REQUEST_ALREADY_PROCESSED/);
assert.match(assistantServiceSource, /ASSISTANT_BUDGET_RESERVATION_TTL_MS/);
assert.match(assistantServiceSource, /ASSISTANT_BUDGET_RESERVATION_EXPIRED/);
assert.match(assistantServiceSource, /ASSISTANT_BUDGET_COST_UNCERTAIN_RUNTIME_MODE[\s\S]*status: "failed"/);
assert.match(
  assistantServiceSource,
  /function isAssistantRequestTerminalEvent[\s\S]*status === "success"[\s\S]*ASSISTANT_BUDGET_COST_UNCERTAIN_RUNTIME_MODE/,
);
assert.doesNotMatch(assistantServiceSource, /status:\s*\{\s*in:\s*\["success",\s*"failed"\]\s*\}/);
assert.match(
  assistantServiceSource,
  /error instanceof AssistantProviderError[\s\S]*ASSISTANT_PROVIDER_TRANSPORT_ERROR[\s\S]*recordFailedUsage/,
);
assert.match(assistantServiceSource, /findCompletedAssistantResponse[\s\S]*responseSnapshot/);
const policyCheckIndex = assistantServiceSource.indexOf("await assertAssistantRequestPolicy(policyInput)");
const replayLookupIndex = assistantServiceSource.indexOf(
  "findCompletedAssistantResponse(taskContext.projectId, requestHash)",
);
const budgetReserveIndex = assistantServiceSource.indexOf(
  "budgetReservation = await reserveAssistantPolicyBudget(policyInput)",
);
assert.ok(policyCheckIndex >= 0 && policyCheckIndex < replayLookupIndex && replayLookupIndex < budgetReserveIndex);
assert.match(
  assistantServiceSource,
  /ASSISTANT_REQUEST_ALREADY_PROCESSED[\s\S]*findCompletedAssistantResponse\(taskContext\.projectId,\s*requestHash\)/,
);
assert.match(assistantServiceSource, /responseSnapshot:\s*toJsonSafeValue\(response\)/);
assert.match(assistantServiceSource, /success event persistence failed after usage settlement/);
assert.match(assistantLocalStoreSource, /async updateUsageEvent\(input:\s*UpdateAssistantUsageEventInput\)/);
assert.match(assistantServiceSource, /assistantRepository\.updateUsageEvent\(\{\s*id:\s*reservation\.id/);

void main();

async function main() {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousConsoleError = console.error;
  const previousConsoleWarn = console.warn;
  const capturedErrorLogs: unknown[][] = [];
  const capturedWarningLogs: unknown[][] = [];
  process.env.VERCEL_ENV = "preview";
  console.error = (...values: unknown[]) => {
    capturedErrorLogs.push(values);
  };
  console.warn = (...values: unknown[]) => {
    capturedWarningLogs.push(values);
  };

  try {
    const internalResponse = handleRouteError(
      Object.assign(new Error("database host and internal path must stay server-side"), {
        name: "sensitive custom error name",
        code: "P2023",
        clientVersion: "sensitive-version",
        meta: { internal: "sensitive-meta" },
      }),
    );
    const internalPayload = (await internalResponse.json()) as {
      error: { code: string; message: string; correlationId: string; debug?: unknown };
    };
    assert.equal(internalResponse.status, 500);
    assert.equal(internalPayload.error.code, "INTERNAL_SERVER_ERROR");
    assert.equal(internalPayload.error.message, "Unexpected server error");
    assert.match(internalPayload.error.correlationId, /^[0-9a-f-]{36}$/);
    assert.equal(internalPayload.error.debug, undefined);
    const serializedLogs = JSON.stringify(capturedErrorLogs);
    assert.doesNotMatch(serializedLogs, /database host|internal path|sensitive custom|sensitive-version|sensitive-meta/);
    assert.match(serializedLogs, new RegExp(internalPayload.error.correlationId));

    const databaseResponse = handleRouteError(
      Object.assign(new Error("Can't reach database server at secret-host.example"), {
        code: "P1001",
        meta: { code: "08006", connectionString: "must-not-be-logged" },
      }),
    );
    const databasePayload = (await databaseResponse.json()) as {
      error: { code: string; message: string; correlationId: string; debug?: unknown };
    };
    assert.equal(databaseResponse.status, 503);
    assert.equal(databasePayload.error.code, "DATABASE_UNAVAILABLE");
    assert.match(databasePayload.error.correlationId, /^[0-9a-f-]{36}$/);
    assert.equal(databasePayload.error.debug, undefined);
    const serializedWarningLogs = JSON.stringify(capturedWarningLogs);
    assert.doesNotMatch(serializedWarningLogs, /secret-host|connectionString|must-not-be-logged/);
    assert.match(serializedWarningLogs, /P1001/);
    assert.match(serializedWarningLogs, /08006/);

    const expectedResponse = handleRouteError(badRequest("invalid input", "VALIDATION_FAILED"));
    const expectedPayload = (await expectedResponse.json()) as Record<string, unknown>;
    assert.equal(expectedResponse.status, 400);
    assert.deepEqual(expectedPayload, {
      error: {
        code: "VALIDATION_FAILED",
        message: "invalid input",
      },
    });
  } finally {
    console.error = previousConsoleError;
    console.warn = previousConsoleWarn;
    if (previousVercelEnv === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = previousVercelEnv;
    }
  }

  assert.doesNotMatch(routeErrorSource, /debug:/);
  assert.doesNotMatch(routeErrorSource, /shouldExposePreviewErrorDetails/);
  console.log(JSON.stringify({ status: "passed", securityBoundaries: "api" }));
}

function readSource(relativePath: string) {
  return readFileSync(join(root, ...relativePath.split("/")), "utf8");
}

function sourceBlock(source: string, startName: string, endName: string) {
  const start = source.indexOf(`function ${startName}`);
  const end = source.indexOf(`function ${endName}`, start + 1);
  assert.ok(start >= 0, `Missing source function: ${startName}`);
  assert.ok(end > start, `Missing source function boundary: ${endName}`);
  return source.slice(start, end);
}
