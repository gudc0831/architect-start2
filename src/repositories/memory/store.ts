import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { CreateTaskInput, FileRepository, TaskRepository, UpdateTaskInput } from "@/repositories/contracts";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { localFileStorePath, localSequenceStorePath, localTaskStorePath } from "@/lib/runtime-config";

const now = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const nextId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const validStatus = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

type SequenceState = { current: number };

type PartialTaskRecord = Partial<TaskRecord> & Pick<TaskRecord, "id" | "taskNumber" | "title" | "createdAt">;

const normalizeStoredDate = (value?: string | null) => (value ? value.slice(0, 10) : todayKey());

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

function normalizeTaskRecords(tasks: TaskRecord[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ordered = [...tasks].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const maxExisting = ordered.reduce((max, task) => {
    const value = parseTaskNumber(task.taskNumber);
    return value ? Math.max(max, value) : max;
  }, 0);
  const usedNumbers = new Set<number>();
  let nextAssigned = maxExisting + 1;
  let changed = false;
  const normalizedNumberById = new Map<string, string>();

  for (const task of ordered) {
    const parsed = parseTaskNumber(task.taskNumber);
    let normalizedTaskNumber = "";

    if (parsed && !usedNumbers.has(parsed)) {
      normalizedTaskNumber = `#${parsed}`;
      usedNumbers.add(parsed);
    } else {
      while (usedNumbers.has(nextAssigned)) {
        nextAssigned += 1;
      }

      normalizedTaskNumber = `#${nextAssigned}`;
      usedNumbers.add(nextAssigned);
      nextAssigned += 1;
      changed = true;
    }

    if (normalizedTaskNumber !== task.taskNumber) {
      changed = true;
    }

    normalizedNumberById.set(task.id, normalizedTaskNumber);
  }

  const normalized = tasks.map((task) => {
    const raw = task as PartialTaskRecord;
    const parentTaskId = typeof raw.parentTaskId === "string" && byId.has(raw.parentTaskId) ? raw.parentTaskId : null;
    if (parentTaskId !== (raw.parentTaskId ?? null)) changed = true;

    const status = validStatus.has(task.status) ? task.status : "waiting";
    if (status !== task.status) changed = true;

    const depth = parentTaskId ? computeDepth(byId, parentTaskId) + 1 : 0;
    if (depth !== (raw.depth ?? 0)) changed = true;

    const rootTaskId = parentTaskId ? computeRootTaskId(byId, parentTaskId) : task.id;
    if (rootTaskId !== (raw.rootTaskId ?? task.id)) changed = true;

    const siblingOrder = Number.isFinite(raw.siblingOrder) ? Number(raw.siblingOrder) : 0;
    if (siblingOrder !== (raw.siblingOrder ?? 0)) changed = true;

    const createdAt = normalizeStoredDate(raw.createdAt);
    if (createdAt !== raw.createdAt) changed = true;

    const fileMemo = typeof raw.fileMemo === "string" ? raw.fileMemo : "";
    if (fileMemo !== (raw.fileMemo ?? "")) changed = true;

    return {
      ...task,
      taskNumber: normalizedNumberById.get(task.id) ?? task.taskNumber,
      parentTaskId,
      rootTaskId,
      depth,
      siblingOrder,
      createdAt,
      fileMemo,
      status,
    } satisfies TaskRecord;
  });

  return { tasks: normalized, changed };
}

async function readTasks() {
  const tasks = await readJsonFile<TaskRecord[]>(localTaskStorePath, []);
  const normalized = normalizeTaskRecords(tasks);

  if (normalized.changed) {
    await writeJsonFile(localTaskStorePath, normalized.tasks);
  }

  return normalized.tasks;
}

async function nextTaskNumber() {
  const tasks = await readTasks();
  const maxExisting = getMaxTaskNumber(tasks);
  const sequence = await readJsonFile<SequenceState>(localSequenceStorePath, { current: maxExisting + 1 });
  const nextValue = Math.max(Number(sequence.current) || 1, maxExisting + 1);

  await writeJsonFile<SequenceState>(localSequenceStorePath, { current: nextValue + 1 });
  return `#${nextValue}`;
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

  async createTask(input: CreateTaskInput) {
    const tasks = await readTasks();
    const id = nextId("task");
    const record: TaskRecord = {
      id,
      taskNumber: await nextTaskNumber(),
      parentTaskId: input.parentTaskId ?? null,
      rootTaskId: input.rootTaskId?.trim() || id,
      depth: input.depth ?? 0,
      siblingOrder: input.siblingOrder ?? 0,
      dueDate: input.dueDate,
      category: input.category,
      requester: input.requester,
      assignee: input.assignee,
      title: input.title,
      createdAt: normalizeStoredDate(input.createdAt),
      isDaily: input.isDaily,
      description: input.description,
      status: "waiting",
      progressNote: "",
      conclusion: "",
      fileMemo: input.fileMemo ?? "",
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

    const { parentTaskNumber: _parentTaskNumber, ...persistedInput } = input;
    const next = { ...tasks[index], ...persistedInput };
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

function parseTaskNumber(taskNumber: string) {
  const match = /^#(\d+)$/.exec(taskNumber) ?? /^MIL-(\d+)$/.exec(taskNumber);
  return match ? Number(match[1]) : null;
}

function getMaxTaskNumber(tasks: TaskRecord[]) {
  return tasks.reduce((max, task) => {
    const value = parseTaskNumber(task.taskNumber);
    return value ? Math.max(max, value) : max;
  }, 0);
}

function computeDepth(byId: Map<string, TaskRecord>, parentId: string) {
  let depth = 0;
  let currentId: string | null = parentId;
  const seen = new Set<string>();

  while (currentId && byId.has(currentId) && !seen.has(currentId)) {
    seen.add(currentId);
    const currentTask = byId.get(currentId);

    if (!currentTask) {
      break;
    }

    if (!currentTask.parentTaskId) {
      return depth;
    }

    currentId = currentTask.parentTaskId;
    depth += 1;
  }

  return depth;
}

function computeRootTaskId(byId: Map<string, TaskRecord>, parentId: string) {
  let currentId = parentId;
  const seen = new Set<string>();

  while (byId.has(currentId) && !seen.has(currentId)) {
    seen.add(currentId);
    const currentTask = byId.get(currentId);

    if (!currentTask) {
      break;
    }

    if (!currentTask.parentTaskId) {
      return currentTask.id;
    }

    currentId = currentTask.parentTaskId;
  }

  return parentId;
}

export const memoryTaskRepository = new MemoryTaskRepository();
export const memoryFileRepository = new MemoryFileRepository();