import type { TaskRecord } from "@/domains/task/types";

export type TaskOrderingStrategy = "priority" | "action_id";

export type TaskReorderManualMoveCommand = {
  action: "manual_move";
  movedTaskId: string;
  targetParentTaskId: string | null;
  targetIndex: number;
  expectedVersions: Record<string, number>;
};

export type TaskReorderAutoSortCommand = {
  action: "auto_sort";
  strategy: TaskOrderingStrategy;
  expectedVersions: Record<string, number>;
};

export type TaskReorderCommand = TaskReorderManualMoveCommand | TaskReorderAutoSortCommand;

type TaskPrioritySummary = {
  actionId: number;
  createdAt: string;
  dueDate: string | null;
  id: string;
  rank: number;
};

const DUE_SOON_WINDOW_DAYS = 3;

export function groupTasksByNormalizedParent(tasks: readonly TaskRecord[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  return tasks.reduce<Map<string | null, TaskRecord[]>>((acc, task) => {
    const parentKey = task.parentTaskId && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
    const next = acc.get(parentKey) ?? [];
    next.push(task);
    acc.set(parentKey, next);
    return acc;
  }, new Map<string | null, TaskRecord[]>());
}

export function compareTasksBySiblingOrder(left: TaskRecord, right: TaskRecord) {
  const orderCompare = left.siblingOrder - right.siblingOrder;
  if (orderCompare !== 0) return orderCompare;

  const actionCompare = compareTasksByActionId(left, right);
  if (actionCompare !== 0) return actionCompare;

  return left.id.localeCompare(right.id);
}

export function sortTaskGroup(tasks: readonly TaskRecord[], strategy: TaskOrderingStrategy, todayKey = getTodayKey()) {
  const prioritySummaries = strategy === "priority" ? buildTaskPrioritySummaryMap(tasks, todayKey) : null;
  return [...tasks].sort((left, right) => compareTasksByStrategy(left, right, strategy, todayKey, prioritySummaries));
}

export function buildOrderedTaskTree(tasks: readonly TaskRecord[], strategy: TaskOrderingStrategy = "action_id") {
  const groups = groupTasksByNormalizedParent(tasks);
  const todayKey = getTodayKey();
  const prioritySummaries = strategy === "priority" ? buildTaskPrioritySummaryMap(tasks, todayKey) : null;
  const rows: TaskRecord[] = [];
  const visited = new Set<string>();

  const visit = (task: TaskRecord) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    rows.push(task);

    const children = [...(groups.get(task.id) ?? [])].sort((left, right) =>
      compareTasksByStrategy(left, right, strategy, todayKey, prioritySummaries),
    );
    for (const child of children) {
      visit(child);
    }
  };

  const roots = [...(groups.get(null) ?? [])].sort((left, right) =>
    compareTasksByStrategy(left, right, strategy, todayKey, prioritySummaries),
  );
  for (const root of roots) {
    visit(root);
  }

  const remaining = tasks
    .filter((task) => !visited.has(task.id))
    .sort((left, right) => compareTasksByStrategy(left, right, strategy, todayKey, prioritySummaries));
  for (const task of remaining) {
    visit(task);
  }

  return rows;
}

export function buildStoredOrderTaskTree(tasks: readonly TaskRecord[]) {
  const groups = groupTasksByNormalizedParent(tasks);
  const rows: TaskRecord[] = [];
  const visited = new Set<string>();

  const visit = (task: TaskRecord) => {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    rows.push(task);

    const children = [...(groups.get(task.id) ?? [])].sort(compareTasksBySiblingOrder);
    for (const child of children) {
      visit(child);
    }
  };

  const roots = [...(groups.get(null) ?? [])].sort(compareTasksBySiblingOrder);
  for (const root of roots) {
    visit(root);
  }

  const remaining = tasks.filter((task) => !visited.has(task.id)).sort(compareTasksBySiblingOrder);
  for (const task of remaining) {
    visit(task);
  }

  return rows;
}

export function buildSiblingOrderUpdates(tasks: readonly TaskRecord[], strategy: TaskOrderingStrategy) {
  const groups = groupTasksByNormalizedParent(tasks);
  const todayKey = getTodayKey();
  const prioritySummaries = strategy === "priority" ? buildTaskPrioritySummaryMap(tasks, todayKey) : null;
  const updates: Array<{ id: string; siblingOrder: number }> = [];

  const visit = (parentTaskId: string | null) => {
    const children = [...(groups.get(parentTaskId) ?? [])].sort((left, right) =>
      compareTasksByStrategy(left, right, strategy, todayKey, prioritySummaries),
    );
    children.forEach((child, siblingOrder) => {
      updates.push({ id: child.id, siblingOrder });
      visit(child.id);
    });
  };

  visit(null);
  return updates;
}

export function compareTasksByActionId(left: TaskRecord, right: TaskRecord) {
  const actionCompare = (left.actionId ?? left.taskNumber) - (right.actionId ?? right.taskNumber);
  if (actionCompare !== 0) return actionCompare;
  const createdCompare = left.createdAt.localeCompare(right.createdAt);
  if (createdCompare !== 0) return createdCompare;
  return left.id.localeCompare(right.id);
}

export function compareTasksByStrategy(
  left: TaskRecord,
  right: TaskRecord,
  strategy: TaskOrderingStrategy,
  todayKey = getTodayKey(),
  prioritySummaries?: ReadonlyMap<string, TaskPrioritySummary> | null,
) {
  if (strategy === "action_id") {
    return compareTasksByActionId(left, right);
  }

  const leftSummary = prioritySummaries?.get(left.id);
  const rightSummary = prioritySummaries?.get(right.id);

  const leftPriority = leftSummary?.rank ?? getPriorityRank(left, todayKey);
  const rightPriority = rightSummary?.rank ?? getPriorityRank(right, todayKey);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  const dueDateCompare = compareNullableIsoDates(leftSummary?.dueDate ?? left.dueDate, rightSummary?.dueDate ?? right.dueDate);
  if (dueDateCompare !== 0) {
    return dueDateCompare;
  }

  const actionCompare = compareTasksByActionId(left, right);
  if (actionCompare !== 0) {
    return actionCompare;
  }

  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function buildTaskPrioritySummaryMap(tasks: readonly TaskRecord[], todayKey: string) {
  const byParent = groupTasksByNormalizedParent(tasks);
  const cache = new Map<string, TaskPrioritySummary>();

  const visit = (task: TaskRecord): TaskPrioritySummary => {
    const cached = cache.get(task.id);
    if (cached) {
      return cached;
    }

    const childSummaries = (byParent.get(task.id) ?? []).map((child) => visit(child));
    const ownDueDate = normalizeIsoDate(task.dueDate) || null;
    const summary: TaskPrioritySummary = {
      actionId: task.actionId ?? task.taskNumber,
      createdAt: task.createdAt,
      dueDate: childSummaries.reduce<string | null>((earliest, childSummary) => minIsoDate(earliest, childSummary.dueDate), ownDueDate),
      id: task.id,
      rank: childSummaries.reduce<number>(
        (bestRank, childSummary) => Math.min(bestRank, childSummary.rank),
        getPriorityRank(task, todayKey),
      ),
    };

    cache.set(task.id, summary);
    return summary;
  };

  tasks.forEach((task) => {
    visit(task);
  });

  return cache;
}

function getPriorityRank(task: TaskRecord, todayKey: string) {
  if (task.status === "in_discussion") return 0;
  if (task.status === "done") return 6;

  if (task.dueDate && task.dueDate < todayKey) {
    return 1;
  }

  if (task.dueDate && task.dueDate <= addDaysIso(todayKey, DUE_SOON_WINDOW_DAYS)) {
    return 2;
  }

  if (task.status === "in_review") return 3;
  if (task.status === "new") return 4;
  if (task.status === "blocked") return 5;
  return 3;
}

function compareNullableIsoDates(left: string | null | undefined, right: string | null | undefined) {
  const leftValue = normalizeIsoDate(left);
  const rightValue = normalizeIsoDate(right);
  if (leftValue === rightValue) return 0;
  if (!leftValue) return 1;
  if (!rightValue) return -1;
  return leftValue.localeCompare(rightValue);
}

function normalizeIsoDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
}

function minIsoDate(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeIsoDate(left);
  const normalizedRight = normalizeIsoDate(right);

  if (!normalizedLeft) {
    return normalizedRight || null;
  }

  if (!normalizedRight) {
    return normalizedLeft;
  }

  return normalizedLeft.localeCompare(normalizedRight) <= 0 ? normalizedLeft : normalizedRight;
}

function addDaysIso(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}
