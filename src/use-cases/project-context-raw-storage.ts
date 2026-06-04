import { storageProvider } from "@/storage";
import type { StoredObject } from "@/storage/contracts";

export type ProjectContextRawStorageReference = StoredObject;

const storageKeyFormat = "project-context-raw:v1";

export async function storeProjectContextRawBytes(input: {
  projectId: string;
  uploadId: string;
  originalFilename: string;
  mimeType: string;
  bytes: Uint8Array;
}): Promise<ProjectContextRawStorageReference> {
  const objectPath = buildProjectContextRawObjectPath({
    projectId: input.projectId,
    uploadId: input.uploadId,
    originalFilename: input.originalFilename,
  });
  const file = new File([toArrayBuffer(input.bytes)], input.originalFilename, { type: input.mimeType });
  return storageProvider.upload({
    file,
    objectPath,
    contentType: input.mimeType,
  });
}

export async function downloadProjectContextRawBytes(rawStorageKey: string): Promise<Uint8Array> {
  const reference = decodeProjectContextRawStorageKey(rawStorageKey);
  return storageProvider.download({
    storageBucket: reference.storageBucket,
    objectPath: reference.objectPath,
  });
}

export async function deleteProjectContextRawObject(rawStorageKey: string): Promise<void> {
  const reference = decodeProjectContextRawStorageKey(rawStorageKey);
  await storageProvider.delete({
    storageBucket: reference.storageBucket,
    objectPath: reference.objectPath,
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = Buffer.from(bytes);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

export function encodeProjectContextRawStorageKey(reference: ProjectContextRawStorageReference): string {
  return JSON.stringify({
    format: storageKeyFormat,
    storageProvider: reference.storageProvider,
    storageBucket: reference.storageBucket,
    objectPath: reference.objectPath,
  });
}

export function decodeProjectContextRawStorageKey(rawStorageKey: string): ProjectContextRawStorageReference {
  const parsed = safeParseJson(rawStorageKey);
  if (
    parsed &&
    parsed.format === storageKeyFormat &&
    typeof parsed.storageProvider === "string" &&
    typeof parsed.storageBucket === "string" &&
    typeof parsed.objectPath === "string" &&
    parsed.storageProvider.trim() &&
    parsed.storageBucket.trim() &&
    parsed.objectPath.trim()
  ) {
    return {
      storageProvider: parsed.storageProvider,
      storageBucket: parsed.storageBucket,
      objectPath: parsed.objectPath,
    };
  }

  throw new Error("Project context raw storage key is invalid or uses an unsupported legacy format.");
}

function buildProjectContextRawObjectPath(input: {
  projectId: string;
  uploadId: string;
  originalFilename: string;
}) {
  return [
    "project-context",
    sanitizePathSegment(input.projectId),
    sanitizePathSegment(input.uploadId),
    sanitizeFilename(input.originalFilename),
  ].join("/");
}

function sanitizePathSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "unknown";
}

function sanitizeFilename(value: string) {
  const trimmed = value.trim();
  const sanitized = trimmed.replace(/[/\\:*?"<>|#%{}^~[\]`]+/g, "_").replace(/\s+/g, " ").slice(0, 180);
  return sanitized || "upload";
}

function safeParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
