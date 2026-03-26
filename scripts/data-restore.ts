import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function getSnapshotId() {
  const prefix = "--snapshot=";
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match) {
    throw new Error("data:restore requires --snapshot=<id>");
  }

  return match.slice(prefix.length).trim();
}

async function main() {
  const snapshotId = getSnapshotId();
  const { restoreLocalSnapshot } = await import("../src/lib/data-guard/local");
  const result = await restoreLocalSnapshot(snapshotId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        snapshotId: result.snapshotId,
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
