// @ts-nocheck
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreateFileInput, CreateTaskInput, FileRepository, TaskRepository, UpdateTaskInput, VersionedTaskUpdateInput } from "@/repositories/contracts";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { localFileStorePath, localSequenceStorePath, localTaskStorePath } from "@/lib/runtime-config";

const now = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const nextId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const validStatus = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

type SequenceState = { current: number };

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

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#\d+$/.test(trimmed)) return Number(trimmed.slice(1));
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
}

function normalizeStatus(status: unknown): TaskStatus {
  return validStatus.has(status as TaskStatus) ? (status as TaskStatus) : "waiting";
}

function normalizeTaskRecords(tasks: Array<Record<string, unknown>>) {
  const ordered = [...tasks].sort((left, right) => String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")));
  let nextNumber = 1;
  const normalized = ordered.map((raw) => {
    const taskNumber = parseNumeric(raw.taskNumber) ?? nextNumber;
    nextNumber = Math.max(nextNumber, taskNumber + 1);
    const actionId = parseNumeric(raw.actionId) ?? taskNumber;
    const status = normalizeStatus(raw.status);
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : now();
    const completedAt = typeof raw.completedAt === "string" ? raw.completedAt : status === "done" ? updatedAt : null;

    return {
      id: String(raw.id ?? nextId("task")),
      projectId: String(raw.projectId ?? "local-project"),
      taskNumber,
      actionId,
      issueId: typeof raw.issueId === "string" && raw.issueId ? raw.issueId : `ISSUE-${String(raw.id ?? nextId("issue"))}`,
      parentTaskId: typeof raw.parentTaskId === "string" && raw.parentTaskId ? raw.parentTaskId : null,
      rootTaskId: typeof raw.rootTaskId === "string" && raw.rootTaskId ? raw.rootTaskId : String(raw.id ?? nextId("task")),
      depth: Number(raw.depth ?? 0),
      siblingOrder: Number(raw.siblingOrder ?? 0),
      dueDate: String(raw.dueDate ?? ""),
      workType: String(raw.workType ?? raw.category ?? ""),
      coordinationScope: String(raw.coordinationScope ?? ""),
      ownerDiscipline: String(raw.ownerDiscipline ?? ""),
      requestedBy: String(raw.requestedBy ?? raw.requester ?? ""),
      relatedDisciplines: String(raw.relatedDisciplines ?? ""),
      assignee: String(raw.assignee ?? ""),
      issueTitle: String(raw.issueTitle ?? raw.title ?? ""),
      reviewedAt: String(raw.reviewedAt ?? ""),
      createdAt: String(raw.createdAt ?? todayKey()).slice(0, 10),
      createdBy: typeof raw.createdBy === "string" ? raw.createdBy : null,
      isDaily: Boolean(raw.isDaily),
      locationRef: String(raw.locationRef ?? ""),
      calendarLinked: Boolean(raw.calendarLinked),
      issueDetailNote: String(raw.issueDetailNote ?? raw.description ?? ""),
      status,
      statusHistory: String(raw.statusHistory ?? `${updatedAt} - ${status}`),
      decision: String(raw.decision ?? raw.conclusion ?? ""),
      completedAt,
      version: Number(raw.version ?? 1),
      updatedAt,
      updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : null,
      deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : raw.deletedAt === null ? null : null,
    } satisfies TaskRecord;
  });

  return normalized;
}

async function readTasks() {
  const tasks = await readJsonFile<Array<Record<string, unknown>>>(localTaskStorePath, []);
  const normalized = normalizeTaskRecords(tasks);
  await writeJsonFile(localTaskStorePath, normalized);
  return normalized;
}

async function nextTaskNumber() {
  const tasks = await readTasks();
  const maxExisting = tasks.reduce((max, task) => Math.max(max, task.taskNumber), 0);
  const sequence = await readJsonFile<SequenceState>(localSequenceStorePath, { current: maxExisting + 1 });
  const nextValue = Math.max(Number(sequence.current) || 1, maxExisting + 1);
  await writeJsonFile<SequenceState>(localSequenceStorePath, { current: nextValue + 1 });
  return nextValue;
}

function latestFiles(items: FileRecord[]) {
  const latestByGroup = new Map<string, FileRecord>();

  for (const file of items) {
    const current = latestByGroup.get(file.fileGroupId);
    if (!current || file.versionNumber > current.versionNumber) {
      latestByGroup.set(file.fileGroupId, file);
    }
  }

  return [...latestByGroup.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

class MemoryTaskRepository implements TaskRepository {
  async listActiveTasks() {
    const tasks = await readTasks();
    return tasks.filter((task) => !task.deletedAt);
  }

  async listTrashTasks() {
    const tasks = await readTasks();
    return tasks.filter((task) => !!task.deletedAt);
  }

  async findTaskById(taskId: string) {
    const tasks = await readTasks();
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  async getNextTaskNumber() {
    return nextTaskNumber();
  }

  async createTask(input: CreateTaskInput) {
    const tasks = await readTasks();
    const id = nextId("task");
    const taskNumber = await nextTaskNumber();
    const timestamp = now();
    const record: TaskRecord = {
      id,
      projectId: input.projectId,
      taskNumber,
      actionId: taskNumber,
      issueId: `ISSUE-${nextId("issue")}`,
      parentTaskId: input.parentTaskId ?? null,
      rootTaskId: input.rootTaskId?.trim() || id,
      depth: input.depth ?? 0,
      siblingOrder: input.siblingOrder ?? 0,
      dueDate: input.dueDate,
      workType: input.workType,
      coordinationScope: input.coordinationScope,
      ownerDiscipline: input.ownerDiscipline,
      requestedBy: input.requestedBy,
      relatedDisciplines: input.relatedDisciplines,
      assignee: input.assignee,
      issueTitle: input.issueTitle,
      reviewedAt: input.reviewedAt ?? "",
      createdAt: (input.createdAt ?? todayKey()).slice(0, 10),
      createdBy: input.createdBy ?? null,
      isDaily: input.isDaily,
      locationRef: input.locationRef,
      calendarLinked: input.calendarLinked,
      issueDetailNote: input.issueDetailNote,
      status: input.status,
      statusHistory: input.statusHistory ?? `${timestamp} - ${input.status}`,
      decision: input.decision,
      completedAt: input.completedAt ?? null,
      version: 1,
      updatedAt: timestamp,
      updatedBy: input.updatedBy ?? input.createdBy ?? null,
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

    const current = tasks[index];
    const { parentTaskNumber: _parentTaskNumber, updatedBy, ...persistedInput } = input;
    const next = {
      ...current,
      ...persistedInput,
      updatedAt: now(),
      updatedBy: updatedBy ?? current.updatedBy,
      version: current.version + 1,
    } satisfies TaskRecord;

    tasks[index] = next;
    await writeJsonFile(localTaskStorePath, tasks);
    return next;
  }

  async updateTaskWithVersion(taskId: string, input: VersionedTaskUpdateInput) {
    const current = await this.findTaskById(taskId);
    if (!current || current.version !== input.expectedVersion) {
      return null;
    }

    return this.updateTask(taskId, input);
  }

  async moveTaskToTrash(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: now(), updatedBy: updatedBy ?? null });
  }

  async restoreTask(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: null, updatedBy: updatedBy ?? null });
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

  async attachFile(input: CreateFileInput) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const versionNumber = input.versionNumber ?? input.version ?? 1;
    const record: FileRecord = {
      id: nextId("file"),
      taskId: input.taskId,
      projectId: input.projectId,
      fileGroupId: input.fileGroupId ?? nextId("file_group"),
      originalName: input.originalName,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes,
      storageBucket: input.storageBucket,
      objectPath: input.objectPath,
      version: input.version ?? versionNumber,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      createdAt: now(),
      updatedAt: now(),
      uploadedBy: input.uploadedBy ?? null,
      deletedAt: null,
      downloadUrl: null,
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

    const next = { ...files[index], deletedAt: now(), updatedAt: now() };
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

    const next = { ...files[index], deletedAt: null, updatedAt: now() };
    files[index] = next;
    await writeJsonFile(localFileStorePath, files);
    return next;
  }

  async moveFilesToTrashByTask(taskId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const deletedAt = now();
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt, updatedAt: deletedAt } : file));
    await writeJsonFile(localFileStorePath, next);
  }

  async restoreFilesByTask(taskId: string) {
    const files = await readJsonFile<FileRecord[]>(localFileStorePath, []);
    const restoredAt = now();
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt: null, updatedAt: restoredAt } : file));
    await writeJsonFile(localFileStorePath, next);
  }
}

export const memoryTaskRepository = new MemoryTaskRepository();
export const memoryFileRepository = new MemoryFileRepository();
