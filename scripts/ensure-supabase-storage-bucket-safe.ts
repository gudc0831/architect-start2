import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { assertCloudMutationAllowed, createCloudBackup, finalizeCloudMutation, getCloudGuardSummary } from "./lib/cloud-guard";

loadEnvConfig(process.cwd());

function getRequiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required for storage:ensure-bucket:safe`);
  }

  return value;
}

async function main() {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "task-files";
  const operation = `storage:ensure-bucket:safe:${bucket}`;
  const summary = await getCloudGuardSummary();

  if (!summary.configured || !summary.databaseFingerprint) {
    throw new Error("storage:ensure-bucket:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL");
  }

  let lock: Awaited<ReturnType<typeof assertCloudMutationAllowed>> | null = null;
  if (summary.isNonEmpty) {
    lock = await assertCloudMutationAllowed({
      operation,
      reasonCode: "CLOUD_STORAGE_BUCKET_CHECK",
      message: "Cloud storage bucket setup targets a non-empty cloud environment. Guarded bucket setup requires explicit confirmation.",
      databaseFingerprint: summary.databaseFingerprint,
    });
  }

  const backup = await createCloudBackup(operation);
  const supabase = createClient(getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const existing = await supabase.storage.getBucket(bucket);
  let created = false;

  if (existing.error) {
    const status = "status" in existing.error ? existing.error.status : "statusCode" in existing.error ? existing.error.statusCode : null;
    if (status !== 404 && !existing.error.message.toLowerCase().includes("not found")) {
      throw new Error(existing.error.message);
    }

    const createResult = await supabase.storage.createBucket(bucket, {
      public: false,
    });

    if (createResult.error) {
      throw new Error(createResult.error.message);
    }

    created = true;
  }

  await finalizeCloudMutation(lock, backup?.backupId ?? null);

  console.log(
    JSON.stringify(
      {
        ok: true,
        bucket,
        created,
        cloudBackupId: backup?.backupId ?? null,
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
