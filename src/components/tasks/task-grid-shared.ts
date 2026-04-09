import clsx from "clsx";

import { dailyTaskListColumns, formatTaskDisplayId, type TaskTreeRow } from "@/domains/task/daily-list";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import {
  clampTaskListRowHeight,
  TASK_LIST_ROW_MIN_HEIGHT,
  type ResolvedTaskListColumnWidthMap,
  type TaskListColumnKey,
} from "@/domains/preferences/types";
import { labelForField, labelForStatus } from "@/lib/ui-copy";
import {
  labelForTaskCategoricalFieldValue,
  type TaskCategoricalFieldKey,
} from "@/components/tasks/task-categorical-fields";
import { t } from "@/lib/ui-copy";

export type TaskListEditableDateFieldKey = "dueDate" | "reviewedAt";
export type TaskListEditableTextFieldKey =
  | "assignee"
  | "decision"
  | "issueDetailNote"
  | "issueTitle";
export type TaskCategoricalFormFieldKey = Extract<TaskCategoricalFieldKey, "workType" | "coordinationScope" | "requestedBy" | "relatedDisciplines" | "locationRef" | "status">;

export type TaskListCellPresentation =
  | {
      kind: "tree";
      actionId: string;
      isChildTask: boolean;
      isParentTask: boolean;
      isBranchTask: boolean;
      isLastChild: boolean;
      ancestorGuideFlags: boolean[];
    }
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "title";
      text: string;
      isChildTask: boolean;
      isParentTask: boolean;
      isBranchTask: boolean;
    }
  | {
      kind: "files";
      primary: string;
      secondary: string | null;
    }
  | {
      kind: "readonly-checkbox";
      checked: boolean;
    }
  | {
      kind: "readonly-status";
      value: TaskStatus;
    }
  | {
      kind: "editable-date";
      fieldKey: TaskListEditableDateFieldKey;
      value: string;
    }
  | {
      kind: "editable-text";
      fieldKey: TaskListEditableTextFieldKey;
      value: string;
      isTitle?: boolean;
    }
  | {
      kind: "editable-checkbox";
      checked: boolean;
    }
  | {
      kind: "editable-categorical";
      fieldKey: TaskCategoricalFormFieldKey;
      value: string;
      label: string;
    };

export type TaskListRowPresentationContext = {
  task: TaskRecord;
  row: TaskTreeRow;
  rowDraft: TaskRecord | null;
  activeInlineColumnKey: TaskListColumnKey | null;
  linkedDocumentsDisplay: LinkedDocumentsDisplay;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
};

export type LinkedDocumentsDisplay = {
  primary: string;
  secondary: string | null;
};

export type TaskListRowMeasurementCell = {
  column: (typeof dailyTaskListColumns)[number];
  width: number;
  presentation: TaskListCellPresentation;
};

export type TaskListCellNodeRegistry = {
  register(taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null): void;
  get(taskId: string, columnKey: TaskListColumnKey): HTMLDivElement | null;
  clearTask(taskId: string): void;
  clear(): void;
};

type TaskListRowMeasurementDom = {
  host: HTMLDivElement;
  shells: HTMLDivElement[];
  contents: HTMLDivElement[];
};

const editableTaskListFieldByColumn: Partial<Record<TaskListColumnKey, TaskListEditableDateFieldKey | TaskListEditableTextFieldKey | TaskCategoricalFormFieldKey>> = {
  dueDate: "dueDate",
  workType: "workType",
  coordinationScope: "coordinationScope",
  requestedBy: "requestedBy",
  relatedDisciplines: "relatedDisciplines",
  assignee: "assignee",
  issueTitle: "issueTitle",
  reviewedAt: "reviewedAt",
  locationRef: "locationRef",
  issueDetailNote: "issueDetailNote",
  status: "status",
  decision: "decision",
};

let taskListRowMeasurementDom: TaskListRowMeasurementDom | null = null;

export function createTaskListCellNodeRegistry(): TaskListCellNodeRegistry {
  const rows = new Map<string, Map<TaskListColumnKey, HTMLDivElement>>();

  return {
    register(taskId, columnKey, node) {
      const rowRefs = rows.get(taskId) ?? new Map<TaskListColumnKey, HTMLDivElement>();
      if (node) {
        rowRefs.set(columnKey, node);
        rows.set(taskId, rowRefs);
        return;
      }

      rowRefs.delete(columnKey);
      if (rowRefs.size === 0) {
        rows.delete(taskId);
        return;
      }

      rows.set(taskId, rowRefs);
    },
    get(taskId, columnKey) {
      return rows.get(taskId)?.get(columnKey) ?? null;
    },
    clearTask(taskId) {
      rows.delete(taskId);
    },
    clear() {
      rows.clear();
    },
  };
}

export function createTaskListRowPresentationContext(context: TaskListRowPresentationContext) {
  return context;
}

export function getEditableTaskListField(columnKey: TaskListColumnKey) {
  return editableTaskListFieldByColumn[columnKey] ?? null;
}

export function isCenteredCategoricalColumn(columnKey: TaskListColumnKey) {
  return (
    columnKey === "workType" ||
    columnKey === "coordinationScope" ||
    columnKey === "requestedBy" ||
    columnKey === "relatedDisciplines" ||
    columnKey === "locationRef" ||
    columnKey === "status"
  );
}

export function isEditableTaskListCellPresentation(presentation: TaskListCellPresentation) {
  return (
    presentation.kind === "editable-date" ||
    presentation.kind === "editable-text" ||
    presentation.kind === "editable-checkbox" ||
    presentation.kind === "editable-categorical"
  );
}

export function buildLinkedDocumentsSummary(task: Pick<TaskRecord, "fileSummary">, taskFiles: readonly FileRecord[]) {
  if (taskFiles.length === 0) {
    const fileCount = task.fileSummary?.count ?? 0;
    if (fileCount > 0) {
      const latestFileName = task.fileSummary?.latestFileName?.trim() || labelForField("linkedDocuments");
      return {
        primary:
          fileCount > 1
            ? t("workspace.linkedDocumentSummaryMulti", { name: latestFileName, count: fileCount - 1 })
            : latestFileName,
        secondary: t("empty.moreFilesAvailable"),
      };
    }

    return { primary: t("empty.addFilePrompt"), secondary: null as string | null };
  }

  const [firstFile, ...restFiles] = taskFiles;
  return {
    primary:
      restFiles.length > 0
        ? t("workspace.linkedDocumentSummaryMulti", { name: firstFile.originalName, count: restFiles.length })
        : firstFile.originalName,
    secondary: restFiles.length > 0 ? t("empty.moreFilesAvailable") : null,
  };
}

export function buildTaskListCellPresentation(columnKey: TaskListColumnKey, context: TaskListRowPresentationContext): TaskListCellPresentation {
  const { task, row, rowDraft, linkedDocumentsDisplay, workTypeDefinitions, categoryDefinitionsByField } = context;
  const categoricalFieldContext = { workTypeDefinitions, categoryDefinitionsByField };
  const isChildTask = row.depth > 0;
  const isParentTask = row.hasChildren;
  const isBranchTask = isChildTask && isParentTask;
  const ancestorGuideFlags = row.depth > 1 ? row.ancestorHasNextSibling.slice(0, row.depth - 1) : [];
  const displayTask = rowDraft ?? task;

  switch (columnKey) {
    case "actionId":
      return {
        kind: "tree",
        actionId: formatTaskDisplayId(task),
        isChildTask,
        isParentTask,
        isBranchTask,
        isLastChild: row.isLastChild,
        ancestorGuideFlags,
      };
    case "dueDate":
      return { kind: "text", text: displayTask.dueDate || "-" };
    case "workType":
      return { kind: "text", text: labelForTaskCategoricalFieldValue("workType", displayTask.workType, categoricalFieldContext) };
    case "coordinationScope":
      return { kind: "text", text: labelForTaskCategoricalFieldValue("coordinationScope", displayTask.coordinationScope, categoricalFieldContext) };
    case "requestedBy":
      return { kind: "text", text: labelForTaskCategoricalFieldValue("requestedBy", displayTask.requestedBy, categoricalFieldContext) };
    case "relatedDisciplines":
      return { kind: "text", text: labelForTaskCategoricalFieldValue("relatedDisciplines", displayTask.relatedDisciplines, categoricalFieldContext) };
    case "assignee":
      return { kind: "text", text: displayTask.assignee || "-" };
    case "issueTitle":
      return {
        kind: "title",
        text: displayTask.issueTitle,
        isChildTask,
        isParentTask,
        isBranchTask,
      };
    case "reviewedAt":
      return { kind: "text", text: displayTask.reviewedAt || "-" };
    case "locationRef":
      return { kind: "text", text: labelForTaskCategoricalFieldValue("locationRef", displayTask.locationRef, categoricalFieldContext) };
    case "calendarLinked":
      return { kind: "readonly-checkbox", checked: displayTask.calendarLinked };
    case "issueDetailNote":
      return { kind: "text", text: displayTask.issueDetailNote || "-" };
    case "status":
      return { kind: "readonly-status", value: displayTask.status };
    case "decision":
      return { kind: "text", text: displayTask.decision || "-" };
    case "linkedDocuments":
      return {
        kind: "files",
        primary: linkedDocumentsDisplay.primary,
        secondary: linkedDocumentsDisplay.secondary,
      };
  }
}

export function buildTaskListRowMeasurementCells(
  context: TaskListRowPresentationContext,
  columnWidths: ResolvedTaskListColumnWidthMap,
): TaskListRowMeasurementCell[] {
  return dailyTaskListColumns.map((column) => ({
    column,
    width: columnWidths[column.key],
    presentation: buildTaskListCellPresentation(column.key, context),
  }));
}

export function buildTaskListRowMeasurementCacheKey(cells: readonly TaskListRowMeasurementCell[]) {
  return JSON.stringify(
    cells.map(({ column, width, presentation }) => ({
      key: column.key,
      width,
      presentation,
    })),
  );
}

function createTaskListMeasureTextNode(className: string | null, value: string) {
  const node = document.createElement("div");
  if (className) {
    node.className = className;
  }
  node.textContent = value || "\u200b";
  return node;
}

function appendTaskListCellMeasurementContent(container: HTMLElement, presentation: TaskListCellPresentation) {
  switch (presentation.kind) {
    case "tree": {
      const tree = document.createElement("div");
      tree.className = "task-tree";

      if (presentation.isChildTask) {
        const guides = document.createElement("span");
        guides.className = "task-tree__guides";
        guides.setAttribute("aria-hidden", "true");
        presentation.ancestorGuideFlags.forEach((hasNextSibling) => {
          const lane = document.createElement("span");
          lane.className = clsx("task-tree__lane", hasNextSibling && "task-tree__lane--continue");
          guides.appendChild(lane);
        });
        const branch = document.createElement("span");
        branch.className = clsx("task-tree__branch", presentation.isLastChild ? "task-tree__branch--last" : "task-tree__branch--middle");
        guides.appendChild(branch);
        tree.appendChild(guides);
      }

      const badge = document.createElement("span");
      badge.className = clsx(
        "task-tree__badge",
        presentation.isParentTask && "task-tree__badge--parent",
        presentation.isChildTask && "task-tree__badge--child",
        presentation.isBranchTask && "task-tree__badge--branch",
      );
      badge.textContent = presentation.actionId;
      tree.appendChild(badge);
      container.appendChild(tree);
      return;
    }
    case "text":
      container.appendChild(createTaskListMeasureTextNode(null, presentation.text));
      return;
    case "title": {
      const title = document.createElement("span");
      title.className = clsx(
        "sheet-table__title-copy",
        presentation.isParentTask && "sheet-table__title-copy--parent",
        presentation.isChildTask && "sheet-table__title-copy--child",
        presentation.isBranchTask && "sheet-table__title-copy--branch",
      );
      title.textContent = presentation.text || "\u200b";
      container.appendChild(title);
      return;
    }
    case "files": {
      const primary = document.createElement("strong");
      primary.textContent = presentation.primary || "\u200b";
      container.appendChild(primary);
      if (presentation.secondary) {
        const secondary = document.createElement("small");
        secondary.textContent = presentation.secondary;
        container.appendChild(secondary);
      }
      return;
    }
    case "readonly-checkbox": {
      const wrapper = document.createElement("span");
      wrapper.className = "sheet-table__readonly-checkbox sheet-table__measure-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.disabled = true;
      input.readOnly = true;
      input.tabIndex = -1;
      input.checked = presentation.checked;
      wrapper.appendChild(input);
      container.appendChild(wrapper);
      return;
    }
    case "readonly-status": {
      const status = document.createElement("span");
      status.className = clsx("status-pill", `status-pill--${presentation.value}`);
      status.textContent = labelForStatus(presentation.value);
      container.appendChild(status);
      return;
    }
    case "editable-date":
      container.appendChild(
        createTaskListMeasureTextNode(
          "sheet-table__inline-input sheet-table__measure-control sheet-table__measure-control--single-line",
          presentation.value,
        ),
      );
      return;
    case "editable-text":
      container.appendChild(
        createTaskListMeasureTextNode(
          clsx(
            "sheet-table__inline-input",
            "sheet-table__measure-control",
            "sheet-table__measure-control--text",
            presentation.isTitle && "sheet-table__inline-input--title",
          ),
          presentation.value,
        ),
      );
      return;
    case "editable-checkbox": {
      const label = document.createElement("label");
      label.className = "sheet-table__inline-checkbox sheet-table__measure-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.disabled = true;
      input.checked = presentation.checked;
      label.appendChild(input);
      container.appendChild(label);
      return;
    }
    case "editable-categorical":
      container.appendChild(
        createTaskListMeasureTextNode(
          "sheet-table__inline-input sheet-table__measure-control sheet-table__measure-control--single-line",
          presentation.label,
        ),
      );
      return;
  }
}

export function getTaskListRowMeasurementDom() {
  if (typeof document === "undefined") {
    return null;
  }

  if (taskListRowMeasurementDom && document.body.contains(taskListRowMeasurementDom.host)) {
    return taskListRowMeasurementDom;
  }

  const host = document.createElement("div");
  host.className = "sheet-table__measure-host";
  const shells: HTMLDivElement[] = [];
  const contents: HTMLDivElement[] = [];

  dailyTaskListColumns.forEach(() => {
    const shell = document.createElement("div");
    const content = document.createElement("div");
    shell.appendChild(content);
    host.appendChild(shell);
    shells.push(shell);
    contents.push(content);
  });

  document.body.appendChild(host);
  taskListRowMeasurementDom = { host, shells, contents };
  return taskListRowMeasurementDom;
}

export function measureTaskListRowHeight(cells: readonly TaskListRowMeasurementCell[]) {
  const measurementDom = getTaskListRowMeasurementDom();
  if (!measurementDom) {
    return TASK_LIST_ROW_MIN_HEIGHT;
  }

  let nextHeight = TASK_LIST_ROW_MIN_HEIGHT;

  cells.forEach(({ column, width, presentation }, index) => {
    const shell = measurementDom.shells[index];
    const content = measurementDom.contents[index];
    shell.className = clsx("sheet-table__cell-shell", column.className, column.key === "actionId" && "sheet-table__cell-shell--tree");
    shell.style.width = `${width}px`;
    content.className = clsx(
      "sheet-table__cell-content",
      isEditableTaskListCellPresentation(presentation) && "sheet-table__cell-content--editable",
      isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
    );
    content.replaceChildren();
    appendTaskListCellMeasurementContent(content, presentation);
    nextHeight = Math.max(nextHeight, Math.ceil(shell.getBoundingClientRect().height));
  });

  return clampTaskListRowHeight(nextHeight);
}
