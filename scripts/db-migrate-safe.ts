import { loadEnvConfig } from "@next/env";
import { assertCloudMutationAllowed, createCloudBackup, finalizeCloudMutation, getCloudGuardSummary } from "./lib/cloud-guard";
import { npxCommand, runCheckedCommand } from "./lib/run-command";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const summary = await getCloudGuardSummary({ includeMigrationStatus: true });

  if (!summary.configured || !summary.databaseFingerprint) {
    throw new Error("db:migrate:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL");
  }

  let lock: Awaited<ReturnType<typeof assertCloudMutationAllowed>> | null = null;
  if (summary.isNonEmpty) {
    const message = summary.migrationStatus && !summary.migrationStatus.ok
      ? "Cloud database is non-empty and Prisma migrate status is not clean."
      : "Cloud database is non-empty. Guarded migrate requires explicit confirmation.";
    lock = await assertCloudMutationAllowed({
      operation: "db:migrate:safe",
      reasonCode: summary.migrationStatus && !summary.migrationStatus.ok ? "CLOUD_MIGRATION_STATUS_BLOCKED" : "CLOUD_NON_EMPTY_DB",
      message,
      databaseFingerprint: summary.databaseFingerprint,
    });
  }

  const backup = await createCloudBackup("db:migrate:safe");
  runCheckedCommand(npxCommand, ["prisma", "migrate", "dev", "--schema", "prisma/schema.prisma", ...args]);
  await finalizeCloudMutation(lock, backup?.backupId ?? null);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
