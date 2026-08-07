import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

type BootstrapManifest = {
  version: number;
  baselineSql: string;
  resolvedMigrations: string[];
  firstDeployMigration: string;
};

async function main() {
  const root = process.cwd();
  const manifest = JSON.parse(
    await readFile(resolve(root, "prisma", "bootstrap-manifest.json"), "utf8"),
  ) as BootstrapManifest;
  const migrations = (
    await readdir(resolve(root, "prisma", "migrations"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const firstDeployIndex = migrations.indexOf(manifest.firstDeployMigration);
  assert.equal(manifest.version, 1);
  assert.notEqual(firstDeployIndex, -1, "firstDeployMigration must exist");
  assert.deepEqual(
    manifest.resolvedMigrations,
    migrations.slice(0, firstDeployIndex),
    "baseline resolve list must exactly cover every migration before firstDeployMigration",
  );

  const baselineSql = await readFile(resolve(root, manifest.baselineSql), "utf8");
  assert.match(
    baselineSql,
    /CREATE TYPE "TaskStatus" AS ENUM \('new', 'in_review', 'in_discussion', 'blocked', 'done'\)/,
  );
  for (const requiredFragment of [
    'CREATE TABLE "profiles"',
    'CREATE TABLE "profile_preferences"',
    '"task_list_column_widths" JSONB',
    '"task_list_detail_panel_width" INTEGER',
    '"purged_at" TIMESTAMPTZ',
    '"theme_id" TEXT',
    '"field_key" TEXT',
  ]) {
    assert.ok(baselineSql.includes(requiredFragment), `baseline is missing ${requiredFragment}`);
  }

  const bootstrapSource = await readFile(resolve(root, "scripts", "db-bootstrap-safe.ts"), "utf8");
  assert.match(bootstrapSource, /DATA_GUARD_BOOTSTRAP/);
  assert.match(bootstrapSource, /assertEmptyPublicSchema/);
  assert.match(bootstrapSource, /"migrate",\s*"resolve"/);
  assert.match(bootstrapSource, /"migrate",\s*"deploy"/);

  const schema = await readFile(resolve(root, "prisma", "schema.prisma"), "utf8");
  const guard = await readFile(resolve(root, "scripts", "lib", "cloud-guard.ts"), "utf8");
  const schemaTables = [...schema.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]).sort();
  const specBlock = guard.match(/CLOUD_BACKUP_TABLE_SPECS = \[([\s\S]*?)\] satisfies/)?.[1] ?? "";
  const backupTables = [
    ...specBlock.matchAll(/schemaName:\s*"public",\s*tableName:\s*"([^"]+)"/g),
  ]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(backupTables, schemaTables, "cloud backup public table manifest must match Prisma @@map tables");

  console.log(
    `db-bootstrap-validate-pass migrations=${migrations.length} baselineResolved=${manifest.resolvedMigrations.length} backupTables=${backupTables.length}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
