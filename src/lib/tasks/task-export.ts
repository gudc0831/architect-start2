import ExcelJS from "exceljs";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import {
  resolveTaskListColumnWidths,
  sanitizeTaskListLayoutPreference,
  TASK_LIST_ROW_MIN_HEIGHT,
  type ResolvedTaskListColumnWidthMap,
  type TaskListColumnKey,
  type TaskListLayoutPreference,
  type TaskListRowHeightMap,
} from "@/domains/preferences/types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import {
  buildTaskHierarchyPathMap,
  formatTaskBacklogId,
  joinLatestFileNames,
  summarizeLinkedDocumentsForExport,
} from "@/domains/task/daily-list";
import { compareTasksBySiblingOrder, groupTasksByNormalizedParent } from "@/domains/task/ordering";
import {
  labelForTaskCategoricalFilterValue,
  type TaskCategoricalFilterSelection,
} from "@/lib/task-categorical-filter";
import { labelForField, labelForMode, t } from "@/lib/ui-copy";

export type TaskExportLayoutInput = {
  columnWidths?: unknown;
  rowHeights?: unknown;
  workTypeFilters?: string[];
  categoricalFilters?: TaskCategoricalFilterSelection;
};

type TaskExportWorkbookInput = {
  projectName: string;
  tasks: TaskRecord[];
  files: FileRecord[];
  layout: Pick<TaskListLayoutPreference, "columnWidths" | "rowHeights">;
  ownerDiscipline: string;
  categoryDefinitionsByField?: Partial<
    Record<
      TaskCategoryFieldKey,
      readonly Pick<TaskCategoryDefinition, "fieldKey" | "code" | "labelKo" | "isActive" | "sortOrder">[]
    >
  >;
};

type TaskExportColumnKey = TaskListColumnKey | "ownerDiscipline";

type TaskExportColumnConfig = {
  key: TaskExportColumnKey;
  layoutKey?: TaskListColumnKey;
  widthPx?: number;
};

const MAIN_SHEET_NAME = labelForMode("daily");
const META_SHEET_NAME = "__task_meta";
const DEFAULT_FONT_NAME = "Malgun Gothic";
const SYMBOL_FONT_NAME = "Segoe UI Symbol";
const EXPORTED_COLUMNS: readonly TaskExportColumnConfig[] = [
  { key: "actionId", layoutKey: "actionId" },
  { key: "dueDate", layoutKey: "dueDate" },
  { key: "workType", layoutKey: "workType" },
  { key: "coordinationScope", layoutKey: "coordinationScope" },
  { key: "ownerDiscipline", widthPx: 160 },
  { key: "requestedBy", layoutKey: "requestedBy" },
  { key: "relatedDisciplines", layoutKey: "relatedDisciplines" },
  { key: "assignee", layoutKey: "assignee" },
  { key: "issueTitle", layoutKey: "issueTitle" },
  { key: "reviewedAt", layoutKey: "reviewedAt" },
  { key: "locationRef", layoutKey: "locationRef" },
  { key: "calendarLinked", layoutKey: "calendarLinked" },
  { key: "issueDetailNote", layoutKey: "issueDetailNote" },
  { key: "status", layoutKey: "status" },
  { key: "decision", layoutKey: "decision" },
  { key: "linkedDocuments", layoutKey: "linkedDocuments" },
] as const;

export function mergeTaskExportLayout(
  requestLayout: TaskExportLayoutInput,
  storedLayout: TaskListLayoutPreference,
): {
  columnWidths: ResolvedTaskListColumnWidthMap;
  rowHeights: TaskListRowHeightMap;
} {
  const sanitizedRequest = sanitizeTaskListLayoutPreference(requestLayout);
  return {
    columnWidths: resolveTaskListColumnWidths({
      ...storedLayout.columnWidths,
      ...sanitizedRequest.columnWidths,
    }),
    rowHeights: {
      ...storedLayout.rowHeights,
      ...sanitizedRequest.rowHeights,
    },
  };
}

export async function buildTaskExportWorkbook(input: TaskExportWorkbookInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Codex";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const worksheet = workbook.addWorksheet(MAIN_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const metaWorksheet = workbook.addWorksheet(META_SHEET_NAME);
  metaWorksheet.state = "veryHidden";

  const rows = buildExportTaskTreeRows(input.tasks);
  const categoricalFieldContext = {
    categoryDefinitionsByField: input.categoryDefinitionsByField,
  };
  const hierarchyPathById = buildTaskHierarchyPathMap(input.tasks);
  const taskById = new Map(input.tasks.map((task) => [task.id, task]));
  const filesByTaskId = input.files.reduce<Record<string, FileRecord[]>>((acc, file) => {
    if (!acc[file.taskId]) {
      acc[file.taskId] = [];
    }
    acc[file.taskId].push(file);
    return acc;
  }, {});

  worksheet.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  worksheet.properties.outlineLevelRow = rows.reduce((max, row) => Math.max(max, row.depth), 0);
  worksheet.columns = EXPORTED_COLUMNS.map((column) => ({
    key: column.key,
    width: pixelWidthToExcelWidth(column.layoutKey ? input.layout.columnWidths[column.layoutKey] : column.widthPx),
  }));

  const headerRow = worksheet.addRow(EXPORTED_COLUMNS.map((column) => labelForField(column.key)));
  headerRow.height = 26;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, name: DEFAULT_FONT_NAME };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE8EEF7" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD7DFEA" } },
      bottom: { style: "thin", color: { argb: "FFD7DFEA" } },
    };
  });

  metaWorksheet.addRow([
    "exportRowIndex",
    "taskId",
    "actionId",
    "parentTaskId",
    "parentActionId",
    "rootTaskId",
    "depth",
    "siblingOrder",
    "hierarchyPath",
    "calendarLinkedRaw",
    "statusRaw",
    "fileCount",
    "latestFileNamesJoined",
  ]);

  rows.forEach((row, rowIndex) => {
    const task = row.task;
    const taskFiles = filesByTaskId[task.id] ?? [];
    const linkedDocuments = summarizeLinkedDocumentsForExport(taskFiles);
    const exportRowIndex = rowIndex + 2;
    const parentTask = task.parentTaskId ? taskById.get(task.parentTaskId) ?? null : null;
    const nextRow = worksheet.addRow([
      formatTaskBacklogId(task),
      toExcelDateCell(task.dueDate),
      labelForTaskCategoricalFilterValue("workType", task.workType, categoricalFieldContext),
      labelForTaskCategoricalFilterValue("coordinationScope", task.coordinationScope, categoricalFieldContext),
      input.ownerDiscipline,
      labelForTaskCategoricalFilterValue("requestedBy", task.requestedBy, categoricalFieldContext),
      labelForTaskCategoricalFilterValue("relatedDisciplines", task.relatedDisciplines, categoricalFieldContext),
      task.assignee || "",
      task.issueTitle || "",
      toExcelDateCell(task.reviewedAt),
      labelForTaskCategoricalFilterValue("locationRef", task.locationRef, categoricalFieldContext),
      task.calendarLinked ? "\u2611" : "\u2610",
      task.issueDetailNote || "",
      labelForTaskCategoricalFilterValue("status", task.status, categoricalFieldContext),
      task.decision || "",
      linkedDocuments,
    ]);

    nextRow.outlineLevel = row.depth;
    nextRow.height = pixelHeightToPoints(input.layout.rowHeights[task.id]);

    nextRow.eachCell((cell, columnNumber) => {
      const columnKey = EXPORTED_COLUMNS[columnNumber - 1]?.key;
      cell.font = {
        name: columnKey === "calendarLinked" ? SYMBOL_FONT_NAME : DEFAULT_FONT_NAME,
      };
      cell.alignment = resolveCellAlignment(columnKey, row.depth);
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFF1F3F5" } },
      };
    });

    const issueTitleCell = nextRow.getCell(columnNumberFor("issueTitle"));
    issueTitleCell.alignment = {
      ...(issueTitleCell.alignment ?? {}),
      indent: row.depth,
      wrapText: true,
      vertical: "top",
    };

    const actionIdCell = nextRow.getCell(1);
    actionIdCell.alignment = {
      ...(actionIdCell.alignment ?? {}),
      indent: row.depth,
      wrapText: true,
      vertical: "top",
    };
    const dueDateCell = nextRow.getCell(2);
    if (dueDateCell.value instanceof Date) {
      dueDateCell.numFmt = "yyyy-mm-dd";
    }

    const reviewedAtCell = nextRow.getCell(columnNumberFor("reviewedAt"));
    if (reviewedAtCell.value instanceof Date) {
      reviewedAtCell.numFmt = "yyyy-mm-dd";
    }

    metaWorksheet.addRow([
      exportRowIndex,
      task.id,
      formatTaskBacklogId(task),
      task.parentTaskId ?? "",
      parentTask ? formatTaskBacklogId(parentTask) : "",
      task.rootTaskId,
      row.depth,
      task.siblingOrder,
      hierarchyPathById.get(task.id) ?? "",
      task.calendarLinked,
      task.status,
      taskFiles.length,
      joinLatestFileNames(taskFiles),
    ]);
  });

  metaWorksheet.columns = [
    { width: 16 },
    { width: 40 },
    { width: 12 },
    { width: 40 },
    { width: 16 },
    { width: 40 },
    { width: 10 },
    { width: 14 },
    { width: 24 },
    { width: 18 },
    { width: 16 },
    { width: 12 },
    { width: 48 },
  ];

  metaWorksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.font = { name: DEFAULT_FONT_NAME };
      cell.alignment = { vertical: "top", wrapText: true };
    });

    if (rowNumber === 1) {
      row.eachCell((cell) => {
        cell.font = { bold: true, name: DEFAULT_FONT_NAME };
      });
    }
  });

  return workbook;
}

export async function serializeTaskExportWorkbook(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildTaskExportFilename(projectName: string) {
  const safeProjectName = sanitizeFilename(projectName) || "architect-start";
  const date = new Date().toISOString().slice(0, 10);
  return `${safeProjectName}-daily-tasks-${date}.xlsx`;
}

function resolveCellAlignment(columnKey: TaskExportColumnKey | undefined, depth: number): Partial<ExcelJS.Alignment> {
  if (columnKey === "calendarLinked") {
    return { horizontal: "center", vertical: "middle" };
  }

  if (
    columnKey === "workType" ||
    columnKey === "coordinationScope" ||
    columnKey === "ownerDiscipline" ||
    columnKey === "requestedBy" ||
    columnKey === "relatedDisciplines" ||
    columnKey === "locationRef" ||
    columnKey === "status"
  ) {
    return { horizontal: "center", vertical: "middle", wrapText: true };
  }

  const wrapText =
    columnKey === "actionId" ||
    columnKey === "issueDetailNote" ||
    columnKey === "decision" ||
    columnKey === "linkedDocuments";
  const indent = columnKey === "actionId" || columnKey === "issueTitle" ? depth : 0;
  return {
    indent,
    vertical: "top",
    wrapText,
  };
}

function toExcelDateCell(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  return new Date(`${value}T00:00:00`);
}

function pixelWidthToExcelWidth(widthPx: number | undefined) {
  const width = typeof widthPx === "number" && Number.isFinite(widthPx) ? widthPx : 120;
  return Math.max(1, Math.round((((width - 5) / 7) * 100)) / 100);
}

function pixelHeightToPoints(heightPx: number | undefined) {
  const height = typeof heightPx === "number" && Number.isFinite(heightPx) ? heightPx : TASK_LIST_ROW_MIN_HEIGHT;
  return Math.round(height * 0.75 * 100) / 100;
}

function columnNumberFor(key: TaskExportColumnKey) {
  return EXPORTED_COLUMNS.findIndex((column) => column.key === key) + 1;
}

function buildExportTaskTreeRows(tasks: TaskRecord[]) {
  const byParent = groupTasksByNormalizedParent(tasks);
  const rows: Array<{
    task: TaskRecord;
    depth: number;
    isLastChild: boolean;
    ancestorHasNextSibling: boolean[];
    hasChildren: boolean;
  }> = [];
  const visited = new Set<string>();

  const appendNode = (task: TaskRecord, depth: number, isLastChild: boolean, ancestorHasNextSibling: boolean[]) => {
    if (visited.has(task.id)) return;

    visited.add(task.id);
    const children = [...(byParent.get(task.id) ?? [])].sort(compareTasksBySiblingOrder);
    const hasChildren = children.length > 0;
    rows.push({ task, depth, isLastChild, ancestorHasNextSibling, hasChildren });

    children.forEach((child, index) => {
      appendNode(child, depth + 1, index === children.length - 1, [...ancestorHasNextSibling, !isLastChild]);
    });
  };

  const roots = [...(byParent.get(null) ?? [])].sort(compareTasksBySiblingOrder);
  roots.forEach((task, index) => {
    appendNode(task, 0, index === roots.length - 1, []);
  });

  const remaining = [...tasks.filter((task) => !visited.has(task.id))].sort(compareTasksBySiblingOrder);
  remaining.forEach((task, index) => {
    appendNode(task, 0, index === remaining.length - 1, []);
  });

  return rows;
}

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
