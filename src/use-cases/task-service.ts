import type { TaskRecord, TaskStatus } from "@/domains/task/types";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { fileRepository, projectRepository, taskRepository } from "@/repositories";
import type { CreateTaskInput, UpdateTaskInput } from "@/repositories/contracts";

export type TaskScope = "active" | "trash";

type UpdateTaskCommand = UpdateTaskInput & { version?: number };

const taskStatusSet = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

export async function listTasks(scope: TaskScope) {
  const project = await projectRepository.getProject();
  const tasks =
    scope === "trash"
      ? await taskRepository.listTrashTasks(project.id)
      : await taskRepository.listActiveTasks(project.id);
  return scope === "trash" ? sortTrashTasks(tasks) : flattenTaskTree(tasks);
}

export async function createTask(input: Omit<CreateTaskInput, "projectId">, userId?: string | null) {
  const project = await projectRepository.getProject();
  const activeTasks = await taskRepository.listActiveTasks(project.id);
  const parentTaskId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
  const parent = parentTaskId ? activeTasks.find((task) => task.id === parentTaskId) ?? null : null;
  const status = normalizeStatus(input.status);

  return taskRepository.createTask({
    projectId: project.id,
    dueDate: normalizeDate(input.dueDate),
    workType: normalizeText(input.workType),
    coordinationScope: normalizeText(input.coordinationScope),
    ownerDiscipline: normalizeText(input.ownerDiscipline),
    requestedBy: normalizeText(input.requestedBy),
    relatedDisciplines: normalizeText(input.relatedDisciplines),
    assignee: normalizeText(input.assignee),
    issueTitle: normalizeRequiredText(input.issueTitle, "issueTitle"),
    reviewedAt: normalizeDate(input.reviewedAt ?? ""),
    createdAt: normalizeStoredDate(input.createdAt),
    isDaily: Boolean(input.isDaily),
    locationRef: normalizeText(input.locationRef),
    calendarLinked: Boolean(input.calendarLinked),
    issueDetailNote: normalizeText(input.issueDetailNote),
    status,
    statusHistory: buildInitialStatusHistory(status),
    decision: normalizeText(input.decision),
    completedAt: status === "done" ? nowIso() : null,
    parentTaskId,
    rootTaskId: parent ? parent.rootTaskId : undefined,
    depth: parent ? parent.depth + 1 : 0,
    siblingOrder: nextSiblingOrder(activeTasks, parentTaskId),
    createdBy: userId ?? null,
    updatedBy: userId ?? null,
  });
}

export async function updateTask(taskId: string, input: UpdateTaskCommand, userId?: string | null) {
  const project = await projectRepository.getProject();
  const activeTasks = await taskRepository.listActiveTasks(project.id);
  const currentTask = activeTasks.find((task) => task.id === taskId);

  if (!currentTask) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  const expectedVersion = Number(input.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw badRequest("version is required", "TASK_VERSION_REQUIRED");
  }

  const sanitized = sanitizeTaskUpdate(input);
  applyStatusSideEffects(currentTask, sanitized);

  if (
    Object.prototype.hasOwnProperty.call(input, "parentTaskNumber") ||
    Object.prototype.hasOwnProperty.call(input, "parentTaskId")
  ) {
    const nextParentId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
    return reparentTask(currentTask, nextParentId, sanitized, activeTasks, expectedVersion, userId ?? null);
  }

  const updated = await taskRepository.updateTaskWithVersion(taskId, {
    ...sanitized,
    expectedVersion,
    updatedBy: userId ?? null,
  });

  if (updated) {
    return updated;
  }

  const latest = await taskRepository.findTaskById(taskId);
  if (!latest) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  throw conflict(
    "Another user updated this task first. Reload the latest data and try again.",
    "TASK_VERSION_CONFLICT",
  );
}

export async function moveTaskToTrash(taskId: string, userId?: string | null) {
  const allTasks = await listAllTasks();
  const subtree = collectSubtree(allTasks, taskId);

  if (subtree.length === 0) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  let updatedRoot = subtree[0];

  for (const task of subtree) {
    const updatedTask = await taskRepository.moveTaskToTrash(task.id, userId ?? null);
    await fileRepository.moveFilesToTrashByTask(task.id);

    if (task.id === taskId) {
      updatedRoot = updatedTask;
    }
  }

  return updatedRoot;
}

export async function restoreTask(taskId: string, userId?: string | null) {
  const allTasks = await listAllTasks();
  const subtree = collectSubtree(allTasks, taskId);

  if (subtree.length === 0) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  const target = subtree[0];
  const subtreeIds = new Set(subtree.map((task) => task.id));
  const currentParent = target.parentTaskId ? allTasks.find((task) => task.id === target.parentTaskId) ?? null : null;
  const shouldDetach = Boolean(currentParent?.deletedAt && !subtreeIds.has(currentParent.id));

  let restoredRoot = await taskRepository.restoreTask(target.id, userId ?? null);
  await fileRepository.restoreFilesByTask(target.id);

  if (shouldDetach) {
    restoredRoot = await taskRepository.updateTask(target.id, {
      parentTaskId: null,
      rootTaskId: target.id,
      depth: 0,
      updatedBy: userId ?? null,
    });
  }

  const byId = new Map(allTasks.map((task) => [task.id, task]));
  byId.set(restoredRoot.id, { ...target, ...restoredRoot, deletedAt: null });

  for (const task of subtree.slice(1)) {
    await taskRepository.restoreTask(task.id, userId ?? null);
    await fileRepository.restoreFilesByTask(task.id);

    const parent = byId.get(task.parentTaskId ?? "") ?? null;
    const updated = await taskRepository.updateTask(task.id, {
      rootTaskId: parent ? parent.rootTaskId : task.id,
      depth: parent ? parent.depth + 1 : 0,
      deletedAt: null,
      updatedBy: userId ?? null,
    });

    byId.set(task.id, { ...task, ...updated, deletedAt: null });
  }

  return restoredRoot;
}

async function reparentTask(
  task: TaskRecord,
  nextParentId: string | null,
  input: UpdateTaskInput,
  activeTasks: TaskRecord[],
  expectedVersion: number,
  userId: string | null,
) {
  const descendants = new Set(collectDescendantIds(activeTasks, task.id));

  if (nextParentId === task.id || (nextParentId && descendants.has(nextParentId))) {
    throw badRequest("Invalid parent task", "INVALID_PARENT_TASK");
  }

  const parent = nextParentId ? activeTasks.find((entry) => entry.id === nextParentId) ?? null : null;
  if (nextParentId && !parent) {
    throw notFound("Parent task not found", "PARENT_TASK_NOT_FOUND");
  }

  const parentChanged = (task.parentTaskId ?? null) !== nextParentId;
  const siblingOrder = parentChanged
    ? nextSiblingOrder(
        activeTasks.filter((entry) => entry.id !== task.id && !descendants.has(entry.id)),
        nextParentId,
      )
    : task.siblingOrder;

  const updatedTask = await taskRepository.updateTaskWithVersion(task.id, {
    ...input,
    parentTaskId: nextParentId,
    rootTaskId: parent ? parent.rootTaskId : task.id,
    depth: parent ? parent.depth + 1 : 0,
    siblingOrder,
    expectedVersion,
    updatedBy: userId,
  });

  if (!updatedTask) {
    const latest = await taskRepository.findTaskById(task.id);
    if (!latest) {
      throw notFound("Task not found", "TASK_NOT_FOUND");
    }

    throw conflict(
      "Another user updated this task first. Reload the latest data and try again.",
      "TASK_VERSION_CONFLICT",
    );
  }

  await syncDescendantHierarchy(activeTasks, updatedTask, userId);
  return updatedTask;
}

async function syncDescendantHierarchy(tasks: TaskRecord[], rootTask: TaskRecord, userId: string | null) {
  const childrenByParent = groupChildren(tasks.filter((task) => task.id !== rootTask.id));

  const visit = async (parent: TaskRecord) => {
    const children = sortByActionId(childrenByParent.get(parent.id) ?? []);

    for (const child of children) {
      const updatedChild = await taskRepository.updateTask(child.id, {
        rootTaskId: parent.rootTaskId,
        depth: parent.depth + 1,
        updatedBy: userId,
      });

      await visit({ ...child, ...updatedChild });
    }
  };

  await visit(rootTask);
}

function sanitizeTaskUpdate(input: UpdateTaskInput): UpdateTaskInput {
  const next: UpdateTaskInput = {};

  if (typeof input.dueDate === "string") next.dueDate = normalizeDate(input.dueDate);
  if (typeof input.workType === "string") next.workType = normalizeText(input.workType);
  if (typeof input.coordinationScope === "string") next.coordinationScope = normalizeText(input.coordinationScope);
  if (typeof input.ownerDiscipline === "string") next.ownerDiscipline = normalizeText(input.ownerDiscipline);
  if (typeof input.requestedBy === "string") next.requestedBy = normalizeText(input.requestedBy);
  if (typeof input.relatedDisciplines === "string") next.relatedDisciplines = normalizeText(input.relatedDisciplines);
  if (typeof input.assignee === "string") next.assignee = normalizeText(input.assignee);
  if (typeof input.issueTitle === "string") next.issueTitle = normalizeRequiredText(input.issueTitle, "issueTitle");
  if (typeof input.reviewedAt === "string") next.reviewedAt = normalizeDate(input.reviewedAt);
  if (typeof input.locationRef === "string") next.locationRef = normalizeText(input.locationRef);
  if (typeof input.calendarLinked === "boolean") next.calendarLinked = input.calendarLinked;
  if (typeof input.issueDetailNote === "string") next.issueDetailNote = normalizeText(input.issueDetailNote);
  if (typeof input.decision === "string") next.decision = normalizeText(input.decision);
  if (typeof input.isDaily === "boolean") next.isDaily = input.isDaily;
  if (typeof input.deletedAt === "string" || input.deletedAt === null) next.deletedAt = input.deletedAt;
  if (typeof input.rootTaskId === "string") next.rootTaskId = normalizeText(input.rootTaskId);
  if (typeof input.depth === "number") next.depth = Math.max(0, Math.trunc(input.depth));
  if (typeof input.siblingOrder === "number") next.siblingOrder = Math.max(0, Math.trunc(input.siblingOrder));

  if (typeof input.status === "string") {
    next.status = normalizeStatus(input.status);
  }

  return next;
}

function applyStatusSideEffects(currentTask: TaskRecord, next: UpdateTaskInput) {
  const nextStatus = next.status ?? currentTask.status;
  if (nextStatus !== currentTask.status) {
    next.statusHistory = appendStatusHistory(currentTask.statusHistory, nextStatus);
  }

  if (nextStatus === "done") {
    next.completedAt = currentTask.status === "done" ? currentTask.completedAt : nowIso();
    return;
  }

  if (currentTask.status === "done") {
    next.completedAt = null;
  }
}

function buildInitialStatusHistory(status: TaskStatus) {
  return `${nowIso()} - ${status}`;
}

function appendStatusHistory(current: string, nextStatus: TaskStatus) {
  const entry = `${nowIso()} - ${nextStatus}`;
  return current ? `${current}\n${entry}` : entry;
}

function resolveParentTaskId(tasks: TaskRecord[], parentTaskId?: string | null, parentTaskNumber?: string | null) {
  const normalizedNumber = normalizeTaskNumberInput(parentTaskNumber);

  if (normalizedNumber === null) {
    return null;
  }

  if (typeof normalizedNumber === "number") {
    const parent = tasks.find((task) => task.actionId === normalizedNumber);
    if (!parent) {
      throw notFound("Parent action_id not found", "PARENT_TASK_NOT_FOUND");
    }
    return parent.id;
  }

  if (typeof parentTaskId === "string") {
    const normalizedId = normalizeText(parentTaskId);
    if (!normalizedId) return null;

    const parent = tasks.find((task) => task.id === normalizedId);
    if (!parent) {
      throw notFound("Parent task not found", "PARENT_TASK_NOT_FOUND");
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
    return undefined;
  }

  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  if (/^#\d+$/.test(normalized)) {
    return Number(normalized.slice(1));
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  throw badRequest("Parent action_id format is invalid", "PARENT_TASK_NUMBER_INVALID");
}

function normalizeRequiredText(value: string, fieldName: string) {
  const normalized = normalizeText(value);

  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
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

function normalizeStatus(value: string | TaskStatus) {
  if (!taskStatusSet.has(value as TaskStatus)) {
    throw badRequest("status is invalid", "TASK_STATUS_INVALID");
  }

  return value as TaskStatus;
}

function nowIso() {
  return new Date().toISOString();
}

async function listAllTasks() {
  const project = await projectRepository.getProject();
  const [activeTasks, trashTasks] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    taskRepository.listTrashTasks(project.id),
  ]);
  return [...activeTasks, ...trashTasks];
}

function flattenTaskTree(tasks: TaskRecord[]) {
  const byParent = groupChildren(tasks);
  const roots = sortByActionId(byParent.get(null) ?? []);
  const ordered: TaskRecord[] = [];

  const visit = (task: TaskRecord) => {
    ordered.push(task);

    for (const child of sortByActionId(byParent.get(task.id) ?? [])) {
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

    for (const child of sortByActionId(byParent.get(task.id) ?? [])) {
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
  const siblingOrders = tasks
    .filter((task) => (task.parentTaskId ?? null) === parentTaskId)
    .map((task) => task.siblingOrder);
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

function sortByActionId(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const numberCompare = left.actionId - right.actionId;
    if (numberCompare !== 0) return numberCompare;
    return left.createdAt.localeCompare(right.createdAt);
  });
}
