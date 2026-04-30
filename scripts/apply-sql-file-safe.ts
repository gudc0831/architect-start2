import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { basename, extname, relative, resolve } from "node:path";
import { Pool } from "pg";
import { assertCloudMutationAllowed, createCloudBackup, finalizeCloudMutation, getCloudGuardSummary } from "./lib/cloud-guard";

loadEnvConfig(process.cwd());

function resolveSqlPath(input: string | undefined) {
  if (!input) {
    throw new Error("Usage: npm run db:apply-sql:safe -- docs/sql/<file>.sql");
  }

  const sqlRoot = resolve(process.cwd(), "docs", "sql");
  const sqlPath = resolve(process.cwd(), input);
  const relativePath = relative(sqlRoot, sqlPath);

  if (relativePath.startsWith("..") || resolve(sqlRoot, relativePath) !== sqlPath) {
    throw new Error("db:apply-sql:safe only applies SQL files under docs/sql");
  }

  if (extname(sqlPath).toLowerCase() !== ".sql") {
    throw new Error("db:apply-sql:safe requires a .sql file");
  }

  return sqlPath;
}

async function applySqlFile(sqlPath: string) {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:apply-sql:safe");
  }

  const sql = await readFile(sqlPath, "utf8");
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

async function main() {
  const sqlPath = resolveSqlPath(process.argv[2]);
  const operation = `db:apply-sql:safe:${basename(sqlPath)}`;
  const summary = await getCloudGuardSummary({ includeMigrationStatus: true });

  if (!summary.configured || !summary.databaseFingerprint) {
    throw new Error("db:apply-sql:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL");
  }

  let lock: Awaited<ReturnType<typeof assertCloudMutationAllowed>> | null = null;
  if (summary.isNonEmpty) {
    lock = await assertCloudMutationAllowed({
      operation,
      reasonCode: "CLOUD_NON_EMPTY_DB",
      message: "Cloud database is non-empty. Guarded SQL apply requires explicit confirmation.",
      databaseFingerprint: summary.databaseFingerprint,
    });
  }

  const backup = await createCloudBackup(operation);
  await applySqlFile(sqlPath);
  await finalizeCloudMutation(lock, backup?.backupId ?? null);

  console.log(
    JSON.stringify(
      {
        ok: true,
        applied: relative(process.cwd(), sqlPath),
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
