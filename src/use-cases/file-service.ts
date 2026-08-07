import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import {
  appendFileAnalysisEntry,
  getFileAnalysisEntries,
  normalizeFileAnalysisConfidence,
  normalizeFileAnalysisArtifact,
  normalizeFileMetadata,
  normalizeFileAnalysisRegion,
  normalizeFileAnalysisSourceType,
  normalizeFileAnalysisTags,
  normalizeFileAnalysisVerificationState,
} from "@/domains/file/analysis";
import { extractTextFromStoredFile } from "@/domains/file/text-extraction";
import { resolveFileContentType } from "@/domains/file/metadata";
import type { FileAnalysisArtifact, FileAnalysisEntry } from "@/domains/file/analysis";
import {
  buildFileOwnedArtifactStoragePrefix,
  resolveCanonicalFileStorageBucket,
  resolveCanonicalUploadContentType,
  validateFileOwnedArtifactStorage,
  validateTaskOwnedStorageObject,
  validateUploadedStorageObjectPath,
} from "@/domains/file/content-security";
import type { FileRecord } from "@/domains/task/types";
import { allowedUploadExtensions, maxUploadSizeBytes } from "@/lib/runtime-config";
import { badRequest, conflict } from "@/lib/api/errors";
import { fileRepository, taskRepository } from "@/repositories";
import { storageProvider } from "@/storage";
import type { StoredObject } from "@/storage/contracts";
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
  const canonicalMimeType = resolveCanonicalUploadContentType(originalName);

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
      mimeType: canonicalMimeType,
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
    mimeType: canonicalMimeType,
    sizeBytes: input.sizeBytes,
  };
}

export async function commitFileUpload(input: FileUploadCommitInput) {
  const task = await requireTaskInSelectedProject(input.taskId.trim());
  const originalName = normalizeOriginalName(input.originalName);
  validateUploadDescriptor(originalName, input.sizeBytes);
  const canonicalMimeType = resolveCanonicalUploadContentType(originalName);

  if (task.projectId !== input.projectId) {
    throw badRequest("projectId does not match the selected task", "FILE_PROJECT_SCOPE_INVALID");
  }

  const storageBucket = normalizeStorageBucket(input.storageBucket);
  const objectPath = normalizeObjectPath(input.objectPath);
  requireTaskOwnedStorageObject(
    { projectId: task.projectId, taskId: task.id },
    { storageBucket, objectPath },
  );

  const fileGroupId = normalizeOptionalId(input.fileGroupId);
  if (!fileGroupId) {
    throw badRequest("fileGroupId is required", "FILE_GROUP_ID_REQUIRED");
  }
  const nextVersion = normalizePositiveInteger(input.nextVersion, "nextVersion");

  const sourceFileId = normalizeOptionalId(input.sourceFileId);
  if (sourceFileId) {
    const sourceFile = await requireFileInSelectedProject(sourceFileId);
    if (sourceFile.taskId !== task.id) {
      throw badRequest("sourceFileId does not belong to the selected task", "FILE_SCOPE_INVALID");
    }
    if (sourceFile.deletedAt) {
      throw badRequest("Only active files can create a new version", "FILE_NOT_ACTIVE");
    }
    if (sourceFile.fileGroupId !== fileGroupId) {
      throw badRequest("fileGroupId does not match the source file", "FILE_GROUP_INVALID");
    }
  }

  const taskFiles = await fileRepository.listFilesByTask(task.id);
  const objectOwner = taskFiles.find((file) => file.objectPath === objectPath && !file.purgedAt);
  if (objectOwner) {
    if (objectOwner.fileGroupId === fileGroupId && objectOwner.version === nextVersion) {
      return objectOwner;
    }
    throw conflict(
      "Uploaded object is already attached to another file record.",
      "FILE_UPLOAD_OBJECT_ALREADY_ATTACHED",
    );
  }
  const existing = taskFiles.find(
    (file) => file.fileGroupId === fileGroupId && file.version === nextVersion,
  );
  if (existing) {
    throw fileVersionConflict();
  }

  const metadata = await storageProvider.getObjectMetadata({
    storageBucket,
    objectPath,
  });

  if (!metadata) {
    throw badRequest("Uploaded object not found", "FILE_UPLOAD_OBJECT_MISSING");
  }

  if (metadata.sizeBytes !== input.sizeBytes) {
    throw conflict(
      "Uploaded object size does not match the declared size",
      "FILE_UPLOAD_SIZE_MISMATCH",
    );
  }

  try {
    return await fileRepository.attachFile({
      taskId: task.id,
      projectId: task.projectId,
      fileGroupId,
      version: nextVersion,
      originalName,
      mimeType: canonicalMimeType,
      sizeBytes: metadata.sizeBytes,
      storageBucket,
      objectPath,
      uploadedBy: input.uploadedBy ?? null,
    });
  } catch (error) {
    const attached = await readBackFileAfterFailedMetadataWrite(task.id, objectPath, error);
    if (attached) {
      if (attached.fileGroupId === fileGroupId && attached.version === nextVersion) {
        return attached;
      }
      throw conflict(
        "Uploaded object was attached to another file record while commit was pending.",
        "FILE_UPLOAD_OBJECT_ALREADY_ATTACHED",
      );
    }
    throw isUniqueConstraintError(error) ? fileVersionConflict() : error;
  }
}

export async function createFileDownloadUrl(fileId: string) {
  const file = await requireFileInSelectedProject(fileId);
  requireTaskOwnedStorageObject(file, {
    storageBucket: normalizeStorageBucket(file.storageBucket),
    objectPath: normalizeObjectPath(file.objectPath),
  });
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
  const canonicalMimeType = resolveCanonicalUploadContentType(input.file.name);

  const objectPath = buildObjectPath(task.projectId, task.id, input.file.name);
  const stored = await storageProvider.upload({
    file: input.file,
    objectPath,
    contentType: canonicalMimeType,
  });
  requireTaskOwnedStorageObject(
    { projectId: task.projectId, taskId: task.id },
    stored,
  );
  requireFreshUploadPath(stored, objectPath);

  try {
    return await fileRepository.attachFile({
      taskId: task.id,
      projectId: task.projectId,
      originalName: input.file.name,
      mimeType: canonicalMimeType,
      sizeBytes: input.file.size,
      storageBucket: stored.storageBucket || storageBucket,
      objectPath: stored.objectPath,
      uploadedBy: input.userId ?? null,
    });
  } catch (error) {
    const attached = await readBackFileAfterFailedMetadataWrite(task.id, stored.objectPath, error);
    if (attached) {
      return attached;
    }
    return compensateUploadedObject(stored, error, task.id);
  }
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
  const canonicalMimeType = resolveCanonicalUploadContentType(input.file.name);
  const objectPath = buildObjectPath(source.projectId, source.taskId, input.file.name);
  const stored = await storageProvider.upload({
    file: input.file,
    objectPath,
    contentType: canonicalMimeType,
  });
  requireTaskOwnedStorageObject(source, stored);
  requireFreshUploadPath(stored, objectPath);

  try {
    return await fileRepository.attachFile({
      taskId: source.taskId,
      projectId: source.projectId,
      fileGroupId: source.fileGroupId,
      version: nextVersion,
      originalName: input.file.name,
      mimeType: canonicalMimeType,
      sizeBytes: input.file.size,
      storageBucket: stored.storageBucket,
      objectPath: stored.objectPath,
      uploadedBy: input.userId ?? null,
    });
  } catch (error) {
    const attached = await readBackFileAfterFailedMetadataWrite(source.taskId, stored.objectPath, error);
    if (attached) {
      return attached;
    }
    return compensateUploadedObject(
      stored,
      isUniqueConstraintError(error) ? fileVersionConflict() : error,
      source.taskId,
    );
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
  requireTaskOwnedStorageObject(file, { storageBucket, objectPath });

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
  const artifact = requireFileOwnedArtifact(file, analysis.artifact);

  const content = await storageProvider.download({
    storageBucket: artifact.storageBucket,
    objectPath: artifact.objectPath,
  });

  return {
    file,
    analysis,
    artifact,
    content,
  };
}

export async function deleteFileAnalysisArtifact(fileId: string, analysisId: string) {
  const file = await requireFileInSelectedProject(normalizeRequiredId(fileId, "fileId"));
  if (file.deletedAt) {
    throw badRequest("Only active file analysis artifacts can be deleted", "FILE_NOT_ACTIVE");
  }

  const normalizedAnalysisId = normalizeRequiredId(analysisId, "analysisId");
  const analysisEntries = getFileAnalysisEntries(file.metadata);
  const targetAnalysis = analysisEntries.find((entry) => entry.id === normalizedAnalysisId);
  if (!targetAnalysis?.artifact) {
    throw badRequest("analysis artifact was not found", "FILE_ANALYSIS_ARTIFACT_NOT_FOUND");
  }
  const artifact = requireFileOwnedArtifact(file, targetAnalysis.artifact);

  await storageProvider.delete({
    storageBucket: artifact.storageBucket,
    objectPath: artifact.objectPath,
  });

  const timestamp = new Date().toISOString();
  const nextAnalysis = analysisEntries.map((entry) => {
    if (entry.id !== normalizedAnalysisId) {
      return entry;
    }

    const nextEntry: FileAnalysisEntry = {
      ...entry,
      updatedAt: timestamp,
    };
    delete nextEntry.artifact;
    return nextEntry;
  });
  const nextFile = await fileRepository.updateFileMetadata(file.id, {
    ...normalizeFileMetadata(file.metadata),
    analysis: nextAnalysis,
  });

  return {
    file: nextFile,
    analysisId: normalizedAnalysisId,
    deletedArtifact: {
      kind: targetAnalysis.artifact.kind,
      mimeType: targetAnalysis.artifact.mimeType,
      sizeBytes: targetAnalysis.artifact.sizeBytes,
      capturedAt: targetAnalysis.artifact.capturedAt ?? null,
    },
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
  const artifact = await resolveFileAnalysisArtifactInput(file, input.artifact);

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
    ...(artifact ? { artifact } : {}),
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

  const storageObject = {
    storageBucket: normalizeStorageBucket(file.storageBucket),
    objectPath: normalizeObjectPath(file.objectPath),
  };
  requireTaskOwnedStorageObject(file, storageObject);
  const content = await storageProvider.download(storageObject);
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
  const storageBucket = resolveCanonicalFileStorageBucket(
    storageProvider.name,
    getSupabaseStorageBucket(),
  );
  if (!storageBucket) {
    throw new Error(`Unsupported file storage provider: ${storageProvider.name}`);
  }
  return storageBucket;
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

async function findFileByObjectPath(taskId: string, objectPath: string) {
  const files = await fileRepository.listFilesByTask(taskId);
  return files.find((file) => file.objectPath === objectPath && !file.purgedAt) ?? null;
}

async function readBackFileAfterFailedMetadataWrite(
  taskId: string,
  objectPath: string,
  originalError: unknown,
) {
  try {
    return await findFileByObjectPath(taskId, objectPath);
  } catch (readbackError) {
    throw new AggregateError(
      [originalError, readbackError],
      `File metadata write outcome is ambiguous; uploaded object was retained for safe reconciliation: ${objectPath}.`,
    );
  }
}

async function compensateUploadedObject(
  stored: StoredObject,
  originalError: unknown,
  taskId?: string,
): Promise<never> {
  if (taskId) {
    const attached = await readBackFileAfterFailedMetadataWrite(
      taskId,
      stored.objectPath,
      originalError,
    );
    if (attached) {
      throw originalError;
    }
  }

  try {
    await storageProvider.delete({
      storageBucket: stored.storageBucket,
      objectPath: stored.objectPath,
    });
  } catch (cleanupError) {
    throw new AggregateError(
      [originalError, cleanupError],
      `File metadata write failed and uploaded object compensation also failed for ${stored.objectPath}.`,
    );
  }

  throw originalError;
}

function buildObjectPath(projectId: string, taskId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `projects/${projectId}/tasks/${taskId}/${randomUUID()}-${safeName}`;
}

function buildArtifactObjectPath(
  file: Pick<FileRecord, "id" | "projectId" | "taskId">,
  originalName: string,
) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${buildFileOwnedArtifactStoragePrefix(file)}${randomUUID()}-${safeName}`;
}

function requireTaskOwnedStorageObject(
  owner: Pick<FileRecord, "projectId" | "taskId">,
  object: { storageBucket: string; objectPath: string },
) {
  const ownership = validateTaskOwnedStorageObject({
    owner,
    object,
    canonicalStorageBucket: resolveUploadStorageBucket(),
  });
  if (!ownership.ok) {
    throw badRequest(ownership.message, ownership.code);
  }
  return ownership.value;
}

function requireFreshUploadPath(
  object: { storageBucket: string; objectPath: string },
  expectedObjectPath: string,
) {
  const pathMatch = validateUploadedStorageObjectPath({
    object,
    expectedObjectPath,
  });
  if (!pathMatch.ok) {
    throw conflict(pathMatch.message, pathMatch.code);
  }
  return pathMatch.value;
}

function requireFileOwnedArtifact(
  file: Pick<FileRecord, "id" | "projectId" | "taskId">,
  artifact: FileAnalysisArtifact,
) {
  const ownership = validateFileOwnedArtifactStorage({
    owner: file,
    artifact,
    canonicalStorageBucket: resolveUploadStorageBucket(),
  });
  if (!ownership.ok) {
    throw badRequest(ownership.message, ownership.code);
  }
  return ownership.value;
}

async function resolveFileAnalysisArtifactInput(
  file: Pick<FileRecord, "id" | "projectId" | "taskId">,
  value: unknown,
) {
  if (value === undefined || value === null) {
    return undefined;
  }

  const artifact = normalizeFileAnalysisArtifact(value);
  if (!artifact) {
    throw badRequest(
      "Analysis artifact metadata is invalid.",
      "FILE_ANALYSIS_ARTIFACT_INVALID",
    );
  }
  const ownedArtifact = requireFileOwnedArtifact(file, artifact);
  const metadata = await storageProvider.getObjectMetadata({
    storageBucket: ownedArtifact.storageBucket,
    objectPath: ownedArtifact.objectPath,
  });
  if (!metadata) {
    throw badRequest(
      "Analysis artifact object was not found.",
      "FILE_ANALYSIS_ARTIFACT_OBJECT_MISSING",
    );
  }
  if (
    metadata.sizeBytes !== ownedArtifact.sizeBytes ||
    (metadata.mimeType !== null && metadata.mimeType !== ownedArtifact.mimeType)
  ) {
    throw conflict(
      "Analysis artifact metadata does not match the stored object.",
      "FILE_ANALYSIS_ARTIFACT_METADATA_MISMATCH",
    );
  }
  return ownedArtifact;
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
  const originalName = `analysis-crop-${file.id}.${image.extension}`;
  const objectPath = buildArtifactObjectPath(file, originalName);
  const stored = await storageProvider.upload({
    file: new File([Buffer.from(image.bytes)], originalName, { type: image.mimeType }),
    objectPath,
    contentType: image.mimeType,
  });
  requireFreshUploadPath(stored, objectPath);

  return requireFileOwnedArtifact(file, {
    kind: "image_crop",
    storageBucket: stored.storageBucket,
    objectPath: stored.objectPath,
    mimeType: image.mimeType,
    sizeBytes: image.bytes.byteLength,
    ...(normalizeAnalysisText(metadata.sourceUrl, 500) ? { sourceUrl: normalizeAnalysisText(metadata.sourceUrl, 500) } : {}),
    ...(normalizeAnalysisText(metadata.sourceTitle, 200) ? { sourceTitle: normalizeAnalysisText(metadata.sourceTitle, 200) } : {}),
    ...(normalizeAnalysisText(metadata.capturedAt, 80) ? { capturedAt: normalizeAnalysisText(metadata.capturedAt, 80) } : {}),
  });
}
