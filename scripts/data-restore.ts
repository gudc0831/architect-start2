import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function getSnapshotId() {
  const prefix = "--snapshot=";
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match) {
    throw new Error("data:restore restores local snapshots only and requires --snapshot=<local-snapshot-id>");
  }

  return match.slice(prefix.length).trim();
}

async function main() {
  const snapshotId = getSnapshotId();
  if (snapshotId.startsWith("cloud-")) {
    throw new Error("data:restore is local-snapshot only. Cloud backup JSON can be inspected manually, but automated cloud restore is not implemented.");
  }

  const { restoreLocalSnapshot } = await import("../src/lib/data-guard/local");
  const result = await restoreLocalSnapshot(snapshotId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        restoreScope: "local-snapshot-only",
        cloudRestoreSupported: false,
        message: "Restored a local data-guard snapshot. Cloud backup JSON restore is intentionally not implemented.",
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
