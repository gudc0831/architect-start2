type FileMetadataLike = {
  originalName: string;
  mimeType?: string | null;
};

export type FilePreviewKind = "pdf" | "image" | "text";

const extensionContentTypes: Record<string, string> = {
  csv: "text/csv; charset=utf-8",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webp: "image/webp",
};

export function resolveFileContentType(file: FileMetadataLike) {
  const normalizedMimeType = String(file.mimeType ?? "").trim().toLowerCase();
  if (normalizedMimeType) {
    return normalizedMimeType;
  }

  const extension = getFileExtension(file.originalName);
  return extensionContentTypes[extension] ?? "application/octet-stream";
}

export function getFilePreviewKind(file: FileMetadataLike): FilePreviewKind | null {
  const contentType = resolveFileContentType(file).split(";")[0]?.trim().toLowerCase() ?? "";

  if (contentType === "application/pdf") {
    return "pdf";
  }

  if (contentType.startsWith("image/")) {
    return "image";
  }

  if (contentType === "text/plain" || contentType === "text/csv") {
    return "text";
  }

  return null;
}

export function isFilePreviewable(file: FileMetadataLike) {
  return getFilePreviewKind(file) !== null;
}

function getFileExtension(originalName: string) {
  const trimmed = originalName.trim();
  const extensionIndex = trimmed.lastIndexOf(".");
  if (extensionIndex < 0 || extensionIndex === trimmed.length - 1) {
    return "";
  }

  return trimmed.slice(extensionIndex + 1).toLowerCase();
}
