import { prisma } from "@/lib/prisma";

const requiredRelations = [
  "public.knowledge_items",
  "public.knowledge_item_versions",
  "public.knowledge_source_references",
  "public.knowledge_generation_profiles",
  "public.knowledge_generation_runs",
  "public.knowledge_source_references_version_id_source_ref_id_key",
  "public.knowledge_item_versions_source_project_id_state_approved_at_idx",
  "public.knowledge_item_versions_generation_run_id_idx",
];

const requiredColumns = [
  { tableName: "knowledge_source_references", columnName: "source_ref_id" },
  { tableName: "knowledge_item_versions", columnName: "structured_draft" },
  { tableName: "knowledge_item_versions", columnName: "supersedes_id" },
];

let prismaTouched = false;

async function main() {
  if (process.env.APP_BACKEND_MODE?.trim() !== "cloud" || !process.env.DATABASE_URL?.trim()) {
    console.log("structured-knowledge:schema-preflight skipped: cloud DATABASE_URL is not configured.");
    return;
  }
  prismaTouched = true;

  const missingRelations: string[] = [];
  for (const relation of requiredRelations) {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
      "select to_regclass($1)::text as exists",
      relation,
    );
    if (!rows[0]?.exists) {
      missingRelations.push(relation);
    }
  }

  const missingColumns: string[] = [];
  for (const column of requiredColumns) {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: number }>>(
      [
        "select 1 as exists",
        "from information_schema.columns",
        "where table_schema = 'public'",
        "and table_name = $1",
        "and column_name = $2",
        "limit 1",
      ].join(" "),
      column.tableName,
      column.columnName,
    );
    if (!rows[0]?.exists) {
      missingColumns.push(`${column.tableName}.${column.columnName}`);
    }
  }

  if (missingRelations.length || missingColumns.length) {
    throw new Error(
      [
        "Structured approved WIKI schema preflight failed.",
        missingRelations.length ? `Missing relations: ${missingRelations.join(", ")}` : "",
        missingColumns.length ? `Missing columns: ${missingColumns.join(", ")}` : "",
        "Run the guarded migration command against the exact deployment DATABASE_URL before deployment.",
      ].filter(Boolean).join("\n"),
    );
  }

  console.log("structured-knowledge:schema-preflight passed.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "structured-knowledge:schema-preflight failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaTouched) {
      await prisma.$disconnect();
    }
  });
