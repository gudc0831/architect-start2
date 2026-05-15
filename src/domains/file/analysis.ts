export type FileAnalysisSourceType = "document_text" | "manual_text" | "ocr_text" | "image_region";

export type FileAnalysisVerificationState = "unverified" | "user_confirmed" | "rejected";

export type FileAnalysisProviderStatus = "client_supplied" | "provider_extracted";

export type FileAnalysisRegion = {
  pageNumber?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "percent" | "px";
};

export type FileAnalysisArtifact = {
  kind: "image_crop";
  storageBucket: string;
  objectPath: string;
  mimeType: string;
  sizeBytes: number;
  sourceUrl?: string;
  sourceTitle?: string;
  capturedAt?: string;
};

export type FileAnalysisEntry = {
  id: string;
  sourceType: FileAnalysisSourceType;
  extractedText: string;
  summary: string;
  tags: string[];
  confidenceWeight: number;
  verificationState: FileAnalysisVerificationState;
  provider?: string;
  providerStatus?: FileAnalysisProviderStatus;
  region?: FileAnalysisRegion;
  artifact?: FileAnalysisArtifact;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FileMetadata = {
  analysis?: FileAnalysisEntry[];
};

const sourceTypes = new Set<FileAnalysisSourceType>(["document_text", "manual_text", "ocr_text", "image_region"]);
const verificationStates = new Set<FileAnalysisVerificationState>(["unverified", "user_confirmed", "rejected"]);
const providerStatuses = new Set<FileAnalysisProviderStatus>(["client_supplied", "provider_extracted"]);

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

export function normalizeFileAnalysisRegion(value: unknown): FileAnalysisRegion | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const x = normalizeRegionNumber(value.x);
  const y = normalizeRegionNumber(value.y);
  const width = normalizeRegionNumber(value.width);
  const height = normalizeRegionNumber(value.height);
  if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
    return undefined;
  }

  const unit = value.unit === "px" ? "px" : "percent";
  const pageNumber = normalizePageNumber(value.pageNumber);
  return {
    ...(pageNumber ? { pageNumber } : {}),
    x,
    y,
    width,
    height,
    unit,
  };
}

export function normalizeFileAnalysisArtifact(value: unknown): FileAnalysisArtifact | undefined {
  if (!isRecord(value) || value.kind !== "image_crop") {
    return undefined;
  }

  const storageBucket = normalizeString(value.storageBucket);
  const objectPath = normalizeString(value.objectPath);
  const mimeType = normalizeString(value.mimeType);
  const sizeBytes = Number(value.sizeBytes);
  if (!storageBucket || !objectPath || !mimeType || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return undefined;
  }

  const sourceUrl = normalizeString(value.sourceUrl);
  const sourceTitle = normalizeString(value.sourceTitle);
  const capturedAt = normalizeString(value.capturedAt);
  return {
    kind: "image_crop",
    storageBucket,
    objectPath,
    mimeType,
    sizeBytes: Math.round(sizeBytes),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(capturedAt ? { capturedAt } : {}),
  };
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
  const provider = normalizeString(value.provider);
  const providerStatus =
    typeof value.providerStatus === "string" && providerStatuses.has(value.providerStatus as FileAnalysisProviderStatus)
      ? (value.providerStatus as FileAnalysisProviderStatus)
      : undefined;
  const region = normalizeFileAnalysisRegion(value.region);
  const artifact = normalizeFileAnalysisArtifact(value.artifact);
  return {
    id,
    sourceType,
    extractedText: normalizeString(value.extractedText),
    summary: normalizeString(value.summary),
    tags: normalizeFileAnalysisTags(value.tags),
    confidenceWeight: normalizeFileAnalysisConfidence(value.confidenceWeight, sourceType, verificationState),
    verificationState,
    ...(provider ? { provider } : {}),
    ...(providerStatus ? { providerStatus } : {}),
    ...(region ? { region } : {}),
    ...(artifact ? { artifact } : {}),
    createdBy: typeof value.createdBy === "string" && value.createdBy ? value.createdBy : null,
    createdAt,
    updatedAt,
  };
}

function normalizeRegionNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) / 100 : null;
}

function normalizePageNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
