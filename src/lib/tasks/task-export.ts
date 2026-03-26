import ExcelJS from "exceljs";
import {
  resolveTaskListColumnWidths,
  sanitizeTaskListLayoutPreference,
  TASK_LIST_ROW_MIN_HEIGHT,
  type ResolvedTaskListColumnWidthMap,
  type TaskListLayoutPreference,
  type TaskListRowHeightMap,
} from "@/domains/preferences/types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import {
  buildTaskHierarchyPathMap,
  buildTaskTreeRows,
  dailyTaskListColumns,
  formatActionId,
  formatDateTimeField,
  joinLatestFileNames,
  summarizeLinkedDocumentsForExport,
} from "@/domains/task/daily-list";
import { formatStatusHistoryForDisplay, labelForField, labelForMode, labelForStatus, t } from "@/lib/ui-copy";

export type TaskExportLayoutInput = {
  columnWidths?: unknown;
  rowHeights?: unknown;
};

type TaskExportWorkbookInput = {
  projectName: string;
  tasks: TaskRecord[];
  files: FileRecord[];
  layout: TaskListLayoutPreference;
};

const MAIN_SHEET_NAME = labelForMode("daily");
const META_SHEET_NAME = "__task_meta";
const DEFAULT_FONT_NAME = "Malgun Gothic";
const SYMBOL_FONT_NAME = "Segoe UI Symbol";

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

  const rows = buildTaskTreeRows(input.tasks);
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
  worksheet.columns = dailyTaskListColumns.map((column) => ({
    key: column.key,
    width: pixelWidthToExcelWidth(input.layout.columnWidths[column.key]),
  }));

  const headerRow = worksheet.addRow(dailyTaskListColumns.map((column) => labelForField(column.key)));
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
      formatActionId(task.actionId || task.taskNumber),
      toExcelDateCell(task.dueDate),
      task.workType || "",
      task.coordinationScope || "",
      task.requestedBy || "",
      task.relatedDisciplines || "",
      task.assignee || "",
      task.issueTitle || "",
      toExcelDateCell(task.reviewedAt),
      task.locationRef || "",
      task.calendarLinked ? "\u2611" : "\u2610",
      task.issueDetailNote || "",
      labelForStatus(task.status),
      formatDateTimeField(task.completedAt),
      formatStatusHistoryForDisplay(task.statusHistory),
      task.decision || "",
      linkedDocuments,
    ]);

    nextRow.outlineLevel = row.depth;
    nextRow.height = pixelHeightToPoints(input.layout.rowHeights[task.id]);

    nextRow.eachCell((cell, columnNumber) => {
      const columnKey = dailyTaskListColumns[columnNumber - 1]?.key;
      cell.font = {
        name: columnKey === "calendarLinked" ? SYMBOL_FONT_NAME : DEFAULT_FONT_NAME,
      };
      cell.alignment = resolveCellAlignment(columnKey, row.depth);
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFF1F3F5" } },
      };
    });

    const issueTitleCell = nextRow.getCell(8);
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

    const reviewedAtCell = nextRow.getCell(9);
    if (reviewedAtCell.value instanceof Date) {
      reviewedAtCell.numFmt = "yyyy-mm-dd";
    }

    metaWorksheet.addRow([
      exportRowIndex,
      task.id,
      formatActionId(task.actionId || task.taskNumber),
      task.parentTaskId ?? "",
      parentTask ? formatActionId(parentTask.actionId || parentTask.taskNumber) : "",
      task.rootTaskId,
      row.depth,
      task.siblingOrder,
      hierarchyPathById.get(task.id) ?? "",
      task.calendarLinked,
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

function resolveCellAlignment(columnKey: string | undefined, depth: number): Partial<ExcelJS.Alignment> {
  if (columnKey === "calendarLinked") {
    return { horizontal: "center", vertical: "middle" };
  }

  const wrapText =
    columnKey === "actionId" ||
    columnKey === "issueDetailNote" ||
    columnKey === "statusHistory" ||
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

function sanitizeFilename(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}
