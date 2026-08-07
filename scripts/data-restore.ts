import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function getSnapshotId() {
  const prefix = "--snapshot=";
  const match = process.argv.find((value) => value.startsWith(prefix));
  if (!match) {
    throw new Error("data:restore requires --snapshot=<local-or-cloud-snapshot-id>");
  }

  return match.slice(prefix.length).trim();
}

function getArgumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() ?? "";
}

async function main() {
  const snapshotId = getSnapshotId();
  if (snapshotId.startsWith("cloud-")) {
    const { applyCloudDatabaseRestore, inspectCloudBackupForRestore } = await import("./lib/cloud-guard");
    const report = await inspectCloudBackupForRestore(snapshotId);
    if (process.argv.includes("--apply")) {
      if (!process.argv.includes("--database-only")) {
        throw new Error(
          "Full cloud restore apply is blocked because PostgreSQL and Storage bytes cannot be restored atomically. Use --database-only only when that boundary is explicitly acceptable.",
        );
      }
      const result = await applyCloudDatabaseRestore({
        backupId: snapshotId,
        confirmation: getArgumentValue("confirm"),
        acknowledgeStorageBoundary: process.argv.includes("--ack-storage-boundary"),
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "cloud-database-only-apply",
            ...result,
            message:
              "The PostgreSQL dump was restored in a single transaction. Storage bytes were not restored.",
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: "cloud-dry-run",
          ...report,
          message:
            "Cloud backup fingerprint, exported PostgreSQL snapshot/dump, table coverage, and storage object bytes were verified. No database or storage mutation was performed.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const { restoreLocalSnapshot } = await import("../src/lib/data-guard/local");
  const result = await restoreLocalSnapshot(snapshotId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        restoreScope: "local-snapshot-only",
        cloudRestoreSupported: "database-only-with-explicit-confirmation",
        message:
          "Restored a local data-guard snapshot. Cloud database-only restore requires a verified pg_dump artifact plus explicit apply/confirm/Storage-boundary acknowledgement.",
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
