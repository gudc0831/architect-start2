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
      }
    | undefined;
  const latestCoverage = latestCloudBackup?.backupCoverage;

  console.log(
    JSON.stringify(
      {
        ok: true,
        local,
        cloud: {
          ...cloudSummary,
          backupCoverage: {
            expectedTables: cloudBackupExpectedTables,
            latestBackupId: latestCloudBackup?.id ?? null,
            latestSucceededTables: latestCoverage?.succeededTables ?? null,
            latestFailedTables: latestCoverage?.failedTables ?? (latestCloudBackup?.tableErrors ? Object.keys(latestCloudBackup.tableErrors) : null),
            note: "Cloud backup is best-effort per table. Failed tables are recorded in backup.json tableErrors while successful tables remain captured.",
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
