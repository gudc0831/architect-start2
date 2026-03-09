import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreateTaskInput, FileRepository, TaskRepository, UpdateTaskInput } from "@/repositories/contracts";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { localFileStorePath, localSequenceStorePath, localTaskStorePath } from "@/lib/runtime-config";

const now = () => new Date().toISOString();
const nextId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

type SequenceState = { current: number };

function latestFiles(items: FileRecord[]) {
  const latestByGroup = new Map<string, FileRecord>();

  items.forEach((file) => {
    const current = latestByGroup.get(file.fileGroupId);

    if (!current || file.versionNumber > current.versionNumber) {
      latestByGroup.set(file.fileGroupId, file);
    }
  });

  return [...latestByGroup.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

async function ensureParent(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    await ensureParent(path);
    await writeFile(path, JSON.stringify(fallback, null, 2), "utf8");
    return fallback;
  }
}

async function writeJsonFile<T>(path: string, value: T) {
  await ensureParent(path);
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
}

function normalizeTaskNumbers(tasks: TaskRecord[]) {
  const legacyTasks = tasks.some((task) => /^MIL-\d+$/.test(task.taskNumber));

  if (!legacyTasks) {
    return { tasks, changed: false };
  }

  const order = [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const nextById = new Map(order.map((task, index) => [task.id, `#${index + 1}`]));
  const normalized = tasks.map((task) => ({ ...task, taskNumber: nextById.get(task.id) ?? task.taskNumber }));

  return { tasks: normalized, changed: true };
}

async function readTasks() {
  const tasks = await readJsonFile<TaskRecord[]>(localTaskStorePath, []);
  const normalized = normalizeTaskNumbers(tasks);

  if (normalized.changed) {
    await writeJsonFile(localTaskStorePath, normalized.tasks);
  }

  return normalized.tasks;
}

async function nextTaskNumber() {
  const tasks = await readTasks();
  const maxExisting = tasks.reduce((max, task) => {
    const match = /^#(\d+)$/.exec(task.taskNumber);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const current = maxExisting + 1;

  await writeJsonFile(localSequenceStorePath, { current: current + 1 });
  return `#${current}`;
}

class MemoryTaskRepository implements TaskRepository {
  async listActiveTasks() {
    const tasks = await readTasks();
    return tasks.filter((task) => !task.deletedAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async listTrashTasks() {
    const tasks = await readTasks();
    return tasks
      .filter((task) => !!task.deletedAt)
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }

  async createTask(input: CreateTaskInput) {
    const tasks = await readTasks();
    const record: TaskRecord = {
      id: nextId("task"),
      taskNumber: await nextTaskNumber(),
      dueDate: input.dueDate,
      category: input.category,
      requester: input.requester,
      assignee: input.assignee,
      title: input.title,
      createdAt: now(),
      isDaily: input.isDaily,
      description: input.description,
      status: "todo",
      progressNote: "",
      conclusion: "",
      deletedAt: null,
    };

    tasks.unshift(record);
    await writeJsonFile(localTaskStorePath, tasks);
    return record;
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    const tasks = await readTasks();
    const index = tasks.findIndex((task) => task.id === taskId);

    if (index === -1) {
      throw new Error("Task not found");
    }

    const next = { ...tasks[index], ...input };
    tasks[index] = next;
    await writeJsonFile(localTaskStorePath, tasks);
    return next;
  }

  async moveTaskToTrash(taskId: string) {
    return this.updateTask(taskId, { deletedAt: now() });
  }

  async restoreTask(taskId: string) {
    return this.updateTask(taskId, { deletedAt: null });
  }
}

class MemoryFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    return latestFiles(files.filter((file) => !file.deletedAt && (!taskId || file.taskId === taskId)));
  }

  async listTrashFiles(taskId?: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    return files
      .filter((file) => !!file.deletedAt && (!taskId || file.taskId === taskId))
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }

  async findFileById(fileId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    return files.find((file) => file.id === fileId) ?? null;
  }

  async attachFile(input: { taskId: string; originalName: string; storedName: string; storedPath: string; fileGroupId?: string; versionNumber?: number }) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const versionNumber = input.versionNumber ?? 1;
    const record: FileRecord = {
      id: nextId("file"),
      taskId: input.taskId,
      fileGroupId: input.fileGroupId ?? nextId("file_group"),
      originalName: input.originalName,
      storedName: input.storedName,
      storedPath: input.storedPath,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      createdAt: now(),
      deletedAt: null,
    };

    files.unshift(record);
    await writeJsonFile(localFileStorePath, files);
    return record;
  }

  async moveFileToTrash(fileId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const index = files.findIndex((file) => file.id === fileId);

    if (index === -1) {
      throw new Error("File not found");
    }

    const next = { ...files[index], deletedAt: now() };
    files[index] = next;
    await writeJsonFile(localFileStorePath, files);
    return next;
  }

  async restoreFile(fileId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const index = files.findIndex((file) => file.id === fileId);

    if (index === -1) {
      throw new Error("File not found");
    }

    const next = { ...files[index], deletedAt: null };
    files[index] = next;
    await writeJsonFile(localFileStorePath, files);
    return next;
  }

  async moveFilesToTrashByTask(taskId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const deletedAt = now();
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt } : file));
    await writeJsonFile(localFileStorePath, next);
  }

  async restoreFilesByTask(taskId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt: null } : file));
    await writeJsonFile(localFileStorePath, next);
  }
}

export const memoryTaskRepository = new MemoryTaskRepository();
export const memoryFileRepository = new MemoryFileRepository();