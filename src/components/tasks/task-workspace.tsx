"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type {
  CSSProperties,
  ChangeEvent as ReactChangeEvent,
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SelectHTMLAttributes,
} from "react";
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  getTaskCategoricalFieldOptions,
  labelForTaskCategoricalFieldValue,
  serializeTaskCategoryValues,
  TaskCategoricalFieldMultiSelect,
  TaskCategoricalFieldSelect,
  type TaskCategoricalFieldKey,
} from "@/components/tasks/task-categorical-fields";
import { BoardTaskOverview } from "@/components/tasks/board-task-overview";
import { DailyGridBodyV2 } from "@/components/tasks/daily-grid-body-v2";
import { DailyGridHeaderV2 } from "@/components/tasks/daily-grid-header-v2";
import { createTaskEditorDraftStore, useTaskEditorDraftStoreSnapshot, type TaskEditorDraftStore } from "@/components/tasks/task-editor-draft-store";
import { createTaskGridDomRegistry, createTaskGridCellKey } from "@/components/tasks/task-grid-dom-registry";
import { createTaskListRowMetricsStore } from "@/components/tasks/task-grid-metrics-store";
import { TaskInlineEditorOverlay } from "@/components/tasks/task-inline-editor-overlay";
import { TaskListCategoricalHeaderFilter as TaskListCategoricalHeaderFilterPopover } from "@/components/tasks/task-list-categorical-header-filter";
import { TaskListOrderHeaderMenu } from "@/components/tasks/task-list-order-header-menu";
import { TaskFocusStrip } from "@/components/tasks/task-focus-strip";
import { TaskPreviewCard } from "@/components/tasks/task-preview-card";
import { TaskQuickCreate } from "@/components/tasks/task-quick-create";
import type { TaskQuickCreateFormValues } from "@/components/tasks/task-quick-create-state";
import { useAuthUser } from "@/providers/auth-provider";
import { useDashboardData, useDashboardScope } from "@/providers/dashboard-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { useTheme } from "@/providers/theme-provider";
import type { ProjectMembershipRole } from "@/domains/admin/types";
import { getFilePreviewKind, isFilePreviewable } from "@/domains/file/metadata";
import { canEditProjectWorkspace } from "@/lib/auth/project-capabilities";
import type { CalendarHolidayRangeData } from "@/lib/tasks/calendar-holiday-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import koreanPublicHolidays from "@/lib/tasks/korean-public-holidays";
import {
  matchesTaskCategoricalFilter,
  normalizeTaskCategoricalFilterSelection,
} from "@/lib/task-categorical-filter";
import {
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { DEFAULT_TASK_STATUS, isTaskStatus, TASK_STATUS_ORDER } from "@/domains/task/status";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { DashboardMode, FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { extractProjectIssueNumber } from "@/domains/task/identifiers";
import { buildStoredOrderTaskTree } from "@/domains/task/ordering";
import {
  buildTaskTreePages,
  buildTaskTreeRows,
  dailyTaskListColumns,
  formatActionId,
  formatTaskDisplayId,
  formatDateTimeField,
  sortTasksByActionId,
  type DailyTaskListColumnConfig as TaskListColumnConfig,
  type DailyTaskTreePage,
  type DailyListViewMode,
  type DailyTaskSortMode,
  type TaskTreeRow,
} from "@/domains/task/daily-list";
import {
  DETAIL_PANEL_DEFAULT_WIDTH,
  DETAIL_PANEL_MAX_WIDTH,
  DETAIL_PANEL_MIN_WIDTH,
  TASK_LIST_ROW_MIN_HEIGHT,
  clampDetailPanelWidth,
  clampQuickCreateWidth,
  clampTaskListColumnWidth,
  clampTaskListRowHeight,
  quickCreateDefaultWidths,
  resolveDetailPanelWidth,
  resolveQuickCreateWidths,
  resolveTaskListColumnWidths,
  sanitizeQuickCreateWidths,
  sanitizeTaskListLayoutPreference,
  taskListDefaultColumnWidths,
  type QuickCreateFieldKey,
  type QuickCreateWidthMap,
  type ResolvedQuickCreateWidthMap,
  type ResolvedTaskListColumnWidthMap,
  type TaskListColumnKey,
  type TaskListLayoutPreference,
  type TaskListRowHeightMap,
} from "@/domains/preferences/types";
import {
  DEFAULT_UI_LOCALE_TAG,
  describeStatus,
  getWeekdayLabelByIndex,
  getWorkTypeSelectValue,
  labelForDataMode,
  labelForField,
  labelForMode,
  labelForProjectSource,
  labelForStatus,
  labelForWorkType,
  labelForUploadMode,
  localizeError,
  t,
  type ErrorCopyKey,
} from "@/lib/ui-copy";

type TaskWorkspaceProps = { mode: DashboardMode };
type DetailPanelState = "collapsed" | "expanded";
type TaskFormLayoutVariant = "detail" | "composer";
type ComposerLayoutMode = "strip" | "wrapped" | "stacked";

type TaskFormState = {
  actionId: string;
  issueId: string;
  dueDate: string;
  workType: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requestedBy: string;
  relatedDisciplines: string;
  assignee: string;
  assigneeProfileId: string | null;
  issueTitle: string;
  reviewedAt: string;
  updatedAt: string;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  decision: string;
  isDaily: boolean;
};

type TaskFormReadonly = Partial<Record<Exclude<keyof TaskFormState, "isDaily">, boolean>>;
type DraftDirtyField = EditableTaskFormKey | "parentTaskNumber";
type DraftDirtyFieldMap = Partial<Record<DraftDirtyField, true>>;
type TaskFocusKey = "in_review" | "in_discussion" | "blocked" | "overdue";
type TaskDropPosition = "before" | "after";
type TaskDragState = {
  taskId: string;
  parentTaskId: string | null;
};
type TaskDropState = {
  taskId: string;
  position: TaskDropPosition;
};

type TaskReorderClientCommand =
  | {
      action: "manual_move";
      movedTaskId: string;
      targetParentTaskId: string | null;
      targetIndex: number;
    }
  | {
      action: "auto_sort";
      strategy: "priority" | "action_id";
    };

type TaskDetailPanelInteractionState = {
  selectedTaskId: string | null;
  isDetailExpanded: boolean;
};

type TaskFormDisplayState = {
  actionId?: string | number | null;
  issueId?: string | null;
  dueDate: string;
  workType: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requestedBy: string;
  relatedDisciplines: string;
  assignee: string;
  assigneeProfileId?: string | null;
  issueTitle: string;
  reviewedAt: string;
  updatedAt?: string | null;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  decision: string;
};

type EditableTaskFormKey =
  | "dueDate"
  | "workType"
  | "coordinationScope"
  | "requestedBy"
  | "relatedDisciplines"
  | "assignee"
  | "assigneeProfileId"
  | "issueTitle"
  | "reviewedAt"
  | "locationRef"
  | "calendarLinked"
  | "issueDetailNote"
  | "status"
  | "decision";

type TaskFormChangeHandler = <K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) => void;

type AssigneeOption = {
  profileId: string;
  displayName: string;
  email: string;
  role: ProjectMembershipRole;
};

type QuickCreateResizeState = {
  fieldKey: QuickCreateFieldKey;
  startX: number;
  startWidth: number;
};

type TaskListColumnResizeState = {
  columnKey: TaskListColumnKey;
  startX: number;
  startWidth: number;
};

type TaskListRowResizeState = {
  taskId: string;
  startY: number;
  startHeight: number;
  currentHeight: number;
  pendingHeight: number;
};

type DetailPanelResizeState = {
  startX: number;
  startWidth: number;
};

type LinkedDocumentsDisplay = {
  primary: string;
  secondary: string | null;
};

const EMPTY_TASK_FILES: readonly FileRecord[] = [];

type TaskCategoricalFormFieldKey = Extract<EditableTaskFormKey, TaskCategoricalFieldKey>;
type TaskListEditableDateFieldKey = Extract<EditableTaskFormKey, "dueDate" | "reviewedAt">;
type TaskListEditableTextFieldKey = Exclude<
  EditableTaskFormKey,
  "calendarLinked" | "assigneeProfileId" | TaskCategoricalFieldKey | "dueDate" | "reviewedAt"
>;
type DailyCategoricalFilterFieldKey = Extract<
  TaskCategoricalFieldKey,
  "workType" | "coordinationScope" | "requestedBy" | "relatedDisciplines" | "locationRef" | "status"
>;
type DailyCategoricalFilterMap = Partial<Record<DailyCategoricalFilterFieldKey, string[]>>;

type TaskListRowPresentationContext = {
  task: TaskRecord;
  row: TaskTreeRow;
  rowDraft: TaskRecord | null;
  activeInlineColumnKey: TaskListColumnKey | null;
  linkedDocumentsDisplay: LinkedDocumentsDisplay;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
};

type TaskListCellPresentation =
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
type PendingTaskListFocusCell = {
  taskId: string;
  columnKey: TaskListColumnKey;
};

type TaskListRowInteractionState = {
  selectedTaskId: string | null;
  activeInlineEditCell: PendingTaskListFocusCell | null;
  taskDropState: TaskDropState | null;
  focusedTaskIds: ReadonlySet<string> | null;
};

type TaskListDesktopViewportState = {
  scrollTop: number;
  height: number;
};

type TaskListLiveRowHeight = {
  taskId: string;
  height: number;
};

type TaskListLayoutSnapshot = {
  rowHeights: TaskListRowHeightMap;
  viewport: TaskListDesktopViewportState;
  liveRowHeight: TaskListLiveRowHeight | null;
};

type TaskListRowInteractionSnapshot = {
  isSelectedRow: boolean;
  activeInlineColumnKey: TaskListColumnKey | null;
  taskDropPosition: TaskDropPosition | null;
  isDimmedRow: boolean;
};

type TaskListRowInteractionStore = {
  subscribe: (listener: () => void) => () => void;
  getState: () => TaskListRowInteractionState;
  subscribeToTask: (taskId: string, listener: () => void) => () => void;
  getTaskSnapshot: (taskId: string) => TaskListRowInteractionSnapshot;
  setState: (state: Partial<TaskListRowInteractionState>) => void;
};

type TaskListLayoutStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => TaskListLayoutSnapshot;
  replaceRowHeights: (rowHeights: TaskListRowHeightMap) => void;
  setViewportState: (viewport: TaskListDesktopViewportState) => void;
  setLiveRowHeight: (liveRowHeight: TaskListLiveRowHeight | null) => void;
};

type DailyTaskTableWindowItem =
  | {
      kind: "spacer";
      key: string;
      height: number;
    }
  | {
      kind: "row";
      row: TaskTreeRow;
    };

type DailyTaskTableRowProps = {
  row: TaskTreeRow;
  taskFiles: readonly FileRecord[];
  rowHeight: number;
  currentDayKey: string;
  hideIssueIdOverdueBadge: boolean;
  interactionStore: TaskListRowInteractionStore;
  isManualReorderDisabled: boolean;
  isHtmlDragReorderDisabled: boolean;
  isPreviewReadOnly: boolean;
  isReorderingTasks: boolean;
  rowDraft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  registerTaskListRowCellRef: (taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => void;
  focusTaskListEditableCell: (taskId: string, columnKey: TaskListColumnKey) => void;
  updateDraftForm: TaskFormChangeHandler;
  saveInlineTaskListField: (columnKey: TaskListColumnKey) => Promise<void> | void;
  moveTaskByOffset: (taskId: string, offset: -1 | 1) => Promise<void> | void;
  handleTaskRowDragStart: (task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) => void;
  handleTaskRowDragOver: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => void;
  handleTaskRowDrop: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => Promise<void> | void;
  clearTaskDragInteraction: () => void;
  handleTaskListRowAutoFitDoubleClick: (taskId: string, event: ReactMouseEvent<HTMLElement>) => void;
  handleTaskListRowResizeStart: (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectTask: (taskId: string) => void;
};

type DailyTaskTableBodyProps = {
  rows: readonly TaskTreeRow[];
  pinnedTaskIds: ReadonlySet<string>;
  shouldVirtualize: boolean;
  layoutStore: TaskListLayoutStore;
  interactionStore: TaskListRowInteractionStore;
  filesByTaskId: Record<string, FileRecord[]>;
  focusedTaskIds: ReadonlySet<string> | null;
  currentDayKey: string;
  hideIssueIdOverdueBadge: boolean;
  isManualReorderDisabled: boolean;
  isHtmlDragReorderDisabled: boolean;
  isPreviewReadOnly: boolean;
  isReorderingTasks: boolean;
  activeTaskListInlineEditRowId: string | null;
  draft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  registerTaskListRowCellRef: (taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => void;
  focusTaskListEditableCell: (taskId: string, columnKey: TaskListColumnKey) => void;
  updateDraftForm: TaskFormChangeHandler;
  saveInlineTaskListField: (columnKey: TaskListColumnKey) => Promise<void> | void;
  moveTaskByOffset: (taskId: string, offset: -1 | 1) => Promise<void> | void;
  handleTaskRowDragStart: (task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) => void;
  handleTaskRowDragOver: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => void;
  handleTaskRowDrop: (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => Promise<void> | void;
  clearTaskDragInteraction: () => void;
  handleTaskListRowAutoFitDoubleClick: (taskId: string, event: ReactMouseEvent<HTMLElement>) => void;
  handleTaskListRowResizeStart: (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectTask: (taskId: string) => void;
};

type TrashTaskItem = {
  kind: "task";
  id: string;
  deletedAt: string | null;
  task: TaskRecord;
};

type TrashFileItem = {
  kind: "file";
  id: string;
  deletedAt: string | null;
  file: FileRecord;
};

type TrashItem = TrashTaskItem | TrashFileItem;
type BoardCollapsedStatusMap = Partial<Record<TaskStatus, true>>;
type UploadIntentResponse = {
  uploadMode?: "direct" | "relay" | string;
  projectId?: string | null;
  taskId?: string | null;
  sourceFileId?: string | null;
  bucket?: string | null;
  storageBucket?: string | null;
  objectPath?: string | null;
  fileGroupId?: string | null;
  nextVersion?: number | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};
const WIDE_BREAKPOINT = 1440;
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1100;
const DETAIL_PANEL_BREAKPOINT = 1360;
const dailyCategoricalFilterFieldKeys = [
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "locationRef",
  "status",
] as const satisfies readonly DailyCategoricalFilterFieldKey[];
const statusOrder: TaskStatus[] = [...TASK_STATUS_ORDER];
const statusLabel: Record<TaskStatus, string> = {
  new: labelForStatus("new"),
  in_review: labelForStatus("in_review"),
  in_discussion: labelForStatus("in_discussion"),
  blocked: labelForStatus("blocked"),
  done: labelForStatus("done"),
};
const calendarWeekdayColumns = Array.from({ length: 7 }, (_unused, index) => ({
  index,
  label: getWeekdayLabelByIndex(index),
  isHoliday: index === 0,
}));
const QUICK_CREATE_WIDTH_STORAGE_KEY_PREFIX = "architect-start.quick-create-widths:";
const QUICK_CREATE_SAVE_DELAY_MS = 250;
const TASK_LIST_LAYOUT_STORAGE_KEY_PREFIX = "architect-start.task-list-layout:";
const BOARD_COLUMN_STORAGE_KEY_PREFIX = "architect-start.board-columns:";
const CATEGORICAL_FILTER_STORAGE_KEY_PREFIX = "architect-start.categorical-filter:";
const DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE = "hide-issue-id-overdue-badge";
const DAILY_VIEW_PREFERENCE_LIST_VIEW_MODE = "list-view-mode";
const DAILY_TASK_PAGE_SIZE = 50;
const DAILY_TASK_TABLE_VIRTUAL_OVERSCAN = 2;
const DAILY_TASK_TABLE_ROW_CHROME_HEIGHT = 1;
const BOARD_DEFAULT_COLLAPSED_STATUSES: readonly TaskStatus[] = ["done"];
const USE_MEMOIZED_DAILY_TASK_ROWS = true;
const USE_DAILY_GRID_BODY_V2 = true;
const BOARD_PAGE_SIZE_MOBILE = 4;
const BOARD_PAGE_SIZE_DEFAULT = 6;
const TASK_LIST_LAYOUT_SAVE_DELAY_MS = 250;
const DETAIL_PANEL_RESIZE_KEYBOARD_STEP = 24;
const editableTaskFormKeys = [
  "dueDate",
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "assignee",
  "assigneeProfileId",
  "issueTitle",
  "reviewedAt",
  "locationRef",
  "calendarLinked",
  "issueDetailNote",
  "status",
  "decision",
] as const satisfies readonly EditableTaskFormKey[];
const allDraftDirtyFields = [...editableTaskFormKeys, "parentTaskNumber"] as const satisfies readonly DraftDirtyField[];
const editableTaskListFieldByColumn = {
  dueDate: "dueDate",
  workType: "workType",
  coordinationScope: "coordinationScope",
  requestedBy: "requestedBy",
  relatedDisciplines: "relatedDisciplines",
  assignee: "assignee",
  issueTitle: "issueTitle",
  reviewedAt: "reviewedAt",
  locationRef: "locationRef",
  calendarLinked: "calendarLinked",
  issueDetailNote: "issueDetailNote",
  status: "status",
  decision: "decision",
} as const satisfies Partial<Record<TaskListColumnKey, EditableTaskFormKey>>;
const defaultForm = (): TaskFormState => ({
  actionId: "",
  issueId: "",
  dueDate: todayKey(),
  workType: "coordination",
  coordinationScope: "",
  ownerDiscipline: "\uAC74\uCD95",
  requestedBy: "",
  relatedDisciplines: "",
  assignee: "",
  assigneeProfileId: null,
  issueTitle: "",
  reviewedAt: "",
  updatedAt: "",
  locationRef: "",
  calendarLinked: false,
  issueDetailNote: "",
  status: DEFAULT_TASK_STATUS,
  decision: "",
  isDaily: true,
});

const createReadonlyFields: TaskFormReadonly = {
  actionId: true,
  updatedAt: true,
};
const readonlyWorkspaceFields = {
  ...Object.fromEntries(editableTaskFormKeys.map((field) => [field, true])),
  actionId: true,
  updatedAt: true,
} as TaskFormReadonly;

export function TaskWorkspace({ mode }: TaskWorkspaceProps) {
  const authUser = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const { themeId } = useTheme();
  const isWarmStudio = themeId === "posthog";
  const isPreviewDaily = isPreview && mode === "daily";
  const basePath = isPreview ? "/preview" : "";
  const searchParams = useSearchParams();
  const focusTaskId = searchParams.get("taskId");
  const calendarMonthQuery = searchParams.get("month");
  const {
    currentProjectId,
    currentProjectRole,
    projectName,
    projectLoaded,
    projectSource,
    isSyncing,
    workTypeDefinitions,
    categoryDefinitionsByField,
    workTypesLoaded,
  } = useProjectMeta();
  const [selectedTrashTaskIds, setSelectedTrashTaskIds] = useState<string[]>([]);
  const [selectedTrashFileIds, setSelectedTrashFileIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<TaskRecord | null>(null);
  const [draftDirtyFields, setDraftDirtyFields] = useState<DraftDirtyFieldMap>({});
  const [parentTaskNumberDraft, setParentTaskNumberDraft] = useState("");
  const [selectedCategoricalFilters, setSelectedCategoricalFilters] = useState<DailyCategoricalFilterMap>({});
  const [draftCategoricalFilters, setDraftCategoricalFilters] = useState<DailyCategoricalFilterMap>({});
  const [openCategoricalFilterField, setOpenCategoricalFilterField] = useState<DailyCategoricalFilterFieldKey | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingVersionUpload, setPendingVersionUpload] = useState<File | null>(null);
  const [versionTargetId, setVersionTargetId] = useState("");
  const [activePreviewFileId, setActivePreviewFileId] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isReorderingTasks, setIsReorderingTasks] = useState(false);
  const [calendarHolidayDateKeys, setCalendarHolidayDateKeys] = useState<string[] | null>(null);
  const [calendarHolidayLoadedMonths, setCalendarHolidayLoadedMonths] = useState<string[] | null>(null);
  const [inlineSavingFields, setInlineSavingFields] = useState<Partial<Record<TaskListColumnKey, boolean>>>({});
  const [taskSortMode, setTaskSortMode] = useState<DailyTaskSortMode>("manual");
  const [isTaskOrderMenuOpen, setIsTaskOrderMenuOpen] = useState(false);
  const [taskFocusKey, setTaskFocusKey] = useState<TaskFocusKey | null>(null);
  const [hideIssueIdOverdueBadge, setHideIssueIdOverdueBadge] = useState(false);
  const [dailyListViewMode, setDailyListViewMode] = useState<DailyListViewMode>("full");
  const [dailyTaskPage, setDailyTaskPage] = useState(1);
  const [collapsedBoardStatuses, setCollapsedBoardStatuses] = useState<BoardCollapsedStatusMap>(() => createDefaultBoardCollapsedStatusMap());
  const [boardPageByStatus, setBoardPageByStatus] = useState<Partial<Record<TaskStatus, number>>>({});
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [expandedBoardTaskId, setExpandedBoardTaskId] = useState<string | null>(null);
  const [taskDragState, setTaskDragState] = useState<TaskDragState | null>(null);
  const [pendingTaskListFocusCell, setPendingTaskListFocusCell] = useState<PendingTaskListFocusCell | null>(null);
  const [viewportWidth, setViewportWidth] = useState(WIDE_BREAKPOINT);
  const [hasViewportSync, setHasViewportSync] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(true);
  const [hasInitializedCreateForm, setHasInitializedCreateForm] = useState(false);
  const [detailPanelState, setDetailPanelState] = useState<DetailPanelState>("collapsed");
  const [isDetailPanelSticky, setIsDetailPanelSticky] = useState(false);
  const [canHoverDetails, setCanHoverDetails] = useState(false);
  const [quickCreateWidths, setQuickCreateWidths] = useState<ResolvedQuickCreateWidthMap>(() => resolveQuickCreateWidths());
  const [taskListColumnWidths, setTaskListColumnWidths] = useState<ResolvedTaskListColumnWidthMap>(() => resolveTaskListColumnWidths());
  const taskListLayoutStore = useMemo(() => createTaskListLayoutStore(), []);
  const taskListRowMetricsStore = useMemo(() => createTaskListRowMetricsStore(), []);
  const taskListRowInteractionStore = useMemo(() => createTaskListRowInteractionStore(), []);
  const taskGridDomRegistry = useMemo(() => createTaskGridDomRegistry(), []);
  const taskEditorDraftStore = useMemo(() => createTaskEditorDraftStore<TaskRecord>(), []);
  const { activeInlineEditCell: activeTaskListInlineEditCell, selectedTaskId } =
    useTaskListRowInteractionSnapshot(taskListRowInteractionStore);
  const activeTaskListInlineEditRowId = activeTaskListInlineEditCell?.taskId ?? null;
  const [detailPanelWidth, setDetailPanelWidth] = useState(DETAIL_PANEL_DEFAULT_WIDTH);
  const quickCreateWidthsRef = useRef<ResolvedQuickCreateWidthMap>(resolveQuickCreateWidths());
  const taskListColumnWidthsRef = useRef<ResolvedTaskListColumnWidthMap>(resolveTaskListColumnWidths());
  const taskListRowHeightsRef = useRef<TaskListRowHeightMap>({});
  const detailPanelWidthRef = useRef(DETAIL_PANEL_DEFAULT_WIDTH);
  const quickCreateResizeStateRef = useRef<QuickCreateResizeState | null>(null);
  const taskListColumnResizeStateRef = useRef<TaskListColumnResizeState | null>(null);
  const taskListRowResizeStateRef = useRef<TaskListRowResizeState | null>(null);
  const detailPanelResizeStateRef = useRef<DetailPanelResizeState | null>(null);
  const taskDropStateRef = useRef<TaskDropState | null>(null);
  const taskListRowCellRefs = useRef<Map<string, Map<TaskListColumnKey, HTMLDivElement>>>(new Map());
  const taskListScrollViewportRef = useRef<HTMLDivElement | null>(null);
  const taskListViewportFrameRef = useRef<number | null>(null);
  const taskListRowResizeFrameRef = useRef<number | null>(null);
  const dailyTreeRowsRef = useRef<TaskTreeRow[]>([]);
  const filesByTaskIdRef = useRef<Record<string, FileRecord[]>>({});
  const taskListVisibleTaskIdsRef = useRef<Set<string>>(new Set());
  const taskListLayoutInteractionVersionRef = useRef(0);
  const taskListRowMeasurementCacheRef = useRef<Map<string, number>>(new Map());
  const quickCreateSaveTimerRef = useRef<number | null>(null);
  const taskListLayoutSaveTimerRef = useRef<number | null>(null);
  const categoricalFilterStorageReadyKeyRef = useRef<string | null>(null);
  const dailyViewPreferenceReadyKeyRef = useRef<string | null>(null);
  const dailyListViewModePreferenceReadyKeyRef = useRef<string | null>(null);
  const skipDailyTaskPageSelectionSyncRef = useRef(false);
  const boardCollapsedStorageReadyKeyRef = useRef<string | null>(null);
  const draftDirtyFieldsRef = useRef<DraftDirtyFieldMap>({});
  const draftRef = useRef<TaskRecord | null>(null);
  const activeTaskListInlineEditCellRef = useRef<PendingTaskListFocusCell | null>(null);
  const parentTaskNumberDraftRef = useRef("");
  const selectedParentTaskRef = useRef<TaskRecord | null>(null);
  const selectedTaskRef = useRef<TaskRecord | null>(null);
  const inlineSavingFieldsRef = useRef<Partial<Record<TaskListColumnKey, boolean>>>({});
  const detailPanelInteractionRef = useRef<TaskDetailPanelInteractionState>({
    selectedTaskId: null,
    isDetailExpanded: false,
  });
  const previousSelectedTaskIdRef = useRef<string | null>(null);
  const isClearingSelectionRef = useRef(false);
  const saveSelectedTaskRef = useRef<() => Promise<boolean>>(async () => false);

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";
  const { refreshDashboardScope, refreshDashboardTaskFiles } = useDashboardData();
  const {
    tasks,
    setTasks,
    files,
    loadedTaskFileIds,
    loadingTaskFileIds,
    systemMode,
    loading,
    errorMessage,
    setErrorMessage,
    ensureLoaded,
    refreshScope,
    ensureTaskFilesLoaded,
    refreshTaskFiles,
  } = useDashboardScope(scope);
  const canExportTasks = mode === "daily" && !isPreview;
  const isMobileViewport = viewportWidth < MOBILE_BREAKPOINT;
  const isDetailDocked = viewportWidth >= DETAIL_PANEL_BREAKPOINT;
  const usesAgendaView = viewportWidth < TABLET_BREAKPOINT;
  const canCollapseCreateForm = viewportWidth < TABLET_BREAKPOINT;
  const quickCreateComposerMode: ComposerLayoutMode =
    viewportWidth < MOBILE_BREAKPOINT ? "stacked" : viewportWidth < TABLET_BREAKPOINT ? "wrapped" : "strip";
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isDetailExpanded = detailPanelState === "expanded";
  const isPagedDailyListView = mode === "daily" && dailyListViewMode === "paged";
  const shouldRenderDailyDetailPanel = mode === "daily" && (!isPreviewDaily || selectedTaskId !== null);
  const isDetailPanelResizable = shouldRenderDailyDetailPanel && isDetailDocked && isDetailExpanded;
  const isInlineSaving = Object.values(inlineSavingFields).some(Boolean);
  const isExportDisabled = !canExportTasks || loading || saving || isExporting || isInlineSaving || isReorderingTasks;
  const canEditWorkspace =
    !isPreview &&
    Boolean(authUser) &&
    canEditProjectWorkspace({
      globalRole: authUser?.role ?? "member",
      projectRole: currentProjectRole,
    });
  const isWorkspaceReadOnly = !canEditWorkspace;
  const taskFormReadonly = isWorkspaceReadOnly
    ? readonlyWorkspaceFields
    : { ...createReadonlyFields, calendarLinked: Boolean(inlineSavingFields.calendarLinked) };
  const quickCreateWidthStorageKey = authUser?.id ? getQuickCreateWidthStorageKey(authUser.id) : null;
  const taskListLayoutStorageKey =
    mode === "daily" && (authUser?.id || isPreview) ? getTaskListLayoutStorageKey(authUser?.id ?? "preview") : null;
  const categoricalFilterStorageBaseKey =
    mode === "daily" && currentProjectId && (authUser?.id || isPreview)
      ? getCategoricalFilterStorageBaseKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const issueIdOverdueBadgePreferenceStorageKey = categoricalFilterStorageBaseKey
    ? getDailyViewPreferenceStorageKey(categoricalFilterStorageBaseKey, DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE)
    : null;
  const dailyListViewModePreferenceStorageKey = categoricalFilterStorageBaseKey
    ? getDailyViewPreferenceStorageKey(categoricalFilterStorageBaseKey, DAILY_VIEW_PREFERENCE_LIST_VIEW_MODE)
    : null;
  const boardCollapsedStorageKey =
    mode === "board" && currentProjectId && (authUser?.id || isPreview)
      ? getBoardCollapsedStorageKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const canPersistQuickCreateWidthsToServer = Boolean(authUser?.id) && !isPreview && !isLocalAuthPlaceholder;
  const canPersistTaskListLayoutToServer = mode === "daily" && Boolean(authUser?.id) && !isPreview && !isLocalAuthPlaceholder;
  const boardPageSize = isMobileViewport ? BOARD_PAGE_SIZE_MOBILE : BOARD_PAGE_SIZE_DEFAULT;
  const defaultCreateWorkType = useMemo(() => getWorkTypeSelectValue("coordination", workTypeDefinitions), [workTypeDefinitions]);
  const deferredTaskFocusKey = useDeferredValue(taskFocusKey);
  const categoricalFieldContext = useMemo(
    () => ({
      workTypeDefinitions,
      categoryDefinitionsByField,
    }),
    [categoryDefinitionsByField, workTypeDefinitions],
  );
  const categoricalFilterOptionsByField = useMemo(() => {
    if (mode !== "daily") {
      return {} as Record<DailyCategoricalFilterFieldKey, Array<{ value: string; label: string }>>;
    }

    if (!isPreview && !workTypesLoaded) {
      return {} as Record<DailyCategoricalFilterFieldKey, Array<{ value: string; label: string }>>;
    }

    return Object.fromEntries(
      dailyCategoricalFilterFieldKeys.map((fieldKey) => [
        fieldKey,
        getTaskCategoricalFieldOptions(fieldKey, categoricalFieldContext),
      ]),
    ) as Record<DailyCategoricalFilterFieldKey, Array<{ value: string; label: string }>>;
  }, [categoricalFieldContext, isPreview, mode, workTypesLoaded]);
  const categoricalFilterOptionValuesByField = useMemo(
    () =>
      Object.fromEntries(
        dailyCategoricalFilterFieldKeys.map((fieldKey) => [
          fieldKey,
          (categoricalFilterOptionsByField[fieldKey] ?? []).map((option) => option.value),
        ]),
      ) as Record<DailyCategoricalFilterFieldKey, string[]>,
    [categoricalFilterOptionsByField],
  );
  const normalizedSelectedCategoricalFilters = useMemo(
    () =>
      Object.fromEntries(
        dailyCategoricalFilterFieldKeys.map((fieldKey) => [
          fieldKey,
          normalizeTaskCategoricalFilterSelection(fieldKey, selectedCategoricalFilters[fieldKey], categoricalFieldContext),
        ]),
      ) as Record<DailyCategoricalFilterFieldKey, string[] | undefined>,
    [categoricalFieldContext, selectedCategoricalFilters],
  );
  const effectiveDraftCategoricalFilters = useMemo(
    () =>
      Object.fromEntries(
        dailyCategoricalFilterFieldKeys.map((fieldKey) => {
          const optionValues = categoricalFilterOptionValuesByField[fieldKey] ?? [];
          const selectedValues = draftCategoricalFilters[fieldKey] ?? [];
          return [fieldKey, optionValues.filter((value) => selectedValues.includes(value))];
        }),
      ) as Record<DailyCategoricalFilterFieldKey, string[]>,
    [categoricalFilterOptionValuesByField, draftCategoricalFilters],
  );
  const getExpandedCategoricalFilterValues = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey, selectedValues: readonly string[] | undefined) => {
      const optionValues = categoricalFilterOptionValuesByField[fieldKey] ?? [];
      if (optionValues.length === 0) {
        return [] as string[];
      }

      const normalizedValues = normalizeTaskCategoricalFilterSelection(fieldKey, selectedValues, categoricalFieldContext);
      return normalizedValues === undefined ? [...optionValues] : [...normalizedValues];
    },
    [categoricalFieldContext, categoricalFilterOptionValuesByField],
  );
  const openCategoricalFilter = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey) => {
      if ((categoricalFilterOptionValuesByField[fieldKey] ?? []).length === 0) {
        return;
      }

      setDraftCategoricalFilters((previous) => ({
        ...previous,
        [fieldKey]: getExpandedCategoricalFilterValues(fieldKey, selectedCategoricalFilters[fieldKey]),
      }));
      setOpenCategoricalFilterField(fieldKey);
    },
    [categoricalFilterOptionValuesByField, getExpandedCategoricalFilterValues, selectedCategoricalFilters],
  );
  const cancelCategoricalFilterChanges = useCallback(() => {
    if (!openCategoricalFilterField) {
      return;
    }

    setDraftCategoricalFilters((previous) => ({
      ...previous,
      [openCategoricalFilterField]: getExpandedCategoricalFilterValues(
        openCategoricalFilterField,
        selectedCategoricalFilters[openCategoricalFilterField],
      ),
    }));
    setOpenCategoricalFilterField(null);
  }, [getExpandedCategoricalFilterValues, openCategoricalFilterField, selectedCategoricalFilters]);
  const confirmCategoricalFilterChanges = useCallback(() => {
    if (!openCategoricalFilterField) {
      return;
    }

    const fieldKey = openCategoricalFilterField;
    const nextSelection = normalizeTaskCategoricalFilterSelection(
      fieldKey,
      effectiveDraftCategoricalFilters[fieldKey],
      categoricalFieldContext,
    );
    setOpenCategoricalFilterField(null);
    startTransition(() => {
      setSelectedCategoricalFilters((previous) => ({
        ...previous,
        [fieldKey]: nextSelection,
      }));
    });
  }, [categoricalFieldContext, effectiveDraftCategoricalFilters, openCategoricalFilterField]);
  const handleCategoricalFilterTriggerToggle = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey) => {
      if (openCategoricalFilterField === fieldKey) {
        cancelCategoricalFilterChanges();
        return;
      }

      openCategoricalFilter(fieldKey);
    },
    [cancelCategoricalFilterChanges, openCategoricalFilter, openCategoricalFilterField],
  );
  const selectAllCategoricalFilters = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey) => {
      setDraftCategoricalFilters((previous) => ({
        ...previous,
        [fieldKey]: areStringArrayValuesEqual(previous[fieldKey] ?? [], categoricalFilterOptionValuesByField[fieldKey] ?? [])
          ? []
          : [...(categoricalFilterOptionValuesByField[fieldKey] ?? [])],
      }));
    },
    [categoricalFilterOptionValuesByField],
  );
  const resetCategoricalFilters = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey) => {
      setDraftCategoricalFilters((previous) => ({
        ...previous,
        [fieldKey]: [...(categoricalFilterOptionValuesByField[fieldKey] ?? [])],
      }));
    },
    [categoricalFilterOptionValuesByField],
  );
  const toggleCategoricalFilterValue = useCallback(
    (fieldKey: DailyCategoricalFilterFieldKey, value: string) => {
      setDraftCategoricalFilters((previous) => {
        const nextSelectedValues = new Set(previous[fieldKey] ?? []);
        if (nextSelectedValues.has(value)) {
          nextSelectedValues.delete(value);
        } else {
          nextSelectedValues.add(value);
        }

        return {
          ...previous,
          [fieldKey]: (categoricalFilterOptionValuesByField[fieldKey] ?? []).filter((optionValue) =>
            nextSelectedValues.has(optionValue),
          ),
        };
      });
    },
    [categoricalFilterOptionValuesByField],
  );

  const updateDraftDirtyFields = useCallback((updater: (previous: DraftDirtyFieldMap) => DraftDirtyFieldMap) => {
    setDraftDirtyFields((previous) => {
      const next = updater(previous);
      draftDirtyFieldsRef.current = next;
      return next;
    });
  }, []);

  const markDraftFieldDirty = useCallback((field: DraftDirtyField) => {
    updateDraftDirtyFields((previous) => (previous[field] ? previous : { ...previous, [field]: true }));
  }, [updateDraftDirtyFields]);

  const clearDraftDirtyFields = useCallback((fields: readonly DraftDirtyField[]) => {
    updateDraftDirtyFields((previous) => clearDraftDirtyFieldMap(previous, fields));
  }, [updateDraftDirtyFields]);

  const resetDraftDirtyFields = useCallback(() => {
    draftDirtyFieldsRef.current = {};
    setDraftDirtyFields({});
  }, []);
  const setTaskListSelection = useCallback(
    (taskId: string | null) => {
      const currentInteractionState = taskListRowInteractionStore.getState();
      taskListRowInteractionStore.setState({
        selectedTaskId: taskId,
        activeInlineEditCell:
          currentInteractionState.activeInlineEditCell?.taskId === taskId ? currentInteractionState.activeInlineEditCell : null,
      });
    },
    [taskListRowInteractionStore],
  );
  const setTaskListActiveInlineEditCell = useCallback(
    (nextCell: PendingTaskListFocusCell | null, options?: { selectedTaskId?: string | null }) => {
      const nextSelectedTaskId =
        options && Object.prototype.hasOwnProperty.call(options, "selectedTaskId")
          ? options.selectedTaskId ?? null
          : nextCell?.taskId ?? taskListRowInteractionStore.getState().selectedTaskId;
      taskListRowInteractionStore.setState({
        selectedTaskId: nextSelectedTaskId,
        activeInlineEditCell: nextCell,
      });
    },
    [taskListRowInteractionStore],
  );
  const setTaskDropState = useCallback(
    (nextState: TaskDropState | null) => {
      if (areTaskDropStatesEqual(taskDropStateRef.current, nextState)) {
        return;
      }

      taskDropStateRef.current = nextState;
      taskListRowInteractionStore.setState({ taskDropState: nextState });
    },
    [taskListRowInteractionStore],
  );
  const buildDefaultTaskForm = useCallback(
    (): TaskFormState => ({
      ...defaultForm(),
      workType: defaultCreateWorkType,
    }),
    [defaultCreateWorkType],
  );
  const quickCreateInitialValues = useMemo<TaskQuickCreateFormValues>(() => buildDefaultTaskForm(), [buildDefaultTaskForm]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (isPreview || !currentProjectId) {
      setAssigneeOptions([]);
      return;
    }

    let isMounted = true;

    void fetch("/api/project/members", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Failed to load project members");
        }

        const json = (await response.json()) as { data?: { members?: AssigneeOption[] } };
        if (!isMounted) {
          return;
        }

        setAssigneeOptions(Array.isArray(json.data?.members) ? json.data.members : []);
      })
      .catch(() => {
        if (isMounted) {
          setAssigneeOptions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentProjectId, isPreview]);

  useEffect(() => {
    activeTaskListInlineEditCellRef.current = activeTaskListInlineEditCell;
  }, [activeTaskListInlineEditCell]);

  useEffect(() => {
    if (!activeTaskListInlineEditCell) {
      taskEditorDraftStore.clear();
    }
  }, [activeTaskListInlineEditCell, taskEditorDraftStore]);

  useEffect(() => {
    parentTaskNumberDraftRef.current = parentTaskNumberDraft;
  }, [parentTaskNumberDraft]);

  useEffect(() => {
    if (!pendingTaskListFocusCell) {
      return;
    }

    if (!arePendingTaskListFocusCellsEqual(activeTaskListInlineEditCell, pendingTaskListFocusCell)) {
      return;
    }

    if (selectedTaskId !== pendingTaskListFocusCell.taskId || draft?.id !== pendingTaskListFocusCell.taskId) {
      return;
    }

    const rowRefs = taskListRowCellRefs.current.get(pendingTaskListFocusCell.taskId);
    const cell = rowRefs?.get(pendingTaskListFocusCell.columnKey);
    cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTaskListInlineEditCell, draft, pendingTaskListFocusCell, selectedTaskId]);

  useEffect(() => {
    function syncViewport() {
      const width = window.innerWidth;
      setViewportWidth(width);
      setHasViewportSync(true);
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    function syncHoverPreference() {
      setCanHoverDetails(mediaQuery.matches);
    }

    syncHoverPreference();
    mediaQuery.addEventListener("change", syncHoverPreference);
    return () => mediaQuery.removeEventListener("change", syncHoverPreference);
  }, []);

  useEffect(() => {
    if (!hasViewportSync || hasInitializedCreateForm) return;
    // Only decide the initial composer state once so mobile and desktop do not fight each other on first paint.
    setIsCreateFormOpen(viewportWidth >= TABLET_BREAKPOINT);
    setHasInitializedCreateForm(true);
  }, [hasInitializedCreateForm, hasViewportSync, viewportWidth]);

  useEffect(() => {
    if (!hasInitializedCreateForm) return;
    if (viewportWidth >= TABLET_BREAKPOINT) {
      setIsCreateFormOpen(true);
    }
  }, [hasInitializedCreateForm, viewportWidth]);

  useEffect(() => {
    if (mode !== "daily") {
      setSelectedCategoricalFilters({});
      setDraftCategoricalFilters({});
      setOpenCategoricalFilterField(null);
      categoricalFilterStorageReadyKeyRef.current = null;
      return;
    }

    if (!isPreview && !workTypesLoaded) {
      setDraftCategoricalFilters({});
      setOpenCategoricalFilterField(null);
      categoricalFilterStorageReadyKeyRef.current = null;
      return;
    }

    if (!categoricalFilterStorageBaseKey) {
      setSelectedCategoricalFilters({});
      setDraftCategoricalFilters({});
      setOpenCategoricalFilterField(null);
      categoricalFilterStorageReadyKeyRef.current = "__none__";
      return;
    }

    setSelectedCategoricalFilters(
      Object.fromEntries(
        dailyCategoricalFilterFieldKeys.map((fieldKey) => [
          fieldKey,
          normalizeTaskCategoricalFilterSelection(
            fieldKey,
            readCategoricalFiltersFromStorage(getCategoricalFilterStorageKey(categoricalFilterStorageBaseKey, fieldKey)),
            categoricalFieldContext,
          ),
        ]),
      ) as DailyCategoricalFilterMap,
    );
    setOpenCategoricalFilterField(null);
    categoricalFilterStorageReadyKeyRef.current = categoricalFilterStorageBaseKey;
  }, [categoricalFieldContext, categoricalFilterStorageBaseKey, isPreview, mode, workTypesLoaded]);

  useEffect(() => {
    if (!categoricalFilterStorageBaseKey) {
      return;
    }

    if (categoricalFilterStorageReadyKeyRef.current !== categoricalFilterStorageBaseKey) {
      return;
    }

    for (const fieldKey of dailyCategoricalFilterFieldKeys) {
      writeCategoricalFiltersToStorage(
        getCategoricalFilterStorageKey(categoricalFilterStorageBaseKey, fieldKey),
        normalizedSelectedCategoricalFilters[fieldKey],
      );
    }
  }, [categoricalFilterStorageBaseKey, normalizedSelectedCategoricalFilters]);

  useEffect(() => {
    if (openCategoricalFilterField) {
      return;
    }

    setDraftCategoricalFilters((previous) => {
      const next = Object.fromEntries(
        dailyCategoricalFilterFieldKeys.map((fieldKey) => [
          fieldKey,
          getExpandedCategoricalFilterValues(fieldKey, selectedCategoricalFilters[fieldKey]),
        ]),
      ) as DailyCategoricalFilterMap;
      return areFilterMapsEqual(previous, next) ? previous : next;
    });
  }, [getExpandedCategoricalFilterValues, openCategoricalFilterField, selectedCategoricalFilters]);

  useEffect(() => {
    if (mode !== "daily") {
      setOpenCategoricalFilterField(null);
      setDraftCategoricalFilters({});
      return;
    }

    if (openCategoricalFilterField && (categoricalFilterOptionsByField[openCategoricalFilterField] ?? []).length === 0) {
      setOpenCategoricalFilterField(null);
    }
  }, [categoricalFilterOptionsByField, mode, openCategoricalFilterField]);

  useEffect(() => {
    if (mode !== "daily") {
      setHideIssueIdOverdueBadge(false);
      dailyViewPreferenceReadyKeyRef.current = null;
      return;
    }

    if (!issueIdOverdueBadgePreferenceStorageKey) {
      setHideIssueIdOverdueBadge(false);
      dailyViewPreferenceReadyKeyRef.current = "__none__";
      return;
    }

    setHideIssueIdOverdueBadge(readBooleanPreferenceFromStorage(issueIdOverdueBadgePreferenceStorageKey));
    dailyViewPreferenceReadyKeyRef.current = issueIdOverdueBadgePreferenceStorageKey;
  }, [issueIdOverdueBadgePreferenceStorageKey, mode]);

  useEffect(() => {
    if (!issueIdOverdueBadgePreferenceStorageKey) {
      return;
    }

    if (dailyViewPreferenceReadyKeyRef.current !== issueIdOverdueBadgePreferenceStorageKey) {
      return;
    }

    writeBooleanPreferenceToStorage(issueIdOverdueBadgePreferenceStorageKey, hideIssueIdOverdueBadge);
  }, [hideIssueIdOverdueBadge, issueIdOverdueBadgePreferenceStorageKey]);

  useEffect(() => {
    if (mode !== "daily") {
      setDailyListViewMode("full");
      setDailyTaskPage(1);
      dailyListViewModePreferenceReadyKeyRef.current = null;
      return;
    }

    if (!dailyListViewModePreferenceStorageKey) {
      setDailyListViewMode("full");
      setDailyTaskPage(1);
      dailyListViewModePreferenceReadyKeyRef.current = "__none__";
      return;
    }

    setDailyListViewMode(readDailyListViewModeFromStorage(dailyListViewModePreferenceStorageKey));
    setDailyTaskPage(1);
    dailyListViewModePreferenceReadyKeyRef.current = dailyListViewModePreferenceStorageKey;
  }, [dailyListViewModePreferenceStorageKey, mode]);

  useEffect(() => {
    if (!dailyListViewModePreferenceStorageKey) {
      return;
    }

    if (dailyListViewModePreferenceReadyKeyRef.current !== dailyListViewModePreferenceStorageKey) {
      return;
    }

    writeDailyListViewModeToStorage(dailyListViewModePreferenceStorageKey, dailyListViewMode);
  }, [dailyListViewMode, dailyListViewModePreferenceStorageKey]);

  useEffect(() => {
    if (mode !== "board") {
      setCollapsedBoardStatuses(createDefaultBoardCollapsedStatusMap());
      setBoardPageByStatus({});
      setExpandedBoardTaskId(null);
      boardCollapsedStorageReadyKeyRef.current = null;
      return;
    }

    setBoardPageByStatus({});
    setExpandedBoardTaskId(null);

    if (!boardCollapsedStorageKey) {
      setCollapsedBoardStatuses(createDefaultBoardCollapsedStatusMap());
      boardCollapsedStorageReadyKeyRef.current = "__none__";
      return;
    }

    setCollapsedBoardStatuses(readBoardCollapsedStatusesFromStorage(boardCollapsedStorageKey));
    boardCollapsedStorageReadyKeyRef.current = boardCollapsedStorageKey;
  }, [boardCollapsedStorageKey, mode]);

  useEffect(() => {
    if (mode !== "board" || !boardCollapsedStorageKey) {
      return;
    }

    if (boardCollapsedStorageReadyKeyRef.current !== boardCollapsedStorageKey) {
      return;
    }

    writeBoardCollapsedStatusesToStorage(boardCollapsedStorageKey, collapsedBoardStatuses);
  }, [boardCollapsedStorageKey, collapsedBoardStatuses, mode]);


  const handleQuickCreateResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = quickCreateResizeStateRef.current;
    if (!resizeState) return;

    const nextWidth = clampQuickCreateWidth(resizeState.startWidth + event.clientX - resizeState.startX);
    setQuickCreateWidths((prev) => {
      if (prev[resizeState.fieldKey] === nextWidth) return prev;
      const next = { ...prev, [resizeState.fieldKey]: nextWidth };
      quickCreateWidthsRef.current = next;
      return next;
    });
  }, []);

  const persistQuickCreateWidths = useCallback(
    (nextWidths: ResolvedQuickCreateWidthMap) => {
      if (!quickCreateWidthStorageKey) return;

      const sanitized = sanitizeQuickCreateWidths(nextWidths);
      writeQuickCreateWidthsToStorage(quickCreateWidthStorageKey, sanitized);

      if (!canPersistQuickCreateWidthsToServer) return;
      if (quickCreateSaveTimerRef.current !== null) {
        window.clearTimeout(quickCreateSaveTimerRef.current);
      }

      quickCreateSaveTimerRef.current = window.setTimeout(() => {
        quickCreateSaveTimerRef.current = null;
        void fetch("/api/preferences/quick-create-widths", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ widths: sanitized }),
        }).catch(() => {});
      }, QUICK_CREATE_SAVE_DELAY_MS);
    },
    [canPersistQuickCreateWidthsToServer, quickCreateWidthStorageKey],
  );

  const handleQuickCreateResizeEnd = useCallback(() => {
    if (!quickCreateResizeStateRef.current) return;

    quickCreateResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleQuickCreateResizeMove);
    window.removeEventListener("pointerup", handleQuickCreateResizeEnd);
    window.removeEventListener("pointercancel", handleQuickCreateResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persistQuickCreateWidths(quickCreateWidthsRef.current);
  }, [handleQuickCreateResizeMove, persistQuickCreateWidths]);

  const handleQuickCreateResizeStart = useCallback(
    (fieldKey: QuickCreateFieldKey, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      handleQuickCreateResizeEnd();

      quickCreateResizeStateRef.current = {
        fieldKey,
        startX: event.clientX,
        startWidth: quickCreateWidthsRef.current[fieldKey] ?? quickCreateDefaultWidths[fieldKey],
      };

      window.addEventListener("pointermove", handleQuickCreateResizeMove);
      window.addEventListener("pointerup", handleQuickCreateResizeEnd);
      window.addEventListener("pointercancel", handleQuickCreateResizeEnd);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [handleQuickCreateResizeEnd, handleQuickCreateResizeMove],
  );

  useEffect(() => {
    quickCreateWidthsRef.current = quickCreateWidths;
  }, [quickCreateWidths]);

  useEffect(() => {
    if (!quickCreateWidthStorageKey) {
      setQuickCreateWidths(resolveQuickCreateWidths());
      return;
    }

    const storedWidths = readQuickCreateWidthsFromStorage(quickCreateWidthStorageKey);
    const resolvedStoredWidths = resolveQuickCreateWidths(storedWidths);
    setQuickCreateWidths(resolvedStoredWidths);

    if (!canPersistQuickCreateWidthsToServer) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/preferences/quick-create-widths", { cache: "no-store" });
        if (!response.ok) return;

        const json = (await response.json()) as { data?: { widths?: QuickCreateWidthMap } };
        if (cancelled) return;

        const mergedWidths = resolveQuickCreateWidths({
          ...storedWidths,
          ...sanitizeQuickCreateWidths(json.data?.widths),
        });

        setQuickCreateWidths(mergedWidths);
        writeQuickCreateWidthsToStorage(quickCreateWidthStorageKey, mergedWidths);
      } catch {
        // Keep the local widths when the preference API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canPersistQuickCreateWidthsToServer, quickCreateWidthStorageKey]);

  useEffect(() => {
    if (quickCreateSaveTimerRef.current === null) return;
    window.clearTimeout(quickCreateSaveTimerRef.current);
    quickCreateSaveTimerRef.current = null;
  }, [quickCreateWidthStorageKey]);

  useEffect(() => {
    return () => {
      if (quickCreateSaveTimerRef.current !== null) {
        window.clearTimeout(quickCreateSaveTimerRef.current);
        quickCreateSaveTimerRef.current = null;
      }

      window.removeEventListener("pointermove", handleQuickCreateResizeMove);
      window.removeEventListener("pointerup", handleQuickCreateResizeEnd);
      window.removeEventListener("pointercancel", handleQuickCreateResizeEnd);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [handleQuickCreateResizeEnd, handleQuickCreateResizeMove]);

  const clearTaskListRowMetricsTransientHeight = useCallback(() => {
    const liveRowHeight = taskListRowMetricsStore.getSnapshot().liveRowHeight;
    if (!liveRowHeight) {
      return;
    }

    taskListRowMetricsStore.setTransientRowHeight(liveRowHeight.taskId, null);
  }, [taskListRowMetricsStore]);

  const applyTaskListLayout = useCallback((layout: TaskListLayoutPreference) => {
    const nextColumnWidths = resolveTaskListColumnWidths(layout.columnWidths);
    const nextRowHeights = pruneTaskListRowHeights(layout.rowHeights, taskListVisibleTaskIdsRef.current);
    const nextDetailPanelWidth = resolveDetailPanelWidth(layout.detailPanelWidth);
    taskListColumnWidthsRef.current = nextColumnWidths;
    taskListRowHeightsRef.current = nextRowHeights;
    detailPanelWidthRef.current = nextDetailPanelWidth;
    setTaskListColumnWidths(nextColumnWidths);
    taskListLayoutStore.replaceRowHeights(nextRowHeights);
    taskListLayoutStore.setLiveRowHeight(null);
    taskListRowMetricsStore.replaceRowHeights(nextRowHeights);
    clearTaskListRowMetricsTransientHeight();
    setDetailPanelWidth(nextDetailPanelWidth);
  }, [clearTaskListRowMetricsTransientHeight, taskListLayoutStore, taskListRowMetricsStore]);

  const registerTaskListRowCellRef = useCallback((taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => {
    taskGridDomRegistry.registerCell(taskId, columnKey, node);
    const rowRefs = taskListRowCellRefs.current.get(taskId) ?? new Map<TaskListColumnKey, HTMLDivElement>();
    if (node) {
      rowRefs.set(columnKey, node);
      taskListRowCellRefs.current.set(taskId, rowRefs);
      return;
    }

    rowRefs.delete(columnKey);
    if (rowRefs.size === 0) {
      taskListRowCellRefs.current.delete(taskId);
      return;
    }

    taskListRowCellRefs.current.set(taskId, rowRefs);
  }, [taskGridDomRegistry]);
  const getTaskListRowCellNode = useCallback((taskId: string, columnKey: TaskListColumnKey) => {
    return taskGridDomRegistry.getCell(taskId, columnKey) as HTMLDivElement | null;
  }, [taskGridDomRegistry]);

  const applyTaskListRowHeightToDom = useCallback((taskId: string, nextHeight: number) => {
    const clampedHeight = clampTaskListRowHeight(nextHeight);
    const rowRefs = taskListRowCellRefs.current.get(taskId);
    if (!rowRefs) {
      return clampedHeight;
    }

    const nextHeightValue = `${clampedHeight}px`;
    rowRefs.forEach((node) => {
      if (node.style.height !== nextHeightValue) {
        node.style.height = nextHeightValue;
      }
    });

    return clampedHeight;
  }, []);

  const syncTaskListLiveRowHeight = useCallback(
    (taskId: string, nextHeight: number | null) => {
      const currentLiveRowHeight = taskListLayoutStore.getSnapshot().liveRowHeight;
      if (nextHeight === null) {
        if (currentLiveRowHeight === null) {
          return;
        }
        taskListLayoutStore.setLiveRowHeight(null);
        clearTaskListRowMetricsTransientHeight();
        return;
      }

      const clampedHeight = clampTaskListRowHeight(nextHeight);
      if (currentLiveRowHeight?.taskId === taskId && currentLiveRowHeight.height === clampedHeight) {
        return;
      }
      taskListLayoutStore.setLiveRowHeight({ taskId, height: clampedHeight });
      taskListRowMetricsStore.setTransientRowHeight(taskId, clampedHeight);
    },
    [clearTaskListRowMetricsTransientHeight, taskListLayoutStore, taskListRowMetricsStore],
  );

  const persistTaskListLayout = useCallback(
    (
      nextColumnWidths: ResolvedTaskListColumnWidthMap = taskListColumnWidthsRef.current,
      nextRowHeights: TaskListRowHeightMap = taskListRowHeightsRef.current,
      nextDetailPanelWidth: number = detailPanelWidthRef.current,
    ) => {
      if (!taskListLayoutStorageKey) return;

      const sanitizedLayout = sanitizeTaskListLayoutPreference({
        columnWidths: nextColumnWidths,
        rowHeights: pruneTaskListRowHeights(nextRowHeights, taskListVisibleTaskIdsRef.current),
        detailPanelWidth: nextDetailPanelWidth,
      });

      taskListRowHeightsRef.current = sanitizedLayout.rowHeights;
      detailPanelWidthRef.current = sanitizedLayout.detailPanelWidth;
      taskListLayoutStore.replaceRowHeights(sanitizedLayout.rowHeights);
      taskListLayoutStore.setLiveRowHeight(null);
      taskListRowMetricsStore.replaceRowHeights(sanitizedLayout.rowHeights);
      clearTaskListRowMetricsTransientHeight();
      writeTaskListLayoutToStorage(taskListLayoutStorageKey, sanitizedLayout);

      if (!canPersistTaskListLayoutToServer) return;
      if (taskListLayoutSaveTimerRef.current !== null) {
        window.clearTimeout(taskListLayoutSaveTimerRef.current);
      }

      taskListLayoutSaveTimerRef.current = window.setTimeout(() => {
        taskListLayoutSaveTimerRef.current = null;
        void fetch("/api/preferences/task-list-layout", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sanitizedLayout),
        }).catch(() => {});
      }, TASK_LIST_LAYOUT_SAVE_DELAY_MS);
    },
    [canPersistTaskListLayoutToServer, clearTaskListRowMetricsTransientHeight, taskListLayoutStorageKey, taskListLayoutStore, taskListRowMetricsStore],
  );

  const setTaskListRowHeight = useCallback(
    (taskId: string, nextHeight: number, shouldPersist = false) => {
      const clampedHeight = applyTaskListRowHeightToDom(taskId, nextHeight);
      const currentHeight = taskListRowHeightsRef.current[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT;
      if (currentHeight === clampedHeight && !shouldPersist) {
        syncTaskListLiveRowHeight(taskId, null);
        return;
      }

      taskListLayoutInteractionVersionRef.current += 1;
      const nextRowHeights = { ...taskListRowHeightsRef.current, [taskId]: clampedHeight };
      taskListRowHeightsRef.current = nextRowHeights;
      taskListLayoutStore.replaceRowHeights(nextRowHeights);
      taskListRowMetricsStore.commitRowHeight(taskId, clampedHeight);
      syncTaskListLiveRowHeight(taskId, null);

      if (shouldPersist) {
        persistTaskListLayout(taskListColumnWidthsRef.current, nextRowHeights);
      }
    },
    [applyTaskListRowHeightToDom, persistTaskListLayout, syncTaskListLiveRowHeight, taskListLayoutStore, taskListRowMetricsStore],
  );
  const commitTaskListRowHeightV2 = useCallback(
    (taskId: string, nextHeight: number) => {
      const clampedHeight = clampTaskListRowHeight(nextHeight);
      const nextRowHeights = { ...taskListRowHeightsRef.current, [taskId]: clampedHeight };
      taskListLayoutInteractionVersionRef.current += 1;
      taskListRowHeightsRef.current = nextRowHeights;
      taskListLayoutStore.replaceRowHeights(nextRowHeights);
      taskListRowMetricsStore.commitRowHeight(taskId, clampedHeight);
      persistTaskListLayout(taskListColumnWidthsRef.current, nextRowHeights);
    },
    [persistTaskListLayout, taskListLayoutStore, taskListRowMetricsStore],
  );

  const flushTaskListLayoutSave = useCallback(() => {
    if (taskListLayoutSaveTimerRef.current !== null) {
      window.clearTimeout(taskListLayoutSaveTimerRef.current);
      taskListLayoutSaveTimerRef.current = null;
    }

    if (!taskListLayoutStorageKey) return;

    const sanitizedLayout = sanitizeTaskListLayoutPreference({
      columnWidths: taskListColumnWidthsRef.current,
      rowHeights: pruneTaskListRowHeights(taskListRowHeightsRef.current, taskListVisibleTaskIdsRef.current),
      detailPanelWidth: detailPanelWidthRef.current,
    });

    taskListRowHeightsRef.current = sanitizedLayout.rowHeights;
    detailPanelWidthRef.current = sanitizedLayout.detailPanelWidth;
    taskListLayoutStore.replaceRowHeights(sanitizedLayout.rowHeights);
    taskListLayoutStore.setLiveRowHeight(null);
    taskListRowMetricsStore.replaceRowHeights(sanitizedLayout.rowHeights);
    clearTaskListRowMetricsTransientHeight();
    writeTaskListLayoutToStorage(taskListLayoutStorageKey, sanitizedLayout);

    if (!canPersistTaskListLayoutToServer) return;

    void fetch("/api/preferences/task-list-layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedLayout),
      keepalive: true,
    }).catch(() => {});
  }, [canPersistTaskListLayoutToServer, clearTaskListRowMetricsTransientHeight, taskListLayoutStorageKey, taskListLayoutStore, taskListRowMetricsStore]);
  const measureTaskListAutoFitHeight = useCallback(
    (taskId: string) => {
      const row = dailyTreeRowsRef.current.find((entry) => entry.task.id === taskId);
      if (!row) {
        return TASK_LIST_ROW_MIN_HEIGHT;
      }

      const taskFiles = filesByTaskIdRef.current[taskId] ?? EMPTY_TASK_FILES;
      const linkedDocumentsDisplay = formatLinkedDocumentsSummary(row.task, taskFiles);
      const currentDraft = draftRef.current;
      const rowDraft = activeTaskListInlineEditCellRef.current?.taskId === taskId && currentDraft?.id === taskId ? currentDraft : null;
      const activeInlineColumnKey =
        activeTaskListInlineEditCellRef.current?.taskId === taskId ? activeTaskListInlineEditCellRef.current.columnKey : null;
      const rowPresentationContext = createTaskListRowPresentationContext({
        activeInlineColumnKey,
        task: row.task,
        row,
        rowDraft,
        linkedDocumentsDisplay,
        workTypeDefinitions,
        categoryDefinitionsByField,
      });
      const measurementCells = buildTaskListRowMeasurementCells(rowPresentationContext, taskListColumnWidthsRef.current);
      const measurementCacheKey = buildTaskListRowMeasurementCacheKey(measurementCells);
      let nextHeight = taskListRowMeasurementCacheRef.current.get(measurementCacheKey);
      if (nextHeight === undefined) {
        nextHeight = measureTaskListRowHeight(measurementCells);
        if (taskListRowMeasurementCacheRef.current.size >= 400) {
          taskListRowMeasurementCacheRef.current.clear();
        }
        taskListRowMeasurementCacheRef.current.set(measurementCacheKey, nextHeight);
      }
      return nextHeight;
    },
    [categoryDefinitionsByField, workTypeDefinitions],
  );

  const autoFitTaskListRow = useCallback(
    (taskId: string) => {
      setTaskListRowHeight(taskId, measureTaskListAutoFitHeight(taskId), true);
    },
    [measureTaskListAutoFitHeight, setTaskListRowHeight],
  );

  const handleTaskListRowAutoFitDoubleClick = useCallback(
    (taskId: string, event: ReactMouseEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      autoFitTaskListRow(taskId);
    },
    [autoFitTaskListRow],
  );

  const handleTaskListColumnResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = taskListColumnResizeStateRef.current;
    if (!resizeState) return;

    const nextWidth = clampTaskListColumnWidth(resizeState.startWidth + event.clientX - resizeState.startX);
    setTaskListColumnWidths((prev) => {
      if (prev[resizeState.columnKey] === nextWidth) return prev;
      taskListLayoutInteractionVersionRef.current += 1;
      const next = { ...prev, [resizeState.columnKey]: nextWidth };
      taskListColumnWidthsRef.current = next;
      return next;
    });
  }, []);

  const handleTaskListColumnResizeEnd = useCallback(() => {
    if (!taskListColumnResizeStateRef.current) return;

    taskListColumnResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleTaskListColumnResizeMove);
    window.removeEventListener("pointerup", handleTaskListColumnResizeEnd);
    window.removeEventListener("pointercancel", handleTaskListColumnResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persistTaskListLayout(taskListColumnWidthsRef.current, taskListRowHeightsRef.current);
  }, [handleTaskListColumnResizeMove, persistTaskListLayout]);

  const handleTaskListColumnResizeStart = useCallback(
    (columnKey: TaskListColumnKey, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      handleTaskListColumnResizeEnd();

      taskListColumnResizeStateRef.current = {
        columnKey,
        startX: event.clientX,
        startWidth: taskListColumnWidthsRef.current[columnKey] ?? taskListDefaultColumnWidths[columnKey],
      };

      window.addEventListener("pointermove", handleTaskListColumnResizeMove);
      window.addEventListener("pointerup", handleTaskListColumnResizeEnd);
      window.addEventListener("pointercancel", handleTaskListColumnResizeEnd);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [handleTaskListColumnResizeEnd, handleTaskListColumnResizeMove],
  );

  const flushTaskListRowResizeFrame = useCallback(() => {
    const resizeState = taskListRowResizeStateRef.current;
    if (!resizeState) return;

    taskListRowResizeFrameRef.current = null;
    const nextHeight = applyTaskListRowHeightToDom(resizeState.taskId, resizeState.pendingHeight);
    if (resizeState.currentHeight === nextHeight) return;
    taskListLayoutInteractionVersionRef.current += 1;
    resizeState.currentHeight = nextHeight;
    syncTaskListLiveRowHeight(resizeState.taskId, nextHeight);
  }, [applyTaskListRowHeightToDom, syncTaskListLiveRowHeight]);

  const handleTaskListRowResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = taskListRowResizeStateRef.current;
    if (!resizeState) return;

    resizeState.pendingHeight = resizeState.startHeight + event.clientY - resizeState.startY;
    if (taskListRowResizeFrameRef.current !== null) {
      return;
    }

    taskListRowResizeFrameRef.current = window.requestAnimationFrame(() => {
      flushTaskListRowResizeFrame();
    });
  }, [flushTaskListRowResizeFrame]);

  const handleTaskListRowResizeEnd = useCallback(() => {
    const resizeState = taskListRowResizeStateRef.current;
    if (!resizeState) return;

    if (taskListRowResizeFrameRef.current !== null) {
      window.cancelAnimationFrame(taskListRowResizeFrameRef.current);
      taskListRowResizeFrameRef.current = null;
      flushTaskListRowResizeFrame();
    }

    taskListRowResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleTaskListRowResizeMove);
    window.removeEventListener("pointerup", handleTaskListRowResizeEnd);
    window.removeEventListener("pointercancel", handleTaskListRowResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    setTaskListRowHeight(resizeState.taskId, resizeState.currentHeight, true);
  }, [flushTaskListRowResizeFrame, handleTaskListRowResizeMove, setTaskListRowHeight]);

  const handleTaskListRowResizeStart = useCallback(
    (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      handleTaskListRowResizeEnd();

      const startHeight = taskListRowHeightsRef.current[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT;

      taskListRowResizeStateRef.current = {
        taskId,
        startY: event.clientY,
        startHeight,
        currentHeight: startHeight,
        pendingHeight: startHeight,
      };

      window.addEventListener("pointermove", handleTaskListRowResizeMove);
      window.addEventListener("pointerup", handleTaskListRowResizeEnd);
      window.addEventListener("pointercancel", handleTaskListRowResizeEnd);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [handleTaskListRowResizeEnd, handleTaskListRowResizeMove],
  );

  const updateDetailPanelWidthValue = useCallback(
    (nextWidth: number, shouldPersist = false) => {
      const clampedWidth = clampDetailPanelWidth(nextWidth);
      if (detailPanelWidthRef.current === clampedWidth && !shouldPersist) {
        return;
      }

      taskListLayoutInteractionVersionRef.current += 1;
      detailPanelWidthRef.current = clampedWidth;
      setDetailPanelWidth((previous) => (previous === clampedWidth ? previous : clampedWidth));

      if (shouldPersist) {
        persistTaskListLayout(taskListColumnWidthsRef.current, taskListRowHeightsRef.current, clampedWidth);
      }
    },
    [persistTaskListLayout],
  );

  const handleDetailPanelResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = detailPanelResizeStateRef.current;
    if (!resizeState) return;

    const nextWidth = clampDetailPanelWidth(resizeState.startWidth - (event.clientX - resizeState.startX));
    updateDetailPanelWidthValue(nextWidth);
  }, [updateDetailPanelWidthValue]);

  const handleDetailPanelResizeEnd = useCallback(() => {
    if (!detailPanelResizeStateRef.current) return;

    detailPanelResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleDetailPanelResizeMove);
    window.removeEventListener("pointerup", handleDetailPanelResizeEnd);
    window.removeEventListener("pointercancel", handleDetailPanelResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persistTaskListLayout(taskListColumnWidthsRef.current, taskListRowHeightsRef.current, detailPanelWidthRef.current);
  }, [handleDetailPanelResizeMove, persistTaskListLayout]);

  const handleDetailPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDetailPanelResizable) return;
      event.preventDefault();
      event.stopPropagation();
      handleDetailPanelResizeEnd();

      detailPanelResizeStateRef.current = {
        startX: event.clientX,
        startWidth: detailPanelWidthRef.current,
      };

      window.addEventListener("pointermove", handleDetailPanelResizeMove);
      window.addEventListener("pointerup", handleDetailPanelResizeEnd);
      window.addEventListener("pointercancel", handleDetailPanelResizeEnd);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [handleDetailPanelResizeEnd, handleDetailPanelResizeMove, isDetailPanelResizable],
  );

  const handleDetailPanelResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isDetailPanelResizable) return;

      let nextWidth: number | null = null;
      switch (event.key) {
        case "ArrowLeft":
          nextWidth = detailPanelWidthRef.current + DETAIL_PANEL_RESIZE_KEYBOARD_STEP;
          break;
        case "ArrowRight":
          nextWidth = detailPanelWidthRef.current - DETAIL_PANEL_RESIZE_KEYBOARD_STEP;
          break;
        case "Home":
          nextWidth = DETAIL_PANEL_MIN_WIDTH;
          break;
        case "End":
          nextWidth = DETAIL_PANEL_MAX_WIDTH;
          break;
        default:
          return;
      }

      event.preventDefault();
      event.stopPropagation();
      updateDetailPanelWidthValue(nextWidth, true);
    },
    [isDetailPanelResizable, updateDetailPanelWidthValue],
  );

  useEffect(() => {
    taskListColumnWidthsRef.current = taskListColumnWidths;
  }, [taskListColumnWidths]);

  useEffect(() => {
    taskListRowMeasurementCacheRef.current.clear();
  }, [taskListColumnWidths, workTypeDefinitions, categoryDefinitionsByField]);

  useEffect(() => {
    detailPanelWidthRef.current = detailPanelWidth;
  }, [detailPanelWidth]);

  useEffect(() => {
    if (isDetailPanelResizable) return;
    handleDetailPanelResizeEnd();
  }, [handleDetailPanelResizeEnd, isDetailPanelResizable]);

  useEffect(() => {
    if (!taskListLayoutStorageKey) {
      applyTaskListLayout({ columnWidths: {}, rowHeights: {}, detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH });
      return;
    }

    const storedLayout = readTaskListLayoutFromStorage(taskListLayoutStorageKey);
    applyTaskListLayout(storedLayout);

    if (!canPersistTaskListLayoutToServer) return;

    const interactionVersion = taskListLayoutInteractionVersionRef.current;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/preferences/task-list-layout", { cache: "no-store" });
        if (!response.ok) return;

        const json = (await response.json()) as { data?: TaskListLayoutPreference };
        if (cancelled || interactionVersion !== taskListLayoutInteractionVersionRef.current) return;

        const serverLayout = sanitizeTaskListLayoutPreference(json.data);
        applyTaskListLayout(serverLayout);
        writeTaskListLayoutToStorage(taskListLayoutStorageKey, {
          columnWidths: taskListColumnWidthsRef.current,
          rowHeights: taskListRowHeightsRef.current,
          detailPanelWidth: detailPanelWidthRef.current,
        });
      } catch {
        // Keep the local layout when the preference API is unavailable.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyTaskListLayout, canPersistTaskListLayoutToServer, taskListLayoutStorageKey]);

  useEffect(() => {
    if (taskListLayoutSaveTimerRef.current === null) return;
    window.clearTimeout(taskListLayoutSaveTimerRef.current);
    taskListLayoutSaveTimerRef.current = null;
  }, [taskListLayoutStorageKey]);

  useEffect(() => {
    return () => {
      flushTaskListLayoutSave();
      window.removeEventListener("pointermove", handleTaskListColumnResizeMove);
      window.removeEventListener("pointerup", handleTaskListColumnResizeEnd);
      window.removeEventListener("pointercancel", handleTaskListColumnResizeEnd);
      window.removeEventListener("pointermove", handleTaskListRowResizeMove);
      window.removeEventListener("pointerup", handleTaskListRowResizeEnd);
      window.removeEventListener("pointercancel", handleTaskListRowResizeEnd);
      window.removeEventListener("pointermove", handleDetailPanelResizeMove);
      window.removeEventListener("pointerup", handleDetailPanelResizeEnd);
      window.removeEventListener("pointercancel", handleDetailPanelResizeEnd);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [
    flushTaskListLayoutSave,
    handleDetailPanelResizeEnd,
    handleDetailPanelResizeMove,
    handleTaskListColumnResizeEnd,
    handleTaskListColumnResizeMove,
    handleTaskListRowResizeEnd,
    handleTaskListRowResizeMove,
  ]);

  const refreshAllDashboardData = useCallback(async () => {
    await Promise.all([
      refreshDashboardScope("active", { force: true }),
      refreshDashboardScope("trash", { force: true }),
    ]);
  }, [refreshDashboardScope]);

  const refreshTaskFileCaches = useCallback(
    async (taskId: string) => {
      const normalizedTaskId = taskId.trim();
      if (!normalizedTaskId) {
        return;
      }

      await Promise.all([
        refreshDashboardTaskFiles("active", normalizedTaskId, { force: true }),
        refreshDashboardTaskFiles("trash", normalizedTaskId, { force: true }),
      ]);
    },
    [refreshDashboardTaskFiles],
  );

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      focusTaskId && tasks.some((task) => task.id === focusTaskId)
        ? focusTaskId
        : previousSelectedTaskId && tasks.some((task) => task.id === previousSelectedTaskId)
          ? previousSelectedTaskId
          : isPreviewDaily
            ? null
            : tasks[0]?.id ?? null;
    setTaskListSelection(nextSelectedTaskId);
  }, [focusTaskId, isPreviewDaily, setTaskListSelection, taskListRowInteractionStore, tasks]);

  const currentDayKey = todayKey();
  const sortedTasks = useMemo(() => buildStoredOrderTaskTree(tasks), [tasks]);
  const hasActiveDailyFilters = useMemo(
    () => dailyCategoricalFilterFieldKeys.some((fieldKey) => normalizedSelectedCategoricalFilters[fieldKey] !== undefined),
    [normalizedSelectedCategoricalFilters],
  );
  const visibleDailyTasks = useMemo(() => {
    if (mode !== "daily") {
      return sortedTasks;
    }

    if (!hasActiveDailyFilters) {
      return sortedTasks;
    }

    return sortedTasks.filter((task) =>
      dailyCategoricalFilterFieldKeys.every((fieldKey) => {
        const filters = normalizedSelectedCategoricalFilters[fieldKey];

        switch (fieldKey) {
          case "workType":
            return matchesTaskCategoricalFilter(fieldKey, task.workType, filters, categoricalFieldContext);
          case "coordinationScope":
            return matchesTaskCategoricalFilter(fieldKey, task.coordinationScope, filters, categoricalFieldContext);
          case "requestedBy":
            return matchesTaskCategoricalFilter(fieldKey, task.requestedBy, filters, categoricalFieldContext);
          case "relatedDisciplines":
            return matchesTaskCategoricalFilter(fieldKey, task.relatedDisciplines, filters, categoricalFieldContext);
          case "locationRef":
            return matchesTaskCategoricalFilter(fieldKey, task.locationRef, filters, categoricalFieldContext);
          case "status":
            return matchesTaskCategoricalFilter(fieldKey, task.status, filters, categoricalFieldContext);
          default:
            return true;
        }
      }),
    );
  }, [categoricalFieldContext, hasActiveDailyFilters, mode, normalizedSelectedCategoricalFilters, sortedTasks]);
  const dailyTreeRows = useMemo(() => buildTaskTreeRows(visibleDailyTasks), [visibleDailyTasks]);
  const dailyTaskTreePages = useMemo(() => buildTaskTreePages(dailyTreeRows, DAILY_TASK_PAGE_SIZE), [dailyTreeRows]);
  const dailyTaskPageCount = dailyTaskTreePages.length;
  const resolvedDailyTaskPage = useMemo(
    () => clampBoardPage(dailyTaskPage, Math.max(dailyTaskPageCount, 1)),
    [dailyTaskPage, dailyTaskPageCount],
  );
  const dailyTaskPageNavigationItems = useMemo(
    () => buildDailyTaskPageNavigationItems(Math.max(dailyTaskPageCount, 1), resolvedDailyTaskPage),
    [dailyTaskPageCount, resolvedDailyTaskPage],
  );
  const activeDailyTaskPage = useMemo<DailyTaskTreePage | null>(
    () => dailyTaskTreePages[resolvedDailyTaskPage - 1] ?? null,
    [dailyTaskTreePages, resolvedDailyTaskPage],
  );
  const displayedDailyTreeRows = useMemo(
    () => (isPagedDailyListView ? activeDailyTaskPage?.rows ?? [] : dailyTreeRows),
    [activeDailyTaskPage, dailyTreeRows, isPagedDailyListView],
  );
  const displayedDailyTaskRangeLabel = useMemo(() => {
    if (!isPagedDailyListView || !activeDailyTaskPage) {
      return null;
    }

    return t("workspace.dailyListPageRange", {
      from: activeDailyTaskPage.startRowNumber,
      to: activeDailyTaskPage.endRowNumber,
      total: dailyTreeRows.length,
    });
  }, [activeDailyTaskPage, dailyTreeRows.length, isPagedDailyListView]);
  const isDailyManualReorderDisabled = hasActiveDailyFilters || isPagedDailyListView || isWorkspaceReadOnly;
  const shouldVirtualizeDailyTaskTable =
    mode === "daily" && !isMobileViewport && !isPagedDailyListView && !taskDragState && !isWorkspaceReadOnly;
  const shouldUseDailyGridBodyV2 = USE_DAILY_GRID_BODY_V2 && shouldVirtualizeDailyTaskTable;
  const isDailyHtmlDragReorderDisabled = isDailyManualReorderDisabled || isWorkspaceReadOnly;

  useEffect(() => {
    dailyTreeRowsRef.current = dailyTreeRows;
  }, [dailyTreeRows]);

  useEffect(() => {
    if (dailyTaskPage !== resolvedDailyTaskPage) {
      setDailyTaskPage(resolvedDailyTaskPage);
    }
  }, [dailyTaskPage, resolvedDailyTaskPage]);

  const taskListTableWidth = useMemo(() => dailyTaskListColumns.reduce((total, column) => total + taskListColumnWidths[column.key], 0), [taskListColumnWidths]);
  const taskListGridTemplateColumns = useMemo(
    () => dailyTaskListColumns.map((column) => `${taskListColumnWidths[column.key]}px`).join(" "),
    [taskListColumnWidths],
  );
  const syncTaskListViewportState = useCallback(() => {
    const viewport = taskListScrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const viewportTop = Math.max(0, bounds.top);
    const viewportBottom = Math.min(window.innerHeight, bounds.bottom);
    const visibleHeight = Math.max(0, viewportBottom - viewportTop);
    const fallbackHeight = Math.max(1, Math.min(window.innerHeight, Math.max(bounds.height, window.innerHeight)));
    taskListLayoutStore.setViewportState({
      height: visibleHeight > 0 ? visibleHeight : fallbackHeight,
      scrollTop: Math.max(0, -bounds.top),
    });
  }, [taskListLayoutStore]);
  useEffect(() => {
    if (!shouldVirtualizeDailyTaskTable || shouldUseDailyGridBodyV2) {
      taskListLayoutStore.setViewportState({ height: 0, scrollTop: 0 });
      taskListLayoutStore.setLiveRowHeight(null);
      return;
    }

    const viewport = taskListScrollViewportRef.current;
    if (!viewport) {
      return;
    }

    const scheduleSync = () => {
      if (taskListViewportFrameRef.current !== null) {
        return;
      }

      taskListViewportFrameRef.current = window.requestAnimationFrame(() => {
        taskListViewportFrameRef.current = null;
        syncTaskListViewportState();
      });
    };

    syncTaskListViewportState();
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("resize", scheduleSync);
    const resizeObserver = new ResizeObserver(() => scheduleSync());
    resizeObserver.observe(viewport);

    return () => {
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("resize", scheduleSync);
      resizeObserver.disconnect();
      if (taskListViewportFrameRef.current !== null) {
        window.cancelAnimationFrame(taskListViewportFrameRef.current);
        taskListViewportFrameRef.current = null;
      }
    };
  }, [displayedDailyTreeRows.length, shouldUseDailyGridBodyV2, shouldVirtualizeDailyTaskTable, syncTaskListViewportState, taskListLayoutStore, taskListTableWidth]);
  const pinnedDailyTaskTableRowIds = useMemo(() => {
    const next = new Set<string>();
    if (selectedTaskId) {
      next.add(selectedTaskId);
    }
    if (activeTaskListInlineEditRowId) {
      next.add(activeTaskListInlineEditRowId);
    }
    if (pendingTaskListFocusCell) {
      next.add(pendingTaskListFocusCell.taskId);
    }
    return next;
  }, [activeTaskListInlineEditRowId, pendingTaskListFocusCell, selectedTaskId]);
  const workspaceBodyStyle = useMemo(
    () =>
      ({
        ["--detail-panel-width" as string]: `${detailPanelWidth}px`,
      }) as CSSProperties,
    [detailPanelWidth],
  );
  const taskById = useMemo(() => new Map(sortedTasks.map((task) => [task.id, task])), [sortedTasks]);
  const selectedTask = useMemo(() => (selectedTaskId ? taskById.get(selectedTaskId) ?? null : null), [selectedTaskId, taskById]);

  useEffect(() => {
    if (mode !== "daily") {
      return;
    }

    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      previousSelectedTaskId && visibleDailyTasks.some((task) => task.id === previousSelectedTaskId)
        ? previousSelectedTaskId
        : isPagedDailyListView || isPreviewDaily
          ? null
          : visibleDailyTasks[0]?.id ?? null;
    setTaskListSelection(nextSelectedTaskId);
  }, [isPagedDailyListView, isPreviewDaily, mode, setTaskListSelection, taskListRowInteractionStore, visibleDailyTasks]);

  useEffect(() => {
    if (!isPreviewDaily || !focusTaskId || focusTaskId !== selectedTaskId) {
      return;
    }

    setIsDetailPanelSticky(true);
    setDetailPanelState("expanded");
  }, [focusTaskId, isPreviewDaily, selectedTaskId]);

  useEffect(() => {
    if (!isPagedDailyListView) {
      skipDailyTaskPageSelectionSyncRef.current = false;
      return;
    }

    if (skipDailyTaskPageSelectionSyncRef.current) {
      skipDailyTaskPageSelectionSyncRef.current = false;
      return;
    }

    if (!selectedTaskId) {
      return;
    }

    const nextPage = getDailyTaskPageForTask(dailyTaskTreePages, selectedTaskId);
    if (nextPage === null) {
      return;
    }

    setDailyTaskPage((previous) => (previous === nextPage ? previous : nextPage));
  }, [dailyTaskTreePages, isPagedDailyListView, selectedTaskId]);

  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);
  useEffect(() => {
    if (!selectedTaskId) {
      setTaskListActiveInlineEditCell(null);
      setPendingTaskListFocusCell(null);
      return;
    }

    if (activeTaskListInlineEditCell && activeTaskListInlineEditCell.taskId !== selectedTaskId) {
      setTaskListActiveInlineEditCell(null, { selectedTaskId });
    }
    setPendingTaskListFocusCell((previous) => (previous && previous.taskId === selectedTaskId ? previous : null));
  }, [activeTaskListInlineEditCell, selectedTaskId, setTaskListActiveInlineEditCell]);
  useEffect(() => {
    inlineSavingFieldsRef.current = inlineSavingFields;
  }, [inlineSavingFields]);
  useEffect(() => {
    detailPanelInteractionRef.current = {
      selectedTaskId,
      isDetailExpanded,
    };
  }, [isDetailExpanded, selectedTaskId]);
  const selectedParentTask = useMemo(() => {
    if (!selectedTask?.parentTaskId) return null;
    return taskById.get(selectedTask.parentTaskId) ?? null;
  }, [selectedTask, taskById]);

  useEffect(() => {
    selectedParentTaskRef.current = selectedParentTask;
  }, [selectedParentTask]);
  const selectedTaskFilesLoaded = Boolean(selectedTask?.id && loadedTaskFileIds.includes(selectedTask.id));
  useEffect(() => {
    if (isTrashMode) {
      if (tasks.length === 0) {
        return;
      }

      void Promise.all(tasks.map((task) => ensureTaskFilesLoaded(task.id)));
      return;
    }

    if (!selectedTask?.id || selectedTaskFilesLoaded) {
      return;
    }

    void ensureTaskFilesLoaded(selectedTask.id);
  }, [ensureTaskFilesLoaded, isTrashMode, selectedTask?.id, selectedTaskFilesLoaded, tasks]);
  const filesByTaskId = useMemo(() => {
    return files.reduce<Record<string, FileRecord[]>>((acc, file) => {
      if (!acc[file.taskId]) acc[file.taskId] = [];
      acc[file.taskId].push(file);
      return acc;
    }, {});
  }, [files]);

  useEffect(() => {
    filesByTaskIdRef.current = filesByTaskId;
  }, [filesByTaskId]);
  const calendarTasks = useMemo(() => sortedTasks.filter((task) => task.calendarLinked && task.dueDate), [sortedTasks]);
  const activeCalendarMonth = useMemo(
    () =>
      resolveActiveCalendarMonth({
        monthParam: calendarMonthQuery,
        focusTaskId,
        tasks: sortedTasks,
        calendarTasks,
        todayKey: currentDayKey,
      }),
    [calendarMonthQuery, calendarTasks, currentDayKey, focusTaskId, sortedTasks],
  );
  const activeCalendarMonthValue = useMemo(() => formatMonthInputValue(activeCalendarMonth), [activeCalendarMonth]);
  const activeCalendarMonthLabel = useMemo(
    () => t("workspace.calendarMonthHeading", { month: formatCalendarMonthHeading(activeCalendarMonth) }),
    [activeCalendarMonth],
  );
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(activeCalendarMonth), { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(activeCalendarMonth), { weekStartsOn: 0 }),
      }),
    [activeCalendarMonth],
  );
  const isCurrentCalendarMonth = activeCalendarMonthValue === currentDayKey.slice(0, 7);
  const visibleCalendarTasks = useMemo(
    () => calendarTasks.filter((task) => task.dueDate?.slice(0, 7) === activeCalendarMonthValue),
    [activeCalendarMonthValue, calendarTasks],
  );
  const monthGridTaskRange = useMemo(
    () => ({
      from: format(calendarDays[0] ?? startOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
      to: format(calendarDays[calendarDays.length - 1] ?? endOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
    }),
    [activeCalendarMonth, calendarDays],
  );
  const monthGridCalendarTasks = useMemo(
    () =>
      calendarTasks.filter(
        (task) => Boolean(task.dueDate) && task.dueDate >= monthGridTaskRange.from && task.dueDate <= monthGridTaskRange.to,
      ),
    [calendarTasks, monthGridTaskRange.from, monthGridTaskRange.to],
  );
  const hasScheduledCalendarTasks = calendarTasks.length > 0;
  const hasVisibleCalendarTasks = visibleCalendarTasks.length > 0;
  const agendaTasksByDueDate = useMemo(() => groupTasksByDueDate(visibleCalendarTasks), [visibleCalendarTasks]);
  const monthGridTasksByDueDate = useMemo(() => groupTasksByDueDate(monthGridCalendarTasks), [monthGridCalendarTasks]);
  const calendarEmptyState = useMemo(
    () =>
      hasScheduledCalendarTasks
        ? {
            title: t("workspace.calendarMonthEmptyTitle", { month: formatCalendarMonthHeading(activeCalendarMonth) }),
            body: t("workspace.calendarMonthEmptyBody"),
          }
        : {
            title: t("empty.noScheduledTasks"),
            body: t("empty.noScheduledTasksBody"),
          },
    [activeCalendarMonth, hasScheduledCalendarTasks],
  );
  const selectedFiles = useMemo(
    () => (selectedTask ? filesByTaskId[selectedTask.id] ?? EMPTY_TASK_FILES : EMPTY_TASK_FILES),
    [filesByTaskId, selectedTask],
  );
  const selectedTaskFilesLoading = Boolean(selectedTask?.id && loadingTaskFileIds.includes(selectedTask.id));
  const previewableSelectedFiles = useMemo(() => selectedFiles.filter((file) => isFilePreviewable(file)), [selectedFiles]);
  const activePreviewFile = useMemo(
    () => previewableSelectedFiles.find((file) => file.id === activePreviewFileId) ?? previewableSelectedFiles[0] ?? null,
    [activePreviewFileId, previewableSelectedFiles],
  );
  const activePreviewKind = activePreviewFile ? getFilePreviewKind(activePreviewFile) : null;
  const activePreviewUrl =
    activePreviewFile && !isPreview
      ? buildFileContentUrl(activePreviewFile.id, "inline", { allowDeleted: Boolean(activePreviewFile.deletedAt) })
      : null;
  const detailSummary = selectedTask ? formatTaskDisplayId(selectedTask) : t("empty.nothingSelected");
  const trashTaskIdSet = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const trashFileIdSet = useMemo(() => new Set(files.map((file) => file.id)), [files]);
  const selectedTrashTaskIdSet = useMemo(() => new Set(selectedTrashTaskIds), [selectedTrashTaskIds]);
  const selectedTrashFileIdSet = useMemo(() => new Set(selectedTrashFileIds), [selectedTrashFileIds]);
  const trashItems = useMemo<TrashItem[]>(() => {
    if (!isTrashMode) return [];

    return [
      ...tasks.map((task) => ({ kind: "task" as const, id: task.id, deletedAt: task.deletedAt, task })),
      ...files.map((file) => ({ kind: "file" as const, id: file.id, deletedAt: file.deletedAt, file })),
    ].sort((left, right) => {
      const deletedCompare = (right.deletedAt ?? "").localeCompare(left.deletedAt ?? "");
      if (deletedCompare !== 0) return deletedCompare;
      return left.kind.localeCompare(right.kind);
    });
  }, [files, isTrashMode, tasks]);
  const selectedTrashCount = selectedTrashTaskIds.length + selectedTrashFileIds.length;
  const allTrashSelected = trashItems.length > 0 && selectedTrashCount === trashItems.length;

  useEffect(() => {
    const nextVisibleTaskIds = new Set((mode === "daily" ? visibleDailyTasks : tasks).map((task) => task.id));
    taskListVisibleTaskIdsRef.current = nextVisibleTaskIds;
    const nextRowHeights = pruneTaskListRowHeights(taskListRowHeightsRef.current, nextVisibleTaskIds);
    if (!areTaskListRowHeightMapsEqual(taskListRowHeightsRef.current, nextRowHeights)) {
      taskListRowHeightsRef.current = nextRowHeights;
      taskListLayoutStore.replaceRowHeights(nextRowHeights);
    }
    const currentLiveRowHeight = taskListLayoutStore.getSnapshot().liveRowHeight;
    if (currentLiveRowHeight && !nextVisibleTaskIds.has(currentLiveRowHeight.taskId)) {
      taskListLayoutStore.setLiveRowHeight(null);
    }
  }, [mode, taskListLayoutStore, tasks, visibleDailyTasks]);


  useEffect(() => {
    if (!isTrashMode) {
      setSelectedTrashTaskIds([]);
      setSelectedTrashFileIds([]);
      return;
    }

    setSelectedTrashTaskIds((prev) => prev.filter((taskId) => trashTaskIdSet.has(taskId)));
    setSelectedTrashFileIds((prev) => prev.filter((fileId) => trashFileIdSet.has(fileId)));
  }, [isTrashMode, trashFileIdSet, trashTaskIdSet]);

  useEffect(() => {
    if (!selectedTask) {
      previousSelectedTaskIdRef.current = null;
      setDraft(null);
      setParentTaskNumberDraft("");
      setInlineSavingFields({});
      resetDraftDirtyFields();
      return;
    }

    const nextParentTaskNumber = selectedParentTask ? formatTaskDisplayId(selectedParentTask) : "";
    const isSelectionChange = previousSelectedTaskIdRef.current !== selectedTask.id;
    previousSelectedTaskIdRef.current = selectedTask.id;

    if (isSelectionChange) {
      setDraft(toDraftTask(selectedTask));
      setParentTaskNumberDraft(nextParentTaskNumber);
      setInlineSavingFields({});
      resetDraftDirtyFields();
      return;
    }

    const dirtyFields = draftDirtyFieldsRef.current;
    setDraft((previous) => mergeTaskIntoDraft(selectedTask, previous, dirtyFields));
    setParentTaskNumberDraft((previous) => (dirtyFields.parentTaskNumber ? previous : nextParentTaskNumber));
  }, [resetDraftDirtyFields, selectedParentTask, selectedTask]);
  useEffect(() => {
    if (selectedFiles.length === 0) {
      setVersionTargetId("");
      return;
    }

    setVersionTargetId((prev) => (selectedFiles.some((file) => file.id === prev) ? prev : selectedFiles[0].id));
  }, [selectedFiles]);
  useEffect(() => {
    if (previewableSelectedFiles.length === 0) {
      setActivePreviewFileId("");
      return;
    }

    setActivePreviewFileId((prev) => (previewableSelectedFiles.some((file) => file.id === prev) ? prev : previewableSelectedFiles[0].id));
  }, [previewableSelectedFiles]);
  useEffect(() => {
    setIsPreviewLoading(Boolean(activePreviewUrl));
  }, [activePreviewUrl]);

  const focusedTaskIds = useMemo(
    () =>
      deferredTaskFocusKey
        ? new Set(sortedTasks.filter((task) => matchesTaskFocus(task, deferredTaskFocusKey, currentDayKey)).map((task) => task.id))
        : null,
    [currentDayKey, deferredTaskFocusKey, sortedTasks],
  );
  useLayoutEffect(() => {
    taskListRowInteractionStore.setState({ focusedTaskIds });
  }, [focusedTaskIds, taskListRowInteractionStore]);
  const toggleBoardColumn = useCallback(
    (status: TaskStatus) => {
      const willCollapse = !collapsedBoardStatuses[status];

      setCollapsedBoardStatuses((previous) => {
        const next = { ...previous };
        if (next[status]) {
          delete next[status];
        } else {
          next[status] = true;
        }
        return next;
      });

      if (!willCollapse) {
        return;
      }

      setExpandedBoardTaskId((previous) => {
        if (!previous) {
          return previous;
        }

        const expandedTask = taskById.get(previous);
        return expandedTask?.status === status ? null : previous;
      });
    },
    [collapsedBoardStatuses, taskById],
  );
  const boardData = useMemo(() => {
    const itemsByStatus = Object.create(null) as Record<TaskStatus, typeof sortedTasks>;
    for (const status of statusOrder) {
      itemsByStatus[status] = [];
    }

    let overdueCount = 0;
    for (const task of sortedTasks) {
      itemsByStatus[task.status].push(task);
      if (isTaskOverdue(task, currentDayKey)) {
        overdueCount += 1;
      }
    }

    const byStatus = statusOrder.reduce(
      (acc, status) => {
        acc[status] = itemsByStatus[status].length;
        return acc;
      },
      {} as Record<TaskStatus, number>,
    );

    return {
      groups: statusOrder.map((status) => ({ status, items: itemsByStatus[status] })),
      byStatus,
      overdueCount,
    };
  }, [currentDayKey, sortedTasks]);
  const changeBoardPage = useCallback((status: TaskStatus, direction: -1 | 1) => {
    setBoardPageByStatus((previous) => {
      const totalTasks = boardData.byStatus[status];
      const totalPages = Math.max(1, Math.ceil(totalTasks / boardPageSize));
      const nextPage = Math.min(totalPages, Math.max(1, (previous[status] ?? 1) + direction));
      if ((previous[status] ?? 1) === nextPage) {
        return previous;
      }
      return { ...previous, [status]: nextPage };
    });

    setExpandedBoardTaskId((previous) => {
      if (!previous) {
        return previous;
      }

      const expandedTask = taskById.get(previous);
      return expandedTask?.status === status ? null : previous;
    });
  }, [boardData.byStatus, boardPageSize, taskById]);
  const toggleBoardTaskMemo = useCallback((taskId: string) => {
    setExpandedBoardTaskId((previous) => (previous === taskId ? null : taskId));
  }, []);
  const paginatedBoardGroups = useMemo(
    () =>
      boardData.groups.map((group) => {
        const totalPages = Math.max(1, Math.ceil(group.items.length / boardPageSize));
        const currentPage = clampBoardPage(boardPageByStatus[group.status], totalPages);
        const startIndex = (currentPage - 1) * boardPageSize;

        return {
          ...group,
          canGoNext: currentPage < totalPages,
          canGoPrev: currentPage > 1,
          currentPage,
          isCollapsed: Boolean(collapsedBoardStatuses[group.status]),
          totalPages,
          visibleItems: group.items.slice(startIndex, startIndex + boardPageSize),
        };
      }),
    [boardData.groups, boardPageByStatus, boardPageSize, collapsedBoardStatuses],
  );
  const boardSummary = useMemo(() => {
    return {
      total: sortedTasks.length,
      overdue: boardData.overdueCount,
      byStatus: boardData.byStatus,
      inReview: boardData.byStatus.in_review,
      inDiscussion: boardData.byStatus.in_discussion,
      blocked: boardData.byStatus.blocked,
    };
  }, [boardData, sortedTasks.length]);
  const boardFocusItems = useMemo(
    () => [
      { key: "in_review", label: labelForStatus("in_review"), count: boardSummary.inReview, appearance: "in_review" as const },
      { key: "in_discussion", label: labelForStatus("in_discussion"), count: boardSummary.inDiscussion, appearance: "in_discussion" as const },
      { key: "blocked", label: labelForStatus("blocked"), count: boardSummary.blocked, appearance: "blocked" as const },
      { key: "overdue", label: t("workspace.overdueLabel"), count: boardSummary.overdue, appearance: "overdue" as const },
    ],
    [boardSummary.blocked, boardSummary.inDiscussion, boardSummary.inReview, boardSummary.overdue],
  );
  const boardSummaryCards = useMemo(
    () => [
      { key: "total", label: t("workspace.totalLabel"), value: boardSummary.total },
      { key: "new", label: labelForStatus("new"), value: boardSummary.byStatus.new },
      { key: "in_review", label: labelForStatus("in_review"), value: boardSummary.byStatus.in_review },
      { key: "in_discussion", label: labelForStatus("in_discussion"), value: boardSummary.byStatus.in_discussion },
      { key: "overdue", label: t("workspace.overdueLabel"), value: boardSummary.overdue, tone: "warn" as const, className: "board-summary__card--warn" },
    ],
    [boardSummary],
  );
  useEffect(() => {
    if (mode !== "board") {
      return;
    }

    setBoardPageByStatus((previous) => {
      let hasChanges = false;
      const next = { ...previous };

      for (const group of paginatedBoardGroups) {
        if ((previous[group.status] ?? 1) !== group.currentPage) {
          next[group.status] = group.currentPage;
          hasChanges = true;
        }
      }

      return hasChanges ? next : previous;
    });
  }, [mode, paginatedBoardGroups]);
  const visibleBoardTaskIds = useMemo(
    () =>
      new Set(
        paginatedBoardGroups.flatMap((group) =>
          group.isCollapsed ? [] : group.visibleItems.map((task) => task.id),
        ),
      ),
    [paginatedBoardGroups],
  );
  useEffect(() => {
    if (mode !== "board") {
      setExpandedBoardTaskId(null);
      return;
    }

    if (!expandedBoardTaskId) {
      return;
    }

    if (!visibleBoardTaskIds.has(expandedBoardTaskId)) {
      setExpandedBoardTaskId(null);
    }
  }, [expandedBoardTaskId, mode, visibleBoardTaskIds]);
  const boardOverviewGroups = paginatedBoardGroups.map((group) => ({
    status: group.status,
    label: statusLabel[group.status],
    description: boardColumnCopy(group.status),
    emptyLabel: t("empty.noTaskInState"),
    countLabel: group.items.length,
    isCollapsed: group.isCollapsed,
    page: group.currentPage,
    pageCount: group.totalPages,
    pageLabel: t("workspace.pageStatus", { current: group.currentPage, total: group.totalPages }),
    previousPageLabel: t("actions.back"),
    nextPageLabel: t("actions.next"),
    canGoPrev: group.canGoPrev,
    canGoNext: group.canGoNext,
    toggleLabel: group.isCollapsed ? t("workspace.expandBoardColumn") : t("workspace.collapseBoardColumn"),
    toggleAriaLabel: `${statusLabel[group.status]} ${group.isCollapsed ? t("workspace.expandBoardColumn") : t("workspace.collapseBoardColumn")}`,
    onToggleCollapse: toggleBoardColumn,
    onPrevPage: (status: TaskStatus) => changeBoardPage(status, -1),
    onNextPage: (status: TaskStatus) => changeBoardPage(status, 1),
    items: group.visibleItems.map((task) => {
      const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
      const isDimmed = Boolean(focusedTaskIds && !focusedTaskIds.has(task.id));
      const detailToggleLabel = task.id === expandedBoardTaskId ? t("workspace.hideTaskMemoCompact") : t("workspace.showTaskMemoCompact");
      const detailToggleAriaLabel = task.id === expandedBoardTaskId ? t("workspace.hideTaskMemo") : t("workspace.showTaskMemo");

      return {
        id: task.id,
        title: task.issueTitle,
        dueDateLabel: task.dueDate || "-",
        detailNote: task.issueDetailNote || t("empty.noDescription"),
        status: task.status,
        isExpanded: task.id === expandedBoardTaskId,
        isDimmed,
        className: clsx(
          "task-card--compact",
          task.status === "done" && "task-state-card--done",
          deadlineBadge?.tone === "warn" && "task-state-card--overdue",
          deadlineBadge?.tone === "accent" && "task-state-card--due-today",
          deadlineBadge?.tone === "neutral" && "task-state-card--due-soon",
        ),
        deadlineLabel: deadlineBadge?.label,
        deadlineTone: deadlineBadge?.tone,
        onToggleExpand: toggleBoardTaskMemo,
        toggleLabel: detailToggleLabel,
        toggleAriaLabel: `${task.issueTitle} ${detailToggleAriaLabel}`,
        actions: isWorkspaceReadOnly ? null : (
          <>
            <button className="secondary-button task-card__action-button" disabled={task.status === statusOrder[0]} onClick={() => void shiftTaskStatus(task, -1)} type="button">
              {t("actions.back")}
            </button>
            <button
              className="primary-button task-card__action-button"
              disabled={task.status === statusOrder[statusOrder.length - 1]}
              onClick={() => void shiftTaskStatus(task, 1)}
              type="button"
            >
              {t("actions.next")}
            </button>
          </>
        ),
      };
    }),
  }));
  const calendarHolidayInterval = useMemo(() => {
    if (usesAgendaView) {
      return {
        from: format(startOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
        to: format(endOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
      };
    }

    return {
      from: format(calendarDays[0] ?? startOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
      to: format(calendarDays[calendarDays.length - 1] ?? endOfMonth(activeCalendarMonth), "yyyy-MM-dd"),
    };
  }, [activeCalendarMonth, calendarDays, usesAgendaView]);
  const calendarHolidayDateSet = useMemo(() => {
    if (calendarHolidayDateKeys === null) {
      return null;
    }

    return new Set(calendarHolidayDateKeys);
  }, [calendarHolidayDateKeys]);
  const calendarHolidayLoadedMonthSet = useMemo(() => {
    if (calendarHolidayLoadedMonths === null) {
      return null;
    }

    return new Set(calendarHolidayLoadedMonths);
  }, [calendarHolidayLoadedMonths]);
  useEffect(() => {
    if (mode !== "calendar" || isPreview) {
      setCalendarHolidayDateKeys(null);
      setCalendarHolidayLoadedMonths(null);
      return;
    }

    let cancelled = false;
    const abortController = new AbortController();
    setCalendarHolidayDateKeys(null);
    setCalendarHolidayLoadedMonths(null);

    async function loadCalendarHolidays() {
      try {
        const params = new URLSearchParams({
          from: calendarHolidayInterval.from,
          to: calendarHolidayInterval.to,
        });
        const response = await fetch(`/api/calendar/holidays?${params.toString()}`, {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "loadDashboardFailed"));
        }

        const payload = (await response.json()) as { data: CalendarHolidayRangeData };
        if (cancelled) {
          return;
        }

        setCalendarHolidayDateKeys(payload.data.items.map((item) => item.date));
        setCalendarHolidayLoadedMonths(payload.data.months.map((month) => month.month));
      } catch {
        if (cancelled || abortController.signal.aborted) {
          return;
        }

        setCalendarHolidayDateKeys(null);
        setCalendarHolidayLoadedMonths(null);
      }
    }

    void loadCalendarHolidays();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [calendarHolidayInterval.from, calendarHolidayInterval.to, isPreview, mode]);
  const agendaGroups = useMemo(() => {
    return Object.entries(agendaTasksByDueDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dayKey, items]) => ({
        dayKey,
        date: parseISO(dayKey),
        items,
      }));
  }, [agendaTasksByDueDate]);
  const updateCalendarMonth = useCallback(
    (nextMonth: Date) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", formatMonthInputValue(nextMonth));
      const nextQuery = params.toString();
      const nextHref = (nextQuery ? `${pathname}?${nextQuery}` : pathname) as Route;
      router.replace(nextHref, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const goToPreviousCalendarMonth = useCallback(() => {
    updateCalendarMonth(addMonths(activeCalendarMonth, -1));
  }, [activeCalendarMonth, updateCalendarMonth]);
  const goToNextCalendarMonth = useCallback(() => {
    updateCalendarMonth(addMonths(activeCalendarMonth, 1));
  }, [activeCalendarMonth, updateCalendarMonth]);
  const goToCurrentCalendarMonth = useCallback(() => {
    updateCalendarMonth(parseISO(currentDayKey));
  }, [currentDayKey, updateCalendarMonth]);
  const handleCalendarMonthInputChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      const nextMonth = parseMonthInputValue(event.target.value);
      if (!nextMonth) {
        return;
      }

      updateCalendarMonth(nextMonth);
    },
    [updateCalendarMonth],
  );

  const updateDraftForm = useCallback(
    <K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) => {
      if (draftRef.current) {
        draftRef.current = { ...draftRef.current, [key]: value };
      }
      markDraftFieldDirty(key);
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [markDraftFieldDirty],
  );
  const updateInlineTaskListEditorDraft = useCallback(
    <K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) => {
      const currentDraft = taskEditorDraftStore.getSnapshot().draft ?? draftRef.current;
      if (!currentDraft) {
        return;
      }

      const nextDraft = { ...currentDraft, [key]: value };
      draftRef.current = nextDraft;
      markDraftFieldDirty(key);
      taskEditorDraftStore.updateInlineValue(nextDraft);
    },
    [markDraftFieldDirty, taskEditorDraftStore],
  );
  const cancelInlineTaskListField = useCallback(
    (columnKey: TaskListColumnKey) => {
      const field = getEditableTaskListField(columnKey);
      if (draft) {
        draftRef.current = draft;
      }
      if (field) {
        clearDraftDirtyFields(field === "assignee" ? ["assignee", "assigneeProfileId"] : [field]);
      }
      taskEditorDraftStore.cancelInlineEdit();
      setTaskListActiveInlineEditCell(null);
      setPendingTaskListFocusCell(null);
    },
    [clearDraftDirtyFields, draft, setTaskListActiveInlineEditCell, taskEditorDraftStore],
  );

  const updateParentTaskNumberDraft = useCallback(
    (value: string) => {
      parentTaskNumberDraftRef.current = value;
      markDraftFieldDirty("parentTaskNumber");
      setParentTaskNumberDraft(value);
    },
    [markDraftFieldDirty],
  );

  const applyTaskServerUpdate = useCallback(
    (updatedTask: TaskRecord, clearedDirtyFields: readonly DraftDirtyField[] = []) => {
      const nextDirtyFields = clearDraftDirtyFieldMap(draftDirtyFieldsRef.current, clearedDirtyFields);
      draftDirtyFieldsRef.current = nextDirtyFields;
      setDraftDirtyFields(nextDirtyFields);
      setTasks((previous) => previous.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
      setDraft((previous) => {
        if (!previous || previous.id !== updatedTask.id) {
          return previous;
        }
        return mergeTaskIntoDraft(updatedTask, previous, nextDirtyFields);
      });
    },
    [setTasks],
  );

  function resetSelectedTaskDraft() {
    if (!selectedTask) return;
    resetDraftDirtyFields();
    setDraft(toDraftTask(selectedTask));
    setParentTaskNumberDraft(selectedParentTask ? formatTaskDisplayId(selectedParentTask) : "");
  }

  async function createTaskFromForm(nextForm: TaskQuickCreateFormValues) {
    setErrorMessage(null);

    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return false;
    }

    const payload = {
      ...nextForm,
      workType: getWorkTypeSelectValue(nextForm.workType, workTypeDefinitions) || defaultCreateWorkType,
    };
    const { ownerDiscipline: _ignoredOwnerDiscipline, ...requestPayload } = payload;

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "createTaskFailed"));
      return false;
    }

    const json = (await response.json()) as { data: TaskRecord };
    await refreshScope({ force: true });
    setTaskListSelection(json.data.id);
    if (canCollapseCreateForm) {
      setIsCreateFormOpen(false);
    }
    return true;
  }

  async function saveSelectedTask() {
    const currentDraft = draftRef.current;
    if (!currentDraft) return false;
    const dirtyFields = getDirtyDraftFields(draftDirtyFieldsRef.current);
    if (dirtyFields.length === 0) {
      return true;
    }
    setSaving(true);
    setErrorMessage(null);

    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      setSaving(false);
      return false;
    }

    try {
      const payload = buildTaskPatchPayloadFromDraft(currentDraft, draftDirtyFieldsRef.current, parentTaskNumberDraftRef.current);
      const response = await fetch(`/api/tasks/${encodeURIComponent(currentDraft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "saveTaskFailed");
        if (response.status === 409) {
          await refreshScope({ force: true });
        }
        throw new Error(message);
      }

      const json = (await response.json()) as { data: TaskRecord };
      applyTaskServerUpdate(json.data, dirtyFields);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : localizeError({ fallbackKey: "saveTaskFailed" }));
      return false;
    } finally {
      setSaving(false);
    }
  }

  saveSelectedTaskRef.current = saveSelectedTask;

  const hasSelectedTaskDraftChanges = useCallback(() => {
    const currentTask = selectedTaskRef.current;
    const currentDraft = draftRef.current;
    if (!currentTask || !currentDraft || currentTask.id !== currentDraft.id) {
      return false;
    }

    for (const field of editableTaskFormKeys) {
      if (!Object.is(currentTask[field], currentDraft[field])) {
        return true;
      }
    }

    const selectedParentTaskNumber = selectedParentTaskRef.current ? formatTaskDisplayId(selectedParentTaskRef.current) : "";
    return normalizeParentTaskNumberInput(parentTaskNumberDraftRef.current) !== normalizeParentTaskNumberInput(selectedParentTaskNumber);
  }, []);

  async function exportDailyTasks() {
    if (isExportDisabled) {
      return;
    }

    setIsExporting(true);
    setErrorMessage(null);

    try {
      if (hasSelectedTaskDraftChanges()) {
        const didSave = await saveSelectedTaskRef.current();
        if (!didSave) {
          return;
        }
      }

      flushTaskListLayoutSave();

      const response = await fetch("/api/tasks/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          columnWidths: taskListColumnWidthsRef.current,
          rowHeights: taskListRowHeightsRef.current,
          categoricalFilters: Object.fromEntries(
            dailyCategoricalFilterFieldKeys.flatMap((fieldKey) => {
              const selectedValues = normalizedSelectedCategoricalFilters[fieldKey];
              return selectedValues === undefined ? [] : [[fieldKey, selectedValues] as const];
            }),
          ),
          workTypeFilters: normalizedSelectedCategoricalFilters.workType,
        }),
      });

      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "exportTasksFailed"));
        return;
      }

      const blob = await response.blob();
      downloadBlob(blob, resolveExportFilename(response.headers.get("content-disposition")));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("errors.exportTasksFailed"));
    } finally {
      setIsExporting(false);
    }
  }

  const reorderDailyTasks = useCallback(
    async (
      command: TaskReorderClientCommand,
      nextMode: DailyTaskSortMode,
    ) => {
      if (isWorkspaceReadOnly) {
        setErrorMessage(t("errors.workspaceReadOnly"));
        return false;
      }

      if (isReorderingTasks) {
        return false;
      }

      if (hasSelectedTaskDraftChanges()) {
        const didSave = await saveSelectedTaskRef.current();
        if (!didSave) {
          return false;
        }
      }

      setIsReorderingTasks(true);
      setErrorMessage(null);

      try {
        const expectedVersions = buildTaskReorderExpectedVersions(command, sortedTasks);
        const response = await fetch("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...command, expectedVersions }),
        });

        if (!response.ok) {
          setErrorMessage(await readErrorMessage(response, "updateTaskFailed"));
          if (response.status === 409) {
            await refreshScope({ force: true });
          }
          return false;
        }

        const json = (await response.json()) as { data: TaskRecord[] };
        startTransition(() => {
          setTasks(json.data);
          setTaskSortMode(nextMode);
        });
        if (command.action === "manual_move") {
          setTaskListSelection(command.movedTaskId);
        }
        return true;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : localizeError({ fallbackKey: "updateTaskFailed" }));
        return false;
      } finally {
        setIsReorderingTasks(false);
        setIsTaskOrderMenuOpen(false);
        setTaskDragState(null);
        setTaskDropState(null);
      }
    },
    [
      hasSelectedTaskDraftChanges,
      isWorkspaceReadOnly,
      isReorderingTasks,
      refreshScope,
      setErrorMessage,
      setTaskDropState,
      setTaskListSelection,
      setTasks,
      sortedTasks,
    ],
  );

  const moveTaskByOffset = useCallback(
    async (taskId: string, offset: -1 | 1) => {
      if (isDailyManualReorderDisabled) {
        return;
      }

      const task = dailyTreeRows.find((row) => row.task.id === taskId)?.task;
      if (!task) {
        return;
      }

      const parentTaskId = task.parentTaskId ?? null;
      const siblingIds = dailyTreeRows
        .filter((row) => (row.task.parentTaskId ?? null) === parentTaskId)
        .map((row) => row.task.id);
      const currentIndex = siblingIds.indexOf(taskId);
      const nextIndex = currentIndex + offset;
      const targetIndex = offset > 0 ? nextIndex + 1 : nextIndex;

      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblingIds.length) {
        return;
      }

      await reorderDailyTasks(
        {
          action: "manual_move",
          movedTaskId: taskId,
          targetParentTaskId: parentTaskId,
          targetIndex,
        },
        "manual",
      );
    },
    [dailyTreeRows, isDailyManualReorderDisabled, reorderDailyTasks],
  );

  const handleTaskRowDragStart = useCallback(
    (task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) => {
      if (isDailyHtmlDragReorderDisabled || isMobileViewport || isReorderingTasks) {
        event.preventDefault();
        return;
      }

      setTaskDragState({ taskId: task.id, parentTaskId: task.parentTaskId ?? null });
      setTaskDropState(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    },
    [isDailyHtmlDragReorderDisabled, isMobileViewport, isReorderingTasks],
  );

  const handleTaskRowDragOver = useCallback(
    (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => {
      if (!taskDragState || taskDragState.taskId === task.id) {
        return;
      }

      const targetParentTaskId = task.parentTaskId ?? null;
      if (taskDragState.parentTaskId !== targetParentTaskId) {
        return;
      }

      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position: TaskDropPosition = event.clientY - bounds.top < bounds.height / 2 ? "before" : "after";
      setTaskDropState({ taskId: task.id, position });
    },
    [taskDragState],
  );

  const handleTaskRowDrop = useCallback(
    async (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => {
      if (!taskDragState) {
        return;
      }

      const targetParentTaskId = task.parentTaskId ?? null;
      if (taskDragState.parentTaskId !== targetParentTaskId) {
        return;
      }

      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position: TaskDropPosition = event.clientY - bounds.top < bounds.height / 2 ? "before" : "after";
      const siblingIds = dailyTreeRows
        .filter((row) => (row.task.parentTaskId ?? null) === targetParentTaskId)
        .map((row) => row.task.id)
        .filter((taskId) => taskId !== taskDragState.taskId);
      const targetIndexBase = siblingIds.indexOf(task.id);

      if (targetIndexBase < 0) {
        setTaskDragState(null);
        setTaskDropState(null);
        return;
      }

      await reorderDailyTasks(
        {
          action: "manual_move",
          movedTaskId: taskDragState.taskId,
          targetParentTaskId,
          targetIndex: targetIndexBase + (position === "after" ? 1 : 0),
        },
        "manual",
      );
    },
    [dailyTreeRows, taskDragState, reorderDailyTasks],
  );

  const clearTaskDragInteraction = useCallback(() => {
    setTaskDragState(null);
    setTaskDropState(null);
  }, []);

  function renderTaskListHeaderControl(column: TaskListColumnConfig) {
    if (column.headerControl?.kind === "sortMenu") {
      if (isPreviewDaily) {
        return null;
      }

      return (
        <TaskListOrderHeaderMenu
          actions={[
            {
              key: "manual",
              label: "수동 정렬 유지",
              description: "직접 정한 현재 순서를 유지합니다.",
              onSelect: () => setTaskSortMode("manual"),
            },
            {
              key: "auto",
              label: "자동 정렬 실행",
              description: "진행, 지연, 마감 순서로 다시 정렬합니다.",
              onSelect: () => {
                void reorderDailyTasks({ action: "auto_sort", strategy: "priority" }, "auto");
              },
            },
            {
              key: "issue-id",
              label: "Issue ID 순서로 복원",
              description: "기본 이슈 번호 순서로 다시 정렬합니다.",
              onSelect: () => {
                void reorderDailyTasks({ action: "auto_sort", strategy: "action_id" }, "auto");
              },
            },
          ]}
          ariaLabel="작업 정렬 메뉴"
          isBusy={isReorderingTasks}
          auxiliaryToggleChecked={hideIssueIdOverdueBadge}
          auxiliaryToggleLabel={t("workspace.hideIssueIdOverdueBadge")}
          isOpen={isTaskOrderMenuOpen}
          modeLabel={taskSortMode === "manual" ? "수동" : "자동"}
          onClose={() => setIsTaskOrderMenuOpen(false)}
          onToggleAuxiliaryToggle={() => setHideIssueIdOverdueBadge((previous) => !previous)}
          onToggleOpen={() => setIsTaskOrderMenuOpen((previous) => !previous)}
        />
      );
    }

    if (column.headerControl?.kind !== "categoricalFilter") {
      return null;
    }

    const fieldKey = column.headerControl.fieldKey as DailyCategoricalFilterFieldKey;
    const options = categoricalFilterOptionsByField[fieldKey] ?? [];
    const selectedValues = normalizedSelectedCategoricalFilters[fieldKey];
    const draftValues = effectiveDraftCategoricalFilters[fieldKey] ?? [];

    return (
      <TaskListCategoricalHeaderFilterPopover
        fieldLabel={labelForField(fieldKey)}
        isActive={selectedValues !== undefined}
        isOpen={openCategoricalFilterField === fieldKey}
        onCancel={cancelCategoricalFilterChanges}
        onConfirm={confirmCategoricalFilterChanges}
        onReset={() => resetCategoricalFilters(fieldKey)}
        onSelectAll={() => selectAllCategoricalFilters(fieldKey)}
        onToggleOpen={() => handleCategoricalFilterTriggerToggle(fieldKey)}
        onToggleValue={(value) => toggleCategoricalFilterValue(fieldKey, value)}
        options={options}
        selectedCountLabel={summarizeCategoricalFilterStatusLabel(draftValues, options.length)}
        selectedValues={draftValues}
        triggerSummaryLabel={summarizeCategoricalFilterTriggerLabel(selectedValues, options)}
      />
    );
  }

  const patchTask = useCallback(
    async (
      task: Pick<TaskRecord, "id" | "version">,
      payload: Partial<TaskRecord>,
      options: {
        clearedDirtyFields?: readonly DraftDirtyField[];
        fallbackKey?: ErrorCopyKey;
      } = {},
    ) => {
      if (isWorkspaceReadOnly) {
        setErrorMessage(t("errors.workspaceReadOnly"));
        return null;
      }

      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, version: task.version }),
      });

      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, options.fallbackKey ?? "updateTaskFailed"));
        if (response.status === 409) {
          await refreshScope({ force: true });
        }
        return null;
      }

      const json = (await response.json()) as { data: TaskRecord };
      applyTaskServerUpdate(json.data, options.clearedDirtyFields ?? []);
      setTaskListSelection(task.id);
      return json.data;
    },
    [applyTaskServerUpdate, isWorkspaceReadOnly, refreshScope, setErrorMessage, setTaskListSelection],
  );

  async function saveDetailCalendarLinked(nextValue: boolean) {
    const currentDraft = draftRef.current;
    const currentTask = selectedTaskRef.current;
    if (!currentDraft || !currentTask || currentDraft.id !== currentTask.id) {
      updateDraftForm("calendarLinked", nextValue);
      return;
    }
    if (inlineSavingFields.calendarLinked) {
      return;
    }

    if (Object.is(currentTask.calendarLinked, nextValue)) {
      draftRef.current = { ...currentDraft, calendarLinked: nextValue };
      setDraft((previous) => (previous && previous.id === currentDraft.id ? { ...previous, calendarLinked: nextValue } : previous));
      clearDraftDirtyFields(["calendarLinked"]);
      return;
    }

    const previousValue = currentDraft.calendarLinked;
    draftRef.current = { ...currentDraft, calendarLinked: nextValue };
    setDraft((previous) => (previous && previous.id === currentDraft.id ? { ...previous, calendarLinked: nextValue } : previous));
    clearDraftDirtyFields(["calendarLinked"]);
    setInlineSavingFields((previous) => ({ ...previous, calendarLinked: true }));
    setErrorMessage(null);

    try {
      const updated = await patchTask(currentDraft, { calendarLinked: nextValue }, { clearedDirtyFields: ["calendarLinked"] });
      if (updated) {
        return;
      }

      draftRef.current = { ...currentDraft, calendarLinked: previousValue };
      setDraft((previous) => (previous && previous.id === currentDraft.id ? { ...previous, calendarLinked: previousValue } : previous));
    } finally {
      setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, "calendarLinked"));
    }
  }

  const saveInlineTaskListField = useCallback(
    async (columnKey: TaskListColumnKey) => {
      const field = getEditableTaskListField(columnKey);
      const currentDraft = draftRef.current;
      const currentTask = selectedTaskRef.current;
      if (!field || !currentDraft || !currentTask || currentDraft.id !== currentTask.id) return;
      if (inlineSavingFieldsRef.current[columnKey]) return;

      if (Object.is(currentDraft[field], currentTask[field])) {
        clearDraftDirtyFields([field]);
        return;
      }

      setInlineSavingFields((previous) => ({ ...previous, [columnKey]: true }));

      try {
        const payload =
          field === "assignee"
            ? { assignee: currentDraft.assignee, assigneeProfileId: currentDraft.assigneeProfileId }
            : ({ [field]: currentDraft[field] } as Partial<TaskRecord>);
        const clearedDirtyFields = field === "assignee" ? (["assignee", "assigneeProfileId"] as const) : [field];
        await patchTask(currentDraft, payload, { clearedDirtyFields });
      } finally {
        setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, columnKey));
      }
    },
    [clearDraftDirtyFields, patchTask],
  );
  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statusOrder.length) return;
    const nextStatus = statusOrder[nextIndex];
    const updatedTask = await patchTask(task, { status: nextStatus });
    if (!updatedTask || mode !== "board") {
      return;
    }

    setCollapsedBoardStatuses((previous) => {
      if (!previous[nextStatus]) {
        return previous;
      }

      const next = { ...previous };
      delete next[nextStatus];
      return next;
    });

    const updatedTaskTree = sortedTasks.map((currentTask) => (currentTask.id === updatedTask.id ? updatedTask : currentTask));
    setBoardPageByStatus((previous) => ({
      ...previous,
      [nextStatus]: getBoardPageForTask(updatedTaskTree, updatedTask.id, nextStatus, boardPageSize),
    }));
    setExpandedBoardTaskId(updatedTask.id);
  }

  async function moveToTrash(taskId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "moveTaskToTrashFailed"));
      return;
    }
    await refreshAllDashboardData();
    await refreshTaskFileCaches(taskId);
  }

  async function restoreTask(taskId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "restoreTaskFailed"));
      return;
    }
    await refreshAllDashboardData();
    await refreshTaskFileCaches(taskId);
  }

  async function uploadFileForTask(taskId: string, file: File) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    try {
      const intent = await uploadFileWithIntent({ taskId, file });
      if (!intent) {
        const body = new FormData();
        body.append("file", file);
        body.append("taskId", taskId);
        const response = await fetch("/api/upload", { method: "POST", body });
        if (!response.ok) {
          setErrorMessage(await readErrorMessage(response, "uploadFileFailed"));
          return;
        }
    }
    await refreshTaskFiles(taskId, { force: true });
  } catch (error) {
    if (isApiConflictError(error)) {
      await refreshTaskFiles(taskId, { force: true });
    }
    setErrorMessage(error instanceof Error ? error.message : t("errors.uploadFileFailed"));
  }
}

  async function uploadSelectedFile() {
    if (!selectedTask || !pendingUpload) return;
    await uploadFileForTask(selectedTask.id, pendingUpload);
    setPendingUpload(null);
  }

  async function uploadNextVersion() {
    if (!versionTargetId || !pendingVersionUpload) return;
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const targetFile = selectedFiles.find((file) => file.id === versionTargetId);
    if (!targetFile) {
      setErrorMessage(t("workspace.privateStorage"));
      return;
    }

    try {
      const intent = await uploadFileWithIntent({
        taskId: targetFile.taskId,
        file: pendingVersionUpload,
        replaceFileId: versionTargetId,
      });

      if (!intent) {
        const body = new FormData();
        body.append("file", pendingVersionUpload);
        const response = await fetch(`/api/files/${encodeURIComponent(versionTargetId)}/version`, {
          method: "POST",
          body,
        });

        if (!response.ok) {
          setErrorMessage(await readErrorMessage(response, "uploadNextVersionFailed"));
          return;
        }
      }

      setPendingVersionUpload(null);
      await refreshTaskFiles(targetFile.taskId, { force: true });
    } catch (error) {
      if (isApiConflictError(error, "FILE_VERSION_CONFLICT")) {
        await refreshTaskFiles(targetFile.taskId, { force: true });
      }
      setErrorMessage(error instanceof Error ? error.message : t("errors.uploadNextVersionFailed"));
    }
  }

  async function moveFileToTrash(fileId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const sourceFile = files.find((candidate) => candidate.id === fileId);

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "moveFileToTrashFailed"));
      return;
    }
    await refreshTaskFileCaches(sourceFile?.taskId ?? selectedTask?.id ?? "");
  }

  async function restoreFile(fileId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const sourceFile = files.find((candidate) => candidate.id === fileId);

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "restoreFileFailed"));
      return;
    }
    await refreshTaskFileCaches(sourceFile?.taskId ?? selectedTask?.id ?? "");
  }

  async function deleteTaskPermanently(task: TaskRecord) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm(
      `Remove "${`${formatTaskDisplayId(task)} ${task.issueTitle}`.trim()}" from the workspace permanently? It will not be restorable from the UI.`,
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "deleteTaskFailed"));
      return;
    }

    await refreshScope({ force: true });
    await refreshTaskFileCaches(task.id);
  }

  async function deleteFilePermanently(file: FileRecord) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm(
      `Remove "${file.originalName} ${file.versionLabel}" from the workspace permanently? It will not be restorable from the UI.`,
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "deleteFileFailed"));
      return;
    }

    await refreshTaskFileCaches(file.taskId);
  }

  async function deleteSelectedTrashItems() {
    if (selectedTrashCount === 0) {
      return;
    }

    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm(
      `Remove the selected trash items from the workspace permanently? Tasks: ${selectedTrashTaskIds.length}, files: ${selectedTrashFileIds.length}. They will not be restorable from the UI.`,
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/trash/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: selectedTrashTaskIds, fileIds: selectedTrashFileIds }),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "deleteSelectedFailed"));
      return;
    }

    setSelectedTrashTaskIds([]);
    setSelectedTrashFileIds([]);
    await refreshScope({ force: true });

    const affectedTaskIds = new Set(selectedTrashTaskIds);
    for (const fileId of selectedTrashFileIds) {
      const file = files.find((candidate) => candidate.id === fileId);
      if (file) {
        affectedTaskIds.add(file.taskId);
      }
    }

    await Promise.all([...affectedTaskIds].map((taskId) => refreshTaskFileCaches(taskId)));
  }

  async function emptyTrashItems() {
    if (trashItems.length === 0) {
      return;
    }

    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm("Remove every trash item from the workspace permanently? They will not be restorable from the UI.");
    if (!confirmed) {
      return;
    }

    const response = await fetch("/api/trash", { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "emptyTrashFailed"));
      return;
    }

    setSelectedTrashTaskIds([]);
    setSelectedTrashFileIds([]);
    await refreshScope({ force: true });
    await Promise.all(
      trashItems.map((item) => refreshTaskFileCaches(item.kind === "task" ? item.task.id : item.file.taskId)),
    );
  }

  function toggleTrashTaskSelection(taskId: string) {
    setSelectedTrashTaskIds((prev) => (prev.includes(taskId) ? prev.filter((entry) => entry !== taskId) : [...prev, taskId]));
  }

  function toggleTrashFileSelection(fileId: string) {
    setSelectedTrashFileIds((prev) => (prev.includes(fileId) ? prev.filter((entry) => entry !== fileId) : [...prev, fileId]));
  }

  function toggleAllTrashSelection() {
    if (allTrashSelected) {
      setSelectedTrashTaskIds([]);
      setSelectedTrashFileIds([]);
      return;
    }

    setSelectedTrashTaskIds(tasks.map((task) => task.id));
    setSelectedTrashFileIds(files.map((file) => file.id));
  }

  const expandDetailPanel = useCallback(() => {
    setDetailPanelState("expanded");
  }, []);

  const collapseDetailPanel = useCallback(() => {
    setDetailPanelState("collapsed");
  }, []);

  const pinDetailPanel = useCallback(() => {
    setIsDetailPanelSticky(true);
    expandDetailPanel();
  }, [expandDetailPanel]);

  const closeDetailPanel = useCallback(() => {
    setIsDetailPanelSticky(false);
    setDetailPanelState("collapsed");
  }, []);

  const selectTask = useCallback((taskId: string) => {
    setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
    setPendingTaskListFocusCell(null);
    if (isPreviewDaily) {
      pinDetailPanel();
    }
  }, [isPreviewDaily, pinDetailPanel, setTaskListActiveInlineEditCell]);

  const focusTaskListEditableCell = useCallback((taskId: string, columnKey: TaskListColumnKey) => {
    setTaskListActiveInlineEditCell({ taskId, columnKey }, { selectedTaskId: taskId });
    setPendingTaskListFocusCell({ taskId, columnKey });
  }, [setTaskListActiveInlineEditCell]);

  const toggleTaskDetails = useCallback((taskId: string) => {
    const currentState = detailPanelInteractionRef.current;
    if (currentState.selectedTaskId === taskId && currentState.isDetailExpanded) {
      closeDetailPanel();
      return;
    }

    setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
    setPendingTaskListFocusCell(null);
    pinDetailPanel();
  }, [closeDetailPanel, pinDetailPanel, setTaskListActiveInlineEditCell]);

  const clearTaskSelection = useCallback(() => {
    setTaskListActiveInlineEditCell(null, { selectedTaskId: null });
    setPendingTaskListFocusCell(null);
    setIsDetailPanelSticky(false);
    setDetailPanelState("collapsed");
  }, [setTaskListActiveInlineEditCell]);
  const clearTaskSelectionFromOutsideInteraction = useCallback(async () => {
    if (!selectedTaskId || saving || isClearingSelectionRef.current) {
      return;
    }

    if (hasSelectedTaskDraftChanges()) {
      isClearingSelectionRef.current = true;
      try {
        const didSave = await saveSelectedTaskRef.current();
        if (!didSave) {
          return;
        }
      } finally {
        isClearingSelectionRef.current = false;
      }
    }

    clearTaskSelection();
  }, [clearTaskSelection, hasSelectedTaskDraftChanges, saving, selectedTaskId]);

  const handleDailyListViewModeChange = useCallback(
    (nextMode: DailyListViewMode) => {
      if (nextMode === dailyListViewMode) {
        return;
      }

      const nextPage = nextMode === "paged" ? (selectedTaskId ? getDailyTaskPageForTask(dailyTaskTreePages, selectedTaskId) : null) : null;
      startTransition(() => {
        if (nextMode === "paged") {
          setDailyTaskPage(nextPage ?? 1);
        }

        setDailyListViewMode(nextMode);
      });
    },
    [dailyListViewMode, dailyTaskTreePages, selectedTaskId],
  );

  const goToDailyTaskPage = useCallback(
    async (nextPage: number) => {
      if (!isPagedDailyListView) {
        return;
      }

      const clampedPage = clampBoardPage(nextPage, Math.max(dailyTaskPageCount, 1));
      if (clampedPage === resolvedDailyTaskPage) {
        return;
      }

      if (hasSelectedTaskDraftChanges()) {
        const didSave = await saveSelectedTaskRef.current();
        if (!didSave) {
          return;
        }
      }

      skipDailyTaskPageSelectionSyncRef.current = true;
      clearTaskSelection();
      startTransition(() => {
        setDailyTaskPage(clampedPage);
      });
    },
    [
      clearTaskSelection,
      dailyTaskPageCount,
      hasSelectedTaskDraftChanges,
      isPagedDailyListView,
      resolvedDailyTaskPage,
    ],
  );

  function handleWorkspaceBackgroundClick(event: ReactMouseEvent<HTMLElement>) {
    if (mode !== "daily") return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const keepOpenSelector = [
      ".detail-panel",
      "tr",
      "td",
      "th",
      '[data-task-grid-interaction="true"]',
      '[data-task-portal-interaction="true"]',
      ".task-card",
      ".daily-task-card",
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "label",
      "h1",
      "h2",
      "h3",
      "h4",
      "p",
      "span",
      "strong",
      "small",
      ".detail-actions",
      ".sheet-table__head-controls",
      ".composer-card__toggle",
      ".detail-panel-splitter",
    ].join(", ");

    if (target.closest(keepOpenSelector)) return;
    if (!isMobileViewport && selectedTaskId) {
      void clearTaskSelectionFromOutsideInteraction();
    }
    if (isDetailExpanded) {
      closeDetailPanel();
    }
  }

  useEffect(() => {
    if (mode !== "daily" || isMobileViewport || !selectedTaskId) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const taskPortalElement = target.closest<HTMLElement>('[data-task-portal-interaction="true"]');
      if (taskPortalElement) return;

      const headerControlElement = target.closest<HTMLElement>(".sheet-table__head-controls");
      if (headerControlElement) return;

      const rowElement = target.closest<HTMLElement>("[data-task-row-id]");
      if (rowElement) return;

      const detailPanelElement = target.closest<HTMLElement>(".detail-panel");
      if (detailPanelElement) return;

      const detailPanelSplitterElement = target.closest<HTMLElement>(".detail-panel-splitter");
      if (detailPanelSplitterElement) return;

      if (hasSelectedTaskDraftChanges()) {
        if (saving || isClearingSelectionRef.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        void clearTaskSelectionFromOutsideInteraction();
        return;
      }

      clearTaskSelection();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [clearTaskSelection, clearTaskSelectionFromOutsideInteraction, hasSelectedTaskDraftChanges, isMobileViewport, mode, saving, selectedTaskId]);

  function handleDetailPanelPointerEnter() {
    if (!canHoverDetails) return;
    expandDetailPanel();
  }

  function handleDetailPanelPointerDownCapture() {
    if (!canHoverDetails) return;
    pinDetailPanel();
  }

  function handleDetailPanelPointerLeave(event: ReactPointerEvent<HTMLElement>) {
    if (!canHoverDetails) return;
    if (isDetailPanelSticky) return;
    const activeElement = document.activeElement;
    if (activeElement instanceof Node && event.currentTarget.contains(activeElement)) {
      return;
    }
    collapseDetailPanel();
  }

  function handleDetailPanelFocus() {
    if (!canHoverDetails) return;
    expandDetailPanel();
  }

  function handleDetailPanelBlur(event: ReactFocusEvent<HTMLElement>) {
    if (!canHoverDetails) return;
    if (isDetailPanelSticky) return;
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    collapseDetailPanel();
  }

  function handleDetailPanelSummaryClick() {
    if (canHoverDetails) {
      pinDetailPanel();
      return;
    }

    expandDetailPanel();
  }

  function handleDetailPanelToggle() {
    if (isDetailExpanded) {
      closeDetailPanel();
      return;
    }

    if (canHoverDetails) {
      pinDetailPanel();
      return;
    }

    expandDetailPanel();
  }

  function handleDetailPanelPinToggle() {
    if (isDetailPanelSticky) {
      setIsDetailPanelSticky(false);
      return;
    }

    pinDetailPanel();
  }

  function updateSelectedTaskForm<K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) {
    if (key === "calendarLinked") {
      void saveDetailCalendarLinked(Boolean(value));
      return;
    }

    updateDraftForm(key, value);
  }

  const previewDetailPanelBody =
    isPreviewDaily && selectedTask ? (
      <div className="detail-panel__body">
        <div className="detail-form-grid">
          <label className="form-field--compact">
            <span>{labelForField("actionId")}</span>
            <input readOnly value={formatReadonlyActionId(selectedTask.actionId, selectedTask.issueId)} />
          </label>
          <label className="form-field--compact">
            <span>{labelForField("parentActionId")}</span>
            <input readOnly value={selectedParentTask ? formatTaskDisplayId(selectedParentTask) : "-"} />
          </label>
          <label className="form-field--compact">
            <span>{labelForField("dueDate")}</span>
            <input readOnly value={formatPreviewFieldValue(selectedTask.dueDate)} />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("workType")}</span>
            <input readOnly value={formatPreviewFieldValue(labelForWorkType(selectedTask.workType, workTypeDefinitions))} />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("coordinationScope")}</span>
            <input
              readOnly
              value={formatPreviewFieldValue(labelForTaskCategoricalFieldValue("coordinationScope", selectedTask.coordinationScope, categoricalFieldContext))}
            />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("requestedBy")}</span>
            <input readOnly value={formatPreviewFieldValue(labelForTaskCategoricalFieldValue("requestedBy", selectedTask.requestedBy, categoricalFieldContext))} />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("relatedDisciplines")}</span>
            <input
              readOnly
              value={formatPreviewFieldValue(labelForTaskCategoricalFieldValue("relatedDisciplines", selectedTask.relatedDisciplines, categoricalFieldContext))}
            />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("assignee")}</span>
            <input readOnly value={formatPreviewFieldValue(selectedTask.assignee)} />
          </label>
          <label className="form-field--wide">
            <span>{labelForField("issueTitle")}</span>
            <textarea className="detail-text-field" readOnly rows={2} value={formatPreviewFieldValue(selectedTask.issueTitle)} />
          </label>
          <label className="form-field--compact">
            <span>{labelForField("reviewedAt")}</span>
            <input readOnly value={formatPreviewFieldValue(selectedTask.reviewedAt)} />
          </label>
          <label className="form-field--compact">
            <span>{labelForField("updatedAt")}</span>
            <input readOnly value={formatReadonlyValue(selectedTask.updatedAt)} />
          </label>
          <label className="form-field--stretch">
            <span>{labelForField("locationRef")}</span>
            <input readOnly value={formatPreviewFieldValue(labelForTaskCategoricalFieldValue("locationRef", selectedTask.locationRef, categoricalFieldContext))} />
          </label>
          <label className="detail-checkbox-field form-field--compact">
            <span>{labelForField("calendarLinked")}</span>
            <input checked={selectedTask.calendarLinked} disabled readOnly tabIndex={-1} type="checkbox" />
          </label>
          <label className="form-field--compact">
            <span>{labelForField("status")}</span>
            <strong className={clsx("status-pill", `status-pill--${selectedTask.status}`)}>{labelForStatus(selectedTask.status)}</strong>
          </label>
          <label className="form-field--wide">
            <span>{labelForField("issueDetailNote")}</span>
            <textarea
              className="detail-text-field"
              readOnly
              rows={3}
              value={selectedTask.issueDetailNote.trim() ? selectedTask.issueDetailNote : t("empty.noDescription")}
            />
          </label>
          <label className="form-field--wide">
            <span>{labelForField("decision")}</span>
            <textarea className="detail-text-field" readOnly rows={2} value={formatPreviewFieldValue(selectedTask.decision)} />
          </label>
        </div>

        <section className="detail-section">
          <div className="detail-section__header">
            <h4>{labelForField("linkedDocuments")}</h4>
          </div>
          <div className="file-list">
            {selectedTaskFilesLoading ? <p>{t("system.loading")}</p> : null}
            {!selectedTaskFilesLoading && selectedFiles.length === 0 ? <p>{t("empty.noLinkedDocuments")}</p> : null}
            {selectedFiles.map((file) => (
              <article className="file-pill" key={file.id}>
                <div className="file-pill__meta">
                  <strong>
                    {file.originalName} <span className="file-pill__version">{file.versionLabel}</span>
                  </strong>
                  <small>{formatFileAttachmentMeta(file)}</small>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    ) : null;

  const showWarmStudioWorkspaceHeaderActions = (isTrashMode && !isWorkspaceReadOnly) || canExportTasks;

  return (
    <section
      className={clsx("workspace", `workspace--${mode}`, isWarmStudio && "workspace--posthog", isPreview && isWarmStudio && "workspace--preview")}
      data-preview={isWarmStudio && isPreview ? "true" : undefined}
      data-workspace-mode={isWarmStudio ? mode : undefined}
    >
      {isWarmStudio ? (
        <header className="workspace__header">
          <div className="workspace__header-main">
            <div className="workspace__header-topline">
              <p className="workspace__eyebrow">{authUser?.displayName ?? t("workspace.fallbackEyebrow")}</p>
              <div className="workspace__mode-pills">
                <span className="workspace__mode-pill">{labelForMode(mode)}</span>
                {isPreview ? <span className="workspace__mode-pill workspace__mode-pill--preview">Preview</span> : null}
              </div>
            </div>
            <p className="workspace__project">{projectName || t("workspace.fallbackProjectName")}</p>
            <h2>{titleByMode(mode)}</h2>
            <p className="workspace__copy">{t("workspace.headerCopy")}</p>
            {systemMode ? (
              <div className="workspace__facts">
                <p className="workspace__meta workspace__fact">
                  {t("workspace.dataUploadSummary", {
                    data: labelForDataMode(systemMode.dataMode),
                    upload: labelForUploadMode(systemMode.uploadMode),
                  })}
                </p>
                <p className="workspace__meta workspace__fact">
                  {t("workspace.metadataSummary", {
                    source: projectLoaded ? (isSyncing ? t("system.syncing") : labelForProjectSource(projectSource)) : t("system.loading"),
                    status: systemMode.hasSupabase ? t("system.configured") : t("system.missing"),
                  })}
                </p>
                {isLocalAuthPlaceholder && !isPreview ? <p className="workspace__meta workspace__fact">{t("workspace.localAuthNote")}</p> : null}
              </div>
            ) : null}
          </div>
          {showWarmStudioWorkspaceHeaderActions ? (
            <div className="workspace__header-side">
              <div className="workspace__header-actions">
                {isTrashMode && !isWorkspaceReadOnly ? (
                  <div className="trash-toolbar">
                    <button className="secondary-button" disabled={trashItems.length === 0} onClick={toggleAllTrashSelection} type="button">
                      {allTrashSelected ? t("actions.clearSelection") : t("actions.selectAll")}
                    </button>
                    <span className="workspace__meta trash-toolbar__count">{t("workspace.selectedCount", { count: selectedTrashCount })}</span>
                    <button className="danger-button" disabled={selectedTrashCount === 0} onClick={() => void deleteSelectedTrashItems()} type="button">
                      {t("actions.deleteSelected")}
                    </button>
                    <button className="danger-button" disabled={trashItems.length === 0} onClick={() => void emptyTrashItems()} type="button">
                      {t("actions.emptyTrash")}
                    </button>
                  </div>
                ) : null}
                {canExportTasks ? (
                  <div className="workspace__header-export">
                    <button className="secondary-button" disabled={isExportDisabled} onClick={() => void exportDailyTasks()} type="button">
                      {isExporting ? t("workspace.exporting") : t("workspace.exportTasks")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </header>
      ) : (
        <header className="workspace__header">
          <div>
            <p className="workspace__eyebrow">{authUser?.displayName ?? t("workspace.fallbackEyebrow")}</p>
            <p className="workspace__project">{projectName || t("workspace.fallbackProjectName")}</p>
            <h2>{titleByMode(mode)}</h2>
            <p className="workspace__copy">{t("workspace.headerCopy")}</p>
            {systemMode ? (
              <>
                <p className="workspace__meta">
                  {t("workspace.dataUploadSummary", {
                    data: labelForDataMode(systemMode.dataMode),
                    upload: labelForUploadMode(systemMode.uploadMode),
                  })}
                </p>
                <p className="workspace__meta">
                  {t("workspace.metadataSummary", {
                    source: projectLoaded ? (isSyncing ? t("system.syncing") : labelForProjectSource(projectSource)) : t("system.loading"),
                    status: systemMode.hasSupabase ? t("system.configured") : t("system.missing"),
                  })}
                </p>
                {isLocalAuthPlaceholder && !isPreview ? <p className="workspace__meta">{t("workspace.localAuthNote")}</p> : null}
              </>
            ) : null}
          </div>
          {isTrashMode && !isWorkspaceReadOnly ? (
            <div className="trash-toolbar">
              <button className="secondary-button" disabled={trashItems.length === 0} onClick={toggleAllTrashSelection} type="button">
                {allTrashSelected ? t("actions.clearSelection") : t("actions.selectAll")}
              </button>
              <span className="workspace__meta trash-toolbar__count">{t("workspace.selectedCount", { count: selectedTrashCount })}</span>
              <button className="danger-button" disabled={selectedTrashCount === 0} onClick={() => void deleteSelectedTrashItems()} type="button">
                {t("actions.deleteSelected")}
              </button>
              <button className="danger-button" disabled={trashItems.length === 0} onClick={() => void emptyTrashItems()} type="button">
                {t("actions.emptyTrash")}
              </button>
            </div>
          ) : null}
          {canExportTasks ? (
            <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "0.75rem", justifyContent: "flex-end", marginLeft: "auto" }}>
              <button className="secondary-button" disabled={isExportDisabled} onClick={() => void exportDailyTasks()} type="button">
                {isExporting ? t("workspace.exporting") : t("workspace.exportTasks")}
              </button>
            </div>
          ) : null}
        </header>
      )}

      {errorMessage ? <p className="detail-panel__warning detail-panel__warning--error">{errorMessage}</p> : null}
      {loading ? (
        <div className="empty-state">
          <h3>{t("workspace.loading")}</h3>
        </div>
      ) : (
        <div
            className={clsx(
              "workspace__body",
              (mode !== "daily" || !shouldRenderDailyDetailPanel) && "workspace__body--single",
              shouldRenderDailyDetailPanel && !isDetailDocked && "workspace__body--stacked",
              shouldRenderDailyDetailPanel && isDetailDocked && isDetailExpanded && "workspace__body--detail-expanded",
              shouldRenderDailyDetailPanel && isDetailDocked && !isDetailExpanded && "workspace__body--detail-collapsed",
            )}
          onClickCapture={handleWorkspaceBackgroundClick}
          style={workspaceBodyStyle}
          data-detail-docked={isWarmStudio && shouldRenderDailyDetailPanel && isDetailDocked ? "true" : undefined}
          data-detail-expanded={isWarmStudio && shouldRenderDailyDetailPanel && isDetailExpanded ? "true" : undefined}
        >
          <div className="workspace__main" onClickCapture={handleWorkspaceBackgroundClick}>
            {!isTrashMode && sortedTasks.length === 0 && files.length === 0 ? (
              <div className="empty-state">
                <h3>{t("workspace.noItemsTitle")}</h3>
                <p>{t("workspace.noItemsBody")}</p>
              </div>
            ) : null}

            {mode === "board" ? (
              <BoardTaskOverview
                focusStrip={{
                  activeKey: taskFocusKey,
                  ariaLabel: "작업 집중 영역",
                  description: "지금 볼 상태를 먼저 확인합니다.",
                  items: boardFocusItems,
                  onSelect: (key) => setTaskFocusKey((previous) => (previous === key ? null : (key as TaskFocusKey))),
                  title: "집중 영역",
                }}
                groups={boardOverviewGroups}
                summaryCards={boardSummaryCards}
              />
            ) : null}

            {mode === "daily" ? (
              <>
                {!isWorkspaceReadOnly ? (
                  <TaskQuickCreate
                    canCollapse={canCollapseCreateForm}
                    composerMode={quickCreateComposerMode}
                    copy={{
                      eyebrow: t("workspace.quickCreateEyebrow"),
                      title: t("workspace.quickCreateTitle"),
                      body: t("workspace.quickCreateBody"),
                      hideLabel: t("actions.hideForm"),
                      showLabel: t("actions.showForm"),
                      createLabel: t("actions.createTask"),
                      keepListVisibleLabel: t("actions.keepListVisible"),
                    }}
                    initialValues={quickCreateInitialValues}
                    isOpen={isCreateFormOpen}
                    onClose={() => setIsCreateFormOpen(false)}
                    onSubmit={createTaskFromForm}
                    onToggleOpen={() => setIsCreateFormOpen((prev) => !prev)}
                    renderFields={(values, onChange) => (
                      <TaskFormFields
                        assigneeOptions={assigneeOptions}
                        categoryDefinitionsByField={categoryDefinitionsByField}
                        composerMode={quickCreateComposerMode}
                        form={values}
                        layout="composer"
                        onChange={onChange as TaskFormChangeHandler}
                        onComposerResizeStart={handleQuickCreateResizeStart}
                        quickCreateWidths={quickCreateWidths}
                        readonly={createReadonlyFields}
                        showUpdatedAt={false}
                        workTypeDefinitions={workTypeDefinitions}
                      />
                    )}
                  />
                ) : null}

                <section className="daily-sheet__focus">
                  <div className="daily-sheet__focus-header">
                    <div>
                      <p className="workspace__eyebrow">집중 영역</p>
                      <p className="workspace__meta">{t("workspace.dailyFocusSummary")}</p>
                    </div>
                  </div>
                  <div className="daily-sheet__focus-summary-bar">
                    <p className="daily-sheet__focus-copy">{t("workspace.dailyFocusSummary")}</p>
                    <div aria-label={t("workspace.dailyListViewModeAria")} className="daily-sheet__view-mode-toggle" role="group">
                      <button
                        aria-pressed={dailyListViewMode === "full"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          dailyListViewMode === "full" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleDailyListViewModeChange("full")}
                        type="button"
                      >
                        {t("workspace.dailyListViewFull")}
                      </button>
                      <button
                        aria-pressed={dailyListViewMode === "paged"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          dailyListViewMode === "paged" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleDailyListViewModeChange("paged")}
                        type="button"
                      >
                        {t("workspace.dailyListViewPaged")}
                      </button>
                    </div>
                  </div>
                  <TaskFocusStrip
                    activeKey={taskFocusKey}
                    ariaLabel="일일 목록 집중 영역"
                    className="daily-sheet__focus-strip"
                    items={boardFocusItems}
                    onSelect={(key) => setTaskFocusKey((previous) => (previous === key ? null : (key as TaskFocusKey)))}
                    variant="compact"
                  />
                </section>

                {isPagedDailyListView && activeDailyTaskPage ? (
                  <div className="daily-task-list__toolbar">
                    <div className="daily-task-list__toolbar-meta">
                      {displayedDailyTaskRangeLabel ? (
                        <span className="daily-task-list__toolbar-range">{displayedDailyTaskRangeLabel}</span>
                      ) : null}
                      <span className="daily-task-list__toolbar-page">
                        {t("workspace.pageStatus", { current: resolvedDailyTaskPage, total: Math.max(dailyTaskPageCount, 1) })}
                      </span>
                    </div>
                    <div className="daily-task-list__toolbar-actions">
                      <button
                        className="secondary-button daily-task-list__toolbar-button daily-task-list__toolbar-nav-button"
                        disabled={resolvedDailyTaskPage <= 1}
                        onClick={() => void goToDailyTaskPage(resolvedDailyTaskPage - 1)}
                        type="button"
                      >
                        {t("actions.back")}
                      </button>
                      <div
                        aria-label={t("workspace.dailyListPaginationAria")}
                        className="daily-task-list__toolbar-pages"
                        role="group"
                      >
                        {dailyTaskPageNavigationItems.map((item) =>
                          item.kind === "ellipsis" ? (
                            <span aria-hidden="true" className="daily-task-list__toolbar-ellipsis" key={item.key}>
                              ??                            </span>
                          ) : (
                            <button
                              aria-current={item.page === resolvedDailyTaskPage ? "page" : undefined}
                              aria-label={t("workspace.dailyListGoToPage", { page: item.page })}
                              className={clsx(
                                "secondary-button daily-task-list__toolbar-page-button",
                                item.page === resolvedDailyTaskPage && "daily-task-list__toolbar-page-button--active",
                              )}
                              disabled={item.page === resolvedDailyTaskPage}
                              key={item.key}
                              onClick={() => void goToDailyTaskPage(item.page)}
                              type="button"
                            >
                              {item.page}
                            </button>
                          ),
                        )}
                      </div>
                      <button
                        className="secondary-button daily-task-list__toolbar-button daily-task-list__toolbar-nav-button"
                        disabled={resolvedDailyTaskPage >= dailyTaskPageCount}
                        onClick={() => void goToDailyTaskPage(resolvedDailyTaskPage + 1)}
                        type="button"
                      >
                        {t("actions.next")}
                      </button>
                    </div>
                  </div>
                ) : null}

                {isMobileViewport ? (
                  <>
                    {dailyCategoricalFilterFieldKeys
                      .filter((fieldKey) => (categoricalFilterOptionsByField[fieldKey] ?? []).length > 0)
                      .map((fieldKey) => (
                        <div className="daily-task-list__filters" key={fieldKey}>
                          <span className="daily-task-list__filters-label">{labelForField(fieldKey)}</span>
                          {renderTaskListHeaderControl({
                            key: fieldKey as TaskListColumnKey,
                            headerControl: { kind: "categoricalFilter", fieldKey },
                          })}
                        </div>
                      ))}
                    <div className="daily-mobile-list">
                      {displayedDailyTreeRows.map((row) => {
                        const task = row.task;
                        const isChildTask = row.depth > 0;
                        const isParentTask = row.hasChildren;
                        const isBranchTask = isChildTask && isParentTask;
                        const taskFiles = filesByTaskId[task.id] ?? EMPTY_TASK_FILES;
                        const linkedDocumentsDisplay = formatLinkedDocumentsSummary(task, taskFiles);
                        const hierarchyDepth = Math.min(row.depth, 3);
                        const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
                        const isDimmed = Boolean(focusedTaskIds && !focusedTaskIds.has(task.id));

                        return (
                          <article
                            className={clsx(
                              "daily-task-card",
                              task.id === selectedTaskId && "daily-task-card--active",
                              isChildTask && "daily-task-card--child",
                              isDimmed && "task-state-card--dimmed",
                              isTaskOverdue(task, currentDayKey) && "task-state-card--overdue",
                            )}
                            key={task.id}
                            onClick={() => toggleTaskDetails(task.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleTaskDetails(task.id);
                              }
                            }}
                            role="button"
                            style={{ marginLeft: hierarchyDepth ? `${hierarchyDepth * 0.65}rem` : undefined }}
                            tabIndex={0}
                          >
                          <div className="daily-task-card__header">
                            <div className="daily-task-card__badges">
                              <span
                                className={clsx(
                                  "task-tree__badge",
                                  isParentTask && "task-tree__badge--parent",
                                  isChildTask && "task-tree__badge--child",
                                  isBranchTask && "task-tree__badge--branch",
                                )}
                              >
                                {formatTaskDisplayId(task)}
                              </span>
                              <span className={clsx("status-pill", `status-pill--${task.status}`)}>{labelForStatus(task.status)}</span>
                              {deadlineBadge ? (
                                <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineBadge.tone}`)}>
                                  {deadlineBadge.label}
                                </span>
                              ) : null}
                            </div>
                            <h3>{task.issueTitle}</h3>
                            <p>{task.issueDetailNote || t("empty.noDescription")}</p>
                          </div>

                          <dl className="daily-task-card__meta">
                            <div className="daily-task-card__meta-item">
                              <dt>{labelForField("dueDate")}</dt>
                              <dd>{task.dueDate || "-"}</dd>
                            </div>
                            <div className="daily-task-card__meta-item">
                              <dt>{labelForField("assignee")}</dt>
                              <dd>{task.assignee || t("empty.unassigned")}</dd>
                            </div>
                            <div className="daily-task-card__meta-item">
                              <dt>{labelForField("workType")}</dt>
                              <dd>{labelForWorkType(task.workType, workTypeDefinitions)}</dd>
                            </div>
                            <div className="daily-task-card__meta-item">
                              <dt>{labelForField("requestedBy")}</dt>
                              <dd>{labelForTaskCategoricalFieldValue("requestedBy", task.requestedBy, categoricalFieldContext)}</dd>
                            </div>
                          </dl>

                          <div className="daily-task-card__footer">
                            <span className="daily-task-card__files-label">{labelForField("linkedDocuments")}</span>
                            <strong>{linkedDocumentsDisplay.primary}</strong>
                            {linkedDocumentsDisplay.secondary ? <small>{linkedDocumentsDisplay.secondary}</small> : null}
                            {!isWorkspaceReadOnly ? <div className="daily-task-card__reorder-actions">
                              <button
                                aria-label="위로 이동"
                                className="secondary-button"
                                disabled={isDailyManualReorderDisabled || isReorderingTasks}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void moveTaskByOffset(task.id, -1);
                                }}
                                type="button"
                              >
                                위
                              </button>
                              <button
                                aria-label="아래로 이동"
                                className="secondary-button"
                                disabled={isDailyManualReorderDisabled || isReorderingTasks}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void moveTaskByOffset(task.id, 1);
                                }}
                                type="button"
                              >
                                아래
                              </button>
                            </div> : null}
                          </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div
                    className={clsx("sheet-wrapper", "sheet-wrapper--daily", displayedDailyTreeRows.length === 0 && "sheet-wrapper--daily-empty")}
                    ref={taskListScrollViewportRef}
                  >
                    {shouldUseDailyGridBodyV2 ? (
                      <>
                        <DailyGridHeaderV2
                          gridTemplateColumns={taskListGridTemplateColumns}
                          onColumnResizeStart={handleTaskListColumnResizeStart}
                          renderHeaderControl={renderTaskListHeaderControl}
                          totalWidth={taskListTableWidth}
                        />
                        <DailyGridBodyV2
                          activeTaskListInlineEditRowId={activeTaskListInlineEditRowId}
                          categoryDefinitionsByField={categoryDefinitionsByField}
                          clearTaskDragInteraction={clearTaskDragInteraction}
                          currentDayKey={currentDayKey}
                          draft={draft}
                          filesByTaskId={filesByTaskId}
                          focusTaskListEditableCell={focusTaskListEditableCell}
                          gridTemplateColumns={taskListGridTemplateColumns}
                          handleTaskRowDragOver={handleTaskRowDragOver}
                          handleTaskRowDragStart={handleTaskRowDragStart}
                          handleTaskRowDrop={handleTaskRowDrop}
                          hideIssueIdOverdueBadge={hideIssueIdOverdueBadge}
                          inlineSavingFields={inlineSavingFields}
                          interactionStore={taskListRowInteractionStore}
                          isHtmlDragReorderDisabled={isDailyHtmlDragReorderDisabled}
                          isManualReorderDisabled={isDailyManualReorderDisabled}
                          isReorderingTasks={isReorderingTasks}
                          isTaskOverdue={isTaskOverdue}
                          measureAutoFitRowHeight={measureTaskListAutoFitHeight}
                          metricsStore={taskListRowMetricsStore}
                          moveTaskByOffset={moveTaskByOffset}
                          onCommitRowHeight={commitTaskListRowHeightV2}
                          pinnedTaskIds={pinnedDailyTaskTableRowIds}
                          registerTaskListRowCellRef={registerTaskListRowCellRef}
                          resolveTaskDeadlineBadge={resolveTaskDeadlineBadge}
                          rows={displayedDailyTreeRows}
                          selectTask={selectTask}
                          totalWidth={taskListTableWidth}
                          workTypeDefinitions={workTypeDefinitions}
                          wrapperRef={taskListScrollViewportRef}
                        />
                      </>
                    ) : (
                      <table className="sheet-table sheet-table--daily sheet-table--expanded" style={{ minWidth: `${taskListTableWidth}px`, width: `${taskListTableWidth}px` }}>
                        <colgroup>
                          {dailyTaskListColumns.map((column) => (
                            <col key={column.key} style={{ width: `${taskListColumnWidths[column.key]}px` }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            {dailyTaskListColumns.map((column) => (
                              <th className={column.className} data-task-column={column.key} key={column.key}>
                                <div className="sheet-table__head-inner">
                                  <span className="sheet-table__head-label">{labelForField(column.key)}</span>
                                  {renderTaskListHeaderControl(column)}
                                  <button
                                    aria-label={t("workspace.resizeFieldAria", { field: labelForField(column.key) })}
                                    className="sheet-table__column-resize-handle"
                                    onPointerDown={(event) => handleTaskListColumnResizeStart(column.key, event)}
                                    type="button"
                                  />
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <DailyTaskTableBody
                            activeTaskListInlineEditRowId={activeTaskListInlineEditRowId}
                            categoryDefinitionsByField={categoryDefinitionsByField}
                            clearTaskDragInteraction={clearTaskDragInteraction}
                            currentDayKey={currentDayKey}
                            draft={draft}
                            filesByTaskId={filesByTaskId}
                            focusTaskListEditableCell={focusTaskListEditableCell}
                            focusedTaskIds={focusedTaskIds}
                            handleTaskListRowAutoFitDoubleClick={handleTaskListRowAutoFitDoubleClick}
                            handleTaskListRowResizeStart={handleTaskListRowResizeStart}
                            handleTaskRowDragOver={handleTaskRowDragOver}
                            handleTaskRowDragStart={handleTaskRowDragStart}
                            handleTaskRowDrop={handleTaskRowDrop}
                            hideIssueIdOverdueBadge={hideIssueIdOverdueBadge}
                            inlineSavingFields={inlineSavingFields}
                            interactionStore={taskListRowInteractionStore}
                            isHtmlDragReorderDisabled={isDailyHtmlDragReorderDisabled}
                            isManualReorderDisabled={isDailyManualReorderDisabled}
                            isPreviewReadOnly={isWorkspaceReadOnly}
                            isReorderingTasks={isReorderingTasks}
                            layoutStore={taskListLayoutStore}
                            moveTaskByOffset={moveTaskByOffset}
                            pinnedTaskIds={pinnedDailyTaskTableRowIds}
                            registerTaskListRowCellRef={registerTaskListRowCellRef}
                            rows={displayedDailyTreeRows}
                            saveInlineTaskListField={saveInlineTaskListField}
                            selectTask={selectTask}
                            shouldVirtualize={shouldVirtualizeDailyTaskTable}
                            updateDraftForm={updateDraftForm}
                            workTypeDefinitions={workTypeDefinitions}
                          />
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
                {!isWorkspaceReadOnly ? (
                  <TaskListInlineEditorOverlay
                    activeCell={activeTaskListInlineEditCell}
                    assigneeOptions={assigneeOptions}
                    categoryDefinitionsByField={categoryDefinitionsByField}
                    draftStore={taskEditorDraftStore}
                    draft={draft}
                    getCellNode={getTaskListRowCellNode}
                    inlineSavingFields={inlineSavingFields}
                    onCancel={cancelInlineTaskListField}
                    onChange={updateInlineTaskListEditorDraft}
                    onCommit={saveInlineTaskListField}
                    onFocusHandled={() => setPendingTaskListFocusCell(null)}
                    pendingFocusCell={pendingTaskListFocusCell}
                    workTypeDefinitions={workTypeDefinitions}
                  />
                ) : null}
              </>
            ) : null}

            {mode === "calendar" ? (
              <div className="calendar-view">
                <section className="calendar-nav">
                  <div className="calendar-nav__heading">
                    <h3>{activeCalendarMonthLabel}</h3>
                    <p>{labelForMode("calendar")}</p>
                  </div>
                  <div className="calendar-nav__actions">
                    <button className="secondary-button calendar-nav__button" onClick={goToPreviousCalendarMonth} type="button">
                      {t("workspace.calendarPreviousMonth")}
                    </button>
                    <button
                      className="secondary-button calendar-nav__button"
                      disabled={isCurrentCalendarMonth}
                      onClick={goToCurrentCalendarMonth}
                      type="button"
                    >
                      {t("workspace.calendarToday")}
                    </button>
                    <button className="secondary-button calendar-nav__button" onClick={goToNextCalendarMonth} type="button">
                      {t("workspace.calendarNextMonth")}
                    </button>
                    <label className="calendar-nav__picker">
                      <span>{t("workspace.calendarMonthPickerLabel")}</span>
                      <input onChange={handleCalendarMonthInputChange} type="month" value={activeCalendarMonthValue} />
                    </label>
                  </div>
                </section>

                {usesAgendaView ? (
                  <div className="calendar-agenda">
                    {!hasVisibleCalendarTasks ? (
                      <div className="calendar-empty-state">
                        <h3>{calendarEmptyState.title}</h3>
                        <p>{calendarEmptyState.body}</p>
                      </div>
                    ) : (
                      agendaGroups.map((group) => (
                        <section
                          className={clsx(
                            "calendar-agenda__day",
                            isCalendarHolidayDate(group.date, calendarHolidayDateSet, calendarHolidayLoadedMonthSet) && "calendar-agenda__day--holiday",
                          )}
                          key={group.dayKey}
                        >
                          <header className="calendar-agenda__header">
                            <div>
                              <h3>{formatMonthDay(group.date)}</h3>
                              <p>{formatWeekdayLong(group.date)}</p>
                            </div>
                            <span>{group.items.length}</span>
                          </header>
                          <div className="calendar-agenda__items">
                            {group.items.map((task) => {
                              const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);

                              return (
                                <TaskPreviewCard
                                  className={clsx("calendar-agenda__task-card", getTaskPreviewStateClassName(task, deadlineBadge?.tone))}
                                  deadlineLabel={deadlineBadge?.label}
                                  deadlineTone={deadlineBadge?.tone}
                                  dueDateLabel={task.dueDate || "-"}
                                  href={`${basePath}/daily?taskId=${task.id}` as Route}
                                  id={task.id}
                                  interactionMode="navigate-only"
                                  key={task.id}
                                  metaLine={t("workspace.agendaMeta", { status: statusLabel[task.status], assignee: task.assignee || t("empty.unassigned") })}
                                  status={task.status}
                                  taskNumber={formatTaskDisplayId(task)}
                                  title={task.issueTitle}
                                  variant="calendar-agenda"
                                />
                              );
                            })}
                          </div>
                        </section>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="calendar-month">
                    {!hasVisibleCalendarTasks ? (
                      <div className="calendar-empty-state calendar-empty-state--inline">
                        <h3>{calendarEmptyState.title}</h3>
                        <p>{calendarEmptyState.body}</p>
                      </div>
                    ) : null}
                    <div className="calendar-weekdays">
                      {calendarWeekdayColumns.map((weekday) => (
                        <span className={clsx("calendar-weekdays__label", weekday.isHoliday && "calendar-weekdays__label--holiday")} key={weekday.index}>
                          {weekday.label}
                        </span>
                      ))}
                    </div>
                    <div className="calendar-grid">
                      {calendarDays.map((day) => {
                        const dayKey = format(day, "yyyy-MM-dd");
                        const dayTasks = monthGridTasksByDueDate[dayKey] ?? [];
                        const isHoliday = isCalendarHolidayDate(day, calendarHolidayDateSet, calendarHolidayLoadedMonthSet);

                        return (
                          <article
                            className={clsx(
                              "calendar-cell",
                              isHoliday && "calendar-cell--holiday",
                              !isSameMonth(day, activeCalendarMonth) && "calendar-cell--muted",
                              isToday(day) && "calendar-cell--today",
                            )}
                            key={dayKey}
                          >
                            <header className="calendar-cell__header">
                              <span>{format(day, "d")}</span>
                              <small>{formatDay(day)}</small>
                            </header>
                            <div className="calendar-cell__items">
                              {dayTasks.map((task) => {
                                const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);

                                return (
                                  <TaskPreviewCard
                                    className={clsx("calendar-cell__task-card", getTaskPreviewStateClassName(task, deadlineBadge?.tone))}
                                    deadlineLabel={deadlineBadge?.label}
                                    deadlineTone={deadlineBadge?.tone}
                                    dueDateLabel={task.dueDate || "-"}
                                    href={`${basePath}/daily?taskId=${task.id}` as Route}
                                    id={task.id}
                                    interactionMode="navigate-only"
                                    key={task.id}
                                    status={task.status}
                                    taskNumber={formatTaskDisplayId(task)}
                                    title={task.issueTitle}
                                    variant="calendar-month"
                                  />
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {mode === "trash" ? (
              <div className="trash-list">
                {trashItems.length === 0 ? <div className="board-column__empty">{t("empty.noDeletedTasks")}</div> : null}
                {trashItems.map((item) => {
                  const isTask = item.kind === "task";
                  const checked = !isWorkspaceReadOnly && (isTask ? selectedTrashTaskIdSet.has(item.id) : selectedTrashFileIdSet.has(item.id));

                  return (
                    <article
                      className={clsx("trash-card", checked && "trash-card--selected")}
                      data-selected={isWarmStudio && checked ? "true" : undefined}
                      key={`${item.kind}:${item.id}`}
                    >
                      {!isWorkspaceReadOnly ? (
                        <label className="trash-card__checkbox">
                          <input
                            aria-label={isTask ? t("workspace.trashItemTask") : t("workspace.trashItemFile")}
                            checked={checked}
                            onChange={() => {
                              if (isTask) {
                                toggleTrashTaskSelection(item.id);
                                return;
                              }

                              toggleTrashFileSelection(item.id);
                            }}
                            type="checkbox"
                          />
                        </label>
                      ) : null}
                      <div className="trash-card__content">
                        {isTask ? (
                          <>
                            <div className="trash-card__meta-row">
                              <span className="trash-card__type trash-card__type--task">{t("workspace.trashItemTask")}</span>
                              <strong>{formatTaskDisplayId(item.task)}</strong>
                            </div>
                            <p>{item.task.issueTitle || t("empty.noDescription")}</p>
                            <small>{t("workspace.deletedDateMeta", { date: fileSafeDate(item.task.deletedAt) })}</small>
                          </>
                        ) : (
                          <>
                            <div className="trash-card__meta-row">
                              <span className="trash-card__type trash-card__type--file">{t("workspace.trashItemFile")}</span>
                              <strong>
                                {item.file.originalName} <span className="file-pill__version">{item.file.versionLabel}</span>
                              </strong>
                            </div>
                            <p>{formatFileAttachmentMeta(item.file)}</p>
                            <small>{t("workspace.deletedDateMeta", { date: fileSafeDate(item.file.deletedAt) })}</small>
                          </>
                        )}
                      </div>
                      {!isWorkspaceReadOnly ? (
                        <div className="trash-card__actions">
                          {isTask ? (
                            <>
                              <button className={clsx("primary-button", isWarmStudio && "trash-card__restore-button")} onClick={() => void restoreTask(item.task.id)} type="button">
                                {t("actions.restore")}
                              </button>
                              <button className={clsx("danger-button", isWarmStudio && "trash-card__delete-button")} onClick={() => void deleteTaskPermanently(item.task)} type="button">
                                {t("actions.deletePermanently")}
                              </button>
                            </>
                          ) : (
                            <>
                              <button className={clsx("primary-button", isWarmStudio && "trash-card__restore-button")} onClick={() => void restoreFile(item.file.id)} type="button">
                                {t("actions.restore")}
                              </button>
                              <button className={clsx("danger-button", isWarmStudio && "trash-card__delete-button")} onClick={() => void deleteFilePermanently(item.file)} type="button">
                                {t("actions.deletePermanently")}
                              </button>
                            </>
                          )}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          {isDetailPanelResizable ? (
            <div
              aria-controls="task-detail-panel"
              aria-label={t("workspace.resizeFieldAria", { field: t("workspace.taskDetailsTitle") })}
              aria-orientation="vertical"
              aria-valuemax={DETAIL_PANEL_MAX_WIDTH}
              aria-valuemin={DETAIL_PANEL_MIN_WIDTH}
              aria-valuenow={detailPanelWidth}
              className="detail-panel-splitter"
              onKeyDown={handleDetailPanelResizeKeyDown}
              onPointerDown={handleDetailPanelResizeStart}
              role="separator"
              tabIndex={0}
            />
          ) : null}

          {shouldRenderDailyDetailPanel ? (
            <aside
              className={clsx(
                "detail-panel",
                isDetailDocked ? "detail-panel--docked" : "detail-panel--stacked",
                !isDetailDocked && "detail-panel--below",
                isDetailExpanded ? "detail-panel--expanded" : "detail-panel--collapsed",
              )}
              id="task-detail-panel"
              onBlurCapture={handleDetailPanelBlur}
              onFocusCapture={handleDetailPanelFocus}
              onPointerDownCapture={handleDetailPanelPointerDownCapture}
              onPointerEnter={handleDetailPanelPointerEnter}
              onPointerLeave={handleDetailPanelPointerLeave}
            >
              <header className="detail-panel__header">
                <div className="detail-panel__header-main">
                  <button
                    aria-expanded={isDetailExpanded}
                    aria-label={isDetailExpanded ? t("workspace.taskDetailsTitle") : t("workspace.expandDetailPanel")}
                    className="detail-panel__summary-button"
                    onClick={handleDetailPanelSummaryClick}
                    type="button"
                  >
                    <div className="detail-panel__summary">
                      {isWarmStudio ? (
                        <div className="detail-panel__summary-topline">
                          <p className="workspace__eyebrow">{t("workspace.taskDetailsTitle")}</p>
                          {selectedTask ? <span className={clsx("status-pill", `status-pill--${selectedTask.status}`)}>{labelForStatus(selectedTask.status)}</span> : null}
                        </div>
                      ) : (
                        <p className="workspace__eyebrow">{t("workspace.taskDetailsTitle")}</p>
                      )}
                      <h3>{detailSummary}</h3>
                      {isWarmStudio && selectedTask ? <p className="detail-panel__summary-meta">{selectedTask.assignee || t("empty.unassigned")}</p> : null}
                    </div>
                  </button>
                  <div className="detail-panel__header-primary-actions">
                    <button
                      aria-label={isDetailPanelSticky ? t("workspace.unpinDetailPanel") : t("workspace.pinDetailPanel")}
                      aria-pressed={isDetailPanelSticky}
                      className={clsx("detail-panel__icon-button", isDetailPanelSticky && "detail-panel__icon-button--active")}
                      onClick={handleDetailPanelPinToggle}
                      type="button"
                    >
                      <DetailPanelPinIcon />
                    </button>
                    <button
                      aria-label={isDetailExpanded ? t("workspace.collapseDetailPanel") : t("workspace.expandDetailPanel")}
                      className="detail-panel__icon-button"
                      onClick={handleDetailPanelToggle}
                      type="button"
                    >
                      <span aria-hidden="true" className="detail-panel__icon-mark">
                        {isDetailExpanded ? "-" : "+"}
                      </span>
                    </button>
                  </div>
                </div>
                {selectedTask && !isTrashMode && isDetailExpanded && !isWorkspaceReadOnly ? (
                  <div className="detail-panel__header-secondary-actions">
                    <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">
                      {t("actions.moveToTrash")}
                    </button>
                  </div>
                ) : null}
              </header>

              {isDetailExpanded ? (
                isPreviewDaily ? (
                  previewDetailPanelBody
                ) : draft ? (
                  <div className="detail-panel__body">
                    <TaskFormFields
                      assigneeOptions={assigneeOptions}
                      form={draft}
                      onChange={updateSelectedTaskForm}
                      readonly={taskFormReadonly}
                      categoryDefinitionsByField={categoryDefinitionsByField}
                      workTypeDefinitions={workTypeDefinitions}
                    />

                    <label>
                      <span>{labelForField("parentActionId")}</span>
                      <input
                        onChange={(event) => updateParentTaskNumberDraft(event.target.value)}
                        placeholder={t("workspace.parentTaskNumberPlaceholder")}
                        readOnly={isWorkspaceReadOnly}
                        value={parentTaskNumberDraft}
                      />
                    </label>

                    {!isWorkspaceReadOnly ? <div className="detail-actions">
                      <button className="primary-button" disabled={saving} onClick={() => void saveSelectedTask()} type="button">
                        {saving ? t("actions.saving") : t("actions.save")}
                      </button>
                      <button className="secondary-button" onClick={resetSelectedTaskDraft} type="button">
                        {t("actions.resetChanges")}
                      </button>
                    </div> : null}

                    <section className="detail-section">
                      <div className="detail-section__header">
                        <h4>{labelForField("linkedDocuments")}</h4>
                      </div>
                      {!isWorkspaceReadOnly ? <div className="upload-box">
                        <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                        <button className="primary-button" onClick={() => void uploadSelectedFile()} type="button">
                          {t("actions.uploadFile")}
                        </button>
                      </div> : null}
                      {!isWorkspaceReadOnly && selectedFiles.length > 0 ? (
                        <div className="upload-box upload-box--version">
                          <select onChange={(event) => setVersionTargetId(event.target.value)} value={versionTargetId}>
                            {selectedFiles.map((file) => (
                              <option key={file.id} value={file.id}>
                                {file.originalName} {file.versionLabel}
                              </option>
                            ))}
                          </select>
                          <input onChange={(event) => setPendingVersionUpload(event.target.files?.[0] ?? null)} type="file" />
                          <button className="secondary-button" onClick={() => void uploadNextVersion()} type="button">
                            {t("actions.uploadNextVersion")}
                          </button>
                        </div>
                      ) : null}
                      <div className="file-list">
                        {selectedTaskFilesLoading ? <p>{t("system.loading")}</p> : null}
                        {!selectedTaskFilesLoading && selectedFiles.length === 0 ? <p>{t("empty.noLinkedDocuments")}</p> : null}
                        {selectedFiles.map((file) => (
                          <article className="file-pill" key={file.id}>
                            <div className="file-pill__meta">
                              <strong>
                                {file.originalName} <span className="file-pill__version">{file.versionLabel}</span>
                              </strong>
                              <small>{formatFileAttachmentMeta(file)}</small>
                            </div>
                            <div className="file-pill__actions">
                              {!isPreview ? (
                                <>
                                  <a
                                    className="secondary-button"
                                    href={buildFileContentUrl(file.id, "inline", { allowDeleted: Boolean(file.deletedAt) })}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    {t("actions.open")}
                                  </a>
                                  <button
                                    className="secondary-button"
                                    onClick={() => void downloadFileAttachment(file).catch(() => setErrorMessage("파일을 다운로드하지 못했습니다."))}
                                    type="button"
                                  >
                                    {t("actions.save")}
                                  </button>
                                </>
                              ) : null}
                              {!isWorkspaceReadOnly ? (
                                <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">
                                  {t("actions.remove")}
                                </button>
                              ) : null}
                            </div>
                          </article>
                        ))}
                      </div>
                      {!isPreview && selectedFiles.length > 0 ? (
                        <section className="detail-preview">
                          <div className="detail-section__header">
                            <h4>{t("workspace.filePreviewTitle")}</h4>
                          </div>
                          {previewableSelectedFiles.length > 1 ? (
                            <label className="detail-preview__picker">
                              <span>{t("workspace.previewFileLabel")}</span>
                              <select onChange={(event) => setActivePreviewFileId(event.target.value)} value={activePreviewFile?.id ?? ""}>
                                {previewableSelectedFiles.map((file) => (
                                  <option key={file.id} value={file.id}>
                                    {file.originalName} {file.versionLabel}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {activePreviewFile && activePreviewUrl && activePreviewKind ? (
                            <div className="detail-preview__surface">
                              <p className="detail-preview__meta">{activePreviewFile.originalName} - {formatFileAttachmentMeta(activePreviewFile)}</p>
                              {isPreviewLoading ? <p className="detail-preview__status">{t("workspace.previewLoading")}</p> : null}
                              {activePreviewKind === "image" ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  alt={activePreviewFile.originalName}
                                  className="detail-preview__image"
                                  key={activePreviewUrl}
                                  onError={() => setIsPreviewLoading(false)}
                                  onLoad={() => setIsPreviewLoading(false)}
                                  src={activePreviewUrl}
                                />
                              ) : (
                                <iframe
                                  className="detail-preview__frame"
                                  key={activePreviewUrl}
                                  onLoad={() => setIsPreviewLoading(false)}
                                  src={activePreviewUrl}
                                  title={`${t("workspace.filePreviewTitle")} ${activePreviewFile.originalName}`}
                                />
                              )}
                            </div>
                          ) : (
                            <p className="detail-preview__placeholder">{t("workspace.previewUnavailable")}</p>
                          )}
                        </section>
                      ) : null}
                    </section>
                  </div>
                ) : (
                  <div className="detail-panel__empty">{t("workspace.detailPanelEmpty")}</div>
                )
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TaskListSpacerRow({ height }: { height: number }) {
  return (
    <tr aria-hidden="true" role="presentation">
      <td
        colSpan={dailyTaskListColumns.length}
        style={{
          height: `${height}px`,
          minHeight: `${height}px`,
          padding: 0,
          border: 0,
          background: "transparent",
          pointerEvents: "none",
        }}
      />
    </tr>
  );
}

function DailyTaskTableBody({
  rows,
  pinnedTaskIds,
  shouldVirtualize,
  layoutStore,
  interactionStore,
  filesByTaskId,
  focusedTaskIds,
  currentDayKey,
  hideIssueIdOverdueBadge,
  isManualReorderDisabled,
  isHtmlDragReorderDisabled,
  isPreviewReadOnly,
  isReorderingTasks,
  activeTaskListInlineEditRowId,
  draft,
  inlineSavingFields,
  workTypeDefinitions,
  categoryDefinitionsByField,
  registerTaskListRowCellRef,
  focusTaskListEditableCell,
  updateDraftForm,
  saveInlineTaskListField,
  moveTaskByOffset,
  handleTaskRowDragStart,
  handleTaskRowDragOver,
  handleTaskRowDrop,
  clearTaskDragInteraction,
  handleTaskListRowAutoFitDoubleClick,
  handleTaskListRowResizeStart,
  selectTask,
}: DailyTaskTableBodyProps) {
  const { rowHeights, viewport, liveRowHeight } = useTaskListLayoutSnapshot(layoutStore);
  const dailyTaskTableWindow = useMemo(
    () =>
      buildDailyTaskTableWindow({
        enabled: shouldVirtualize,
        pinnedTaskIds,
        liveRowHeight,
        viewportHeight: viewport.height,
        scrollTop: viewport.scrollTop,
        rowHeights,
        rows,
      }),
    [liveRowHeight, pinnedTaskIds, rowHeights, rows, shouldVirtualize, viewport.height, viewport.scrollTop],
  );

  return (
    <>
      {dailyTaskTableWindow.items.map((item) => {
        if (item.kind === "spacer") {
          return <TaskListSpacerRow height={item.height} key={item.key} />;
        }

        const row = item.row;
        const task = row.task;
        if (USE_MEMOIZED_DAILY_TASK_ROWS) {
          return (
            <DailyTaskTableRow
              categoryDefinitionsByField={categoryDefinitionsByField}
              clearTaskDragInteraction={clearTaskDragInteraction}
              currentDayKey={currentDayKey}
              focusTaskListEditableCell={focusTaskListEditableCell}
              handleTaskListRowAutoFitDoubleClick={handleTaskListRowAutoFitDoubleClick}
              handleTaskListRowResizeStart={handleTaskListRowResizeStart}
              handleTaskRowDragOver={handleTaskRowDragOver}
              handleTaskRowDragStart={handleTaskRowDragStart}
              handleTaskRowDrop={handleTaskRowDrop}
              isHtmlDragReorderDisabled={isHtmlDragReorderDisabled}
              isManualReorderDisabled={isManualReorderDisabled}
              hideIssueIdOverdueBadge={hideIssueIdOverdueBadge}
              inlineSavingFields={inlineSavingFields}
              isPreviewReadOnly={isPreviewReadOnly}
              isReorderingTasks={isReorderingTasks}
              interactionStore={interactionStore}
              key={task.id}
              moveTaskByOffset={moveTaskByOffset}
              registerTaskListRowCellRef={registerTaskListRowCellRef}
              row={row}
              rowDraft={task.id === activeTaskListInlineEditRowId && draft?.id === task.id ? draft : null}
              rowHeight={resolveTaskListDisplayedRowHeight(task.id, rowHeights, liveRowHeight)}
              saveInlineTaskListField={saveInlineTaskListField}
              selectTask={selectTask}
              taskFiles={filesByTaskId[task.id] ?? EMPTY_TASK_FILES}
              updateDraftForm={updateDraftForm}
              workTypeDefinitions={workTypeDefinitions}
            />
          );
        }

        const taskFiles = filesByTaskId[task.id] ?? EMPTY_TASK_FILES;
        const linkedDocumentsDisplay = formatLinkedDocumentsSummary(task, taskFiles);
        const rowHeight = resolveTaskListDisplayedRowHeight(task.id, rowHeights, liveRowHeight);
        const rowResizeAria = t("workspace.resizeFieldAria", { field: formatTaskDisplayId(task) });
        const rowAutoFitAria = rowResizeAria;
        const interactionSnapshot = interactionStore.getTaskSnapshot(task.id);
        const isOverdueRow = isTaskOverdue(task, currentDayKey);
        const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
        const isDimmedRow = Boolean(focusedTaskIds && !focusedTaskIds.has(task.id));
        const rowDraft = task.id === activeTaskListInlineEditRowId && draft?.id === task.id ? draft : null;
        const rowPresentationContext = createTaskListRowPresentationContext({
          activeInlineColumnKey: interactionSnapshot.activeInlineColumnKey,
          task,
          row,
          rowDraft,
          linkedDocumentsDisplay,
          workTypeDefinitions,
          categoryDefinitionsByField,
        });

        const renderTaskListCellContent = (columnKey: TaskListColumnKey, presentation: TaskListCellPresentation) => {
          switch (presentation.kind) {
            case "tree":
              return (
                <div className="task-tree">
                  {presentation.isChildTask ? (
                    <span aria-hidden="true" className="task-tree__guides">
                      {presentation.ancestorGuideFlags.map((hasNextSibling, index) => (
                        <span className={clsx("task-tree__lane", hasNextSibling && "task-tree__lane--continue")} key={task.id + "-lane-" + index} />
                      ))}
                      <span className={clsx("task-tree__branch", presentation.isLastChild ? "task-tree__branch--last" : "task-tree__branch--middle")} />
                    </span>
                  ) : null}
                  {!isPreviewReadOnly ? (
                  <button
                    aria-label="재정렬"
                    className="task-tree__drag-handle"
                    disabled={isHtmlDragReorderDisabled || isReorderingTasks}
                    draggable={!isHtmlDragReorderDisabled && !isReorderingTasks}
                    onClick={(event) => event.stopPropagation()}
                    onDragEnd={clearTaskDragInteraction}
                    onDragStart={(event) => handleTaskRowDragStart(task, event)}
                    type="button"
                  >
                    <span aria-hidden="true" className="task-tree__drag-grip" />
                  </button>
                  ) : null}
                  <span
                    className={clsx(
                      "task-tree__badge",
                      presentation.isParentTask && "task-tree__badge--parent",
                      presentation.isChildTask && "task-tree__badge--child",
                      presentation.isBranchTask && "task-tree__badge--branch",
                    )}
                  >
                    {presentation.actionId}
                  </span>
                  {deadlineBadge && !hideIssueIdOverdueBadge ? (
                    <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineBadge.tone}`)}>
                      {deadlineBadge.label}
                    </span>
                  ) : null}
                  {interactionSnapshot.isSelectedRow && !isPreviewReadOnly ? (
                    <span className="task-tree__actions">
                      <button
                        aria-label="위로 이동"
                        className="task-tree__move-button"
                        disabled={isManualReorderDisabled || isReorderingTasks}
                        onClick={(event) => {
                          event.stopPropagation();
                          void moveTaskByOffset(task.id, -1);
                        }}
                        type="button"
                      >
                        위
                      </button>
                      <button
                        aria-label="아래로 이동"
                        className="task-tree__move-button"
                        disabled={isManualReorderDisabled || isReorderingTasks}
                        onClick={(event) => {
                          event.stopPropagation();
                          void moveTaskByOffset(task.id, 1);
                        }}
                        type="button"
                      >
                        아래
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            case "text":
              return presentation.text;
            case "title":
              return (
                <span
                  className={clsx(
                    "sheet-table__title-copy",
                    presentation.isParentTask && "sheet-table__title-copy--parent",
                    presentation.isChildTask && "sheet-table__title-copy--child",
                    presentation.isBranchTask && "sheet-table__title-copy--branch",
                  )}
                >
                  {presentation.text}
                </span>
              );
            case "files":
              return (
                <>
                  <strong>{presentation.primary}</strong>
                  {presentation.secondary ? <small>{presentation.secondary}</small> : null}
                </>
              );
            case "readonly-checkbox":
              return (
                <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
                  <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
                </span>
              );
            case "readonly-status":
              return <span className={clsx("status-pill", `status-pill--${presentation.value}`)}>{labelForStatus(presentation.value)}</span>;
            case "editable-date":
            case "editable-text":
              return presentation.value || "-";
            case "editable-checkbox":
              return (
                <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
                  <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
                </span>
              );
            case "editable-categorical":
              return presentation.label;
          }
        };

        const renderTaskListCell = (column: TaskListColumnConfig) => {
          const editableField = getEditableTaskListField(column.key);
          const presentation = buildTaskListCellPresentation(column.key, rowPresentationContext);
          const isEditableCell = Boolean(editableField) && !isPreviewReadOnly;
          const isActiveInlineCell = interactionSnapshot.activeInlineColumnKey === column.key;

          return (
            <td
              className={column.className}
              data-task-column={column.key}
              key={column.key}
              onDoubleClick={
                editableField && !isPreviewReadOnly
                  ? (event) => {
                      const target = event.target;
                      if (rowDraft && target instanceof HTMLElement) {
                        const inlineEditor = target.closest('input, textarea, select, button[data-task-multiselect-trigger="true"]');
                        if (inlineEditor) {
                          return;
                        }
                      }

                      event.stopPropagation();
                      focusTaskListEditableCell(task.id, column.key);
                    }
                  : undefined
              }
            >
              <div
                className={clsx(
                  "sheet-table__cell-shell",
                  column.key === "actionId" && "sheet-table__cell-shell--tree",
                  isActiveInlineCell && "sheet-table__cell-shell--active-inline",
                )}
                ref={(node) => registerTaskListRowCellRef(task.id, column.key, node)}
                style={{ height: `${rowHeight}px` }}
              >
                <div
                  className={clsx(
                    "sheet-table__cell-content",
                    isEditableCell && "sheet-table__cell-content--editable",
                    isActiveInlineCell && "sheet-table__cell-content--overlay-hidden",
                    isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
                  )}
                >
                  {renderTaskListCellContent(column.key, presentation)}
                </div>
                {!isPreviewReadOnly ? <button
                  aria-label={rowResizeAria}
                  className="sheet-table__row-resize-handle"
                  onDoubleClick={(event) => handleTaskListRowAutoFitDoubleClick(task.id, event)}
                  onPointerDown={(event) => handleTaskListRowResizeStart(task.id, event)}
                  title={rowAutoFitAria}
                  type="button"
                /> : null}
              </div>
            </td>
          );
        };

        return (
          <tr
            className={clsx(
              interactionSnapshot.isSelectedRow && "sheet-row--active",
              "task-state-row",
              `task-state-row--${task.status}`,
              isOverdueRow && "task-state-row--overdue",
              isDimmedRow && "task-state-row--dimmed",
              interactionSnapshot.taskDropPosition && `task-state-row--drop-${interactionSnapshot.taskDropPosition}`,
            )}
            data-task-row-id={task.id}
            key={task.id}
            onClick={() => selectTask(task.id)}
            onDragOver={!isPreviewReadOnly ? (event) => handleTaskRowDragOver(task, event) : undefined}
            onDrop={!isPreviewReadOnly ? (event) => void handleTaskRowDrop(task, event) : undefined}
          >
            {dailyTaskListColumns.map((column) => renderTaskListCell(column))}
          </tr>
        );
      })}
    </>
  );
}

const DailyTaskTableRow = memo(function DailyTaskTableRow({
  row,
  taskFiles,
  rowHeight,
  currentDayKey,
  hideIssueIdOverdueBadge,
  interactionStore,
  isManualReorderDisabled,
  isHtmlDragReorderDisabled,
  isPreviewReadOnly,
  isReorderingTasks,
  rowDraft,
  inlineSavingFields,
  workTypeDefinitions,
  categoryDefinitionsByField,
  registerTaskListRowCellRef,
  focusTaskListEditableCell,
  updateDraftForm,
  saveInlineTaskListField,
  moveTaskByOffset,
  handleTaskRowDragStart,
  handleTaskRowDragOver,
  handleTaskRowDrop,
  clearTaskDragInteraction,
  handleTaskListRowAutoFitDoubleClick,
  handleTaskListRowResizeStart,
  selectTask,
}: DailyTaskTableRowProps) {
  const task = row.task;
  const { activeInlineColumnKey, isDimmedRow, isSelectedRow, taskDropPosition } = useTaskListRowInteractionState(interactionStore, task.id);
  const linkedDocumentsDisplay = formatLinkedDocumentsSummary(task, taskFiles);
  const rowResizeAria = t("workspace.resizeFieldAria", { field: formatTaskDisplayId(task) });
  const rowAutoFitAria = rowResizeAria;
  const isOverdueRow = isTaskOverdue(task, currentDayKey);
  const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
  const rowPresentationContext = createTaskListRowPresentationContext({
    activeInlineColumnKey,
    task,
    row,
    rowDraft,
    linkedDocumentsDisplay,
    workTypeDefinitions,
    categoryDefinitionsByField,
  });

  const renderTaskListCellContent = (columnKey: TaskListColumnKey, presentation: TaskListCellPresentation) => {
    switch (presentation.kind) {
      case "tree":
        return (
          <div className="task-tree">
            {presentation.isChildTask ? (
              <span aria-hidden="true" className="task-tree__guides">
                {presentation.ancestorGuideFlags.map((hasNextSibling, index) => (
                  <span className={clsx("task-tree__lane", hasNextSibling && "task-tree__lane--continue")} key={task.id + "-lane-" + index} />
                ))}
                <span className={clsx("task-tree__branch", presentation.isLastChild ? "task-tree__branch--last" : "task-tree__branch--middle")} />
              </span>
            ) : null}
            {!isPreviewReadOnly ? (
            <button
              aria-label="재정렬"
              className="task-tree__drag-handle"
              disabled={isHtmlDragReorderDisabled || isReorderingTasks}
              draggable={!isHtmlDragReorderDisabled && !isReorderingTasks}
              onClick={(event) => event.stopPropagation()}
              onDragEnd={clearTaskDragInteraction}
              onDragStart={(event) => handleTaskRowDragStart(task, event)}
              type="button"
            >
              <span aria-hidden="true" className="task-tree__drag-grip" />
            </button>
            ) : null}
            <span
              className={clsx(
                "task-tree__badge",
                presentation.isParentTask && "task-tree__badge--parent",
                presentation.isChildTask && "task-tree__badge--child",
                presentation.isBranchTask && "task-tree__badge--branch",
              )}
            >
              {presentation.actionId}
            </span>
            {deadlineBadge && !hideIssueIdOverdueBadge ? (
              <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineBadge.tone}`)}>
                {deadlineBadge.label}
              </span>
            ) : null}
            {isSelectedRow && !isPreviewReadOnly ? (
              <span className="task-tree__actions">
                <button
                  aria-label="위로 이동"
                  className="task-tree__move-button"
                  disabled={isManualReorderDisabled || isReorderingTasks}
                  onClick={(event) => {
                    event.stopPropagation();
                    void moveTaskByOffset(task.id, -1);
                  }}
                  type="button"
                >
                  위
                </button>
                <button
                  aria-label="아래로 이동"
                  className="task-tree__move-button"
                  disabled={isManualReorderDisabled || isReorderingTasks}
                  onClick={(event) => {
                    event.stopPropagation();
                    void moveTaskByOffset(task.id, 1);
                  }}
                  type="button"
                >
                  아래
                </button>
              </span>
            ) : null}
          </div>
        );
      case "text":
        return presentation.text;
      case "title":
        return (
          <span
            className={clsx(
              "sheet-table__title-copy",
              presentation.isParentTask && "sheet-table__title-copy--parent",
              presentation.isChildTask && "sheet-table__title-copy--child",
              presentation.isBranchTask && "sheet-table__title-copy--branch",
            )}
          >
            {presentation.text}
          </span>
        );
      case "files":
        return (
          <>
            <strong>{presentation.primary}</strong>
            {presentation.secondary ? <small>{presentation.secondary}</small> : null}
          </>
        );
      case "readonly-checkbox":
        return (
          <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
            <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
          </span>
        );
      case "readonly-status":
        return <span className={clsx("status-pill", `status-pill--${presentation.value}`)}>{labelForStatus(presentation.value)}</span>;
      case "editable-date":
      case "editable-text":
        return presentation.value || "-";
      case "editable-checkbox":
        return (
          <span className="sheet-table__readonly-checkbox" aria-label={labelForField("calendarLinked")}>
            <input checked={presentation.checked} disabled readOnly tabIndex={-1} type="checkbox" />
          </span>
        );
      case "editable-categorical":
        return presentation.label;
    }
  };

  const renderTaskListCell = (column: TaskListColumnConfig) => {
    const editableField = getEditableTaskListField(column.key);
    const presentation = buildTaskListCellPresentation(column.key, rowPresentationContext);
    const isEditableCell = Boolean(editableField) && !isPreviewReadOnly;
    const isActiveInlineCell = activeInlineColumnKey === column.key;

    return (
      <td
        className={column.className}
        data-task-column={column.key}
        key={column.key}
        onDoubleClick={
          editableField && !isPreviewReadOnly
            ? (event) => {
                const target = event.target;
                if (rowDraft && target instanceof HTMLElement) {
                  const inlineEditor = target.closest('input, textarea, select, button[data-task-multiselect-trigger="true"]');
                  if (inlineEditor) {
                    return;
                  }
                }

                event.stopPropagation();
                focusTaskListEditableCell(task.id, column.key);
              }
            : undefined
        }
      >
        <div
          className={clsx(
            "sheet-table__cell-shell",
            column.key === "actionId" && "sheet-table__cell-shell--tree",
            isActiveInlineCell && "sheet-table__cell-shell--active-inline",
          )}
          ref={(node) => registerTaskListRowCellRef(task.id, column.key, node)}
          style={{ height: `${rowHeight}px` }}
        >
          <div
              className={clsx(
                "sheet-table__cell-content",
                isEditableCell && "sheet-table__cell-content--editable",
                isActiveInlineCell && "sheet-table__cell-content--overlay-hidden",
                isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
              )}
            >
            {renderTaskListCellContent(column.key, presentation)}
          </div>
          {!isPreviewReadOnly ? <button
            aria-label={rowResizeAria}
            className="sheet-table__row-resize-handle"
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleTaskListRowAutoFitDoubleClick(task.id, event);
            }}
            onPointerDown={(event) => handleTaskListRowResizeStart(task.id, event)}
            title={rowAutoFitAria}
            type="button"
          /> : null}
        </div>
      </td>
    );
  };

  return (
    <tr
      className={clsx(
        isSelectedRow && "sheet-row--active",
        "task-state-row",
        `task-state-row--${task.status}`,
        isOverdueRow && "task-state-row--overdue",
        isDimmedRow && "task-state-row--dimmed",
        taskDropPosition && `task-state-row--drop-${taskDropPosition}`,
      )}
      data-task-row-id={task.id}
      onClick={() => selectTask(task.id)}
      onDragOver={!isPreviewReadOnly ? (event) => handleTaskRowDragOver(task, event) : undefined}
      onDrop={!isPreviewReadOnly ? (event) => void handleTaskRowDrop(task, event) : undefined}
    >
      {dailyTaskListColumns.map((column) => renderTaskListCell(column))}
    </tr>
  );
}, areDailyTaskTableRowPropsEqual);

function areDailyTaskTableRowPropsEqual(previous: DailyTaskTableRowProps, next: DailyTaskTableRowProps) {
  if (previous.row !== next.row) return false;
  if (previous.taskFiles !== next.taskFiles) return false;
  if (previous.rowHeight !== next.rowHeight) return false;
  if (previous.currentDayKey !== next.currentDayKey) return false;
  if (previous.hideIssueIdOverdueBadge !== next.hideIssueIdOverdueBadge) return false;
  if (previous.interactionStore !== next.interactionStore) return false;
  if (previous.isManualReorderDisabled !== next.isManualReorderDisabled) return false;
  if (previous.isHtmlDragReorderDisabled !== next.isHtmlDragReorderDisabled) return false;
  if (previous.isPreviewReadOnly !== next.isPreviewReadOnly) return false;
  if (previous.isReorderingTasks !== next.isReorderingTasks) return false;
  if (previous.rowDraft !== next.rowDraft) return false;
  if (previous.workTypeDefinitions !== next.workTypeDefinitions) return false;
  if (previous.categoryDefinitionsByField !== next.categoryDefinitionsByField) return false;
  if ((previous.rowDraft !== null || next.rowDraft !== null) && previous.inlineSavingFields !== next.inlineSavingFields) return false;
  return true;
}

function DetailPanelPinIcon() {
  return (
    <svg aria-hidden="true" className="detail-panel__icon" fill="none" height="14" viewBox="0 0 24 24" width="14">
      <path d="M9 4h6l-1.5 4v3l2 2v1H8.5V13l2-2V8L9 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M12 14v6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function QuickCreateDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const pickerValue = isIsoDateValue(value) ? value : "";

  function openPicker() {
    const input = nativeInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  return (
    <div className="detail-date-shell">
      <input
        className="detail-date-shell__text"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("workspace.dateInputPlaceholder")}
        value={value}
      />
      <input
        aria-hidden="true"
        className="detail-date-shell__native"
        onChange={(event) => onChange(event.target.value)}
        ref={nativeInputRef}
        tabIndex={-1}
        type="date"
        value={pickerValue}
      />
      <button aria-label={t("workspace.datePickerAria", { label })} className="detail-date-shell__picker" onClick={openPicker} type="button">
        <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
          <rect height="15" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
          <path d="M8 3v6M16 3v6M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      </button>
    </div>
  );
}

function DetailPanelDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const pickerValue = isIsoDateValue(value) ? value : "";

  function openPicker() {
    const input = nativeInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
    input.click();
  }

  return (
    <div className="detail-date-shell detail-date-shell--detail">
      <input
        className="detail-date-shell__text"
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("workspace.dateInputPlaceholder")}
        value={value}
      />
      <input
        aria-hidden="true"
        className="detail-date-shell__native"
        onChange={(event) => onChange(event.target.value)}
        ref={nativeInputRef}
        tabIndex={-1}
        type="date"
        value={pickerValue}
      />
      <button aria-label={t("workspace.datePickerAria", { label })} className="detail-date-shell__picker" onClick={openPicker} type="button">
        <svg aria-hidden="true" fill="none" height="14" viewBox="0 0 24 24" width="14">
          <rect height="15" rx="2" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
          <path d="M8 3v6M16 3v6M4 10h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        </svg>
      </button>
    </div>
  );
}

const LEGACY_ASSIGNEE_SELECT_VALUE = "__legacy_assignee__";

type AssigneeSelection = {
  profileId: string | null;
  label: string;
};

type TaskAssigneeSelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "children"> & {
  assignee: string;
  assigneeProfileId?: string | null;
  assigneeOptions: readonly AssigneeOption[];
  onChange: (selection: AssigneeSelection) => void;
};

function formatAssigneeOptionLabel(option: AssigneeOption) {
  const name = option.displayName.trim();
  const email = option.email.trim();

  if (name && email && name.toLowerCase() !== email.toLowerCase()) {
    return `${name} (${email})`;
  }

  return name || email || option.profileId;
}

function formatAssigneeSnapshot(option: AssigneeOption) {
  return option.displayName.trim() || option.email.trim() || "";
}

function TaskAssigneeSelect({
  assignee,
  assigneeProfileId,
  assigneeOptions,
  onChange,
  ...selectProps
}: TaskAssigneeSelectProps) {
  const normalizedProfileId = assigneeProfileId?.trim() || null;
  const selectedOption = normalizedProfileId
    ? assigneeOptions.find((option) => option.profileId === normalizedProfileId) ?? null
    : null;
  const hasLegacyAssignee = !normalizedProfileId && Boolean(assignee.trim());
  const hasUnknownLinkedAssignee = Boolean(normalizedProfileId && !selectedOption);
  const value = normalizedProfileId ?? (hasLegacyAssignee ? LEGACY_ASSIGNEE_SELECT_VALUE : "");

  return (
    <select
      {...selectProps}
      onChange={(event) => {
        const nextProfileId = event.target.value;
        if (!nextProfileId || nextProfileId === LEGACY_ASSIGNEE_SELECT_VALUE) {
          onChange({ profileId: null, label: "" });
          return;
        }

        const option = assigneeOptions.find((candidate) => candidate.profileId === nextProfileId);
        onChange({
          profileId: nextProfileId,
          label: option ? formatAssigneeSnapshot(option) : assignee.trim(),
        });
      }}
      value={value}
    >
      <option value="">{t("empty.unassigned")}</option>
      {hasLegacyAssignee ? (
        <option disabled value={LEGACY_ASSIGNEE_SELECT_VALUE}>
          {assignee.trim()}
        </option>
      ) : null}
      {hasUnknownLinkedAssignee ? (
        <option disabled value={normalizedProfileId ?? ""}>
          {assignee.trim() || normalizedProfileId}
        </option>
      ) : null}
      {assigneeOptions.map((option) => (
        <option key={option.profileId} value={option.profileId}>
          {formatAssigneeOptionLabel(option)}
        </option>
      ))}
    </select>
  );
}

function TaskListInlineEditor({
  columnKey,
  fieldKey,
  form,
  onChange,
  onCommit,
  onCancel,
  saving = false,
  assigneeOptions = [],
  workTypeDefinitions = [],
  categoryDefinitionsByField = {},
}: {
  columnKey: TaskListColumnKey;
  fieldKey: EditableTaskFormKey;
  form: TaskRecord;
  onChange: TaskFormChangeHandler;
  onCommit: (columnKey: TaskListColumnKey) => Promise<void> | void;
  onCancel?: (columnKey: TaskListColumnKey) => void;
  saving?: boolean;
  assigneeOptions?: readonly AssigneeOption[];
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
}) {
  const fieldLabel = fieldKey === "assigneeProfileId" ? labelForField("assignee") : labelForField(fieldKey);
  const sharedProps = {
    "aria-label": fieldLabel,
    disabled: saving,
    onClick: stopTaskListInlineEvent,
    onDoubleClick: stopTaskListInlineEvent,
    onPointerDown: stopTaskListInlineEvent,
  } as const;

  if (fieldKey === "dueDate" || fieldKey === "reviewedAt") {
    return (
      <input
        {...sharedProps}
        className="sheet-table__inline-input sheet-table__inline-input--date"
        onBlur={() => void onCommit(columnKey)}
        onChange={(event) => onChange(fieldKey, event.target.value)}
        onKeyDown={(event) => handleTaskListInlineTextKeyDown(event, () => onCancel?.(columnKey))}
        type="date"
        value={form[fieldKey]}
      />
    );
  }

  if (fieldKey === "calendarLinked") {
    return (
      <label className="sheet-table__inline-checkbox" onClick={stopTaskListInlineEvent} onDoubleClick={stopTaskListInlineEvent} onPointerDown={stopTaskListInlineEvent}>
        <input
          aria-label={labelForField(fieldKey)}
          checked={form.calendarLinked}
          disabled={saving}
          onChange={(event) => {
            onChange("calendarLinked", event.target.checked);
            void onCommit(columnKey);
          }}
          type="checkbox"
        />
      </label>
    );
  }

  if (isTaskCategoricalFormFieldKey(fieldKey)) {
    if (fieldKey === "relatedDisciplines" || fieldKey === "locationRef") {
      return (
        <TaskCategoricalFieldMultiSelect
          className="sheet-table__inline-multiselect"
          fieldKey={fieldKey}
          onChangeValues={(values) => {
            onChange(fieldKey, serializeTaskCategoryValues(values));
            void onCommit(columnKey);
          }}
          value={form[fieldKey]}
          buttonClassName="sheet-table__inline-input sheet-table__inline-select"
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
      );
    }

    return (
      <TaskCategoricalFieldSelect
        {...sharedProps}
        className="sheet-table__inline-input sheet-table__inline-select"
        fieldKey={fieldKey as Exclude<TaskCategoricalFieldKey, "relatedDisciplines" | "locationRef">}
        onChange={(event) => {
          applyTaskCategoricalFieldChange(fieldKey, event.target.value, onChange);
          void onCommit(columnKey);
        }}
        onKeyDown={(event) => handleTaskListInlineEscapeKeyDown(event, () => onCancel?.(columnKey))}
        value={form[fieldKey]}
        categoryDefinitionsByField={categoryDefinitionsByField}
        workTypeDefinitions={workTypeDefinitions}
      />
    );
  }

  if (fieldKey === "assignee") {
    return (
      <TaskAssigneeSelect
        {...sharedProps}
        assignee={form.assignee}
        assigneeOptions={assigneeOptions}
        assigneeProfileId={form.assigneeProfileId}
        className="sheet-table__inline-input sheet-table__inline-select"
        onChange={(selection) => {
          onChange("assigneeProfileId", selection.profileId);
          onChange("assignee", selection.label);
          void onCommit(columnKey);
        }}
        onKeyDown={(event) => handleTaskListInlineEscapeKeyDown(event, () => onCancel?.(columnKey))}
      />
    );
  }

  return (
    <textarea
      {...sharedProps}
      className={clsx("sheet-table__inline-input sheet-table__inline-textarea", fieldKey === "issueTitle" && "sheet-table__inline-input--title")}
      onBlur={() => void onCommit(columnKey)}
      onChange={(event) => onChange(fieldKey, event.target.value)}
      onKeyDown={(event) => handleTaskListInlineTextKeyDown(event, () => onCancel?.(columnKey))}
      rows={1}
      value={String(form[fieldKey] ?? "")}
    />
  );
}

function TaskListInlineEditorOverlay({
  activeCell,
  assigneeOptions,
  draft,
  inlineSavingFields,
  workTypeDefinitions,
  categoryDefinitionsByField,
  getCellNode,
  onChange,
  onCommit,
  onCancel,
  pendingFocusCell,
  onFocusHandled,
  draftStore,
}: {
  activeCell: PendingTaskListFocusCell | null;
  assigneeOptions: readonly AssigneeOption[];
  draft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  getCellNode: (taskId: string, columnKey: TaskListColumnKey) => HTMLDivElement | null;
  onChange: TaskFormChangeHandler;
  onCommit: (columnKey: TaskListColumnKey) => Promise<void> | void;
  onCancel: (columnKey: TaskListColumnKey) => void;
  pendingFocusCell: PendingTaskListFocusCell | null;
  onFocusHandled: () => void;
  draftStore: TaskEditorDraftStore<TaskRecord>;
}) {
  const draftSnapshot = useTaskEditorDraftStoreSnapshot(draftStore);
  const activeFieldKey = activeCell ? getEditableTaskListField(activeCell.columnKey) : null;
  const overlayActiveCell = activeCell ? createTaskGridCellKey(activeCell.taskId, activeCell.columnKey) : null;
  const overlayPendingFocusCell = pendingFocusCell ? createTaskGridCellKey(pendingFocusCell.taskId, pendingFocusCell.columnKey) : null;

  useEffect(() => {
    if (!activeCell || !activeFieldKey || !draft || draft.id !== activeCell.taskId) {
      draftStore.clear();
      return;
    }

    draftStore.beginInlineEdit(createTaskGridCellKey(activeCell.taskId, activeCell.columnKey), draft);
  }, [activeCell, activeFieldKey, draft, draftStore]);

  return (
    <TaskInlineEditorOverlay
      activeCell={overlayActiveCell}
      className="sheet-table__editor-overlay"
      getCellNode={(taskId, columnKey) => getCellNode(taskId, columnKey as TaskListColumnKey)}
      onFocusHandled={onFocusHandled}
      pendingFocusCell={overlayPendingFocusCell}
      renderEditor={({ activeCell: overlayCell }) => {
        const fieldKey = getEditableTaskListField(overlayCell.columnKey as TaskListColumnKey);
        const overlayDraft =
          draftSnapshot.session?.taskId === overlayCell.taskId && draftSnapshot.session.columnKey === overlayCell.columnKey
            ? draftSnapshot.draft
            : null;

        if (!fieldKey || !overlayDraft || overlayDraft.id !== overlayCell.taskId) {
          return null;
        }

        return (
          <TaskListInlineEditor
            categoryDefinitionsByField={categoryDefinitionsByField}
            columnKey={overlayCell.columnKey as TaskListColumnKey}
            fieldKey={fieldKey}
            form={overlayDraft}
            assigneeOptions={assigneeOptions}
            onCancel={onCancel}
            onChange={onChange}
            onCommit={onCommit}
            saving={Boolean(inlineSavingFields[overlayCell.columnKey as TaskListColumnKey])}
            workTypeDefinitions={workTypeDefinitions}
          />
        );
      }}
    />
  );
}
function TaskFormFields({
  assigneeOptions = [],
  composerMode = "strip",
  form,
  onChange,
  layout = "detail",
  readonly = {},
  showUpdatedAt = true,
  quickCreateWidths,
  onComposerResizeStart,
  workTypeDefinitions = [],
  categoryDefinitionsByField = {},
}: {
  assigneeOptions?: readonly AssigneeOption[];
  composerMode?: ComposerLayoutMode;
  form: TaskFormDisplayState;
  onChange: TaskFormChangeHandler;
  layout?: TaskFormLayoutVariant;
  readonly?: TaskFormReadonly;
  showUpdatedAt?: boolean;
  quickCreateWidths?: ResolvedQuickCreateWidthMap;
  onComposerResizeStart?: (fieldKey: QuickCreateFieldKey, event: ReactPointerEvent<HTMLButtonElement>) => void;
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
}) {
  const isComposerStrip = layout === "composer" && composerMode === "strip";
  const gridClassName =
    layout === "composer"
      ? clsx(
          "composer-form-grid",
          isComposerStrip
            ? "composer-form-grid--strip composer-scroll-track"
            : composerMode === "stacked"
              ? "composer-form-grid--stacked"
              : "composer-form-grid--wrapped",
        )
      : "detail-form-grid";
  const composerWidths = quickCreateWidths ?? quickCreateDefaultWidths;

  function getLabelProps(fieldKey: QuickCreateFieldKey | null, className: string) {
    if (layout !== "composer" || !fieldKey || !isComposerStrip) {
      return { className };
    }

    const width = composerWidths[fieldKey];
    return {
      className: clsx(className, "composer-field--resizable"),
      "data-field-key": fieldKey,
      style: {
        flex: "0 0 " + width + "px",
        width: width + "px",
        minWidth: width + "px",
      },
    };
  }

  function renderResizeHandle(fieldKey: QuickCreateFieldKey) {
    if (!isComposerStrip || !onComposerResizeStart) return null;
    return (
      <button
        aria-label={t("workspace.resizeFieldAria", { field: labelForField(fieldKey) })}
        className="composer-field__resize-handle"
        onPointerDown={(event) => onComposerResizeStart(fieldKey, event)}
        type="button"
      />
    );
  }

  return (
    <div className={gridClassName}>
      <label {...getLabelProps("actionId", "form-field--compact")}>
        <span>{labelForField("actionId")}</span>
        <input readOnly={Boolean(readonly.actionId)} value={formatReadonlyActionId(form.actionId, form.issueId)} />
        {renderResizeHandle("actionId")}
      </label>
      <label {...getLabelProps("dueDate", "form-field--compact form-field--date")}>
        <span>{labelForField("dueDate")}</span>
        {layout === "composer" ? (
          <QuickCreateDateField label={labelForField("dueDate")} onChange={(value) => onChange("dueDate", value)} value={form.dueDate} />
        ) : (
          <DetailPanelDateField label={labelForField("dueDate")} onChange={(value) => onChange("dueDate", value)} value={form.dueDate} />
        )}
        {renderResizeHandle("dueDate")}
      </label>
      <label {...getLabelProps("workType", "form-field--stretch")}>
        <span>{labelForField("workType")}</span>
        <TaskCategoricalFieldSelect
          className="detail-select-field"
          fieldKey="workType"
          onChange={(event) => applyTaskCategoricalFieldChange("workType", event.target.value, onChange)}
          value={form.workType}
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
        {renderResizeHandle("workType")}
      </label>
      <label {...getLabelProps("coordinationScope", "form-field--stretch")}>
        <span>{labelForField("coordinationScope")}</span>
        <TaskCategoricalFieldSelect
          className="detail-select-field"
          fieldKey="coordinationScope"
          onChange={(event) => applyTaskCategoricalFieldChange("coordinationScope", event.target.value, onChange)}
          value={form.coordinationScope}
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
        {renderResizeHandle("coordinationScope")}
      </label>
      <label {...getLabelProps("requestedBy", "form-field--stretch")}>
        <span>{labelForField("requestedBy")}</span>
        <TaskCategoricalFieldSelect
          className="detail-select-field"
          fieldKey="requestedBy"
          onChange={(event) => applyTaskCategoricalFieldChange("requestedBy", event.target.value, onChange)}
          value={form.requestedBy}
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
        {renderResizeHandle("requestedBy")}
      </label>
      <label {...getLabelProps("relatedDisciplines", "form-field--stretch")}>
        <span>{labelForField("relatedDisciplines")}</span>
        <TaskCategoricalFieldMultiSelect
          buttonClassName="detail-select-field"
          className={clsx(layout === "composer" && "task-categorical-multiselect--composer")}
          fieldKey="relatedDisciplines"
          onChangeValues={(values) => onChange("relatedDisciplines", serializeTaskCategoryValues(values))}
          value={form.relatedDisciplines}
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
        {renderResizeHandle("relatedDisciplines")}
      </label>
      <label {...getLabelProps("assignee", "form-field--stretch")}>
        <span>{labelForField("assignee")}</span>
        <TaskAssigneeSelect
          assignee={form.assignee}
          assigneeOptions={assigneeOptions}
          assigneeProfileId={form.assigneeProfileId}
          className="detail-select-field"
          onChange={(selection) => {
            onChange("assigneeProfileId", selection.profileId);
            onChange("assignee", selection.label);
          }}
        />
        {renderResizeHandle("assignee")}
      </label>
      <label {...getLabelProps("issueTitle", "form-field--wide")}>
        <span>{labelForField("issueTitle")}</span>
        <textarea className="detail-text-field" onChange={(event) => onChange("issueTitle", event.target.value)} rows={1} value={form.issueTitle} />
        {renderResizeHandle("issueTitle")}
      </label>
      <label {...getLabelProps("reviewedAt", "form-field--compact form-field--date")}>
        <span>{labelForField("reviewedAt")}</span>
        {layout === "composer" ? (
          <QuickCreateDateField label={labelForField("reviewedAt")} onChange={(value) => onChange("reviewedAt", value)} value={form.reviewedAt} />
        ) : (
          <DetailPanelDateField label={labelForField("reviewedAt")} onChange={(value) => onChange("reviewedAt", value)} value={form.reviewedAt} />
        )}
        {renderResizeHandle("reviewedAt")}
      </label>
      {showUpdatedAt ? (
        <label {...getLabelProps(null, "form-field--compact")}>
          <span>{labelForField("updatedAt")}</span>
          <input readOnly={Boolean(readonly.updatedAt)} value={formatReadonlyValue(form.updatedAt)} />
        </label>
      ) : null}
      <label {...getLabelProps("locationRef", "form-field--stretch")}>
        <span>{labelForField("locationRef")}</span>
        <TaskCategoricalFieldMultiSelect
          buttonClassName="detail-select-field"
          className={clsx(layout === "composer" && "task-categorical-multiselect--composer")}
          fieldKey="locationRef"
          onChangeValues={(values) => onChange("locationRef", serializeTaskCategoryValues(values))}
          value={form.locationRef}
          categoryDefinitionsByField={categoryDefinitionsByField}
          workTypeDefinitions={workTypeDefinitions}
        />
        {renderResizeHandle("locationRef")}
      </label>
      <label {...getLabelProps("calendarLinked", "detail-checkbox-field form-field--compact")}>
        <span>{labelForField("calendarLinked")}</span>
        <input checked={form.calendarLinked} disabled={Boolean(readonly.calendarLinked)} onChange={(event) => onChange("calendarLinked", event.target.checked)} type="checkbox" />
        {renderResizeHandle("calendarLinked")}
      </label>
      <label {...getLabelProps("issueDetailNote", "form-field--wide")}>
        <span>{labelForField("issueDetailNote")}</span>
        <textarea className="detail-text-field" onChange={(event) => onChange("issueDetailNote", event.target.value)} rows={1} value={form.issueDetailNote} />
        {renderResizeHandle("issueDetailNote")}
      </label>
      <label {...getLabelProps("status", "form-field--compact")}>
        <span>{labelForField("status")}</span>
        <TaskCategoricalFieldSelect
          className="detail-select-field"
          fieldKey="status"
          onChange={(event) => applyTaskCategoricalFieldChange("status", event.target.value, onChange)}
          value={form.status}
          categoryDefinitionsByField={categoryDefinitionsByField}
        />
        {renderResizeHandle("status")}
      </label>
      <label {...getLabelProps("decision", "form-field--wide")}>
        <span>{labelForField("decision")}</span>
        <textarea className="detail-text-field" onChange={(event) => onChange("decision", event.target.value)} rows={1} value={form.decision} />
        {renderResizeHandle("decision")}
      </label>
    </div>
  );
}

function stopTaskListInlineEvent(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

function handleTaskListInlineEscapeKeyDown(event: ReactKeyboardEvent<HTMLElement>, onCancel?: () => void) {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onCancel?.();
  }
}

function handleTaskListInlineTextKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  onCancel?: () => void,
) {
  if (event.nativeEvent.isComposing) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onCancel?.();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function isTaskCategoricalFormFieldKey(fieldKey: EditableTaskFormKey): fieldKey is TaskCategoricalFormFieldKey {
  return (
    fieldKey === "status" ||
    fieldKey === "workType" ||
    fieldKey === "coordinationScope" ||
    fieldKey === "requestedBy" ||
    fieldKey === "relatedDisciplines" ||
    fieldKey === "locationRef"
  );
}

function isCenteredCategoricalColumn(columnKey: TaskListColumnKey) {
  return (
    columnKey === "workType" ||
    columnKey === "coordinationScope" ||
    columnKey === "requestedBy" ||
    columnKey === "relatedDisciplines" ||
    columnKey === "locationRef" ||
    columnKey === "status"
  );
}

function applyTaskCategoricalFieldChange(
  fieldKey: TaskCategoricalFormFieldKey,
  rawValue: string,
  onChange: TaskFormChangeHandler,
) {
  if (fieldKey === "status") {
    onChange(fieldKey, rawValue as TaskStatus);
    return;
  }

  onChange(fieldKey, rawValue);
}

function getEditableTaskListField(columnKey: TaskListColumnKey): EditableTaskFormKey | null {
  if (!(columnKey in editableTaskListFieldByColumn)) {
    return null;
  }

  return editableTaskListFieldByColumn[columnKey as keyof typeof editableTaskListFieldByColumn];
}

function clearDraftDirtyFieldMap(previous: DraftDirtyFieldMap, fields: readonly DraftDirtyField[]) {
  if (fields.length === 0) return previous;

  const next = { ...previous };
  let changed = false;

  for (const field of fields) {
    if (!next[field]) continue;
    delete next[field];
    changed = true;
  }

  return changed ? next : previous;
}

function clearInlineSavingFieldMap(previous: Partial<Record<TaskListColumnKey, boolean>>, columnKey: TaskListColumnKey) {
  if (!previous[columnKey]) return previous;

  const next = { ...previous };
  delete next[columnKey];
  return next;
}

function toDraftTask(task: TaskRecord) {
  return { ...task, ownerDiscipline: task.ownerDiscipline || "\uAC74\uCD95" };
}

function mergeTaskIntoDraft(task: TaskRecord, previous: TaskRecord | null, dirtyFields: DraftDirtyFieldMap) {
  const nextDraft = toDraftTask(task);
  if (!previous || previous.id !== task.id) {
    return nextDraft;
  }

  const nextEditable = nextDraft as Record<EditableTaskFormKey, TaskRecord[EditableTaskFormKey]>;
  const previousEditable = previous as Record<EditableTaskFormKey, TaskRecord[EditableTaskFormKey]>;

  for (const field of editableTaskFormKeys) {
    if (!dirtyFields[field]) continue;
    nextEditable[field] = previousEditable[field];
  }

  return nextDraft;
}
function getQuickCreateWidthStorageKey(userId: string) {
  return QUICK_CREATE_WIDTH_STORAGE_KEY_PREFIX + userId;
}

function readQuickCreateWidthsFromStorage(storageKey: string) {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    return sanitizeQuickCreateWidths(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeQuickCreateWidthsToStorage(storageKey: string, widths: QuickCreateWidthMap) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizeQuickCreateWidths(widths)));
  } catch {
    // Ignore storage write failures and keep the in-memory widths.
  }
}

function getTaskListLayoutStorageKey(userId: string) {
  return TASK_LIST_LAYOUT_STORAGE_KEY_PREFIX + userId;
}

function readTaskListLayoutFromStorage(storageKey: string): TaskListLayoutPreference {
  if (typeof window === "undefined") {
    return { columnWidths: {}, rowHeights: {}, detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { columnWidths: {}, rowHeights: {}, detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH };
    return sanitizeTaskListLayoutPreference(JSON.parse(raw));
  } catch {
    return { columnWidths: {}, rowHeights: {}, detailPanelWidth: DETAIL_PANEL_DEFAULT_WIDTH };
  }
}

function writeTaskListLayoutToStorage(storageKey: string, layout: TaskListLayoutPreference) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(sanitizeTaskListLayoutPreference(layout)));
  } catch {
    // Ignore storage write failures and keep the in-memory layout.
  }
}

function createDefaultBoardCollapsedStatusMap(): BoardCollapsedStatusMap {
  return BOARD_DEFAULT_COLLAPSED_STATUSES.reduce<BoardCollapsedStatusMap>((acc, status) => {
    acc[status] = true;
    return acc;
  }, {});
}

function getBoardCollapsedStorageKey(userId: string, projectId: string) {
  return `${BOARD_COLUMN_STORAGE_KEY_PREFIX}${userId}:${projectId}`;
}

function sanitizeBoardCollapsedStatuses(input: unknown): BoardCollapsedStatusMap {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const next: BoardCollapsedStatusMap = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isTaskStatus(key) || value !== true) continue;
    next[key] = true;
  }
  return next;
}

function readBoardCollapsedStatusesFromStorage(storageKey: string) {
  if (typeof window === "undefined") {
    return createDefaultBoardCollapsedStatusMap();
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) {
      return createDefaultBoardCollapsedStatusMap();
    }

    return sanitizeBoardCollapsedStatuses(JSON.parse(raw));
  } catch {
    return createDefaultBoardCollapsedStatusMap();
  }
}

function writeBoardCollapsedStatusesToStorage(storageKey: string, statuses: BoardCollapsedStatusMap) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(storageKey, JSON.stringify(statuses));
  } catch {
    // Ignore storage write failures and keep the in-memory preference.
  }
}

function groupTasksByDueDate(tasks: readonly TaskRecord[]) {
  const groupedTasks = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (!task.dueDate) {
      return acc;
    }

    if (!acc[task.dueDate]) {
      acc[task.dueDate] = [];
    }

    acc[task.dueDate].push(task);
    return acc;
  }, {});

  for (const [dayKey, items] of Object.entries(groupedTasks)) {
    groupedTasks[dayKey] = sortTasksByActionId(items);
  }

  return groupedTasks;
}

function clampBoardPage(value: number | undefined, totalPages: number) {
  const normalizedValue = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : 1;
  return Math.max(1, Math.min(totalPages, normalizedValue));
}

function summarizeCategoricalFilterTriggerLabel(
  selectedValues: readonly string[] | undefined,
  options: ReadonlyArray<{ value: string; label: string }>,
) {
  if (selectedValues === undefined || options.length === 0 || selectedValues.length === options.length) {
    return t("workspace.totalLabel");
  }

  if (selectedValues.length === 0) {
    return t("workspace.selectedCount", { count: 0 });
  }

  if (selectedValues.length === 1) {
    return options.find((option) => option.value === selectedValues[0])?.label ?? t("workspace.totalLabel");
  }

  return t("workspace.selectedCount", { count: selectedValues.length });
}

function summarizeCategoricalFilterStatusLabel(selectedValues: readonly string[], optionCount: number) {
  if (optionCount === 0) {
    return t("workspace.selectedCount", { count: 0 });
  }

  if (selectedValues.length === optionCount) {
    return t("workspace.totalLabel");
  }

  return t("workspace.selectedCount", { count: selectedValues.length });
}

function areStringArrayValuesEqual(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function areFilterMapsEqual(left: DailyCategoricalFilterMap, right: DailyCategoricalFilterMap) {
  return dailyCategoricalFilterFieldKeys.every((fieldKey) =>
    areStringArrayValuesEqual(left[fieldKey] ?? [], right[fieldKey] ?? []),
  );
}

function getCategoricalFilterStorageBaseKey(userId: string, projectId: string) {
  return `${CATEGORICAL_FILTER_STORAGE_KEY_PREFIX}${userId}:${projectId}`;
}

function getCategoricalFilterStorageKey(baseKey: string, fieldKey: DailyCategoricalFilterFieldKey) {
  return `${baseKey}:${fieldKey}`;
}

function getDailyViewPreferenceStorageKey(baseKey: string, preferenceKey: string) {
  return `${baseKey}:view:${preferenceKey}`;
}

type StoredCategoricalFilterSelection =
  | { mode: "none" }
  | { mode: "custom"; values: string[] };

function readCategoricalFiltersFromStorage(storageKey: string) {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return undefined;
    }

    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const legacyValues = parsed.filter((value): value is string => typeof value === "string");
      return legacyValues.length === 0 ? undefined : legacyValues;
    }

    if (parsed && typeof parsed === "object") {
      const next = parsed as Partial<StoredCategoricalFilterSelection>;
      if (next.mode === "none") {
        return [];
      }

      if (next.mode === "custom" && Array.isArray(next.values)) {
        return next.values.filter((value): value is string => typeof value === "string");
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function writeCategoricalFiltersToStorage(storageKey: string, values: readonly string[] | undefined) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (values === undefined) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    const uniqueValues = Array.from(new Set(values));
    const payload: StoredCategoricalFilterSelection =
      uniqueValues.length === 0 ? { mode: "none" } : { mode: "custom", values: uniqueValues };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore storage write failures and keep the in-memory filters.
  }
}

function readBooleanPreferenceFromStorage(storageKey: string) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(storageKey) === "true";
  } catch {
    return false;
  }
}

function writeBooleanPreferenceToStorage(storageKey: string, value: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!value) {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, "true");
  } catch {
    // Ignore storage write failures and keep the in-memory preference.
  }
}

function readDailyListViewModeFromStorage(storageKey: string): DailyListViewMode {
  if (typeof window === "undefined") {
    return "full";
  }

  try {
    return window.localStorage.getItem(storageKey) === "paged" ? "paged" : "full";
  } catch {
    return "full";
  }
}

function writeDailyListViewModeToStorage(storageKey: string, value: DailyListViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === "full") {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage write failures and keep the in-memory preference.
  }
}

function getDailyTaskPageForTask(pages: readonly DailyTaskTreePage[], taskId: string) {
  const pageIndex = pages.findIndex((page) => page.rows.some((row) => row.task.id === taskId));
  return pageIndex < 0 ? null : pageIndex + 1;
}

function buildDailyTaskPageNavigationItems(totalPages: number, currentPage: number) {
  const normalizedTotalPages = Math.max(1, Math.floor(totalPages));
  const normalizedCurrentPage = clampBoardPage(currentPage, normalizedTotalPages);
  const visiblePages = new Set<number>([1, normalizedTotalPages, normalizedCurrentPage]);

  for (let page = normalizedCurrentPage - 1; page <= normalizedCurrentPage + 1; page += 1) {
    if (page > 1 && page < normalizedTotalPages) {
      visiblePages.add(page);
    }
  }

  if (normalizedCurrentPage <= 3) {
    visiblePages.add(2);
    visiblePages.add(3);
    visiblePages.add(4);
  }

  if (normalizedCurrentPage >= normalizedTotalPages - 2) {
    visiblePages.add(normalizedTotalPages - 1);
    visiblePages.add(normalizedTotalPages - 2);
    visiblePages.add(normalizedTotalPages - 3);
  }

  const sortedPages = [...visiblePages].filter((page) => page >= 1 && page <= normalizedTotalPages).sort((left, right) => left - right);
  const items: Array<{ key: string; kind: "page"; page: number } | { key: string; kind: "ellipsis" }> = [];
  let previousPage = 0;

  for (const page of sortedPages) {
    if (previousPage > 0 && page - previousPage > 1) {
      items.push({ key: `ellipsis-${previousPage}-${page}`, kind: "ellipsis" });
    }

    items.push({ key: `page-${page}`, kind: "page", page });
    previousPage = page;
  }

  return items;
}

function buildDailyTaskTableWindow({
  enabled,
  rows,
  rowHeights,
  liveRowHeight,
  scrollTop,
  viewportHeight,
  pinnedTaskIds,
}: {
  enabled: boolean;
  rows: readonly TaskTreeRow[];
  rowHeights: TaskListRowHeightMap;
  liveRowHeight: TaskListLiveRowHeight | null;
  scrollTop: number;
  viewportHeight: number;
  pinnedTaskIds: ReadonlySet<string>;
}) {
  if (!enabled || rows.length === 0) {
    return {
      items: rows.map((row) => ({ kind: "row", row }) satisfies DailyTaskTableWindowItem),
    };
  }

  const rowOffsets: number[] = [];
  const resolvedRowHeights: number[] = [];
  let totalHeight = 0;

  rows.forEach((row, index) => {
    rowOffsets[index] = totalHeight;
    const nextHeight = resolveTaskListDisplayedRowHeight(row.task.id, rowHeights, liveRowHeight) + DAILY_TASK_TABLE_ROW_CHROME_HEIGHT;
    resolvedRowHeights[index] = nextHeight;
    totalHeight += nextHeight;
  });

  if (viewportHeight <= 0 || totalHeight <= viewportHeight) {
    return {
      items: rows.map((row) => ({ kind: "row", row }) satisfies DailyTaskTableWindowItem),
    };
  }

  const maxScrollTop = Math.max(0, totalHeight - viewportHeight);
  const normalizedScrollTop = Math.min(Math.max(scrollTop, 0), maxScrollTop);
  const viewportBottom = normalizedScrollTop + viewportHeight;

  let visibleStartIndex = 0;
  while (
    visibleStartIndex < rows.length - 1 &&
    rowOffsets[visibleStartIndex] + resolvedRowHeights[visibleStartIndex] < normalizedScrollTop
  ) {
    visibleStartIndex += 1;
  }

  let visibleEndIndex = visibleStartIndex;
  while (visibleEndIndex < rows.length - 1 && rowOffsets[visibleEndIndex] < viewportBottom) {
    visibleEndIndex += 1;
  }

  const startIndex = Math.max(0, visibleStartIndex - DAILY_TASK_TABLE_VIRTUAL_OVERSCAN);
  const endIndex = Math.min(rows.length - 1, visibleEndIndex + DAILY_TASK_TABLE_VIRTUAL_OVERSCAN);
  const pinnedIndexes = rows.reduce<number[]>((indexes, row, index) => {
    if (pinnedTaskIds.has(row.task.id)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const mergedSegments = [{ start: startIndex, end: endIndex }, ...pinnedIndexes.map((index) => ({ start: index, end: index }))]
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((segments, segment) => {
      const previous = segments[segments.length - 1];
      if (!previous) {
        segments.push(segment);
        return segments;
      }

      if (segment.start <= previous.end + 1) {
        previous.end = Math.max(previous.end, segment.end);
        return segments;
      }

      segments.push(segment);
      return segments;
    }, []);
  const items: DailyTaskTableWindowItem[] = [];
  let previousBottom = 0;

  mergedSegments.forEach((segment, segmentIndex) => {
    const segmentTop = rowOffsets[segment.start] ?? 0;
    const gapHeight = Math.max(0, segmentTop - previousBottom);
    if (gapHeight > 0) {
      items.push({
        kind: "spacer",
        key: `daily-task-table-gap-${segmentIndex}`,
        height: gapHeight,
      });
    }

    for (let index = segment.start; index <= segment.end; index += 1) {
      items.push({
        kind: "row",
        row: rows[index],
      });
    }

    previousBottom = (rowOffsets[segment.end] ?? 0) + resolvedRowHeights[segment.end];
  });

  const bottomGapHeight = Math.max(0, totalHeight - previousBottom);
  if (bottomGapHeight > 0) {
    items.push({
      kind: "spacer",
      key: "daily-task-table-gap-bottom",
      height: bottomGapHeight,
    });
  }

  return {
    items,
  };
}

function resolveTaskListDisplayedRowHeight(
  taskId: string,
  rowHeights: TaskListRowHeightMap,
  liveRowHeight: TaskListLiveRowHeight | null,
) {
  if (liveRowHeight?.taskId === taskId) {
    return liveRowHeight.height;
  }
  return rowHeights[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT;
}

function getBoardPageForTask(tasks: readonly TaskRecord[], taskId: string, status: TaskStatus, pageSize: number) {
  const items = tasks.filter((task) => task.status === status);
  const taskIndex = items.findIndex((task) => task.id === taskId);
  if (taskIndex < 0) {
    return 1;
  }

  return Math.floor(taskIndex / pageSize) + 1;
}

function pruneTaskListRowHeights(rowHeights: TaskListRowHeightMap, taskIds: Set<string>) {
  if (taskIds.size === 0) {
    return { ...rowHeights };
  }

  const next: TaskListRowHeightMap = {};
  for (const [taskId, height] of Object.entries(rowHeights)) {
    if (!taskIds.has(taskId)) continue;
    next[taskId] = height;
  }
  return next;
}

function areTaskListRowHeightMapsEqual(previous: TaskListRowHeightMap, next: TaskListRowHeightMap) {
  if (previous === next) {
    return true;
  }

  const previousEntries = Object.entries(previous);
  const nextEntries = Object.entries(next);
  if (previousEntries.length !== nextEntries.length) {
    return false;
  }

  return previousEntries.every(([taskId, height]) => next[taskId] === height);
}

function areTaskListDesktopViewportStatesEqual(previous: TaskListDesktopViewportState, next: TaskListDesktopViewportState) {
  return previous.height === next.height && previous.scrollTop === next.scrollTop;
}

function areTaskListLiveRowHeightsEqual(previous: TaskListLiveRowHeight | null, next: TaskListLiveRowHeight | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.taskId === next.taskId && previous.height === next.height;
}

function arePendingTaskListFocusCellsEqual(
  previous: PendingTaskListFocusCell | null,
  next: PendingTaskListFocusCell | null,
) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.taskId === next.taskId && previous.columnKey === next.columnKey;
}

function areTaskDropStatesEqual(previous: TaskDropState | null, next: TaskDropState | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  return previous.taskId === next.taskId && previous.position === next.position;
}

function areFocusedTaskIdSetsEqual(previous: ReadonlySet<string> | null, next: ReadonlySet<string> | null) {
  if (previous === next) return true;
  if (!previous || !next) return false;
  if (previous.size !== next.size) return false;
  for (const taskId of previous) {
    if (!next.has(taskId)) {
      return false;
    }
  }
  return true;
}

function areTaskListRowInteractionStatesEqual(previous: TaskListRowInteractionState, next: TaskListRowInteractionState) {
  return (
    previous.selectedTaskId === next.selectedTaskId &&
    arePendingTaskListFocusCellsEqual(previous.activeInlineEditCell, next.activeInlineEditCell) &&
    areTaskDropStatesEqual(previous.taskDropState, next.taskDropState) &&
    areFocusedTaskIdSetsEqual(previous.focusedTaskIds, next.focusedTaskIds)
  );
}

function areTaskListRowInteractionSnapshotsEqual(previous: TaskListRowInteractionSnapshot, next: TaskListRowInteractionSnapshot) {
  return (
    previous.isSelectedRow === next.isSelectedRow &&
    previous.activeInlineColumnKey === next.activeInlineColumnKey &&
    previous.taskDropPosition === next.taskDropPosition &&
    previous.isDimmedRow === next.isDimmedRow
  );
}

function createTaskListLayoutStore(): TaskListLayoutStore {
  let snapshot: TaskListLayoutSnapshot = {
    rowHeights: {},
    viewport: {
      height: 0,
      scrollTop: 0,
    },
    liveRowHeight: null,
  };
  const listeners = new Set<() => void>();

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    replaceRowHeights(rowHeights) {
      if (areTaskListRowHeightMapsEqual(snapshot.rowHeights, rowHeights)) {
        return;
      }

      snapshot = {
        ...snapshot,
        rowHeights,
      };
      notify();
    },
    setViewportState(viewport) {
      if (areTaskListDesktopViewportStatesEqual(snapshot.viewport, viewport)) {
        return;
      }

      snapshot = {
        ...snapshot,
        viewport,
      };
      notify();
    },
    setLiveRowHeight(liveRowHeight) {
      if (areTaskListLiveRowHeightsEqual(snapshot.liveRowHeight, liveRowHeight)) {
        return;
      }

      snapshot = {
        ...snapshot,
        liveRowHeight,
      };
      notify();
    },
  };
}

function createTaskListRowInteractionStore(): TaskListRowInteractionStore {
  let state: TaskListRowInteractionState = {
    selectedTaskId: null,
    activeInlineEditCell: null,
    taskDropState: null,
    focusedTaskIds: null,
  };
  const listeners = new Set<() => void>();
  const listenersByTaskId = new Map<string, Set<() => void>>();
  const snapshotCache = new Map<string, TaskListRowInteractionSnapshot>();

  const buildSnapshot = (nextState: TaskListRowInteractionState, taskId: string): TaskListRowInteractionSnapshot => ({
    isSelectedRow: nextState.selectedTaskId === taskId,
    activeInlineColumnKey: nextState.activeInlineEditCell?.taskId === taskId ? nextState.activeInlineEditCell.columnKey : null,
    taskDropPosition: nextState.taskDropState?.taskId === taskId ? nextState.taskDropState.position : null,
    isDimmedRow: nextState.focusedTaskIds ? !nextState.focusedTaskIds.has(taskId) : false,
  });

  const updateTaskSnapshot = (nextState: TaskListRowInteractionState, taskId: string) => {
    const previous = snapshotCache.get(taskId);
    const next = buildSnapshot(nextState, taskId);
    if (previous && areTaskListRowInteractionSnapshotsEqual(previous, next)) {
      return false;
    }

    snapshotCache.set(taskId, next);
    return true;
  };

  const notifyTasks = (nextState: TaskListRowInteractionState, taskIds: Set<string>) => {
    taskIds.forEach((taskId) => {
      if (!updateTaskSnapshot(nextState, taskId)) {
        return;
      }

      listenersByTaskId.get(taskId)?.forEach((listener) => listener());
    });
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getState() {
      return state;
    },
    subscribeToTask(taskId, listener) {
      const listeners = listenersByTaskId.get(taskId) ?? new Set<() => void>();
      listeners.add(listener);
      listenersByTaskId.set(taskId, listeners);

      return () => {
        const nextListeners = listenersByTaskId.get(taskId);
        if (!nextListeners) {
          return;
        }

        nextListeners.delete(listener);
        if (nextListeners.size === 0) {
          listenersByTaskId.delete(taskId);
        }
      };
    },
    getTaskSnapshot(taskId) {
      const cached = snapshotCache.get(taskId);
      if (cached) {
        return cached;
      }

      const next = buildSnapshot(state, taskId);
      snapshotCache.set(taskId, next);
      return next;
    },
    setState(partialState) {
      const nextState = {
        ...state,
        ...partialState,
      };
      if (areTaskListRowInteractionStatesEqual(state, nextState)) {
        return;
      }

      const affectedTaskIds = new Set<string>();
      const shouldNotifyAllTasks =
        partialState.focusedTaskIds !== undefined && !areFocusedTaskIdSetsEqual(state.focusedTaskIds, nextState.focusedTaskIds);
      if (shouldNotifyAllTasks) {
        listenersByTaskId.forEach((_, taskId) => {
          affectedTaskIds.add(taskId);
        });
      } else {
        if (state.selectedTaskId) {
          affectedTaskIds.add(state.selectedTaskId);
        }
        if (nextState.selectedTaskId) {
          affectedTaskIds.add(nextState.selectedTaskId);
        }
        if (state.activeInlineEditCell?.taskId) {
          affectedTaskIds.add(state.activeInlineEditCell.taskId);
        }
        if (nextState.activeInlineEditCell?.taskId) {
          affectedTaskIds.add(nextState.activeInlineEditCell.taskId);
        }
        if (state.taskDropState?.taskId) {
          affectedTaskIds.add(state.taskDropState.taskId);
        }
        if (nextState.taskDropState?.taskId) {
          affectedTaskIds.add(nextState.taskDropState.taskId);
        }
      }

      state = nextState;
      listeners.forEach((listener) => listener());
      notifyTasks(nextState, affectedTaskIds);
    },
  };
}

function useTaskListRowInteractionSnapshot(store: TaskListRowInteractionStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getState(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useTaskListLayoutSnapshot(store: TaskListLayoutStore) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useTaskListRowInteractionState(store: TaskListRowInteractionStore, taskId: string) {
  const subscribe = useCallback((listener: () => void) => store.subscribeToTask(taskId, listener), [store, taskId]);
  const getSnapshot = useCallback(() => store.getTaskSnapshot(taskId), [store, taskId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function createTaskListRowPresentationContext(context: TaskListRowPresentationContext) {
  return context;
}

function buildTaskListCellPresentation(columnKey: TaskListColumnKey, context: TaskListRowPresentationContext): TaskListCellPresentation {
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

function isEditableTaskListCellPresentation(presentation: TaskListCellPresentation) {
  return (
    presentation.kind === "editable-date" ||
    presentation.kind === "editable-text" ||
    presentation.kind === "editable-checkbox" ||
    presentation.kind === "editable-categorical"
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

type TaskListRowMeasurementCell = {
  column: (typeof dailyTaskListColumns)[number];
  width: number;
  presentation: TaskListCellPresentation;
};

type TaskListRowMeasurementDom = {
  host: HTMLDivElement;
  shells: HTMLDivElement[];
  contents: HTMLDivElement[];
};

let taskListRowMeasurementDom: TaskListRowMeasurementDom | null = null;

function buildTaskListRowMeasurementCells(
  context: TaskListRowPresentationContext,
  columnWidths: ResolvedTaskListColumnWidthMap,
): TaskListRowMeasurementCell[] {
  return dailyTaskListColumns.map((column) => ({
    column,
    width: columnWidths[column.key],
    presentation: buildTaskListCellPresentation(column.key, context),
  }));
}

function buildTaskListRowMeasurementCacheKey(cells: readonly TaskListRowMeasurementCell[]) {
  return JSON.stringify(
    cells.map(({ column, width, presentation }) => ({
      key: column.key,
      width,
      presentation,
    })),
  );
}

function getTaskListRowMeasurementDom() {
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

function measureTaskListRowHeight(cells: readonly TaskListRowMeasurementCell[]) {
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

function isIsoDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatLinkedDocumentsSummary(task: Pick<TaskRecord, "fileSummary">, taskFiles: readonly FileRecord[]) {
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
    primary: restFiles.length > 0 ? t("workspace.linkedDocumentSummaryMulti", { name: firstFile.originalName, count: restFiles.length }) : firstFile.originalName,
    secondary: t("empty.moreFilesAvailable"),
  };
}

function isTaskOverdue(task: TaskRecord, referenceDay: string) {
  return Boolean(task.dueDate) && task.dueDate < referenceDay && task.status !== "done";
}

function isTaskDueToday(task: TaskRecord, referenceDay: string) {
  return Boolean(task.dueDate) && task.dueDate === referenceDay && task.status !== "done";
}

function isTaskDueSoon(task: TaskRecord, referenceDay: string) {
  return Boolean(task.dueDate) && task.dueDate > referenceDay && task.dueDate <= addIsoDays(referenceDay, 3) && task.status !== "done";
}

function getTaskPreviewStateClassName(task: TaskRecord, deadlineTone?: "warn" | "accent" | "neutral") {
  return clsx(
    task.status === "done" && "task-state-card--done",
    deadlineTone === "warn" && "task-state-card--overdue",
    deadlineTone === "accent" && "task-state-card--due-today",
    deadlineTone === "neutral" && "task-state-card--due-soon",
  );
}

function matchesTaskFocus(task: TaskRecord, focusKey: TaskFocusKey, referenceDay: string) {
  switch (focusKey) {
    case "in_review":
      return task.status === "in_review";
    case "in_discussion":
      return task.status === "in_discussion";
    case "blocked":
      return task.status === "blocked";
    case "overdue":
      return isTaskOverdue(task, referenceDay);
    default:
      return true;
  }
}

function resolveTaskDeadlineBadge(task: TaskRecord, referenceDay: string) {
  if (isTaskOverdue(task, referenceDay)) {
    return { label: "지연", tone: "warn" as const };
  }

  if (isTaskDueToday(task, referenceDay)) {
    return { label: "오늘", tone: "accent" as const };
  }

  if (isTaskDueSoon(task, referenceDay)) {
    return { label: "임박", tone: "neutral" as const };
  }

  return null;
}

function addIsoDays(isoDate: string, days: number) {
  const nextDate = new Date(`${isoDate}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function titleByMode(mode: DashboardMode) {
  return labelForMode(mode);
}

function boardColumnCopy(status: TaskStatus) {
  return describeStatus(status);
}

function buildTaskReorderExpectedVersions(command: TaskReorderClientCommand, tasks: readonly TaskRecord[]) {
  const impactedTasks =
    command.action === "auto_sort"
      ? tasks
      : tasks.filter(
          (task) =>
            task.id === command.movedTaskId ||
            (task.parentTaskId ?? null) === command.targetParentTaskId,
        );

  return Object.fromEntries(impactedTasks.map((task) => [task.id, task.version]));
}

function taskPayloadFromDraft(draft: Partial<TaskRecord>) {
  return {
    version: draft.version ?? 1,
    dueDate: draft.dueDate ?? "",
    workType: draft.workType ?? "",
    coordinationScope: draft.coordinationScope ?? "",
    requestedBy: draft.requestedBy ?? "",
    relatedDisciplines: draft.relatedDisciplines ?? "",
    assignee: draft.assignee ?? "",
    assigneeProfileId: draft.assigneeProfileId ?? null,
    issueTitle: draft.issueTitle ?? "",
    reviewedAt: draft.reviewedAt ?? "",
    isDaily: Boolean(draft.isDaily),
    locationRef: draft.locationRef ?? "",
    calendarLinked: Boolean(draft.calendarLinked),
    issueDetailNote: draft.issueDetailNote ?? "",
    status: (draft.status ?? DEFAULT_TASK_STATUS) as TaskStatus,
    decision: draft.decision ?? "",
  };
}

function getDirtyDraftFields(dirtyFields: DraftDirtyFieldMap) {
  return allDraftDirtyFields.filter((field) => Boolean(dirtyFields[field]));
}

function buildTaskPatchPayloadFromDraft(draft: Partial<TaskRecord>, dirtyFields: DraftDirtyFieldMap, parentTaskNumber: string) {
  const normalizedDraft = taskPayloadFromDraft(draft) as Record<string, unknown>;
  const payload: Record<string, unknown> = { version: normalizedDraft.version };

  for (const field of editableTaskFormKeys) {
    if (!dirtyFields[field]) continue;
    payload[field] = normalizedDraft[field];
  }

  if (dirtyFields.parentTaskNumber) {
    payload.parentTaskNumber = normalizeParentTaskNumberInput(parentTaskNumber);
  }

  return payload;
}

async function readErrorMessage(response: Response, fallbackKey: ErrorCopyKey) {
  const error = await readApiError(response, fallbackKey);
  return error.message;
}

async function readApiError(response: Response, fallbackKey: ErrorCopyKey) {
  try {
    const json = (await response.json()) as { error?: { code?: string | null } };
    const code = json.error?.code ?? null;
    return new ApiResponseError(response.status, code, localizeError({ code, fallbackKey }));
  } catch {
    return new ApiResponseError(response.status, null, localizeError({ fallbackKey }));
  }
}

class ApiResponseError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiResponseError";
  }
}

function isApiConflictError(error: unknown, code?: string) {
  return error instanceof ApiResponseError && error.status === 409 && (!code || error.code === code);
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.rel = "noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
}

async function readUploadIntentResponse(response: Response): Promise<UploadIntentResponse | null> {
  const json = (await response.json().catch(() => null)) as unknown;

  if (!json || typeof json !== "object") {
    return null;
  }

  const payload = json as { data?: UploadIntentResponse | null } & UploadIntentResponse;

  if ("data" in payload) {
    return payload.data ?? null;
  }

  return payload;
}

async function requestUploadIntent(payload: {
  taskId: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string | null;
  fileId?: string | null;
  fallbackKey: ErrorCopyKey;
}): Promise<UploadIntentResponse | null> {
  const response = await fetch("/api/files/upload-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: payload.taskId,
      originalName: payload.originalName,
      sizeBytes: payload.sizeBytes,
      mimeType: payload.mimeType,
      fileId: payload.fileId ?? null,
    }),
  });

  if (!response.ok) {
    throw await readApiError(response, payload.fallbackKey);
  }

  return readUploadIntentResponse(response);
}

function isDirectUploadIntent(intent: UploadIntentResponse | null) {
  if (!intent) {
    return false;
  }

  const bucket = String(intent.bucket ?? intent.storageBucket ?? "").trim();
  const objectPath = String(intent.objectPath ?? "").trim();
  return Boolean(bucket && objectPath) && intent.uploadMode !== "relay";
}

async function uploadFileWithIntent(input: {
  taskId: string;
  file: File;
  replaceFileId?: string | null;
}) {
  const intent = await requestUploadIntent({
    taskId: input.taskId,
    originalName: input.file.name,
    sizeBytes: input.file.size,
    mimeType: input.file.type || null,
    fileId: input.replaceFileId ?? null,
    fallbackKey: input.replaceFileId ? "uploadNextVersionFailed" : "uploadFileFailed",
  });

  if (!intent || !isDirectUploadIntent(intent)) {
    return null;
  }

  const directIntent = intent;
  const bucket = String(directIntent.bucket ?? directIntent.storageBucket ?? "").trim();
  const objectPath = String(directIntent.objectPath ?? "").trim();
  const supabase = createSupabaseBrowserClient();

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, input.file, {
    contentType: input.file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  try {
    const commitResponse = await fetch("/api/files/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: directIntent.projectId,
        taskId: input.taskId,
        sourceFileId: directIntent.sourceFileId ?? null,
        originalName: input.file.name,
        sizeBytes: input.file.size,
        mimeType: input.file.type || null,
        fileGroupId: directIntent.fileGroupId ?? null,
        objectPath,
        storageBucket: bucket,
        nextVersion: directIntent.nextVersion ?? null,
      }),
    });

    if (!commitResponse.ok) {
      throw await readApiError(commitResponse, input.replaceFileId ? "uploadNextVersionFailed" : "uploadFileFailed");
    }
  } catch (error) {
    await supabase.storage.from(bucket).remove([objectPath]).catch(() => {});
    throw error;
  }

  return intent;
}

async function downloadFileAttachment(file: Pick<FileRecord, "id" | "originalName" | "deletedAt">) {
  let response = await requestSignedDownloadResponse(file.id);

  if (!response || !response.ok) {
    response = await fetch(
      buildFileContentUrl(file.id, "attachment", {
        allowDeleted: Boolean(file.deletedAt),
      }),
    );
  }

  if (!response.ok) {
    throw new Error("download failed");
  }

  const blob = await response.blob();
  downloadBlob(blob, file.originalName);
}

async function requestFileDownloadUrl(fileId: string) {
  const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/download-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json().catch(() => null)) as
    | { data?: { url?: string | null } | null }
    | { url?: string | null }
    | null;

  if (json && "data" in json) {
    return json.data?.url ?? null;
  }

  return json && "url" in json ? json.url ?? null : null;
}

async function requestSignedDownloadResponse(fileId: string, allowRetry = true): Promise<Response | null> {
  const url = await requestFileDownloadUrl(fileId);
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url);
    if (!response.ok && allowRetry && [401, 403, 404].includes(response.status)) {
      return requestSignedDownloadResponse(fileId, false);
    }

    return response;
  } catch {
    return null;
  }
}

function buildFileContentUrl(
  fileId: string,
  disposition: "inline" | "attachment",
  options?: { allowDeleted?: boolean },
) {
  const params = new URLSearchParams({
    disposition,
  });

  if (options?.allowDeleted) {
    params.set("allowDeleted", "1");
  }

  return `/api/files/${encodeURIComponent(fileId)}/content?${params.toString()}`;
}

function formatFileAttachmentMeta(file: Pick<FileRecord, "originalName" | "mimeType" | "sizeBytes">) {
  const extension = getFileExtension(file.originalName);
  const mimeSubtype = String(file.mimeType ?? "")
    .split("/")
    .at(1)
    ?.split(";")[0]
    ?.trim()
    .toUpperCase();
  const typeLabel = extension ? extension.toUpperCase() : mimeSubtype || "FILE";
  return `${typeLabel} - ${formatFileSize(file.sizeBytes)}`;
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let unitIndex = 0;
  let value = sizeBytes;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function getFileExtension(originalName: string) {
  const trimmed = originalName.trim();
  const extensionIndex = trimmed.lastIndexOf(".");
  if (extensionIndex < 0 || extensionIndex === trimmed.length - 1) {
    return "";
  }

  return trimmed.slice(extensionIndex + 1);
}

function resolveExportFilename(contentDisposition: string | null) {
  if (contentDisposition) {
    const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    if (encodedMatch?.[1]) {
      try {
        return decodeURIComponent(encodedMatch[1].trim().replace(/^"|"$/g, ""));
      } catch {
        return encodedMatch[1].trim().replace(/^"|"$/g, "");
      }
    }

    const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^"]+)"?/i);
    if (plainMatch?.[1]) {
      return plainMatch[1].trim();
    }
  }

  return `daily-tasks-export-${todayKey()}.xlsx`;
}

function formatReadonlyActionId(actionId: number | string | null | undefined, issueId?: string | null) {
  const issueNumber = extractProjectIssueNumber(String(issueId ?? ""));
  if (issueNumber) {
    return issueNumber;
  }

  const raw = String(actionId ?? "").trim();
  return raw ? formatActionId(raw) : t("workspace.autoAfterCreate");
}

function formatReadonlyValue(value: string | null | undefined) {
  const formatted = formatDateTimeField(value);
  return formatted === "-" ? t("workspace.autoValue") : formatted;
}

function formatPreviewFieldValue(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "-";
}

function normalizeParentTaskNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^#\d+$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return "#" + trimmed;
  return trimmed.toUpperCase();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isCalendarHolidayDate(
  date: Date,
  holidayDateSet: ReadonlySet<string> | null = null,
  loadedMonthSet: ReadonlySet<string> | null = null,
) {
  if (date.getDay() === 0) {
    return true;
  }

  const dateKey = format(date, "yyyy-MM-dd");
  const monthKey = dateKey.slice(0, 7);

  if (loadedMonthSet?.has(monthKey)) {
    return Boolean(holidayDateSet?.has(dateKey));
  }

  if (holidayDateSet) {
    return holidayDateSet.has(dateKey);
  }

  return koreanPublicHolidays.isKoreanPublicHoliday(date);
}

function formatDay(date: Date) {
  return getWeekdayLabelByIndex(date.getDay());
}

function parseMonthInputValue(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return null;
  }

  const [yearRaw, monthRaw] = normalized.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return startOfMonth(parseISO(`${yearRaw}-${monthRaw}-01`));
}

function formatMonthInputValue(date: Date) {
  return format(startOfMonth(date), "yyyy-MM");
}

function formatCalendarMonthHeading(date: Date) {
  return new Intl.DateTimeFormat(DEFAULT_UI_LOCALE_TAG, { year: "numeric", month: "long" }).format(date);
}

function resolveActiveCalendarMonth(input: {
  monthParam: string | null;
  focusTaskId: string | null;
  tasks: readonly TaskRecord[];
  calendarTasks: readonly TaskRecord[];
  todayKey: string;
}) {
  const parsedMonth = parseMonthInputValue(input.monthParam);
  if (parsedMonth) {
    return parsedMonth;
  }

  if (input.focusTaskId) {
    const focusedTask = input.tasks.find((task) => task.id === input.focusTaskId);
    if (focusedTask?.dueDate) {
      return startOfMonth(parseISO(focusedTask.dueDate));
    }
  }

  const todayMonth = startOfMonth(parseISO(input.todayKey));
  const todayMonthValue = input.todayKey.slice(0, 7);
  if (input.calendarTasks.some((task) => task.dueDate?.slice(0, 7) === todayMonthValue)) {
    return todayMonth;
  }

  const earliestDueDate = input.calendarTasks.reduce<string | null>((earliest, task) => {
    if (!task.dueDate) {
      return earliest;
    }

    if (!earliest || task.dueDate < earliest) {
      return task.dueDate;
    }

    return earliest;
  }, null);

  if (earliestDueDate) {
    return startOfMonth(parseISO(earliestDueDate));
  }

  return todayMonth;
}

function formatMonthDay(date: Date) {
  return new Intl.DateTimeFormat(DEFAULT_UI_LOCALE_TAG, { month: "short", day: "numeric" }).format(date);
}

function formatWeekdayLong(date: Date) {
  return new Intl.DateTimeFormat(DEFAULT_UI_LOCALE_TAG, { weekday: "long" }).format(date);
}

function fileSafeDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}
