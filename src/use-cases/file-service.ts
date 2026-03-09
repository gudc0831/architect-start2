import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { localUploadRoot } from "@/lib/runtime-config";
import { fileRepository } from "@/repositories";

export type FileScope = "active" | "trash";

export async function listFiles(scope: FileScope, taskId?: string) {
  return scope === "trash" ? fileRepository.listTrashFiles(taskId) : fileRepository.listActiveFiles(taskId);
}

export async function attachUploadedFile(input: { taskId: string; file: File }) {
  if (!input.taskId.trim()) {
    throw new Error("taskId is required");
  }

  const stored = await saveLocalFile(input.file);

  return fileRepository.attachFile({
    taskId: input.taskId.trim(),
    originalName: input.file.name,
    storedName: stored.storedName,
    storedPath: stored.storedPath,
  });
}

export async function attachNextFileVersion(input: { fileId: string; file: File }) {
  const source = await fileRepository.findFileById(input.fileId);

  if (!source) {
    throw new Error("File not found");
  }

  const siblings = await fileRepository.listActiveFiles(source.taskId);
  const sameGroup = siblings.filter((file) => file.fileGroupId === source.fileGroupId);
  const nextVersionNumber = sameGroup.reduce((max, file) => Math.max(max, file.versionNumber), source.versionNumber) + 1;
  const stored = await saveLocalFile(input.file);

  return fileRepository.attachFile({
    taskId: source.taskId,
    fileGroupId: source.fileGroupId,
    versionNumber: nextVersionNumber,
    originalName: input.file.name,
    storedName: stored.storedName,
    storedPath: stored.storedPath,
  });
}

export async function moveFileToTrash(fileId: string) {
  return fileRepository.moveFileToTrash(fileId);
}

export async function restoreFile(fileId: string) {
  return fileRepository.restoreFile(fileId);
}

async function saveLocalFile(file: File) {
  await mkdir(localUploadRoot, { recursive: true });

  const safeBase = basename(file.name, extname(file.name)).replace(/[^a-zA-Z0-9-_]/g, "-");
  const storedName = `${Date.now()}-${safeBase}${extname(file.name)}`;
  const storedPath = join(localUploadRoot, storedName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await writeFile(storedPath, buffer);

  return { storedName, storedPath };
}