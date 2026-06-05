export const themeIds = ["classic", "swiss-modern", "productivity", "posthog", "apple-workbench"] as const;

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
  posthog: {
    id: "posthog",
    dataTheme: "posthog",
    labelKey: "themes.options.posthog.label",
    descriptionKey: "themes.options.posthog.description",
  },
  "apple-workbench": {
    id: "apple-workbench",
    dataTheme: "apple-workbench",
    labelKey: "themes.options.apple-workbench.label",
    descriptionKey: "themes.options.apple-workbench.description",
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
const TASK_LIST_ROW_HEIGHT_KEY_PATTERN = /^[a-zA-Z0-9:_-]{1,160}$/;
const blockedTaskListRowHeightKeys = new Set(["__proto__", "constructor", "prototype"]);
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

  const next: TaskListRowHeightMap = Object.create(null) as TaskListRowHeightMap;

  for (const [key, value] of Object.entries(input)) {
    const safeKey = normalizeTaskListRowHeightKey(key);
    if (!safeKey) continue;
    const height = coerceTaskListRowHeightValue(value);
    if (height === null) continue;
    next[safeKey] = height;
  }

  return next;
}

function normalizeTaskListRowHeightKey(key: string) {
  const normalized = key.trim();
  return TASK_LIST_ROW_HEIGHT_KEY_PATTERN.test(normalized) && !blockedTaskListRowHeightKeys.has(normalized)
    ? normalized
    : "";
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

export const aiReasoningEfforts = ["minimal", "low", "medium", "high"] as const;
export const aiServiceTiers = ["auto", "default", "priority"] as const;
export const aiLocalUsageRangeDays = [30, 90, 0] as const;

export type AiReasoningEffort = (typeof aiReasoningEfforts)[number];
export type AiServiceTier = (typeof aiServiceTiers)[number];
export type AiLocalUsageRangeDays = (typeof aiLocalUsageRangeDays)[number];

export type AiSettingsPreference = {
  aiDefaultModel: string;
  aiReasoningEffort: AiReasoningEffort;
  aiServiceTier: AiServiceTier;
  aiRequestTimeoutMs: number;
  aiLocalUsageDefaultRangeDays: AiLocalUsageRangeDays;
};

export const AI_REQUEST_TIMEOUT_MIN_MS = 30000;
export const AI_REQUEST_TIMEOUT_MAX_MS = 120000;
export const DEFAULT_AI_SETTINGS_PREFERENCE: AiSettingsPreference = {
  aiDefaultModel: "gpt-5-codex",
  aiReasoningEffort: "medium",
  aiServiceTier: "auto",
  aiRequestTimeoutMs: AI_REQUEST_TIMEOUT_MAX_MS,
  aiLocalUsageDefaultRangeDays: 30,
};

const AI_MODEL_PATTERN = /^[A-Za-z0-9._:-]{1,80}$/;

export function isAiReasoningEffort(value: unknown): value is AiReasoningEffort {
  return typeof value === "string" && aiReasoningEfforts.includes(value as AiReasoningEffort);
}

export function isAiServiceTier(value: unknown): value is AiServiceTier {
  return typeof value === "string" && aiServiceTiers.includes(value as AiServiceTier);
}

export function isAiLocalUsageRangeDays(value: unknown): value is AiLocalUsageRangeDays {
  return typeof value === "number" && aiLocalUsageRangeDays.includes(value as AiLocalUsageRangeDays);
}

function sanitizeAiModel(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_AI_SETTINGS_PREFERENCE.aiDefaultModel;
  }

  const normalized = value.trim();
  return AI_MODEL_PATTERN.test(normalized) ? normalized : DEFAULT_AI_SETTINGS_PREFERENCE.aiDefaultModel;
}

function sanitizeAiRequestTimeoutMs(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) {
    return DEFAULT_AI_SETTINGS_PREFERENCE.aiRequestTimeoutMs;
  }

  return Math.max(AI_REQUEST_TIMEOUT_MIN_MS, Math.min(AI_REQUEST_TIMEOUT_MAX_MS, Math.round(numeric)));
}

function sanitizeAiLocalUsageRangeDays(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return isAiLocalUsageRangeDays(numeric) ? numeric : DEFAULT_AI_SETTINGS_PREFERENCE.aiLocalUsageDefaultRangeDays;
}

export function sanitizeAiSettingsPreference(input: unknown): AiSettingsPreference {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_AI_SETTINGS_PREFERENCE };
  }

  const preference = input as Partial<Record<keyof AiSettingsPreference, unknown>>;
  return {
    aiDefaultModel: sanitizeAiModel(preference.aiDefaultModel),
    aiReasoningEffort: isAiReasoningEffort(preference.aiReasoningEffort)
      ? preference.aiReasoningEffort
      : DEFAULT_AI_SETTINGS_PREFERENCE.aiReasoningEffort,
    aiServiceTier: isAiServiceTier(preference.aiServiceTier)
      ? preference.aiServiceTier
      : DEFAULT_AI_SETTINGS_PREFERENCE.aiServiceTier,
    aiRequestTimeoutMs: sanitizeAiRequestTimeoutMs(preference.aiRequestTimeoutMs),
    aiLocalUsageDefaultRangeDays: sanitizeAiLocalUsageRangeDays(preference.aiLocalUsageDefaultRangeDays),
  };
}
