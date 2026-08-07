import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { runCheckedNpmExec } from "./lib/run-command";

loadEnvConfig(process.cwd());

type BootstrapManifest = {
  version: number;
  baselineSql: string;
  resolvedMigrations: string[];
  firstDeployMigration: string;
};

async function readManifest() {
  const raw = await readFile(resolve(process.cwd(), "prisma", "bootstrap-manifest.json"), "utf8");
  return JSON.parse(raw) as BootstrapManifest;
}

async function assertEmptyPublicSchema(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });
  try {
    const result = await pool.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name",
    );
    if (result.rows.length > 0) {
      throw new Error(
        `db:bootstrap:safe requires an empty public schema. Existing tables: ${result.rows
          .map((row) => row.table_name)
          .join(", ")}`,
      );
    }
  } finally {
    await pool.end();
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (process.env.APP_BACKEND_MODE?.trim() !== "cloud" || !databaseUrl) {
    throw new Error("db:bootstrap:safe requires APP_BACKEND_MODE=cloud and DATABASE_URL.");
  }
  if (process.env.DATA_GUARD_BOOTSTRAP?.trim() !== "EMPTY_DATABASE") {
    throw new Error(
      "db:bootstrap:safe is restricted to a newly provisioned empty database. Retry with DATA_GUARD_BOOTSTRAP=EMPTY_DATABASE after verifying the exact target.",
    );
  }

  await assertEmptyPublicSchema(databaseUrl);
  const manifest = await readManifest();
  runCheckedNpmExec(["prisma", "db", "execute", "--file", manifest.baselineSql]);
  for (const migration of manifest.resolvedMigrations) {
    runCheckedNpmExec([
      "prisma",
      "migrate",
      "resolve",
      "--applied",
      migration,
      "--schema",
      "prisma/schema.prisma",
    ]);
  }
  runCheckedNpmExec(["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  runCheckedNpmExec(["prisma", "migrate", "status", "--schema", "prisma/schema.prisma"]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
