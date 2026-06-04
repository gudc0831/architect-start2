import { Prisma } from "@prisma/client";
import { getActiveProjectContextRuleSet, type ProjectContextRuleSet } from "@/domains/project-context/policy";
import { hasProjectContextLocation, type ProjectContextLocation } from "@/domains/project-context/location";
import { extractTextFromStoredFile } from "@/domains/file/text-extraction";
import type { FileRecord } from "@/domains/task/types";
import { notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { downloadProjectContextRawBytes } from "@/use-cases/project-context-raw-storage";

export type ProjectContextExtractionKind = "text" | "markdown" | "kakaotalk" | "csv" | "xlsx" | "docx" | "pdf";

export type ProjectContextProcessingStage =
  | "uploaded"
  | "malware_scan"
  | "extracting"
  | "normalized_draft"
  | "review_pending";

export const projectContextProcessingStages: readonly ProjectContextProcessingStage[] = [
  "uploaded",
  "malware_scan",
  "extracting",
  "normalized_draft",
  "review_pending",
] as const;

export type ProjectContextNormalizedChunkDraft = {
  sourceDocumentTitle: string;
  normalizedText: string;
  sourceQuote: string;
  contextType: string;
  authority: "project_context";
  allowedUse: "task_review_context_only";
  chunkQualityScore: number;
  injectionRisk: "none" | "suspected" | "blocked";
  location: ProjectContextLocation;
};

export type ProjectContextProcessingInput = {
  sourceDocumentTitle: string;
  extractedText: string;
  extractionKind: ProjectContextExtractionKind;
  contextType?: string;
  policy?: ProjectContextRuleSet;
};

export type ProcessProjectContextUploadResult = {
  uploadId: string;
  versionId: string;
  status: "review_pending" | "failed";
  chunkCount: number;
  parserSummary: string | null;
  confidenceWeight: number | null;
  failureCode: string | null;
  failureMessage: string | null;
};

export type ProjectContextProcessingWorkerResult = {
  processed: ProcessProjectContextUploadResult[];
  skipped: number;
};

export type ProjectContextUploadTextExtractionInput = {
  uploadId: string;
  projectId: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  bytes: Uint8Array;
};

export type ProjectContextUploadTextExtractionResult = {
  extractedText: string;
  extractionKind: ProjectContextExtractionKind;
  parserSummary: string;
  confidenceWeight: number;
};

export type ProjectContextChunkValidationResult =
  | { accepted: true }
  | {
      accepted: false;
      reason:
        | "source_quote_missing"
        | "source_quote_not_found"
        | "location_missing"
        | "legal_conclusion_not_in_source"
        | "authority_invalid"
        | "allowed_use_invalid"
        | "prompt_injection_blocked";
    };

export function buildProjectContextProcessingPlan() {
  return [...projectContextProcessingStages];
}

export async function extractProjectContextUploadText(
  input: ProjectContextUploadTextExtractionInput,
): Promise<ProjectContextUploadTextExtractionResult> {
  const file = buildExtractionFileRecord(input);
  const extracted = await extractTextFromStoredFile(file, input.bytes);
  return {
    extractedText: extracted.extractedText,
    extractionKind: inferExtractionKind(input.originalFilename, input.mimeType),
    parserSummary: extracted.summary,
    confidenceWeight: extracted.confidenceWeight,
  };
}

export async function processProjectContextUpload(input: {
  projectId: string;
  uploadId: string;
}): Promise<ProcessProjectContextUploadResult> {
  const upload = await getProjectContextUploadForProcessing(input);
  if (!upload) {
    throw notFound("Project context upload not found.", "PROJECT_CONTEXT_UPLOAD_NOT_FOUND");
  }

  await markProjectContextUploadExtracting(upload);

  try {
    if (!upload.raw_storage_key) {
      throw new Error("Project context upload raw object is missing.");
    }

    const bytes = await downloadProjectContextRawBytes(upload.raw_storage_key);
    const extraction = await extractProjectContextUploadText({
      uploadId: upload.upload_id,
      projectId: upload.project_id,
      originalFilename: upload.original_filename,
      mimeType: upload.mime_type,
      fileSizeBytes: Number(upload.file_size_bytes),
      bytes,
    });
    const chunks = createProjectContextChunkDrafts({
      sourceDocumentTitle: upload.original_filename,
      extractedText: extraction.extractedText,
      extractionKind: extraction.extractionKind,
    });

    if (chunks.length === 0) {
      return markProjectContextUploadProcessingFailed({
        upload,
        failureCode: "NO_REVIEWABLE_CHUNKS",
        failureMessage: "No project context chunks with both sourceQuote and location were produced.",
      });
    }

    await persistProjectContextChunks({
      upload,
      chunks,
    });

    return {
      uploadId: upload.upload_id,
      versionId: upload.version_id,
      status: "review_pending",
      chunkCount: chunks.length,
      parserSummary: extraction.parserSummary,
      confidenceWeight: extraction.confidenceWeight,
      failureCode: null,
      failureMessage: null,
    };
  } catch (error) {
    return markProjectContextUploadProcessingFailed({
      upload,
      failureCode: "PROCESSING_FAILED",
      failureMessage: error instanceof Error ? error.message : "Project context processing failed.",
    });
  }
}

export async function processPendingProjectContextUploads(input: {
  projectId?: string | null;
  limit?: number;
} = {}): Promise<ProjectContextProcessingWorkerResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const rows = await prisma.$queryRaw<Array<{ project_id: string; upload_id: string }>>(Prisma.sql`
    select upload.project_id, upload.upload_id
    from upload_reference upload
    join project_upload_version version on version.version_id = upload.version_id
    where version.status in ('uploaded', 'extracting')
      and upload.raw_storage_key is not null
      and (${input.projectId ?? null}::uuid is null or upload.project_id = ${input.projectId ?? null}::uuid)
    order by upload.created_at asc, upload.upload_id asc
    limit ${limit}
  `);
  const processed: ProcessProjectContextUploadResult[] = [];

  for (const row of rows) {
    processed.push(await processProjectContextUpload({
      projectId: row.project_id,
      uploadId: row.upload_id,
    }));
  }

  return {
    processed,
    skipped: 0,
  };
}

export function createProjectContextChunkDrafts(input: ProjectContextProcessingInput): ProjectContextNormalizedChunkDraft[] {
  const policy = input.policy ?? getActiveProjectContextRuleSet();
  const extractedText = normalizeWhitespace(input.extractedText);
  if (!extractedText) {
    return [];
  }

  const contextType = input.contextType?.trim() || "project_material";
  const segments = segmentExtractedText(input.extractionKind, extractedText, policy);
  return segments
    .slice(0, policy.maxChunksPerVersion)
    .map((segment) => {
      const sourceQuote = segment.text.slice(0, Math.min(segment.text.length, policy.chunking.maxChunkChars));
      const normalizedText = normalizeChunkText(sourceQuote);
      const injectionRisk = classifyPromptInjection(normalizedText, policy);
      return {
        sourceDocumentTitle: input.sourceDocumentTitle,
        normalizedText,
        sourceQuote,
        contextType,
        authority: "project_context",
        allowedUse: "task_review_context_only",
        chunkQualityScore: scoreChunkQuality(normalizedText, sourceQuote, segment.location, injectionRisk),
        injectionRisk,
        location: segment.location,
      } satisfies ProjectContextNormalizedChunkDraft;
    })
    .filter((chunk) => validateProjectContextChunkForReview(chunk, extractedText).accepted);
}

export function validateProjectContextChunkForReview(
  chunk: Partial<ProjectContextNormalizedChunkDraft>,
  extractedText: string,
): ProjectContextChunkValidationResult {
  if (chunk.authority !== "project_context") {
    return { accepted: false, reason: "authority_invalid" };
  }
  if (chunk.allowedUse !== "task_review_context_only") {
    return { accepted: false, reason: "allowed_use_invalid" };
  }
  if (!chunk.sourceQuote?.trim()) {
    return { accepted: false, reason: "source_quote_missing" };
  }
  if (!normalizeWhitespace(extractedText).includes(normalizeWhitespace(chunk.sourceQuote))) {
    return { accepted: false, reason: "source_quote_not_found" };
  }
  if (!hasProjectContextLocation(chunk.location)) {
    return { accepted: false, reason: "location_missing" };
  }
  if (chunk.injectionRisk === "blocked") {
    return { accepted: false, reason: "prompt_injection_blocked" };
  }
  if (containsUnsupportedLegalConclusion(chunk.normalizedText ?? "", extractedText)) {
    return { accepted: false, reason: "legal_conclusion_not_in_source" };
  }

  return { accepted: true };
}

function segmentExtractedText(
  kind: ProjectContextExtractionKind,
  text: string,
  policy: ProjectContextRuleSet,
): Array<{ text: string; location: ProjectContextLocation }> {
  if (kind === "kakaotalk") {
    return segmentMessages(text);
  }
  if (kind === "csv") {
    return segmentRows(text, "CSV");
  }
  if (kind === "xlsx") {
    return segmentRows(text, "Sheet1");
  }
  if (kind === "docx") {
    return segmentParagraphs(text);
  }
  if (kind === "pdf") {
    return segmentPdfText(text);
  }

  return segmentLines(text, policy);
}

function segmentLines(text: string, policy: ProjectContextRuleSet) {
  const lines = text.split(/\r?\n/);
  const chunks: Array<{ text: string; location: ProjectContextLocation }> = [];
  let start = 1;
  let current: string[] = [];
  let currentLength = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (current.length > 0 && currentLength + line.length + 1 > policy.chunking.maxChunkChars) {
      chunks.push({
        text: current.join("\n").trim(),
        location: { locationType: "line_range", lineStart: start, lineEnd: index },
      });
      start = index + 1;
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.join("").trim()) {
    chunks.push({
      text: current.join("\n").trim(),
      location: { locationType: "line_range", lineStart: start, lineEnd: lines.length },
    });
  }

  return chunks;
}

function segmentMessages(text: string) {
  const messages = text.split(/\r?\n/).filter((line) => line.trim());
  return messages.map((message, index) => {
    const parsed = /^\[([^\]]+)\]\s*([^:]+):\s*(.*)$/.exec(message.trim());
    return {
      text: message.trim(),
      location: {
        locationType: "message_range",
        messageIndexStart: index + 1,
        messageIndexEnd: index + 1,
        sender: parsed?.[2]?.trim(),
        timestampStart: parsed?.[1]?.trim(),
        timestampEnd: parsed?.[1]?.trim(),
        lineStart: index + 1,
        lineEnd: index + 1,
      } satisfies ProjectContextLocation,
    };
  });
}

function segmentRows(text: string, sheetName: string) {
  const rows = text.split(/\r?\n/).filter((line) => line.trim());
  return rows.map((row, index) => ({
    text: row.trim(),
    location: {
      locationType: "sheet_range",
      sheetName,
      rowStart: index + 1,
      rowEnd: index + 1,
      cellRange: `A${index + 1}:Z${index + 1}`,
    } satisfies ProjectContextLocation,
  }));
}

function segmentParagraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      text: paragraph,
      location: {
        locationType: "paragraph",
        paragraphIndex: index + 1,
      } satisfies ProjectContextLocation,
    }));
}

function segmentPdfText(text: string) {
  return text
    .split(/\f|--- page \d+ ---/i)
    .map((page) => page.trim())
    .filter(Boolean)
    .map((page, index) => ({
      text: page,
      location: {
        locationType: "page_paragraph",
        pageNumber: index + 1,
        paragraphIndex: 1,
      } satisfies ProjectContextLocation,
    }));
}

function classifyPromptInjection(text: string, policy: ProjectContextRuleSet): "none" | "suspected" | "blocked" {
  const lower = text.toLowerCase();
  if (policy.promptInjection.blockedPatterns.some((pattern) => lower.includes(pattern.toLowerCase()))) {
    return "blocked";
  }
  if (policy.promptInjection.warningPatterns.some((pattern) => lower.includes(pattern.toLowerCase()))) {
    return "suspected";
  }
  return "none";
}

function scoreChunkQuality(
  normalizedText: string,
  sourceQuote: string,
  location: ProjectContextLocation,
  injectionRisk: "none" | "suspected" | "blocked",
) {
  if (injectionRisk === "blocked" || !hasProjectContextLocation(location) || !sourceQuote.trim()) {
    return 0;
  }
  return Math.min(1, Math.max(0.5, normalizedText.length / Math.max(sourceQuote.length, 1)));
}

function containsUnsupportedLegalConclusion(normalizedText: string, extractedText: string) {
  const legalConclusionHints = ["legal basis", "legally required", "법적 근거", "법적으로 필수"];
  const source = extractedText.toLowerCase();
  return legalConclusionHints.some((hint) => normalizedText.toLowerCase().includes(hint.toLowerCase()) && !source.includes(hint.toLowerCase()));
}

function normalizeChunkText(text: string) {
  return normalizeWhitespace(text).slice(0, 4_000);
}

function normalizeWhitespace(text: string) {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").trim();
}

async function getProjectContextUploadForProcessing(input: { projectId: string; uploadId: string }) {
  const [upload] = await prisma.$queryRaw<ProjectContextUploadProcessingRow[]>(Prisma.sql`
    select
      upload.upload_id,
      upload.project_id,
      upload.source_id,
      upload.version_id,
      upload.raw_storage_key,
      upload.original_filename,
      upload.mime_type,
      upload.file_size_bytes
    from upload_reference upload
    join project_upload_version version on version.version_id = upload.version_id
    where upload.project_id = ${input.projectId}::uuid
      and upload.upload_id = ${input.uploadId}::uuid
      and version.status in ('uploaded', 'extracting', 'normalized_draft', 'review_pending', 'failed')
  `);
  return upload ?? null;
}

async function markProjectContextUploadExtracting(upload: ProjectContextUploadProcessingRow) {
  await prisma.$executeRaw(Prisma.sql`
    update project_upload_version
    set status = 'extracting',
        failure_code = null,
        failure_message = null,
        updated_at = now()
    where project_id = ${upload.project_id}::uuid
      and version_id = ${upload.version_id}::uuid
  `);
}

async function persistProjectContextChunks(input: {
  upload: ProjectContextUploadProcessingRow;
  chunks: ProjectContextNormalizedChunkDraft[];
}) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      update project_upload_version
      set status = 'normalized_draft',
          updated_at = now()
      where project_id = ${input.upload.project_id}::uuid
        and version_id = ${input.upload.version_id}::uuid
    `);

    await tx.$executeRaw(Prisma.sql`
      delete from project_upload_chunk
      where project_id = ${input.upload.project_id}::uuid
        and upload_id = ${input.upload.upload_id}::uuid
    `);

    for (const chunk of input.chunks) {
      const [inserted] = await tx.$queryRaw<Array<{ chunk_id: string }>>(Prisma.sql`
        insert into project_upload_chunk (
          version_id,
          source_id,
          project_id,
          upload_id,
          source_document_title,
          normalized_text,
          source_quote,
          context_type,
          authority,
          allowed_use,
          chunk_quality_score,
          injection_risk
        )
        values (
          ${input.upload.version_id}::uuid,
          ${input.upload.source_id}::uuid,
          ${input.upload.project_id}::uuid,
          ${input.upload.upload_id}::uuid,
          ${chunk.sourceDocumentTitle},
          ${chunk.normalizedText},
          ${chunk.sourceQuote},
          ${chunk.contextType},
          ${chunk.authority},
          ${chunk.allowedUse},
          ${chunk.chunkQualityScore},
          ${chunk.injectionRisk}
        )
        returning chunk_id
      `);

      if (!inserted) {
        throw new Error("Project context chunk insert failed.");
      }

      await insertProjectContextChunkLocation(tx, inserted.chunk_id, chunk.location);
    }

    await tx.$executeRaw(Prisma.sql`
      update upload_reference
      set malware_scan_status = 'clean'
      where project_id = ${input.upload.project_id}::uuid
        and upload_id = ${input.upload.upload_id}::uuid
    `);

    await tx.$executeRaw(Prisma.sql`
      update project_upload_version
      set status = 'review_pending',
          processed_at = now(),
          updated_at = now()
      where project_id = ${input.upload.project_id}::uuid
        and version_id = ${input.upload.version_id}::uuid
    `);
  });
}

async function insertProjectContextChunkLocation(
  tx: Prisma.TransactionClient,
  chunkId: string,
  location: ProjectContextLocation,
) {
  const row = toChunkLocationSqlRow(location);
  await tx.$executeRaw(Prisma.sql`
    insert into chunk_location (
      chunk_id,
      location_type,
      line_start,
      line_end,
      page_number,
      paragraph_index,
      sheet_name,
      row_start,
      row_end,
      cell_range,
      message_index_start,
      message_index_end,
      sender,
      timestamp_start,
      timestamp_end,
      heading_path
    )
    values (
      ${chunkId}::uuid,
      ${row.locationType},
      ${row.lineStart},
      ${row.lineEnd},
      ${row.pageNumber},
      ${row.paragraphIndex},
      ${row.sheetName},
      ${row.rowStart},
      ${row.rowEnd},
      ${row.cellRange},
      ${row.messageIndexStart},
      ${row.messageIndexEnd},
      ${row.sender},
      ${row.timestampStart}::timestamptz,
      ${row.timestampEnd}::timestamptz,
      ${row.headingPathJson}::jsonb
    )
  `);
}

async function markProjectContextUploadProcessingFailed(input: {
  upload: ProjectContextUploadProcessingRow;
  failureCode: string;
  failureMessage: string;
}): Promise<ProcessProjectContextUploadResult> {
  const failureMessage = input.failureMessage.slice(0, 1_000);
  await prisma.$executeRaw(Prisma.sql`
    update project_upload_version
    set status = 'failed',
        failure_code = ${input.failureCode},
        failure_message = ${failureMessage},
        updated_at = now()
    where project_id = ${input.upload.project_id}::uuid
      and version_id = ${input.upload.version_id}::uuid
  `);

  return {
    uploadId: input.upload.upload_id,
    versionId: input.upload.version_id,
    status: "failed",
    chunkCount: 0,
    parserSummary: null,
    confidenceWeight: null,
    failureCode: input.failureCode,
    failureMessage,
  };
}

function toChunkLocationSqlRow(location: ProjectContextLocation) {
  const headingPathJson = "headingPath" in location && location.headingPath?.length
    ? JSON.stringify(location.headingPath)
    : null;

  return {
    locationType: location.locationType,
    lineStart: "lineStart" in location ? location.lineStart ?? null : null,
    lineEnd: "lineEnd" in location ? location.lineEnd ?? null : null,
    pageNumber: "pageNumber" in location ? location.pageNumber ?? null : null,
    paragraphIndex: "paragraphIndex" in location ? location.paragraphIndex ?? null : null,
    sheetName: "sheetName" in location ? location.sheetName ?? null : null,
    rowStart: "rowStart" in location ? location.rowStart ?? null : null,
    rowEnd: "rowEnd" in location ? location.rowEnd ?? null : null,
    cellRange: "cellRange" in location ? location.cellRange ?? null : null,
    messageIndexStart: "messageIndexStart" in location ? location.messageIndexStart ?? null : null,
    messageIndexEnd: "messageIndexEnd" in location ? location.messageIndexEnd ?? null : null,
    sender: "sender" in location ? location.sender ?? null : null,
    timestampStart: "timestampStart" in location ? parseOptionalTimestamp(location.timestampStart) : null,
    timestampEnd: "timestampEnd" in location ? parseOptionalTimestamp(location.timestampEnd) : null,
    headingPathJson,
  };
}

function parseOptionalTimestamp(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function buildExtractionFileRecord(input: ProjectContextUploadTextExtractionInput): FileRecord {
  return {
    id: input.uploadId,
    taskId: "project-context-upload",
    projectId: input.projectId,
    fileGroupId: input.uploadId,
    originalName: input.originalFilename,
    mimeType: input.mimeType,
    sizeBytes: input.fileSizeBytes,
    storageBucket: "project-context-db-blob",
    objectPath: `project-context/${input.projectId}/${input.uploadId}`,
    version: 1,
    versionNumber: 1,
    versionLabel: "v1",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    uploadedBy: null,
    deletedAt: null,
    purgedAt: null,
    metadata: {},
  };
}

type ProjectContextUploadProcessingRow = {
  upload_id: string;
  project_id: string;
  source_id: string;
  version_id: string;
  raw_storage_key: string | null;
  original_filename: string;
  mime_type: string;
  file_size_bytes: bigint | number;
};

function inferExtractionKind(filename: string, mimeType: string): ProjectContextExtractionKind {
  const lower = filename.toLowerCase();
  const normalizedMimeType = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (lower.endsWith(".md") || normalizedMimeType === "text/markdown") return "markdown";
  if (lower.endsWith(".csv") || normalizedMimeType === "text/csv") return "csv";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf") || normalizedMimeType === "application/pdf") return "pdf";
  return "text";
}
