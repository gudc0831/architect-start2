import { loadEnvConfig } from "@next/env";
import { assertCloudMutationAllowed, createCloudBackup, finalizeCloudMutation, getCloudGuardSummary } from "./lib/cloud-guard";
import { npxCommand, runCheckedCommand } from "./lib/run-command";

loadEnvConfig(process.cwd());

function hasFlag(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const args = process.argv.slice(2);
  const apply = hasFlag("--apply");
  const allowNonEmpty = hasFlag("--allow-non-empty");

  if (!apply) {
    const dryRunArgs = args.includes("--dry-run") ? args : ["--dry-run", ...args.filter((arg) => arg !== "--apply")];
    runCheckedCommand(npxCommand, ["tsx", "scripts/import-legacy-data.ts", ...dryRunArgs]);
    return;
  }

  const applyArgs = args.filter((arg) => arg !== "--dry-run");
  const summary = await getCloudGuardSummary();
  if (!summary.configured || !summary.databaseFingerprint) {
    throw new Error("import:legacy:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL");
  }

  let lock: Awaited<ReturnType<typeof assertCloudMutationAllowed>> | null = null;
  if (summary.isNonEmpty) {
    if (!allowNonEmpty) {
      throw new Error("Cloud database already contains data. Re-run with --allow-non-empty after reviewing npm run data:doctor.");
    }

    lock = await assertCloudMutationAllowed({
      operation: "import:legacy:safe",
      reasonCode: "CLOUD_NON_EMPTY_DB",
      message: "Legacy import would write into a non-empty cloud database. Explicit confirmation is required.",
      databaseFingerprint: summary.databaseFingerprint,
    });
  }

  const backup = await createCloudBackup("import:legacy:safe");
  runCheckedCommand(npxCommand, ["tsx", "scripts/import-legacy-data.ts", ...applyArgs]);
  await finalizeCloudMutation(lock, backup?.backupId ?? null);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
