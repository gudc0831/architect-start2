// @ts-nocheck
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { buildProjectIssueId } from "@/domains/task/identifiers";
import { compareTasksBySiblingOrder } from "@/domains/task/ordering";
import type {
  CreateFileInput,
  CreateTaskInput,
  FileRepository,
  TaskOrderUpdateInput,
  TaskRepository,
  UpdateTaskInput,
  VersionedTaskUpdateInput,
} from "@/repositories/contracts";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { serviceUnavailable } from "@/lib/api/errors";
import { localUploadRoot } from "@/lib/runtime-config";
import { readLocalStore, writeLocalStore } from "@/lib/data-guard/local";
import { requireStoredTaskWorkTypeValue } from "@/lib/task-work-type-write";

const now = () => new Date().toISOString();
const todayKey = () => new Date().toISOString().slice(0, 10);
const nextId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const validStatus = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

type SequenceState = {
  current?: number;
  projects?: Record<string, number>;
};

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
  const nextNumberByProject = new Map<string, number>();
  const normalized = ordered.map((raw) => {
    const projectId = String(raw.projectId ?? "local-project");
    const projectNextNumber = nextNumberByProject.get(projectId) ?? 1;
    const taskNumber = parseNumeric(raw.taskNumber) ?? projectNextNumber;
    nextNumberByProject.set(projectId, Math.max(projectNextNumber, taskNumber + 1));
    const actionId = parseNumeric(raw.actionId) ?? taskNumber;
    const status = normalizeStatus(raw.status);
    const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : now();
    const completedAt = typeof raw.completedAt === "string" ? raw.completedAt : status === "done" ? updatedAt : null;

    return {
      id: String(raw.id ?? nextId("task")),
      projectId,
      taskNumber,
      actionId,
      issueId: typeof raw.issueId === "string" && raw.issueId ? raw.issueId : `#${taskNumber}`,
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
  const tasks = (await readLocalStore<Array<Record<string, unknown>>>("tasks", [])).value;
  return normalizeTaskRecords(tasks);
}

async function nextTaskNumber(projectId: string) {
  const tasks = await readTasks();
  const maxExisting = tasks
    .filter((task) => task.projectId === projectId)
    .reduce((max, task) => Math.max(max, task.taskNumber), 0);
  const sequence = (await readLocalStore<SequenceState>("sequence", { current: maxExisting + 1, projects: {} })).value;
  const storedCurrent = Number(sequence.projects?.[projectId] ?? 1);
  const nextValue = maxExisting > 0 ? Math.max(storedCurrent || 1, maxExisting + 1) : 1;
  await writeLocalStore(
    "sequence",
    {
      ...sequence,
      current: nextValue + 1,
      projects: {
        ...(sequence.projects ?? {}),
        [projectId]: nextValue + 1,
      },
    },
    { reason: "sequence.advance" },
  );
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
  async listActiveTasks(projectId?: string) {
    const tasks = await readTasks();
    return tasks
      .filter((task) => !task.deletedAt && (!projectId || task.projectId === projectId))
      .sort(compareTasksBySiblingOrder);
  }

  async listTrashTasks(projectId?: string) {
    const tasks = await readTasks();
    return tasks.filter((task) => !!task.deletedAt && (!projectId || task.projectId === projectId));
  }

  async findTaskById(taskId: string) {
    const tasks = await readTasks();
    return tasks.find((task) => task.id === taskId) ?? null;
  }

  async getNextTaskNumber(projectId?: string) {
    return nextTaskNumber(projectId ?? "local-project");
  }

  async createTask(input: CreateTaskInput) {
    const tasks = await readTasks();
    const id = nextId("task");
    const taskNumber = await nextTaskNumber(input.projectId);
    const timestamp = now();
    const record: TaskRecord = {
      id,
      projectId: input.projectId,
      taskNumber,
      actionId: taskNumber,
      issueId: buildProjectIssueId(input.projectName, taskNumber),
      parentTaskId: input.parentTaskId ?? null,
      rootTaskId: input.rootTaskId?.trim() || id,
      depth: input.depth ?? 0,
      siblingOrder: input.siblingOrder ?? 0,
      dueDate: input.dueDate,
      workType: requireStoredTaskWorkTypeValue(input.workType),
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
    await writeLocalStore("tasks", tasks, { reason: "tasks.create" });
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
    const normalizedPersistedInput = {
      ...persistedInput,
      workType:
        persistedInput.workType === undefined ? undefined : requireStoredTaskWorkTypeValue(persistedInput.workType),
    };
    const next = {
      ...current,
      ...normalizedPersistedInput,
      updatedAt: now(),
      updatedBy: updatedBy ?? current.updatedBy,
      version: current.version + 1,
    } satisfies TaskRecord;

    tasks[index] = next;
    await writeLocalStore("tasks", tasks, { reason: "tasks.update" });
    return next;
  }

  async updateTaskWithVersion(taskId: string, input: VersionedTaskUpdateInput) {
    const current = await this.findTaskById(taskId);
    if (!current || current.version !== input.expectedVersion) {
      return null;
    }

    return this.updateTask(taskId, input);
  }

  async updateTaskOrders(inputs: ReadonlyArray<TaskOrderUpdateInput>) {
    if (inputs.length === 0) {
      return [];
    }

    const tasks = await readTasks();
    const timestamp = now();
    const updatedTasks: TaskRecord[] = [];

    for (const input of inputs) {
      const index = tasks.findIndex((task) => task.id === input.id);
      if (index === -1) {
        throw new Error("Task not found");
      }

      const current = tasks[index];
      const next = {
        ...current,
        siblingOrder: input.siblingOrder,
        updatedAt: timestamp,
        updatedBy: input.updatedBy ?? current.updatedBy,
        version: current.version + 1,
      } satisfies TaskRecord;

      tasks[index] = next;
      updatedTasks.push(next);
    }

    await writeLocalStore("tasks", tasks, { reason: "tasks.reorder" });
    return updatedTasks;
  }

  async moveTaskToTrash(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: now(), updatedBy: updatedBy ?? null });
  }

  async restoreTask(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: null, updatedBy: updatedBy ?? null });
  }

  async deleteTask(taskId: string) {
    const tasks = await readTasks();
    const next = tasks.filter((task) => task.id !== taskId);

    if (next.length === tasks.length) {
      throw new Error("Task not found");
    }

    await writeLocalStore("tasks", next, { reason: "tasks.delete" });
  }
}

function toSafeObjectPath(value: unknown) {
  if (typeof value !== "string") return "";

  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    return "";
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === "..")) {
    return "";
  }

  return segments.join("/");
}

function resolveLegacyObjectPath(raw: Record<string, unknown>) {
  const directObjectPath = toSafeObjectPath(raw.objectPath);
  if (directObjectPath) return directObjectPath;

  const storedPath = typeof raw.storedPath === "string" ? raw.storedPath.trim() : "";
  if (storedPath) {
    if (isAbsolute(storedPath)) {
      const relativePath = relative(resolve(localUploadRoot), resolve(storedPath));
      const safeRelativePath = toSafeObjectPath(relativePath);
      if (safeRelativePath) return safeRelativePath;
    } else {
      const safeStoredPath = toSafeObjectPath(storedPath);
      if (safeStoredPath) return safeStoredPath;
    }
  }

  return toSafeObjectPath(raw.storedName);
}

function normalizeFileRecords(files: Array<Record<string, unknown>>) {
  return files.map((raw) => {
    const createdAt = typeof raw.createdAt === "string" && raw.createdAt ? raw.createdAt : now();
    const updatedAt = typeof raw.updatedAt === "string" && raw.updatedAt ? raw.updatedAt : createdAt;
    const versionNumber = parseNumeric(raw.versionNumber ?? raw.version) ?? 1;

    return {
      id: String(raw.id ?? nextId("file")),
      taskId: String(raw.taskId ?? ""),
      projectId: String(raw.projectId ?? "local-project"),
      fileGroupId: typeof raw.fileGroupId === "string" && raw.fileGroupId ? raw.fileGroupId : String(raw.id ?? nextId("file_group")),
      originalName: String(raw.originalName ?? raw.storedName ?? "legacy-file"),
      mimeType: typeof raw.mimeType === "string" && raw.mimeType ? raw.mimeType : null,
      sizeBytes: parseNumeric(raw.sizeBytes) ?? 0,
      storageBucket: typeof raw.storageBucket === "string" && raw.storageBucket ? raw.storageBucket : "local-dev",
      objectPath: resolveLegacyObjectPath(raw),
      version: parseNumeric(raw.version) ?? versionNumber,
      versionNumber,
      versionLabel: typeof raw.versionLabel === "string" && raw.versionLabel ? raw.versionLabel : `v${versionNumber}`,
      createdAt,
      updatedAt,
      uploadedBy: typeof raw.uploadedBy === "string" ? raw.uploadedBy : null,
      deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : raw.deletedAt === null ? null : null,
      downloadUrl: null,
    } satisfies FileRecord;
  });
}

async function readFiles() {
  const files = (await readLocalStore<Array<Record<string, unknown>>>("files", [])).value;
  return normalizeFileRecords(files);
}

class MemoryFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    const files = await readFiles();
    return latestFiles(files.filter((file) => !file.deletedAt && (!taskId || file.taskId === taskId)));
  }

  async listTrashFiles(taskId?: string) {
    const files = await readFiles();
    return files
      .filter((file) => !!file.deletedAt && (!taskId || file.taskId === taskId))
      .sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""));
  }

  async findFileById(fileId: string) {
    const files = await readFiles();
    return files.find((file) => file.id === fileId) ?? null;
  }

  async listFilesByTask(taskId: string) {
    const files = await readFiles();
    return files
      .filter((file) => file.taskId === taskId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async attachFile(input: CreateFileInput) {
    const files = await readFiles();
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
    await writeLocalStore("files", files, { reason: "files.attach" });
    return record;
  }

  async moveFileToTrash(fileId: string) {
    const files = await readFiles();
    const index = files.findIndex((file) => file.id === fileId);

    if (index === -1) {
      throw new Error("File not found");
    }

    const next = { ...files[index], deletedAt: now(), updatedAt: now() };
    files[index] = next;
    await writeLocalStore("files", files, { reason: "files.trash" });
    return next;
  }

  async restoreFile(fileId: string) {
    const files = await readFiles();
    const index = files.findIndex((file) => file.id === fileId);

    if (index === -1) {
      throw new Error("File not found");
    }

    const next = { ...files[index], deletedAt: null, updatedAt: now() };
    files[index] = next;
    await writeLocalStore("files", files, { reason: "files.restore" });
    return next;
  }

  async deleteFile(fileId: string) {
    const files = await readFiles();
    const next = files.filter((file) => file.id !== fileId);

    if (next.length === files.length) {
      throw new Error("File not found");
    }

    await writeLocalStore("files", next, { reason: "files.delete" });
  }

  async moveFilesToTrashByTask(taskId: string) {
    const files = await readFiles();
    const deletedAt = now();
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt, updatedAt: deletedAt } : file));
    await writeLocalStore("files", next, { reason: "files.bulk-trash" });
  }

  async restoreFilesByTask(taskId: string) {
    const files = await readFiles();
    const restoredAt = now();
    const next = files.map((file) => (file.taskId === taskId ? { ...file, deletedAt: null, updatedAt: restoredAt } : file));
    await writeLocalStore("files", next, { reason: "files.bulk-restore" });
  }
}

export const memoryTaskRepository = new MemoryTaskRepository();
export const memoryFileRepository = new MemoryFileRepository();
