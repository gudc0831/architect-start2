import { getFileAnalysisEntries, type FileAnalysisEntry } from "@/domains/file/analysis";
import type { FileRecord } from "@/domains/task/types";

export type FileAnalysisSearchMode = "lexical" | "postgres_fts" | "text_hybrid" | "vector_hybrid";

export type FileAnalysisSearchResult = {
  file: FileRecord;
  analysis: FileAnalysisEntry;
  score: number;
  matchedTerms: string[];
  mode: FileAnalysisSearchMode;
};

export type RankFileAnalysisInput = {
  files: FileRecord[];
  query: string;
  excludedFileIds?: Iterable<string>;
  limit?: number;
  mode?: FileAnalysisSearchMode;
};

export type FileAnalysisChunk = {
  fileId: string;
  projectId: string;
  taskId: string;
  analysisId: string;
  chunkIndex: number;
  text: string;
  tokenHash: string;
  metadata: {
    sourceType: FileAnalysisEntry["sourceType"];
    verificationState: FileAnalysisEntry["verificationState"];
    tags: string[];
    fileName: string;
  };
};

export function rankFileAnalyses(input: RankFileAnalysisInput): FileAnalysisSearchResult[] {
  const excludedFileIds = new Set(input.excludedFileIds ?? []);
  const limit = Math.max(0, input.limit ?? 4);
  if (limit === 0) {
    return [];
  }

  return input.files
    .filter((file) => !excludedFileIds.has(file.id))
    .flatMap((file) =>
      getUsableFileAnalysis(file).map((analysis) => {
        const score = scoreFileAnalysisMatch(file, analysis, input.query);
        return {
          file,
          analysis,
          score: score.score,
          matchedTerms: score.matchedTerms,
          mode: input.mode ?? "lexical",
        } satisfies FileAnalysisSearchResult;
      }),
    )
    .filter((result) => result.score > 0)
    .sort(compareFileAnalysisSearchResults)
    .slice(0, limit);
}

export function scoreFileAnalysisMatch(file: FileRecord, analysis: FileAnalysisEntry, query: string) {
  const terms = tokenizeSearchText(query);
  if (terms.length === 0) {
    return { score: 0, matchedTerms: [] };
  }

  const matches = new Set<string>();
  let score = 0;
  score += scoreTerms(file.originalName, terms, 4, matches);
  score += scoreTerms(analysis.tags.join(" "), terms, 3, matches);
  score += scoreTerms(analysis.summary, terms, 3, matches);
  score += scoreTerms(analysis.extractedText, terms, 1, matches);

  const combinedText = `${file.originalName} ${analysis.summary} ${analysis.extractedText}`.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();
  if (normalizedQuery.length >= 4 && combinedText.includes(normalizedQuery)) {
    score += 2;
  }
  if (analysis.verificationState === "user_confirmed") {
    score += 1.5;
  }
  if (analysis.sourceType === "document_text") {
    score += 0.4;
  }

  return { score, matchedTerms: [...matches] };
}

export function buildFileAnalysisChunks(file: FileRecord, analysis: FileAnalysisEntry): FileAnalysisChunk[] {
  if (analysis.verificationState === "rejected") {
    return [];
  }

  const text = normalizeChunkText([file.originalName, analysis.tags.join(" "), analysis.summary, analysis.extractedText].join("\n"));
  if (!text) {
    return [];
  }

  const maxLength = 1100;
  const overlap = 160;
  const chunks: FileAnalysisChunk[] = [];
  let start = 0;
  while (start < text.length && chunks.length < 80) {
    const end = Math.min(text.length, start + maxLength);
    const chunkText = text.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        fileId: file.id,
        projectId: file.projectId,
        taskId: file.taskId,
        analysisId: analysis.id,
        chunkIndex: chunks.length,
        text: chunkText,
        tokenHash: hashChunkText(chunkText),
        metadata: {
          sourceType: analysis.sourceType,
          verificationState: analysis.verificationState,
          tags: analysis.tags,
          fileName: file.originalName,
        },
      });
    }
    if (end >= text.length) {
      break;
    }
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

export function tokenizeSearchText(value: string) {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^\p{Letter}\p{Number}\s-]/gu, " ")
        .split(/\s+/u)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ];
}

export function compareFileAnalysisSearchResults(left: FileAnalysisSearchResult, right: FileAnalysisSearchResult) {
  const scoreDelta = right.score - left.score;
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  const verificationDelta = verificationRank(right.analysis.verificationState) - verificationRank(left.analysis.verificationState);
  if (verificationDelta !== 0) {
    return verificationDelta;
  }

  return right.analysis.updatedAt.localeCompare(left.analysis.updatedAt);
}

function getUsableFileAnalysis(file: FileRecord) {
  return getFileAnalysisEntries(file.metadata)
    .filter((entry) => entry.verificationState !== "rejected" && (entry.summary || entry.extractedText))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function scoreTerms(value: string, terms: string[], weight: number, matches: Set<string>) {
  const haystack = value.toLowerCase();
  return terms.reduce((score, term) => {
    if (!haystack.includes(term)) {
      return score;
    }
    matches.add(term);
    return score + weight;
  }, 0);
}

function normalizeChunkText(value: string) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function hashChunkText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function verificationRank(value: FileAnalysisEntry["verificationState"]) {
  if (value === "user_confirmed") {
    return 2;
  }
  if (value === "unverified") {
    return 1;
  }
  return 0;
}
