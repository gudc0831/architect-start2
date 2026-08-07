import { getFileAnalysisEntries, type FileAnalysisArtifact } from "@/domains/file/analysis";
import type { FileRecord } from "@/domains/task/types";

export type FileContentDisposition = "inline" | "attachment";

export type FileStorageObject = {
  storageBucket: string;
  objectPath: string;
};

export type FileStorageOwnershipFailureCode =
  | "FILE_STORAGE_BUCKET_INVALID"
  | "FILE_OBJECT_PATH_INVALID"
  | "FILE_UPLOAD_OBJECT_PATH_MISMATCH"
  | "FILE_ANALYSIS_ARTIFACT_PATH_INVALID"
  | "FILE_ANALYSIS_ARTIFACT_TYPE_INVALID";

export type FileStorageOwnershipResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: FileStorageOwnershipFailureCode; message: string };

const canonicalUploadContentTypes: Record<string, string> = {
  csv: "text/csv",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  dxf: "application/dxf",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  webp: "image/webp",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

const activeDocumentContentTypes = new Set([
  "application/javascript",
  "application/xhtml+xml",
  "application/xml",
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "text/xml",
]);

export function resolveCanonicalUploadContentType(originalName: string) {
  const extension = originalName.trim().toLowerCase().split(".").pop() ?? "";
  return canonicalUploadContentTypes[extension] ?? "application/octet-stream";
}

export function resolveCanonicalFileStorageBucket(
  storageProviderName: string,
  configuredSupabaseBucket: string,
) {
  return storageProviderName === "supabase-storage"
    ? configuredSupabaseBucket.trim()
    : storageProviderName === "local-dev-storage"
      ? "local-dev"
      : "";
}

export function buildTaskOwnedStoragePrefix(owner: Pick<FileRecord, "projectId" | "taskId">) {
  return `projects/${owner.projectId}/tasks/${owner.taskId}/`;
}

export function buildFileOwnedArtifactStoragePrefix(
  owner: Pick<FileRecord, "id" | "projectId" | "taskId">,
) {
  return `${buildTaskOwnedStoragePrefix(owner)}files/${owner.id}/artifacts/`;
}

export function validateTaskOwnedStorageObject(input: {
  owner: Pick<FileRecord, "projectId" | "taskId">;
  object: FileStorageObject;
  canonicalStorageBucket: string;
}): FileStorageOwnershipResult<FileStorageObject> {
  if (
    !input.canonicalStorageBucket ||
    input.object.storageBucket !== input.canonicalStorageBucket
  ) {
    return {
      ok: false,
      code: "FILE_STORAGE_BUCKET_INVALID",
      message: "Storage bucket does not match the configured file bucket.",
    };
  }

  const objectPath = input.object.objectPath;
  if (
    !isCanonicalStorageObjectPath(objectPath) ||
    !objectPath.startsWith(buildTaskOwnedStoragePrefix(input.owner))
  ) {
    return {
      ok: false,
      code: "FILE_OBJECT_PATH_INVALID",
      message: "Storage object path is outside the selected task.",
    };
  }

  return {
    ok: true,
    value: input.object,
  };
}

export function validateUploadedStorageObjectPath(input: {
  object: FileStorageObject;
  expectedObjectPath: string;
}): FileStorageOwnershipResult<FileStorageObject> {
  if (input.object.objectPath !== input.expectedObjectPath) {
    return {
      ok: false,
      code: "FILE_UPLOAD_OBJECT_PATH_MISMATCH",
      message: "Storage provider returned a different object path than the upload request.",
    };
  }

  return {
    ok: true,
    value: input.object,
  };
}

export function validateFileOwnedArtifactStorage(input: {
  owner: Pick<FileRecord, "id" | "projectId" | "taskId">;
  artifact: FileAnalysisArtifact;
  canonicalStorageBucket: string;
}): FileStorageOwnershipResult<FileAnalysisArtifact> {
  const taskOwnership = validateTaskOwnedStorageObject({
    owner: input.owner,
    object: input.artifact,
    canonicalStorageBucket: input.canonicalStorageBucket,
  });
  if (!taskOwnership.ok) {
    return taskOwnership;
  }

  if (!input.artifact.objectPath.startsWith(buildFileOwnedArtifactStoragePrefix(input.owner))) {
    return {
      ok: false,
      code: "FILE_ANALYSIS_ARTIFACT_PATH_INVALID",
      message: "Analysis artifact path is outside the selected file.",
    };
  }

  const canonicalContentType = resolveCanonicalUploadContentType(input.artifact.objectPath);
  if (
    (canonicalContentType !== "image/png" && canonicalContentType !== "image/jpeg") ||
    input.artifact.mimeType !== canonicalContentType
  ) {
    return {
      ok: false,
      code: "FILE_ANALYSIS_ARTIFACT_TYPE_INVALID",
      message: "Analysis artifacts must be canonical PNG or JPEG images.",
    };
  }

  return {
    ok: true,
    value: input.artifact,
  };
}

export function resolveOwnedFileStorageObjects(input: {
  file: FileRecord;
  canonicalStorageBucket: string;
}): FileStorageOwnershipResult<FileStorageObject[]> {
  const primaryObject = validateTaskOwnedStorageObject({
    owner: input.file,
    object: {
      storageBucket: input.file.storageBucket,
      objectPath: input.file.objectPath,
    },
    canonicalStorageBucket: input.canonicalStorageBucket,
  });
  if (!primaryObject.ok) {
    return primaryObject;
  }

  const objects = new Map<string, FileStorageObject>([
    [
      `${primaryObject.value.storageBucket}:${primaryObject.value.objectPath}`,
      primaryObject.value,
    ],
  ]);
  for (const entry of getFileAnalysisEntries(input.file.metadata)) {
    if (!entry.artifact) {
      continue;
    }
    const artifact = validateFileOwnedArtifactStorage({
      owner: input.file,
      artifact: entry.artifact,
      canonicalStorageBucket: input.canonicalStorageBucket,
    });
    if (!artifact.ok) {
      return artifact;
    }
    objects.set(`${artifact.value.storageBucket}:${artifact.value.objectPath}`, artifact.value);
  }

  return {
    ok: true,
    value: [...objects.values()],
  };
}

export function resolveFileContentResponsePolicy(
  contentType: string,
  requestedDisposition: FileContentDisposition,
): { contentType: string; disposition: FileContentDisposition } {
  const normalizedContentType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (activeDocumentContentTypes.has(normalizedContentType)) {
    return {
      contentType: "application/octet-stream",
      disposition: "attachment",
    };
  }

  return {
    contentType: contentType || "application/octet-stream",
    disposition: requestedDisposition,
  };
}

function isCanonicalStorageObjectPath(objectPath: string) {
  if (
    !objectPath ||
    objectPath !== objectPath.trim() ||
    objectPath.startsWith("/") ||
    objectPath.includes("\\")
  ) {
    return false;
  }

  const segments = objectPath.split("/");
  return segments.every((segment) => Boolean(segment) && segment !== "." && segment !== "..");
}
