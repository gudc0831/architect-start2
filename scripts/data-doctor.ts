import { loadEnvConfig } from "@next/env";
import { getCloudGuardSummary, listCloudBackups, readCloudState } from "./lib/cloud-guard";

loadEnvConfig(process.cwd());

async function main() {
  const { inspectLocalWriteProtection } = await import("../src/lib/data-guard/local");
  const local = await inspectLocalWriteProtection();
  const cloudSummary = await getCloudGuardSummary({ includeMigrationStatus: true });
  const cloudState = await readCloudState();
  const cloudBackups = (await listCloudBackups(5)).filter(Boolean);

  console.log(
    JSON.stringify(
      {
        ok: true,
        local,
        cloud: {
          ...cloudSummary,
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
