import { loadEnvConfig } from "@next/env";
import { assertCloudMutationAllowed, createCloudBackup, finalizeCloudMutation, getCloudGuardSummary } from "./lib/cloud-guard";
import { npxCommand, runCheckedCommand } from "./lib/run-command";

loadEnvConfig(process.cwd());

async function main() {
  const args = process.argv.slice(2);
  const summary = await getCloudGuardSummary();

  if (!summary.configured || !summary.databaseFingerprint) {
    throw new Error("db:seed:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL");
  }

  let lock: Awaited<ReturnType<typeof assertCloudMutationAllowed>> | null = null;
  if (summary.isNonEmpty) {
    lock = await assertCloudMutationAllowed({
      operation: "db:seed:safe",
      reasonCode: "CLOUD_NON_EMPTY_DB",
      message: "Cloud database already contains data. Guarded seed requires explicit confirmation.",
      databaseFingerprint: summary.databaseFingerprint,
    });
  }

  const backup = await createCloudBackup("db:seed:safe");
  runCheckedCommand(npxCommand, ["tsx", "prisma/seed.ts", ...args]);
  await finalizeCloudMutation(lock, backup?.backupId ?? null);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
