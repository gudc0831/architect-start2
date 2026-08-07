import { loadEnvConfig } from "@next/env";
import { CLOUD_BACKUP_TABLE_SPECS, CLOUD_RESTORE_LIMITATION, getCloudGuardSummary, listCloudBackups, readCloudState } from "./lib/cloud-guard";

loadEnvConfig(process.cwd());

async function main() {
  const { inspectLocalWriteProtection } = await import("../src/lib/data-guard/local");
  const local = await inspectLocalWriteProtection();
  const cloudSummary = await getCloudGuardSummary({ includeMigrationStatus: true });
  const cloudState = await readCloudState();
  const cloudBackups = (await listCloudBackups(5)).filter(Boolean);
  const cloudBackupExpectedTables = CLOUD_BACKUP_TABLE_SPECS.map((spec) => `${spec.schemaName}.${spec.tableName}`);
  const latestCloudBackup = cloudBackups[0] as
    | {
        id?: unknown;
        backupCoverage?: {
          expectedTables?: unknown;
          succeededTables?: unknown;
          failedTables?: unknown;
        } | null;
        tableErrors?: Record<string, unknown> | null;
        tableCounts?: Record<string, unknown> | null;
        storageObjectCopyCount?: unknown;
        storageObjectErrors?: Record<string, unknown> | null;
        backupFormatVersion?: unknown;
        databaseSnapshot?: {
          consistencyMode?: unknown;
          fixedConnection?: unknown;
          snapshotToken?: unknown;
          status?: unknown;
        } | null;
        databaseDumpArtifact?: {
          format?: unknown;
          sizeBytes?: unknown;
          sha256?: unknown;
        } | null;
        storageConsistencyBoundary?: {
          atomicWithDatabase?: unknown;
          objectListPinnedAtDatabaseSnapshot?: unknown;
          bytesPointInTimeGuaranteed?: unknown;
        } | null;
      }
    | undefined;
  const latestCoverage = latestCloudBackup?.backupCoverage;
  const latestFailedTables = Array.isArray(latestCoverage?.failedTables)
    ? latestCoverage.failedTables.map(String)
    : latestCloudBackup?.tableErrors
      ? Object.keys(latestCloudBackup.tableErrors)
      : null;
  const latestExpectedTables = Array.isArray(latestCoverage?.expectedTables)
    ? latestCoverage.expectedTables.map(String)
    : null;
  const latestSucceededTables = Array.isArray(latestCoverage?.succeededTables)
    ? latestCoverage.succeededTables.map(String)
    : null;
  const latestCoverageMatchesCurrentManifest =
    !latestCloudBackup ||
    (
      latestExpectedTables !== null &&
      latestSucceededTables !== null &&
      cloudBackupExpectedTables.every((table) => latestExpectedTables.includes(table)) &&
      cloudBackupExpectedTables.every((table) => latestSucceededTables.includes(table)) &&
      latestExpectedTables.length === cloudBackupExpectedTables.length &&
      latestSucceededTables.length === cloudBackupExpectedTables.length &&
      (!latestFailedTables || latestFailedTables.length === 0)
    );
  const latestStorageObjectCoverageMatches =
    !latestCloudBackup ||
    (
      Number(latestCloudBackup.tableCounts?.["storage.objects"] ?? 0) ===
        Number(latestCloudBackup.storageObjectCopyCount ?? -1) &&
      Object.keys(latestCloudBackup.storageObjectErrors ?? {}).length === 0
    );
  const latestRestoreManifestHealthy =
    !latestCloudBackup ||
    (
      latestCloudBackup.backupFormatVersion === 2 &&
      latestCloudBackup.databaseSnapshot?.consistencyMode === "repeatable-read-read-only" &&
      latestCloudBackup.databaseSnapshot.fixedConnection === true &&
      latestCloudBackup.databaseSnapshot.status === "committed" &&
      typeof latestCloudBackup.databaseSnapshot.snapshotToken === "string" &&
      Boolean(latestCloudBackup.databaseSnapshot.snapshotToken) &&
      latestCloudBackup.databaseDumpArtifact?.format === "postgresql-custom" &&
      Number(latestCloudBackup.databaseDumpArtifact.sizeBytes) > 0 &&
      typeof latestCloudBackup.databaseDumpArtifact.sha256 === "string" &&
      /^[a-f0-9]{64}$/.test(latestCloudBackup.databaseDumpArtifact.sha256) &&
      latestCloudBackup.storageConsistencyBoundary?.atomicWithDatabase === false &&
      latestCloudBackup.storageConsistencyBoundary.objectListPinnedAtDatabaseSnapshot === true &&
      latestCloudBackup.storageConsistencyBoundary.bytesPointInTimeGuaranteed === false
    );
  const localHealthy = !local.locked;
  const cloudHealthy =
    !cloudSummary.configured ||
    (
      cloudSummary.rowCounts !== null &&
      cloudSummary.rowCountError === null &&
      cloudSummary.writeLock === null &&
      (cloudSummary.migrationStatus?.ok ?? true) &&
      latestCoverageMatchesCurrentManifest &&
      latestStorageObjectCoverageMatches &&
      latestRestoreManifestHealthy
    );
  const ok = localHealthy && cloudHealthy;

  console.log(
    JSON.stringify(
      {
        ok,
        local,
        cloud: {
          ...cloudSummary,
          backupCoverage: {
            expectedTables: cloudBackupExpectedTables,
            latestBackupId: latestCloudBackup?.id ?? null,
            latestSucceededTables,
            latestFailedTables,
            latestCoverageMatchesCurrentManifest,
            latestStorageObjectCoverageMatches,
            latestRestoreManifestHealthy,
            note: "Cloud backups are fail-closed. Any failed expected table blocks the requested mutation and makes data:doctor unhealthy.",
          },
          restoreLimitation: CLOUD_RESTORE_LIMITATION,
          state: cloudState,
          latestBackups: cloudBackups,
        },
      },
      null,
      2,
    ),
  );

  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
