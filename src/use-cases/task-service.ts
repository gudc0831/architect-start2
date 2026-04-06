import type { AdminFoundationSettings } from "@/domains/admin/foundation-settings";
import type { TaskRecord, TaskStatus } from "@/domains/task/types";
import {
  normalizeTaskCategoryFieldValue,
  resolvePatchedTaskCategoryFieldValue,
} from "@/domains/admin/task-category-values";
import {
  canonicalizeTaskStatusHistory,
  createTaskStatusHistoryEntry,
  DEFAULT_TASK_STATUS,
  isCompatibleTaskStatus,
  normalizeTaskStatus,
} from "@/domains/task/status";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { requireAllowedWorkType, resolvePatchedWorkType } from "@/lib/task-work-type-write";
import {
  buildSiblingOrderUpdates,
  compareTasksBySiblingOrder,
  groupTasksByNormalizedParent,
  type TaskOrderingStrategy,
  type TaskReorderCommand,
} from "@/domains/task/ordering";
import { adminRepository } from "@/repositories/admin";
import { fileRepository, taskRepository } from "@/repositories";
import type { CreateTaskInput, UpdateTaskInput } from "@/repositories/contracts";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";
import { permanentlyDeleteTrashSelection } from "@/use-cases/trash-service";

export type TaskScope = "active" | "trash";

type UpdateTaskCommand = UpdateTaskInput & { version?: number };
type EffectiveTaskCategories = {
  workType: Awaited<ReturnType<typeof adminRepository.listEffectiveWorkTypeDefinitions>>;
  coordinationScope: Awaited<ReturnType<typeof adminRepository.listEffectiveTaskCategoryDefinitions>>;
  requestedBy: Awaited<ReturnType<typeof adminRepository.listEffectiveTaskCategoryDefinitions>>;
  relatedDisciplines: Awaited<ReturnType<typeof adminRepository.listEffectiveTaskCategoryDefinitions>>;
  locationRef: Awaited<ReturnType<typeof adminRepository.listEffectiveTaskCategoryDefinitions>>;
};

export async function listTasks(scope: TaskScope) {
  const project = await getSelectedTaskProject();
  const [tasks, foundationSettings] = await Promise.all([
    scope === "trash"
      ? taskRepository.listTrashTasks(project.id)
      : taskRepository.listActiveTasks(project.id),
    loadAdminFoundationSettings(),
  ]);
  const orderedTasks = scope === "trash" ? sortTrashTasks(tasks) : flattenTaskTree(tasks);
  return applyFoundationSettingsToTasks(orderedTasks, foundationSettings);
}

export async function reorderTasks(command: TaskReorderCommand, userId?: string | null): Promise<TaskRecord[]> {
  const project = await getSelectedTaskProject();
  const activeTasks = await taskRepository.listActiveTasks(project.id);
  const foundationSettings = await loadAdminFoundationSettings();

  switch (command.action) {
    case "manual_move":
      await reorderTaskWithinParent(activeTasks, command.movedTaskId, command.targetParentTaskId, command.targetIndex, userId ?? null);
      break;
    case "auto_sort":
      await reorderTaskTree(activeTasks, command.strategy, userId ?? null);
      break;
    default:
      throw badRequest("Unsupported reorder action", "TASK_REORDER_ACTION_INVALID");
  }

  const nextTasks = await taskRepository.listActiveTasks(project.id);
  return applyFoundationSettingsToTasks(flattenTaskTree(nextTasks), foundationSettings);
}

export async function createTask(input: Omit<CreateTaskInput, "projectId" | "projectName">, userId?: string | null) {
  const project = await getSelectedTaskProject();
  const activeTasks = await taskRepository.listActiveTasks(project.id);
  const [effectiveCategories, foundationSettings] = await Promise.all([
    loadEffectiveTaskCategories(project.id),
    loadAdminFoundationSettings(),
  ]);
  const parentTaskId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
  const parent = parentTaskId ? activeTasks.find((task) => task.id === parentTaskId) ?? null : null;
  const status = normalizeStatus(input.status);

  const task = await taskRepository.createTask({
    projectId: project.id,
    projectName: project.name,
    dueDate: normalizeDate(input.dueDate),
    workType: requireAllowedWorkType(input.workType, effectiveCategories.workType),
    coordinationScope: normalizeTaskCategoryFieldValue(
      "coordinationScope",
      input.coordinationScope,
      effectiveCategories.coordinationScope,
      { allowLegacyTextWhenDefinitionsMissing: true },
    ),
    ownerDiscipline: foundationSettings.ownerDiscipline,
    requestedBy: normalizeTaskCategoryFieldValue(
      "requestedBy",
      input.requestedBy,
      effectiveCategories.requestedBy,
      { allowLegacyTextWhenDefinitionsMissing: true },
    ),
    relatedDisciplines: normalizeTaskCategoryFieldValue(
      "relatedDisciplines",
      input.relatedDisciplines,
      effectiveCategories.relatedDisciplines,
      { allowLegacyTextWhenDefinitionsMissing: true },
    ),
    assignee: normalizeText(input.assignee),
    issueTitle: normalizeRequiredText(input.issueTitle, "issueTitle"),
    reviewedAt: normalizeDate(input.reviewedAt ?? ""),
    createdAt: normalizeStoredDate(input.createdAt),
    isDaily: Boolean(input.isDaily),
    locationRef: normalizeTaskCategoryFieldValue(
      "locationRef",
      input.locationRef,
      effectiveCategories.locationRef,
      { allowLegacyTextWhenDefinitionsMissing: true },
    ),
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

  return applyFoundationSettingsToTask(task, foundationSettings);
}

async function reorderTaskWithinParent(
  activeTasks: TaskRecord[],
  movedTaskId: string,
  targetParentTaskId: string | null,
  targetIndex: number,
  userId: string | null,
): Promise<TaskRecord[]> {
  const movedTask = activeTasks.find((task) => task.id === movedTaskId);
  if (!movedTask) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  const currentParentTaskId = movedTask.parentTaskId ?? null;
  const normalizedTargetParentTaskId = targetParentTaskId ?? null;
  if (currentParentTaskId !== normalizedTargetParentTaskId) {
    throw badRequest("Cross-parent moves are not supported", "INVALID_PARENT_TASK");
  }

  if (!Number.isInteger(targetIndex) || targetIndex < 0) {
    throw badRequest("targetIndex is invalid", "TASK_REORDER_TARGET_INDEX_INVALID");
  }

  const siblings = activeTasks
    .filter((task) => (task.parentTaskId ?? null) === currentParentTaskId)
    .sort(compareTasksBySiblingOrder);
  const currentIndex = siblings.findIndex((task) => task.id === movedTaskId);

  if (currentIndex === -1) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  const nextSiblings = siblings.filter((task) => task.id !== movedTaskId);
  const normalizedInsertionIndex = targetIndex > currentIndex ? targetIndex - 1 : targetIndex;
  const insertionIndex = Math.min(normalizedInsertionIndex, nextSiblings.length);
  nextSiblings.splice(insertionIndex, 0, movedTask);

  return taskRepository.updateTaskOrders(
    nextSiblings.map((task, siblingOrder) => ({
      id: task.id,
      siblingOrder,
      updatedBy: userId,
    })),
  );
}

async function reorderTaskTree(activeTasks: TaskRecord[], strategy: TaskOrderingStrategy, userId: string | null): Promise<TaskRecord[]> {
  const updates = buildSiblingOrderUpdates(activeTasks, strategy).map((input) => ({
    ...input,
    updatedBy: userId,
  }));

  return taskRepository.updateTaskOrders(updates);
}

export async function updateTask(taskId: string, input: UpdateTaskCommand, userId?: string | null) {
  const project = await getSelectedTaskProject();
  const activeTasks = await taskRepository.listActiveTasks(project.id);
  const currentTask = activeTasks.find((task) => task.id === taskId);

  if (!currentTask) {
    throw notFound("Task not found", "TASK_NOT_FOUND");
  }

  const expectedVersion = Number(input.version);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    throw badRequest("version is required", "TASK_VERSION_REQUIRED");
  }

  const [effectiveCategories, foundationSettings] = await Promise.all([
    loadEffectiveTaskCategories(currentTask.projectId),
    loadAdminFoundationSettings(),
  ]);
  const sanitized = sanitizeTaskUpdate(input, currentTask, effectiveCategories);
  sanitized.ownerDiscipline = foundationSettings.ownerDiscipline;
  applyStatusSideEffects(currentTask, sanitized);

  if (
    Object.prototype.hasOwnProperty.call(input, "parentTaskNumber") ||
    Object.prototype.hasOwnProperty.call(input, "parentTaskId")
  ) {
    const nextParentId = resolveParentTaskId(activeTasks, input.parentTaskId, input.parentTaskNumber);
    const task = await reparentTask(currentTask, nextParentId, sanitized, activeTasks, expectedVersion, userId ?? null);
    return applyFoundationSettingsToTask(task, foundationSettings);
  }

  const updated = await taskRepository.updateTaskWithVersion(taskId, {
    ...sanitized,
    expectedVersion,
    updatedBy: userId ?? null,
  });

  if (updated) {
    return applyFoundationSettingsToTask(updated, foundationSettings);
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
  const foundationSettings = await loadAdminFoundationSettings();

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

  return applyFoundationSettingsToTask(updatedRoot, foundationSettings);
}

export async function restoreTask(taskId: string, userId?: string | null) {
  const allTasks = await listAllTasks();
  const subtree = collectSubtree(allTasks, taskId);
  const foundationSettings = await loadAdminFoundationSettings();

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

  return applyFoundationSettingsToTask(restoredRoot, foundationSettings);
}

export async function permanentlyDeleteTask(taskId: string, userId?: string | null) {
  await permanentlyDeleteTrashSelection({ taskIds: [taskId] }, userId);
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
  const childrenByParent = groupTasksByNormalizedParent(tasks.filter((task) => task.id !== rootTask.id));

  const visit = async (parent: TaskRecord) => {
    const children = [...(childrenByParent.get(parent.id) ?? [])].sort(compareTasksBySiblingOrder);

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

function sanitizeTaskUpdate(
  input: UpdateTaskInput,
  currentTask: TaskRecord,
  effectiveCategories: EffectiveTaskCategories,
): UpdateTaskInput {
  const next: UpdateTaskInput = {};

  if (typeof input.dueDate === "string") next.dueDate = normalizeDate(input.dueDate);
  if (Object.prototype.hasOwnProperty.call(input, "workType")) {
    const normalizedWorkType = resolvePatchedWorkType(input.workType, {
      currentValue: currentTask.workType,
      allowedCodes: effectiveCategories.workType,
    });
    if (normalizedWorkType !== undefined) {
      next.workType = normalizedWorkType;
    }
  }
  if (typeof input.coordinationScope === "string") {
    next.coordinationScope = resolvePatchedTaskCategoryFieldValue(
      "coordinationScope",
      input.coordinationScope,
      effectiveCategories.coordinationScope,
      { allowLegacyTextWhenDefinitionsMissing: true },
    );
  }
  if (typeof input.requestedBy === "string") {
    next.requestedBy = resolvePatchedTaskCategoryFieldValue(
      "requestedBy",
      input.requestedBy,
      effectiveCategories.requestedBy,
      { allowLegacyTextWhenDefinitionsMissing: true },
    );
  }
  if (typeof input.relatedDisciplines === "string") {
    next.relatedDisciplines = resolvePatchedTaskCategoryFieldValue(
      "relatedDisciplines",
      input.relatedDisciplines,
      effectiveCategories.relatedDisciplines,
      { allowLegacyTextWhenDefinitionsMissing: true },
    );
  }
  if (typeof input.assignee === "string") next.assignee = normalizeText(input.assignee);
  if (typeof input.issueTitle === "string") next.issueTitle = normalizeRequiredText(input.issueTitle, "issueTitle");
  if (typeof input.reviewedAt === "string") next.reviewedAt = normalizeDate(input.reviewedAt);
  if (typeof input.locationRef === "string") {
    next.locationRef = resolvePatchedTaskCategoryFieldValue(
      "locationRef",
      input.locationRef,
      effectiveCategories.locationRef,
      { allowLegacyTextWhenDefinitionsMissing: true },
    );
  }
  if (typeof input.calendarLinked === "boolean") next.calendarLinked = input.calendarLinked;
  if (typeof input.issueDetailNote === "string") next.issueDetailNote = normalizeText(input.issueDetailNote);
  if (typeof input.decision === "string") next.decision = normalizeText(input.decision);
  if (typeof input.isDaily === "boolean") next.isDaily = input.isDaily;
  if (typeof input.deletedAt === "string" || input.deletedAt === null) next.deletedAt = input.deletedAt;

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
  return createTaskStatusHistoryEntry(nowIso(), status);
}

function appendStatusHistory(current: string, nextStatus: TaskStatus) {
  const entry = createTaskStatusHistoryEntry(nowIso(), nextStatus);
  const normalizedCurrent = canonicalizeTaskStatusHistory(current, nextStatus);
  return normalizedCurrent ? `${normalizedCurrent}\n${entry}` : entry;
}

function resolveParentTaskId(tasks: TaskRecord[], parentTaskId?: string | null, parentTaskNumber?: string | null) {
  const normalizedReference = normalizeTaskNumberInput(parentTaskNumber);

  if (normalizedReference === null) {
    return null;
  }

  if (typeof normalizedReference === "number") {
    const parent = tasks.find((task) => task.actionId === normalizedReference);
    if (!parent) {
      throw notFound("Parent action_id not found", "PARENT_TASK_NOT_FOUND");
    }
    return parent.id;
  }

  if (typeof normalizedReference === "string") {
    const parentByIssueId = tasks.find((task) => task.issueId.trim().toLowerCase() === normalizedReference.toLowerCase());
    if (parentByIssueId) {
      return parentByIssueId.id;
    }

    const parentById = tasks.find((task) => task.id === normalizedReference);
    if (parentById) {
      return parentById.id;
    }

    throw notFound("Parent task not found", "PARENT_TASK_NOT_FOUND");
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

  return normalized.toUpperCase();
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
  if (!isCompatibleTaskStatus(value)) {
    throw badRequest("status is invalid", "TASK_STATUS_INVALID");
  }

  return normalizeTaskStatus(value, DEFAULT_TASK_STATUS);
}

function nowIso() {
  return new Date().toISOString();
}

async function loadAdminFoundationSettings() {
  return adminRepository.getFoundationSettings();
}

async function loadEffectiveTaskCategories(projectId: string): Promise<EffectiveTaskCategories> {
  const [workType, coordinationScope, requestedBy, relatedDisciplines, locationRef] = await Promise.all([
    adminRepository.listEffectiveWorkTypeDefinitions(projectId),
    adminRepository.listEffectiveTaskCategoryDefinitions(projectId, "coordinationScope"),
    adminRepository.listEffectiveTaskCategoryDefinitions(projectId, "requestedBy"),
    adminRepository.listEffectiveTaskCategoryDefinitions(projectId, "relatedDisciplines"),
    adminRepository.listEffectiveTaskCategoryDefinitions(projectId, "locationRef"),
  ]);

  return {
    workType,
    coordinationScope,
    requestedBy,
    relatedDisciplines,
    locationRef,
  };
}

async function listAllTasks() {
  const project = await getSelectedTaskProject();
  const [activeTasks, trashTasks] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    taskRepository.listTrashTasks(project.id),
  ]);
  return [...activeTasks, ...trashTasks];
}

function flattenTaskTree(tasks: TaskRecord[]) {
  const byParent = groupTasksByNormalizedParent(tasks);
  const roots = [...(byParent.get(null) ?? [])].sort(compareTasksBySiblingOrder);
  const ordered: TaskRecord[] = [];
  const visited = new Set<string>();

  const visit = (task: TaskRecord) => {
    if (visited.has(task.id)) {
      return;
    }

    visited.add(task.id);
    ordered.push(task);

    for (const child of [...(byParent.get(task.id) ?? [])].sort(compareTasksBySiblingOrder)) {
      visit(child);
    }
  };

  for (const task of roots) {
    visit(task);
  }

  const remaining = [...tasks.filter((task) => !visited.has(task.id))].sort(compareTasksBySiblingOrder);
  for (const task of remaining) {
    visit(task);
  }

  return ordered;
}

function applyFoundationSettingsToTask(task: TaskRecord, foundationSettings: AdminFoundationSettings) {
  return {
    ...task,
    ownerDiscipline: foundationSettings.ownerDiscipline,
  };
}

function applyFoundationSettingsToTasks(tasks: TaskRecord[], foundationSettings: AdminFoundationSettings) {
  return tasks.map((task) => applyFoundationSettingsToTask(task, foundationSettings));
}

function sortTrashTasks(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
}

function collectSubtree(tasks: TaskRecord[], rootTaskId: string) {
  const byParent = groupTasksByNormalizedParent(tasks);
  const root = tasks.find((task) => task.id === rootTaskId);

  if (!root) {
    return [];
  }

  const ordered: TaskRecord[] = [];
  const visit = (task: TaskRecord) => {
    ordered.push(task);

    for (const child of [...(byParent.get(task.id) ?? [])].sort(compareTasksBySiblingOrder)) {
      visit(child);
    }
  };

  visit(root);
  return ordered;
}

function collectDescendantIds(tasks: TaskRecord[], rootTaskId: string) {
  const byParent = groupTasksByNormalizedParent(tasks);
  const ids: string[] = [];

  const visit = (taskId: string) => {
    for (const child of [...(byParent.get(taskId) ?? [])].sort(compareTasksBySiblingOrder)) {
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
