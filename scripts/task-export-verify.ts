import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import * as ExcelJS from "exceljs";
import { uiCopyCatalog, type UiLocale } from "../src/lib/ui-copy/catalog";
import { taskListColumnKeys } from "../src/domains/preferences/types";

type Options = {
  filePath?: string;
  url?: string;
  mainSheetName?: string;
  metaSheetName: string;
  locale: UiLocale;
  expectRows?: number;
  expectFilename?: string;
  expectedHeadersByKey: Record<string, string>;
  requestHeaders: Record<string, string>;
  savePath?: string;
};

type Failure = {
  message: string;
  sheet?: string;
  row?: number;
};

type RowValues = Record<string, ExcelJS.Cell | undefined>;

type SheetRow = {
  rowIndex: number;
  values: RowValues;
};

type ColumnSpec = {
  key: string;
  header: string;
};

const META_REQUIRED_COLUMNS = [
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
] as const;

const META_OPTIONAL_COLUMNS = ["statusRaw", "statusHistoryRaw"] as const;
const CHECKBOX_TRUE_GLYPH = "\u2611";
const CHECKBOX_FALSE_GLYPH = "\u2610";
const DEFAULT_META_SHEET_NAME = "__task_meta";
const MAX_HEADER_SCAN_ROWS = 12;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.filePath && !options.url) {
    throw new Error("Provide either --file <path> or --url <endpoint>.");
  }

  const failures: Failure[] = [];
  const workbookBuffer = await loadWorkbookBuffer(options);
  const workbook = new ExcelJS.Workbook();
  const workbookInput = workbookBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(workbookInput);

  const report = verifyWorkbook(workbook, options, failures);
  if (failures.length > 0) {
    console.error(`[task-export-verify] failed with ${failures.length} issue(s)`);
    for (const failure of failures) {
      const location = [failure.sheet, failure.row ? `row ${failure.row}` : null].filter(Boolean).join(" ");
      console.error(`- ${location ? `${location}: ` : ""}${failure.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[task-export-verify] ok file=${report.sourceLabel} sheets=${report.sheetCount} rows=${report.dataRowCount} locale=${options.locale}`,
  );
}

async function loadWorkbookBuffer(options: Options): Promise<Buffer> {
  if (options.filePath) {
    return Buffer.from(await readFile(options.filePath));
  }

  const response = await fetch(options.url!, {
    headers: options.requestHeaders,
  });

  if (!response.ok) {
    throw new Error(`Export request failed: ${response.status} ${response.statusText}`);
  }

  verifyHttpResponse(response, options);

  const workbookBuffer = Buffer.from(await response.arrayBuffer());
  if (options.savePath) {
    await writeFile(options.savePath, workbookBuffer);
  }

  return workbookBuffer;
}

function verifyHttpResponse(response: Response, options: Options) {
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("spreadsheetml.sheet") && !contentType.includes("octet-stream")) {
    throw new Error(`Expected an XLSX response, got content-type '${response.headers.get("content-type") ?? ""}'`);
  }

  const contentDisposition = response.headers.get("content-disposition") ?? "";
  if (!/attachment/i.test(contentDisposition)) {
    throw new Error(`Expected attachment response, got content-disposition '${contentDisposition}'`);
  }

  if (options.expectFilename && !contentDisposition.includes(options.expectFilename)) {
    throw new Error(
      `Expected downloaded filename to include '${options.expectFilename}', got content-disposition '${contentDisposition}'`,
    );
  }
}

function verifyWorkbook(workbook: ExcelJS.Workbook, options: Options, failures: Failure[]) {
  const sheetCount = workbook.worksheets.length;
  if (sheetCount !== 2) {
    failures.push({
      message: `expected exactly 2 sheets (main + meta), found ${sheetCount}`,
    });
  }

  const metaSheet = workbook.getWorksheet(options.metaSheetName);
  if (!metaSheet) {
    failures.push({
      message: `missing meta sheet '${options.metaSheetName}'`,
    });
  }

  const visibleSheets = workbook.worksheets.filter((sheet) => sheet.state === "visible");
  const mainSheet = options.mainSheetName ? workbook.getWorksheet(options.mainSheetName) : visibleSheets[0];
  if (!mainSheet) {
    failures.push({
      message: options.mainSheetName ? `missing main sheet '${options.mainSheetName}'` : "unable to resolve main sheet",
    });
  }

  if (!metaSheet || !mainSheet) {
    return {
      sourceLabel: options.filePath ?? options.url ?? "unknown",
      sheetCount,
      dataRowCount: 0,
    };
  }

  if (metaSheet.state !== "veryHidden") {
    failures.push({
      sheet: metaSheet.name,
      message: `meta sheet must be veryHidden, got '${metaSheet.state}'`,
    });
  }

  if (mainSheet.state !== "visible") {
    failures.push({
      sheet: mainSheet.name,
      message: `main sheet must be visible, got '${mainSheet.state}'`,
    });
  }

  const expectedMainHeaders = taskListColumnKeys.map((key) => options.expectedHeadersByKey[key]);
  const mainHeaderRow = findHeaderRow(mainSheet, expectedMainHeaders, MAX_HEADER_SCAN_ROWS);
  if (!mainHeaderRow) {
    failures.push({
      sheet: mainSheet.name,
      message: `could not find expected main header row: ${expectedMainHeaders.join(" | ")}`,
    });
    return {
      sourceLabel: options.filePath ?? options.url ?? "unknown",
      sheetCount,
      dataRowCount: 0,
    };
  }

  const metaHeaderRow = findHeaderRow(metaSheet, [...META_REQUIRED_COLUMNS], MAX_HEADER_SCAN_ROWS);
  if (!metaHeaderRow) {
    failures.push({
      sheet: metaSheet.name,
      message: `could not find expected meta header row: ${META_REQUIRED_COLUMNS.join(" | ")}`,
    });
    return {
      sourceLabel: options.filePath ?? options.url ?? "unknown",
      sheetCount,
      dataRowCount: 0,
    };
  }

  const mainHeaderMap = buildHeaderMap(mainSheet, mainHeaderRow);
  const metaHeaderMap = buildHeaderMap(metaSheet, metaHeaderRow);
  const mainColumns: ColumnSpec[] = taskListColumnKeys.map((key) => ({
    key,
    header: options.expectedHeadersByKey[key],
  }));
  const metaReadColumns: ColumnSpec[] = [
    ...META_REQUIRED_COLUMNS.map((key) => ({ key, header: key })),
    ...META_OPTIONAL_COLUMNS.filter((column) => metaHeaderMap.has(column)).map((key) => ({ key, header: key })),
  ];
  const mainRows = collectRows(mainSheet, mainHeaderRow, mainColumns, mainHeaderMap);
  const metaRows = collectRows(metaSheet, metaHeaderRow, metaReadColumns, metaHeaderMap);

  if (mainRows.length !== metaRows.length) {
    failures.push({
      message: `main row count (${mainRows.length}) does not match meta row count (${metaRows.length})`,
    });
  }

  if (options.expectRows !== undefined && mainRows.length !== options.expectRows) {
    failures.push({
      message: `expected ${options.expectRows} data rows, found ${mainRows.length}`,
    });
  }

  verifyWorksheetLayout(mainSheet, failures);
  verifyMainHeaders(mainSheet, mainHeaderRow, expectedMainHeaders, failures);
  verifyMetaHeaders(metaSheet, metaHeaderRow, META_REQUIRED_COLUMNS, failures);

  const rowPairs = Math.min(mainRows.length, metaRows.length);
  const statusLabels = uiCopyCatalog[options.locale].status.labels;
  const yesLabel = uiCopyCatalog[options.locale].system.yes;
  const noLabel = uiCopyCatalog[options.locale].system.no;
  const addFilePrompt = uiCopyCatalog[options.locale].empty.addFilePrompt;
  const moreFilesAvailable = uiCopyCatalog[options.locale].empty.moreFilesAvailable;

  for (let index = 0; index < rowPairs; index += 1) {
    const mainRow = mainRows[index];
    const metaRow = metaRows[index];
    verifyMetaRow(metaRow, mainRow.rowIndex, failures);
    verifyMainRow(mainRow, metaRow, statusLabels, yesLabel, noLabel, addFilePrompt, moreFilesAvailable, failures);
  }

  verifyHierarchyConsistency(metaRows, failures);

  return {
    sourceLabel: options.filePath ?? options.url ?? "unknown",
    sheetCount,
    dataRowCount: mainRows.length,
  };
}

function verifyWorksheetLayout(sheet: ExcelJS.Worksheet, failures: Failure[]) {
  const view = sheet.views?.[0];
  if (!view || view.state !== "frozen" || typeof view.ySplit !== "number" || view.ySplit < 1) {
    failures.push({
      sheet: sheet.name,
      message: "main sheet should freeze the header row",
    });
  }

  const outlineProps = sheet.properties.outlineProperties;
  if (!outlineProps || outlineProps.summaryBelow !== false) {
    failures.push({
      sheet: sheet.name,
      message: "main sheet should set outlineProperties.summaryBelow=false",
    });
  }
}

function verifyMainHeaders(
  sheet: ExcelJS.Worksheet,
  headerRowIndex: number,
  expectedHeaders: string[],
  failures: Failure[],
) {
  const row = sheet.getRow(headerRowIndex);
  expectedHeaders.forEach((expected, index) => {
    const actual = normalizeText(row.getCell(index + 1).text);
    if (actual !== expected) {
      failures.push({
        sheet: sheet.name,
        row: headerRowIndex,
        message: `header ${index + 1} expected '${expected}' but got '${actual}'`,
      });
    }
  });
}

function verifyMetaHeaders(
  sheet: ExcelJS.Worksheet,
  headerRowIndex: number,
  expectedColumns: readonly string[],
  failures: Failure[],
) {
  const row = sheet.getRow(headerRowIndex);
  expectedColumns.forEach((expected, index) => {
    const actual = normalizeText(row.getCell(index + 1).text);
    if (actual !== expected) {
      failures.push({
        sheet: sheet.name,
        row: headerRowIndex,
        message: `meta header ${index + 1} expected '${expected}' but got '${actual}'`,
      });
    }
  });
}

function verifyMetaRow(row: SheetRow, expectedExportRowIndex: number, failures: Failure[]) {
  const exportRowIndex = parseInteger(cellText(row.values.exportRowIndex));
  const depth = parseInteger(cellText(row.values.depth));
  const siblingOrder = parseInteger(cellText(row.values.siblingOrder));
  const taskId = normalizeText(cellText(row.values.taskId));
  const rootTaskId = normalizeText(cellText(row.values.rootTaskId));
  const parentTaskId = normalizeText(cellText(row.values.parentTaskId));
  const hierarchyPath = normalizeText(cellText(row.values.hierarchyPath));
  const actionId = normalizeText(cellText(row.values.actionId));
  const parentActionId = normalizeText(cellText(row.values.parentActionId));

  if (exportRowIndex !== expectedExportRowIndex) {
    failures.push({
      row: row.rowIndex,
      message: `exportRowIndex expected ${expectedExportRowIndex} but got ${exportRowIndex}`,
    });
  }

  if (!taskId) {
    failures.push({
      row: row.rowIndex,
      message: "taskId must not be empty",
    });
  }

  if (!actionId.startsWith("#")) {
    failures.push({
      row: row.rowIndex,
      message: `actionId should be formatted with '#', got '${actionId}'`,
    });
  }

  if (!Number.isInteger(depth) || depth < 0) {
    failures.push({
      row: row.rowIndex,
      message: `depth must be a non-negative integer, got '${cellText(row.values.depth)}'`,
    });
    return;
  }

  if (!Number.isInteger(siblingOrder) || siblingOrder < 0) {
    failures.push({
      row: row.rowIndex,
      message: `siblingOrder must be a non-negative integer, got '${cellText(row.values.siblingOrder)}'`,
    });
  }

  if (!hierarchyPath) {
    failures.push({
      row: row.rowIndex,
      message: "hierarchyPath must not be empty",
    });
  }

  if (depth === 0) {
    if (parentTaskId) {
      failures.push({
        row: row.rowIndex,
        message: "root rows must not have a parentTaskId",
      });
    }

    if (rootTaskId !== taskId) {
      failures.push({
        row: row.rowIndex,
        message: `root rows must have rootTaskId equal to taskId, got '${rootTaskId}'`,
      });
    }
  } else {
    if (!parentTaskId) {
      failures.push({
        row: row.rowIndex,
        message: "child rows must have a parentTaskId",
      });
    }

    if (!parentActionId) {
      failures.push({
        row: row.rowIndex,
        message: "child rows must have a parentActionId",
      });
    }
  }
}

function verifyMainRow(
  row: SheetRow,
  metaRow: SheetRow,
  statusLabels: Record<string, string>,
  yesLabel: string,
  noLabel: string,
  addFilePrompt: string,
  moreFilesAvailable: string,
  failures: Failure[],
) {
  const depth = parseInteger(cellText(metaRow.values.depth));
  const calendarLinkedRaw = normalizeText(cellText(metaRow.values.calendarLinkedRaw));
  const fileCount = parseInteger(cellText(metaRow.values.fileCount));
  const statusRaw = normalizeText(cellText(metaRow.values.statusRaw));
  const statusHistoryRaw = normalizeText(cellText(metaRow.values.statusHistoryRaw));

  const actionId = normalizeText(cellText(row.values.actionId));
  const status = normalizeText(cellText(row.values.status));
  const calendarLinked = normalizeText(cellText(row.values.calendarLinked));
  const statusHistory = cellText(row.values.statusHistory);
  const linkedDocuments = cellText(row.values.linkedDocuments);
  const dueDateCell = row.values.dueDate;
  const reviewedAtCell = row.values.reviewedAt;
  const completedAtCell = row.values.completedAt;

  const actionIdCell = row.values.actionId;
  const issueTitleCell = row.values.issueTitle;
  const calendarLinkedCell = row.values.calendarLinked;
  const worksheetRow = actionIdCell?.worksheet.getRow(row.rowIndex);

  if (!actionId.startsWith("#")) {
    failures.push({
      row: row.rowIndex,
      message: `actionId should be formatted with '#', got '${actionId}'`,
    });
  }

  if (actionIdCell?.font?.name !== "Malgun Gothic") {
    failures.push({
      row: row.rowIndex,
      message: `actionId font should be Malgun Gothic, got '${actionIdCell?.font?.name ?? "<missing>"}'`,
    });
  }

  if (issueTitleCell?.font?.name !== "Malgun Gothic") {
    failures.push({
      row: row.rowIndex,
      message: `issueTitle font should be Malgun Gothic, got '${issueTitleCell?.font?.name ?? "<missing>"}'`,
    });
  }

  if (calendarLinkedCell?.font?.name !== "Segoe UI Symbol") {
    failures.push({
      row: row.rowIndex,
      message: `calendarLinked font should be Segoe UI Symbol, got '${calendarLinkedCell?.font?.name ?? "<missing>"}'`,
    });
  }

  if (!row.values.actionId?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "actionId should wrap text",
    });
  }

  if (!row.values.issueTitle?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "issueTitle should wrap text",
    });
  }

  if (!row.values.issueDetailNote?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "issueDetailNote should wrap text",
    });
  }

  if (!row.values.statusHistory?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "statusHistory should wrap text",
    });
  }

  if (!row.values.decision?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "decision should wrap text",
    });
  }

  if (!row.values.linkedDocuments?.alignment?.wrapText) {
    failures.push({
      row: row.rowIndex,
      message: "linkedDocuments should wrap text",
    });
  }

  if (cellText(dueDateCell) && !isDateCell(dueDateCell)) {
    failures.push({
      row: row.rowIndex,
      message: `dueDate should be stored as a date cell, got '${cellText(dueDateCell)}'`,
    });
  }

  if (cellText(reviewedAtCell) && !isDateCell(reviewedAtCell)) {
    failures.push({
      row: row.rowIndex,
      message: `reviewedAt should be stored as a date cell, got '${cellText(reviewedAtCell)}'`,
    });
  }

  if (isDateCell(completedAtCell)) {
    failures.push({
      row: row.rowIndex,
      message: "completedAt should remain a text cell, not an Excel date",
    });
  }

  if (!row.values.actionId?.alignment || (row.values.actionId.alignment.indent ?? 0) !== depth) {
    failures.push({
      row: row.rowIndex,
      message: `actionId indent should match depth ${depth}, got '${row.values.actionId?.alignment?.indent ?? 0}'`,
    });
  }

  if ((worksheetRow?.outlineLevel ?? 0) !== depth) {
    failures.push({
      row: row.rowIndex,
      message: `row outlineLevel should match depth ${depth}, got '${worksheetRow?.outlineLevel ?? 0}'`,
    });
  }

  if (!row.values.issueTitle?.alignment || (row.values.issueTitle.alignment.indent ?? 0) !== depth) {
    failures.push({
      row: row.rowIndex,
      message: `issueTitle indent should match depth ${depth}, got '${row.values.issueTitle?.alignment?.indent ?? 0}'`,
    });
  }

  if (calendarLinked !== CHECKBOX_TRUE_GLYPH && calendarLinked !== CHECKBOX_FALSE_GLYPH) {
    failures.push({
      row: row.rowIndex,
      message: `calendarLinked should render as '${CHECKBOX_TRUE_GLYPH}' or '${CHECKBOX_FALSE_GLYPH}', got '${calendarLinked}'`,
    });
  }

  const expectedCalendar =
    calendarLinkedRaw === "true" ? CHECKBOX_TRUE_GLYPH : calendarLinkedRaw === "false" ? CHECKBOX_FALSE_GLYPH : null;
  if (expectedCalendar && calendarLinked !== expectedCalendar) {
    failures.push({
      row: row.rowIndex,
      message: `calendarLinked should be '${expectedCalendar}' for raw value '${calendarLinkedRaw}', got '${calendarLinked}'`,
    });
  }

  if (calendarLinked === yesLabel || calendarLinked === noLabel) {
    failures.push({
      row: row.rowIndex,
      message: "calendarLinked should not use localized yes/no text",
    });
  }

  if (statusRaw && status !== statusLabels[statusRaw]) {
    failures.push({
      row: row.rowIndex,
      message: `status should be localized from raw '${statusRaw}', got '${status}'`,
    });
  }

  if (fileCount === 0) {
    if (linkedDocuments) {
      failures.push({
        row: row.rowIndex,
        message: "linkedDocuments should be blank when fileCount is 0",
      });
    }
  } else {
    if (!linkedDocuments) {
      failures.push({
        row: row.rowIndex,
        message: "linkedDocuments should not be blank when fileCount is greater than 0",
      });
    }

    if (
      linkedDocuments === addFilePrompt ||
      linkedDocuments.includes(addFilePrompt) ||
      linkedDocuments.includes(moreFilesAvailable)
    ) {
      failures.push({
        row: row.rowIndex,
        message: "linkedDocuments should not reuse UI CTA copy",
      });
    }
  }

  if (statusHistoryRaw) {
    const rawLineCount = statusHistoryRaw.split(/\r?\n/).length;
    const exportLineCount = statusHistory.split(/\r?\n/).length;
    if (rawLineCount !== exportLineCount) {
      failures.push({
        row: row.rowIndex,
        message: `statusHistory line count mismatch: raw=${rawLineCount}, export=${exportLineCount}`,
      });
    }
  }
}

function verifyHierarchyConsistency(metaRows: SheetRow[], failures: Failure[]) {
  const rowsByTaskId = new Map<string, SheetRow>();

  for (const row of metaRows) {
    const taskId = normalizeText(cellText(row.values.taskId));
    if (taskId) {
      rowsByTaskId.set(taskId, row);
    }
  }

  for (const row of metaRows) {
    const taskId = normalizeText(cellText(row.values.taskId));
    const parentTaskId = normalizeText(cellText(row.values.parentTaskId));
    const rootTaskId = normalizeText(cellText(row.values.rootTaskId));
    const parentActionId = normalizeText(cellText(row.values.parentActionId));
    const depth = parseInteger(cellText(row.values.depth));

    if (!Number.isInteger(depth) || depth < 0 || depth === 0) {
      continue;
    }

    const parentRow = rowsByTaskId.get(parentTaskId);
    if (!parentRow) {
      failures.push({
        row: row.rowIndex,
        message: `missing parent row for task '${taskId}'`,
      });
      continue;
    }

    const parentDepth = parseInteger(cellText(parentRow.values.depth));
    const parentRootTaskId = normalizeText(cellText(parentRow.values.rootTaskId));
    const parentActionIdActual = normalizeText(cellText(parentRow.values.actionId));

    if (parentDepth !== depth - 1) {
      failures.push({
        row: row.rowIndex,
        message: `parent depth mismatch for task '${taskId}': expected ${depth - 1}, got ${parentDepth}`,
      });
    }

    if (parentRootTaskId !== rootTaskId) {
      failures.push({
        row: row.rowIndex,
        message: `rootTaskId mismatch for task '${taskId}'`,
      });
    }

    if (parentActionId && parentActionIdActual !== parentActionId) {
      failures.push({
        row: row.rowIndex,
        message: `parentActionId mismatch for task '${taskId}': expected '${parentActionId}', got '${parentActionIdActual}'`,
      });
    }
  }
}

function collectRows(sheet: ExcelJS.Worksheet, headerRowIndex: number, columns: readonly ColumnSpec[], headerMap: Map<string, number>): SheetRow[] {
  const rows: SheetRow[] = [];
  for (let rowIndex = headerRowIndex + 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const values: RowValues = {};
    for (const column of columns) {
      const columnIndex = headerMap.get(column.header);
      values[column.key] = columnIndex ? row.getCell(columnIndex) : undefined;
    }

    const hasData = Object.values(values).some((cell) => normalizeText(cellText(cell)) !== "");
    if (!hasData) {
      continue;
    }

    rows.push({ rowIndex, values });
  }
  return rows;
}

function buildHeaderMap(sheet: ExcelJS.Worksheet, headerRowIndex: number) {
  const row = sheet.getRow(headerRowIndex);
  const headerMap = new Map<string, number>();

  for (let columnIndex = 1; columnIndex <= row.cellCount; columnIndex += 1) {
    const header = normalizeText(row.getCell(columnIndex).text);
    if (!header) {
      continue;
    }
    headerMap.set(header, columnIndex);
  }

  return headerMap;
}

function findHeaderRow(sheet: ExcelJS.Worksheet, expectedHeaders: readonly string[], maxRowsToScan: number) {
  const limit = Math.min(sheet.rowCount, maxRowsToScan);
  for (let rowIndex = 1; rowIndex <= limit; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const actual = expectedHeaders.map((_header, index) => normalizeText(row.getCell(index + 1).text));
    if (actual.every((value, index) => value === expectedHeaders[index])) {
      return rowIndex;
    }
  }

  return null;
}

function parseArgs(argv: string[]): Options {
  const options: Partial<Options> = {
    metaSheetName: DEFAULT_META_SHEET_NAME,
    locale: "ko",
    expectedHeadersByKey: {},
    requestHeaders: {},
  };
  const requestHeaders: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--file") {
      options.filePath = argv[++index];
      continue;
    }

    if (arg === "--url") {
      options.url = argv[++index];
      continue;
    }

    if (arg === "--main-sheet") {
      options.mainSheetName = argv[++index];
      continue;
    }

    if (arg === "--meta-sheet") {
      options.metaSheetName = argv[++index] ?? DEFAULT_META_SHEET_NAME;
      continue;
    }

    if (arg === "--locale") {
      const locale = argv[++index] as UiLocale;
      if (!(locale in uiCopyCatalog)) {
        throw new Error(`Unsupported locale '${locale}'. Expected one of: ${Object.keys(uiCopyCatalog).join(", ")}`);
      }
      options.locale = locale;
      continue;
    }

    if (arg === "--expect-rows") {
      const raw = argv[++index];
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`--expect-rows must be a non-negative integer, got '${raw}'`);
      }
      options.expectRows = parsed;
      continue;
    }

    if (arg === "--expect-filename") {
      options.expectFilename = argv[++index];
      continue;
    }

    if (arg === "--header") {
      const raw = argv[++index] ?? "";
      const separator = raw.indexOf(":");
      if (separator <= 0) {
        throw new Error(`--header must be in 'Name: value' format, got '${raw}'`);
      }
      const name = raw.slice(0, separator).trim();
      const value = raw.slice(separator + 1).trim();
      requestHeaders[name] = value;
      continue;
    }

    if (arg === "--save") {
      options.savePath = argv[++index];
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  const locale = options.locale ?? "ko";
  const expectedHeadersByKey = Object.fromEntries(
    taskListColumnKeys.map((key) => [key, uiCopyCatalog[locale].fields[key]] as const),
  ) as Record<string, string>;
  options.expectedHeadersByKey = expectedHeadersByKey;
  options.requestHeaders = requestHeaders;
  return options as Options;
}

function printHelp() {
  console.log([
    "Usage:",
    "  npx tsx scripts/task-export-verify.ts --file <path> [--locale ko|en]",
    "  npx tsx scripts/task-export-verify.ts --url <export-endpoint> [--header 'Cookie: ...']",
    "",
    "Options:",
    "  --file <path>          Verify a local exported workbook",
    "  --url <url>            Download an exported workbook and verify it",
    "  --main-sheet <name>    Optional strict main sheet name",
    "  --meta-sheet <name>    Meta sheet name to verify (default: __task_meta)",
    "  --locale <ko|en>       Expected UI locale for field labels (default: ko)",
    "  --expect-rows <n>      Optional expected row count",
    "  --expect-filename <s>  Optional expected filename fragment for --url",
    "  --header <k: v>        Extra HTTP header when using --url; repeatable",
    "  --save <path>          Save downloaded workbook when using --url",
  ].join("\n"));
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function cellText(cell: ExcelJS.Cell | undefined) {
  return normalizeText(cell?.text);
}

function parseInteger(value: unknown) {
  const parsed = Number(normalizeText(value));
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function isDateCell(cell: ExcelJS.Cell | undefined) {
  return cell?.value instanceof Date;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
