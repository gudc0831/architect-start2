import { loadEnvConfig } from "@next/env";
import { createCloudBackup } from "./lib/cloud-guard";

loadEnvConfig(process.cwd());

async function main() {
  const { createLocalSnapshot } = await import("../src/lib/data-guard/local");
  const localSnapshot = await createLocalSnapshot("manual:data-backup", {
    trigger: "npm run data:backup",
  });
  const cloudBackup = await createCloudBackup("manual:data-backup");

  console.log(
    JSON.stringify(
      {
        ok: true,
        localSnapshotId: localSnapshot.id,
        cloudBackupId: cloudBackup?.backupId ?? null,
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
