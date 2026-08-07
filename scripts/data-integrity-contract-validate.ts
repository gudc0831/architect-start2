import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { FileMetadata, FilePurgeObject } from "../src/domains/file/analysis";
import { runDurableFilePurge } from "../src/lib/data-guard/file-purge";

async function main() {
  const [cloudGuard, doctor, restore, fileService, firestoreStore, memoryStore, postgresStore, legacyImport, taskRoute] =
    await Promise.all([
      readFile("scripts/lib/cloud-guard.ts", "utf8"),
      readFile("scripts/data-doctor.ts", "utf8"),
      readFile("scripts/data-restore.ts", "utf8"),
      readFile("src/use-cases/file-service.ts", "utf8"),
      readFile("src/repositories/firestore/store.ts", "utf8"),
      readFile("src/repositories/memory/store.ts", "utf8"),
      readFile("src/repositories/postgres/store.ts", "utf8"),
      readFile("scripts/import-legacy-data.ts", "utf8"),
      readFile("src/app/api/tasks/route.ts", "utf8"),
    ]);

  assert.match(cloudGuard, /cloud\.backup\.failed/);
  assert.match(cloudGuard, /requested mutation was blocked/);
  assert.match(cloudGuard, /copyCloudStorageObjects/);
  assert.match(cloudGuard, /createHash\("sha256"\)/);
  assert.match(restore, /cloud-dry-run/);
  assert.match(restore, /--database-only/);
  assert.match(restore, /--ack-storage-boundary/);
  assert.match(cloudGuard, /pg_export_snapshot/);
  assert.match(cloudGuard, /--single-transaction/);
  assert.doesNotMatch(doctor, /ok:\s*true/);
  assert.match(fileService, /compensateUploadedObject/);
  assert.match(firestoreStore, /runTransaction/);
  assert.match(memoryStore, /serializeRepositoryMutations/);
  assert.match(postgresStore, /CLIENT_MUTATION_SCOPE_CONFLICT/);
  assert.match(firestoreStore, /CLIENT_MUTATION_SCOPE_CONFLICT/);
  assert.match(memoryStore, /CLIENT_MUTATION_SCOPE_CONFLICT/);
  assert.match(legacyImport, /fileVersionIntegrityOk/);
  assert.match(legacyImport, /existingChecksum !== expectedChecksum/);
  assert.match(legacyImport, /const upload = await uploadLegacyFile/);
  assert.doesNotMatch(legacyImport, /if \(!existing\)[\s\S]{0,200}uploadLegacyFile/);
  assert.doesNotMatch(legacyImport, /latestByGroup\.size\s*>=\s*0/);
  assert.match(taskRoute, /readOptionalClientMutationId/);

  await validateDurableFilePurgeRetry();

  console.log("data-integrity-contract-validate-pass");
}

async function validateDurableFilePurgeRetry() {
  const objects: FilePurgeObject[] = [
    { storageBucket: "local-dev", objectPath: "projects/p1/tasks/t1/source.pdf" },
    {
      storageBucket: "local-dev",
      objectPath: "projects/p1/tasks/t1/files/f1/artifacts/page-1.png",
    },
  ];
  let metadata: FileMetadata = {};
  let failArtifactOnce = true;
  const deleteCalls: string[] = [];
  let completedAt: string | null = null;
  const execute = () =>
    runDurableFilePurge({
      file: { metadata },
      objects,
      now: () => "2026-07-30T00:00:00.000Z",
      deleteObject: async (object) => {
        deleteCalls.push(object.objectPath);
        if (object.objectPath.endsWith(".png") && failArtifactOnce) {
          failArtifactOnce = false;
          throw new Error("simulated storage outage");
        }
      },
      persistPendingMetadata: async (nextMetadata) => {
        metadata = structuredClone(nextMetadata);
      },
      completePurge: async (nextMetadata, purgedAt) => {
        metadata = structuredClone(nextMetadata);
        completedAt = purgedAt;
      },
    });

  await assert.rejects(execute, /simulated storage outage/);
  assert.equal(metadata.purge?.state, "retryable");
  assert.deepEqual(metadata.purge?.deletedObjectKeys, [
    "local-dev:projects/p1/tasks/t1/source.pdf",
  ]);

  await execute();
  assert.equal(metadata.purge?.state, "completed");
  assert.equal(completedAt, "2026-07-30T00:00:00.000Z");
  assert.deepEqual(deleteCalls, [
    "projects/p1/tasks/t1/source.pdf",
    "projects/p1/tasks/t1/files/f1/artifacts/page-1.png",
    "projects/p1/tasks/t1/files/f1/artifacts/page-1.png",
  ]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
