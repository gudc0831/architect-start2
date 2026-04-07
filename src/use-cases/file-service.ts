import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { resolveFileContentType } from "@/domains/file/metadata";
import { allowedUploadExtensions, maxUploadSizeBytes } from "@/lib/runtime-config";
import { badRequest } from "@/lib/api/errors";
import { fileRepository, taskRepository } from "@/repositories";
import { storageProvider } from "@/storage";
import { requireFileInSelectedProject, requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

export type FileScope = "active" | "trash";

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

export async function attachUploadedFile(input: { taskId: string; file: File; userId?: string | null }) {
  const taskId = input.taskId.trim();
  if (!taskId) {
    throw badRequest("taskId is required", "TASK_ID_REQUIRED");
  }

  validateUpload(input.file);
  const task = await requireTaskInSelectedProject(taskId);

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
    storageBucket: stored.storageBucket,
    objectPath: stored.objectPath,
    uploadedBy: input.userId ?? null,
  });
}

export async function attachNextFileVersion(input: { fileId: string; file: File; userId?: string | null }) {
  validateUpload(input.file);
  const source = await requireFileInSelectedProject(input.fileId);

  const siblings = await fileRepository.listActiveFiles(source.taskId);
  const sameGroup = siblings.filter((file) => file.fileGroupId === source.fileGroupId);
  const nextVersion = sameGroup.reduce((max, file) => Math.max(max, file.version), source.version) + 1;
  const stored = await storageProvider.upload({
    file: input.file,
    objectPath: buildObjectPath(source.projectId, source.taskId, input.file.name),
    contentType: input.file.type || null,
  });

  return fileRepository.attachFile({
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

  const storageBucket = file.storageBucket.trim();
  const objectPath = file.objectPath.trim();

  if (!storageBucket || !objectPath) {
    throw badRequest("File storage location is invalid", "FILE_STORAGE_PATH_INVALID");
  }

  await storageProvider.delete({ storageBucket, objectPath });
  await fileRepository.deleteFile(fileId);
}

export async function readFileContent(fileId: string) {
  const file = await requireFileInSelectedProject(fileId);
  if (file.deletedAt) {
    throw badRequest("Only active files can be opened", "FILE_NOT_ACTIVE");
  }

  const storageBucket = file.storageBucket.trim();
  const objectPath = file.objectPath.trim();

  if (!storageBucket || !objectPath) {
    throw badRequest("File storage location is invalid", "FILE_STORAGE_PATH_INVALID");
  }

  const content = await storageProvider.download({ storageBucket, objectPath });
  return {
    file,
    content,
    contentType: resolveFileContentType(file),
  };
}

function validateUpload(file: File) {
  if (file.size <= 0) {
    throw badRequest("file is required", "FILE_REQUIRED");
  }

  if (file.size > maxUploadSizeBytes) {
    throw badRequest("업로드 가능한 파일 크기를 초과했습니다.", "FILE_TOO_LARGE");
  }

  const extension = extname(file.name).replace(/^\./, "").toLowerCase();
  if (allowedUploadExtensions.length > 0 && (!extension || !allowedUploadExtensions.includes(extension))) {
    throw badRequest("허용되지 않은 파일 형식입니다.", "FILE_TYPE_NOT_ALLOWED");
  }
}

function buildObjectPath(projectId: string, taskId: string, originalName: string) {
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `projects/${projectId}/tasks/${taskId}/${randomUUID()}-${safeName}`;
}
