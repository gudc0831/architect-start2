import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { loadEnvConfig } from "@next/env";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

loadEnvConfig(process.cwd());

const writeAuditPhrase = "ALLOW_FILE_ANALYSIS_EMBEDDING_WRITE";

type ChunkRow = {
  id: string;
  fileId: string;
  projectId: string;
  taskId: string;
  analysisId: string;
  chunkIndex: number;
  tokenHash: string;
  text: string;
};

type WorkerReport = {
  generatedAt: string;
  dryRun: boolean;
  status: "dry_run" | "blocked" | "completed";
  provider: {
    provider: string;
    model: string;
    dimensions: number;
    configured: boolean;
    keyConfigured: boolean;
    endpoint: string;
  };
  execution: {
    databaseConfigured: boolean;
    batchSize: number;
    maxChunks: number;
    retryCount: number;
    rateLimitMs: number;
    writeAuditRequired: string;
    writeAuditAccepted: boolean;
    selectedChunks: number;
    updatedChunks: number;
  };
  blockers: string[];
  warnings: string[];
  samples: Array<Pick<ChunkRow, "id" | "fileId" | "analysisId" | "chunkIndex" | "tokenHash"> & { chars: number; preview: string }>;
  auditDigest: string | null;
};

void main();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = readProviderConfig();
  const blockers = buildConfigBlockers(provider, args);
  const chunks = blockers.some((blocker) => blocker.startsWith("database unavailable:"))
    ? []
    : await readMissingChunks(args.maxChunks).catch((error: unknown) => {
      blockers.push(`database unavailable: ${error instanceof Error ? error.message : "file_analysis_chunks query failed"}`);
      return [];
    });

  const baseReport: WorkerReport = {
    generatedAt: new Date().toISOString(),
    dryRun: !args.execute,
    status: args.execute ? "blocked" : "dry_run",
    provider,
    execution: {
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      batchSize: args.batchSize,
      maxChunks: args.maxChunks,
      retryCount: args.retryCount,
      rateLimitMs: args.rateLimitMs,
      writeAuditRequired: writeAuditPhrase,
      writeAuditAccepted: args.writeAudit === writeAuditPhrase && process.env.ARCHITECT_FILE_EMBEDDING_WRITE_AUDIT === writeAuditPhrase,
      selectedChunks: chunks.length,
      updatedChunks: 0,
    },
    blockers,
    warnings: [
      ...(!args.execute ? ["dry-run mode: no provider call and no database mutation were attempted"] : []),
      ...(chunks.length === 0 ? ["no missing embedding chunks were selected"] : []),
    ],
    samples: chunks.slice(0, args.sampleLimit).map((chunk) => ({
      id: chunk.id,
      fileId: chunk.fileId,
      analysisId: chunk.analysisId,
      chunkIndex: chunk.chunkIndex,
      tokenHash: chunk.tokenHash,
      chars: chunk.text.length,
      preview: normalizePreview(chunk.text),
    })),
    auditDigest: null,
  };

  if (!args.execute || blockers.length > 0 || chunks.length === 0) {
    finish({
      ...baseReport,
      status: blockers.length > 0 ? "blocked" : "dry_run",
    }, args);
    return;
  }

  let updatedChunks = 0;
  const embeddingMetas: unknown[] = [];
  for (const batch of chunk(chunks, args.batchSize)) {
    const embeddings = await withRetry(() => createEmbeddings(provider, batch.map((item) => item.text)), args.retryCount);
    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index];
      const embedding = embeddings[index];
      if (!Array.isArray(embedding) || embedding.length !== provider.dimensions) {
        throw new Error(`Embedding dimension mismatch for chunk ${row.id}.`);
      }
      const metadata = {
        provider: provider.provider,
        model: provider.model,
        dimensions: provider.dimensions,
        generatedAt: new Date().toISOString(),
        tokenHash: row.tokenHash,
      };
      await writeChunkEmbedding(row, embedding, metadata);
      embeddingMetas.push({ id: row.id, tokenHash: row.tokenHash, dimensions: embedding.length });
      updatedChunks += 1;
    }
    if (args.rateLimitMs > 0) {
      await sleep(args.rateLimitMs);
    }
  }

  const auditDigest = createHash("sha256").update(JSON.stringify(embeddingMetas)).digest("hex");
  await writeAuditEvent({
    provider,
    selectedChunks: chunks.length,
    updatedChunks,
    auditDigest,
    batchSize: args.batchSize,
  });

  finish({
    ...baseReport,
    status: "completed",
    execution: {
      ...baseReport.execution,
      updatedChunks,
    },
    auditDigest,
  }, args);
}

function parseArgs(values: string[]) {
  const execute = values.includes("--execute");
  return {
    execute,
    json: values.includes("--json"),
    batchSize: readNumberArg(values, "--batch-size", readIntegerEnv("ARCHITECT_FILE_EMBEDDING_BATCH_SIZE", 32, 1, 256), 1, 256),
    maxChunks: readNumberArg(values, "--max-chunks", readIntegerEnv("ARCHITECT_FILE_EMBEDDING_MAX_CHUNKS", 100, 1, 100000), 1, 100000),
    retryCount: readNumberArg(values, "--retry", readIntegerEnv("ARCHITECT_FILE_EMBEDDING_RETRY_COUNT", 2, 0, 10), 0, 10),
    rateLimitMs: readNumberArg(values, "--rate-limit-ms", readIntegerEnv("ARCHITECT_FILE_EMBEDDING_RATE_LIMIT_MS", 250, 0, 60000), 0, 60000),
    sampleLimit: readNumberArg(values, "--sample-limit", 5, 0, 25),
    writeAudit: readTextArg(values, "--write-audit") || "",
  };
}

function readProviderConfig(): WorkerReport["provider"] {
  const provider = readEnv("ARCHITECT_FILE_EMBEDDING_PROVIDER") || "disabled";
  return {
    provider,
    model: readEnv("ARCHITECT_FILE_EMBEDDING_MODEL") || "text-embedding-3-small",
    dimensions: readIntegerEnv("ARCHITECT_FILE_EMBEDDING_DIMENSIONS", 1536, 1, 4096),
    configured: provider !== "disabled" && provider !== "none",
    keyConfigured: Boolean(readEmbeddingApiKey()),
    endpoint: readEnv("ARCHITECT_FILE_EMBEDDING_ENDPOINT") || "https://api.openai.com/v1/embeddings",
  };
}

function buildConfigBlockers(provider: WorkerReport["provider"], args: ReturnType<typeof parseArgs>) {
  return [
    ...(!process.env.DATABASE_URL ? ["DATABASE_URL is not configured"] : []),
    ...(!provider.configured ? ["embedding provider is not configured"] : []),
    ...(provider.provider !== "openai" && provider.configured ? [`unsupported embedding provider: ${provider.provider}`] : []),
    ...(!provider.keyConfigured ? ["embedding provider key is not configured"] : []),
    ...(provider.dimensions !== 1536 ? [`embedding dimensions must match file_analysis_chunks.embedding vector(1536), got ${provider.dimensions}`] : []),
    ...(args.execute && args.writeAudit !== writeAuditPhrase ? [`--write-audit ${writeAuditPhrase} is required for mutation`] : []),
    ...(args.execute && process.env.ARCHITECT_FILE_EMBEDDING_WRITE_AUDIT !== writeAuditPhrase
      ? [`ARCHITECT_FILE_EMBEDDING_WRITE_AUDIT=${writeAuditPhrase} is required for mutation`]
      : []),
  ];
}

async function readMissingChunks(maxChunks: number): Promise<ChunkRow[]> {
  return prisma.$queryRaw<ChunkRow[]>(Prisma.sql`
    select
      id::text as id,
      file_id::text as "fileId",
      project_id::text as "projectId",
      task_id::text as "taskId",
      analysis_id as "analysisId",
      chunk_index as "chunkIndex",
      token_hash as "tokenHash",
      text
    from file_analysis_chunks
    where embedding is null
    order by updated_at asc, id
    limit ${maxChunks}
  `);
}

async function createEmbeddings(provider: WorkerReport["provider"], input: string[]): Promise<number[][]> {
  const response = await fetch(provider.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readEmbeddingApiKey()}`,
    },
    body: JSON.stringify({
      model: provider.model,
      input,
      dimensions: provider.dimensions,
    }),
  });
  if (!response.ok) {
    throw new Error(`Embedding provider returned ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
  return (payload.data ?? []).map((item) => item.embedding ?? []);
}

async function writeChunkEmbedding(row: ChunkRow, embedding: number[], metadata: Record<string, unknown>) {
  const literal = `[${embedding.map((value) => Number(value).toFixed(8)).join(",")}]`;
  await prisma.$executeRaw(Prisma.sql`
    update file_analysis_chunks
    set
      embedding = ${literal}::vector,
      metadata = jsonb_set(metadata, '{embedding}', ${JSON.stringify(metadata)}::jsonb, true),
      updated_at = now()
    where id = ${row.id}::uuid
      and token_hash = ${row.tokenHash}
      and embedding is null
  `);
}

async function writeAuditEvent(input: {
  provider: WorkerReport["provider"];
  selectedChunks: number;
  updatedChunks: number;
  auditDigest: string;
  batchSize: number;
}) {
  await prisma.$executeRaw(Prisma.sql`
    insert into assistant_audit_events (event_type, target_type, metadata)
    values (
      'file_analysis_embedding_worker',
      'file_analysis_chunks',
      ${JSON.stringify({
        fileAnalysisEmbeddingWorkerVersion: 1,
        provider: input.provider.provider,
        model: input.provider.model,
        dimensions: input.provider.dimensions,
        selectedChunks: input.selectedChunks,
        updatedChunks: input.updatedChunks,
        batchSize: input.batchSize,
        auditDigest: input.auditDigest,
        externalProviderCallPerformed: true,
      })}::jsonb
    )
  `);
}

async function withRetry<T>(operation: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }
  throw lastError;
}

function finish(report: WorkerReport, args: { json: boolean; execute: boolean }) {
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  if (args.execute && report.status === "blocked") {
    process.exitCode = 1;
  }
}

function printReport(report: WorkerReport) {
  console.log(`[file-analysis-embedding-worker] status=${report.status} dryRun=${report.dryRun} generatedAt=${report.generatedAt}`);
  console.log(
    `[file-analysis-embedding-worker] provider=${report.provider.provider} model=${report.provider.model} dimensions=${report.provider.dimensions} keyConfigured=${report.provider.keyConfigured}`,
  );
  console.log(
    `[file-analysis-embedding-worker] selected=${report.execution.selectedChunks} updated=${report.execution.updatedChunks} batchSize=${report.execution.batchSize} rateLimitMs=${report.execution.rateLimitMs}`,
  );
  for (const blocker of report.blockers) {
    console.warn(`[file-analysis-embedding-worker] blocker ${blocker}`);
  }
  for (const warning of report.warnings) {
    console.warn(`[file-analysis-embedding-worker] warning ${warning}`);
  }
  for (const sample of report.samples) {
    console.log(
      `[file-analysis-embedding-worker] sample chunk=${sample.id} file=${sample.fileId} analysis=${sample.analysisId} index=${sample.chunkIndex} chars=${sample.chars} hash=${sample.tokenHash} preview=${sample.preview}`,
    );
  }
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function normalizePreview(value: string) {
  return value.replace(/\s+/g, " ").slice(0, 120);
}

function readEmbeddingApiKey() {
  return readEnv("ARCHITECT_FILE_EMBEDDING_API_KEY") || readEnv("OPENAI_API_KEY");
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? "";
}

function readTextArg(values: string[], name: string) {
  const index = values.indexOf(name);
  return index >= 0 ? values[index + 1]?.trim() : "";
}

function readIntegerEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(readEnv(name), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function readNumberArg(values: string[], name: string, fallback: number, min: number, max: number) {
  const index = values.indexOf(name);
  const parsed = Number.parseInt(index >= 0 ? values[index + 1] ?? "" : "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}
