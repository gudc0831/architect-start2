import type { TaskStatus } from "@/domains/task/types";
import { fileRepository, taskRepository } from "@/repositories";
import type { CreateTaskInput, UpdateTaskInput } from "@/repositories/contracts";

export type TaskScope = "active" | "trash";

const taskStatusSet = new Set<TaskStatus>(["todo", "in_progress", "blocked", "done"]);

export async function listTasks(scope: TaskScope) {
  return scope === "trash" ? taskRepository.listTrashTasks() : taskRepository.listActiveTasks();
}

export async function createTask(input: CreateTaskInput) {
  return taskRepository.createTask({
    dueDate: normalizeDate(input.dueDate),
    category: normalizeText(input.category),
    requester: normalizeText(input.requester),
    assignee: normalizeText(input.assignee),
    title: normalizeRequiredText(input.title, "title"),
    isDaily: Boolean(input.isDaily),
    description: normalizeText(input.description),
  });
}

export async function updateTask(taskId: string, input: UpdateTaskInput) {
  return taskRepository.updateTask(taskId, sanitizeTaskUpdate(input));
}

export async function moveTaskToTrash(taskId: string) {
  const task = await taskRepository.moveTaskToTrash(taskId);
  await fileRepository.moveFilesToTrashByTask(taskId);
  return task;
}

export async function restoreTask(taskId: string) {
  const task = await taskRepository.restoreTask(taskId);
  await fileRepository.restoreFilesByTask(taskId);
  return task;
}

function sanitizeTaskUpdate(input: UpdateTaskInput): UpdateTaskInput {
  const next: UpdateTaskInput = {};

  if (typeof input.dueDate === "string") next.dueDate = normalizeDate(input.dueDate);
  if (typeof input.category === "string") next.category = normalizeText(input.category);
  if (typeof input.requester === "string") next.requester = normalizeText(input.requester);
  if (typeof input.assignee === "string") next.assignee = normalizeText(input.assignee);
  if (typeof input.title === "string") next.title = normalizeRequiredText(input.title, "title");
  if (typeof input.description === "string") next.description = normalizeText(input.description);
  if (typeof input.progressNote === "string") next.progressNote = normalizeText(input.progressNote);
  if (typeof input.conclusion === "string") next.conclusion = normalizeText(input.conclusion);
  if (typeof input.isDaily === "boolean") next.isDaily = input.isDaily;
  if (typeof input.deletedAt === "string" || input.deletedAt === null) next.deletedAt = input.deletedAt;

  if (typeof input.status === "string" && taskStatusSet.has(input.status as TaskStatus)) {
    next.status = input.status as TaskStatus;
  }

  return next;
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeText(value: string) {
  return value.trim();
}

function normalizeDate(value: string) {
  return value ? value.slice(0, 10) : "";
}