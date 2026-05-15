import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  appendFileAnalysisEntry,
  getFileAnalysisEntries,
  normalizeFileAnalysisConfidence,
  normalizeFileAnalysisArtifact,
  normalizeFileAnalysisRegion,
  normalizeFileAnalysisSourceType,
  normalizeFileAnalysisTags,
  normalizeFileAnalysisVerificationState,
} from "@/domains/file/analysis";
import { extractTextFromStoredFile } from "@/domains/file/text-extraction";
import { resolveFileContentType } from "@/domains/file/metadata";
import type { FileAnalysisArtifact, FileAnalysisEntry } from "@/domains/file/analysis";
import type { FileRecord } from "@/domains/task/types";
import { allowedUploadExtensions, maxUploadSizeBytes } from "@/lib/runtime-config";
import { badRequest, conflict } from "@/lib/api/errors";
import { fileRepository, taskRepository } from "@/repositories";
import { storageProvider } from "@/storage";
import { getSupabaseStorageBucket } from "@/lib/supabase/config";
import { requireFileInSelectedProject, requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

export type FileScope = "active" | "trash";

export type FileUploadIntentInput = {
  taskId: string;
  fileId?: string | null;
  originalName: string;
  sizeBytes: number;
  mimeType?: string | null;
};

export type FileUploadIntent = {
  uploadMode: "direct" | "relay";
  projectId: string;
  taskId: string;
  sourceFileId: string | null;
  storageBucket: string;
  objectPath: string;
  fileGroupId: string;
  nextVersion: number;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
};

export type FileUploadCommitInput = Omit<FileUploadIntent, "uploadMode"> & {
  uploadedBy?: string | null;
};

export type FileAnalysisSaveInput = {
  fileId: string;
  sourceType?: string | null;
  extractedText?: string | null;
  summary?: string | null;
  tags?: unknown;
  confidenceWeight?: number | null;
  verificationState?: string | null;
  provider?: string | null;
  providerStatus?: string | null;
  region?: unknown;
  artifact?: unknown;
};

export async function listFiles(scope: FileScope, taskId?: string) {
  const project = await getSelectedTaskProject();

  if (taskId) {
    const task = await taskRepository.findTaskById(taskId);
    if (!task || task.projectId !== project.id) {
      return [];
    }

    return scope === "trash" ? fileRepository.listTrashFiles(taskId) : fileRepository.listActiveFiles(taskId);
  }

  const [projectTasks, files] = await Promise.all([
    scope === "trash" ? taskRepository.listTrashTasks(project.id) : taskRepository.listActiveTasks(project.id),
    scope === "trash" ? fileRepository.listTrashFiles() : fileRepository.listActiveFiles(),
  ]);
  const projectTaskIds = new Set(projectTasks.map((task) => task.id));

  return files.filter((file) => file.projectId === project.id || projectTaskIds.has(file.taskId));
}

export async function createFileUploadIntent(input: FileUploadIntentInput): Promise<FileUploadIntent> {
  const task = await requireTaskInSelectedProject(input.taskId.trim());
  const originalName = normalizeOriginalName(input.originalName);
  validateUploadDescriptor(originalName, input.sizeBytes);
  const storageBucket = resolveUploadStorageBucket();
  const objectPath = buildObjectPath(task.projectId, task.id, originalName);

  const sourceFileId = normalizeOptionalId(input.fileId);
  if (!sourceFileId) {
    return {
      uploadMode: resolveUploadMode(),
      projectId: task.projectId,
      taskId: task.id,
      sourceFileId: null,
      storageBucket,
      objectPath,
      fileGroupId: randomUUID(),
      nextVersion: 1,
      originalName,
      mimeType: normalizeMimeType(input.mimeType),
      sizeBytes: input.sizeBytes,
    };
  }

  const sourceFile = await requireFileInSelectedProject(sourceFileId);
  if (sourceFile.taskId !== task.id) {
    throw badRequest("fileId does not belong to the selected task", "FILE_SCOPE_INVALID");
  }

  if (sourceFile.deletedAt) {
    throw badRequest("Only active files can create a new version", "FILE_NOT_ACTIVE");
  }

  const nextVersion = await resolveNextFileVersion(sourceFile);
  return {
    uploadMode: resolveUploadMode(),
    projectId: task.projectId,
    taskId: task.id,
    sourceFileId: sourceFile.id,
    storageBucket,
    objectPath,
    fileGroupId: sourceFile.fileGroupId,
    nextVersion,
    originalName,
    mimeType: normalizeMimeType(input.mimeType),
    sizeBytes: input.sizeBytes,
  };
}

export async function commitFileUpload(input: FileUploadCommitInput) {
  const task = await requireTaskInSelectedProject(input.taskId.trim());
  const originalName = normalizeOriginalName(input.originalName);
  validateUploadDescriptor(originalName, input.sizeBytes);

  if (task.projectId !== input.projectId) {
    throw badRequest("projectId does not match the selected task", "FILE_PROJECT_SCOPE_INVALID");
  }

  const storageBucket = normalizeStorageBucket(input.storageBucket);
  const objectPath = normalizeObjectPath(input.objectPath);
  const expectedPrefix = `projects/${task.projectId}/tasks/${task.id}/`;
  if (!objectPath.startsWith(expectedPrefix)) {
    throw badRequest("objectPath is invalid", "FILE_OBJECT_PATH_INVALID");
  }

  const sourceFileId = normalizeOptionalId(input.sourceFileId);
  if (sourceFileId) {
    const sourceFile = await requireFileInSelectedProject(sourceFileId);
    if (sourceFile.taskId !== task.id) {
      throw badRequest("sourceFileId does not belong to the selected task", "FILE_SCOPE_INVALID");
    }
    if (sourceFile.deletedAt) {
      throw badRequest("Only active files can create a new version", "FILE_NOT_ACTIVE");
    }
    if (sourceFile.fileGroupId !== input.fileGroupId) {
      throw badRequest("fileGroupId does not match the source file", "FILE_GROUP_INVALID");
    }
  }

  const metadata = await storageProvider.getObjectMetadata({
    storageBucket,
    objectPath,
  });

  if (!metadata) {
    throw badRequest("Uploaded object not found", "FILE_UPLOAD_OBJECT_MISSING");
  }

  if (metadata.sizeBytes !== input.sizeBytes) {
    throw conflict("Uploaded object size does not match the declared size", "FILE_UPLOAD_SIZE_MISMATCH");
  }

  const fileGroupId = normalizeOptionalId(input.fileGroupId);
  if (!fileGroupId) {
    throw badRequest("fileGroupId is required", "FILE_GROUP_ID_REQUIRED");
  }

  const nextVersion = normalizePositiveInteger(input.nextVersion, "nextVersion");
  const existing = (await fileRepository.listFilesByTask(task.id)).find(
    (file) => file.fileGroupId === fileGroupId && file.version === nextVersion,
  );

  if (existing) {
    if (existing.objectPath === objectPath) {
      return existing;
    }

    throw fileVersionConflict();
  }

  try {
    return await fileRepository.attachFile({
      taskId: task.id,
      projectId: task.projectId,
      fileGroupId,
      version: nextVersion,
      originalName,
      mimeType: metadata.mimeType ?? normalizeMimeType(input.mimeType),
      sizeBytes: metadata.sizeBytes,
      storageBucket,
      objectPath,
      uploadedBy: input.uploadedBy ?? null,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw fileVersionConflict();
    }

    throw error;
  }
}

export async function createFileDownloadUrl(fileId: string) {
  const file = await requireFileInSelectedProject(fileId);
  const storageBucket = normalizeStorageBucket(file.storageBucket);
  const objectPath = normalizeObjectPath(file.objectPath);

  const signedUrl = await storageProvider.createSignedDownloadUrl({
    storageBucket,
    objectPath,
    expiresInSeconds: 60 * 10,
  });

  if (signedUrl) {
    return signedUrl;
  }

  return buildFallbackDownloadUrl(file.id, file.deletedAt !== null);
}

export async function attachUploadedFile(input: { taskId: string; file: File; userId?: string | null }) {
  const taskId = input.taskId.trim();
  if (!taskId) {
    throw badRequest("taskId is required", "TASK_ID_REQUIRED");
  }

  validateUploadDescriptor(input.file.name, input.file.size);
  const task = await requireTaskInSelectedProject(taskId);
  const storageBucket = resolveUploadStorageBucket();

  const stored = await storageProvider.upload({
    file: input.file,
    objectPath: buildObjectPath(task.projectId, task.id, input.file.name),
    contentType: input.file.type || null,
  });

  return fileRepository.attachFile({
    taskId: task.id,
    projectId: task.projectId,
    originalName: input.file.name,
    mimeType: input.file.type || null,
    sizeBytes: input.file.size,
    storageBucket: stored.storageBucket || storageBucket,
    objectPath: stored.objectPath,
    uploadedBy: input.userId ?? null,
  });
}

export async function attachNextFileVersion(input: { fileId: string; file: File; userId?: string | null }) {
  validateUploadDescriptor(input.file.name, input.file.size);
  const source = await requireFileInSelectedProject(input.fileId);

  if (source.deletedAt) {
    throw badRequest("Only active files can create a new version", "FILE_NOT_ACTIVE");
  }

  const siblings = await fileRepository.listActiveFiles(source.taskId);
  const sameGroup = siblings.filter((file) => file.fileGroupId === source.fileGroupId);
  const nextVersion = sameGroup.reduce((max, file) => Math.max(max, file.version), source.version) + 1;
  const stored = await storageProvider.upload({
    file: input.file,
    objectPath: buildObjectPath(source.projectId, source.taskId, input.file.name),
    contentType: input.file.type || null,
  });

  try {
    return await fileRepository.attachFile({
      taskId: source.taskId,
      projectId: source.projectId,
      fileGroupId: source.fileGroupId,
      version: nextVersion,
      originalName: input.file.name,
      mimeType: input.file.type || null,
      sizeBytes: input.file.size,
      storageBucket: stored.storageBucket,
      objectPath: stored.objectPath,
      uploadedBy: input.userId ?? null,
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw fileVersionConflict();
    }

    throw error;
  }
}

export async function moveFileToTrash(fileId: string) {
  await requireFileInSelectedProject(fileId);
  return fileRepository.moveFileToTrash(fileId);
}

export async function restoreFile(fileId: string) {
  await requireFileInSelectedProject(fileId);
  return fileRepository.restoreFile(fileId);
}

export async function permanentlyDeleteFile(fileId: string) {
  const file = await requireFileInSelectedProject(fileId);

  if (!file.deletedAt) {
    throw badRequest("Only trashed files can be deleted permanently", "FILE_NOT_IN_TRASH");
  }

  await fileRepository.deleteFile(fileId);
}

export async function readFileContent(fileId: string, options?: { allowDeleted?: boolean }) {
  const file = await requireFileInSelectedProject(fileId);
  if (file.deletedAt && !options?.allowDeleted) {
    throw badRequest("Only active files can be opened", "FILE_NOT_ACTIVE");
  }

  const storageBucket = normalizeStorageBucket(file.storageBucket);
  const objectPath = normalizeObjectPath(file.objectPath);

  const content = await storageProvider.download({ storageBucket, objectPath });
  return {
    file,
    content,
    contentType: resolveFileContentType(file),
  };
}

export async function listFileAnalysis(fileId: string) {
  const file = await requireFileInSelectedProject(normalizeRequiredId(fileId, "fileId"));
  return getFileAnalysisEntries(file.metadata);
}

export async function readFileAnalysisArtifact(fileId: string, analysisId: string) {
  const file = await requireFileInSelectedProject(normalizeRequiredId(fileId, "fileId"));
  if (file.deletedAt) {
    throw badRequest("Only active file analysis artifacts can be opened", "FILE_NOT_ACTIVE");
  }

  const analysis = getFileAnalysisEntries(file.metadata).find((entry) => entry.id === normalizeRequiredId(analysisId, "analysisId"));
  if (!analysis?.artifact) {
    throw badRequest("analysis artifact was not found", "FILE_ANALYSIS_ARTIFACT_NOT_FOUND");
  }

  const content = await storageProvider.download({
    storageBucket: normalizeStorageBucket(analysis.artifact.storageBucket),
    objectPath: normalizeObjectPath(analysis.artifact.objectPath),
  });

  return {
    file,
    analysis,
    artifact: analysis.artifact,
    content,
  };
}

export async function saveFileAnalysis(input: FileAnalysisSaveInput, userId?: string | null) {
  const file = await requireFileInSelectedProject(normalizeRequiredId(input.fileId, "fileId"));
  if (file.deletedAt) {
    throw badRequest("Only active files can be analyzed", "FILE_NOT_ACTIVE");
  }

  const sourceType = normalizeFileAnalysisSourceType(input.sourceType);
  const verificationState = normalizeFileAnalysisVerificationState(input.verificationState);
  const extractedText = normalizeAnalysisText(input.extractedText, 12000);
  const summary = normalizeAnalysisText(input.summary, 1200) || summarizeAnalysisText(extractedText);
  if (!extractedText && !summary) {
    throw badRequest("analysis text or summary is required", "FILE_ANALYSIS_TEXT_REQUIRED");
  }

  const timestamp = new Date().toISOString();
  const analysis: FileAnalysisEntry = {
    id: randomUUID(),
    sourceType,
    extractedText,
    summary,
    tags: normalizeFileAnalysisTags(input.tags),
    confidenceWeight: normalizeFileAnalysisConfidence(input.confidenceWeight, sourceType, verificationState),
    verificationState,
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.providerStatus === "client_supplied" || input.providerStatus === "provider_extracted"
      ? { providerStatus: input.providerStatus }
      : {}),
    ...(normalizeFileAnalysisRegion(input.region) ? { region: normalizeFileAnalysisRegion(input.region) } : {}),
    ...(normalizeFileAnalysisArtifact(input.artifact) ? { artifact: normalizeFileAnalysisArtifact(input.artifact) } : {}),
    createdBy: userId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const nextFile = await fileRepository.updateFileMetadata(file.id, appendFileAnalysisEntry(file.metadata, analysis));

  return {
    file: nextFile,
    analysis,
  };
}

export async function autoExtractFileAnalysis(fileId: string, userId?: string | null) {
  const file = await requireFileInSelectedProject(normalizeRequiredId(fileId, "fileId"));
  if (file.deletedAt) {
    throw badRequest("Only active files can be analyzed", "FILE_NOT_ACTIVE");
  }

  const content = await storageProvider.download({
    storageBucket: normalizeStorageBucket(file.storageBucket),
    objectPath: normalizeObjectPath(file.objectPath),
  });
  const extracted = await extractTextFromStoredFile(file, content);

  return saveFileAnalysis(
    {
      fileId: file.id,
      sourceType: "document_text",
      extractedText: extracted.extractedText,
      summary: extracted.summary,
      tags: extracted.tags,
      confidenceWeight: extracted.confidenceWeight,
      verificationState: "unverified",
    },
    userId,
  );
}

function validateUploadDescriptor(originalName: string, sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw badRequest("file is required", "FILE_REQUIRED");
  }

  if (sizeBytes > maxUploadSizeBytes) {
    throw badRequest("file size exceeds the allowed limit", "FILE_TOO_LARGE");
  }

  const extension = extname(originalName).replace(/^\./, "").toLowerCase();
  if (allowedUploadExtensions.length > 0 && (!extension || !allowedUploadExtensions.includes(extension))) {
    throw badRequest("file type is not allowed", "FILE_TYPE_NOT_ALLOWED");
  }
}

function normalizeOriginalName(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw badRequest("file name is required", "FILE_NAME_REQUIRED");
  }

  return normalized;
}

function normalizeMimeType(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeStorageBucket(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw badRequest("storageBucket is required", "FILE_STORAGE_BUCKET_REQUIRED");
  }

  return normalized;
}

export function normalizeObjectPath(value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("..")) {
    throw badRequest("objectPath is invalid", "FILE_OBJECT_PATH_INVALID");
  }

  return normalized;
}

function normalizeOptionalId(value?: string | null) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeRequiredId(value: string, fieldName: string) {
  const normalized = normalizeOptionalId(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

export function normalizeAnalysisText(value: string | null | undefined, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized.slice(0, maxLength) : "";
}

function summarizeAnalysisText(value: string) {
  if (!value) {
    return "";
  }

  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function normalizePositiveInteger(value: number, fieldName: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return value;
}

function resolveUploadStorageBucket() {
  return storageProvider.name === "supabase-storage" ? getSupabaseStorageBucket() : "local-dev";
}

function resolveUploadMode(): FileUploadIntent["uploadMode"] {
  return storageProvider.name === "supabase-storage" ? "direct" : "relay";
}

function buildFallbackDownloadUrl(fileId: string, allowDeleted: boolean) {
  const params = new URLSearchParams({
    disposition: "attachment",
  });

  if (allowDeleted) {
    params.set("allowDeleted", "1");
  }

  return `/api/files/${encodeURIComponent(fileId)}/content?${params.toString()}`;
}

async function resolveNextFileVersion(sourceFile: FileRecord) {
  const siblings = await fileRepository.listActiveFiles(sourceFile.taskId);
  const sameGroup = siblings.filter((file) => file.fileGroupId === sourceFile.fileGroupId);
  return sameGroup.reduce((max, file) => Math.max(max, file.version), sourceFile.version) + 1;
}

function fileVersionConflict() {
  return conflict(
    "Another upload created this file version first. Reload the latest files and try again.",
    "FILE_VERSION_CONFLICT",
  );
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

function buildObjectPath(projectId: string, taskId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `projects/${projectId}/tasks/${taskId}/${randomUUID()}-${safeName}`;
}

export function decodeImageDataUrl(value: string | null | undefined):
  | {
      bytes: Uint8Array;
      mimeType: "image/png" | "image/jpeg";
      extension: "png" | "jpg";
    }
  | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const match = value.match(/^data:(image\/png|image\/jpeg);base64,([a-zA-Z0-9+/=\r\n]+)$/);
  if (!match) {
    throw badRequest("sourceImageDataUrl must be a PNG or JPEG data URL.", "FILE_OCR_SOURCE_IMAGE_INVALID");
  }

  const mimeType = match[1] as "image/png" | "image/jpeg";
  const bytes = new Uint8Array(Buffer.from(match[2].replace(/\s+/g, ""), "base64"));
  if (bytes.byteLength <= 0) {
    throw badRequest("sourceImageDataUrl is empty.", "FILE_OCR_SOURCE_IMAGE_EMPTY");
  }
  if (bytes.byteLength > 4 * 1024 * 1024) {
    throw badRequest("sourceImageDataUrl exceeds the 4MB crop artifact limit.", "FILE_OCR_SOURCE_IMAGE_TOO_LARGE");
  }

  return {
    bytes,
    mimeType,
    extension: mimeType === "image/png" ? "png" : "jpg",
  };
}

export async function saveAnalysisImageCrop(
  file: FileRecord,
  image: { bytes: Uint8Array; mimeType: "image/png" | "image/jpeg"; extension: "png" | "jpg" },
  metadata: { sourceUrl?: string | null; sourceTitle?: string | null; capturedAt?: string | null },
): Promise<FileAnalysisArtifact> {
  const objectPath = buildObjectPath(file.projectId, file.taskId, `analysis-crop-${file.id}.${image.extension}`);
  const stored = await storageProvider.upload({
    file: new File([Buffer.from(image.bytes)], `analysis-crop-${file.id}.${image.extension}`, { type: image.mimeType }),
    objectPath,
    contentType: image.mimeType,
  });

  return {
    kind: "image_crop",
    storageBucket: stored.storageBucket,
    objectPath: stored.objectPath,
    mimeType: image.mimeType,
    sizeBytes: image.bytes.byteLength,
    ...(normalizeAnalysisText(metadata.sourceUrl, 500) ? { sourceUrl: normalizeAnalysisText(metadata.sourceUrl, 500) } : {}),
    ...(normalizeAnalysisText(metadata.sourceTitle, 200) ? { sourceTitle: normalizeAnalysisText(metadata.sourceTitle, 200) } : {}),
    ...(normalizeAnalysisText(metadata.capturedAt, 80) ? { capturedAt: normalizeAnalysisText(metadata.capturedAt, 80) } : {}),
  };
}
