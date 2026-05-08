export type FileAnalysisSourceType = "document_text" | "manual_text" | "ocr_text" | "image_region";

export type FileAnalysisVerificationState = "unverified" | "user_confirmed" | "rejected";

export type FileAnalysisEntry = {
  id: string;
  sourceType: FileAnalysisSourceType;
  extractedText: string;
  summary: string;
  tags: string[];
  confidenceWeight: number;
  verificationState: FileAnalysisVerificationState;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FileMetadata = {
  analysis?: FileAnalysisEntry[];
};

const sourceTypes = new Set<FileAnalysisSourceType>(["document_text", "manual_text", "ocr_text", "image_region"]);
const verificationStates = new Set<FileAnalysisVerificationState>(["unverified", "user_confirmed", "rejected"]);

export function normalizeFileMetadata(value: unknown): FileMetadata {
  if (!isRecord(value)) {
    return {};
  }

  const analysis = Array.isArray(value.analysis)
    ? value.analysis.map(normalizeFileAnalysisEntry).filter((entry): entry is FileAnalysisEntry => Boolean(entry))
    : [];

  return analysis.length > 0 ? { analysis } : {};
}

export function getFileAnalysisEntries(value: FileMetadata | unknown): FileAnalysisEntry[] {
  return normalizeFileMetadata(value).analysis ?? [];
}

export function appendFileAnalysisEntry(metadata: FileMetadata | unknown, entry: FileAnalysisEntry, maxEntries = 20): FileMetadata {
  const existing = getFileAnalysisEntries(metadata).filter((candidate) => candidate.id !== entry.id);
  return {
    ...normalizeFileMetadata(metadata),
    analysis: [entry, ...existing].slice(0, maxEntries),
  };
}

export function normalizeFileAnalysisSourceType(value: unknown): FileAnalysisSourceType {
  return typeof value === "string" && sourceTypes.has(value as FileAnalysisSourceType) ? (value as FileAnalysisSourceType) : "manual_text";
}

export function normalizeFileAnalysisVerificationState(value: unknown): FileAnalysisVerificationState {
  return typeof value === "string" && verificationStates.has(value as FileAnalysisVerificationState)
    ? (value as FileAnalysisVerificationState)
    : "unverified";
}

export function normalizeFileAnalysisTags(value: unknown): string[] {
  const rawTags = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,;\n]/) : [];
  const tags = new Set<string>();

  for (const rawTag of rawTags) {
    const tag = typeof rawTag === "string" ? rawTag.trim() : "";
    if (tag) {
      tags.add(tag.slice(0, 40));
    }
    if (tags.size >= 12) {
      break;
    }
  }

  return [...tags];
}

export function normalizeFileAnalysisConfidence(
  value: unknown,
  sourceType: FileAnalysisSourceType,
  verificationState: FileAnalysisVerificationState,
) {
  const cap = verificationState === "user_confirmed" ? 0.72 : sourceType === "ocr_text" || sourceType === "image_region" ? 0.34 : 0.48;
  const fallback =
    verificationState === "user_confirmed" ? 0.64 : sourceType === "ocr_text" || sourceType === "image_region" ? 0.28 : 0.42;
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(cap, Math.max(0.05, Math.round(numeric * 100) / 100));
}

function normalizeFileAnalysisEntry(value: unknown): FileAnalysisEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizeString(value.id);
  const createdAt = normalizeString(value.createdAt);
  const updatedAt = normalizeString(value.updatedAt) || createdAt;
  if (!id || !createdAt) {
    return null;
  }

  const sourceType = normalizeFileAnalysisSourceType(value.sourceType);
  const verificationState = normalizeFileAnalysisVerificationState(value.verificationState);
  return {
    id,
    sourceType,
    extractedText: normalizeString(value.extractedText),
    summary: normalizeString(value.summary),
    tags: normalizeFileAnalysisTags(value.tags),
    confidenceWeight: normalizeFileAnalysisConfidence(value.confidenceWeight, sourceType, verificationState),
    verificationState,
    createdBy: typeof value.createdBy === "string" && value.createdBy ? value.createdBy : null,
    createdAt,
    updatedAt,
  };
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
