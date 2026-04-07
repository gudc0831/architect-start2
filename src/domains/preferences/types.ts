export const themeIds = ["classic", "swiss-modern", "productivity"] as const;

export type ThemeId = (typeof themeIds)[number];
export type ThemePreference = {
  themeId: ThemeId;
};

export type ThemeDefinition = {
  id: ThemeId;
  dataTheme: ThemeId;
  labelKey: `themes.options.${ThemeId}.label`;
  descriptionKey: `themes.options.${ThemeId}.description`;
};

export const DEFAULT_THEME_ID: ThemeId = "classic";

export const themeDefinitions = {
  classic: {
    id: "classic",
    dataTheme: "classic",
    labelKey: "themes.options.classic.label",
    descriptionKey: "themes.options.classic.description",
  },
  "swiss-modern": {
    id: "swiss-modern",
    dataTheme: "swiss-modern",
    labelKey: "themes.options.swiss-modern.label",
    descriptionKey: "themes.options.swiss-modern.description",
  },
  productivity: {
    id: "productivity",
    dataTheme: "productivity",
    labelKey: "themes.options.productivity.label",
    descriptionKey: "themes.options.productivity.description",
  },
} satisfies Record<ThemeId, ThemeDefinition>;

export const orderedThemeDefinitions = themeIds.map((themeId) => themeDefinitions[themeId]);

export function isThemeId(value: string): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

export function sanitizeThemeId(input: unknown): ThemeId {
  if (typeof input === "string" && isThemeId(input)) {
    return input;
  }

  return DEFAULT_THEME_ID;
}

export function sanitizeThemePreference(input: unknown): ThemePreference {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { themeId: DEFAULT_THEME_ID };
  }

  const value = input as { themeId?: unknown };
  return { themeId: sanitizeThemeId(value.themeId) };
}

export const quickCreateFieldKeys = [
  "actionId",
  "dueDate",
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "assignee",
  "issueTitle",
  "reviewedAt",
  "locationRef",
  "calendarLinked",
  "issueDetailNote",
  "status",
  "decision",
] as const;

export type QuickCreateFieldKey = (typeof quickCreateFieldKeys)[number];
export type QuickCreateWidthMap = Partial<Record<QuickCreateFieldKey, number>>;
export type ResolvedQuickCreateWidthMap = Record<QuickCreateFieldKey, number>;
export const taskListColumnKeys = [
  "actionId",
  "dueDate",
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "assignee",
  "issueTitle",
  "reviewedAt",
  "locationRef",
  "calendarLinked",
  "issueDetailNote",
  "status",
  "decision",
  "linkedDocuments",
] as const;

export type TaskListColumnKey = (typeof taskListColumnKeys)[number];
export type TaskListColumnWidthMap = Partial<Record<TaskListColumnKey, number>>;
export type ResolvedTaskListColumnWidthMap = Record<TaskListColumnKey, number>;
export type TaskListRowHeightMap = Record<string, number>;
export type TaskListLayoutPreference = {
  columnWidths: TaskListColumnWidthMap;
  rowHeights: TaskListRowHeightMap;
  detailPanelWidth: number;
};

export const QUICK_CREATE_MIN_WIDTH = 16;
export const QUICK_CREATE_MAX_WIDTH = 2400;
export const TASK_LIST_COLUMN_MIN_WIDTH = 16;
export const TASK_LIST_COLUMN_MAX_WIDTH = 2400;
export const TASK_LIST_ROW_MIN_HEIGHT = 52;
export const TASK_LIST_ROW_MAX_HEIGHT = 2400;
export const DETAIL_PANEL_DEFAULT_WIDTH = 340;
export const DETAIL_PANEL_MIN_WIDTH = 280;
export const DETAIL_PANEL_MAX_WIDTH = 560;

export const quickCreateDefaultWidths: ResolvedQuickCreateWidthMap = {
  actionId: 132,
  dueDate: 152,
  workType: 160,
  coordinationScope: 160,
  requestedBy: 160,
  relatedDisciplines: 168,
  assignee: 168,
  issueTitle: 200,
  reviewedAt: 152,
  locationRef: 168,
  calendarLinked: 104,
  issueDetailNote: 200,
  status: 160,
  decision: 180,
};

export const taskListDefaultColumnWidths: ResolvedTaskListColumnWidthMap = {
  actionId: 164,
  dueDate: 132,
  workType: 180,
  coordinationScope: 200,
  requestedBy: 160,
  relatedDisciplines: 200,
  assignee: 160,
  issueTitle: 360,
  reviewedAt: 132,
  locationRef: 180,
  calendarLinked: 100,
  issueDetailNote: 420,
  status: 128,
  decision: 320,
  linkedDocuments: 260,
};

export function isQuickCreateFieldKey(value: string): value is QuickCreateFieldKey {
  return quickCreateFieldKeys.includes(value as QuickCreateFieldKey);
}

export function isTaskListColumnKey(value: string): value is TaskListColumnKey {
  return taskListColumnKeys.includes(value as TaskListColumnKey);
}

export function clampQuickCreateWidth(value: number) {
  return Math.max(QUICK_CREATE_MIN_WIDTH, Math.min(QUICK_CREATE_MAX_WIDTH, Math.round(value)));
}

export function clampTaskListColumnWidth(value: number) {
  return Math.max(TASK_LIST_COLUMN_MIN_WIDTH, Math.min(TASK_LIST_COLUMN_MAX_WIDTH, Math.round(value)));
}

export function clampTaskListRowHeight(value: number) {
  return Math.max(TASK_LIST_ROW_MIN_HEIGHT, Math.min(TASK_LIST_ROW_MAX_HEIGHT, Math.round(value)));
}

export function clampDetailPanelWidth(value: number) {
  return Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, Math.round(value)));
}

function coerceClampedNumber(value: unknown, clampValue: (value: number) => number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampValue(value);
  }

  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return clampValue(numeric);
    }
  }

  return null;
}

function coerceQuickCreateWidthValue(value: unknown) {
  return coerceClampedNumber(value, clampQuickCreateWidth);
}

function coerceTaskListColumnWidthValue(value: unknown) {
  return coerceClampedNumber(value, clampTaskListColumnWidth);
}

function coerceTaskListRowHeightValue(value: unknown) {
  return coerceClampedNumber(value, clampTaskListRowHeight);
}

function coerceDetailPanelWidthValue(value: unknown) {
  return coerceClampedNumber(value, clampDetailPanelWidth);
}

export function sanitizeQuickCreateWidths(input: unknown): QuickCreateWidthMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const next: QuickCreateWidthMap = {};

  for (const [key, value] of Object.entries(input)) {
    if (!isQuickCreateFieldKey(key)) continue;
    const width = coerceQuickCreateWidthValue(value);
    if (width === null) continue;
    next[key] = width;
  }

  return next;
}

export function resolveQuickCreateWidths(input?: QuickCreateWidthMap): ResolvedQuickCreateWidthMap {
  const sanitized = sanitizeQuickCreateWidths(input);
  return quickCreateFieldKeys.reduce((acc, key) => {
    acc[key] = sanitized[key] ?? quickCreateDefaultWidths[key];
    return acc;
  }, { ...quickCreateDefaultWidths });
}

export function sanitizeTaskListColumnWidths(input: unknown): TaskListColumnWidthMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const next: TaskListColumnWidthMap = {};

  for (const [key, value] of Object.entries(input)) {
    if (!isTaskListColumnKey(key)) continue;
    const width = coerceTaskListColumnWidthValue(value);
    if (width === null) continue;
    next[key] = width;
  }

  return next;
}

export function resolveTaskListColumnWidths(input?: TaskListColumnWidthMap): ResolvedTaskListColumnWidthMap {
  const sanitized = sanitizeTaskListColumnWidths(input);
  return taskListColumnKeys.reduce((acc, key) => {
    acc[key] = sanitized[key] ?? taskListDefaultColumnWidths[key];
    return acc;
  }, { ...taskListDefaultColumnWidths });
}

export function sanitizeTaskListRowHeights(input: unknown): TaskListRowHeightMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const next: TaskListRowHeightMap = {};

  for (const [key, value] of Object.entries(input)) {
    if (!key.trim()) continue;
    const height = coerceTaskListRowHeightValue(value);
    if (height === null) continue;
    next[key] = height;
  }

  return next;
}

export function sanitizeTaskListLayoutPreference(input: unknown): TaskListLayoutPreference {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { columnWidths: {}, rowHeights: {}, detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH };
  }

  const layout = input as { columnWidths?: unknown; rowHeights?: unknown; detailPanelWidth?: unknown };
  return {
    columnWidths: sanitizeTaskListColumnWidths(layout.columnWidths),
    rowHeights: sanitizeTaskListRowHeights(layout.rowHeights),
    detailPanelWidth: coerceDetailPanelWidthValue(layout.detailPanelWidth) ?? DETAIL_PANEL_DEFAULT_WIDTH,
  };
}

export function resolveDetailPanelWidth(input?: unknown) {
  return coerceDetailPanelWidthValue(input) ?? DETAIL_PANEL_DEFAULT_WIDTH;
}
