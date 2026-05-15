import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import seedPackageJson from "../src/domains/regulation/seeds/foundation.kr.json";
import { buildFileAnalysisChunks } from "../src/domains/file/search";
import type { FileRecord } from "../src/domains/task/types";
import type { RegulationSeedPackage } from "../src/domains/regulation/knowledge";

type BackfillStats = {
  available: boolean;
  reason: string | null;
  totalChunks: number;
  embeddedChunks: number;
  missingEmbeddings: number;
  projectCount: number;
  fileCount: number;
  analysisCount: number;
  totalChars: number;
  maxChunkChars: number;
  groups: BackfillGroup[];
  samples: BackfillSample[];
};

type BackfillGroup = {
  sourceType: string;
  verificationState: string;
  totalChunks: number;
  missingEmbeddings: number;
};

type BackfillSample = {
  id: string;
  fileId: string;
  analysisId: string;
  chunkIndex: number;
  tokenHash: string;
  chars: number;
  preview: string;
};

type BackfillPlan = {
  generatedAt: string;
  provider: {
    configured: boolean;
    provider: string;
    model: string;
    dimensions: number;
    batchSize: number;
    maxChunks: number;
  };
  database: BackfillStats;
  fixture: {
    chunkCount: number;
    totalChars: number;
    maxChunkChars: number;
  };
  execution: {
    dryRun: true;
    targetChunks: number;
    plannedBatches: number;
    estimatedInputChars: number;
    canExecuteFutureBackfill: boolean;
    blockers: string[];
    warnings: string[];
  };
};

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = readProviderConfig(args);
  const fixture = buildFixtureStats();
  const database = await readBackfillStats(args.sampleLimit);
  const execution = buildExecutionPlan(provider, database);
  const plan: BackfillPlan = {
    generatedAt: new Date().toISOString(),
    provider,
    database,
    fixture,
    execution,
  };

  if (args.json) {
    console.log(JSON.stringify(plan, null, 2));
  } else {
    printPlan(plan);
  }

  if (args.strict && execution.blockers.length > 0) {
    process.exitCode = 1;
  }
}

type CliArgs = {
  json: boolean;
  strict: boolean;
  sampleLimit: number;
};

function parseArgs(values: string[]): CliArgs {
  return {
    json: values.includes("--json"),
    strict: values.includes("--strict"),
    sampleLimit: readNumberArg(values, "--sample-limit", 5, 0, 25),
  };
}

function readProviderConfig(args: CliArgs): BackfillPlan["provider"] {
  const providerName = readEnv("ARCHITECT_FILE_EMBEDDING_PROVIDER") || "disabled";
  const model = readEnv("ARCHITECT_FILE_EMBEDDING_MODEL") || "text-embedding-3-small";
  const dimensions = readIntegerEnv("ARCHITECT_FILE_EMBEDDING_DIMENSIONS", 1536, 1, 4096);
  const batchSize = readIntegerEnv("ARCHITECT_FILE_EMBEDDING_BATCH_SIZE", 64, 1, 512);
  const maxChunks = readNumberArg(process.argv.slice(2), "--max-chunks", readIntegerEnv("ARCHITECT_FILE_EMBEDDING_MAX_CHUNKS", 500, 1, 100000), 1, 100000);
  return {
    configured: providerName !== "disabled" && providerName !== "none",
    provider: providerName,
    model,
    dimensions,
    batchSize,
    maxChunks: Math.max(args.sampleLimit, maxChunks),
  };
}

async function readBackfillStats(sampleLimit: number): Promise<BackfillStats> {
  try {
    const rows = await prisma.$queryRaw<Array<{
      totalChunks: number | bigint;
      embeddedChunks: number | bigint;
      missingEmbeddings: number | bigint;
      projectCount: number | bigint;
      fileCount: number | bigint;
      analysisCount: number | bigint;
      totalChars: number | bigint;
      maxChunkChars: number | bigint;
    }>>(Prisma.sql`
      select
        count(*)::bigint as "totalChunks",
        count(*) filter (where embedding is not null)::bigint as "embeddedChunks",
        count(*) filter (where embedding is null)::bigint as "missingEmbeddings",
        count(distinct project_id)::bigint as "projectCount",
        count(distinct file_id)::bigint as "fileCount",
        count(distinct analysis_id)::bigint as "analysisCount",
        coalesce(sum(length(text)), 0)::bigint as "totalChars",
        coalesce(max(length(text)), 0)::bigint as "maxChunkChars"
      from file_analysis_chunks
    `);
    const groups = await prisma.$queryRaw<Array<{
      sourceType: string | null;
      verificationState: string | null;
      totalChunks: number | bigint;
      missingEmbeddings: number | bigint;
    }>>(Prisma.sql`
      select
        coalesce(metadata->>'sourceType', 'unknown') as "sourceType",
        coalesce(metadata->>'verificationState', 'unknown') as "verificationState",
        count(*)::bigint as "totalChunks",
        count(*) filter (where embedding is null)::bigint as "missingEmbeddings"
      from file_analysis_chunks
      group by 1, 2
      order by "missingEmbeddings" desc, "totalChunks" desc
    `);
    const samples = sampleLimit === 0
      ? []
      : await prisma.$queryRaw<Array<{
        id: string;
        fileId: string;
        analysisId: string;
        chunkIndex: number;
        tokenHash: string;
        chars: number | bigint;
        preview: string;
      }>>(Prisma.sql`
        select
          id::text as id,
          file_id::text as "fileId",
          analysis_id as "analysisId",
          chunk_index as "chunkIndex",
          token_hash as "tokenHash",
          length(text)::bigint as chars,
          left(regexp_replace(text, '\\s+', ' ', 'g'), 120) as preview
        from file_analysis_chunks
        where embedding is null
        order by updated_at desc, id
        limit ${sampleLimit}
      `);
    const summary = rows[0];
    return {
      available: true,
      reason: null,
      totalChunks: toNumber(summary?.totalChunks),
      embeddedChunks: toNumber(summary?.embeddedChunks),
      missingEmbeddings: toNumber(summary?.missingEmbeddings),
      projectCount: toNumber(summary?.projectCount),
      fileCount: toNumber(summary?.fileCount),
      analysisCount: toNumber(summary?.analysisCount),
      totalChars: toNumber(summary?.totalChars),
      maxChunkChars: toNumber(summary?.maxChunkChars),
      groups: groups.map((group) => ({
        sourceType: group.sourceType ?? "unknown",
        verificationState: group.verificationState ?? "unknown",
        totalChunks: toNumber(group.totalChunks),
        missingEmbeddings: toNumber(group.missingEmbeddings),
      })),
      samples: samples.map((sample) => ({
        id: sample.id,
        fileId: sample.fileId,
        analysisId: sample.analysisId,
        chunkIndex: sample.chunkIndex,
        tokenHash: sample.tokenHash,
        chars: toNumber(sample.chars),
        preview: sample.preview,
      })),
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "file_analysis_chunks stats are unavailable.",
      totalChunks: 0,
      embeddedChunks: 0,
      missingEmbeddings: 0,
      projectCount: 0,
      fileCount: 0,
      analysisCount: 0,
      totalChars: 0,
      maxChunkChars: 0,
      groups: [],
      samples: [],
    };
  }
}

function buildExecutionPlan(provider: BackfillPlan["provider"], database: BackfillStats): BackfillPlan["execution"] {
  const targetChunks = Math.min(provider.maxChunks, database.missingEmbeddings);
  const blockers = [
    ...(!database.available ? [`database unavailable: ${database.reason}`] : []),
    ...(provider.dimensions !== 1536 ? [`embedding dimensions must match file_analysis_chunks.embedding vector(1536), got ${provider.dimensions}`] : []),
    ...(!provider.configured ? ["embedding provider is not configured"] : []),
  ];
  const warnings = [
    "dry-run only: this script does not call an embedding provider and does not mutate file_analysis_chunks",
    ...(database.available && database.missingEmbeddings === 0 ? ["no chunks currently need embeddings"] : []),
    ...(targetChunks < database.missingEmbeddings ? [`plan is capped at ${targetChunks} of ${database.missingEmbeddings} missing chunk(s)`] : []),
  ];

  return {
    dryRun: true,
    targetChunks,
    plannedBatches: targetChunks === 0 ? 0 : Math.ceil(targetChunks / provider.batchSize),
    estimatedInputChars: estimateInputChars(database, targetChunks),
    canExecuteFutureBackfill: blockers.length === 0 && targetChunks > 0,
    blockers,
    warnings,
  };
}

function buildFixtureStats() {
  const seedPackage = seedPackageJson as RegulationSeedPackage;
  const chunks = seedPackage.documents.flatMap((document) => {
    const file = {
      id: `file-${document.id}`,
      taskId: "retrieval-eval-task",
      projectId: "retrieval-eval-project",
      fileGroupId: `group-${document.id}`,
      originalName: `${document.title}.md`,
      mimeType: "text/markdown",
      sizeBytes: document.bodyMarkdown.length,
      storageBucket: "retrieval-eval",
      objectPath: `${document.id}.md`,
      version: 1,
      versionNumber: 1,
      versionLabel: "v1",
      createdAt: document.collectedAt,
      updatedAt: document.collectedAt,
      uploadedBy: null,
      deletedAt: null,
      purgedAt: null,
      metadata: {},
    } satisfies FileRecord;
    return buildFileAnalysisChunks(file, {
      id: document.id,
      sourceType: "document_text",
      extractedText: document.bodyMarkdown,
      summary: document.summary,
      tags: document.tags,
      confidenceWeight: 0.42,
      verificationState: "unverified",
      createdBy: null,
      createdAt: document.collectedAt,
      updatedAt: document.collectedAt,
    });
  });
  return {
    chunkCount: chunks.length,
    totalChars: chunks.reduce((total, chunk) => total + chunk.text.length, 0),
    maxChunkChars: chunks.reduce((max, chunk) => Math.max(max, chunk.text.length), 0),
  };
}

function printPlan(plan: BackfillPlan) {
  console.log(`[file-analysis-embedding-plan] generatedAt=${plan.generatedAt}`);
  console.log(
    `[file-analysis-embedding-plan] provider=${plan.provider.provider} model=${plan.provider.model} dimensions=${plan.provider.dimensions} batchSize=${plan.provider.batchSize} maxChunks=${plan.provider.maxChunks}`,
  );
  console.log(
    `[file-analysis-embedding-plan] database=${plan.database.available ? "available" : "unavailable"} total=${plan.database.totalChunks} embedded=${plan.database.embeddedChunks} missing=${plan.database.missingEmbeddings} projects=${plan.database.projectCount} files=${plan.database.fileCount} analyses=${plan.database.analysisCount}`,
  );
  if (!plan.database.available) {
    console.warn(`[file-analysis-embedding-plan] warning ${plan.database.reason}`);
  }
  for (const group of plan.database.groups) {
    console.log(
      `[file-analysis-embedding-plan] group sourceType=${group.sourceType} verificationState=${group.verificationState} total=${group.totalChunks} missing=${group.missingEmbeddings}`,
    );
  }
  for (const sample of plan.database.samples) {
    console.log(
      `[file-analysis-embedding-plan] sample chunk=${sample.id} file=${sample.fileId} analysis=${sample.analysisId} index=${sample.chunkIndex} chars=${sample.chars} hash=${sample.tokenHash} preview=${sample.preview}`,
    );
  }
  console.log(
    `[file-analysis-embedding-plan] fixture chunks=${plan.fixture.chunkCount} totalChars=${plan.fixture.totalChars} maxChunkChars=${plan.fixture.maxChunkChars}`,
  );
  console.log(
    `[file-analysis-embedding-plan] execution dryRun=${plan.execution.dryRun} targetChunks=${plan.execution.targetChunks} batches=${plan.execution.plannedBatches} estimatedInputChars=${plan.execution.estimatedInputChars} canExecuteFutureBackfill=${plan.execution.canExecuteFutureBackfill}`,
  );
  for (const blocker of plan.execution.blockers) {
    console.warn(`[file-analysis-embedding-plan] blocker ${blocker}`);
  }
  for (const warning of plan.execution.warnings) {
    console.warn(`[file-analysis-embedding-plan] warning ${warning}`);
  }
}

function estimateInputChars(database: BackfillStats, targetChunks: number) {
  if (!database.available || targetChunks === 0 || database.totalChunks === 0) {
    return 0;
  }
  return Math.round((database.totalChars / database.totalChunks) * targetChunks);
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(readEnv(name), 10);
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function readNumberArg(values: string[], name: string, fallback: number, min: number, max: number) {
  const index = values.indexOf(name);
  const raw = index >= 0 ? values[index + 1] : "";
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
