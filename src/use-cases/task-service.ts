import type { TaskRecord, TaskStatus } from "@/domains/task/types";
import { fileRepository, taskRepository } from "@/repositories";
import type { CreateTaskInput, UpdateTaskInput } from "@/repositories/contracts";

export type TaskScope = "active" | "trash";

const taskStatusSet = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

export async function listTasks(scope: TaskScope) {
  const tasks = scope === "trash" ? await taskRepository.listTrashTasks() : await taskRepository.listActiveTasks();
  return scope === "trash" ? sortTrashTasks(tasks) : flattenTaskTree(tasks);
}

export async function createTask(input: CreateTaskInput) {
  const activeTasks = await taskRepository.listActiveTasks();
  const parentTaskId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
  const parent = parentTaskId ? activeTasks.find((task) => task.id === parentTaskId) ?? null : null;

  return taskRepository.createTask({
    dueDate: normalizeDate(input.dueDate),
    category: normalizeText(input.category),
    requester: normalizeText(input.requester),
    assignee: normalizeText(input.assignee),
    title: normalizeRequiredText(input.title, "title"),
    createdAt: normalizeStoredDate(input.createdAt),
    isDaily: Boolean(input.isDaily),
    description: normalizeText(input.description),
    fileMemo: normalizeText(input.fileMemo ?? ""),
    parentTaskId,
    rootTaskId: parent ? parent.rootTaskId : undefined,
    depth: parent ? parent.depth + 1 : 0,
    siblingOrder: nextSiblingOrder(activeTasks, parentTaskId),
  });
}

export async function updateTask(taskId: string, input: UpdateTaskInput) {
  const activeTasks = await taskRepository.listActiveTasks();
  const currentTask = activeTasks.find((task) => task.id === taskId);

  if (!currentTask) {
    throw new Error("Task not found");
  }

  const sanitized = sanitizeTaskUpdate(input);
  if (Object.prototype.hasOwnProperty.call(input, "parentTaskNumber") || Object.prototype.hasOwnProperty.call(input, "parentTaskId")) {
    const nextParentId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
    return reparentTask(currentTask, nextParentId, sanitized, activeTasks);
  }

  return taskRepository.updateTask(taskId, sanitized);
}

export async function moveTaskToTrash(taskId: string) {
  const allTasks = await listAllTasks();
  const subtree = collectSubtree(allTasks, taskId);

  if (subtree.length === 0) {
    throw new Error("Task not found");
  }

  let updatedRoot = subtree[0];

  for (const task of subtree) {
    const updatedTask = await taskRepository.moveTaskToTrash(task.id);
    await fileRepository.moveFilesToTrashByTask(task.id);

    if (task.id === taskId) {
      updatedRoot = updatedTask;
    }
  }

  return updatedRoot;
}

export async function restoreTask(taskId: string) {
  const allTasks = await listAllTasks();
  const subtree = collectSubtree(allTasks, taskId);

  if (subtree.length === 0) {
    throw new Error("Task not found");
  }

  const target = subtree[0];
  const subtreeIds = new Set(subtree.map((task) => task.id));
  const currentParent = target.parentTaskId ? allTasks.find((task) => task.id === target.parentTaskId) ?? null : null;
  const shouldDetach = Boolean(currentParent?.deletedAt && !subtreeIds.has(currentParent.id));

  let restoredRoot = await taskRepository.restoreTask(target.id);
  await fileRepository.restoreFilesByTask(target.id);

  if (shouldDetach) {
    restoredRoot = await taskRepository.updateTask(target.id, {
      parentTaskId: null,
      rootTaskId: target.id,
      depth: 0,
    });
  }

  const byId = new Map(allTasks.map((task) => [task.id, task]));
  byId.set(restoredRoot.id, { ...target, ...restoredRoot, deletedAt: null });

  for (const task of subtree.slice(1)) {
    await taskRepository.restoreTask(task.id);
    await fileRepository.restoreFilesByTask(task.id);

    const parent = byId.get(task.parentTaskId ?? "") ?? null;
    const updated = await taskRepository.updateTask(task.id, {
      rootTaskId: parent ? parent.rootTaskId : task.id,
      depth: parent ? parent.depth + 1 : 0,
      deletedAt: null,
    });

    byId.set(task.id, { ...task, ...updated, deletedAt: null });
  }

  return restoredRoot;
}

async function reparentTask(task: TaskRecord, nextParentId: string | null, input: UpdateTaskInput, activeTasks: TaskRecord[]) {
  const descendants = new Set(collectDescendantIds(activeTasks, task.id));

  if (nextParentId === task.id || (nextParentId && descendants.has(nextParentId))) {
    throw new Error("Invalid parent task");
  }

  const parent = nextParentId ? activeTasks.find((entry) => entry.id === nextParentId) ?? null : null;
  if (nextParentId && !parent) {
    throw new Error("Parent task not found");
  }

  const parentChanged = (task.parentTaskId ?? null) !== nextParentId;
  const siblingOrder = parentChanged ? nextSiblingOrder(activeTasks.filter((entry) => entry.id !== task.id && !descendants.has(entry.id)), nextParentId) : task.siblingOrder;

  const updatedTask = await taskRepository.updateTask(task.id, {
    ...input,
    parentTaskId: nextParentId,
    rootTaskId: parent ? parent.rootTaskId : task.id,
    depth: parent ? parent.depth + 1 : 0,
    siblingOrder,
  });

  await syncDescendantHierarchy(activeTasks, { ...task, ...updatedTask });
  return updatedTask;
}

async function syncDescendantHierarchy(tasks: TaskRecord[], rootTask: TaskRecord) {
  const childrenByParent = groupChildren(tasks.filter((task) => task.id !== rootTask.id));

  const visit = async (parent: TaskRecord) => {
    const children = sortByTaskNumber(childrenByParent.get(parent.id) ?? []);

    for (const child of children) {
      const updatedChild = await taskRepository.updateTask(child.id, {
        rootTaskId: parent.rootTaskId,
        depth: parent.depth + 1,
      });

      await visit({ ...child, ...updatedChild });
    }
  };

  await visit(rootTask);
}

function sanitizeTaskUpdate(input: UpdateTaskInput): UpdateTaskInput {
  const next: UpdateTaskInput = {};

  if (typeof input.dueDate === "string") next.dueDate = normalizeDate(input.dueDate);
  if (typeof input.category === "string") next.category = normalizeText(input.category);
  if (typeof input.requester === "string") next.requester = normalizeText(input.requester);
  if (typeof input.assignee === "string") next.assignee = normalizeText(input.assignee);
  if (typeof input.title === "string") next.title = normalizeRequiredText(input.title, "title");
  if (typeof input.createdAt === "string") next.createdAt = normalizeStoredDate(input.createdAt);
  if (typeof input.description === "string") next.description = normalizeText(input.description);
  if (typeof input.progressNote === "string") next.progressNote = normalizeText(input.progressNote);
  if (typeof input.conclusion === "string") next.conclusion = normalizeText(input.conclusion);
  if (typeof input.fileMemo === "string") next.fileMemo = normalizeText(input.fileMemo);
  if (typeof input.isDaily === "boolean") next.isDaily = input.isDaily;
  if (typeof input.deletedAt === "string" || input.deletedAt === null) next.deletedAt = input.deletedAt;
  if (typeof input.rootTaskId === "string") next.rootTaskId = normalizeText(input.rootTaskId);
  if (typeof input.depth === "number") next.depth = Math.max(0, Math.trunc(input.depth));
  if (typeof input.siblingOrder === "number") next.siblingOrder = Math.max(0, Math.trunc(input.siblingOrder));

  if (typeof input.status === "string" && taskStatusSet.has(input.status as TaskStatus)) {
    next.status = input.status as TaskStatus;
  }

  return next;
}

function resolveParentTaskId(tasks: TaskRecord[], parentTaskId?: string | null, parentTaskNumber?: string | null) {
  const normalizedNumber = normalizeTaskNumberInput(parentTaskNumber);

  if (normalizedNumber === null) {
    return null;
  }

  if (normalizedNumber) {
    const parent = tasks.find((task) => task.taskNumber === normalizedNumber);
    if (!parent) {
      throw new Error("Parent task number not found");
    }
    return parent.id;
  }

  if (typeof parentTaskId === "string") {
    const normalizedId = normalizeText(parentTaskId);
    if (!normalizedId) return null;

    const parent = tasks.find((task) => task.id === normalizedId);
    if (!parent) {
      throw new Error("Parent task not found");
    }
    return parent.id;
  }

  return parentTaskId === null ? null : null;
}

function normalizeTaskNumberInput(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return "";
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (/^#\d+$/.test(normalized)) {
    return normalized;
  }

  if (/^\d+$/.test(normalized)) {
    return `#${normalized}`;
  }

  throw new Error("Parent task number format is invalid");
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

function normalizeStoredDate(value?: string | null) {
  return normalizeDate(value ?? new Date().toISOString());
}

async function listAllTasks() {
  const [activeTasks, trashTasks] = await Promise.all([taskRepository.listActiveTasks(), taskRepository.listTrashTasks()]);
  return [...activeTasks, ...trashTasks];
}

function flattenTaskTree(tasks: TaskRecord[]) {
  const byParent = groupChildren(tasks);
  const roots = sortByTaskNumber(byParent.get(null) ?? []);
  const ordered: TaskRecord[] = [];

  const visit = (task: TaskRecord) => {
    ordered.push(task);

    for (const child of sortByTaskNumber(byParent.get(task.id) ?? [])) {
      visit(child);
    }
  };

  for (const task of roots) {
    visit(task);
  }

  return ordered;
}

function sortTrashTasks(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
}

function collectSubtree(tasks: TaskRecord[], rootTaskId: string) {
  const byParent = groupChildren(tasks);
  const root = tasks.find((task) => task.id === rootTaskId);

  if (!root) {
    return [];
  }

  const ordered: TaskRecord[] = [];
  const visit = (task: TaskRecord) => {
    ordered.push(task);

    for (const child of sortByTaskNumber(byParent.get(task.id) ?? [])) {
      visit(child);
    }
  };

  visit(root);
  return ordered;
}

function collectDescendantIds(tasks: TaskRecord[], rootTaskId: string) {
  const byParent = groupChildren(tasks);
  const ids: string[] = [];

  const visit = (taskId: string) => {
    for (const child of byParent.get(taskId) ?? []) {
      ids.push(child.id);
      visit(child.id);
    }
  };

  visit(rootTaskId);
  return ids;
}

function nextSiblingOrder(tasks: TaskRecord[], parentTaskId: string | null) {
  const siblingOrders = tasks.filter((task) => (task.parentTaskId ?? null) === parentTaskId).map((task) => task.siblingOrder);
  return siblingOrders.length === 0 ? 0 : Math.max(...siblingOrders) + 1;
}

function groupChildren(tasks: TaskRecord[]) {
  return tasks.reduce<Map<string | null, TaskRecord[]>>((acc, task) => {
    const parentKey = task.parentTaskId ?? null;
    const next = acc.get(parentKey) ?? [];
    next.push(task);
    acc.set(parentKey, next);
    return acc;
  }, new Map<string | null, TaskRecord[]>());
}

function sortByTaskNumber(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const numberCompare = taskNumberValue(left.taskNumber) - taskNumberValue(right.taskNumber);
    if (numberCompare !== 0) return numberCompare;

    return left.createdAt.localeCompare(right.createdAt);
  });
}

function taskNumberValue(taskNumber: string) {
  const match = /^#(\d+)$/.exec(taskNumber) ?? /^MIL-(\d+)$/.exec(taskNumber);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}