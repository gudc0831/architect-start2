import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FileAnalysisChunkDebugCoverageGroup = {
  sourceType: string;
  verificationState: string;
  totalChunks: number;
  embeddedChunks: number;
  missingEmbeddings: number;
};

export type FileAnalysisChunkDebugSample = {
  id: string;
  fileId: string;
  analysisId: string;
  chunkIndex: number;
  tokenHash: string;
  sourceType: string;
  verificationState: string;
  chars: number;
  preview: string;
};

export type FileAnalysisChunkDebugRetrievalHit = FileAnalysisChunkDebugSample & {
  fileName: string;
  ftsRank: number;
  vectorReady: boolean;
};

export type FileAnalysisChunkDebugReport = {
  generatedAt: string;
  database: {
    available: boolean;
    reason: string | null;
    totalChunks: number;
    embeddedChunks: number;
    missingEmbeddings: number;
    projectCount: number;
    fileCount: number;
    analysisCount: number;
  };
  filters: {
    query: string | null;
    sourceType: string | null;
    verificationState: string | null;
    sampleLimit: number;
  };
  coverage: FileAnalysisChunkDebugCoverageGroup[];
  missingSamples: FileAnalysisChunkDebugSample[];
  retrieval: FileAnalysisChunkDebugRetrievalHit[];
  blockers: string[];
  warnings: string[];
};

export async function getFileAnalysisChunkDebugReport(input: {
  query?: unknown;
  sourceType?: unknown;
  verificationState?: unknown;
  sampleLimit?: unknown;
} = {}): Promise<FileAnalysisChunkDebugReport> {
  const query = normalizeOptionalText(input.query);
  const sourceType = normalizeOptionalText(input.sourceType);
  const verificationState = normalizeOptionalText(input.verificationState);
  const sampleLimit = normalizePositiveInteger(input.sampleLimit, 10, 0, 50);

  try {
    const [summary] = await prisma.$queryRaw<Array<{
      totalChunks: number | bigint;
      embeddedChunks: number | bigint;
      missingEmbeddings: number | bigint;
      projectCount: number | bigint;
      fileCount: number | bigint;
      analysisCount: number | bigint;
    }>>(Prisma.sql`
      select
        count(*)::bigint as "totalChunks",
        count(*) filter (where embedding is not null)::bigint as "embeddedChunks",
        count(*) filter (where embedding is null)::bigint as "missingEmbeddings",
        count(distinct project_id)::bigint as "projectCount",
        count(distinct file_id)::bigint as "fileCount",
        count(distinct analysis_id)::bigint as "analysisCount"
      from file_analysis_chunks
      where (${sourceType}::text is null or coalesce(metadata->>'sourceType', 'unknown') = ${sourceType})
        and (${verificationState}::text is null or coalesce(metadata->>'verificationState', 'unknown') = ${verificationState})
    `);

    const coverageRows = await prisma.$queryRaw<Array<{
      sourceType: string | null;
      verificationState: string | null;
      totalChunks: number | bigint;
      embeddedChunks: number | bigint;
      missingEmbeddings: number | bigint;
    }>>(Prisma.sql`
      select
        coalesce(metadata->>'sourceType', 'unknown') as "sourceType",
        coalesce(metadata->>'verificationState', 'unknown') as "verificationState",
        count(*)::bigint as "totalChunks",
        count(*) filter (where embedding is not null)::bigint as "embeddedChunks",
        count(*) filter (where embedding is null)::bigint as "missingEmbeddings"
      from file_analysis_chunks
      where (${sourceType}::text is null or coalesce(metadata->>'sourceType', 'unknown') = ${sourceType})
        and (${verificationState}::text is null or coalesce(metadata->>'verificationState', 'unknown') = ${verificationState})
      group by 1, 2
      order by "missingEmbeddings" desc, "totalChunks" desc
    `);

    const sampleRows = sampleLimit === 0
      ? []
      : await prisma.$queryRaw<FileAnalysisChunkDebugSample[]>(Prisma.sql`
        select
          id::text as id,
          file_id::text as "fileId",
          analysis_id as "analysisId",
          chunk_index as "chunkIndex",
          token_hash as "tokenHash",
          coalesce(metadata->>'sourceType', 'unknown') as "sourceType",
          coalesce(metadata->>'verificationState', 'unknown') as "verificationState",
          length(text)::bigint as chars,
          left(regexp_replace(text, '\\s+', ' ', 'g'), 160) as preview
        from file_analysis_chunks
        where embedding is null
          and (${sourceType}::text is null or coalesce(metadata->>'sourceType', 'unknown') = ${sourceType})
          and (${verificationState}::text is null or coalesce(metadata->>'verificationState', 'unknown') = ${verificationState})
        order by updated_at desc, id
        limit ${sampleLimit}
      `);

    const retrievalRows = query
      ? await prisma.$queryRaw<FileAnalysisChunkDebugRetrievalHit[]>(Prisma.sql`
        select
          c.id::text as id,
          c.file_id::text as "fileId",
          c.analysis_id as "analysisId",
          c.chunk_index as "chunkIndex",
          c.token_hash as "tokenHash",
          coalesce(c.metadata->>'sourceType', 'unknown') as "sourceType",
          coalesce(c.metadata->>'verificationState', 'unknown') as "verificationState",
          length(c.text)::bigint as chars,
          left(regexp_replace(c.text, '\\s+', ' ', 'g'), 160) as preview,
          coalesce(c.metadata->>'fileName', f.original_name, 'unknown') as "fileName",
          ts_rank_cd(to_tsvector('simple', c.text), plainto_tsquery('simple', ${query}))::float as "ftsRank",
          (c.embedding is not null) as "vectorReady"
        from file_analysis_chunks c
        left join files f on f.id = c.file_id
        where to_tsvector('simple', c.text) @@ plainto_tsquery('simple', ${query})
          and (${sourceType}::text is null or coalesce(c.metadata->>'sourceType', 'unknown') = ${sourceType})
          and (${verificationState}::text is null or coalesce(c.metadata->>'verificationState', 'unknown') = ${verificationState})
        order by "ftsRank" desc, c.updated_at desc
        limit ${Math.max(10, sampleLimit)}
      `)
      : [];

    const database = {
      available: true,
      reason: null,
      totalChunks: toNumber(summary?.totalChunks),
      embeddedChunks: toNumber(summary?.embeddedChunks),
      missingEmbeddings: toNumber(summary?.missingEmbeddings),
      projectCount: toNumber(summary?.projectCount),
      fileCount: toNumber(summary?.fileCount),
      analysisCount: toNumber(summary?.analysisCount),
    };

    return {
      generatedAt: new Date().toISOString(),
      database,
      filters: { query, sourceType, verificationState, sampleLimit },
      coverage: coverageRows.map((row) => ({
        sourceType: row.sourceType ?? "unknown",
        verificationState: row.verificationState ?? "unknown",
        totalChunks: toNumber(row.totalChunks),
        embeddedChunks: toNumber(row.embeddedChunks),
        missingEmbeddings: toNumber(row.missingEmbeddings),
      })),
      missingSamples: sampleRows.map(normalizeSample),
      retrieval: retrievalRows.map((row) => ({ ...normalizeSample(row), fileName: row.fileName, ftsRank: Number(row.ftsRank) || 0, vectorReady: row.vectorReady })),
      blockers: [],
      warnings: [
        ...(database.totalChunks === 0 ? ["No file_analysis_chunks rows are available for inspection."] : []),
        ...(query ? [] : ["Retrieval debug query is empty; FTS/rerank rows are omitted."]),
      ],
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "file_analysis_chunks debug report is unavailable.";
    return {
      generatedAt: new Date().toISOString(),
      database: {
        available: false,
        reason,
        totalChunks: 0,
        embeddedChunks: 0,
        missingEmbeddings: 0,
        projectCount: 0,
        fileCount: 0,
        analysisCount: 0,
      },
      filters: { query, sourceType, verificationState, sampleLimit },
      coverage: [],
      missingSamples: [],
      retrieval: [],
      blockers: [`database unavailable: ${reason}`],
      warnings: [],
    };
  }
}

function normalizeSample<T extends FileAnalysisChunkDebugSample>(row: T): T {
  return {
    ...row,
    chars: toNumber(row.chars),
  };
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
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
