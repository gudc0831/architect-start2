import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { notFound } from "@/lib/api/errors";
import { fileRepository, taskRepository } from "@/repositories";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

export async function requireTaskInSelectedProject(taskId: string): Promise<TaskRecord> {
  const project = await getSelectedTaskProject();
  const task = await taskRepository.findTaskById(taskId);

  if (!task || task.projectId !== project.id || task.purgedAt) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  return task;
}

export async function requireFileInSelectedProject(fileId: string): Promise<FileRecord> {
  const project = await getSelectedTaskProject();
  const file = await fileRepository.findFileById(fileId);

  if (!file || file.purgedAt) {
    throw notFound("File not found", "FILE_NOT_FOUND");
  }

  if (file.projectId === project.id) {
    return file;
  }

  const task = await taskRepository.findTaskById(file.taskId);
  if (!task || task.projectId !== project.id || task.purgedAt) {
    throw notFound("File not found", "FILE_NOT_FOUND");
  }

  return file;
}
