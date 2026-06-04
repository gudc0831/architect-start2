import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AuthUser } from "@/domains/auth/types";
import { getActiveProjectContextRuleSet } from "@/domains/project-context/policy";
import { requireProjectAccess } from "@/lib/auth/project-guards";
import { prisma } from "@/lib/prisma";

export type ProjectContextRetrievalStatus =
  | "chunks_found"
  | "active_corpus_missing"
  | "no_relevant_chunks"
  | "search_failed";

export type ProjectContextReviewChunk = {
  chunkId: string;
  sourceId: string;
  versionId: string;
  sourceDocumentTitle: string;
  normalizedText: string;
  sourceQuote: string;
  location: unknown;
  contextType: string;
  chunkQualityScore: number;
  injectionRisk: string;
  score: number;
};

export type ProjectContextRetrievalResult = {
  corpusType: "project_context";
  status: ProjectContextRetrievalStatus;
  chunks: ProjectContextReviewChunk[];
  activeVersionIds: string[];
  candidateChunkIds: string[];
  matchedChunkIds: string[];
  includedChunkIds: string[];
  traceId: string | null;
  fallbackMode: "none" | "legal_only_after_project_context_error";
  noRelevantChunkReason: string | null;
  searchErrorCode: string | null;
};

export async function retrieveProjectContextForTaskReview(input: {
  projectId: string;
  taskId: string;
  reviewId: string;
  query: string;
  user: AuthUser;
}): Promise<ProjectContextRetrievalResult> {
  await requireProjectAccess(input.projectId, input.user);
  const queryHash = hashProjectContextQuery(input.query);

  try {
    const activeVersionIds = await listActiveProjectContextVersionIds(input.projectId);
    if (activeVersionIds.length === 0) {
      const traceId = await recordReviewCorpusTrace({
        ...input,
        queryHash,
        status: "active_corpus_missing",
        activeVersionIds,
        candidateChunkIds: [],
        matchedChunkIds: [],
        includedChunkIds: [],
        fallbackMode: "none",
        noRelevantChunkReason: null,
        searchErrorCode: null,
      });
      return emptyResult("active_corpus_missing", traceId, activeVersionIds);
    }

    const candidates = await listProjectContextChunkCandidates(input.projectId, activeVersionIds);
    const scored = scoreProjectContextChunks(input.query, candidates);
    const policy = getActiveProjectContextRuleSet();
    const matched = scored.filter((chunk) => chunk.score >= policy.retrieval.minBm25);
    const included = limitChunksPerSource(matched, policy.retrieval.maxChunksPerSource).slice(0, policy.retrieval.finalTopK);
    const status: ProjectContextRetrievalStatus = included.length > 0 ? "chunks_found" : "no_relevant_chunks";
    const traceId = await recordReviewCorpusTrace({
      ...input,
      queryHash,
      status,
      activeVersionIds,
      candidateChunkIds: candidates.map((chunk) => chunk.chunkId),
      matchedChunkIds: matched.map((chunk) => chunk.chunkId),
      includedChunkIds: included.map((chunk) => chunk.chunkId),
      fallbackMode: "none",
      noRelevantChunkReason: status === "no_relevant_chunks" ? "lexical_threshold_not_met" : null,
      searchErrorCode: null,
    });

    return {
      corpusType: "project_context",
      status,
      chunks: included,
      activeVersionIds,
      candidateChunkIds: candidates.map((chunk) => chunk.chunkId),
      matchedChunkIds: matched.map((chunk) => chunk.chunkId),
      includedChunkIds: included.map((chunk) => chunk.chunkId),
      traceId,
      fallbackMode: "none",
      noRelevantChunkReason: status === "no_relevant_chunks" ? "lexical_threshold_not_met" : null,
      searchErrorCode: null,
    };
  } catch (error) {
    const searchErrorCode = error instanceof Error && error.message ? "project_context_search_error" : "project_context_unknown_error";
    const traceId = await recordReviewCorpusTrace({
      ...input,
      queryHash,
      status: "search_failed",
      activeVersionIds: [],
      candidateChunkIds: [],
      matchedChunkIds: [],
      includedChunkIds: [],
      fallbackMode: "legal_only_after_project_context_error",
      noRelevantChunkReason: null,
      searchErrorCode,
    }).catch(() => null);
    return {
      corpusType: "project_context",
      status: "search_failed",
      chunks: [],
      activeVersionIds: [],
      candidateChunkIds: [],
      matchedChunkIds: [],
      includedChunkIds: [],
      traceId,
      fallbackMode: "legal_only_after_project_context_error",
      noRelevantChunkReason: null,
      searchErrorCode,
    };
  }
}

export function hashProjectContextQuery(query: string) {
  return createHash("sha256").update(query.trim().toLowerCase()).digest("hex");
}

async function listActiveProjectContextVersionIds(projectId: string) {
  const rows = await prisma.$queryRaw<Array<{ version_id: string }>>(Prisma.sql`
    select version.version_id
    from project_upload_source source
    join project_upload_version version
      on version.project_id = source.project_id
      and version.source_id = source.source_id
      and version.version_id = source.latest_active_version_id
      and version.status = 'active'
    where source.project_id = ${projectId}::uuid
    order by source.updated_at desc, source.source_id asc
  `);
  return rows.map((row) => row.version_id);
}

async function listProjectContextChunkCandidates(projectId: string, activeVersionIds: string[]) {
  if (activeVersionIds.length === 0) {
    return [];
  }

  const versionSql = Prisma.join(activeVersionIds.map((versionId) => Prisma.sql`${versionId}::uuid`));
  const rows = await prisma.$queryRaw<ProjectContextChunkRow[]>(Prisma.sql`
    select
      chunk.chunk_id,
      chunk.source_id,
      chunk.version_id,
      chunk.source_document_title,
      chunk.normalized_text,
      chunk.source_quote,
      chunk.context_type,
      chunk.chunk_quality_score,
      chunk.injection_risk,
      jsonb_build_object(
        'locationType', location.location_type,
        'lineStart', location.line_start,
        'lineEnd', location.line_end,
        'pageNumber', location.page_number,
        'paragraphIndex', location.paragraph_index,
        'sheetName', location.sheet_name,
        'rowStart', location.row_start,
        'rowEnd', location.row_end,
        'cellRange', location.cell_range,
        'messageIndexStart', location.message_index_start,
        'messageIndexEnd', location.message_index_end,
        'sender', location.sender,
        'timestampStart', location.timestamp_start,
        'timestampEnd', location.timestamp_end,
        'headingPath', location.heading_path
      ) as location
    from project_upload_chunk chunk
    join chunk_location location on location.chunk_id = chunk.chunk_id
    where chunk.project_id = ${projectId}::uuid
      and chunk.version_id in (${versionSql})
      and chunk.authority = 'project_context'
      and chunk.allowed_use = 'task_review_context_only'
      and length(btrim(chunk.source_quote)) > 0
      and length(btrim(chunk.normalized_text)) > 0
      and chunk.injection_risk <> 'blocked'
    order by chunk.chunk_quality_score desc, chunk.created_at desc
    limit 200
  `);

  return rows.map((row) => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    versionId: row.version_id,
    sourceDocumentTitle: row.source_document_title,
    normalizedText: row.normalized_text,
    sourceQuote: row.source_quote,
    location: row.location,
    contextType: row.context_type,
    chunkQualityScore: Number(row.chunk_quality_score),
    injectionRisk: row.injection_risk,
    score: 0,
  }));
}

function scoreProjectContextChunks(query: string, chunks: ProjectContextReviewChunk[]) {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 2);

  return chunks
    .map((chunk) => {
      const haystack = `${chunk.normalizedText} ${chunk.sourceQuote}`.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      const score = terms.length === 0 ? 0 : hits / terms.length;
      return { ...chunk, score };
    })
    .sort((left, right) => right.score - left.score || right.chunkQualityScore - left.chunkQualityScore);
}

function limitChunksPerSource(chunks: ProjectContextReviewChunk[], maxChunksPerSource: number) {
  const counts = new Map<string, number>();
  return chunks.filter((chunk) => {
    const count = counts.get(chunk.sourceId) ?? 0;
    if (count >= maxChunksPerSource) {
      return false;
    }
    counts.set(chunk.sourceId, count + 1);
    return true;
  });
}

async function recordReviewCorpusTrace(input: {
  projectId: string;
  taskId: string;
  reviewId: string;
  queryHash: string;
  status: ProjectContextRetrievalStatus;
  activeVersionIds: string[];
  candidateChunkIds: string[];
  matchedChunkIds: string[];
  includedChunkIds: string[];
  fallbackMode: "none" | "legal_only_after_project_context_error";
  noRelevantChunkReason: string | null;
  searchErrorCode: string | null;
}) {
  const [row] = await prisma.$queryRaw<Array<{ trace_id: string }>>(Prisma.sql`
    insert into review_corpus_trace (
      review_id,
      project_id,
      task_id,
      query_hash,
      corpus_type,
      active_version_ids,
      candidate_chunk_ids,
      matched_chunk_ids,
      included_chunk_ids,
      corpus_status,
      fallback_mode,
      no_relevant_chunk_reason,
      search_error_code
    )
    values (
      ${input.reviewId}::uuid,
      ${input.projectId}::uuid,
      ${input.taskId}::uuid,
      ${input.queryHash},
      'project_context',
      ${JSON.stringify(input.activeVersionIds)}::jsonb,
      ${JSON.stringify(input.candidateChunkIds)}::jsonb,
      ${JSON.stringify(input.matchedChunkIds)}::jsonb,
      ${JSON.stringify(input.includedChunkIds)}::jsonb,
      ${input.status},
      ${input.fallbackMode},
      ${input.noRelevantChunkReason},
      ${input.searchErrorCode}
    )
    returning trace_id
  `);

  return row?.trace_id ?? null;
}

function emptyResult(status: "active_corpus_missing", traceId: string | null, activeVersionIds: string[]): ProjectContextRetrievalResult {
  return {
    corpusType: "project_context",
    status,
    chunks: [],
    activeVersionIds,
    candidateChunkIds: [],
    matchedChunkIds: [],
    includedChunkIds: [],
    traceId,
    fallbackMode: "none",
    noRelevantChunkReason: null,
    searchErrorCode: null,
  };
}

type ProjectContextChunkRow = {
  chunk_id: string;
  source_id: string;
  version_id: string;
  source_document_title: string;
  normalized_text: string;
  source_quote: string;
  context_type: string;
  chunk_quality_score: number | string;
  injection_risk: string;
  location: unknown;
};
