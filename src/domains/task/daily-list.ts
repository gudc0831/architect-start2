import type { TaskListColumnKey } from "@/domains/preferences/types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import { extractProjectIssueNumber, looksLikeProjectIssueId } from "@/domains/task/identifiers";
import type { TaskCategoricalFilterFieldKey } from "@/lib/task-categorical-filter";
import { t } from "@/lib/ui-copy";

export type DailyTaskListHeaderControl = {
  kind: "categoricalFilter";
  fieldKey: TaskCategoricalFilterFieldKey;
};

export type DailyTaskListColumnConfig = {
  key: TaskListColumnKey;
  className?: string;
  headerControl?: DailyTaskListHeaderControl;
};

export type TaskTreeRow = {
  task: TaskRecord;
  depth: number;
  isLastChild: boolean;
  ancestorHasNextSibling: boolean[];
  hasChildren: boolean;
};

export const dailyTaskListColumns: readonly DailyTaskListColumnConfig[] = [
  { key: "actionId", className: "sheet-table__tree-cell" },
  { key: "dueDate" },
  { key: "workType", headerControl: { kind: "categoricalFilter", fieldKey: "workType" } },
  { key: "coordinationScope", headerControl: { kind: "categoricalFilter", fieldKey: "coordinationScope" } },
  { key: "requestedBy" },
  { key: "relatedDisciplines", headerControl: { kind: "categoricalFilter", fieldKey: "relatedDisciplines" } },
  { key: "assignee" },
  { key: "issueTitle", className: "sheet-table__title" },
  { key: "reviewedAt" },
  { key: "locationRef" },
  { key: "calendarLinked" },
  { key: "issueDetailNote", className: "sheet-table__wide" },
  { key: "status", headerControl: { kind: "categoricalFilter", fieldKey: "status" } },
  { key: "completedAt" },
  { key: "statusHistory", className: "sheet-table__wide" },
  { key: "decision", className: "sheet-table__wide" },
  { key: "linkedDocuments", className: "sheet-table__files" },
] as const;

export function formatActionId(actionId: number | string | null | undefined) {
  const raw = String(actionId ?? "").trim();
  if (!raw) return "#-";
  if (raw.startsWith("#")) return raw;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? "#" + numeric : raw;
}

export function formatTaskBacklogId(task: Pick<TaskRecord, "issueId" | "actionId" | "taskNumber">) {
  const issueId = String(task.issueId ?? "").trim();
  if (issueId && looksLikeProjectIssueId(issueId)) {
    return issueId;
  }

  return formatActionId(task.actionId ?? task.taskNumber);
}

export function formatTaskDisplayId(task: Pick<TaskRecord, "issueId" | "actionId" | "taskNumber">) {
  const issueNumber = extractProjectIssueNumber(String(task.issueId ?? ""));
  if (issueNumber) {
    return issueNumber;
  }

  return formatActionId(task.actionId ?? task.taskNumber);
}

export function formatDateTimeField(value: string | null | undefined) {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return value.replace("T", " ").slice(0, 16);
}

export function compareTasksByActionId(left: TaskRecord, right: TaskRecord) {
  const actionCompare = (left.actionId ?? left.taskNumber) - (right.actionId ?? right.taskNumber);
  if (actionCompare !== 0) return actionCompare;
  return left.createdAt.localeCompare(right.createdAt);
}

export function sortTasksByActionId(tasks: TaskRecord[]) {
  return [...tasks].sort(compareTasksByActionId);
}

export function buildTaskTreeRows(tasks: TaskRecord[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const childrenByParent = tasks.reduce<Map<string | null, TaskRecord[]>>((acc, task) => {
    const parentKey = task.parentTaskId && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
    const next = acc.get(parentKey) ?? [];
    next.push(task);
    acc.set(parentKey, next);
    return acc;
  }, new Map<string | null, TaskRecord[]>());

  for (const children of childrenByParent.values()) {
    children.sort(compareTasksByActionId);
  }

  const rows: TaskTreeRow[] = [];
  const visited = new Set<string>();

  const appendNode = (task: TaskRecord, depth: number, isLastChild: boolean, ancestorHasNextSibling: boolean[]) => {
    if (visited.has(task.id)) return;

    visited.add(task.id);
    const children = childrenByParent.get(task.id) ?? [];
    const hasChildren = children.length > 0;
    rows.push({ task, depth, isLastChild, ancestorHasNextSibling, hasChildren });

    children.forEach((child, index) => {
      appendNode(child, depth + 1, index === children.length - 1, [...ancestorHasNextSibling, !isLastChild]);
    });
  };

  const roots = childrenByParent.get(null) ?? [];
  roots.forEach((task, index) => {
    appendNode(task, 0, index === roots.length - 1, []);
  });

  const remaining = sortTasksByActionId(tasks.filter((task) => !visited.has(task.id)));
  remaining.forEach((task, index) => {
    appendNode(task, 0, index === remaining.length - 1, []);
  });

  return rows;
}

export function buildTaskHierarchyPathMap(tasks: TaskRecord[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const cache = new Map<string, string>();

  function resolvePath(task: TaskRecord): string {
    const cached = cache.get(task.id);
    if (cached) {
      return cached;
    }

    const segment = String(task.actionId || task.taskNumber || "");
    const parent =
      task.parentTaskId && taskIds.has(task.parentTaskId)
        ? byId.get(task.parentTaskId) ?? null
        : null;

    const path = parent ? `${resolvePath(parent)}/${segment}` : segment;
    cache.set(task.id, path);
    return path;
  }

  for (const task of tasks) {
    resolvePath(task);
  }

  return cache;
}

export function summarizeLinkedDocumentsForExport(taskFiles: FileRecord[]) {
  if (taskFiles.length === 0) {
    return "";
  }

  const [firstFile, ...restFiles] = taskFiles;
  return restFiles.length > 0
    ? t("workspace.linkedDocumentSummaryMulti", { name: firstFile.originalName, count: restFiles.length })
    : firstFile.originalName;
}

export function joinLatestFileNames(taskFiles: FileRecord[]) {
  return taskFiles.map((file) => file.originalName).join("\n");
}

export function isIsoDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
