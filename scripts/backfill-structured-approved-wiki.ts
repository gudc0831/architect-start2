import { Prisma } from "@prisma/client";
import type { ApprovedKnowledgeItem } from "@/domains/assistant/types";
import { prisma } from "@/lib/prisma";
import {
  assertStructuredKnowledgeDraftPublishable,
  buildStructuredKnowledgeDraftFromLegacyCandidate,
  publishStructuredKnowledgeFromCandidate,
} from "@/use-cases/admin/structured-knowledge-service";
import type { StructuredKnowledgeDraft } from "@/domains/knowledge/structured-knowledge";

type BackfillMode = "dry-run" | "apply";

type BackfillSummary = {
  mode: BackfillMode;
  scanned: number;
  eligible: number;
  existing: number;
  invalid: number;
  collisions: number;
  inserted: number;
  skipped: number;
  dryRun: boolean;
};

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const explicitDryRun = args.has("--dry-run");
const explicitPreflight = args.has("--preflight");
const requireDatabase = args.has("--require-database") || apply;
const requireNonzero = args.has("--require-nonzero");
let prismaTouched = false;

if (apply && (explicitDryRun || explicitPreflight)) {
  throw new Error("Use either --dry-run/--preflight or --apply, not both.");
}

const mode: BackfillMode = apply ? "apply" : "dry-run";

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    if (requireDatabase) {
      throw new Error("DATABASE_URL is not configured.");
    }
    printSummary(emptySummary());
    return;
  }
  prismaTouched = true;
  await assertStructuredKnowledgeSchemaReady();

  const records = await prisma.assistantTaskRecord.findMany({
    where: { candidateState: "approved" },
    select: {
      id: true,
      projectId: true,
      taskId: true,
      metadata: true,
    },
    orderBy: { updatedAt: "asc" },
  });

  const summary = emptySummary();
  for (const record of records) {
    const approvedKnowledgeItem = readApprovedKnowledgeItem(record.metadata);
    if (!approvedKnowledgeItem) {
      continue;
    }
    summary.scanned += 1;

    const check = await checkBackfillCandidate(record, approvedKnowledgeItem);
    if (check.kind !== "eligible") {
      if (check.kind === "existing") {
        summary.existing += 1;
      } else if (check.kind === "invalid") {
        summary.invalid += 1;
      } else {
        summary.collisions += 1;
      }
      summary.skipped += 1;
      continue;
    }

    summary.eligible += 1;
    if (!apply) {
      summary.skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await publishStructuredKnowledgeFromCandidate({
        tx,
        recordId: record.id,
        legacyPublicId: approvedKnowledgeItem.id,
        draft: check.draft,
        generationRunId: approvedKnowledgeItem.generationRunId ?? null,
        approvedBy: approvedKnowledgeItem.approvedBy,
      });
    });
    summary.inserted += 1;
  }

  if (requireNonzero && summary.eligible === 0) {
    throw new Error("No eligible legacy approved WIKI items were found for structured backfill.");
  }
  printSummary(summary);
}

async function checkBackfillCandidate(
  record: { id: string; projectId: string; taskId: string },
  item: ApprovedKnowledgeItem,
): Promise<
  | { kind: "eligible"; draft: StructuredKnowledgeDraft }
  | { kind: "existing" | "invalid" | "collision"; reason?: string }
> {
  const existing = await prisma.knowledgeItemVersion.findFirst({
    where: { sourceRecordId: record.id },
    select: { id: true },
  });
  if (existing) {
    return { kind: "existing", reason: "sourceRecordId already exists" };
  }

  if (
    item.sourceRecordId !== record.id ||
    item.sourceProjectId !== record.projectId ||
    item.sourceTaskId !== record.taskId ||
    !item.approvedBy ||
    !item.title.trim() ||
    !item.bodyMarkdown.trim()
  ) {
    return { kind: "invalid", reason: "legacy snapshot fields do not match the source record" };
  }

  const [profile, project, task, publicIdOwner, generationRun] = await Promise.all([
    prisma.profile.findUnique({ where: { id: item.approvedBy }, select: { id: true } }),
    prisma.project.findUnique({ where: { id: item.sourceProjectId }, select: { id: true } }),
    prisma.task.findFirst({ where: { id: item.sourceTaskId, projectId: item.sourceProjectId }, select: { id: true } }),
    prisma.knowledgeItem.findUnique({ where: { publicId: item.id }, select: { id: true } }),
    item.generationRunId
      ? prisma.knowledgeGenerationRun.findUnique({
          where: { id: item.generationRunId },
          select: { id: true, recordId: true },
        })
      : Promise.resolve(null),
  ]);

  if (!profile || !project || !task) {
    return { kind: "invalid", reason: "approvedBy, project, or task foreign key is invalid" };
  }
  if (publicIdOwner) {
    return { kind: "collision", reason: "knowledge publicId already exists without matching sourceRecordId" };
  }
  if (item.generationRunId && generationRun?.recordId !== record.id) {
    return { kind: "collision", reason: "generationRunId is missing or points to another record" };
  }

  try {
    const draft = buildStructuredKnowledgeDraftFromLegacyCandidate({
      title: item.title,
      summary: item.summary,
      bodyMarkdown: item.bodyMarkdown,
      tags: item.tags,
      scope: item.scope,
      sourceReferences: item.sourceReferences,
    });
    assertStructuredKnowledgeDraftPublishable(draft);
    return { kind: "eligible", draft };
  } catch {
    return { kind: "invalid", reason: "legacy snapshot cannot produce a publishable structured draft" };
  }
}

async function assertStructuredKnowledgeSchemaReady() {
  const requiredRelations = [
    "public.knowledge_items",
    "public.knowledge_item_versions",
    "public.knowledge_source_references",
    "public.knowledge_source_references_version_id_source_ref_id_key",
  ];
  const missing: string[] = [];
  for (const relation of requiredRelations) {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: string | null }>>(
      "select to_regclass($1)::text as exists",
      relation,
    );
    if (!rows[0]?.exists) {
      missing.push(relation);
    }
  }
  if (missing.length) {
    throw new Error(`Structured approved WIKI schema is not ready: ${missing.join(", ")}`);
  }
}

function emptySummary(): BackfillSummary {
  return {
    mode,
    scanned: 0,
    eligible: 0,
    existing: 0,
    invalid: 0,
    collisions: 0,
    inserted: 0,
    skipped: 0,
    dryRun: mode === "dry-run",
  };
}

function printSummary(summary: BackfillSummary) {
  console.log(JSON.stringify({
    status: "structured-approved-wiki-backfill",
    ...summary,
  }, null, 2));
}

function readApprovedKnowledgeItem(metadata: Prisma.JsonValue): ApprovedKnowledgeItem | null {
  const record = asRecord(metadata);
  const item = asRecord(record.approvedKnowledgeItem);
  if (
    typeof item.id !== "string" ||
    typeof item.title !== "string" ||
    typeof item.summary !== "string" ||
    typeof item.bodyMarkdown !== "string" ||
    !Array.isArray(item.tags) ||
    typeof item.scope !== "string" ||
    typeof item.sourceRecordId !== "string" ||
    typeof item.sourceTaskId !== "string" ||
    typeof item.sourceProjectId !== "string" ||
    !Array.isArray(item.sourceReferences) ||
    typeof item.approvedBy !== "string" ||
    typeof item.approvedAt !== "string"
  ) {
    return null;
  }
  return item as ApprovedKnowledgeItem;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "structured approved WIKI backfill failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prismaTouched) {
      await prisma.$disconnect();
    }
  });
