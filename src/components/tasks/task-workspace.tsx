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
import { ProjectMaterialsPage } from "@/components/project-context/project-materials-page";
import {
  getTaskCategoricalFieldOptions,
  labelForTaskCategoricalFieldValue,
  serializeTaskCategoryValues,
  TaskCategoricalFieldMultiSelect,
  TaskCategoricalFieldSelect,
  type TaskCategoricalFieldKey,
} from "@/components/tasks/task-categorical-fields";
import { shouldUseLegacyTaskCategoricalTextInput } from "@/components/tasks/task-categorical-edit-policy";
import { BoardTaskOverview } from "@/components/tasks/board-task-overview";
import { DailyGridBodyV2 } from "@/components/tasks/daily-grid-body-v2";
import { DailyGridHeaderV2 } from "@/components/tasks/daily-grid-header-v2";
import { createTaskEditorDraftStore, useTaskEditorDraftStoreSnapshot, type TaskEditorDraftStore } from "@/components/tasks/task-editor-draft-store";
import { createTaskGridDomRegistry, createTaskGridCellKey } from "@/components/tasks/task-grid-dom-registry";
import { createTaskListRowMetricsStore } from "@/components/tasks/task-grid-metrics-store";
import { TaskInlineEditorOverlay } from "@/components/tasks/task-inline-editor-overlay";
import { TaskCellEditor } from "@/components/tasks/cell-documents/task-cell-editor";
import { TaskListCategoricalHeaderFilter as TaskListCategoricalHeaderFilterPopover } from "@/components/tasks/task-list-categorical-header-filter";
import { TaskListOrderHeaderMenu } from "@/components/tasks/task-list-order-header-menu";
import {
  buildCoalescedDailyReorderOperation,
  buildDailyMutationOperation,
  buildDailyMutationScopeKey,
  buildDailyOptimisticTaskId,
  classifyDailyMutationFlushFailure,
  cleanupSyncedDailyMutationOperations,
  computeDailyMutationRetryDelayMs,
  createDailyMutationId,
  deleteDailyMutationOperation,
  getDailyCreateClientMutationIdFromTempTaskId,
  isDailyReorderMutationSatisfiedByServerState,
  listDailyMutationOperations,
  mergeDailyMutationOperationsIntoActiveTasks,
  mergeDailyMutationOperationsIntoTrashTasks,
  putDailyMutationOperation,
  rebaseDailyReorderMutationOperation,
  rebaseDailyUpdateMutationOperation,
  reconcileDailyMutationCreateSuccess,
  shouldContinueRetryingDailyMutation,
  shouldMarkDailyDeleteMutationSyncedFromServerState,
  shouldMarkDailyTrashMutationSyncedFromServerState,
  shouldRecoverLegacyFailedDailyMutation,
  shouldResetDailyMutationSyncingOperation,
  summarizeDailyMutationOperations,
  updateDailyMutationOperation,
  type DailyMutationFlushErrorInfo,
  type DailyMutationOperation,
  type DailyMutationScope,
  type DailyMutationSummary,
} from "@/components/tasks/daily-mutation-journal";
import { publishDailyRowSyncEvent, publishDailyRowSyncOperationEvent, subscribeDailyRowSyncEvents } from "@/components/tasks/daily-row-sync-bus";
import {
  applyPendingTaskPatchValues,
  clearMatchingPendingTaskPatchValues,
  mergePendingTaskPatchValues,
  type TaskPendingPatchValueMap,
} from "@/components/tasks/task-optimistic-patch-state";
import { TaskFocusStrip } from "@/components/tasks/task-focus-strip";
import { TaskAssistantPanel } from "@/components/tasks/task-assistant-panel";
import { TaskPreviewCard } from "@/components/tasks/task-preview-card";
import { TaskQuickCreate } from "@/components/tasks/task-quick-create";
import type { TaskQuickCreateFormValues } from "@/components/tasks/task-quick-create-state";
import { useAuthUser } from "@/providers/auth-provider";
import { useDashboardData, useDashboardScope, type DashboardScope } from "@/providers/dashboard-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { useTheme } from "@/providers/theme-provider";
import type { ProjectMembershipRole } from "@/domains/admin/types";
import type { AssistantActionAuditRecord } from "@/domains/assistant/saas-api-mode";
import { getFilePreviewKind, isFilePreviewable } from "@/domains/file/metadata";
import { canEditProjectWorkspace, canReadProject } from "@/lib/auth/project-capabilities";
import type { CalendarHolidayRangeData } from "@/lib/tasks/calendar-holiday-types";
import { hasSupabaseClientConfig } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { isDailyCellDocumentsEnabled } from "@/lib/features/daily-cell-documents";
import koreanPublicHolidays from "@/lib/tasks/korean-public-holidays";
import { recordWorkspaceRouteReady } from "@/lib/workspace/route-timing";
import {
  matchesTaskCategoricalFilter,
  normalizeTaskCategoricalFilterSelection,
} from "@/lib/task-categorical-filter";
import {
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import { DEFAULT_TASK_STATUS, isTaskStatus, TASK_STATUS_ORDER } from "@/domains/task/status";
import { isTextCellDocumentField, type TextCellDocumentFieldKey } from "@/domains/task/cell-documents";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { DashboardMode, FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { buildSiblingOrderUpdates, buildStoredOrderTaskTree } from "@/domains/task/ordering";
import {
  buildTaskTreePages,
  buildTaskTreeRows,
  dailyTaskListColumns,
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
type TaskWorkspaceContentMode = Exclude<DashboardMode, "materials">;
type TaskWorkspaceContentProps = {
  mode: DashboardMode;
  pathnameMode: TaskWorkspaceContentMode | null;
};
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
type QueuedTaskPatch = {
  payload: Partial<TaskRecord>;
  clearedDirtyFields: readonly DraftDirtyField[];
  fallbackKey?: ErrorCopyKey;
};
type TaskPatchQueueEntry = {
  promise: Promise<TaskRecord | null>;
  queued: QueuedTaskPatch | null;
  timerId: number | null;
  isRunning: boolean;
  resolve: (value: TaskRecord | null) => void;
  reject: (reason: unknown) => void;
};
type QueueTaskPatch = (
  task: Pick<TaskRecord, "id" | "version">,
  payload: Partial<TaskRecord>,
  options?: {
    clearedDirtyFields?: readonly DraftDirtyField[];
    fallbackKey?: ErrorCopyKey;
  },
) => Promise<TaskRecord | null>;
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
type TaskReorderExpectedVersionMap = Record<string, number>;
type TaskReorderPersistCommand =
  | TaskReorderClientCommand
  | {
      action: "set_sibling_order";
      parentTaskId: string | null;
      orderedTaskIds: readonly string[];
      siblingOrderStart?: number;
      expectedVersions?: TaskReorderExpectedVersionMap;
    };
type QueuedTaskReorder = {
  command: TaskReorderPersistCommand;
  nextMode: DailyTaskSortMode;
  previousTasks: readonly TaskRecord[];
  requestId: number;
};
type TaskReorderQueueState = {
  entries: QueuedTaskReorder[];
  isRunning: boolean;
  latestRequestId: number;
};
type StoredPendingTaskReorder = {
  version: typeof TASK_REORDER_PENDING_STORAGE_VERSION;
  updatedAt: number;
  command: TaskReorderPersistCommand;
};

type TaskDetailPanelInteractionState = {
  selectedTaskId: string | null;
  isDetailExpanded: boolean;
};

type TaskFormDisplayState = {
  taskNumber?: string | number | null;
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
type ProjectPresenceActiveEditor = {
  targetType: "taskField";
  taskId: string;
  fieldKey: string;
  fieldLabel: string;
  heartbeatAt: string;
};
type ProjectPresenceUser = {
  profileId: string;
  displayName: string;
  email: string;
  activeEditor: ProjectPresenceActiveEditor | null;
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
  canReorderRows: boolean;
  isPreviewReadOnly: boolean;
  rowDraft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  registerTaskListRowCellRef: (taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => void;
  focusTaskListEditableCell: (taskId: string, columnKey: TaskListColumnKey) => void;
  updateDraftForm: TaskFormChangeHandler;
  saveInlineTaskListField: (columnKey: TaskListColumnKey, valueOverride?: Partial<TaskRecord>) => Promise<void> | void;
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
  canReorderRows: boolean;
  isPreviewReadOnly: boolean;
  activeTaskListInlineEditRowId: string | null;
  draft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions: readonly WorkTypeDefinition[];
  categoryDefinitionsByField: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  registerTaskListRowCellRef: (taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => void;
  focusTaskListEditableCell: (taskId: string, columnKey: TaskListColumnKey) => void;
  updateDraftForm: TaskFormChangeHandler;
  saveInlineTaskListField: (columnKey: TaskListColumnKey, valueOverride?: Partial<TaskRecord>) => Promise<void> | void;
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
type TrashSortMode = "deletedAt" | "createdAt";
type TrashListViewMode = "full" | "paged";
type TrashItemPage = {
  items: TrashItem[];
  startItemNumber: number;
  endItemNumber: number;
};
type PageNavigationItem = { key: string; kind: "page"; page: number } | { key: string; kind: "ellipsis" };
type BoardCollapsedStatusMap = Partial<Record<TaskStatus, true>>;
type TaskSubtreeMutationPayload = {
  task?: TaskRecord;
  affectedTasks?: TaskRecord[];
};
type PermanentTaskDeletePayload = {
  deletedTaskIds?: string[];
  deletedFileIds?: string[];
  updatedTasks?: TaskRecord[];
};

type AssistantAuditChildTask = {
  id: string;
  label: string;
  title: string;
  recordIds: string[];
};

type AssistantAuditIndicator = {
  summaryRecordIds: string[];
  sourceRecordIds: string[];
  parentReference: string | null;
  followUpChildren: AssistantAuditChildTask[];
  structuredActions: AssistantActionAuditRecord[];
};

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
const ASSISTANT_APPROVED_SUMMARY_PATTERN = /\[Assistant approved summary ([^\]]+)\]/g;
const ASSISTANT_SOURCE_RECORD_PATTERN = /^Source assistant record:\s*(.+)$/gim;
const ASSISTANT_PARENT_TASK_PATTERN = /^Parent task:\s*(.+)$/im;
const calendarWeekdayColumns = Array.from({ length: 7 }, (_unused, index) => ({
  index,
  label: getWeekdayLabelByIndex(index),
  isHoliday: index === 0,
}));
const QUICK_CREATE_WIDTH_STORAGE_KEY_PREFIX = "architect-start.quick-create-widths:";
const QUICK_CREATE_SAVE_DELAY_MS = 250;
const TASK_LIST_LAYOUT_STORAGE_KEY_PREFIX = "architect-start.task-list-layout:";
const TASK_REORDER_PENDING_STORAGE_KEY_PREFIX = "architect-start.pending-task-reorder:";
const TASK_REORDER_PENDING_STORAGE_VERSION = 1;
const TASK_REORDER_PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const KEEPALIVE_REQUEST_BODY_SAFE_BYTES = 60 * 1024;
const TASK_REORDER_RETRY_BASE_DELAY_MS = 1500;
const TASK_REORDER_RETRY_MAX_DELAY_MS = 30000;
const TASK_REORDER_RETRY_MAX_ATTEMPTS = 6;
const DAILY_MUTATION_FETCH_TIMEOUT_MS = 45000;
const DAILY_REORDER_FAILED_SETTLEMENT_CHECK_MS = 30000;
const BOARD_COLUMN_STORAGE_KEY_PREFIX = "architect-start.board-columns:";
const CATEGORICAL_FILTER_STORAGE_KEY_PREFIX = "architect-start.categorical-filter:";
const TRASH_VIEW_PREFERENCE_STORAGE_KEY_PREFIX = "architect-start.trash-view:";
const DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE = "hide-issue-id-overdue-badge";
const DAILY_VIEW_PREFERENCE_LIST_VIEW_MODE = "list-view-mode";
const TRASH_VIEW_PREFERENCE_SORT_MODE = "sort-mode";
const TRASH_VIEW_PREFERENCE_LIST_VIEW_MODE = "list-view-mode";
const DAILY_TASK_PAGE_SIZE = 50;
const TRASH_PAGE_SIZE = 50;
const DAILY_TASK_TABLE_VIRTUAL_OVERSCAN = 2;
const DAILY_TASK_TABLE_ROW_CHROME_HEIGHT = 1;
const TASK_INLINE_PATCH_DEBOUNCE_MS = 1200;
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

function readProjectPresenceUsers(state: Record<string, unknown[]>): ProjectPresenceUser[] {
  const users = new Map<string, ProjectPresenceUser>();

  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const payload = entry as Partial<ProjectPresenceUser>;
      const profileId = typeof payload.profileId === "string" ? payload.profileId : "";
      if (!profileId || users.has(profileId)) {
        continue;
      }

      users.set(profileId, {
        profileId,
        displayName: typeof payload.displayName === "string" && payload.displayName.trim() ? payload.displayName : "사용자",
        email: typeof payload.email === "string" ? payload.email : "",
        activeEditor: readProjectPresenceActiveEditor(payload.activeEditor),
      });
    }
  }

  return [...users.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function readProjectPresenceActiveEditor(value: unknown): ProjectPresenceActiveEditor | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Partial<ProjectPresenceActiveEditor>;
  if (payload.targetType !== "taskField" || typeof payload.taskId !== "string" || typeof payload.fieldKey !== "string") {
    return null;
  }

  return {
    targetType: "taskField",
    taskId: payload.taskId,
    fieldKey: payload.fieldKey,
    fieldLabel: typeof payload.fieldLabel === "string" && payload.fieldLabel.trim() ? payload.fieldLabel : payload.fieldKey,
    heartbeatAt: typeof payload.heartbeatAt === "string" ? payload.heartbeatAt : "",
  };
}

function getPresenceDisplayName(user: { displayName?: string | null; email?: string | null }) {
  return user.displayName?.trim() || user.email?.trim() || "사용자";
}

function buildEditLeasePayload(cell: PendingTaskListFocusCell) {
  return {
    targetType: "taskField",
    targetId: cell.taskId,
    fieldKey: cell.columnKey,
  };
}

function isWorkspaceNavigationTarget(target: HTMLElement) {
  return Boolean(target.closest('[data-workspace-navigation="true"], a[href], .daily-sheet__view-mode-toggle'));
}

function dashboardModeFromPathname(pathname: string): DashboardMode | null {
  const workspacePathname = pathname.startsWith("/preview/") ? pathname.slice("/preview".length) : pathname;
  switch (workspacePathname) {
    case "/board":
      return "board";
    case "/calendar":
      return "calendar";
    case "/daily":
      return "daily";
    case "/materials":
      return "materials";
    case "/trash":
      return "trash";
    default:
      return null;
  }
}

export function TaskWorkspace(props: TaskWorkspaceProps) {
  const pathname = usePathname();
  const pathnameMode = dashboardModeFromPathname(pathname);
  if (pathnameMode === "materials") {
    return <ProjectMaterialsPage preview={pathname.startsWith("/preview")} />;
  }

  return <TaskWorkspaceContent {...props} pathnameMode={pathnameMode} />;
}

function TaskWorkspaceContent({ mode: routeMode, pathnameMode }: TaskWorkspaceContentProps) {
  const authUser = useAuthUser();
  const router = useRouter();
  const pathname = usePathname();
  const mode = pathnameMode ?? routeMode;
  const isPreview = pathname.startsWith("/preview");
  const taskReorderOrderScope = !isPreview && mode === "daily" ? "daily" : null;
  const { themeId } = useTheme();
  const isWarmStudio = themeId === "posthog";
  const isAppleWorkbench = themeId === "apple-workbench";
  const isPreviewDaily = isPreview && mode === "daily";
  const dailyCellDocumentsEnabled = isDailyCellDocumentsEnabled();
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
  const [taskReorderRetryTick, setTaskReorderRetryTick] = useState(0);
  const [dailyMutationOperations, setDailyMutationOperations] = useState<DailyMutationOperation[]>([]);
  const [dailyMutationSummary, setDailyMutationSummary] = useState<DailyMutationSummary>({
    pending: 0,
    syncing: 0,
    failed: 0,
    synced: 0,
    totalActive: 0,
  });
  const [dailyMutationJournalReady, setDailyMutationJournalReady] = useState(false);
  const [calendarHolidayDateKeys, setCalendarHolidayDateKeys] = useState<string[] | null>(null);
  const [calendarHolidayLoadedMonths, setCalendarHolidayLoadedMonths] = useState<string[] | null>(null);
  const [inlineSavingFields, setInlineSavingFields] = useState<Partial<Record<TaskListColumnKey, boolean>>>({});
  const [taskSortMode, setTaskSortMode] = useState<DailyTaskSortMode>("manual");
  const [isTaskOrderMenuOpen, setIsTaskOrderMenuOpen] = useState(false);
  const [taskFocusKey, setTaskFocusKey] = useState<TaskFocusKey | null>(null);
  const [hideIssueIdOverdueBadge, setHideIssueIdOverdueBadge] = useState(false);
  const [dailyListViewMode, setDailyListViewMode] = useState<DailyListViewMode>("full");
  const [dailyTaskPage, setDailyTaskPage] = useState(1);
  const [trashSortMode, setTrashSortMode] = useState<TrashSortMode>("deletedAt");
  const [trashListViewMode, setTrashListViewMode] = useState<TrashListViewMode>("paged");
  const [trashPage, setTrashPage] = useState(1);
  const [expandedTrashItemKeys, setExpandedTrashItemKeys] = useState<string[]>([]);
  const [collapsedBoardStatuses, setCollapsedBoardStatuses] = useState<BoardCollapsedStatusMap>(() => createDefaultBoardCollapsedStatusMap());
  const [boardPageByStatus, setBoardPageByStatus] = useState<Partial<Record<TaskStatus, number>>>({});
  const [assigneeOptions, setAssigneeOptions] = useState<AssigneeOption[]>([]);
  const [projectPresenceUsers, setProjectPresenceUsers] = useState<ProjectPresenceUser[]>([]);
  const [expandedBoardTaskId, setExpandedBoardTaskId] = useState<string | null>(null);
  const [pendingTaskListFocusCell, setPendingTaskListFocusCell] = useState<PendingTaskListFocusCell | null>(null);
  const [viewportWidth, setViewportWidth] = useState(WIDE_BREAKPOINT);
  const [hasViewportSync, setHasViewportSync] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(true);
  const [hasInitializedCreateForm, setHasInitializedCreateForm] = useState(false);
  const [detailPanelState, setDetailPanelState] = useState<DetailPanelState>("collapsed");
  const [assistantActionAudits, setAssistantActionAudits] = useState<AssistantActionAuditRecord[]>([]);
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
  const taskDragStateRef = useRef<TaskDragState | null>(null);
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
  const trashViewPreferenceReadyKeyRef = useRef<string | null>(null);
  const skipDailyTaskPageSelectionSyncRef = useRef(false);
  const taskReorderUnloadPersistCommandRef = useRef<TaskReorderPersistCommand | null>(null);
  const taskReorderUnloadPersistAttemptedRef = useRef(false);
  const taskReorderStorageKeyRef = useRef<string | null>(null);
  const taskReorderStorageReplayAttemptSignatureRef = useRef<string | null>(null);
  const taskReorderRetryTimerRef = useRef<number | null>(null);
  const taskReorderRetryAttemptRef = useRef(0);
  const dailyMutationOperationsRef = useRef<DailyMutationOperation[]>([]);
  const dailyMutationScopeRef = useRef<DailyMutationScope | null>(null);
  const localFirstActiveTasksRef = useRef<TaskRecord[]>([]);
  const dailyMutationFlushTimerRef = useRef<number | null>(null);
  const dailyMutationFlushRunningRef = useRef(false);
  const dailyMutationRemoteRefreshSuppressFlushUntilRef = useRef(0);
  const flushDailyMutationOperationRef = useRef<(operation: DailyMutationOperation) => Promise<void>>(async () => undefined);
  const settleDailyFailedReorderIfServerSatisfiedRef = useRef<
    (operation: DailyMutationOperation, now: number) => Promise<boolean>
  >(async () => false);
  const boardCollapsedStorageReadyKeyRef = useRef<string | null>(null);
  const draftDirtyFieldsRef = useRef<DraftDirtyFieldMap>({});
  const draftRef = useRef<TaskRecord | null>(null);
  const activeTaskListInlineEditCellRef = useRef<PendingTaskListFocusCell | null>(null);
  const activeTaskListEditLeaseCellRef = useRef<PendingTaskListFocusCell | null>(null);
  const parentTaskNumberDraftRef = useRef("");
  const selectedParentTaskRef = useRef<TaskRecord | null>(null);
  const selectedTaskRef = useRef<TaskRecord | null>(null);
  const inlineSavingFieldsRef = useRef<Partial<Record<TaskListColumnKey, boolean>>>({});
  const taskPatchQueueRef = useRef<Record<string, TaskPatchQueueEntry>>({});
  const queueTaskPatchRef = useRef<QueueTaskPatch | null>(null);
  const taskPendingPatchValuesRef = useRef<TaskPendingPatchValueMap>({});
  const taskReorderQueueRef = useRef<TaskReorderQueueState>({
    entries: [],
    isRunning: false,
    latestRequestId: 0,
  });
  const detailPanelInteractionRef = useRef<TaskDetailPanelInteractionState>({
    selectedTaskId: null,
    isDetailExpanded: false,
  });
  const previousSelectedTaskIdRef = useRef<string | null>(null);
  const isClearingSelectionRef = useRef(false);
  const saveSelectedTaskRef = useRef<() => Promise<boolean>>(async () => false);

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";
  const {
    stateByScope: dashboardStateByScope,
    setDashboardFiles,
    setDashboardTasks,
  } = useDashboardData();
  const dashboardStateByScopeRef = useRef(dashboardStateByScope);
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
  const dailyMutationScope = useMemo<DailyMutationScope | null>(() => {
    if (mode !== "daily" || isPreview || !currentProjectId || !authUser?.id || isLocalAuthPlaceholder) {
      return null;
    }

    return { projectId: currentProjectId, profileId: authUser.id };
  }, [authUser?.id, currentProjectId, isLocalAuthPlaceholder, isPreview, mode]);
  const isDetailExpanded = detailPanelState === "expanded";
  const isPagedDailyListView = mode === "daily" && dailyListViewMode === "paged";
  const isPagedTrashListView = mode === "trash" && trashListViewMode === "paged";
  const shouldRenderDailyDetailPanel = mode === "daily" && (!isPreviewDaily || selectedTaskId !== null);
  const isDetailPanelResizable = shouldRenderDailyDetailPanel && isDetailDocked && isDetailExpanded;
  const isInlineSaving = Object.values(inlineSavingFields).some(Boolean);
  const isExportDisabled = !canExportTasks || loading || saving || isExporting || isInlineSaving || isReorderingTasks;
  const dailyMutationStatusLabel = useMemo(() => {
    if (mode !== "daily" || dailyMutationSummary.totalActive === 0) {
      return null;
    }

    if (dailyMutationSummary.failed > 0) {
      return "동기화 실패";
    }

    if (dailyMutationSummary.syncing > 0) {
      return "서버 동기화 중";
    }

    return dailyMutationSummary.pending > 0 ? "서버 동기화 대기" : "로컬 반영됨";
  }, [dailyMutationSummary.failed, dailyMutationSummary.pending, dailyMutationSummary.syncing, dailyMutationSummary.totalActive, mode]);
  const dailyMutationStatusDebug = useMemo(() => {
    if (mode !== "daily" || dailyMutationSummary.totalActive === 0) {
      return null;
    }

    const operation =
      dailyMutationOperations.find((candidate) => candidate.status === "failed") ??
      dailyMutationOperations.find((candidate) => candidate.status === "syncing") ??
      dailyMutationOperations.find((candidate) => candidate.status === "pending") ??
      null;

    return operation
      ? {
          failureKind: operation.failureKind ?? "",
          lastError: operation.lastError ?? "",
          lastErrorCode: operation.lastErrorCode ?? "",
          lastHttpStatus: operation.lastHttpStatus === null || operation.lastHttpStatus === undefined ? "" : String(operation.lastHttpStatus),
          retryCount: String(operation.retryCount),
          status: operation.status,
          type: operation.type,
        }
      : null;
  }, [dailyMutationOperations, dailyMutationSummary.totalActive, mode]);
  const canEditWorkspace =
    !isPreview &&
    Boolean(authUser) &&
    canEditProjectWorkspace({
      globalRole: authUser?.role ?? "member",
      projectRole: currentProjectRole,
    });
  const canReorderDailyTasks =
    mode === "daily" &&
    !isPreview &&
    Boolean(authUser) &&
    Boolean(currentProjectId) &&
    canReadProject({
      globalRole: authUser?.role ?? "member",
      projectRole: currentProjectRole,
    });
  const isWorkspaceReadOnly = !canEditWorkspace;
  const taskFormReadonly = isWorkspaceReadOnly
    ? readonlyWorkspaceFields
    : { ...createReadonlyFields, calendarLinked: Boolean(inlineSavingFields.calendarLinked) };
  const currentActiveEditorSignal = useMemo<ProjectPresenceActiveEditor | null>(() => {
    if (!activeTaskListInlineEditCell) {
      return null;
    }

    return {
      targetType: "taskField",
      taskId: activeTaskListInlineEditCell.taskId,
      fieldKey: activeTaskListInlineEditCell.columnKey,
      fieldLabel: labelForField(activeTaskListInlineEditCell.columnKey),
      heartbeatAt: new Date().toISOString(),
    };
  }, [activeTaskListInlineEditCell]);
  const projectPresenceLabel = useMemo(() => {
    if (projectPresenceUsers.length === 0) {
      return null;
    }

    const names = projectPresenceUsers.map((user) => user.displayName).slice(0, 3).join(", ");
    const overflow = projectPresenceUsers.length > 3 ? ` +${projectPresenceUsers.length - 3}` : "";
    return `온라인 ${projectPresenceUsers.length}명: ${names}${overflow}`;
  }, [projectPresenceUsers]);
  const activeEditorPresenceLabel = useMemo(() => {
    const activeEditors = projectPresenceUsers.filter(
      (user) => user.profileId !== authUser?.id && user.activeEditor?.targetType === "taskField",
    );
    if (activeEditors.length === 0) {
      return null;
    }

    const editor = activeEditors[0];
    const suffix = activeEditors.length > 1 ? ` +${activeEditors.length - 1}` : "";
    return `${editor.displayName}님이 ${editor.activeEditor?.fieldLabel ?? "필드"} 편집 중${suffix}`;
  }, [authUser?.id, projectPresenceUsers]);
  const quickCreateWidthStorageKey = mode === "daily" && authUser?.id ? getQuickCreateWidthStorageKey(authUser.id) : null;
  const taskListLayoutStorageKey =
    mode === "daily" && (authUser?.id || isPreview) ? getTaskListLayoutStorageKey(authUser?.id ?? "preview") : null;
  const taskReorderStorageKey =
    mode === "daily" && currentProjectId && (authUser?.id || isPreview)
      ? getTaskReorderStorageKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const categoricalFilterStorageBaseKey =
    mode === "daily" && currentProjectId && (authUser?.id || isPreview)
      ? getCategoricalFilterStorageBaseKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const trashViewPreferenceStorageBaseKey =
    mode === "trash" && currentProjectId && (authUser?.id || isPreview)
      ? getTrashViewPreferenceStorageBaseKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const issueIdOverdueBadgePreferenceStorageKey = categoricalFilterStorageBaseKey
    ? getDailyViewPreferenceStorageKey(categoricalFilterStorageBaseKey, DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE)
    : null;
  const dailyListViewModePreferenceStorageKey = categoricalFilterStorageBaseKey
    ? getDailyViewPreferenceStorageKey(categoricalFilterStorageBaseKey, DAILY_VIEW_PREFERENCE_LIST_VIEW_MODE)
    : null;
  const trashSortModePreferenceStorageKey = trashViewPreferenceStorageBaseKey
    ? getTrashViewPreferenceStorageKey(trashViewPreferenceStorageBaseKey, TRASH_VIEW_PREFERENCE_SORT_MODE)
    : null;
  const trashListViewModePreferenceStorageKey = trashViewPreferenceStorageBaseKey
    ? getTrashViewPreferenceStorageKey(trashViewPreferenceStorageBaseKey, TRASH_VIEW_PREFERENCE_LIST_VIEW_MODE)
    : null;
  const boardCollapsedStorageKey =
    mode === "board" && currentProjectId && (authUser?.id || isPreview)
      ? getBoardCollapsedStorageKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const canPersistQuickCreateWidthsToServer = mode === "daily" && Boolean(authUser?.id) && !isPreview && !isLocalAuthPlaceholder;
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
      activeTaskListInlineEditCellRef.current = nextCell;
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
  const refreshDailyMutationJournal = useCallback(async () => {
    if (!dailyMutationScope) {
      dailyMutationOperationsRef.current = [];
      setDailyMutationOperations([]);
      setDailyMutationSummary({ pending: 0, syncing: 0, failed: 0, synced: 0, totalActive: 0 });
      setDailyMutationJournalReady(true);
      return [] as DailyMutationOperation[];
    }

    await cleanupSyncedDailyMutationOperations(dailyMutationScope);
    let operations = await listDailyMutationOperations(dailyMutationScope);
    const staleSyncingOperations = operations.filter((operation) => shouldResetDailyMutationSyncingOperation(operation));
    const legacyFailedOperations = operations.filter((operation) => shouldRecoverLegacyFailedDailyMutation(operation));
    if (staleSyncingOperations.length > 0) {
      await Promise.all(
        staleSyncingOperations.map((operation) =>
          updateDailyMutationOperation(operation.operationId, (current) =>
            shouldResetDailyMutationSyncingOperation(current)
              ? {
                  ...current,
                  status: "pending",
                  lastError: current.lastError ?? "Previous sync was interrupted before completion.",
                  nextRetryAt: null,
                  updatedAt: new Date().toISOString(),
                }
              : current,
          ),
        ),
      );
      operations = await listDailyMutationOperations(dailyMutationScope);
    }
    if (legacyFailedOperations.length > 0) {
      await Promise.all(
        legacyFailedOperations.map((operation) =>
          updateDailyMutationOperation(operation.operationId, (current) =>
            shouldRecoverLegacyFailedDailyMutation(current)
              ? {
                  ...current,
                  status: "pending",
                  lastError: current.lastError ?? "Previous sync failed before recovery classification was available.",
                  nextRetryAt: null,
                  updatedAt: new Date().toISOString(),
                }
              : current,
          ),
        ),
      );
      operations = await listDailyMutationOperations(dailyMutationScope);
    }
    dailyMutationOperationsRef.current = operations;
    setDailyMutationOperations(operations);
    setDailyMutationSummary(summarizeDailyMutationOperations(operations));
    setDailyMutationJournalReady(true);
    return operations;
  }, [dailyMutationScope]);
  const putDailyJournalOperation = useCallback(
    async (operation: DailyMutationOperation) => {
      await putDailyMutationOperation(operation);
      await refreshDailyMutationJournal();
      if (dailyMutationScope) {
        publishDailyRowSyncOperationEvent(dailyMutationScope, "daily-journal-updated", operation);
      }
    },
    [dailyMutationScope, refreshDailyMutationJournal],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    dailyMutationOperationsRef.current = dailyMutationOperations;
  }, [dailyMutationOperations]);

  useEffect(() => {
    dailyMutationScopeRef.current = dailyMutationScope;
    setDailyMutationJournalReady(false);
    void refreshDailyMutationJournal();
  }, [dailyMutationScope, refreshDailyMutationJournal]);

  useEffect(() => {
    taskReorderStorageKeyRef.current = taskReorderStorageKey;
    taskReorderStorageReplayAttemptSignatureRef.current = null;
  }, [taskReorderStorageKey]);

  useEffect(() => {
    const persistLatestTaskReorderBeforeUnload = () => {
      const command = taskReorderUnloadPersistCommandRef.current;
      if (!command || taskReorderUnloadPersistAttemptedRef.current) {
        return;
      }

      taskReorderUnloadPersistAttemptedRef.current = true;
      const body = JSON.stringify(
        buildTaskReorderRequestBody(command, dashboardStateByScopeRef.current.active.tasks, taskReorderOrderScope),
      );
      if (getUtf8ByteLength(body) > KEEPALIVE_REQUEST_BODY_SAFE_BYTES) {
        return;
      }
      const url = "/api/tasks/reorder";

      if (typeof navigator.sendBeacon === "function") {
        const queued = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
        if (queued) {
          return;
        }
      }

      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    };
    const persistLatestTaskReorderWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        persistLatestTaskReorderBeforeUnload();
      }
    };

    document.addEventListener("visibilitychange", persistLatestTaskReorderWhenHidden);
    window.addEventListener("pagehide", persistLatestTaskReorderBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", persistLatestTaskReorderWhenHidden);
      window.removeEventListener("pagehide", persistLatestTaskReorderBeforeUnload);
    };
  }, [taskReorderOrderScope]);

  useEffect(() => {
    if (mode !== "daily" || isPreview || !currentProjectId) {
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
  }, [currentProjectId, isPreview, mode]);

  useEffect(() => {
    if (isPreview || !currentProjectId || !authUser || !hasSupabaseClientConfig()) {
      setProjectPresenceUsers([]);
      return;
    }

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`project:${currentProjectId}:presence`, {
      config: {
        presence: {
          key: authUser.id,
        },
      },
    });

    const syncPresence = () => {
      if (cancelled) {
        return;
      }

      const state = channel.presenceState() as Record<string, unknown[]>;
      setProjectPresenceUsers(readProjectPresenceUsers(state));
    };

    const trackPresence = () =>
      channel.track({
        profileId: authUser.id,
        displayName: getPresenceDisplayName(authUser),
        email: authUser.email,
        projectId: currentProjectId,
        activeEditor: currentActiveEditorSignal,
        heartbeatAt: new Date().toISOString(),
      });

    channel.on("presence", { event: "sync" }, syncPresence);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !cancelled) {
        void trackPresence();
      }
    });

    return () => {
      cancelled = true;
      setProjectPresenceUsers([]);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [authUser, currentActiveEditorSignal, currentProjectId, isPreview]);

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
    if (mode !== "trash") {
      setTrashSortMode("deletedAt");
      setTrashListViewMode("paged");
      setTrashPage(1);
      setExpandedTrashItemKeys([]);
      trashViewPreferenceReadyKeyRef.current = null;
      return;
    }

    if (!trashViewPreferenceStorageBaseKey || !trashSortModePreferenceStorageKey || !trashListViewModePreferenceStorageKey) {
      setTrashSortMode("deletedAt");
      setTrashListViewMode("paged");
      setTrashPage(1);
      setExpandedTrashItemKeys([]);
      trashViewPreferenceReadyKeyRef.current = "__none__";
      return;
    }

    setTrashSortMode(readTrashSortModeFromStorage(trashSortModePreferenceStorageKey));
    setTrashListViewMode(readTrashListViewModeFromStorage(trashListViewModePreferenceStorageKey));
    setTrashPage(1);
    setExpandedTrashItemKeys([]);
    trashViewPreferenceReadyKeyRef.current = trashViewPreferenceStorageBaseKey;
  }, [mode, trashListViewModePreferenceStorageKey, trashSortModePreferenceStorageKey, trashViewPreferenceStorageBaseKey]);

  useEffect(() => {
    if (!trashViewPreferenceStorageBaseKey || !trashSortModePreferenceStorageKey) {
      return;
    }

    if (trashViewPreferenceReadyKeyRef.current !== trashViewPreferenceStorageBaseKey) {
      return;
    }

    writeTrashSortModeToStorage(trashSortModePreferenceStorageKey, trashSortMode);
  }, [trashSortMode, trashSortModePreferenceStorageKey, trashViewPreferenceStorageBaseKey]);

  useEffect(() => {
    if (!trashViewPreferenceStorageBaseKey || !trashListViewModePreferenceStorageKey) {
      return;
    }

    if (trashViewPreferenceReadyKeyRef.current !== trashViewPreferenceStorageBaseKey) {
      return;
    }

    writeTrashListViewModeToStorage(trashListViewModePreferenceStorageKey, trashListViewMode);
  }, [trashListViewMode, trashListViewModePreferenceStorageKey, trashViewPreferenceStorageBaseKey]);

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

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const localFirstTasks = useMemo(() => {
    if (mode !== "daily" || !dailyMutationJournalReady || dailyMutationOperations.length === 0) {
      return tasks;
    }

    const next = mergeDailyMutationOperationsIntoActiveTasks(tasks, dailyMutationOperations);
    return areTaskCollectionsEquivalent(tasks, next) ? tasks : next;
  }, [dailyMutationJournalReady, dailyMutationOperations, mode, tasks]);

  useEffect(() => {
    localFirstActiveTasksRef.current = localFirstTasks;
  }, [localFirstTasks]);

  useEffect(() => {
    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      focusTaskId && localFirstTasks.some((task) => task.id === focusTaskId)
        ? focusTaskId
        : previousSelectedTaskId && localFirstTasks.some((task) => task.id === previousSelectedTaskId)
          ? previousSelectedTaskId
          : isPreviewDaily
            ? null
            : localFirstTasks[0]?.id ?? null;
    setTaskListSelection(nextSelectedTaskId);
  }, [focusTaskId, isPreviewDaily, localFirstTasks, setTaskListSelection, taskListRowInteractionStore]);

  const currentDayKey = todayKey();
  const sortedTasks = useMemo(() => buildStoredOrderTaskTree(localFirstTasks), [localFirstTasks]);
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
    () => buildPageNavigationItems(Math.max(dailyTaskPageCount, 1), resolvedDailyTaskPage),
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
  const isDailyManualReorderDisabled = hasActiveDailyFilters || isPagedDailyListView || !canReorderDailyTasks;
  const shouldVirtualizeDailyTaskTable =
    mode === "daily" && !isMobileViewport && !isPagedDailyListView && !isWorkspaceReadOnly;
  const shouldUseDailyGridBodyV2 = USE_DAILY_GRID_BODY_V2 && shouldVirtualizeDailyTaskTable;
  const isDailyHtmlDragReorderDisabled = isDailyManualReorderDisabled;

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
  const selectedTaskIsOptimistic = Boolean(selectedTask?.id && isOptimisticTaskId(selectedTask.id));

  useEffect(() => {
    if (mode !== "daily") {
      return;
    }

    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const focusedTaskId = focusTaskId && visibleDailyTasks.some((task) => task.id === focusTaskId) ? focusTaskId : null;
    const nextSelectedTaskId =
      focusedTaskId ??
      (previousSelectedTaskId && visibleDailyTasks.some((task) => task.id === previousSelectedTaskId)
        ? previousSelectedTaskId
        : isPagedDailyListView || isPreviewDaily
          ? null
          : visibleDailyTasks[0]?.id ?? null);
    setTaskListSelection(nextSelectedTaskId);
  }, [focusTaskId, isPagedDailyListView, isPreviewDaily, mode, setTaskListSelection, taskListRowInteractionStore, visibleDailyTasks]);

  useEffect(() => {
    if (mode !== "daily" || !focusTaskId || focusTaskId !== selectedTaskId) {
      return;
    }

    setIsDetailPanelSticky(true);
    setDetailPanelState("expanded");
  }, [focusTaskId, mode, selectedTaskId]);

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
    dashboardStateByScopeRef.current = dashboardStateByScope;
  }, [dashboardStateByScope]);
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
    if (isPreview || mode !== "daily" || !selectedTask?.id || selectedTaskIsOptimistic) {
      setAssistantActionAudits([]);
      return;
    }

    let cancelled = false;
    const selectedAssistantAuditTaskId = selectedTask.id;
    const abortController = new AbortController();

    async function loadAssistantActionAudits() {
      try {
        const response = await fetch(`/api/assistant/action-audits?taskId=${encodeURIComponent(selectedAssistantAuditTaskId)}`, {
          cache: "no-store",
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(await readErrorMessage(response, "loadDashboardFailed"));
        }

        const payload = (await response.json()) as { data?: AssistantActionAuditRecord[] };
        if (!cancelled) {
          setAssistantActionAudits(Array.isArray(payload.data) ? payload.data : []);
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === "AbortError")) {
          setAssistantActionAudits([]);
        }
      }
    }

    function handleAssistantActionAuditSaved(event: Event) {
      const detail = event instanceof CustomEvent ? (event.detail as Partial<AssistantActionAuditRecord>) : null;
      if (
        detail &&
        [detail.sourceTaskId, detail.targetTaskId, detail.createdTaskId].some((taskId) => taskId === selectedAssistantAuditTaskId)
      ) {
        void loadAssistantActionAudits();
      }
    }

    void loadAssistantActionAudits();
    window.addEventListener("architect:assistant-action-audit-saved", handleAssistantActionAuditSaved);

    return () => {
      cancelled = true;
      abortController.abort();
      window.removeEventListener("architect:assistant-action-audit-saved", handleAssistantActionAuditSaved);
    };
  }, [isPreview, mode, selectedTask?.id, selectedTaskIsOptimistic]);

  const selectedTaskAssistantAudit = useMemo(
    () => (selectedTask ? buildAssistantAuditIndicator(selectedTask, sortedTasks, selectedParentTask, assistantActionAudits) : null),
    [assistantActionAudits, selectedParentTask, selectedTask, sortedTasks],
  );

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

    if (!selectedTask?.id || selectedTaskIsOptimistic || selectedTaskFilesLoaded) {
      return;
    }

    void ensureTaskFilesLoaded(selectedTask.id);
  }, [ensureTaskFilesLoaded, isTrashMode, selectedTask?.id, selectedTaskFilesLoaded, selectedTaskIsOptimistic, tasks]);
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
  const previewableSelectedFiles = useMemo(
    () => selectedFiles.filter((file) => !isOptimisticFileId(file.id) && isFilePreviewable(file)),
    [selectedFiles],
  );
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
  const expandedTrashItemKeySet = useMemo(() => new Set(expandedTrashItemKeys), [expandedTrashItemKeys]);
  const trashItems = useMemo<TrashItem[]>(() => {
    if (!isTrashMode) return [];

    return [
      ...tasks.map((task) => ({ kind: "task" as const, id: task.id, deletedAt: task.deletedAt, task })),
      ...files.map((file) => ({ kind: "file" as const, id: file.id, deletedAt: file.deletedAt, file })),
    ].sort((left, right) => compareTrashItems(left, right, trashSortMode));
  }, [files, isTrashMode, tasks, trashSortMode]);
  const trashItemPages = useMemo(() => buildTrashItemPages(trashItems, TRASH_PAGE_SIZE), [trashItems]);
  const trashPageCount = trashItemPages.length;
  const resolvedTrashPage = useMemo(() => clampBoardPage(trashPage, Math.max(trashPageCount, 1)), [trashPage, trashPageCount]);
  const trashPageNavigationItems = useMemo(
    () => buildPageNavigationItems(Math.max(trashPageCount, 1), resolvedTrashPage),
    [resolvedTrashPage, trashPageCount],
  );
  const activeTrashPage = useMemo<TrashItemPage | null>(() => trashItemPages[resolvedTrashPage - 1] ?? null, [resolvedTrashPage, trashItemPages]);
  const displayedTrashItems = useMemo(
    () => (isPagedTrashListView ? activeTrashPage?.items ?? [] : trashItems),
    [activeTrashPage, isPagedTrashListView, trashItems],
  );
  const displayedTrashRangeLabel = useMemo(() => {
    if (!isPagedTrashListView || !activeTrashPage) {
      return null;
    }

    return t("workspace.trashListPageRange", {
      from: activeTrashPage.startItemNumber,
      to: activeTrashPage.endItemNumber,
      total: trashItems.length,
    });
  }, [activeTrashPage, isPagedTrashListView, trashItems.length]);
  const selectedTrashCount = selectedTrashTaskIds.length + selectedTrashFileIds.length;
  const allTrashSelected = trashItems.length > 0 && selectedTrashCount === trashItems.length;

  useEffect(() => {
    if (mode !== "trash") {
      return;
    }

    const nextTrashItemKeys = new Set(trashItems.map((item) => getTrashItemKey(item)));
    setExpandedTrashItemKeys((previous) => previous.filter((key) => nextTrashItemKeys.has(key)));
  }, [mode, trashItems]);

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
  const acquireTaskListEditLease = useCallback(
    async (cell: PendingTaskListFocusCell) => {
      if (isPreview || !canEditWorkspace) {
        return true;
      }

      setErrorMessage(null);

      try {
        const response = await fetch("/api/edit-leases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEditLeasePayload(cell)),
        });

        if (response.ok) {
          return true;
        }

        setErrorMessage(await readErrorMessage(response, "updateTaskFailed"));
        return false;
      } catch {
        setErrorMessage(localizeError({ fallbackKey: "updateTaskFailed" }));
        return false;
      }
    },
    [canEditWorkspace, isPreview, setErrorMessage],
  );
  const releaseTaskListEditLease = useCallback(
    async (cell: PendingTaskListFocusCell) => {
      if (isPreview || !canEditWorkspace) {
        return;
      }

      try {
        await fetch("/api/edit-leases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildEditLeasePayload(cell)),
        });
      } catch {
        // Lease expiry is the authoritative fallback if best-effort release fails.
      }
    },
    [canEditWorkspace, isPreview],
  );
  const releaseActiveTaskListEditLease = useCallback(() => {
    const cell = activeTaskListEditLeaseCellRef.current;
    if (!cell) {
      return;
    }

    activeTaskListEditLeaseCellRef.current = null;
    void releaseTaskListEditLease(cell);
  }, [releaseTaskListEditLease]);
  useEffect(() => {
    return () => {
      releaseActiveTaskListEditLease();
    };
  }, [releaseActiveTaskListEditLease]);
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
      releaseActiveTaskListEditLease();
      setTaskListActiveInlineEditCell(null);
      setPendingTaskListFocusCell(null);
    },
    [clearDraftDirtyFields, draft, releaseActiveTaskListEditLease, setTaskListActiveInlineEditCell, taskEditorDraftStore],
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
      if (selectedTaskRef.current?.id === updatedTask.id) {
        selectedTaskRef.current = updatedTask;
      }
      if (draftRef.current?.id === updatedTask.id) {
        draftRef.current = mergeTaskIntoDraft(updatedTask, draftRef.current, nextDirtyFields);
      }
      setDraft((previous) => {
        if (!previous || previous.id !== updatedTask.id) {
          return previous;
        }
        return mergeTaskIntoDraft(updatedTask, previous, nextDirtyFields);
      });
    },
    [setTasks],
  );
  const applyTaskClientUpdate = useCallback(
    (nextTask: TaskRecord, clearedDirtyFields: readonly DraftDirtyField[] = []) => {
      const nextDirtyFields = clearDraftDirtyFieldMap(draftDirtyFieldsRef.current, clearedDirtyFields);
      draftDirtyFieldsRef.current = nextDirtyFields;
      setDraftDirtyFields(nextDirtyFields);
      setTasks((previous) =>
        previous.map((task) => (task.id === nextTask.id ? withEmptyTaskFileSummary({ ...task, ...nextTask }) : task)),
      );
      if (selectedTaskRef.current?.id === nextTask.id) {
        selectedTaskRef.current = withEmptyTaskFileSummary({ ...selectedTaskRef.current, ...nextTask });
      }
      if (draftRef.current?.id === nextTask.id) {
        draftRef.current = mergeTaskIntoDraft(nextTask, draftRef.current, nextDirtyFields);
      }
      setDraft((previous) => {
        if (!previous || previous.id !== nextTask.id) {
          return previous;
        }
        return mergeTaskIntoDraft(nextTask, previous, nextDirtyFields);
      });
    },
    [setTasks],
  );
  const setDashboardScopeTasks = useCallback(
    (targetScope: DashboardScope, updater: (previous: TaskRecord[]) => TaskRecord[]) => {
      setDashboardTasks(targetScope, (previous) => updater(previous));
    },
    [setDashboardTasks],
  );
  const setActiveTasksForContinuousReorder = useCallback(
    (updater: (previous: TaskRecord[]) => TaskRecord[]) => {
      const currentDashboardState = dashboardStateByScopeRef.current;
      const currentActiveState = currentDashboardState.active;
      const nextTasks = updater(currentActiveState.tasks);

      dashboardStateByScopeRef.current = {
        ...currentDashboardState,
        active: {
          ...currentActiveState,
          tasks: nextTasks,
        },
      };
      setTasks(nextTasks);
      return nextTasks;
    },
    [setTasks],
  );
  const removeTaskIdsFromDashboardScope = useCallback(
    (targetScope: DashboardScope, taskIds: Iterable<string>) => {
      const taskIdSet = new Set(taskIds);
      if (taskIdSet.size === 0) {
        return;
      }

      setDashboardScopeTasks(targetScope, (previous) => previous.filter((task) => !taskIdSet.has(task.id)));
    },
    [setDashboardScopeTasks],
  );
  const upsertTasksIntoDashboardScope = useCallback(
    (targetScope: DashboardScope, nextTasks: readonly TaskRecord[]) => {
      if (nextTasks.length === 0) {
        return;
      }

      setDashboardScopeTasks(targetScope, (previous) => {
        const nextById = new Map(nextTasks.map((task) => [task.id, withEmptyTaskFileSummary(task)]));
        const next = previous.map((task) => nextById.get(task.id) ?? task);
        const existingIds = new Set(previous.map((task) => task.id));
        for (const task of nextTasks) {
          if (!existingIds.has(task.id)) {
            next.push(withEmptyTaskFileSummary(task));
          }
        }
        return next;
      });
    },
    [setDashboardScopeTasks],
  );
  const upsertTasksIntoLoadedDashboardScope = useCallback(
    (targetScope: DashboardScope, nextTasks: readonly TaskRecord[]) => {
      if (!dashboardStateByScopeRef.current[targetScope].loaded) {
        return;
      }

      upsertTasksIntoDashboardScope(targetScope, nextTasks);
    },
    [upsertTasksIntoDashboardScope],
  );
  const setDashboardScopeFiles = useCallback(
    (targetScope: DashboardScope, updater: (previous: FileRecord[]) => FileRecord[]) => {
      setDashboardFiles(targetScope, (previous) => updater(previous));
    },
    [setDashboardFiles],
  );
  const removeFileIdsFromDashboardScope = useCallback(
    (targetScope: DashboardScope, fileIds: Iterable<string>) => {
      const fileIdSet = new Set(fileIds);
      if (fileIdSet.size === 0) {
        return;
      }

      setDashboardScopeFiles(targetScope, (previous) => previous.filter((file) => !fileIdSet.has(file.id)));
    },
    [setDashboardScopeFiles],
  );
  const upsertFilesIntoDashboardScope = useCallback(
    (targetScope: DashboardScope, nextFiles: readonly FileRecord[]) => {
      if (nextFiles.length === 0) {
        return;
      }

      setDashboardScopeFiles(targetScope, (previous) => {
        const nextById = new Map(nextFiles.map((file) => [file.id, file]));
        const next = previous.map((file) => nextById.get(file.id) ?? file);
        const existingIds = new Set(previous.map((file) => file.id));
        for (const file of nextFiles) {
          if (!existingIds.has(file.id)) {
            next.push(file);
          }
        }
        return next;
      });
    },
    [setDashboardScopeFiles],
  );

  useEffect(() => {
    if (mode !== "daily" || !dailyMutationJournalReady || dailyMutationOperations.length === 0) {
      return;
    }

    if (dashboardStateByScope.active.loaded) {
      setDashboardScopeTasks("active", (previous) => {
        const next = mergeDailyMutationOperationsIntoActiveTasks(previous, dailyMutationOperations);
        return areTaskCollectionsEquivalent(previous, next) ? previous : next;
      });
    }

    if (dashboardStateByScope.trash.loaded) {
      setDashboardScopeTasks("trash", (previous) => {
        const next = mergeDailyMutationOperationsIntoTrashTasks(previous, dailyMutationOperations);
        return areTaskCollectionsEquivalent(previous, next) ? previous : next;
      });
    }
  }, [
    dailyMutationJournalReady,
    dailyMutationOperations,
    dashboardStateByScope.active.loaded,
    dashboardStateByScope.active.tasks,
    dashboardStateByScope.trash.loaded,
    dashboardStateByScope.trash.tasks,
    mode,
    setDashboardScopeTasks,
  ]);

  const flushDailyMutationJournal = useCallback(
    async (options: { manual?: boolean } = {}) => {
      const scope = dailyMutationScopeRef.current;
      if (!scope || dailyMutationFlushRunningRef.current || (!canEditWorkspace && !canReorderDailyTasks)) {
        return;
      }

      dailyMutationFlushRunningRef.current = true;
      try {
        const now = Date.now();
        const operations = await refreshDailyMutationJournal();
        dailyMutationOperationsRef.current = operations;

        for (const operation of operations) {
          if (operation.status === "synced" || operation.status === "syncing") {
            continue;
          }

          if (operation.status === "failed" && !options.manual) {
            if (
              operation.payload.kind === "reorder" &&
              (!operation.nextRetryAt || Date.parse(operation.nextRetryAt) <= now)
            ) {
              await settleDailyFailedReorderIfServerSatisfiedRef.current(operation, now);
            }
            continue;
          }

          if (!options.manual && operation.nextRetryAt && Date.parse(operation.nextRetryAt) > now) {
            continue;
          }

          if (operation.payload.kind === "reorder") {
            if (!canReorderDailyTasks) {
              continue;
            }
          } else if (!canEditWorkspace) {
            continue;
          }

          await updateDailyMutationOperation(operation.operationId, (current) => ({
            ...current,
            status: "syncing",
            updatedAt: new Date().toISOString(),
            lastAttemptedAt: new Date().toISOString(),
            lastError: null,
            lastHttpStatus: null,
            lastErrorCode: null,
            failureKind: null,
          }));
          await refreshDailyMutationJournal();

          try {
            await flushDailyMutationOperationRef.current(operation);
          } catch (error) {
            const errorInfo = readDailyMutationFlushErrorInfo(error);
            const failure = classifyDailyMutationFlushFailure(operation, errorInfo);
            const retryCount = operation.retryCount + 1;
            const shouldRetry = failure.retryable && shouldContinueRetryingDailyMutation(retryCount);
            const nextRetryAt = shouldRetry ? new Date(Date.now() + computeDailyMutationRetryDelayMs(retryCount)).toISOString() : null;
            await updateDailyMutationOperation(operation.operationId, (current) => ({
              ...current,
              status: shouldRetry ? "pending" : "failed",
              retryCount,
              nextRetryAt,
              updatedAt: new Date().toISOString(),
              lastAttemptedAt: new Date().toISOString(),
              lastHttpStatus: errorInfo.status,
              lastErrorCode: errorInfo.code,
              failureKind: failure.kind,
              lastError: error instanceof Error ? error.message : localizeError({ fallbackKey: "updateTaskFailed" }),
            }));
            if (dailyMutationScopeRef.current) {
              publishDailyRowSyncOperationEvent(dailyMutationScopeRef.current, "task-failed", operation);
            }
          }
        }
      } finally {
        dailyMutationFlushRunningRef.current = false;
        await refreshDailyMutationJournal();
      }
    },
    [canEditWorkspace, canReorderDailyTasks, refreshDailyMutationJournal],
  );

  useEffect(() => {
    if (!dailyMutationScope || mode !== "daily") {
      return;
    }

    const flushSoon = () => {
      if (Date.now() < dailyMutationRemoteRefreshSuppressFlushUntilRef.current) {
        return;
      }

      if (dailyMutationFlushTimerRef.current !== null) {
        return;
      }

      dailyMutationFlushTimerRef.current = window.setTimeout(() => {
        dailyMutationFlushTimerRef.current = null;
        void flushDailyMutationJournal();
      }, 500);
    };

    const handleOnline = () => flushSoon();
    const handleFocus = () => flushSoon();
    window.addEventListener("online", handleOnline);
    window.addEventListener("focus", handleFocus);
    const intervalId = window.setInterval(() => {
      void flushDailyMutationJournal();
    }, 10_000);

    flushSoon();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
      if (dailyMutationFlushTimerRef.current !== null) {
        window.clearTimeout(dailyMutationFlushTimerRef.current);
        dailyMutationFlushTimerRef.current = null;
      }
    };
  }, [dailyMutationScope, flushDailyMutationJournal, mode]);

  useEffect(() => {
    if (!dailyMutationScope || dailyMutationSummary.totalActive === 0) {
      return;
    }

    if (Date.now() < dailyMutationRemoteRefreshSuppressFlushUntilRef.current) {
      return;
    }

    if (dailyMutationFlushTimerRef.current !== null) {
      return;
    }

    dailyMutationFlushTimerRef.current = window.setTimeout(() => {
      dailyMutationFlushTimerRef.current = null;
      void flushDailyMutationJournal();
    }, 500);
  }, [dailyMutationScope, dailyMutationSummary.totalActive, flushDailyMutationJournal]);

  const fetchDailySyncTasks = useCallback(async (syncScope: DashboardScope) => {
    const taskParams = new URLSearchParams();
    if (syncScope === "trash") {
      taskParams.set("scope", "trash");
    } else {
      taskParams.set("orderScope", "daily");
    }
    const response = await fetchDailyMutationRequest(`/api/tasks?${taskParams.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw await readApiError(response, "loadTasksFailed");
    }

    const json = (await response.json()) as { data: TaskRecord[] };
    return json.data.map(withEmptyTaskFileSummary);
  }, []);

  const refreshDailyServerTaskStateForSync = useCallback(
    async (options: { includeTrash?: boolean } = {}) => {
      const [activeTasks, trashTasks] = await Promise.all([
        fetchDailySyncTasks("active"),
        options.includeTrash ? fetchDailySyncTasks("trash") : Promise.resolve(dashboardStateByScopeRef.current.trash.tasks),
      ]);
      const operations = dailyMutationOperationsRef.current;
      setDashboardScopeTasks("active", () => mergeDailyMutationOperationsIntoActiveTasks(activeTasks, operations));
      if (options.includeTrash) {
        setDashboardScopeTasks("trash", () => mergeDailyMutationOperationsIntoTrashTasks(trashTasks, operations));
      }
      return { activeTasks, trashTasks };
    },
    [fetchDailySyncTasks, setDashboardScopeTasks],
  );

  useEffect(() => {
    if (!dailyMutationScope || mode !== "daily") {
      return;
    }

    return subscribeDailyRowSyncEvents(dailyMutationScope, (event) => {
      dailyMutationRemoteRefreshSuppressFlushUntilRef.current = Date.now() + 1_500;
      if (event.task && event.task.projectId === dailyMutationScope.projectId && !event.task.deletedAt && !event.task.purgedAt) {
        const syncedTask = withEmptyTaskFileSummary(event.task);
        setDashboardScopeTasks("active", (previous) => {
          const existingIndex = previous.findIndex((task) => task.id === syncedTask.id);
          if (existingIndex < 0) {
            return mergeDailyMutationOperationsIntoActiveTasks([...previous, syncedTask], dailyMutationOperationsRef.current);
          }

          const next = previous.slice();
          next[existingIndex] = syncedTask;
          return mergeDailyMutationOperationsIntoActiveTasks(next, dailyMutationOperationsRef.current);
        });
      }
      void (async () => {
        await refreshDailyMutationJournal();
        await refreshDailyServerTaskStateForSync({
          includeTrash: event.operationType === "delete" || event.operationType === "trash",
        });
      })();
    });
  }, [dailyMutationScope, mode, refreshDailyMutationJournal, refreshDailyServerTaskStateForSync, setDashboardScopeTasks]);

  useEffect(() => {
    if (isPreview || mode !== "daily" || !currentProjectId || !hasSupabaseClientConfig()) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`project:${currentProjectId}:tasks`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${currentProjectId}` },
        () => {
          void (async () => {
            await refreshDailyMutationJournal();
            await refreshDailyServerTaskStateForSync({ includeTrash: true });
          })();
        },
      );

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [currentProjectId, isPreview, mode, refreshDailyMutationJournal, refreshDailyServerTaskStateForSync]);

  async function settleDailyFailedReorderIfServerSatisfied(operation: DailyMutationOperation, now: number) {
    const nextRetryAt = new Date(now + DAILY_REORDER_FAILED_SETTLEMENT_CHECK_MS).toISOString();
    try {
      const latestState = await refreshDailyServerTaskStateForSync();
      if (isDailyReorderMutationSatisfiedByServerState(operation, latestState.activeTasks)) {
        removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
        await markDailyMutationSynced(operation);
        return true;
      }

      await updateDailyMutationOperation(operation.operationId, (current) =>
        current.status === "failed"
          ? {
              ...current,
              nextRetryAt,
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
      return false;
    } catch (error) {
      const errorInfo = readDailyMutationFlushErrorInfo(error);
      await updateDailyMutationOperation(operation.operationId, (current) =>
        current.status === "failed"
          ? {
              ...current,
              nextRetryAt,
              updatedAt: new Date().toISOString(),
              lastAttemptedAt: new Date().toISOString(),
              lastHttpStatus: errorInfo.status,
              lastErrorCode: errorInfo.code,
              failureKind: "network_or_database",
              lastError: error instanceof Error ? error.message : localizeError({ fallbackKey: "updateTaskFailed" }),
            }
          : current,
      );
      return false;
    }
  }

  settleDailyFailedReorderIfServerSatisfiedRef.current = settleDailyFailedReorderIfServerSatisfied;

  const discardFailedDailyMutations = useCallback(async () => {
    const failedOperations = dailyMutationOperationsRef.current.filter((operation) => operation.status === "failed");
    if (failedOperations.length === 0) {
      return;
    }

    await Promise.all(failedOperations.map((operation) => deleteDailyMutationOperation(operation.operationId)));
    await refreshDailyMutationJournal();
    await refreshDailyServerTaskStateForSync({ includeTrash: true });
  }, [refreshDailyMutationJournal, refreshDailyServerTaskStateForSync]);

  function resetSelectedTaskDraft() {
    if (!selectedTask) return;
    resetDraftDirtyFields();
    setDraft(toDraftTask(selectedTask));
    setParentTaskNumberDraft(selectedParentTask ? formatTaskDisplayId(selectedParentTask) : "");
  }

  async function flushDailyMutationOperation(operation: DailyMutationOperation) {
    const payload = operation.payload;

    if (payload.kind === "create") {
      const existingServerTask = dashboardStateByScopeRef.current.active.tasks.find((task) => task.id === operation.clientMutationId);
      if (existingServerTask) {
        setDashboardScopeTasks("active", (previous) =>
          reconcileDailyMutationCreateSuccess(previous, payload.tempTask.id, withEmptyTaskFileSummary(existingServerTask)),
        );
        await markDailyMutationSynced(operation, { serverTaskId: existingServerTask.id });
        return;
      }

      const response = await fetchDailyMutationRequest("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload.requestPayload,
          clientMutationId: operation.clientMutationId,
        }),
      });

      if (!response.ok) {
        throw await readApiError(response, "createTaskFailed");
      }

      const json = (await response.json()) as { data: TaskRecord };
      const taskWithFileSummary = withEmptyTaskFileSummary(json.data);
      setDashboardScopeTasks("active", (previous) =>
        reconcileDailyMutationCreateSuccess(previous, payload.tempTask.id, taskWithFileSummary),
      );
      if (dailyMutationScopeRef.current) {
        publishDailyRowSyncOperationEvent(dailyMutationScopeRef.current, "task-created", {
          ...operation,
          serverTaskId: json.data.id,
        });
      }
      if (taskListRowInteractionStore.getState().selectedTaskId === payload.tempTask.id) {
        setTaskListSelection(json.data.id);
      }
      await markDailyMutationSynced(operation, { serverTaskId: json.data.id });
      return;
    }

    if (payload.kind === "update") {
      const taskId = resolveDailyMutationServerTaskId(payload.taskId);
      if (isOptimisticTaskId(taskId)) {
        await markDailyMutationPending(operation);
        return;
      }

      const currentTask =
        dashboardStateByScopeRef.current.active.tasks.find((task) => task.id === taskId) ??
        dashboardStateByScopeRef.current.trash.tasks.find((task) => task.id === taskId);
      const version = currentTask?.version ?? payload.baseVersion;
      const buildUpdateRequest = (nextVersion: number) =>
        fetchDailyMutationRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload.patch, version: nextVersion }),
        });
      let response = await buildUpdateRequest(version);

      if (!response.ok && response.status === 409) {
        const latestState = await refreshDailyServerTaskStateForSync({ includeTrash: true });
        const latestTask = [...latestState.activeTasks, ...latestState.trashTasks].find((task) => task.id === taskId);
        if (latestTask) {
          await updateDailyMutationOperation(operation.operationId, (current) =>
            rebaseDailyUpdateMutationOperation(current, latestTask),
          );
          response = await buildUpdateRequest(latestTask.version);
        }
      }

      if (!response.ok) {
        throw await readApiError(response, "updateTaskFailed");
      }

      const json = (await response.json()) as { data: TaskRecord };
      clearTaskPendingPatchValues(taskId, payload.patch);
      applyTaskServerUpdate(applyTaskPendingPatchValues(json.data), Object.keys(payload.patch) as DraftDirtyField[]);
      await markDailyMutationSynced(operation);
      return;
    }

    if (payload.kind === "trash") {
      const taskId = resolveDailyMutationServerTaskId(payload.taskId);
      if (isOptimisticTaskId(taskId)) {
        await deleteDailyMutationOperation(operation.operationId);
        await refreshDailyMutationJournal();
        return;
      }

      const response = await fetchDailyMutationRequest(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
      if (!response.ok) {
        const error = await readApiError(response, "moveTaskToTrashFailed");
        if (error.status === 404) {
          const latestState = await refreshDailyServerTaskStateForSync({ includeTrash: true });
          if (shouldMarkDailyTrashMutationSyncedFromServerState(operation, latestState.activeTasks, latestState.trashTasks)) {
            await markDailyMutationSynced(operation);
            return;
          }
        }
        throw error;
      }

      const json = (await response.json()) as { data?: TaskSubtreeMutationPayload | TaskRecord };
      const affectedTasks = readTaskSubtreeMutationTasks(json.data);
      const affectedTaskIds = new Set((affectedTasks.length > 0 ? affectedTasks : payload.affectedTasks).map((task) => task.id));
      removeTaskIdsFromDashboardScope("active", affectedTaskIds);
      upsertTasksIntoLoadedDashboardScope("trash", affectedTasks);
      await markDailyMutationSynced(operation);
      return;
    }

    if (payload.kind === "delete") {
      const taskId = resolveDailyMutationServerTaskId(payload.taskId);
      const response = await fetchDailyMutationRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
      if (!response.ok) {
        const error = await readApiError(response, "deleteTaskFailed");
        if (error.status === 404) {
          const latestState = await refreshDailyServerTaskStateForSync({ includeTrash: true });
          if (shouldMarkDailyDeleteMutationSyncedFromServerState(operation, latestState.activeTasks, latestState.trashTasks)) {
            await markDailyMutationSynced(operation);
            return;
          }
        }
        throw error;
      }

      const json = (await response.json().catch(() => null)) as { data?: PermanentTaskDeletePayload } | null;
      const deletedTaskIds = new Set(json?.data?.deletedTaskIds?.length ? json.data.deletedTaskIds : [taskId]);
      removeTaskIdsFromDashboardScope("trash", deletedTaskIds);
      removeFileIdsFromDashboardScope("trash", json?.data?.deletedFileIds ?? payload.affectedFileIds);
      upsertTasksIntoLoadedDashboardScope("trash", json?.data?.updatedTasks ?? []);
      await markDailyMutationSynced(operation);
      return;
    }

    if (payload.kind === "reorder") {
      let currentTasks = dashboardStateByScopeRef.current.active.tasks;
      const buildReorderRequest = (tasksForVersions: readonly TaskRecord[], reorderOperation: DailyMutationOperation) => {
        if (reorderOperation.payload.kind !== "reorder") {
          throw new Error("Daily reorder operation payload changed before sync.");
        }

        const command = withTaskReorderExpectedVersions(reorderOperation.payload.command as TaskReorderPersistCommand, tasksForVersions);
        return fetchDailyMutationRequest("/api/tasks/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildTaskReorderRequestBody(command, tasksForVersions, taskReorderOrderScope)),
        });
      };

      if (operation.status === "failed" || operation.retryCount > 0) {
        const latestState = await refreshDailyServerTaskStateForSync();
        currentTasks = latestState.activeTasks;
        if (isDailyReorderMutationSatisfiedByServerState(operation, currentTasks)) {
          removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
          await markDailyMutationSynced(operation);
          return;
        }
      }

      let response = await buildReorderRequest(currentTasks, operation);

      if (!response.ok && response.status === 409) {
        const latestState = await refreshDailyServerTaskStateForSync();
        currentTasks = latestState.activeTasks;
        if (isDailyReorderMutationSatisfiedByServerState(operation, currentTasks)) {
          removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
          await markDailyMutationSynced(operation);
          return;
        }

        const rebasedOperation = rebaseDailyReorderMutationOperation(operation, currentTasks);
        await updateDailyMutationOperation(operation.operationId, () => rebasedOperation);
        response = await buildReorderRequest(currentTasks, rebasedOperation);
      }

      if (!response.ok) {
        throw await readApiError(response, "updateTaskFailed");
      }

      const json = (await response.json()) as { data: TaskRecord[] };
      setActiveTasksForContinuousReorder((current) =>
        mergeTaskReorderServerAcknowledgement(current, json.data, { preserveLocalOrderFields: false }),
      );
      removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
      await markDailyMutationSynced(operation);
    }
  }

  flushDailyMutationOperationRef.current = flushDailyMutationOperation;

  async function markDailyMutationSynced(
    operation: DailyMutationOperation,
    values: { serverTaskId?: string | null } = {},
  ) {
    await updateDailyMutationOperation(operation.operationId, (current) => ({
      ...current,
      status: "synced",
      serverTaskId: values.serverTaskId ?? current.serverTaskId,
      updatedAt: new Date().toISOString(),
      lastError: null,
      lastHttpStatus: null,
      lastErrorCode: null,
      failureKind: null,
      lastAttemptedAt: current.lastAttemptedAt,
      nextRetryAt: null,
    }));
    await refreshDailyMutationJournal();
    if (dailyMutationScopeRef.current) {
      publishDailyRowSyncOperationEvent(dailyMutationScopeRef.current, "task-synced", {
        ...operation,
        serverTaskId: values.serverTaskId ?? operation.serverTaskId,
      });
    }
  }

  async function markDailyMutationPending(operation: DailyMutationOperation) {
    await updateDailyMutationOperation(operation.operationId, (current) => ({
      ...current,
      status: "pending",
      updatedAt: new Date().toISOString(),
      lastHttpStatus: null,
      lastErrorCode: null,
      failureKind: null,
      nextRetryAt: new Date(Date.now() + computeDailyMutationRetryDelayMs(current.retryCount)).toISOString(),
    }));
    await refreshDailyMutationJournal();
  }

  function resolveDailyMutationServerTaskId(taskId: string) {
    if (!isOptimisticTaskId(taskId)) {
      return taskId;
    }

    return (
      dailyMutationOperationsRef.current.find((operation) => operation.tempTaskId === taskId && operation.serverTaskId)
        ?.serverTaskId ?? taskId
    );
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
    const tempTask = buildOptimisticTask({
      form: payload,
      projectId: currentProjectId,
      previousTasks: dashboardStateByScopeRef.current.active.tasks,
      clientMutationId: dailyMutationScope ? createDailyMutationId() : undefined,
    });
    const { ownerDiscipline: _ignoredOwnerDiscipline, ...baseRequestPayload } = payload;
    const requestPayload = {
      ...baseRequestPayload,
      siblingOrder: tempTask.siblingOrder,
    };

    if (dailyMutationScope) {
      const clientMutationId = getDailyCreateClientMutationIdFromTempTaskId(tempTask.id);
      try {
        await putDailyJournalOperation(
          buildDailyMutationOperation({
            scope: dailyMutationScope,
            type: "create",
            clientMutationId,
            tempTaskId: tempTask.id,
            payload: {
              kind: "create",
              tempTask,
              requestPayload,
            },
          }),
        );
      } catch (error) {
        setErrorMessage(formatMutationNetworkError(error, "createTaskFailed"));
        return false;
      }

      setTasks((previous) => [...previous, tempTask]);
      setTaskListSelection(tempTask.id);
      publishDailyRowSyncEvent(dailyMutationScope, {
        name: "task-created",
        operationType: "create",
        taskId: tempTask.id,
        tempTaskId: tempTask.id,
        clientMutationId,
      });
      void flushDailyMutationJournal();

      if (canCollapseCreateForm) {
        setIsCreateFormOpen(false);
      }
      return true;
    }

    setTasks((previous) => [...previous, tempTask]);
    setTaskListSelection(tempTask.id);

    void (async () => {
      try {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestPayload),
        });

        if (!response.ok) {
          removeTaskIdsFromDashboardScope("active", [tempTask.id]);
          setErrorMessage(await readErrorMessage(response, "createTaskFailed"));
          return;
        }

        const json = (await response.json()) as { data: TaskRecord };
        setTasks((previous) => {
          const taskWithFileSummary = withEmptyTaskFileSummary(json.data);
          const tempIndex = previous.findIndex((task) => task.id === tempTask.id);
          if (tempIndex >= 0) {
            const next = [...previous];
            next[tempIndex] = taskWithFileSummary;
            return next;
          }

          const existingIndex = previous.findIndex((task) => task.id === taskWithFileSummary.id);
          if (existingIndex >= 0) {
            const next = [...previous];
            next[existingIndex] = taskWithFileSummary;
            return next;
          }

          return [taskWithFileSummary, ...previous];
        });
        setTaskListSelection(json.data.id);
      } catch (error) {
        removeTaskIdsFromDashboardScope("active", [tempTask.id]);
        setErrorMessage(formatMutationNetworkError(error, "createTaskFailed"));
      }
    })();

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

    const previousTaskBeforeSave = selectedTaskRef.current?.id === currentDraft.id ? selectedTaskRef.current : null;
    let shouldRollbackSave = Boolean(previousTaskBeforeSave);

    try {
      const payload = buildTaskPatchPayloadFromDraft(currentDraft, draftDirtyFieldsRef.current, parentTaskNumberDraftRef.current);
      const optimisticPayload = buildOptimisticTaskPatchPayload(payload);
      if (previousTaskBeforeSave && Object.keys(optimisticPayload).length > 0) {
        applyTaskClientUpdate(
          withEmptyTaskFileSummary({ ...previousTaskBeforeSave, ...optimisticPayload }),
          dirtyFields.filter((field) => field !== "parentTaskNumber"),
        );
      }

      const response = await fetch(`/api/tasks/${encodeURIComponent(currentDraft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "saveTaskFailed");
        if (response.status === 409) {
          shouldRollbackSave = false;
          await refreshScope({ force: true });
        } else if (previousTaskBeforeSave) {
          shouldRollbackSave = false;
          applyTaskClientUpdate(previousTaskBeforeSave);
        }
        throw new Error(message);
      }

      const json = (await response.json()) as { data: TaskRecord };
      applyTaskServerUpdate(json.data, dirtyFields);
      return true;
    } catch (error) {
      if (previousTaskBeforeSave && shouldRollbackSave) {
        applyTaskClientUpdate(previousTaskBeforeSave);
      }
      setErrorMessage(formatMutationNetworkError(error, "saveTaskFailed"));
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

  const stageSelectedTaskDraftForContinuousAction = useCallback(() => {
    const currentDraft = draftRef.current;
    const currentTask = selectedTaskRef.current;
    if (!currentDraft || !currentTask || currentDraft.id !== currentTask.id) {
      return false;
    }

    const dirtyFields = getDirtyDraftFields(draftDirtyFieldsRef.current);
    if (dirtyFields.length === 0) {
      return false;
    }

    const payload = buildTaskPatchPayloadFromDraft(currentDraft, draftDirtyFieldsRef.current, parentTaskNumberDraftRef.current);
    const optimisticPayload = buildOptimisticTaskPatchPayload(payload);
    if (Object.keys(optimisticPayload).length > 0) {
      taskPendingPatchValuesRef.current[currentTask.id] = mergePendingTaskPatchValues(
        taskPendingPatchValuesRef.current[currentTask.id],
        optimisticPayload,
      );
      applyTaskClientUpdate(
        withEmptyTaskFileSummary({ ...currentTask, ...optimisticPayload }),
        dirtyFields.filter((field) => field !== "parentTaskNumber"),
      );
    }

    const queueTaskPatch = queueTaskPatchRef.current;
    if (!queueTaskPatch) {
      void saveSelectedTaskRef.current();
      return true;
    }

    void queueTaskPatch(currentTask, payload as Partial<TaskRecord>, {
      clearedDirtyFields: dirtyFields,
      fallbackKey: "saveTaskFailed",
    }).catch((error: unknown) => {
      setErrorMessage(formatMutationNetworkError(error, "saveTaskFailed"));
    });
    return true;
  }, [applyTaskClientUpdate, setErrorMessage]);

  const clearTaskReorderStorageRetry = useCallback(() => {
    taskReorderRetryAttemptRef.current = 0;
    if (taskReorderRetryTimerRef.current === null) {
      return;
    }

    window.clearTimeout(taskReorderRetryTimerRef.current);
    taskReorderRetryTimerRef.current = null;
  }, []);

  const scheduleTaskReorderStorageRetry = useCallback(() => {
    if (typeof window === "undefined" || taskReorderRetryTimerRef.current !== null) {
      return;
    }

    const attempt = taskReorderRetryAttemptRef.current;
    if (attempt >= TASK_REORDER_RETRY_MAX_ATTEMPTS) {
      return;
    }

    taskReorderRetryAttemptRef.current = attempt + 1;
    const delayMs = Math.min(
      TASK_REORDER_RETRY_MAX_DELAY_MS,
      TASK_REORDER_RETRY_BASE_DELAY_MS * 2 ** Math.min(attempt, 5),
    );
    taskReorderRetryTimerRef.current = window.setTimeout(() => {
      taskReorderRetryTimerRef.current = null;
      taskReorderStorageReplayAttemptSignatureRef.current = null;
      setTaskReorderRetryTick((value) => value + 1);
    }, delayMs);
  }, []);

  useEffect(() => () => clearTaskReorderStorageRetry(), [clearTaskReorderStorageRetry]);

  const flushTaskReorderQueue = useCallback(() => {
    const queueState = taskReorderQueueRef.current;
    if (queueState.isRunning) {
      return;
    }

    queueState.isRunning = true;
    setIsReorderingTasks(true);

    void (async () => {
      try {
        while (queueState.entries.length > 0) {
          const entry = queueState.entries.shift();
          if (!entry) {
            continue;
          }

          let baseTasks = dashboardStateByScopeRef.current.active.tasks;
          let response = await fetchDailyMutationRequest("/api/tasks/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              buildTaskReorderRequestBody(
                withTaskReorderExpectedVersions(entry.command, baseTasks),
                baseTasks,
                taskReorderOrderScope,
              ),
            ),
          });

          if (!response.ok && response.status === 409) {
            const latestState = await refreshDailyServerTaskStateForSync();
            baseTasks = latestState.activeTasks;
            const latestOptimisticTasks = applyStoredTaskReorderCommand(baseTasks, entry.command);
            if (areTaskSiblingOrdersEqual(baseTasks, latestOptimisticTasks)) {
              continue;
            }

            const rebasedCommand = withTaskReorderExpectedVersions(entry.command, baseTasks);
            writePendingTaskReorderToStorage(taskReorderStorageKeyRef.current, rebasedCommand);
            setActiveTasksForContinuousReorder(() => latestOptimisticTasks);
            response = await fetchDailyMutationRequest("/api/tasks/reorder", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(buildTaskReorderRequestBody(rebasedCommand, baseTasks, taskReorderOrderScope)),
            });
          }

          if (!response.ok) {
            queueState.entries = [];
            const shouldRetainPendingOrder = response.status === 409 || shouldRetainPendingTaskReorderAfterFailure(response.status);
            if (!shouldRetainPendingOrder) {
              setErrorMessage(await readErrorMessage(response, "updateTaskFailed"));
              removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
              taskReorderUnloadPersistCommandRef.current = null;
              taskReorderUnloadPersistAttemptedRef.current = false;
              taskReorderStorageReplayAttemptSignatureRef.current = null;
              clearTaskReorderStorageRetry();
            } else {
              scheduleTaskReorderStorageRetry();
            }
            if (!shouldRetainPendingOrder) {
              setActiveTasksForContinuousReorder((currentTasks) =>
                restoreTaskReorderSnapshot(currentTasks, entry.previousTasks, entry.command),
              );
            }
            return;
          }

          const json = (await response.json()) as { data: TaskRecord[] };
          const hasNewerOptimisticOrder = queueState.entries.length > 0 || queueState.latestRequestId > entry.requestId;
          setActiveTasksForContinuousReorder((currentTasks) =>
            mergeTaskReorderServerAcknowledgement(currentTasks, json.data, {
              preserveLocalOrderFields: hasNewerOptimisticOrder,
            }).map((task) => withEmptyTaskFileSummary(applyPendingTaskPatchValues(task, taskPendingPatchValuesRef.current))),
          );
        }
        removePendingTaskReorderFromStorage(taskReorderStorageKeyRef.current);
        taskReorderUnloadPersistCommandRef.current = null;
        taskReorderUnloadPersistAttemptedRef.current = false;
        taskReorderStorageReplayAttemptSignatureRef.current = null;
        clearTaskReorderStorageRetry();
      } catch (error) {
        queueState.entries = [];
        scheduleTaskReorderStorageRetry();
        setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
      } finally {
        queueState.isRunning = false;
        if (queueState.entries.length > 0) {
          flushTaskReorderQueue();
          return;
        }
        setIsReorderingTasks(false);
      }
    })();
  }, [
    clearTaskReorderStorageRetry,
    refreshDailyServerTaskStateForSync,
    scheduleTaskReorderStorageRetry,
    setActiveTasksForContinuousReorder,
    setErrorMessage,
    taskReorderOrderScope,
  ]);

  useEffect(() => {
    if (mode !== "daily" || !canReorderDailyTasks || !taskReorderStorageKey || !dashboardStateByScope.active.loaded) {
      return;
    }

    if (dailyMutationScope && !dailyMutationJournalReady) {
      return;
    }

    const pendingReorder = readPendingTaskReorderFromStorage(taskReorderStorageKey);
    if (!pendingReorder) {
      return;
    }

    const commandSignature = getTaskReorderCommandSignature(pendingReorder.command);
    const previousTasks = localFirstActiveTasksRef.current.length
      ? localFirstActiveTasksRef.current
      : dashboardStateByScopeRef.current.active.tasks;
    const optimisticTasks = applyStoredTaskReorderCommand(previousTasks, pendingReorder.command);
    if (!areTaskSiblingOrdersEqual(previousTasks, optimisticTasks)) {
      setActiveTasksForContinuousReorder(() => optimisticTasks);
    }

    const queueState = taskReorderQueueRef.current;
    const hasQueuedCommand = queueState.entries.some(
      (entry) => getTaskReorderCommandSignature(entry.command) === commandSignature,
    );
    if (queueState.isRunning || hasQueuedCommand || taskReorderStorageReplayAttemptSignatureRef.current === commandSignature) {
      return;
    }

    taskReorderStorageReplayAttemptSignatureRef.current = commandSignature;
    taskReorderUnloadPersistCommandRef.current = pendingReorder.command;
    taskReorderUnloadPersistAttemptedRef.current = false;

    const hasActiveDailyReorderJournal = dailyMutationOperations.some(
      (operation) => operation.payload.kind === "reorder" && operation.status !== "synced",
    );
    if (dailyMutationScope && hasActiveDailyReorderJournal) {
      void flushDailyMutationJournal();
      return;
    }

    const requestId = queueState.latestRequestId + 1;
    queueState.latestRequestId = requestId;
    queueState.entries.push({
      command: pendingReorder.command,
      nextMode: "manual",
      previousTasks,
      requestId,
    });
    flushTaskReorderQueue();
  }, [
    dashboardStateByScope.active.loaded,
    dailyMutationJournalReady,
    dailyMutationOperations,
    dailyMutationScope,
    flushDailyMutationJournal,
    flushTaskReorderQueue,
    canReorderDailyTasks,
    mode,
    setActiveTasksForContinuousReorder,
    taskReorderStorageKey,
    taskReorderRetryTick,
    tasks,
  ]);

  const reorderDailyTasks = useCallback(
    async (
      command: TaskReorderClientCommand,
      nextMode: DailyTaskSortMode,
    ) => {
      if (!canReorderDailyTasks) {
        setErrorMessage(t("errors.workspaceReadOnly"));
        return false;
      }

      if (canEditWorkspace) {
        stageSelectedTaskDraftForContinuousAction();
      }

      setErrorMessage(null);

      const previousTasks = localFirstActiveTasksRef.current.length
        ? localFirstActiveTasksRef.current
        : dashboardStateByScopeRef.current.active.tasks;
      const optimisticTasks = buildOptimisticReorderedTasks(previousTasks, command);
      taskReorderRetryAttemptRef.current = 0;
      setActiveTasksForContinuousReorder(() => optimisticTasks);
      startTransition(() => {
        setTaskSortMode(nextMode);
      });
      if (command.action === "manual_move") {
        setTaskListSelection(command.movedTaskId);
      }

      const queueState = taskReorderQueueRef.current;
      const requestId = queueState.latestRequestId + 1;
      queueState.latestRequestId = requestId;
      const persistCommand = buildTaskReorderPersistCommand(command, previousTasks, optimisticTasks);
      taskReorderUnloadPersistCommandRef.current = persistCommand;
      taskReorderUnloadPersistAttemptedRef.current = false;
      writePendingTaskReorderToStorage(
        taskReorderStorageKeyRef.current,
        withTaskReorderExpectedVersions(persistCommand, previousTasks),
      );
      let journalQueued = false;
      if (dailyMutationScope) {
        try {
          await putDailyJournalOperation(
            buildCoalescedDailyReorderOperation({
              scope: dailyMutationScope,
              command: persistCommand,
              desiredTasks: optimisticTasks,
            }),
          );
          journalQueued = true;
          void flushDailyMutationJournal();
        } catch (error) {
          setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
        }
      }
      setIsTaskOrderMenuOpen(false);
      taskDragStateRef.current = null;
      setTaskDropState(null);
      if (journalQueued) {
        return true;
      }

      queueState.entries.push({
        command: persistCommand,
        nextMode,
        previousTasks,
        requestId,
      });
      flushTaskReorderQueue();
      return true;
    },
    [
      flushDailyMutationJournal,
      flushTaskReorderQueue,
      canEditWorkspace,
      canReorderDailyTasks,
      dailyMutationScope,
      putDailyJournalOperation,
      setActiveTasksForContinuousReorder,
      setErrorMessage,
      setTaskDropState,
      setTaskListSelection,
      stageSelectedTaskDraftForContinuousAction,
    ],
  );

  const moveTaskByOffset = useCallback(
    async (taskId: string, offset: -1 | 1) => {
      if (isDailyManualReorderDisabled || isOptimisticTaskId(taskId)) {
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
      if (isDailyHtmlDragReorderDisabled || isMobileViewport || isOptimisticTaskId(task.id)) {
        event.preventDefault();
        return;
      }

      const nextDragState = { taskId: task.id, parentTaskId: task.parentTaskId ?? null };
      taskDragStateRef.current = nextDragState;
      setTaskDropState(null);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    },
    [isDailyHtmlDragReorderDisabled, isMobileViewport, setTaskDropState],
  );

  const handleTaskRowDragOver = useCallback(
    (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => {
      const currentDragState = taskDragStateRef.current;
      if (
        !currentDragState ||
        currentDragState.taskId === task.id ||
        isOptimisticTaskId(currentDragState.taskId) ||
        isOptimisticTaskId(task.id)
      ) {
        return;
      }

      const targetParentTaskId = task.parentTaskId ?? null;
      if (currentDragState.parentTaskId !== targetParentTaskId) {
        return;
      }

      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position: TaskDropPosition = event.clientY - bounds.top < bounds.height / 2 ? "before" : "after";
      setTaskDropState({ taskId: task.id, position });
    },
    [setTaskDropState],
  );

  const handleTaskRowDrop = useCallback(
    async (task: TaskRecord, event: ReactDragEvent<HTMLElement>) => {
      const currentDragState = taskDragStateRef.current;
      if (!currentDragState || isOptimisticTaskId(currentDragState.taskId) || isOptimisticTaskId(task.id)) {
        return;
      }

      const targetParentTaskId = task.parentTaskId ?? null;
      if (currentDragState.parentTaskId !== targetParentTaskId) {
        return;
      }

      event.preventDefault();
      const bounds = event.currentTarget.getBoundingClientRect();
      const position: TaskDropPosition = event.clientY - bounds.top < bounds.height / 2 ? "before" : "after";
      const siblingIds = dailyTreeRows
        .filter((row) => (row.task.parentTaskId ?? null) === targetParentTaskId)
        .map((row) => row.task.id)
        .filter((taskId) => taskId !== currentDragState.taskId);
      const targetIndexBase = siblingIds.indexOf(task.id);

      if (targetIndexBase < 0) {
        taskDragStateRef.current = null;
        setTaskDropState(null);
        return;
      }

      await reorderDailyTasks(
        {
          action: "manual_move",
          movedTaskId: currentDragState.taskId,
          targetParentTaskId,
          targetIndex: targetIndexBase + (position === "after" ? 1 : 0),
        },
        "manual",
      );
    },
    [dailyTreeRows, reorderDailyTasks, setTaskDropState],
  );

  const clearTaskDragInteraction = useCallback(() => {
    taskDragStateRef.current = null;
    setTaskDropState(null);
  }, [setTaskDropState]);

  function renderTaskListHeaderControl(column: TaskListColumnConfig) {
    if (column.headerControl?.kind === "sortMenu") {
      if (!canReorderDailyTasks) {
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
              label: "Task 번호 순서로 복원",
              description: "기본 Task 번호 순서로 다시 정렬합니다.",
              onSelect: () => {
                void reorderDailyTasks({ action: "auto_sort", strategy: "action_id" }, "auto");
              },
            },
          ]}
          ariaLabel="작업 정렬 메뉴"
          isBusy={false}
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
        applyServerUpdate?: boolean;
        onFailure?: (status: number) => void | Promise<void>;
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
        await options.onFailure?.(response.status);
        return null;
      }

      const json = (await response.json()) as { data: TaskRecord };
      if (options.applyServerUpdate !== false) {
        applyTaskServerUpdate(json.data, options.clearedDirtyFields ?? []);
        setTaskListSelection(task.id);
      }
      return json.data;
    },
    [applyTaskServerUpdate, isWorkspaceReadOnly, refreshScope, setErrorMessage, setTaskListSelection],
  );
  const addTaskPendingPatchValues = useCallback((taskId: string, payload: Partial<TaskRecord>) => {
    taskPendingPatchValuesRef.current[taskId] = mergePendingTaskPatchValues(
      taskPendingPatchValuesRef.current[taskId],
      payload,
    );
  }, []);
  const clearTaskPendingPatchValues = useCallback((taskId: string, payload: Partial<TaskRecord>) => {
    const next = clearMatchingPendingTaskPatchValues(taskPendingPatchValuesRef.current[taskId], payload);
    if (!next) {
      delete taskPendingPatchValuesRef.current[taskId];
      return null;
    }

    taskPendingPatchValuesRef.current[taskId] = next;
    return next;
  }, []);
  const applyTaskPendingPatchValues = useCallback((task: TaskRecord) => {
    return withEmptyTaskFileSummary(applyPendingTaskPatchValues(task, taskPendingPatchValuesRef.current));
  }, []);
  const queueTaskPatch = useCallback(
    (
      task: Pick<TaskRecord, "id" | "version">,
      payload: Partial<TaskRecord>,
      options: {
        clearedDirtyFields?: readonly DraftDirtyField[];
        fallbackKey?: ErrorCopyKey;
      } = {},
    ) => {
      const nextPatch: QueuedTaskPatch = {
        payload,
        clearedDirtyFields: options.clearedDirtyFields ?? [],
        fallbackKey: options.fallbackKey,
      };

      const flushEntry = async (entry: TaskPatchQueueEntry) => {
        let latestTask: Pick<TaskRecord, "id" | "version"> =
          (selectedTaskRef.current?.id === task.id ? selectedTaskRef.current : null) ?? task;
        let latestUpdatedTask: TaskRecord | null = null;

        while (entry.queued) {
          const patch = entry.queued;
          entry.queued = null;
          latestTask =
            latestUpdatedTask ??
            (selectedTaskRef.current?.id === task.id ? selectedTaskRef.current : null) ??
            latestTask;

          const updatedTask = await patchTask(latestTask, patch.payload, {
            clearedDirtyFields: patch.clearedDirtyFields,
            fallbackKey: patch.fallbackKey,
            applyServerUpdate: false,
          });
          clearTaskPendingPatchValues(task.id, patch.payload);

          if (!updatedTask) {
            return latestUpdatedTask;
          }

          latestUpdatedTask = updatedTask;
          applyTaskServerUpdate(applyTaskPendingPatchValues(updatedTask), patch.clearedDirtyFields);
          setTaskListSelection(task.id);
        }

        return latestUpdatedTask;
      };

      const scheduleFlush = (entry: TaskPatchQueueEntry) => {
        if (entry.timerId !== null) {
          window.clearTimeout(entry.timerId);
        }

        entry.timerId = window.setTimeout(() => {
          entry.timerId = null;
          entry.isRunning = true;
          void flushEntry(entry).then(
            (updatedTask) => {
              entry.isRunning = false;
              if (entry.queued) {
                scheduleFlush(entry);
                return;
              }

              entry.resolve(updatedTask);
            },
            (error: unknown) => {
              entry.isRunning = false;
              entry.reject(error);
            },
          );
        }, TASK_INLINE_PATCH_DEBOUNCE_MS);
      };

      const currentEntry = taskPatchQueueRef.current[task.id];
      if (currentEntry) {
        currentEntry.queued = mergeQueuedTaskPatches(currentEntry.queued, nextPatch);
        if (!currentEntry.isRunning) {
          scheduleFlush(currentEntry);
        }
        return currentEntry.promise;
      }

      let resolveEntry: (value: TaskRecord | null) => void = () => {};
      let rejectEntry: (reason: unknown) => void = () => {};
      const entry: TaskPatchQueueEntry = {
        promise: new Promise<TaskRecord | null>((resolve, reject) => {
          resolveEntry = resolve;
          rejectEntry = reject;
        }),
        queued: nextPatch,
        timerId: null,
        isRunning: false,
        resolve: resolveEntry,
        reject: rejectEntry,
      };

      taskPatchQueueRef.current[task.id] = entry;
      scheduleFlush(entry);
      void entry.promise.finally(() => {
        if (taskPatchQueueRef.current[task.id] === entry) {
          if (entry.timerId !== null) {
            window.clearTimeout(entry.timerId);
          }
          delete taskPatchQueueRef.current[task.id];
        }
      });
      return entry.promise;
    },
    [applyTaskPendingPatchValues, applyTaskServerUpdate, clearTaskPendingPatchValues, patchTask, setTaskListSelection],
  );
  queueTaskPatchRef.current = queueTaskPatch;

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

    if (dailyMutationScope) {
      const payload = { calendarLinked: nextValue };
      addTaskPendingPatchValues(currentTask.id, payload);
      applyTaskClientUpdate(applyTaskPendingPatchValues(withEmptyTaskFileSummary({ ...currentTask, ...payload })), [
        "calendarLinked",
      ]);
      try {
        await putDailyJournalOperation(
          buildDailyMutationOperation({
            scope: dailyMutationScope,
            type: "update",
            payload: {
              kind: "update",
              taskId: currentTask.id,
              baseVersion: currentTask.version,
              patch: payload,
            },
          }),
        );
        void flushDailyMutationJournal();
      } catch (error) {
        clearTaskPendingPatchValues(currentTask.id, payload);
        applyTaskClientUpdate(applyTaskPendingPatchValues(currentTask));
        draftRef.current = { ...currentDraft, calendarLinked: previousValue };
        setDraft((previous) => (previous && previous.id === currentDraft.id ? { ...previous, calendarLinked: previousValue } : previous));
        setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
      } finally {
        setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, "calendarLinked"));
      }
      return;
    }

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
    async (columnKey: TaskListColumnKey, valueOverride: Partial<TaskRecord> = {}) => {
      const field = getEditableTaskListField(columnKey);
      const currentDraft = draftRef.current;
      const currentTask = selectedTaskRef.current;
      if (!field || !currentDraft || !currentTask || currentDraft.id !== currentTask.id) return;

      const overrideKeys = Object.keys(valueOverride);
      const draftForSave =
        overrideKeys.length > 0 ? withEmptyTaskFileSummary({ ...currentDraft, ...valueOverride }) : currentDraft;
      const payload =
        field === "assignee"
          ? { assignee: draftForSave.assignee, assigneeProfileId: draftForSave.assigneeProfileId }
          : ({ [field]: draftForSave[field] } as Partial<TaskRecord>);
      const clearedDirtyFields = field === "assignee" ? (["assignee", "assigneeProfileId"] as const) : [field];
      const hasVisibleChange = (Object.keys(payload) as Array<keyof TaskRecord>).some(
        (payloadKey) => !Object.is(payload[payloadKey], currentTask[payloadKey]),
      );

      if (!hasVisibleChange) {
        clearDraftDirtyFields(clearedDirtyFields);
        releaseActiveTaskListEditLease();
        activeTaskListInlineEditCellRef.current = null;
        setTaskListActiveInlineEditCell(null);
        setPendingTaskListFocusCell(null);
        return;
      }

      if (draftForSave !== currentDraft) {
        draftRef.current = draftForSave;
        setDraft((previous) =>
          previous && previous.id === draftForSave.id
            ? mergeTaskIntoDraft(draftForSave, previous, draftDirtyFieldsRef.current)
            : previous,
        );
      }

      setInlineSavingFields((previous) => ({ ...previous, [columnKey]: true }));
      addTaskPendingPatchValues(currentTask.id, payload);
      const optimisticTask = applyTaskPendingPatchValues(withEmptyTaskFileSummary({ ...currentTask, ...payload }));
      applyTaskClientUpdate(optimisticTask, clearedDirtyFields);
      releaseActiveTaskListEditLease();
      activeTaskListInlineEditCellRef.current = null;
      setTaskListActiveInlineEditCell(null);
      setPendingTaskListFocusCell(null);

      void (async () => {
        if (dailyMutationScope) {
          try {
            await putDailyJournalOperation(
              buildDailyMutationOperation({
                scope: dailyMutationScope,
                type: "update",
                payload: {
                  kind: "update",
                  taskId: currentTask.id,
                  baseVersion: currentTask.version,
                  patch: payload,
                },
              }),
            );
            void flushDailyMutationJournal();
          } catch (error) {
            clearTaskPendingPatchValues(currentTask.id, payload);
            applyTaskClientUpdate(applyTaskPendingPatchValues(currentTask));
            setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
          } finally {
            setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, columnKey));
          }
          return;
        }

        try {
          const updatedTask = await queueTaskPatch(currentTask, payload, { clearedDirtyFields });
          if (!updatedTask) {
            clearTaskPendingPatchValues(currentTask.id, payload);
            applyTaskClientUpdate(applyTaskPendingPatchValues(currentTask));
          }
        } catch (error) {
          clearTaskPendingPatchValues(currentTask.id, payload);
          applyTaskClientUpdate(applyTaskPendingPatchValues(currentTask));
          setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
        } finally {
          setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, columnKey));
        }
      })();
    },
    [
      addTaskPendingPatchValues,
      applyTaskClientUpdate,
      applyTaskPendingPatchValues,
      clearDraftDirtyFields,
      clearTaskPendingPatchValues,
      dailyMutationScope,
      flushDailyMutationJournal,
      queueTaskPatch,
      putDailyJournalOperation,
      releaseActiveTaskListEditLease,
      setErrorMessage,
      setTaskListActiveInlineEditCell,
    ],
  );

  const commitInlineTaskCellDocumentField = useCallback(
    (fieldKey: TextCellDocumentFieldKey, value: string) => {
      const activeCell = activeTaskListInlineEditCellRef.current;
      const currentTask = selectedTaskRef.current;
      if (!activeCell || !currentTask || activeCell.taskId !== currentTask.id) {
        return;
      }

      const patch = { [fieldKey]: value } as Partial<TaskRecord>;
      clearDraftDirtyFields([fieldKey]);
      applyTaskClientUpdate(withEmptyTaskFileSummary({ ...currentTask, ...patch }), [fieldKey]);
      if (dailyMutationScopeRef.current) {
        publishDailyRowSyncEvent(dailyMutationScopeRef.current, {
          name: "task-synced",
          operationType: "update",
          taskId: currentTask.id,
          serverTaskId: currentTask.id,
        });
      }
      releaseActiveTaskListEditLease();
      activeTaskListInlineEditCellRef.current = null;
      setTaskListActiveInlineEditCell(null);
      setPendingTaskListFocusCell(null);
    },
    [applyTaskClientUpdate, clearDraftDirtyFields, releaseActiveTaskListEditLease, setTaskListActiveInlineEditCell],
  );
  const commitActiveTaskListInlineEdit = useCallback(() => {
    const activeCell = activeTaskListInlineEditCellRef.current;
    if (!activeCell) {
      return false;
    }

    void saveInlineTaskListField(activeCell.columnKey);
    return true;
  }, [saveInlineTaskListField]);
  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statusOrder.length) return;
    const nextStatus = statusOrder[nextIndex];
    const optimisticTask = withEmptyTaskFileSummary({ ...task, status: nextStatus });
    applyTaskClientUpdate(optimisticTask);

    if (mode === "board") {
      setCollapsedBoardStatuses((previous) => {
        if (!previous[nextStatus]) {
          return previous;
        }

        const next = { ...previous };
        delete next[nextStatus];
        return next;
      });

      const optimisticTaskTree = sortedTasks.map((currentTask) => (currentTask.id === optimisticTask.id ? optimisticTask : currentTask));
      setBoardPageByStatus((previous) => ({
        ...previous,
        [nextStatus]: getBoardPageForTask(optimisticTaskTree, optimisticTask.id, nextStatus, boardPageSize),
      }));
      setExpandedBoardTaskId(optimisticTask.id);
    }

    if (dailyMutationScope) {
      addTaskPendingPatchValues(task.id, { status: nextStatus });
      try {
        await putDailyJournalOperation(
          buildDailyMutationOperation({
            scope: dailyMutationScope,
            type: "update",
            payload: {
              kind: "update",
              taskId: task.id,
              baseVersion: task.version,
              patch: { status: nextStatus },
            },
          }),
        );
        void flushDailyMutationJournal();
      } catch (error) {
        clearTaskPendingPatchValues(task.id, { status: nextStatus });
        applyTaskClientUpdate(task);
        setErrorMessage(formatMutationNetworkError(error, "updateTaskFailed"));
      }
      return;
    }

    let shouldRollbackStatus = true;
    const updatedTask = await patchTask(task, { status: nextStatus }, {
      onFailure: (status) => {
        if (status === 409) {
          shouldRollbackStatus = false;
        }
      },
    });
    if (!updatedTask || mode !== "board") {
      if (!updatedTask && shouldRollbackStatus) {
        applyTaskClientUpdate(task);
      }
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

    const previousActiveTasks = dashboardStateByScopeRef.current.active.tasks;
    const subtree = collectTaskSubtree(previousActiveTasks, taskId);
    const optimisticRemovedIds = new Set((subtree.length > 0 ? subtree : previousActiveTasks.filter((task) => task.id === taskId)).map((task) => task.id));
    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      previousSelectedTaskId && optimisticRemovedIds.has(previousSelectedTaskId)
        ? previousActiveTasks.find((task) => !optimisticRemovedIds.has(task.id))?.id ?? null
        : previousSelectedTaskId;

    setErrorMessage(null);
    if (dailyMutationScope) {
      try {
        await putDailyJournalOperation(
          buildDailyMutationOperation({
            scope: dailyMutationScope,
            type: "trash",
            payload: {
              kind: "trash",
              taskId,
              affectedTasks: subtree.length > 0 ? subtree : previousActiveTasks.filter((task) => task.id === taskId),
            },
          }),
        );
      } catch (error) {
        setErrorMessage(formatMutationNetworkError(error, "moveTaskToTrashFailed"));
        return;
      }

      removeTaskIdsFromDashboardScope("active", optimisticRemovedIds);
      setTaskListSelection(nextSelectedTaskId);
      void flushDailyMutationJournal();
      return;
    }

    removeTaskIdsFromDashboardScope("active", optimisticRemovedIds);
    setTaskListSelection(nextSelectedTaskId);

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setDashboardScopeTasks("active", () => previousActiveTasks);
      setTaskListSelection(previousSelectedTaskId);
      setErrorMessage(await readErrorMessage(response, "moveTaskToTrashFailed"));
      return;
    }

    const json = (await response.json()) as { data?: TaskSubtreeMutationPayload | TaskRecord };
    const affectedTasks = readTaskSubtreeMutationTasks(json.data);
    const affectedTaskIds = new Set((affectedTasks.length > 0 ? affectedTasks : subtree).map((task) => task.id));
    removeTaskIdsFromDashboardScope("active", affectedTaskIds);
    upsertTasksIntoLoadedDashboardScope("trash", affectedTasks);
  }

  async function restoreTask(taskId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const previousTrashTasks = dashboardStateByScopeRef.current.trash.tasks;
    const subtree = collectTaskSubtree(previousTrashTasks, taskId);
    const optimisticRemovedIds = new Set((subtree.length > 0 ? subtree : previousTrashTasks.filter((task) => task.id === taskId)).map((task) => task.id));
    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      previousSelectedTaskId && optimisticRemovedIds.has(previousSelectedTaskId)
        ? previousTrashTasks.find((task) => !optimisticRemovedIds.has(task.id))?.id ?? null
        : previousSelectedTaskId;

    setErrorMessage(null);
    removeTaskIdsFromDashboardScope("trash", optimisticRemovedIds);
    setTaskListSelection(nextSelectedTaskId);

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setDashboardScopeTasks("trash", () => previousTrashTasks);
      setTaskListSelection(previousSelectedTaskId);
      setErrorMessage(await readErrorMessage(response, "restoreTaskFailed"));
      return;
    }

    const json = (await response.json()) as { data?: TaskSubtreeMutationPayload | TaskRecord };
    const affectedTasks = readTaskSubtreeMutationTasks(json.data);
    const affectedTaskIds = new Set((affectedTasks.length > 0 ? affectedTasks : subtree).map((task) => task.id));
    removeTaskIdsFromDashboardScope("trash", affectedTaskIds);
    upsertTasksIntoLoadedDashboardScope("active", affectedTasks);
  }

  async function uploadFileForTask(taskId: string, file: File) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const tempFile = buildOptimisticFileRecord({
      taskId,
      file,
      projectId: currentProjectId,
      existingFiles: dashboardStateByScopeRef.current.active.files.filter((candidate) => candidate.taskId === taskId),
    });
    setErrorMessage(null);
    upsertFilesIntoDashboardScope("active", [tempFile]);

    try {
      const intent = await uploadFileWithIntent({ taskId, file });
      if (!intent) {
        const body = new FormData();
        body.append("file", file);
        body.append("taskId", taskId);
        const response = await fetch("/api/upload", { method: "POST", body });
        if (!response.ok) {
          removeFileIdsFromDashboardScope("active", [tempFile.id]);
          setErrorMessage(await readErrorMessage(response, "uploadFileFailed"));
          return;
        }
      }
      await refreshTaskFiles(taskId, { force: true });
      removeFileIdsFromDashboardScope("active", [tempFile.id]);
    } catch (error) {
      removeFileIdsFromDashboardScope("active", [tempFile.id]);
      if (isApiConflictError(error)) {
        await refreshTaskFiles(taskId, { force: true });
      }
      setErrorMessage(error instanceof Error ? error.message : t("errors.uploadFileFailed"));
    }
  }

  async function uploadSelectedFile() {
    if (!selectedTask || !pendingUpload) return;
    const file = pendingUpload;
    setPendingUpload(null);
    await uploadFileForTask(selectedTask.id, file);
  }

  async function uploadNextVersion() {
    if (!versionTargetId || !pendingVersionUpload) return;
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const targetFile = selectedFiles.find((file) => file.id === versionTargetId);
    if (!targetFile || isOptimisticFileId(targetFile.id)) {
      setErrorMessage(t("workspace.privateStorage"));
      return;
    }

    const previousActiveFiles = dashboardStateByScopeRef.current.active.files;
    const uploadFile = pendingVersionUpload;
    const optimisticVersionFile = buildOptimisticFileVersion(targetFile, uploadFile);
    setPendingVersionUpload(null);
    setErrorMessage(null);
    upsertFilesIntoDashboardScope("active", [optimisticVersionFile]);

    try {
      const intent = await uploadFileWithIntent({
        taskId: targetFile.taskId,
        file: uploadFile,
        replaceFileId: versionTargetId,
      });

      if (!intent) {
        const body = new FormData();
        body.append("file", uploadFile);
        const response = await fetch(`/api/files/${encodeURIComponent(versionTargetId)}/version`, {
          method: "POST",
          body,
        });

        if (!response.ok) {
          setDashboardScopeFiles("active", () => previousActiveFiles);
          setErrorMessage(await readErrorMessage(response, "uploadNextVersionFailed"));
          return;
        }
      }

      await refreshTaskFiles(targetFile.taskId, { force: true });
    } catch (error) {
      setDashboardScopeFiles("active", () => previousActiveFiles);
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
    if (!sourceFile || isOptimisticFileId(sourceFile.id)) {
      return;
    }

    const previousActiveFiles = dashboardStateByScopeRef.current.active.files;
    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    const optimisticTrashFile = { ...sourceFile, deletedAt: new Date().toISOString() };

    setErrorMessage(null);
    removeFileIdsFromDashboardScope("active", [fileId]);
    upsertFilesIntoDashboardScope("trash", [optimisticTrashFile]);

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setDashboardScopeFiles("active", () => previousActiveFiles);
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setErrorMessage(await readErrorMessage(response, "moveFileToTrashFailed"));
      return;
    }

    const json = (await response.json()) as { data: FileRecord };
    removeFileIdsFromDashboardScope("active", [fileId]);
    upsertFilesIntoDashboardScope("trash", [json.data]);
  }

  async function restoreFile(fileId: string) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const sourceFile = files.find((candidate) => candidate.id === fileId);
    if (!sourceFile || isOptimisticFileId(sourceFile.id)) {
      return;
    }

    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    const previousActiveFiles = dashboardStateByScopeRef.current.active.files;
    const optimisticActiveFile = { ...sourceFile, deletedAt: null };

    setErrorMessage(null);
    removeFileIdsFromDashboardScope("trash", [fileId]);
    upsertFilesIntoDashboardScope("active", [optimisticActiveFile]);

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setDashboardScopeFiles("active", () => previousActiveFiles);
      setErrorMessage(await readErrorMessage(response, "restoreFileFailed"));
      return;
    }

    const json = (await response.json()) as { data: FileRecord };
    removeFileIdsFromDashboardScope("trash", [fileId]);
    upsertFilesIntoDashboardScope("active", [json.data]);
  }

  async function deleteTaskPermanently(task: TaskRecord) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm(
      `"${`${formatTaskDisplayId(task)} ${task.issueTitle}`.trim()}" 작업을 작업공간에서 영구 삭제할까요? 화면에서 복원할 수 없습니다.`,
    );

    if (!confirmed) {
      return;
    }

    const previousTrashTasks = dashboardStateByScopeRef.current.trash.tasks;
    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    const optimisticDeletedFileIds = previousTrashFiles.filter((file) => file.taskId === task.id).map((file) => file.id);
    const previousSelectedTaskId = taskListRowInteractionStore.getState().selectedTaskId;
    const nextSelectedTaskId =
      previousSelectedTaskId === task.id ? previousTrashTasks.find((candidate) => candidate.id !== task.id)?.id ?? null : previousSelectedTaskId;

    setErrorMessage(null);
    if (dailyMutationScope) {
      try {
        await putDailyJournalOperation(
          buildDailyMutationOperation({
            scope: dailyMutationScope,
            type: "delete",
            payload: {
              kind: "delete",
              taskId: task.id,
              affectedTasks: [task],
              affectedFileIds: optimisticDeletedFileIds,
            },
          }),
        );
      } catch (error) {
        setErrorMessage(formatMutationNetworkError(error, "deleteTaskFailed"));
        return;
      }

      removeTaskIdsFromDashboardScope("trash", [task.id]);
      removeFileIdsFromDashboardScope("trash", optimisticDeletedFileIds);
      setTaskListSelection(nextSelectedTaskId);
      void flushDailyMutationJournal();
      return;
    }

    removeTaskIdsFromDashboardScope("trash", [task.id]);
    removeFileIdsFromDashboardScope("trash", optimisticDeletedFileIds);
    setTaskListSelection(nextSelectedTaskId);

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setDashboardScopeTasks("trash", () => previousTrashTasks);
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setTaskListSelection(previousSelectedTaskId);
      setErrorMessage(await readErrorMessage(response, "deleteTaskFailed"));
      return;
    }

    const json = (await response.json().catch(() => null)) as { data?: PermanentTaskDeletePayload } | null;
    const deletedTaskIds = new Set(json?.data?.deletedTaskIds?.length ? json.data.deletedTaskIds : [task.id]);
    removeTaskIdsFromDashboardScope("trash", deletedTaskIds);
    removeFileIdsFromDashboardScope("trash", json?.data?.deletedFileIds ?? optimisticDeletedFileIds);
    upsertTasksIntoLoadedDashboardScope("trash", json?.data?.updatedTasks ?? []);
  }

  async function deleteFilePermanently(file: FileRecord) {
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm(
      `"${file.originalName} ${file.versionLabel}" 파일을 작업공간에서 영구 삭제할까요? 화면에서 복원할 수 없습니다.`,
    );

    if (!confirmed) {
      return;
    }

    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    setErrorMessage(null);
    removeFileIdsFromDashboardScope("trash", [file.id]);

    const response = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setErrorMessage(await readErrorMessage(response, "deleteFileFailed"));
      return;
    }
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
      `선택한 휴지통 항목을 작업공간에서 영구 삭제할까요? 작업: ${selectedTrashTaskIds.length}개, 파일: ${selectedTrashFileIds.length}개입니다. 화면에서 복원할 수 없습니다.`,
    );

    if (!confirmed) {
      return;
    }

    const taskIdsToDelete = [...selectedTrashTaskIds];
    const fileIdsToDelete = [...selectedTrashFileIds];
    const previousTrashTasks = dashboardStateByScopeRef.current.trash.tasks;
    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    const optimisticDeletedTaskIds = new Set(taskIdsToDelete);
    const optimisticDeletedFileIds = new Set(fileIdsToDelete);
    for (const file of previousTrashFiles) {
      if (optimisticDeletedTaskIds.has(file.taskId)) {
        optimisticDeletedFileIds.add(file.id);
      }
    }

    setErrorMessage(null);
    removeTaskIdsFromDashboardScope("trash", optimisticDeletedTaskIds);
    removeFileIdsFromDashboardScope("trash", optimisticDeletedFileIds);
    setSelectedTrashTaskIds([]);
    setSelectedTrashFileIds([]);

    const response = await fetch("/api/trash/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: taskIdsToDelete, fileIds: fileIdsToDelete }),
    });

    if (!response.ok) {
      setDashboardScopeTasks("trash", () => previousTrashTasks);
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setSelectedTrashTaskIds(taskIdsToDelete);
      setSelectedTrashFileIds(fileIdsToDelete);
      setErrorMessage(await readErrorMessage(response, "deleteSelectedFailed"));
      return;
    }

    const json = (await response.json().catch(() => null)) as { data?: PermanentTaskDeletePayload } | null;
    removeTaskIdsFromDashboardScope("trash", json?.data?.deletedTaskIds ?? taskIdsToDelete);
    removeFileIdsFromDashboardScope("trash", json?.data?.deletedFileIds ?? [...optimisticDeletedFileIds]);
    upsertTasksIntoLoadedDashboardScope("trash", json?.data?.updatedTasks ?? []);
  }

  async function emptyTrashItems() {
    if (trashItems.length === 0) {
      return;
    }

    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }

    const confirmed = window.confirm("휴지통의 모든 항목을 작업공간에서 영구 삭제할까요? 화면에서 복원할 수 없습니다.");
    if (!confirmed) {
      return;
    }

    const previousTrashTasks = dashboardStateByScopeRef.current.trash.tasks;
    const previousTrashFiles = dashboardStateByScopeRef.current.trash.files;
    const deletedTaskIds = previousTrashTasks.map((task) => task.id);
    const deletedFileIds = previousTrashFiles.map((file) => file.id);

    setErrorMessage(null);
    setSelectedTrashTaskIds([]);
    setSelectedTrashFileIds([]);
    setDashboardScopeTasks("trash", () => []);
    setDashboardScopeFiles("trash", () => []);

    const response = await fetch("/api/trash", { method: "DELETE" });
    if (!response.ok) {
      setDashboardScopeTasks("trash", () => previousTrashTasks);
      setDashboardScopeFiles("trash", () => previousTrashFiles);
      setErrorMessage(await readErrorMessage(response, "emptyTrashFailed"));
      return;
    }

    const json = (await response.json().catch(() => null)) as { data?: PermanentTaskDeletePayload } | null;
    removeTaskIdsFromDashboardScope("trash", json?.data?.deletedTaskIds ?? deletedTaskIds);
    removeFileIdsFromDashboardScope("trash", json?.data?.deletedFileIds ?? deletedFileIds);
    upsertTasksIntoLoadedDashboardScope("trash", json?.data?.updatedTasks ?? []);
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
    commitActiveTaskListInlineEdit();
    releaseActiveTaskListEditLease();
    setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
    setPendingTaskListFocusCell(null);
    if (isPreviewDaily) {
      pinDetailPanel();
    }
  }, [commitActiveTaskListInlineEdit, isPreviewDaily, pinDetailPanel, releaseActiveTaskListEditLease, setTaskListActiveInlineEditCell]);

  const focusTaskListEditableCell = useCallback((taskId: string, columnKey: TaskListColumnKey) => {
    const nextCell = { taskId, columnKey };
    if (isWorkspaceReadOnly) {
      setErrorMessage(t("errors.workspaceReadOnly"));
      return;
    }
    if (isOptimisticTaskId(taskId)) {
      setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
      setPendingTaskListFocusCell(null);
      return;
    }

    const activeInlineCell = activeTaskListInlineEditCellRef.current;
    if (activeInlineCell && !arePendingTaskListFocusCellsEqual(activeInlineCell, nextCell)) {
      commitActiveTaskListInlineEdit();
    }

    const previousLeaseCell = activeTaskListEditLeaseCellRef.current;
    if (previousLeaseCell && !arePendingTaskListFocusCellsEqual(previousLeaseCell, nextCell)) {
      activeTaskListEditLeaseCellRef.current = null;
      void releaseTaskListEditLease(previousLeaseCell);
    }

    setTaskListActiveInlineEditCell(nextCell, { selectedTaskId: taskId });
    setPendingTaskListFocusCell(nextCell);

    void (async () => {
      const acquired = await acquireTaskListEditLease(nextCell);
      const isStillEditingCell = arePendingTaskListFocusCellsEqual(activeTaskListInlineEditCellRef.current, nextCell);

      if (acquired) {
        if (isStillEditingCell) {
          activeTaskListEditLeaseCellRef.current = nextCell;
          return;
        }

        void releaseTaskListEditLease(nextCell);
        return;
      }

      activeTaskListEditLeaseCellRef.current = null;
      if (isStillEditingCell) {
        setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
        setPendingTaskListFocusCell(null);
      }
    })();
  }, [
    acquireTaskListEditLease,
    commitActiveTaskListInlineEdit,
    isWorkspaceReadOnly,
    releaseTaskListEditLease,
    setErrorMessage,
    setTaskListActiveInlineEditCell,
  ]);

  const toggleTaskDetails = useCallback((taskId: string) => {
    const currentState = detailPanelInteractionRef.current;
    if (currentState.selectedTaskId === taskId && currentState.isDetailExpanded) {
      closeDetailPanel();
      return;
    }

    commitActiveTaskListInlineEdit();
    releaseActiveTaskListEditLease();
    setTaskListActiveInlineEditCell(null, { selectedTaskId: taskId });
    setPendingTaskListFocusCell(null);
    pinDetailPanel();
  }, [closeDetailPanel, commitActiveTaskListInlineEdit, pinDetailPanel, releaseActiveTaskListEditLease, setTaskListActiveInlineEditCell]);

  const clearTaskSelection = useCallback(() => {
    commitActiveTaskListInlineEdit();
    releaseActiveTaskListEditLease();
    setTaskListActiveInlineEditCell(null, { selectedTaskId: null });
    setPendingTaskListFocusCell(null);
    setIsDetailPanelSticky(false);
    setDetailPanelState("collapsed");
  }, [commitActiveTaskListInlineEdit, releaseActiveTaskListEditLease, setTaskListActiveInlineEditCell]);
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

  const handleTrashSortModeChange = useCallback(
    (nextMode: TrashSortMode) => {
      if (nextMode === trashSortMode) {
        return;
      }

      startTransition(() => {
        setTrashSortMode(nextMode);
        setTrashPage(1);
      });
    },
    [trashSortMode],
  );

  const handleTrashListViewModeChange = useCallback(
    (nextMode: TrashListViewMode) => {
      if (nextMode === trashListViewMode) {
        return;
      }

      startTransition(() => {
        setTrashListViewMode(nextMode);
        setTrashPage(1);
      });
    },
    [trashListViewMode],
  );

  const goToTrashPage = useCallback(
    (nextPage: number) => {
      if (!isPagedTrashListView) {
        return;
      }

      const clampedPage = clampBoardPage(nextPage, Math.max(trashPageCount, 1));
      if (clampedPage === resolvedTrashPage) {
        return;
      }

      startTransition(() => {
        setTrashPage(clampedPage);
      });
    },
    [isPagedTrashListView, resolvedTrashPage, trashPageCount],
  );

  const toggleTrashItemExpansion = useCallback((itemKey: string) => {
    setExpandedTrashItemKeys((previous) =>
      previous.includes(itemKey) ? previous.filter((key) => key !== itemKey) : [...previous, itemKey],
    );
  }, []);

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
      if (isWorkspaceNavigationTarget(target)) return;

      const taskPortalElement = target.closest<HTMLElement>('[data-task-portal-interaction="true"]');
      if (taskPortalElement) return;

      commitActiveTaskListInlineEdit();

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
  }, [
    clearTaskSelection,
    clearTaskSelectionFromOutsideInteraction,
    commitActiveTaskListInlineEdit,
    hasSelectedTaskDraftChanges,
    isMobileViewport,
    mode,
    saving,
    selectedTaskId,
  ]);

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
            <input readOnly value={formatReadonlyTaskNumber(selectedTask.taskNumber, selectedTask.actionId)} />
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

        {selectedTaskAssistantAudit ? <AssistantAuditPanel audit={selectedTaskAssistantAudit} /> : null}

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
  const hasLocallyVisibleWorkspaceData = tasks.length > 0 || (mode === "daily" && dailyMutationSummary.totalActive > 0);
  const shouldShowWorkspaceLoadingPlaceholder = loading && !hasLocallyVisibleWorkspaceData;

  useEffect(() => {
    if (loading || shouldShowWorkspaceLoadingPlaceholder) {
      return;
    }

    recordWorkspaceRouteReady({
      fileCount: files.length,
      hasError: Boolean(errorMessage),
      mode,
      pathname,
      taskCount: sortedTasks.length,
    });
  }, [errorMessage, files.length, loading, mode, pathname, shouldShowWorkspaceLoadingPlaceholder, sortedTasks.length]);

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
              {!isAppleWorkbench ? <p className="workspace__eyebrow">{authUser?.displayName ?? t("workspace.fallbackEyebrow")}</p> : null}
              <div className="workspace__mode-pills">
                <span className="workspace__mode-pill">{labelForMode(mode)}</span>
                {isPreview ? <span className="workspace__mode-pill workspace__mode-pill--preview">미리보기</span> : null}
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
                {projectPresenceLabel ? <p className="workspace__meta workspace__fact">{projectPresenceLabel}</p> : null}
                {activeEditorPresenceLabel ? <p className="workspace__meta workspace__fact">{activeEditorPresenceLabel}</p> : null}
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
            {!isAppleWorkbench ? <p className="workspace__eyebrow">{authUser?.displayName ?? t("workspace.fallbackEyebrow")}</p> : null}
            <p className="workspace__project">{projectName || t("workspace.fallbackProjectName")}</p>
            <h2>{titleByMode(mode)}</h2>
            {!isAppleWorkbench ? <p className="workspace__copy">{t("workspace.headerCopy")}</p> : null}
            {!isAppleWorkbench && systemMode ? (
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
                {projectPresenceLabel ? <p className="workspace__meta">{projectPresenceLabel}</p> : null}
                {activeEditorPresenceLabel ? <p className="workspace__meta">{activeEditorPresenceLabel}</p> : null}
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
      {dailyMutationStatusLabel ? (
        <div
          className="daily-sync-status"
          data-error-code={dailyMutationStatusDebug?.lastErrorCode || undefined}
          data-failure-kind={dailyMutationStatusDebug?.failureKind || undefined}
          data-http-status={dailyMutationStatusDebug?.lastHttpStatus || undefined}
          data-operation-type={dailyMutationStatusDebug?.type || undefined}
          data-retry-count={dailyMutationStatusDebug?.retryCount || undefined}
          data-state={dailyMutationSummary.failed > 0 ? "failed" : dailyMutationSummary.syncing > 0 ? "syncing" : "pending"}
          title={dailyMutationStatusDebug?.lastError || undefined}
        >
          <span>{dailyMutationStatusLabel}</span>
          {dailyMutationSummary.failed > 0 ? (
            <button className="secondary-button" onClick={() => void discardFailedDailyMutations()} type="button">
              {"\uB85C\uCEEC \uCDE8\uC18C"}
            </button>
          ) : null}
          {dailyMutationSummary.failed > 0 ? (
            <button className="secondary-button" onClick={() => void flushDailyMutationJournal({ manual: true })} type="button">
              재시도
            </button>
          ) : null}
        </div>
      ) : null}
      {shouldShowWorkspaceLoadingPlaceholder ? (
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
                {!isAppleWorkbench ? <p>{t("workspace.noItemsBody")}</p> : null}
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
                hideDescriptions={isAppleWorkbench}
                summaryCards={boardSummaryCards}
              />
            ) : null}

            {mode === "daily" ? (
              <>
                {!isWorkspaceReadOnly ? (
                  <TaskQuickCreate
                    canCollapse={canCollapseCreateForm}
                    composerMode={quickCreateComposerMode}
                    hideBody={isAppleWorkbench}
                    hideEyebrow={isAppleWorkbench}
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
                      {!isAppleWorkbench ? <p className="workspace__meta">{t("workspace.dailyFocusSummary")}</p> : null}
                    </div>
                  </div>
                  <div className="daily-sheet__focus-summary-bar">
                    {!isAppleWorkbench ? <p className="daily-sheet__focus-copy">{t("workspace.dailyFocusSummary")}</p> : null}
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
                            {canReorderDailyTasks ? <div className="daily-task-card__reorder-actions">
                              <button
                                aria-label="위로 이동"
                                className="secondary-button"
                                disabled={isDailyManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                                disabled={isDailyManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                            canReorderRows={canReorderDailyTasks}
                            isPreviewReadOnly={isWorkspaceReadOnly}
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
                    cellDocumentsEnabled={dailyCellDocumentsEnabled}
                    draftStore={taskEditorDraftStore}
                    draft={draft}
                    getCellNode={getTaskListRowCellNode}
                    inlineSavingFields={inlineSavingFields}
                    onCellDocumentCommitted={commitInlineTaskCellDocumentField}
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
                    {!isAppleWorkbench ? <p>{labelForMode("calendar")}</p> : null}
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
                        {!isAppleWorkbench ? <p>{calendarEmptyState.body}</p> : null}
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
                        {!isAppleWorkbench ? <p>{calendarEmptyState.body}</p> : null}
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
              <div className="trash-panel">
                <div className="trash-controls">
                  <div className="trash-controls__group">
                    <span className="trash-controls__label">{t("workspace.trashSortLabel")}</span>
                    <div aria-label={t("workspace.trashSortModeAria")} className="daily-sheet__view-mode-toggle trash-controls__toggle" role="group">
                      <button
                        aria-pressed={trashSortMode === "deletedAt"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          trashSortMode === "deletedAt" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleTrashSortModeChange("deletedAt")}
                        type="button"
                      >
                        {t("workspace.trashSortDeletedDate")}
                      </button>
                      <button
                        aria-pressed={trashSortMode === "createdAt"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          trashSortMode === "createdAt" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleTrashSortModeChange("createdAt")}
                        type="button"
                      >
                        {t("workspace.trashSortCreatedDate")}
                      </button>
                    </div>
                  </div>
                  <div className="trash-controls__group">
                    <span className="trash-controls__label">{t("workspace.trashListViewLabel")}</span>
                    <div aria-label={t("workspace.trashListViewModeAria")} className="daily-sheet__view-mode-toggle trash-controls__toggle" role="group">
                      <button
                        aria-pressed={trashListViewMode === "full"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          trashListViewMode === "full" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleTrashListViewModeChange("full")}
                        type="button"
                      >
                        {t("workspace.trashListViewFull")}
                      </button>
                      <button
                        aria-pressed={trashListViewMode === "paged"}
                        className={clsx(
                          "daily-sheet__view-mode-button",
                          trashListViewMode === "paged" && "daily-sheet__view-mode-button--active",
                        )}
                        onClick={() => handleTrashListViewModeChange("paged")}
                        type="button"
                      >
                        {t("workspace.trashListViewPaged")}
                      </button>
                    </div>
                  </div>
                </div>

                {isPagedTrashListView && activeTrashPage ? (
                  <div className="daily-task-list__toolbar trash-pagination">
                    <div className="daily-task-list__toolbar-meta">
                      {displayedTrashRangeLabel ? <span className="daily-task-list__toolbar-range">{displayedTrashRangeLabel}</span> : null}
                      <span className="daily-task-list__toolbar-page">
                        {t("workspace.pageStatus", { current: resolvedTrashPage, total: Math.max(trashPageCount, 1) })}
                      </span>
                    </div>
                    <div className="daily-task-list__toolbar-actions">
                      <button
                        className="secondary-button daily-task-list__toolbar-button daily-task-list__toolbar-nav-button"
                        disabled={resolvedTrashPage <= 1}
                        onClick={() => goToTrashPage(resolvedTrashPage - 1)}
                        type="button"
                      >
                        {t("actions.back")}
                      </button>
                      <div aria-label={t("workspace.trashListPaginationAria")} className="daily-task-list__toolbar-pages" role="group">
                        {trashPageNavigationItems.map((pageItem) =>
                          pageItem.kind === "ellipsis" ? (
                            <span aria-hidden="true" className="daily-task-list__toolbar-ellipsis" key={pageItem.key}>
                              ...
                            </span>
                          ) : (
                            <button
                              aria-current={pageItem.page === resolvedTrashPage ? "page" : undefined}
                              aria-label={t("workspace.trashListGoToPage", { page: pageItem.page })}
                              className={clsx(
                                "secondary-button daily-task-list__toolbar-page-button",
                                pageItem.page === resolvedTrashPage && "daily-task-list__toolbar-page-button--active",
                              )}
                              disabled={pageItem.page === resolvedTrashPage}
                              key={pageItem.key}
                              onClick={() => goToTrashPage(pageItem.page)}
                              type="button"
                            >
                              {pageItem.page}
                            </button>
                          ),
                        )}
                      </div>
                      <button
                        className="secondary-button daily-task-list__toolbar-button daily-task-list__toolbar-nav-button"
                        disabled={resolvedTrashPage >= trashPageCount}
                        onClick={() => goToTrashPage(resolvedTrashPage + 1)}
                        type="button"
                      >
                        {t("actions.next")}
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="trash-list">
                  {trashItems.length === 0 ? <div className="board-column__empty">{t("empty.noDeletedTasks")}</div> : null}
                  {displayedTrashItems.map((item) => {
                    const isTask = item.kind === "task";
                    const itemKey = getTrashItemKey(item);
                    const expanded = expandedTrashItemKeySet.has(itemKey);
                    const checked = !isWorkspaceReadOnly && (isTask ? selectedTrashTaskIdSet.has(item.id) : selectedTrashFileIdSet.has(item.id));
                    const title = isTask ? item.task.issueTitle || t("empty.noDescription") : item.file.originalName;
                    const createdDate = fileSafeDate(getTrashItemDateValue(item, "createdAt"));
                    const deletedDate = fileSafeDate(getTrashItemDateValue(item, "deletedAt"));
                    const primaryDateMeta =
                      trashSortMode === "createdAt"
                        ? t("workspace.createdDateMeta", { date: createdDate })
                        : t("workspace.deletedDateMeta", { date: deletedDate });
                    const secondaryDateMeta =
                      trashSortMode === "createdAt"
                        ? t("workspace.deletedDateMeta", { date: deletedDate })
                        : t("workspace.createdDateMeta", { date: createdDate });

                    return (
                      <article
                        className={clsx(
                          "trash-card",
                          isWorkspaceReadOnly && "trash-card--readonly",
                          expanded && "trash-card--expanded",
                          checked && "trash-card--selected",
                        )}
                        data-selected={isWarmStudio && checked ? "true" : undefined}
                        key={itemKey}
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
                          <div className="trash-card__summary">
                            <div className="trash-card__meta-row">
                              <span className={clsx("trash-card__type", isTask ? "trash-card__type--task" : "trash-card__type--file")}>
                                {isTask ? t("workspace.trashItemTask") : t("workspace.trashItemFile")}
                              </span>
                              <strong className="trash-card__identifier">
                                {isTask ? formatTaskDisplayId(item.task) : item.file.versionLabel}
                              </strong>
                            </div>
                            <h3 className="trash-card__title">{title}</h3>
                            <div className="trash-card__summary-meta">
                              <small>{primaryDateMeta}</small>
                              <small>{secondaryDateMeta}</small>
                            </div>
                          </div>

                          {expanded ? (
                            <div className="trash-card__details" id={`${itemKey}-details`}>
                              {isTask ? (
                                <>
                                  <dl className="trash-card__detail-grid">
                                    <div>
                                      <dt>{labelForField("status")}</dt>
                                      <dd>
                                        <span className={clsx("status-pill", `status-pill--${item.task.status}`)}>{labelForStatus(item.task.status)}</span>
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>{labelForField("assignee")}</dt>
                                      <dd>{item.task.assignee || t("empty.unassigned")}</dd>
                                    </div>
                                    <div>
                                      <dt>{labelForField("dueDate")}</dt>
                                      <dd>{item.task.dueDate || "-"}</dd>
                                    </div>
                                    <div>
                                      <dt>{labelForField("reviewedAt")}</dt>
                                      <dd>{fileSafeDate(item.task.reviewedAt)}</dd>
                                    </div>
                                    <div>
                                      <dt>{t("workspace.createdDateLabel")}</dt>
                                      <dd>{createdDate}</dd>
                                    </div>
                                    <div>
                                      <dt>{t("workspace.deletedDateLabel")}</dt>
                                      <dd>{deletedDate}</dd>
                                    </div>
                                  </dl>
                                  <div className="trash-card__detail-note">
                                    <span>{labelForField("issueDetailNote")}</span>
                                    <p>{item.task.issueDetailNote || t("empty.noDescription")}</p>
                                  </div>
                                  {item.task.fileSummary?.count ? (
                                    <p className="trash-card__detail-footnote">
                                      {t("workspace.fileCount", { count: item.task.fileSummary.count })}
                                      {item.task.fileSummary.latestFileName ? ` · ${item.task.fileSummary.latestFileName}` : ""}
                                    </p>
                                  ) : null}
                                </>
                              ) : (
                                <dl className="trash-card__detail-grid">
                                  <div>
                                    <dt>{t("workspace.trashFileMetaLabel")}</dt>
                                    <dd>{formatFileAttachmentMeta(item.file)}</dd>
                                  </div>
                                  <div>
                                    <dt>{t("workspace.trashFileVersionLabel")}</dt>
                                    <dd>{item.file.versionLabel}</dd>
                                  </div>
                                  <div>
                                    <dt>{t("workspace.trashFileTaskIdLabel")}</dt>
                                    <dd>{item.file.taskId}</dd>
                                  </div>
                                  <div>
                                    <dt>{t("workspace.createdDateLabel")}</dt>
                                    <dd>{createdDate}</dd>
                                  </div>
                                  <div>
                                    <dt>{t("workspace.deletedDateLabel")}</dt>
                                    <dd>{deletedDate}</dd>
                                  </div>
                                </dl>
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="trash-card__actions">
                          {!isWorkspaceReadOnly ? (
                            isTask ? (
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
                            )
                          ) : null}
                          <button
                            aria-controls={`${itemKey}-details`}
                            aria-expanded={expanded}
                            aria-label={expanded ? t("workspace.collapseTrashItem", { title }) : t("workspace.expandTrashItem", { title })}
                            className="secondary-button trash-card__expand-button"
                            onClick={() => toggleTrashItemExpansion(itemKey)}
                            type="button"
                          >
                            {expanded ? t("workspace.trashCollapseButton") : t("workspace.trashExpandButton")}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
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
                    {selectedTaskAssistantAudit ? <AssistantAuditPanel audit={selectedTaskAssistantAudit} /> : null}

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
                              {!isPreview && !isOptimisticFileId(file.id) ? (
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
                              {!isWorkspaceReadOnly && !isOptimisticFileId(file.id) ? (
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

          {mode === "daily" && !isPreviewDaily ? <TaskAssistantPanel selectedTask={selectedTaskIsOptimistic ? null : selectedTask} /> : null}
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
  canReorderRows,
  isPreviewReadOnly,
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
              canReorderRows={canReorderRows}
              hideIssueIdOverdueBadge={hideIssueIdOverdueBadge}
              inlineSavingFields={inlineSavingFields}
              isPreviewReadOnly={isPreviewReadOnly}
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
                  {canReorderRows ? (
                  <button
                    aria-label="재정렬"
                    className="task-tree__drag-handle"
                    disabled={isHtmlDragReorderDisabled || isOptimisticTaskId(task.id)}
                    draggable={!isHtmlDragReorderDisabled && !isOptimisticTaskId(task.id)}
                    onClick={(event) => event.stopPropagation()}
                    onDragEnd={clearTaskDragInteraction}
                    onDragStart={(event) => handleTaskRowDragStart(task, event)}
                    onPointerDown={(event) => event.stopPropagation()}
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
                  {interactionSnapshot.isSelectedRow && canReorderRows ? (
                    <span className="task-tree__actions">
                      <button
                        aria-label="위로 이동"
                        className="task-tree__move-button"
                        disabled={isManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                        disabled={isManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                      void focusTaskListEditableCell(task.id, column.key);
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
            onDragOver={canReorderRows ? (event) => handleTaskRowDragOver(task, event) : undefined}
            onDrop={canReorderRows ? (event) => void handleTaskRowDrop(task, event) : undefined}
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
  canReorderRows,
  isPreviewReadOnly,
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
            {canReorderRows ? (
            <button
              aria-label="재정렬"
              className="task-tree__drag-handle"
              disabled={isHtmlDragReorderDisabled || isOptimisticTaskId(task.id)}
              draggable={!isHtmlDragReorderDisabled && !isOptimisticTaskId(task.id)}
              onClick={(event) => event.stopPropagation()}
              onDragEnd={clearTaskDragInteraction}
              onDragStart={(event) => handleTaskRowDragStart(task, event)}
              onPointerDown={(event) => event.stopPropagation()}
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
            {isSelectedRow && canReorderRows ? (
              <span className="task-tree__actions">
                <button
                  aria-label="위로 이동"
                  className="task-tree__move-button"
                  disabled={isManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                  disabled={isManualReorderDisabled || isOptimisticTaskId(task.id)}
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
                void focusTaskListEditableCell(task.id, column.key);
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
      onDragOver={canReorderRows ? (event) => handleTaskRowDragOver(task, event) : undefined}
      onDrop={canReorderRows ? (event) => void handleTaskRowDrop(task, event) : undefined}
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
  if (previous.canReorderRows !== next.canReorderRows) return false;
  if (previous.isPreviewReadOnly !== next.isPreviewReadOnly) return false;
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
  onCommit: (columnKey: TaskListColumnKey, valueOverride?: Partial<TaskRecord>) => Promise<void> | void;
  onCancel?: (columnKey: TaskListColumnKey) => void;
  saving?: boolean;
  assigneeOptions?: readonly AssigneeOption[];
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
}) {
  const fieldLabel = fieldKey === "assigneeProfileId" ? labelForField("assignee") : labelForField(fieldKey);
  const categoricalFieldContext = { workTypeDefinitions, categoryDefinitionsByField };
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
        onBlur={(event) => void onCommit(columnKey, { [fieldKey]: event.currentTarget.value } as Partial<TaskRecord>)}
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
            void onCommit(columnKey, { calendarLinked: event.target.checked });
          }}
          type="checkbox"
        />
      </label>
    );
  }

  if (isTaskCategoricalFormFieldKey(fieldKey)) {
    if (shouldUseLegacyTaskCategoricalTextInput(fieldKey, categoricalFieldContext)) {
      return (
        <textarea
          {...sharedProps}
          className="sheet-table__inline-input sheet-table__inline-textarea"
          onBlur={(event) => void onCommit(columnKey, { [fieldKey]: event.currentTarget.value } as Partial<TaskRecord>)}
          onChange={(event) => onChange(fieldKey, event.target.value)}
          onKeyDown={(event) => handleTaskListInlineTextKeyDown(event, () => onCancel?.(columnKey))}
          rows={1}
          value={String(form[fieldKey] ?? "")}
        />
      );
    }

    if (fieldKey === "relatedDisciplines" || fieldKey === "locationRef") {
      return (
        <TaskCategoricalFieldMultiSelect
          className="sheet-table__inline-multiselect"
          fieldKey={fieldKey}
          onChangeValues={(values) => {
            const nextValue = serializeTaskCategoryValues(values);
            onChange(fieldKey, nextValue);
            void onCommit(columnKey, { [fieldKey]: nextValue } as Partial<TaskRecord>);
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
          const nextValue = event.target.value;
          applyTaskCategoricalFieldChange(fieldKey, nextValue, onChange);
          void onCommit(columnKey, { [fieldKey]: nextValue } as Partial<TaskRecord>);
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
          void onCommit(columnKey, { assigneeProfileId: selection.profileId, assignee: selection.label });
        }}
        onKeyDown={(event) => handleTaskListInlineEscapeKeyDown(event, () => onCancel?.(columnKey))}
      />
    );
  }

  return (
    <textarea
      {...sharedProps}
      className={clsx("sheet-table__inline-input sheet-table__inline-textarea", fieldKey === "issueTitle" && "sheet-table__inline-input--title")}
      onBlur={(event) => void onCommit(columnKey, { [fieldKey]: event.currentTarget.value } as Partial<TaskRecord>)}
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
  cellDocumentsEnabled,
  draft,
  inlineSavingFields,
  workTypeDefinitions,
  categoryDefinitionsByField,
  getCellNode,
  onChange,
  onCellDocumentCommitted,
  onCommit,
  onCancel,
  pendingFocusCell,
  onFocusHandled,
  draftStore,
}: {
  activeCell: PendingTaskListFocusCell | null;
  assigneeOptions: readonly AssigneeOption[];
  cellDocumentsEnabled: boolean;
  draft: TaskRecord | null;
  inlineSavingFields: Partial<Record<TaskListColumnKey, boolean>>;
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
  getCellNode: (taskId: string, columnKey: TaskListColumnKey) => HTMLDivElement | null;
  onChange: TaskFormChangeHandler;
  onCellDocumentCommitted: (fieldKey: TextCellDocumentFieldKey, value: string) => void;
  onCommit: (columnKey: TaskListColumnKey, valueOverride?: Partial<TaskRecord>) => Promise<void> | void;
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

        if (cellDocumentsEnabled && isTextCellDocumentField(fieldKey) && !isOptimisticTaskId(overlayDraft.id)) {
          const columnKey = overlayCell.columnKey as TaskListColumnKey;
          return (
            <TaskCellEditor
              fieldKey={fieldKey}
              onCancel={() => onCancel(columnKey)}
              onChange={onChange}
              onCommitted={onCellDocumentCommitted}
              task={overlayDraft}
            />
          );
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
  const categoricalFieldContext = { workTypeDefinitions, categoryDefinitionsByField };
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
        <input readOnly={Boolean(readonly.actionId)} value={formatReadonlyTaskNumber(form.taskNumber, form.actionId)} />
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
        {shouldUseLegacyTaskCategoricalTextInput("coordinationScope", categoricalFieldContext) ? (
          <input
            className="detail-text-field"
            onChange={(event) => onChange("coordinationScope", event.target.value)}
            value={form.coordinationScope}
          />
        ) : (
          <TaskCategoricalFieldSelect
            className="detail-select-field"
            fieldKey="coordinationScope"
            onChange={(event) => applyTaskCategoricalFieldChange("coordinationScope", event.target.value, onChange)}
            value={form.coordinationScope}
            categoryDefinitionsByField={categoryDefinitionsByField}
            workTypeDefinitions={workTypeDefinitions}
          />
        )}
        {renderResizeHandle("coordinationScope")}
      </label>
      <label {...getLabelProps("requestedBy", "form-field--stretch")}>
        <span>{labelForField("requestedBy")}</span>
        {shouldUseLegacyTaskCategoricalTextInput("requestedBy", categoricalFieldContext) ? (
          <input
            className="detail-text-field"
            onChange={(event) => onChange("requestedBy", event.target.value)}
            value={form.requestedBy}
          />
        ) : (
          <TaskCategoricalFieldSelect
            className="detail-select-field"
            fieldKey="requestedBy"
            onChange={(event) => applyTaskCategoricalFieldChange("requestedBy", event.target.value, onChange)}
            value={form.requestedBy}
            categoryDefinitionsByField={categoryDefinitionsByField}
            workTypeDefinitions={workTypeDefinitions}
          />
        )}
        {renderResizeHandle("requestedBy")}
      </label>
      <label {...getLabelProps("relatedDisciplines", "form-field--stretch")}>
        <span>{labelForField("relatedDisciplines")}</span>
        {shouldUseLegacyTaskCategoricalTextInput("relatedDisciplines", categoricalFieldContext) ? (
          <input
            className="detail-text-field"
            onChange={(event) => onChange("relatedDisciplines", event.target.value)}
            value={form.relatedDisciplines}
          />
        ) : (
          <TaskCategoricalFieldMultiSelect
            buttonClassName="detail-select-field"
            className={clsx(layout === "composer" && "task-categorical-multiselect--composer")}
            fieldKey="relatedDisciplines"
            onChangeValues={(values) => onChange("relatedDisciplines", serializeTaskCategoryValues(values))}
            value={form.relatedDisciplines}
            categoryDefinitionsByField={categoryDefinitionsByField}
            workTypeDefinitions={workTypeDefinitions}
          />
        )}
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
        {shouldUseLegacyTaskCategoricalTextInput("locationRef", categoricalFieldContext) ? (
          <input
            className="detail-text-field"
            onChange={(event) => onChange("locationRef", event.target.value)}
            value={form.locationRef}
          />
        ) : (
          <TaskCategoricalFieldMultiSelect
            buttonClassName="detail-select-field"
            className={clsx(layout === "composer" && "task-categorical-multiselect--composer")}
            fieldKey="locationRef"
            onChangeValues={(values) => onChange("locationRef", serializeTaskCategoryValues(values))}
            value={form.locationRef}
            categoryDefinitionsByField={categoryDefinitionsByField}
            workTypeDefinitions={workTypeDefinitions}
          />
        )}
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

function AssistantAuditPanel({ audit }: { audit: AssistantAuditIndicator }) {
  return (
    <section aria-label="어시스턴트 변경 출처" className="detail-assistant-audit">
      <div className="detail-assistant-audit__header">
        <span>AI 변경 출처</span>
        <strong>어시스턴트가 반영한 작업 변경</strong>
      </div>

      <div className="detail-assistant-audit__grid">
        {audit.structuredActions.length ? (
          <div className="detail-assistant-audit__item detail-assistant-audit__item--wide">
            <span>구조화된 감사 기록</span>
            <div className="detail-assistant-audit__children">
              {audit.structuredActions.map((action) => (
                <article key={action.id}>
                  <strong>{formatAssistantActionAuditLabel(action.action)}</strong>
                  <p>{formatAssistantActionAuditSummary(action)}</p>
                  <small>
                    기록: {action.assistantRecordId} / 대상: {action.targetTaskId}
                    {action.createdTaskId ? ` / 생성: ${action.createdTaskId}` : ""}
                  </small>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {audit.summaryRecordIds.length ? (
          <div className="detail-assistant-audit__item">
            <span>승인된 요약 기록</span>
            <div className="detail-assistant-audit__chips">
              {audit.summaryRecordIds.map((recordId) => (
                <code key={recordId}>{recordId}</code>
              ))}
            </div>
          </div>
        ) : null}

        {audit.sourceRecordIds.length ? (
          <div className="detail-assistant-audit__item">
            <span>원본 어시스턴트 기록</span>
            <div className="detail-assistant-audit__chips">
              {audit.sourceRecordIds.map((recordId) => (
                <code key={recordId}>{recordId}</code>
              ))}
            </div>
            {audit.parentReference ? <small>상위 작업: {audit.parentReference}</small> : null}
          </div>
        ) : null}

        {audit.followUpChildren.length ? (
          <div className="detail-assistant-audit__item detail-assistant-audit__item--wide">
            <span>어시스턴트가 만든 후속 작업</span>
            <div className="detail-assistant-audit__children">
              {audit.followUpChildren.map((child) => (
                <article key={child.id}>
                  <strong>{child.label}</strong>
                  <p>{child.title}</p>
                  <small>원본 기록: {child.recordIds.join(", ")}</small>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
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

function getTaskReorderStorageKey(userId: string, projectId: string) {
  return `${TASK_REORDER_PENDING_STORAGE_KEY_PREFIX}${userId}:${projectId}`;
}

function getTaskReorderCommandSignature(command: TaskReorderPersistCommand) {
  return JSON.stringify(command);
}

function writePendingTaskReorderToStorage(storageKey: string | null, command: TaskReorderPersistCommand) {
  if (typeof window === "undefined" || !storageKey) {
    return false;
  }

  try {
    const payload: StoredPendingTaskReorder = {
      version: TASK_REORDER_PENDING_STORAGE_VERSION,
      updatedAt: Date.now(),
      command,
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function readPendingTaskReorderFromStorage(storageKey: string): StoredPendingTaskReorder | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<StoredPendingTaskReorder>;
    const command = sanitizeStoredTaskReorderCommand(parsed.command);
    if (!command || parsed.version !== TASK_REORDER_PENDING_STORAGE_VERSION || typeof parsed.updatedAt !== "number") {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    if (Date.now() - parsed.updatedAt > TASK_REORDER_PENDING_MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return {
      version: TASK_REORDER_PENDING_STORAGE_VERSION,
      updatedAt: parsed.updatedAt,
      command,
    };
  } catch {
    return null;
  }
}

function removePendingTaskReorderFromStorage(storageKey: string | null) {
  if (typeof window === "undefined" || !storageKey) {
    return;
  }

  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore storage cleanup failures. A later successful sync will try again.
  }
}

function sanitizeStoredTaskReorderCommand(input: unknown): TaskReorderPersistCommand | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const candidate = input as Partial<TaskReorderPersistCommand>;
  if (candidate.action === "set_sibling_order") {
    const parentTaskId = typeof candidate.parentTaskId === "string" ? candidate.parentTaskId : null;
    const orderedTaskIds = Array.isArray(candidate.orderedTaskIds)
      ? candidate.orderedTaskIds.filter((taskId): taskId is string => typeof taskId === "string" && taskId.length > 0)
      : [];
    const expectedVersions = sanitizeStoredTaskReorderExpectedVersions(
      (candidate as { expectedVersions?: unknown }).expectedVersions,
    );
    const rawSiblingOrderStart = (candidate as { siblingOrderStart?: unknown }).siblingOrderStart;
    const siblingOrderStart =
      rawSiblingOrderStart === undefined || rawSiblingOrderStart === null
        ? undefined
        : Number(rawSiblingOrderStart);
    if (
      siblingOrderStart !== undefined &&
      (!Number.isInteger(siblingOrderStart) || siblingOrderStart < 0)
    ) {
      return null;
    }

    return orderedTaskIds.length === 0
      ? null
      : expectedVersions === null
        ? null
      : {
          action: "set_sibling_order",
          parentTaskId,
          orderedTaskIds,
          siblingOrderStart,
          expectedVersions,
        };
  }

  if (candidate.action === "manual_move") {
    return typeof candidate.movedTaskId === "string" &&
      (typeof candidate.targetParentTaskId === "string" || candidate.targetParentTaskId === null) &&
      typeof candidate.targetIndex === "number" &&
      Number.isInteger(candidate.targetIndex)
      ? {
          action: "manual_move",
          movedTaskId: candidate.movedTaskId,
          targetParentTaskId: candidate.targetParentTaskId,
          targetIndex: candidate.targetIndex,
        }
      : null;
  }

  if (candidate.action === "auto_sort") {
    return candidate.strategy === "priority" || candidate.strategy === "action_id"
      ? {
          action: "auto_sort",
          strategy: candidate.strategy,
        }
      : null;
  }

  return null;
}

function sanitizeStoredTaskReorderExpectedVersions(value: unknown): TaskReorderExpectedVersionMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const expectedVersions: TaskReorderExpectedVersionMap = {};
  for (const [taskId, version] of Object.entries(value)) {
    const normalizedTaskId = taskId.trim();
    const normalizedVersion = Number(version);
    if (!normalizedTaskId || !Number.isInteger(normalizedVersion) || normalizedVersion < 1) {
      return null;
    }
    expectedVersions[normalizedTaskId] = normalizedVersion;
  }

  return Object.keys(expectedVersions).length === 0 ? null : expectedVersions;
}

function applyStoredTaskReorderCommand(tasks: readonly TaskRecord[], command: TaskReorderPersistCommand) {
  if (command.action !== "set_sibling_order") {
    return buildOptimisticReorderedTasks(tasks, command);
  }

  const parentTaskId = command.parentTaskId ?? null;
  const siblings = buildStoredOrderTaskTree(tasks).filter((task) => (task.parentTaskId ?? null) === parentTaskId);
  if (siblings.length === 0) {
    return [...tasks];
  }

  const siblingById = new Map(siblings.map((task) => [task.id, task]));
  const seenIds = new Set<string>();
  const orderedSiblings: TaskRecord[] = [];
  const hasSiblingOrderStart = Number.isInteger(command.siblingOrderStart) && (command.siblingOrderStart ?? 0) >= 0;
  const siblingOrderStart = hasSiblingOrderStart ? command.siblingOrderStart ?? 0 : 0;
  for (const taskId of command.orderedTaskIds) {
    const task = siblingById.get(taskId);
    if (!task || seenIds.has(task.id)) {
      continue;
    }

    seenIds.add(task.id);
    orderedSiblings.push(task);
  }

  if (!hasSiblingOrderStart) {
    for (const sibling of siblings) {
      if (!seenIds.has(sibling.id)) {
        orderedSiblings.push(sibling);
      }
    }
  }

  return applyOptimisticSiblingOrderUpdates(
    tasks,
    orderedSiblings.map((task, index) => ({ id: task.id, siblingOrder: siblingOrderStart + index })),
  );
}

function areTaskSiblingOrdersEqual(left: readonly TaskRecord[], right: readonly TaskRecord[]) {
  if (left.length !== right.length) {
    return false;
  }

  const rightById = new Map(right.map((task) => [task.id, task]));
  return left.every((task) => {
    const rightTask = rightById.get(task.id);
    return (
      rightTask &&
      (rightTask.parentTaskId ?? null) === (task.parentTaskId ?? null) &&
      rightTask.siblingOrder === task.siblingOrder
    );
  });
}

function areTaskCollectionsEquivalent(left: readonly TaskRecord[], right: readonly TaskRecord[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((leftTask, index) => {
    const rightTask = right[index];
    if (!rightTask) {
      return false;
    }

    return (
      leftTask.id === rightTask.id &&
      leftTask.version === rightTask.version &&
      leftTask.siblingOrder === rightTask.siblingOrder &&
      leftTask.parentTaskId === rightTask.parentTaskId &&
      leftTask.deletedAt === rightTask.deletedAt &&
      leftTask.issueTitle === rightTask.issueTitle &&
      leftTask.status === rightTask.status &&
      leftTask.dueDate === rightTask.dueDate &&
      leftTask.workType === rightTask.workType &&
      leftTask.coordinationScope === rightTask.coordinationScope &&
      leftTask.requestedBy === rightTask.requestedBy &&
      leftTask.relatedDisciplines === rightTask.relatedDisciplines &&
      leftTask.assignee === rightTask.assignee &&
      leftTask.locationRef === rightTask.locationRef &&
      leftTask.calendarLinked === rightTask.calendarLinked &&
      leftTask.issueDetailNote === rightTask.issueDetailNote &&
      leftTask.decision === rightTask.decision
    );
  });
}

function shouldRetainPendingTaskReorderAfterFailure(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
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

function getTrashViewPreferenceStorageBaseKey(userId: string, projectId: string) {
  return `${TRASH_VIEW_PREFERENCE_STORAGE_KEY_PREFIX}${userId}:${projectId}`;
}

function getTrashViewPreferenceStorageKey(baseKey: string, preferenceKey: string) {
  return `${baseKey}:${preferenceKey}`;
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

function readTrashSortModeFromStorage(storageKey: string): TrashSortMode {
  if (typeof window === "undefined") {
    return "deletedAt";
  }

  try {
    return window.localStorage.getItem(storageKey) === "createdAt" ? "createdAt" : "deletedAt";
  } catch {
    return "deletedAt";
  }
}

function writeTrashSortModeToStorage(storageKey: string, value: TrashSortMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === "deletedAt") {
      window.localStorage.removeItem(storageKey);
      return;
    }

    window.localStorage.setItem(storageKey, value);
  } catch {
    // Ignore storage write failures and keep the in-memory preference.
  }
}

function readTrashListViewModeFromStorage(storageKey: string): TrashListViewMode {
  if (typeof window === "undefined") {
    return "paged";
  }

  try {
    return window.localStorage.getItem(storageKey) === "full" ? "full" : "paged";
  } catch {
    return "paged";
  }
}

function writeTrashListViewModeToStorage(storageKey: string, value: TrashListViewMode) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === "paged") {
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

function buildTrashItemPages(items: readonly TrashItem[], pageSize: number): TrashItemPage[] {
  if (items.length === 0) {
    return [];
  }

  const normalizedPageSize = Math.max(1, Math.floor(pageSize));
  const pages: TrashItemPage[] = [];

  for (let index = 0; index < items.length; index += normalizedPageSize) {
    const pageItems = items.slice(index, index + normalizedPageSize);
    pages.push({
      items: pageItems,
      startItemNumber: index + 1,
      endItemNumber: index + pageItems.length,
    });
  }

  return pages;
}

function buildPageNavigationItems(totalPages: number, currentPage: number): PageNavigationItem[] {
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
  const items: PageNavigationItem[] = [];
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

function getTrashItemKey(item: TrashItem) {
  return `${item.kind}:${item.id}`;
}

function getTrashItemDateValue(item: TrashItem, sortMode: TrashSortMode) {
  if (item.kind === "task") {
    return sortMode === "createdAt" ? item.task.createdAt : item.task.deletedAt;
  }

  return sortMode === "createdAt" ? item.file.createdAt : item.file.deletedAt;
}

function compareTrashItems(left: TrashItem, right: TrashItem, sortMode: TrashSortMode) {
  const dateCompare = (getTrashItemDateValue(right, sortMode) ?? "").localeCompare(getTrashItemDateValue(left, sortMode) ?? "");
  if (dateCompare !== 0) return dateCompare;

  const kindCompare = left.kind.localeCompare(right.kind);
  if (kindCompare !== 0) return kindCompare;

  return left.id.localeCompare(right.id);
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

function buildTaskReorderExpectedVersions(
  command: TaskReorderPersistCommand,
  tasks: readonly TaskRecord[],
): TaskReorderExpectedVersionMap {
  const impactedTasks =
    command.action === "auto_sort"
      ? tasks
      : command.action === "set_sibling_order"
        ? command.siblingOrderStart === undefined
          ? tasks.filter((task) => (task.parentTaskId ?? null) === (command.parentTaskId ?? null))
          : tasks.filter((task) => command.orderedTaskIds.includes(task.id))
      : tasks.filter(
          (task) =>
            task.id === command.movedTaskId ||
            (task.parentTaskId ?? null) === command.targetParentTaskId,
        );

  return Object.fromEntries(impactedTasks.map((task) => [task.id, task.version]));
}

function buildTaskReorderRequestBody(
  command: TaskReorderPersistCommand,
  tasks: readonly TaskRecord[],
  orderScope: "daily" | null,
) {
  const body = {
    ...command,
    expectedVersions: buildTaskReorderExpectedVersions(command, buildStoredOrderTaskTree(tasks)),
  };

  return orderScope === "daily" ? { ...body, orderScope } : body;
}

async function fetchDailyMutationRequest(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), DAILY_MUTATION_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: init?.signal ?? controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function withTaskReorderExpectedVersions(
  command: TaskReorderPersistCommand,
  tasks: readonly TaskRecord[],
): TaskReorderPersistCommand {
  if (command.action !== "set_sibling_order") {
    return command;
  }

  return {
    ...command,
    expectedVersions: buildTaskReorderExpectedVersions(command, buildStoredOrderTaskTree(tasks)),
  };
}

function buildTaskReorderPersistCommand(
  command: TaskReorderClientCommand,
  previousTasks: readonly TaskRecord[],
  optimisticTasks: readonly TaskRecord[],
): TaskReorderPersistCommand {
  if (command.action !== "manual_move") {
    return command;
  }

  const parentTaskId = command.targetParentTaskId ?? null;
  const optimisticSiblings = buildStoredOrderTaskTree(optimisticTasks).filter(
    (task) => (task.parentTaskId ?? null) === parentTaskId,
  );
  const previousOrderById = new Map(
    buildStoredOrderTaskTree(previousTasks)
      .filter((task) => (task.parentTaskId ?? null) === parentTaskId)
      .map((task, siblingOrder) => [task.id, siblingOrder]),
  );
  const changedSiblingOrders = optimisticSiblings
    .map((task, siblingOrder) => ({ task, siblingOrder }))
    .filter(({ task, siblingOrder }) => previousOrderById.get(task.id) !== siblingOrder && !isOptimisticTaskId(task.id));
  const siblingOrderStart =
    changedSiblingOrders.length > 0 ? Math.min(...changedSiblingOrders.map(({ siblingOrder }) => siblingOrder)) : 0;
  const siblingOrderEnd =
    changedSiblingOrders.length > 0 ? Math.max(...changedSiblingOrders.map(({ siblingOrder }) => siblingOrder)) : -1;
  const orderedTaskIds =
    siblingOrderEnd >= siblingOrderStart
      ? optimisticSiblings
          .slice(siblingOrderStart, siblingOrderEnd + 1)
          .map((task) => task.id)
          .filter((taskId) => !isOptimisticTaskId(taskId))
      : optimisticSiblings.map((task) => task.id).filter((taskId) => !isOptimisticTaskId(taskId));

  return {
    action: "set_sibling_order",
    parentTaskId,
    orderedTaskIds,
    siblingOrderStart,
  };
}

function buildOptimisticReorderedTasks(tasks: readonly TaskRecord[], command: TaskReorderClientCommand) {
  if (command.action === "auto_sort") {
    return applyOptimisticSiblingOrderUpdates(tasks, buildSiblingOrderUpdates(tasks, command.strategy));
  }

  const parentTaskId = command.targetParentTaskId ?? null;
  const siblings = buildStoredOrderTaskTree(tasks).filter((task) => (task.parentTaskId ?? null) === parentTaskId);
  const currentIndex = siblings.findIndex((task) => task.id === command.movedTaskId);
  if (currentIndex < 0 || command.targetIndex < 0) {
    return [...tasks];
  }

  const nextSiblings = siblings.filter((task) => task.id !== command.movedTaskId);
  const normalizedInsertionIndex = command.targetIndex > currentIndex ? command.targetIndex - 1 : command.targetIndex;
  const insertionIndex = Math.min(normalizedInsertionIndex, nextSiblings.length);
  nextSiblings.splice(insertionIndex, 0, siblings[currentIndex]);

  return applyOptimisticSiblingOrderUpdates(
    tasks,
    nextSiblings.map((task, siblingOrder) => ({ id: task.id, siblingOrder })),
  );
}

function applyOptimisticSiblingOrderUpdates(
  tasks: readonly TaskRecord[],
  updates: ReadonlyArray<{ id: string; siblingOrder: number }>,
) {
  const siblingOrderById = new Map(updates.map((update) => [update.id, update.siblingOrder]));
  return tasks.map((task) => {
    const siblingOrder = siblingOrderById.get(task.id);
    return siblingOrder === undefined ? task : withEmptyTaskFileSummary({ ...task, siblingOrder });
  });
}

function mergeTaskReorderServerAcknowledgement(
  currentTasks: readonly TaskRecord[],
  serverTasks: readonly TaskRecord[],
  options: { preserveLocalOrderFields: boolean },
) {
  const serverTaskById = new Map(serverTasks.map((task) => [task.id, task]));

  return currentTasks.map((currentTask) => {
    const serverTask = serverTaskById.get(currentTask.id);
    if (!serverTask) {
      return currentTask;
    }

    if (!options.preserveLocalOrderFields) {
      return withEmptyTaskFileSummary(serverTask);
    }

    return withEmptyTaskFileSummary({
      ...serverTask,
      actionId: currentTask.actionId,
      issueId: currentTask.issueId,
      parentTaskId: currentTask.parentTaskId,
      siblingOrder: currentTask.siblingOrder,
    });
  });
}

function restoreTaskReorderSnapshot(
  currentTasks: readonly TaskRecord[],
  previousTasks: readonly TaskRecord[],
  command: TaskReorderPersistCommand,
) {
  const previousTaskById = new Map(previousTasks.map((task) => [task.id, task]));

  return currentTasks.map((currentTask) => {
    const previousTask = previousTaskById.get(currentTask.id);
    if (!previousTask || !isTaskImpactedByReorderCommand(previousTask, command)) {
      return currentTask;
    }

    return withEmptyTaskFileSummary({
      ...currentTask,
      actionId: previousTask.actionId,
      issueId: previousTask.issueId,
      parentTaskId: previousTask.parentTaskId,
      rootTaskId: previousTask.rootTaskId,
      depth: previousTask.depth,
      siblingOrder: previousTask.siblingOrder,
    });
  });
}

function isTaskImpactedByReorderCommand(task: TaskRecord, command: TaskReorderPersistCommand) {
  if (command.action === "auto_sort") {
    return true;
  }

  if (command.action === "set_sibling_order") {
    return (task.parentTaskId ?? null) === command.parentTaskId;
  }

  return task.id === command.movedTaskId || (task.parentTaskId ?? null) === command.targetParentTaskId;
}

function collectTaskSubtree(tasks: readonly TaskRecord[], rootTaskId: string) {
  const root = tasks.find((task) => task.id === rootTaskId);
  if (!root) {
    return [];
  }

  const byParent = new Map<string, TaskRecord[]>();
  for (const task of tasks) {
    const parentTaskId = task.parentTaskId ?? null;
    if (!parentTaskId) {
      continue;
    }

    const children = byParent.get(parentTaskId) ?? [];
    children.push(task);
    byParent.set(parentTaskId, children);
  }

  const subtree: TaskRecord[] = [];
  const visit = (task: TaskRecord) => {
    subtree.push(task);
    for (const child of byParent.get(task.id) ?? []) {
      visit(child);
    }
  };

  visit(root);
  return subtree;
}

function readTaskSubtreeMutationTasks(payload: TaskSubtreeMutationPayload | TaskRecord | undefined) {
  if (!payload) {
    return [];
  }

  if ("affectedTasks" in payload && Array.isArray(payload.affectedTasks)) {
    return payload.affectedTasks;
  }

  if ("task" in payload && payload.task) {
    return [payload.task];
  }

  if ("id" in payload) {
    return [payload];
  }

  return [];
}

function isOptimisticTaskId(taskId: string) {
  return taskId.startsWith("optimistic-task:");
}

function isOptimisticFileId(fileId: string) {
  return fileId.startsWith("optimistic-file:");
}

function buildOptimisticTask(input: {
  form: TaskQuickCreateFormValues;
  projectId: string | null;
  previousTasks: readonly TaskRecord[];
  clientMutationId?: string;
}): TaskRecord {
  const id = buildDailyOptimisticTaskId(input.clientMutationId ?? createDailyMutationId());
  const now = new Date().toISOString();
  const siblingOrder = resolveOptimisticCreateSiblingOrder(input.previousTasks);

  return {
    id,
    projectId: input.projectId ?? "",
    taskNumber: 0,
    actionId: 0,
    issueId: "",
    parentTaskId: null,
    rootTaskId: id,
    depth: 0,
    siblingOrder,
    dueDate: input.form.dueDate,
    workType: input.form.workType,
    coordinationScope: input.form.coordinationScope,
    ownerDiscipline: input.form.ownerDiscipline,
    requestedBy: input.form.requestedBy,
    relatedDisciplines: input.form.relatedDisciplines,
    assignee: input.form.assignee,
    assigneeProfileId: input.form.assigneeProfileId,
    issueTitle: input.form.issueTitle,
    reviewedAt: input.form.reviewedAt,
    createdAt: now.slice(0, 10),
    createdBy: null,
    isDaily: input.form.isDaily,
    locationRef: input.form.locationRef,
    calendarLinked: input.form.calendarLinked,
    issueDetailNote: input.form.issueDetailNote,
    status: input.form.status,
    statusHistory: "",
    decision: input.form.decision,
    completedAt: null,
    version: 1,
    updatedAt: now,
    updatedBy: null,
    deletedAt: null,
    purgedAt: null,
    fileSummary: { count: 0, latestFileName: null },
  };
}

function buildOptimisticFileRecord(input: {
  taskId: string;
  file: File;
  projectId: string | null;
  existingFiles: readonly FileRecord[];
}): FileRecord {
  const id = `optimistic-file:${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const versionNumber = nextOptimisticFileVersionNumber(input.existingFiles);

  return {
    id,
    taskId: input.taskId,
    projectId: input.projectId ?? "",
    fileGroupId: `optimistic-file-group:${id}`,
    originalName: input.file.name,
    mimeType: input.file.type || null,
    sizeBytes: input.file.size,
    storageBucket: "",
    objectPath: "",
    version: 1,
    versionNumber,
    versionLabel: `v${versionNumber}`,
    createdAt: now,
    updatedAt: now,
    uploadedBy: null,
    deletedAt: null,
    purgedAt: null,
    metadata: {},
  };
}

function buildOptimisticFileVersion(file: FileRecord, nextFile: File): FileRecord {
  const nextVersionNumber = file.versionNumber + 1;
  return {
    ...file,
    originalName: nextFile.name,
    mimeType: nextFile.type || null,
    sizeBytes: nextFile.size,
    version: file.version + 1,
    versionNumber: nextVersionNumber,
    versionLabel: `v${nextVersionNumber}`,
    updatedAt: new Date().toISOString(),
  };
}

function nextOptimisticFileVersionNumber(files: readonly FileRecord[]) {
  const versionNumbers = files.map((file) => file.versionNumber).filter((value) => Number.isFinite(value));
  return versionNumbers.length === 0 ? 1 : Math.max(...versionNumbers) + 1;
}

function resolveOptimisticCreateSiblingOrder(previousTasks: readonly TaskRecord[]) {
  const rootSiblingOrders = previousTasks
    .filter((task) => !task.parentTaskId)
    .map((task) => task.siblingOrder)
    .filter((value) => Number.isFinite(value));

  return rootSiblingOrders.length === 0 ? 0 : Math.min(...rootSiblingOrders) - 1;
}

function withEmptyTaskFileSummary(task: TaskRecord): TaskRecord {
  return {
    ...task,
    fileSummary: task.fileSummary ?? { count: 0, latestFileName: null },
  };
}

function buildOptimisticTaskPatchPayload(payload: Record<string, unknown>) {
  const next: Partial<TaskRecord> = {};
  const nextRecord = next as Record<string, unknown>;
  for (const field of editableTaskFormKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      nextRecord[field] = payload[field];
    }
  }
  return next;
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

function formatMutationNetworkError(error: unknown, fallbackKey: ErrorCopyKey) {
  if (error instanceof Error && !isFetchNetworkFailure(error)) {
    return error.message;
  }

  return localizeError({ fallbackKey });
}

function isFetchNetworkFailure(error: Error) {
  return (
    error.name === "AbortError" ||
    error.name === "TypeError" ||
    /failed to fetch|networkerror|fetch failed|load failed|aborted/i.test(error.message)
  );
}

function getUtf8ByteLength(value: string) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).byteLength;
  }

  return value.length;
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

function readDailyMutationFlushErrorInfo(error: unknown): DailyMutationFlushErrorInfo {
  if (error instanceof ApiResponseError) {
    return { status: error.status, code: error.code, isNetworkError: false };
  }

  if (error instanceof Error && isFetchNetworkFailure(error)) {
    return { status: null, code: null, isNetworkError: true };
  }

  return { status: null, code: null, isNetworkError: false };
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

function formatReadonlyTaskNumber(
  taskNumber: number | string | null | undefined,
  actionId: number | string | null | undefined,
) {
  const formatted = formatTaskDisplayId({ actionId, taskNumber });

  return formatted || t("workspace.autoAfterCreate");
}

function formatReadonlyValue(value: string | null | undefined) {
  const formatted = formatDateTimeField(value);
  return formatted === "-" ? t("workspace.autoValue") : formatted;
}

function formatPreviewFieldValue(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed || "-";
}

function buildAssistantAuditIndicator(
  task: TaskRecord,
  allTasks: readonly TaskRecord[],
  selectedParentTask: TaskRecord | null,
  actionAudits: readonly AssistantActionAuditRecord[],
): AssistantAuditIndicator | null {
  const structuredTaskUpdateRecordIds = actionAudits
    .filter((audit) => audit.action === "task_update_applied" && audit.targetTaskId === task.id)
    .map((audit) => audit.assistantRecordId);
  const structuredSourceRecordIds = actionAudits
    .filter((audit) => audit.action === "follow_up_task_created" && (audit.targetTaskId === task.id || audit.createdTaskId === task.id))
    .map((audit) => audit.assistantRecordId);
  const summaryRecordIds = uniqueStrings([
    ...extractUniquePatternMatches(task.decision, ASSISTANT_APPROVED_SUMMARY_PATTERN),
    ...structuredTaskUpdateRecordIds,
  ]);
  const sourceRecordIds = uniqueStrings([
    ...extractUniquePatternMatches(task.issueDetailNote, ASSISTANT_SOURCE_RECORD_PATTERN),
    ...structuredSourceRecordIds,
  ]);
  const parentReference =
    sourceRecordIds.length > 0
      ? extractAssistantParentReference(task.issueDetailNote) ?? (selectedParentTask ? formatTaskDisplayId(selectedParentTask) : null)
      : null;
  const followUpChildrenById = new Map<string, AssistantAuditChildTask>();
  allTasks
    .filter((candidate) => candidate.parentTaskId === task.id)
    .forEach((candidate) => {
      mergeAssistantAuditChild(followUpChildrenById, {
        id: candidate.id,
        label: formatTaskDisplayId(candidate),
        title: candidate.issueTitle || "-",
        recordIds: extractUniquePatternMatches(candidate.issueDetailNote, ASSISTANT_SOURCE_RECORD_PATTERN),
      });
    });

  actionAudits
    .filter((audit) => audit.action === "follow_up_task_created" && audit.sourceTaskId === task.id && audit.createdTaskId)
    .forEach((audit) => {
      const child = allTasks.find((candidate) => candidate.id === audit.createdTaskId);
      mergeAssistantAuditChild(followUpChildrenById, {
        id: audit.createdTaskId ?? audit.id,
        label: child ? formatTaskDisplayId(child) : audit.createdTaskId ?? audit.targetTaskId,
        title: child?.issueTitle || audit.summary?.followUpAction || "-",
        recordIds: [audit.assistantRecordId],
      });
    });
  const followUpChildren = Array.from(followUpChildrenById.values()).filter((candidate) => candidate.recordIds.length > 0);

  if (summaryRecordIds.length === 0 && sourceRecordIds.length === 0 && followUpChildren.length === 0 && actionAudits.length === 0) {
    return null;
  }

  return {
    summaryRecordIds,
    sourceRecordIds,
    parentReference,
    followUpChildren,
    structuredActions: [...actionAudits],
  };
}

function mergeAssistantAuditChild(childrenById: Map<string, AssistantAuditChildTask>, child: AssistantAuditChildTask) {
  const current = childrenById.get(child.id);
  if (!current) {
    childrenById.set(child.id, { ...child, recordIds: uniqueStrings(child.recordIds) });
    return;
  }

  childrenById.set(child.id, {
    ...current,
    recordIds: uniqueStrings([...current.recordIds, ...child.recordIds]),
  });
}

function formatAssistantActionAuditLabel(action: AssistantActionAuditRecord["action"]) {
  return action === "task_update_applied" ? "작업 기록 업데이트 적용" : "후속 작업 생성";
}

function formatAssistantActionAuditSummary(action: AssistantActionAuditRecord) {
  const summaryText = action.summary?.conclusion || action.summary?.followUpAction || action.decisionMarker || "";
  const statusText =
    action.statusFrom || action.statusTo ? `상태: ${action.statusFrom ?? "-"} -> ${action.statusTo ?? "-"}` : null;
  return [summaryText || "어시스턴트 작업이 구조화된 감사 기록으로 저장되었습니다.", statusText].filter(Boolean).join(" / ");
}

function extractUniquePatternMatches(value: string, pattern: RegExp) {
  return uniqueStrings(Array.from(value.matchAll(pattern), (match) => match[1]?.trim()).filter(Boolean));
}

function extractAssistantParentReference(value: string) {
  return value.match(ASSISTANT_PARENT_TASK_PATTERN)?.[1]?.trim() || null;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function mergeQueuedTaskPatches(current: QueuedTaskPatch | null, next: QueuedTaskPatch): QueuedTaskPatch {
  if (!current) {
    return next;
  }

  const clearedDirtyFields = [...current.clearedDirtyFields];
  for (const field of next.clearedDirtyFields) {
    if (!clearedDirtyFields.includes(field)) {
      clearedDirtyFields.push(field);
    }
  }

  return {
    payload: { ...current.payload, ...next.payload },
    clearedDirtyFields,
    fallbackKey: next.fallbackKey ?? current.fallbackKey,
  };
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
