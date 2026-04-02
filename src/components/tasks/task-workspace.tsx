"use client";

import {
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
  DragEvent as ReactDragEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  getTaskCategoricalFieldOptions,
  labelForTaskCategoricalFieldValue,
  serializeTaskCategoryValues,
  TaskCategoricalFieldMultiSelect,
  TaskCategoricalFieldSelect,
  type TaskCategoricalFieldKey,
} from "@/components/tasks/task-categorical-fields";
import { BoardTaskOverview } from "@/components/tasks/board-task-overview";
import { TaskListCategoricalHeaderFilter as TaskListCategoricalHeaderFilterPopover } from "@/components/tasks/task-list-categorical-header-filter";
import { TaskListOrderHeaderMenu } from "@/components/tasks/task-list-order-header-menu";
import { TaskFocusStrip } from "@/components/tasks/task-focus-strip";
import { useAuthUser } from "@/providers/auth-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { previewFiles, previewSystemMode, previewTasks } from "@/lib/preview/demo-data";
import {
  matchesTaskCategoricalFilter,
  normalizeTaskCategoricalFilterSelection,
} from "@/lib/task-categorical-filter";
import {
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { DashboardMode, FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import { extractProjectIssueNumber } from "@/domains/task/identifiers";
import { buildStoredOrderTaskTree } from "@/domains/task/ordering";
import {
  buildTaskTreeRows,
  dailyTaskListColumns,
  formatActionId,
  formatTaskDisplayId,
  formatDateTimeField,
  sortTasksByActionId,
  type DailyTaskListColumnConfig as TaskListColumnConfig,
  type DailyTaskSortMode,
  type TaskTreeRow,
} from "@/domains/task/daily-list";
import {
  TASK_LIST_ROW_MIN_HEIGHT,
  clampQuickCreateWidth,
  clampTaskListColumnWidth,
  clampTaskListRowHeight,
  quickCreateDefaultWidths,
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
  getWeekdayLabels,
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
type TaskFocusKey = "todo" | "in_progress" | "blocked" | "overdue";
type TaskDropPosition = "before" | "after";
type TaskDragState = {
  taskId: string;
  parentTaskId: string | null;
};
type TaskDropState = {
  taskId: string;
  position: TaskDropPosition;
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
  issueTitle: string;
  reviewedAt: string;
  updatedAt?: string | null;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  decision: string;
};

type SystemMode = {
  backendMode: string;
  dataMode: string;
  uploadMode: string;
  hasSupabase: boolean;
  hasFirebaseProjectId: boolean;
};

type EditableTaskFormKey =
  | "dueDate"
  | "workType"
  | "coordinationScope"
  | "ownerDiscipline"
  | "requestedBy"
  | "relatedDisciplines"
  | "assignee"
  | "issueTitle"
  | "reviewedAt"
  | "locationRef"
  | "calendarLinked"
  | "issueDetailNote"
  | "status"
  | "decision";

type TaskFormChangeHandler = <K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) => void;

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
};

type LinkedDocumentsDisplay = {
  primary: string;
  secondary: string | null;
};

type TaskCategoricalFormFieldKey = Extract<EditableTaskFormKey, TaskCategoricalFieldKey>;
type TaskListEditableDateFieldKey = Extract<EditableTaskFormKey, "dueDate" | "reviewedAt">;
type TaskListEditableTextFieldKey = Exclude<EditableTaskFormKey, "calendarLinked" | TaskCategoricalFieldKey | "dueDate" | "reviewedAt">;
type DailyCategoricalFilterFieldKey = Extract<
  TaskCategoricalFieldKey,
  "workType" | "coordinationScope" | "requestedBy" | "relatedDisciplines" | "locationRef" | "status"
>;
type DailyCategoricalFilterMap = Partial<Record<DailyCategoricalFilterFieldKey, string[]>>;

type TaskListRowPresentationContext = {
  task: TaskRecord;
  row: TaskTreeRow;
  rowDraft: TaskRecord | null;
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
const statusOrder: TaskStatus[] = ["waiting", "todo", "in_progress", "blocked", "done"];
const statusLabel: Record<TaskStatus, string> = {
  waiting: labelForStatus("waiting"),
  todo: labelForStatus("todo"),
  in_progress: labelForStatus("in_progress"),
  blocked: labelForStatus("blocked"),
  done: labelForStatus("done"),
};
const weekdayLabels = getWeekdayLabels();
const QUICK_CREATE_WIDTH_STORAGE_KEY_PREFIX = "architect-start.quick-create-widths:";
const QUICK_CREATE_SAVE_DELAY_MS = 250;
const TASK_LIST_LAYOUT_STORAGE_KEY_PREFIX = "architect-start.task-list-layout:";
const CATEGORICAL_FILTER_STORAGE_KEY_PREFIX = "architect-start.categorical-filter:";
const DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE = "hide-issue-id-overdue-badge";
const TASK_LIST_LAYOUT_SAVE_DELAY_MS = 250;
const TASK_LIST_ROW_AUTO_FIT_HIT_ZONE_PX = 14;
const editableTaskFormKeys = [
  "dueDate",
  "workType",
  "coordinationScope",
  "ownerDiscipline",
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
  issueTitle: "",
  reviewedAt: "",
  updatedAt: "",
  locationRef: "",
  calendarLinked: false,
  issueDetailNote: "",
  status: "waiting",
  decision: "",
  isDaily: true,
});

const createReadonlyFields: TaskFormReadonly = {
  actionId: true,
  updatedAt: true,
};

export function TaskWorkspace({ mode }: TaskWorkspaceProps) {
  const authUser = useAuthUser();
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const basePath = isPreview ? "/preview" : "";
  const searchParams = useSearchParams();
  const focusTaskId = searchParams.get("taskId");
  const {
    currentProjectId,
    projectName,
    projectLoaded,
    projectSource,
    isSyncing,
    workTypeDefinitions,
    categoryDefinitionsByField,
    workTypesLoaded,
  } = useProjectMeta();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedTrashTaskIds, setSelectedTrashTaskIds] = useState<string[]>([]);
  const [selectedTrashFileIds, setSelectedTrashFileIds] = useState<string[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskRecord | null>(null);
  const [draftDirtyFields, setDraftDirtyFields] = useState<DraftDirtyFieldMap>({});
  const [parentTaskNumberDraft, setParentTaskNumberDraft] = useState("");
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [selectedCategoricalFilters, setSelectedCategoricalFilters] = useState<DailyCategoricalFilterMap>({});
  const [draftCategoricalFilters, setDraftCategoricalFilters] = useState<DailyCategoricalFilterMap>({});
  const [openCategoricalFilterField, setOpenCategoricalFilterField] = useState<DailyCategoricalFilterFieldKey | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingVersionUpload, setPendingVersionUpload] = useState<File | null>(null);
  const [versionTargetId, setVersionTargetId] = useState("");
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isReorderingTasks, setIsReorderingTasks] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inlineSavingFields, setInlineSavingFields] = useState<Partial<Record<TaskListColumnKey, boolean>>>({});
  const [taskSortMode, setTaskSortMode] = useState<DailyTaskSortMode>("manual");
  const [isTaskOrderMenuOpen, setIsTaskOrderMenuOpen] = useState(false);
  const [taskFocusKey, setTaskFocusKey] = useState<TaskFocusKey | null>(null);
  const [hideIssueIdOverdueBadge, setHideIssueIdOverdueBadge] = useState(false);
  const [taskDragState, setTaskDragState] = useState<TaskDragState | null>(null);
  const [taskDropState, setTaskDropState] = useState<TaskDropState | null>(null);
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
  const [taskListRowHeights, setTaskListRowHeights] = useState<TaskListRowHeightMap>({});
  const quickCreateWidthsRef = useRef<ResolvedQuickCreateWidthMap>(resolveQuickCreateWidths());
  const taskListColumnWidthsRef = useRef<ResolvedTaskListColumnWidthMap>(resolveTaskListColumnWidths());
  const taskListRowHeightsRef = useRef<TaskListRowHeightMap>({});
  const quickCreateResizeStateRef = useRef<QuickCreateResizeState | null>(null);
  const taskListColumnResizeStateRef = useRef<TaskListColumnResizeState | null>(null);
  const taskListRowResizeStateRef = useRef<TaskListRowResizeState | null>(null);
  const taskListRowCellRefs = useRef<Map<string, Map<TaskListColumnKey, HTMLDivElement>>>(new Map());
  const dailyTreeRowsRef = useRef<TaskTreeRow[]>([]);
  const filesByTaskIdRef = useRef<Record<string, FileRecord[]>>({});
  const taskListVisibleTaskIdsRef = useRef<Set<string>>(new Set());
  const taskListLayoutInteractionVersionRef = useRef(0);
  const quickCreateSaveTimerRef = useRef<number | null>(null);
  const taskListLayoutSaveTimerRef = useRef<number | null>(null);
  const categoricalFilterStorageReadyKeyRef = useRef<string | null>(null);
  const dailyViewPreferenceReadyKeyRef = useRef<string | null>(null);
  const draftDirtyFieldsRef = useRef<DraftDirtyFieldMap>({});
  const draftRef = useRef<TaskRecord | null>(null);
  const parentTaskNumberDraftRef = useRef("");
  const selectedParentTaskRef = useRef<TaskRecord | null>(null);
  const selectedTaskRef = useRef<TaskRecord | null>(null);
  const previousSelectedTaskIdRef = useRef<string | null>(null);
  const isClearingSelectionRef = useRef(false);
  const saveSelectedTaskRef = useRef<() => Promise<boolean>>(async () => false);

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";
  const canExportTasks = mode === "daily" && !isPreview;
  const isMobileViewport = viewportWidth < MOBILE_BREAKPOINT;
  const isDetailDocked = viewportWidth >= DETAIL_PANEL_BREAKPOINT;
  const usesAgendaView = viewportWidth < TABLET_BREAKPOINT;
  const canCollapseCreateForm = viewportWidth < TABLET_BREAKPOINT;
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isDetailExpanded = detailPanelState === "expanded";
  const isInlineSaving = Object.values(inlineSavingFields).some(Boolean);
  const isExportDisabled = !canExportTasks || loading || saving || isExporting || isInlineSaving || isReorderingTasks;
  const quickCreateWidthStorageKey = authUser?.id ? getQuickCreateWidthStorageKey(authUser.id) : null;
  const taskListLayoutStorageKey = mode === "daily" && authUser?.id ? getTaskListLayoutStorageKey(authUser.id) : null;
  const categoricalFilterStorageBaseKey =
    mode === "daily" && currentProjectId && (authUser?.id || isPreview)
      ? getCategoricalFilterStorageBaseKey(authUser?.id ?? "preview", currentProjectId)
      : null;
  const issueIdOverdueBadgePreferenceStorageKey = categoricalFilterStorageBaseKey
    ? getDailyViewPreferenceStorageKey(categoricalFilterStorageBaseKey, DAILY_VIEW_PREFERENCE_HIDE_OVERDUE_BADGE)
    : null;
  const canPersistQuickCreateWidthsToServer = Boolean(authUser?.id) && !isPreview && !isLocalAuthPlaceholder;
  const canPersistTaskListLayoutToServer = mode === "daily" && Boolean(authUser?.id) && !isPreview && !isLocalAuthPlaceholder;
  const defaultCreateWorkType = useMemo(() => getWorkTypeSelectValue("coordination", workTypeDefinitions), [workTypeDefinitions]);
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

    setSelectedCategoricalFilters((previous) => ({
      ...previous,
      [openCategoricalFilterField]: normalizeTaskCategoricalFilterSelection(
        openCategoricalFilterField,
        effectiveDraftCategoricalFilters[openCategoricalFilterField],
        categoricalFieldContext,
      ),
    }));
    setOpenCategoricalFilterField(null);
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
  const buildDefaultTaskForm = useCallback(
    (): TaskFormState => ({
      ...defaultForm(),
      workType: defaultCreateWorkType,
    }),
    [defaultCreateWorkType],
  );

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    parentTaskNumberDraftRef.current = parentTaskNumberDraft;
  }, [parentTaskNumberDraft]);

  useEffect(() => {
    if (!pendingTaskListFocusCell) {
      return;
    }

    if (selectedTaskId !== pendingTaskListFocusCell.taskId || draft?.id !== pendingTaskListFocusCell.taskId) {
      return;
    }

    const rowRefs = taskListRowCellRefs.current.get(pendingTaskListFocusCell.taskId);
    const cell = rowRefs?.get(pendingTaskListFocusCell.columnKey);
    const editor = cell?.querySelector<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(
      'textarea, input:not([type="button"]), select, button[data-task-multiselect-trigger="true"]',
    );
    if (!editor) {
      return;
    }

    editor.focus({ preventScroll: true });
    if (editor instanceof HTMLTextAreaElement || (editor instanceof HTMLInputElement && editor.type === "text")) {
      editor.select();
    }
    setPendingTaskListFocusCell(null);
  }, [draft, pendingTaskListFocusCell, selectedTaskId]);

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
    setForm((previous) => {
      const normalizedCurrentValue = getWorkTypeSelectValue(previous.workType, workTypeDefinitions);
      const nextWorkType = normalizedCurrentValue || defaultCreateWorkType;
      if (nextWorkType === previous.workType) {
        return previous;
      }

      return {
        ...previous,
        workType: nextWorkType,
      };
    });
  }, [defaultCreateWorkType, workTypeDefinitions]);

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

  const applyTaskListLayout = useCallback((layout: TaskListLayoutPreference) => {
    const nextColumnWidths = resolveTaskListColumnWidths(layout.columnWidths);
    const nextRowHeights = pruneTaskListRowHeights(layout.rowHeights, taskListVisibleTaskIdsRef.current);
    taskListColumnWidthsRef.current = nextColumnWidths;
    taskListRowHeightsRef.current = nextRowHeights;
    setTaskListColumnWidths(nextColumnWidths);
    setTaskListRowHeights(nextRowHeights);
  }, []);

  const registerTaskListRowCellRef = useCallback((taskId: string, columnKey: TaskListColumnKey, node: HTMLDivElement | null) => {
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
  }, []);

  const persistTaskListLayout = useCallback(
    (
      nextColumnWidths: ResolvedTaskListColumnWidthMap = taskListColumnWidthsRef.current,
      nextRowHeights: TaskListRowHeightMap = taskListRowHeightsRef.current,
    ) => {
      if (!taskListLayoutStorageKey) return;

      const sanitizedLayout = sanitizeTaskListLayoutPreference({
        columnWidths: nextColumnWidths,
        rowHeights: pruneTaskListRowHeights(nextRowHeights, taskListVisibleTaskIdsRef.current),
      });

      taskListRowHeightsRef.current = sanitizedLayout.rowHeights;
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
    [canPersistTaskListLayoutToServer, taskListLayoutStorageKey],
  );

  const setTaskListRowHeight = useCallback(
    (taskId: string, nextHeight: number, shouldPersist = false) => {
      const clampedHeight = clampTaskListRowHeight(nextHeight);
      const currentHeight = taskListRowHeightsRef.current[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT;
      if (currentHeight === clampedHeight && !shouldPersist) {
        return;
      }

      taskListLayoutInteractionVersionRef.current += 1;
      const nextRowHeights = { ...taskListRowHeightsRef.current, [taskId]: clampedHeight };
      taskListRowHeightsRef.current = nextRowHeights;
      setTaskListRowHeights((prev) => {
        const prevHeight = prev[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT;
        if (prevHeight === clampedHeight) return prev;
        return { ...prev, [taskId]: clampedHeight };
      });

      if (shouldPersist) {
        persistTaskListLayout(taskListColumnWidthsRef.current, nextRowHeights);
      }
    },
    [persistTaskListLayout],
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
    });

    taskListRowHeightsRef.current = sanitizedLayout.rowHeights;
    writeTaskListLayoutToStorage(taskListLayoutStorageKey, sanitizedLayout);

    if (!canPersistTaskListLayoutToServer) return;

    void fetch("/api/preferences/task-list-layout", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitizedLayout),
      keepalive: true,
    }).catch(() => {});
  }, [canPersistTaskListLayoutToServer, taskListLayoutStorageKey]);
  const autoFitTaskListRow = useCallback(
    (taskId: string) => {
      const row = dailyTreeRowsRef.current.find((entry) => entry.task.id === taskId);
      if (!row) {
        setTaskListRowHeight(taskId, TASK_LIST_ROW_MIN_HEIGHT, true);
        return;
      }

      const taskFiles = filesByTaskIdRef.current[taskId] ?? [];
      const linkedDocumentsDisplay = formatLinkedDocumentsSummary(taskFiles);
      const rowDraft = selectedTaskId === taskId && draft?.id === taskId ? draft : null;
      const nextHeight = measureTaskListRowHeight(
        createTaskListRowPresentationContext({
          task: row.task,
          row,
          rowDraft,
          linkedDocumentsDisplay,
          workTypeDefinitions,
          categoryDefinitionsByField,
        }),
        taskListColumnWidthsRef.current,
      );
      setTaskListRowHeight(taskId, nextHeight, true);
    },
    [draft, selectedTaskId, setTaskListRowHeight, workTypeDefinitions],
  );

  const handleTaskListRowAutoFitDoubleClick = useCallback(
    (taskId: string, event: ReactMouseEvent<HTMLElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.bottom - event.clientY > TASK_LIST_ROW_AUTO_FIT_HIT_ZONE_PX) {
        return;
      }

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

  const handleTaskListRowResizeMove = useCallback((event: PointerEvent) => {
    const resizeState = taskListRowResizeStateRef.current;
    if (!resizeState) return;
    setTaskListRowHeight(resizeState.taskId, resizeState.startHeight + event.clientY - resizeState.startY);
  }, [setTaskListRowHeight]);

  const handleTaskListRowResizeEnd = useCallback(() => {
    if (!taskListRowResizeStateRef.current) return;

    taskListRowResizeStateRef.current = null;
    window.removeEventListener("pointermove", handleTaskListRowResizeMove);
    window.removeEventListener("pointerup", handleTaskListRowResizeEnd);
    window.removeEventListener("pointercancel", handleTaskListRowResizeEnd);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persistTaskListLayout(taskListColumnWidthsRef.current, taskListRowHeightsRef.current);
  }, [handleTaskListRowResizeMove, persistTaskListLayout]);

  const handleTaskListRowResizeStart = useCallback(
    (taskId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      handleTaskListRowResizeEnd();

      taskListRowResizeStateRef.current = {
        taskId,
        startY: event.clientY,
        startHeight: taskListRowHeightsRef.current[taskId] ?? TASK_LIST_ROW_MIN_HEIGHT,
      };

      window.addEventListener("pointermove", handleTaskListRowResizeMove);
      window.addEventListener("pointerup", handleTaskListRowResizeEnd);
      window.addEventListener("pointercancel", handleTaskListRowResizeEnd);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [handleTaskListRowResizeEnd, handleTaskListRowResizeMove],
  );

  useEffect(() => {
    taskListColumnWidthsRef.current = taskListColumnWidths;
  }, [taskListColumnWidths]);

  useEffect(() => {
    taskListRowHeightsRef.current = taskListRowHeights;
  }, [taskListRowHeights]);

  useEffect(() => {
    if (!taskListLayoutStorageKey) {
      applyTaskListLayout({ columnWidths: {}, rowHeights: {} });
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
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
  }, [flushTaskListLayoutSave, handleTaskListColumnResizeEnd, handleTaskListColumnResizeMove, handleTaskListRowResizeEnd, handleTaskListRowResizeMove]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    if (isPreview) {
      // Preview mode never hits live APIs. It should stay stable even when auth or backend config is missing.
      const nextTasks = scope === "trash" ? previewTasks.filter((task) => task.deletedAt) : previewTasks.filter((task) => !task.deletedAt);
      const nextFiles = scope === "trash" ? previewFiles.filter((file) => file.deletedAt) : previewFiles.filter((file) => !file.deletedAt);

      setTasks(nextTasks);
      setFiles(nextFiles);
      setSystemMode(previewSystemMode);
      setSelectedTaskId((prev) => {
        if (focusTaskId && nextTasks.some((task) => task.id === focusTaskId)) return focusTaskId;
        if (prev && nextTasks.some((task) => task.id === prev)) return prev;
        return nextTasks[0]?.id ?? null;
      });
      setLoading(false);
      return;
    }

    try {
      const [taskResponse, fileResponse, statusResponse] = await Promise.all([
        fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
        fetch(`/api/files${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
        fetch("/api/system/status", { cache: "no-store" }),
      ]);

      if (!taskResponse.ok) {
        throw new Error(await readErrorMessage(taskResponse, "loadTasksFailed"));
      }
      if (!fileResponse.ok) {
        throw new Error(await readErrorMessage(fileResponse, "loadFilesFailed"));
      }

      const taskJson = (await taskResponse.json()) as { data: TaskRecord[] };
      const fileJson = (await fileResponse.json()) as { data: FileRecord[] };
      const statusJson = statusResponse.ok ? ((await statusResponse.json()) as { data: SystemMode }) : { data: null };

      setTasks(taskJson.data);
      setFiles(fileJson.data);
      setSystemMode(statusJson.data ?? null);
      setSelectedTaskId((prev) => {
        if (focusTaskId && taskJson.data.some((task) => task.id === focusTaskId)) return focusTaskId;
        if (prev && taskJson.data.some((task) => task.id === prev)) return prev;
        return taskJson.data[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : localizeError({ fallbackKey: "loadDashboardFailed" }));
    } finally {
      setLoading(false);
    }
  }, [focusTaskId, isPreview, scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  useEffect(() => {
    dailyTreeRowsRef.current = dailyTreeRows;
  }, [dailyTreeRows]);

  const taskListTableWidth = useMemo(() => dailyTaskListColumns.reduce((total, column) => total + taskListColumnWidths[column.key], 0), [taskListColumnWidths]);
  const taskById = useMemo(() => new Map(sortedTasks.map((task) => [task.id, task])), [sortedTasks]);
  const selectedTask = useMemo(() => sortedTasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, sortedTasks]);

  useEffect(() => {
    if (mode !== "daily") {
      return;
    }

    setSelectedTaskId((previous) => {
      if (previous && visibleDailyTasks.some((task) => task.id === previous)) {
        return previous;
      }

      return visibleDailyTasks[0]?.id ?? null;
    });
  }, [mode, visibleDailyTasks]);

  useEffect(() => {
    selectedTaskRef.current = selectedTask;
  }, [selectedTask]);
  const selectedParentTask = useMemo(() => {
    if (!selectedTask?.parentTaskId) return null;
    return taskById.get(selectedTask.parentTaskId) ?? null;
  }, [selectedTask, taskById]);

  useEffect(() => {
    selectedParentTaskRef.current = selectedParentTask;
  }, [selectedParentTask]);
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
  const tasksByDueDate = useMemo(() => {
    return calendarTasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
      if (!task.dueDate) return acc;
      if (!acc[task.dueDate]) acc[task.dueDate] = [];
      acc[task.dueDate].push(task);
      return acc;
    }, {});
  }, [calendarTasks]);
  const selectedFiles = useMemo(() => (selectedTask ? filesByTaskId[selectedTask.id] ?? [] : []), [filesByTaskId, selectedTask]);
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
    taskListVisibleTaskIdsRef.current = new Set((mode === "daily" ? visibleDailyTasks : tasks).map((task) => task.id));
  }, [mode, tasks, visibleDailyTasks]);


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

  const focusedTaskIds = useMemo(
    () => (taskFocusKey ? new Set(sortedTasks.filter((task) => matchesTaskFocus(task, taskFocusKey, currentDayKey)).map((task) => task.id)) : null),
    [currentDayKey, sortedTasks, taskFocusKey],
  );
  const boardGroups = useMemo(
    () => statusOrder.map((status) => ({ status, items: sortedTasks.filter((task) => task.status === status) })),
    [sortedTasks],
  );
  const boardSummary = useMemo(() => {
    const overdueCount = sortedTasks.filter((task) => isTaskOverdue(task, currentDayKey)).length;
    const byStatus = statusOrder.reduce(
      (acc, status) => ({ ...acc, [status]: sortedTasks.filter((task) => task.status === status).length }),
      {} as Record<TaskStatus, number>,
    );

    return {
      total: sortedTasks.length,
      overdue: overdueCount,
      byStatus,
      todo: sortedTasks.filter((task) => task.status === "todo").length,
      inProgress: sortedTasks.filter((task) => task.status === "in_progress").length,
      blocked: sortedTasks.filter((task) => task.status === "blocked").length,
    };
  }, [currentDayKey, sortedTasks]);
  const boardFocusItems = useMemo(
    () => [
      { key: "todo", label: labelForStatus("todo"), count: boardSummary.todo, tone: "accent" as const },
      { key: "in_progress", label: labelForStatus("in_progress"), count: boardSummary.inProgress, tone: "success" as const },
      { key: "blocked", label: labelForStatus("blocked"), count: boardSummary.blocked, tone: "warn" as const },
      { key: "overdue", label: t("workspace.overdueLabel"), count: boardSummary.overdue, tone: "warn" as const },
    ],
    [boardSummary.blocked, boardSummary.inProgress, boardSummary.overdue, boardSummary.todo],
  );
  const boardSummaryCards = useMemo(
    () => [
      { key: "total", label: t("workspace.totalLabel"), value: boardSummary.total },
      { key: "waiting", label: labelForStatus("waiting"), value: boardSummary.byStatus.waiting },
      { key: "todo", label: labelForStatus("todo"), value: boardSummary.byStatus.todo },
      { key: "in_progress", label: labelForStatus("in_progress"), value: boardSummary.byStatus.in_progress },
      { key: "overdue", label: t("workspace.overdueLabel"), value: boardSummary.overdue, tone: "warn" as const, className: "board-summary__card--warn" },
    ],
    [boardSummary],
  );
  const boardOverviewGroups = boardGroups.map((group) => ({
    status: group.status,
    label: statusLabel[group.status],
    description: boardColumnCopy(group.status),
    emptyLabel: t("empty.noTaskInState"),
    items: group.items.map((task) => {
      const taskFiles = filesByTaskId[task.id] ?? [];
      const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
      const isDimmed = Boolean(focusedTaskIds && !focusedTaskIds.has(task.id));
      const isOverdue = isTaskOverdue(task, currentDayKey);

      return {
        id: task.id,
        displayId: formatTaskDisplayId(task),
        title: task.issueTitle,
        description: task.issueDetailNote || t("empty.noDescription"),
        dueDateLabel: task.dueDate || "-",
        workTypeLabel: labelForWorkType(task.workType, workTypeDefinitions),
        assigneeLabel: task.assignee || t("empty.unassigned"),
        fileCountLabel: t("workspace.fileCount", { count: taskFiles.length }),
        status: task.status,
        isActive: task.id === selectedTaskId,
        className: clsx(
          task.status === "done" && "task-state-card--done",
          isDimmed && "task-state-card--dimmed",
          isOverdue && "task-state-card--overdue",
        ),
        secondaryBadge: deadlineBadge ? (
          <span className={clsx("task-state__deadline-badge", `task-state__deadline-badge--${deadlineBadge.tone}`)}>
            {deadlineBadge.label}
          </span>
        ) : null,
        actions: (
          <>
            <button
              className="secondary-button"
              disabled={task.status === statusOrder[0]}
              onClick={(event) => {
                event.stopPropagation();
                void shiftTaskStatus(task, -1);
              }}
              type="button"
            >
              {t("actions.back")}
            </button>
            <button
              className="primary-button"
              disabled={task.status === statusOrder[statusOrder.length - 1]}
              onClick={(event) => {
                event.stopPropagation();
                void shiftTaskStatus(task, 1);
              }}
              type="button"
            >
              {t("actions.next")}
            </button>
          </>
        ),
      };
    }),
  }));
  const calendarBaseDate = useMemo(() => {
    const firstDueDate = calendarTasks.find((task) => task.dueDate)?.dueDate;
    return firstDueDate ? parseISO(firstDueDate) : new Date();
  }, [calendarTasks]);
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
      }),
    [calendarBaseDate],
  );
  const agendaGroups = useMemo(() => {
    return Object.entries(tasksByDueDate)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([dayKey, items]) => ({
        dayKey,
        date: parseISO(dayKey),
        items: sortTasksByActionId(items),
      }));
  }, [tasksByDueDate]);

  function updateForm<K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDraftForm<K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) {
    if (draftRef.current) {
      draftRef.current = { ...draftRef.current, [key]: value };
    }
    markDraftFieldDirty(key);
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateParentTaskNumberDraft(value: string) {
    parentTaskNumberDraftRef.current = value;
    markDraftFieldDirty("parentTaskNumber");
    setParentTaskNumberDraft(value);
  }

  function applyTaskServerUpdate(updatedTask: TaskRecord, clearedDirtyFields: readonly DraftDirtyField[] = []) {
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
  }

  function resetSelectedTaskDraft() {
    if (!selectedTask) return;
    resetDraftDirtyFields();
    setDraft(toDraftTask(selectedTask));
    setParentTaskNumberDraft(selectedParentTask ? formatTaskDisplayId(selectedParentTask) : "");
  }

  async function createTaskFromForm(nextForm: TaskFormState) {
    setErrorMessage(null);

    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const payload: TaskFormState = {
      ...nextForm,
      workType: getWorkTypeSelectValue(nextForm.workType, workTypeDefinitions) || defaultCreateWorkType,
    };

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "createTaskFailed"));
      return;
    }

    const json = (await response.json()) as { data: TaskRecord };
    await loadData();
    setSelectedTaskId(json.data.id);
    setForm(buildDefaultTaskForm());
    if (canCollapseCreateForm) {
      setIsCreateFormOpen(false);
    }
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

    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
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
          await loadData();
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

  async function reorderDailyTasks(
    command:
      | {
          action: "manual_move";
          movedTaskId: string;
          targetParentTaskId: string | null;
          targetIndex: number;
        }
      | {
          action: "auto_sort";
          strategy: "priority" | "action_id";
        },
    nextMode: DailyTaskSortMode,
  ) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
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
      const response = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });

      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "updateTaskFailed"));
        return false;
      }

      const json = (await response.json()) as { data: TaskRecord[] };
      setTasks(json.data);
      setTaskSortMode(nextMode);
      if (command.action === "manual_move") {
        setSelectedTaskId(command.movedTaskId);
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
  }

  async function moveTaskByOffset(taskId: string, offset: -1 | 1) {
    if (hasActiveDailyFilters) {
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
  }

  function handleTaskRowDragStart(task: TaskRecord, event: ReactDragEvent<HTMLButtonElement>) {
    if (hasActiveDailyFilters || isMobileViewport || isReorderingTasks) {
      event.preventDefault();
      return;
    }

    setTaskDragState({ taskId: task.id, parentTaskId: task.parentTaskId ?? null });
    setTaskDropState(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", task.id);
  }

  function handleTaskRowDragOver(task: TaskRecord, event: ReactDragEvent<HTMLTableRowElement>) {
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
  }

  async function handleTaskRowDrop(task: TaskRecord, event: ReactDragEvent<HTMLTableRowElement>) {
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
  }

  function renderTaskListHeaderControl(column: TaskListColumnConfig) {
    if (column.headerControl?.kind === "sortMenu") {
      return (
        <TaskListOrderHeaderMenu
          actions={[
            {
              key: "manual",
              label: "수동 정렬 유지",
              description: "직접 옮긴 현재 순서를 유지합니다.",
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
              label: "Issue ID 순으로 복원",
              description: "기본 이슈 번호 순서로 다시 정렬합니다.",
              onSelect: () => {
                void reorderDailyTasks({ action: "auto_sort", strategy: "action_id" }, "auto");
              },
            },
          ]}
          ariaLabel="업무 정렬 메뉴"
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

  async function patchTask(
    task: Pick<TaskRecord, "id" | "version">,
    payload: Partial<TaskRecord>,
    options: {
      clearedDirtyFields?: readonly DraftDirtyField[];
      fallbackKey?: ErrorCopyKey;
    } = {},
  ) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
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
        await loadData();
      }
      return null;
    }

    const json = (await response.json()) as { data: TaskRecord };
    applyTaskServerUpdate(json.data, options.clearedDirtyFields ?? []);
    setSelectedTaskId(task.id);
    return json.data;
  }

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

  async function saveInlineTaskListField(columnKey: TaskListColumnKey) {
    const field = getEditableTaskListField(columnKey);
    const currentDraft = draftRef.current;
    const currentTask = selectedTaskRef.current;
    if (!field || !currentDraft || !currentTask || currentDraft.id !== currentTask.id) return;
    if (inlineSavingFields[columnKey]) return;

    if (Object.is(currentDraft[field], currentTask[field])) {
      clearDraftDirtyFields([field]);
      return;
    }

    setInlineSavingFields((previous) => ({ ...previous, [columnKey]: true }));

    try {
      await patchTask(currentDraft, { [field]: currentDraft[field] } as Partial<TaskRecord>, { clearedDirtyFields: [field] });
    } finally {
      setInlineSavingFields((previous) => clearInlineSavingFieldMap(previous, columnKey));
    }
  }
  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statusOrder.length) return;
    await patchTask(task, { status: statusOrder[nextIndex] });
  }

  async function moveToTrash(taskId: string) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "moveTaskToTrashFailed"));
      return;
    }
    await loadData();
  }

  async function restoreTask(taskId: string) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "restoreTaskFailed"));
      return;
    }
    await loadData();
  }

  async function uploadFileForTask(taskId: string, file: File) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("taskId", taskId);
    const response = await fetch("/api/upload", { method: "POST", body });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "uploadFileFailed"));
      return;
    }
    await loadData();
  }

  async function uploadSelectedFile() {
    if (!selectedTask || !pendingUpload) return;
    await uploadFileForTask(selectedTask.id, pendingUpload);
    setPendingUpload(null);
  }

  async function uploadNextVersion() {
    if (!versionTargetId || !pendingVersionUpload) return;
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

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

    setPendingVersionUpload(null);
    await loadData();
  }

  async function moveFileToTrash(fileId: string) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "moveFileToTrashFailed"));
      return;
    }
    await loadData();
  }

  async function restoreFile(fileId: string) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "restoreFileFailed"));
      return;
    }
    await loadData();
  }

  async function deleteTaskPermanently(task: TaskRecord) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const confirmed = window.confirm(
      t("workspace.deleteTaskPermanentlyConfirm", {
        name: `${formatTaskDisplayId(task)} ${task.issueTitle}`.trim(),
      }),
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "deleteTaskFailed"));
      return;
    }

    await loadData();
  }

  async function deleteFilePermanently(file: FileRecord) {
    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const confirmed = window.confirm(
      t("workspace.deleteFilePermanentlyConfirm", {
        name: file.originalName,
        version: file.versionLabel,
      }),
    );

    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(file.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "deleteFileFailed"));
      return;
    }

    await loadData();
  }

  async function deleteSelectedTrashItems() {
    if (selectedTrashCount === 0) {
      return;
    }

    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const confirmed = window.confirm(
      t("workspace.deleteSelectedConfirm", {
        taskCount: selectedTrashTaskIds.length,
        fileCount: selectedTrashFileIds.length,
      }),
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
    await loadData();
  }

  async function emptyTrashItems() {
    if (trashItems.length === 0) {
      return;
    }

    if (isPreview) {
      setErrorMessage(t("errors.previewMutationNotAllowed"));
      return;
    }

    const confirmed = window.confirm(t("workspace.emptyTrashConfirm"));
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
    await loadData();
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

  function expandDetailPanel() {
    setDetailPanelState("expanded");
  }

  function collapseDetailPanel() {
    setDetailPanelState("collapsed");
  }

  function pinDetailPanel() {
    setIsDetailPanelSticky(true);
    expandDetailPanel();
  }

  function closeDetailPanel() {
    setIsDetailPanelSticky(false);
    setDetailPanelState("collapsed");
  }

  function selectTask(taskId: string) {
    setSelectedTaskId(taskId);
  }

  function focusTaskListEditableCell(taskId: string, columnKey: TaskListColumnKey) {
    setPendingTaskListFocusCell({ taskId, columnKey });
    setSelectedTaskId(taskId);
  }

  function toggleTaskDetails(taskId: string) {
    if (selectedTaskId === taskId && isDetailExpanded) {
      closeDetailPanel();
      return;
    }

    setSelectedTaskId(taskId);
    pinDetailPanel();
  }

  const clearTaskSelection = useCallback(() => {
    setPendingTaskListFocusCell(null);
    setSelectedTaskId(null);
    setIsDetailPanelSticky(false);
    setDetailPanelState("collapsed");
  }, []);

  function hasSelectedTaskDraftChanges() {
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
  }

  function handleWorkspaceBackgroundClick(event: ReactMouseEvent<HTMLElement>) {
    if (mode !== "daily" || !isDetailExpanded) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const keepOpenSelector = [
      ".detail-panel",
      "tr",
      "td",
      "th",
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
      ".composer-card__toggle",
    ].join(", ");

    if (target.closest(keepOpenSelector)) return;
    closeDetailPanel();
  }

  useEffect(() => {
    if (mode !== "daily" || isMobileViewport || !selectedTaskId) {
      return;
    }

    async function clearTaskSelectionFromOutsideClick() {
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

      if (hasSelectedTaskDraftChanges()) {
        if (saving || isClearingSelectionRef.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        void clearTaskSelectionFromOutsideClick();
        return;
      }

      clearTaskSelection();
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
    };
  }, [clearTaskSelection, isMobileViewport, mode, saving, selectedTaskId]);

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

  return (
    <section className={clsx("workspace", `workspace--${mode}`)}>
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
        {isTrashMode ? (
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

      {errorMessage ? <p className="detail-panel__warning detail-panel__warning--error">{errorMessage}</p> : null}
      {loading ? (
        <div className="empty-state">
          <h3>{t("workspace.loading")}</h3>
        </div>
      ) : (
        <div
          className={clsx(
            "workspace__body",
            mode !== "daily" && "workspace__body--single",
            mode === "daily" && !isDetailDocked && "workspace__body--stacked",
            mode === "daily" && isDetailDocked && isDetailExpanded && "workspace__body--detail-expanded",
            mode === "daily" && isDetailDocked && !isDetailExpanded && "workspace__body--detail-collapsed",
          )}
          onClickCapture={handleWorkspaceBackgroundClick}
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
                  ariaLabel: "업무 집중 영역",
                  description: "지금 처리해야 할 일과 병목을 먼저 확인합니다.",
                  items: boardFocusItems,
                  onSelect: (key) => setTaskFocusKey((previous) => (previous === key ? null : (key as TaskFocusKey))),
                  title: "집중 영역",
                }}
                groups={boardOverviewGroups}
                metaLabels={{
                  assignee: labelForField("assignee"),
                  dueDate: labelForField("dueDate"),
                  fileCount: labelForField("linkedDocuments"),
                  workType: labelForField("workType"),
                }}
                onTaskSelect={selectTask}
                summaryCards={boardSummaryCards}
              />
            ) : null}

            {mode === "daily" ? (
              <>
                <section className="composer-card">
                  <div className="composer-card__header">
                    <div>
                      <p className="workspace__eyebrow">{t("workspace.quickCreateEyebrow")}</p>
                      <h3>{t("workspace.quickCreateTitle")}</h3>
                      <p className="workspace__meta">{t("workspace.quickCreateBody")}</p>
                    </div>
                    <button className="secondary-button composer-card__toggle" onClick={() => setIsCreateFormOpen((prev) => !prev)} type="button">
                      {isCreateFormOpen ? t("actions.hideForm") : t("actions.showForm")}
                    </button>
                  </div>

                  {isCreateFormOpen ? (
                    <div className="composer-card__body">
                      <div className="composer-scroll-view">
                        <TaskFormFields
                          form={form}
                          layout="composer"
                          onChange={updateForm}
                          onComposerResizeStart={handleQuickCreateResizeStart}
                          quickCreateWidths={quickCreateWidths}
                          readonly={createReadonlyFields}
                          showOwnerDiscipline={false}
                          showUpdatedAt={false}
                          categoryDefinitionsByField={categoryDefinitionsByField}
                          workTypeDefinitions={workTypeDefinitions}
                        />
                      </div>
                      <div className="detail-actions detail-actions--inline">
                        <button className="primary-button" onClick={() => void createTaskFromForm(form)} type="button">
                          {t("actions.createTask")}
                        </button>
                        {canCollapseCreateForm ? (
                          <button className="secondary-button" onClick={() => setIsCreateFormOpen(false)} type="button">
                            {t("actions.keepListVisible")}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="daily-sheet__focus">
                  <div className="daily-sheet__focus-header">
                    <div>
                      <p className="workspace__eyebrow">집중 영역</p>
                      <p className="workspace__meta">실행 순서를 바꾸기 전에 우선 처리군을 먼저 확인합니다.</p>
                    </div>
                  </div>
                  <p className="daily-sheet__focus-copy">{t("workspace.dailyFocusSummary")}</p>
                  <TaskFocusStrip
                    activeKey={taskFocusKey}
                    ariaLabel="일일 실행 집중 영역"
                    className="daily-sheet__focus-strip"
                    items={boardFocusItems}
                    onSelect={(key) => setTaskFocusKey((previous) => (previous === key ? null : (key as TaskFocusKey)))}
                    variant="compact"
                  />
                </section>

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
                      {dailyTreeRows.map((row) => {
                        const task = row.task;
                        const isChildTask = row.depth > 0;
                        const isParentTask = row.hasChildren;
                        const isBranchTask = isChildTask && isParentTask;
                        const taskFiles = filesByTaskId[task.id] ?? [];
                        const linkedDocumentsDisplay = formatLinkedDocumentsSummary(taskFiles);
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
                            <div className="daily-task-card__reorder-actions">
                              <button
                                aria-label="위로 이동"
                                className="secondary-button"
                                disabled={hasActiveDailyFilters || isReorderingTasks}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void moveTaskByOffset(task.id, -1);
                                }}
                                type="button"
                              >
                                ↑
                              </button>
                              <button
                                aria-label="아래로 이동"
                                className="secondary-button"
                                disabled={hasActiveDailyFilters || isReorderingTasks}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void moveTaskByOffset(task.id, 1);
                                }}
                                type="button"
                              >
                                ↓
                              </button>
                            </div>
                          </div>
                          </article>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className={clsx("sheet-wrapper", dailyTreeRows.length === 0 && "sheet-wrapper--daily-empty")}>
                    <table className="sheet-table sheet-table--expanded" style={{ minWidth: `${taskListTableWidth}px`, width: `${taskListTableWidth}px` }}>
                      <colgroup>
                        {dailyTaskListColumns.map((column) => (
                          <col key={column.key} style={{ width: `${taskListColumnWidths[column.key]}px` }} />
                        ))}
                      </colgroup>
                      <thead>
                        <tr>
                          {dailyTaskListColumns.map((column) => (
                            <th className={column.className} key={column.key}>
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
                        {dailyTreeRows.map((row) => {
                          const task = row.task;
                          const taskFiles = filesByTaskId[task.id] ?? [];
                          const linkedDocumentsDisplay = formatLinkedDocumentsSummary(taskFiles);
                          const rowHeight = taskListRowHeights[task.id] ?? TASK_LIST_ROW_MIN_HEIGHT;
                          const rowResizeAria = t("workspace.resizeFieldAria", { field: formatTaskDisplayId(task) });
                          const rowAutoFitAria = rowResizeAria;
                          const isSelectedRow = task.id === selectedTaskId;
                          const isOverdueRow = isTaskOverdue(task, currentDayKey);
                          const deadlineBadge = resolveTaskDeadlineBadge(task, currentDayKey);
                          const isDimmedRow = Boolean(focusedTaskIds && !focusedTaskIds.has(task.id));
                          const rowDraft = isSelectedRow && draft?.id === task.id ? draft : null;
                          const rowPresentationContext = createTaskListRowPresentationContext({
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
                                    <button
                                      aria-label="행 순서 변경"
                                      className="task-tree__drag-handle"
                                      disabled={hasActiveDailyFilters || isReorderingTasks}
                                      draggable={!hasActiveDailyFilters && !isReorderingTasks}
                                      onClick={(event) => event.stopPropagation()}
                                      onDragEnd={() => {
                                        setTaskDragState(null);
                                        setTaskDropState(null);
                                      }}
                                      onDragStart={(event) => handleTaskRowDragStart(task, event)}
                                      type="button"
                                    >
                                      ⋮⋮
                                    </button>
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
                                    {isSelectedRow ? (
                                      <span className="task-tree__actions">
                                        <button
                                          aria-label="위로 이동"
                                          className="task-tree__move-button"
                                          disabled={hasActiveDailyFilters || isReorderingTasks}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void moveTaskByOffset(task.id, -1);
                                          }}
                                          type="button"
                                        >
                                          ↑
                                        </button>
                                        <button
                                          aria-label="아래로 이동"
                                          className="task-tree__move-button"
                                          disabled={hasActiveDailyFilters || isReorderingTasks}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void moveTaskByOffset(task.id, 1);
                                          }}
                                          type="button"
                                        >
                                          ↓
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
                                if (!rowDraft) return null;
                                return (
                                  <TaskListInlineEditor
                                    columnKey={columnKey}
                                    fieldKey={presentation.fieldKey}
                                    form={rowDraft}
                                    onChange={updateDraftForm}
                                    onCommit={saveInlineTaskListField}
                                    saving={Boolean(inlineSavingFields[columnKey])}
                                    categoryDefinitionsByField={categoryDefinitionsByField}
                                    workTypeDefinitions={workTypeDefinitions}
                                  />
                                );
                              case "editable-checkbox":
                                if (!rowDraft) return null;
                                return (
                                  <TaskListInlineEditor
                                    columnKey={columnKey}
                                    fieldKey="calendarLinked"
                                    form={rowDraft}
                                    onChange={updateDraftForm}
                                    onCommit={saveInlineTaskListField}
                                    saving={Boolean(inlineSavingFields[columnKey])}
                                  />
                                );
                              case "editable-categorical":
                                if (!rowDraft) return null;
                                return (
                                  <TaskListInlineEditor
                                    columnKey={columnKey}
                                    fieldKey={presentation.fieldKey}
                                    form={rowDraft}
                                    onChange={updateDraftForm}
                                    onCommit={saveInlineTaskListField}
                                    saving={Boolean(inlineSavingFields[columnKey])}
                                    categoryDefinitionsByField={categoryDefinitionsByField}
                                    workTypeDefinitions={workTypeDefinitions}
                                  />
                                );
                            }
                          };

                          const renderTaskListCell = (column: TaskListColumnConfig) => {
                            const editableField = getEditableTaskListField(column.key);
                            const presentation = buildTaskListCellPresentation(column.key, rowPresentationContext);
                            const isEditableCell = isEditableTaskListCellPresentation(presentation);

                            return (
                              <td className={column.className} key={column.key} onClick={editableField ? () => focusTaskListEditableCell(task.id, column.key) : undefined}>
                                <div
                                  className={clsx("sheet-table__cell-shell", column.key === "actionId" && "sheet-table__cell-shell--tree")}
                                  ref={(node) => registerTaskListRowCellRef(task.id, column.key, node)}
                                  style={{ height: `${rowHeight}px` }}
                                >
                                  <div
                                    className={clsx(
                                      "sheet-table__cell-content",
                                      isEditableCell && "sheet-table__cell-content--editable",
                                      isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
                                    )}
                                  >
                                    {renderTaskListCellContent(column.key, presentation)}
                                  </div>
                                  <button
                                    aria-label={rowResizeAria}
                                    className="sheet-table__row-resize-handle"
                                    onDoubleClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      autoFitTaskListRow(task.id);
                                    }}
                                    onPointerDown={(event) => handleTaskListRowResizeStart(task.id, event)}
                                    title={rowAutoFitAria}
                                    type="button"
                                  />
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
                                taskDropState?.taskId === task.id && `task-state-row--drop-${taskDropState.position}`,
                              )}
                              data-task-row-id={task.id}
                              key={task.id}
                              onClick={() => selectTask(task.id)}
                              onDragOver={(event) => handleTaskRowDragOver(task, event)}
                              onDrop={(event) => void handleTaskRowDrop(task, event)}
                              onDoubleClick={() => toggleTaskDetails(task.id)}
                              onDoubleClickCapture={(event) => handleTaskListRowAutoFitDoubleClick(task.id, event)}
                            >
                              {dailyTaskListColumns.map((column) => renderTaskListCell(column))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}

            {mode === "calendar" ? (
              usesAgendaView ? (
                <div className="calendar-agenda">
                  {agendaGroups.length === 0 ? (
                    <div className="empty-state">
                      <h3>{t("empty.noScheduledTasks")}</h3>
                      <p>{t("empty.noScheduledTasksBody")}</p>
                    </div>
                  ) : (
                    agendaGroups.map((group) => (
                      <section className="calendar-agenda__day" key={group.dayKey}>
                        <header className="calendar-agenda__header">
                          <div>
                            <h3>{formatMonthDay(group.date)}</h3>
                            <p>{formatWeekdayLong(group.date)}</p>
                          </div>
                          <span>{group.items.length}</span>
                        </header>
                        <div className="calendar-agenda__items">
                          {group.items.map((task) => (
                            <Link className="calendar-link" href={`${basePath}/daily?taskId=${task.id}` as Route} key={task.id}>
                              <strong>{formatTaskDisplayId(task)}</strong>
                              <span>{task.issueTitle}</span>
                              <small>
                                {t("workspace.agendaMeta", { status: statusLabel[task.status], assignee: task.assignee || t("empty.unassigned") })}
                              </small>
                            </Link>
                          ))}
                        </div>
                      </section>
                    ))
                  )}
                </div>
              ) : (
                <div className="calendar-month">
                  <div className="calendar-weekdays">
                    {weekdayLabels.map((label) => (
                      <span className="calendar-weekdays__label" key={label}>
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="calendar-grid">
                    {calendarDays.map((day) => {
                      const dayKey = format(day, "yyyy-MM-dd");
                      const dayTasks = tasksByDueDate[dayKey] ?? [];

                      return (
                        <article className={clsx("calendar-cell", !isSameMonth(day, calendarBaseDate) && "calendar-cell--muted", isToday(day) && "calendar-cell--today")} key={dayKey}>
                          <header>
                            <span>{format(day, "d")}</span>
                            <small>{formatDay(day)}</small>
                          </header>
                          <div className="calendar-cell__items">
                            {dayTasks.map((task) => (
                              <Link className="calendar-link" href={`${basePath}/daily?taskId=${task.id}` as Route} key={task.id}>
                                {formatTaskDisplayId(task)} {task.issueTitle}
                              </Link>
                            ))}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )
            ) : null}

            {mode === "trash" ? (
              <div className="trash-list">
                {trashItems.length === 0 ? <div className="board-column__empty">{t("empty.noDeletedTasks")}</div> : null}
                {trashItems.map((item) => {
                  const isTask = item.kind === "task";
                  const checked = isTask ? selectedTrashTaskIdSet.has(item.id) : selectedTrashFileIdSet.has(item.id);

                  return (
                    <article className={clsx("trash-card", checked && "trash-card--selected")} key={`${item.kind}:${item.id}`}>
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
                            <p>{item.file.downloadUrl ? t("workspace.downloadAvailable") : t("workspace.privateStorage")}</p>
                            <small>{t("workspace.deletedDateMeta", { date: fileSafeDate(item.file.deletedAt) })}</small>
                          </>
                        )}
                      </div>
                      <div className="trash-card__actions">
                        {isTask ? (
                          <>
                            <button className="primary-button" onClick={() => void restoreTask(item.task.id)} type="button">
                              {t("actions.restore")}
                            </button>
                            <button className="danger-button" onClick={() => void deleteTaskPermanently(item.task)} type="button">
                              {t("actions.deletePermanently")}
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="primary-button" onClick={() => void restoreFile(item.file.id)} type="button">
                              {t("actions.restore")}
                            </button>
                            <button className="danger-button" onClick={() => void deleteFilePermanently(item.file)} type="button">
                              {t("actions.deletePermanently")}
                            </button>
                          </>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </div>

          {mode === "daily" ? (
            <aside
              className={clsx(
                "detail-panel",
                isDetailDocked ? "detail-panel--docked" : "detail-panel--stacked",
                !isDetailDocked && "detail-panel--below",
                isDetailExpanded ? "detail-panel--expanded" : "detail-panel--collapsed",
              )}
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
                      <p className="workspace__eyebrow">{t("workspace.taskDetailsTitle")}</p>
                      <h3>{detailSummary}</h3>
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
                {selectedTask && !isTrashMode && isDetailExpanded ? (
                  <div className="detail-panel__header-secondary-actions">
                    <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">
                      {t("actions.moveToTrash")}
                    </button>
                  </div>
                ) : null}
              </header>

              {isDetailExpanded ? (
                draft ? (
                  <div className="detail-panel__body">
                    <TaskFormFields
                      form={draft}
                      onChange={updateSelectedTaskForm}
                      readonly={{ ...createReadonlyFields, calendarLinked: Boolean(inlineSavingFields.calendarLinked) }}
                      categoryDefinitionsByField={categoryDefinitionsByField}
                      workTypeDefinitions={workTypeDefinitions}
                    />

                    <label>
                      <span>{labelForField("parentActionId")}</span>
                      <input onChange={(event) => updateParentTaskNumberDraft(event.target.value)} placeholder={t("workspace.parentTaskNumberPlaceholder")} value={parentTaskNumberDraft} />
                    </label>

                    <div className="detail-actions">
                      <button className="primary-button" disabled={saving} onClick={() => void saveSelectedTask()} type="button">
                        {saving ? t("actions.saving") : t("actions.save")}
                      </button>
                      <button className="secondary-button" onClick={resetSelectedTaskDraft} type="button">
                        {t("actions.resetChanges")}
                      </button>
                    </div>

                    <section className="detail-section">
                      <div className="detail-section__header">
                        <h4>{labelForField("linkedDocuments")}</h4>
                      </div>
                      <div className="upload-box">
                        <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                        <button className="primary-button" onClick={() => void uploadSelectedFile()} type="button">
                          {t("actions.uploadFile")}
                        </button>
                      </div>
                      {selectedFiles.length > 0 ? (
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
                        {selectedFiles.length === 0 ? <p>{t("empty.noLinkedDocuments")}</p> : null}
                        {selectedFiles.map((file) => (
                          <article className="file-pill" key={file.id}>
                            <div>
                              <strong>
                                {file.originalName} <span className="file-pill__version">{file.versionLabel}</span>
                              </strong>
                              <small>{file.downloadUrl ? t("workspace.downloadAvailable") : t("workspace.privateStorage")}</small>
                            </div>
                            <div className="file-pill__actions">
                              {file.downloadUrl ? (
                                <a className="secondary-button" href={file.downloadUrl} rel="noreferrer" target="_blank">
                                  {t("actions.download")}
                                </a>
                              ) : null}
                              <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">
                                {t("actions.remove")}
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
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

function TaskListInlineEditor({
  columnKey,
  fieldKey,
  form,
  onChange,
  onCommit,
  saving = false,
  workTypeDefinitions = [],
  categoryDefinitionsByField = {},
}: {
  columnKey: TaskListColumnKey;
  fieldKey: EditableTaskFormKey;
  form: TaskRecord;
  onChange: TaskFormChangeHandler;
  onCommit: (columnKey: TaskListColumnKey) => Promise<void> | void;
  saving?: boolean;
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
}) {
  const sharedProps = {
    "aria-label": labelForField(fieldKey),
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
        value={form[fieldKey]}
        categoryDefinitionsByField={categoryDefinitionsByField}
        workTypeDefinitions={workTypeDefinitions}
      />
    );
  }

  return (
    <textarea
      {...sharedProps}
      className={clsx("sheet-table__inline-input sheet-table__inline-textarea", fieldKey === "issueTitle" && "sheet-table__inline-input--title")}
      onBlur={() => void onCommit(columnKey)}
      onChange={(event) => onChange(fieldKey, event.target.value)}
      onKeyDown={handleTaskListInlineTextKeyDown}
      rows={1}
      value={String(form[fieldKey] ?? "")}
    />
  );
}
function TaskFormFields({
  form,
  onChange,
  layout = "detail",
  readonly = {},
  showOwnerDiscipline = true,
  showUpdatedAt = true,
  quickCreateWidths,
  onComposerResizeStart,
  workTypeDefinitions = [],
  categoryDefinitionsByField = {},
}: {
  form: TaskFormDisplayState;
  onChange: TaskFormChangeHandler;
  layout?: TaskFormLayoutVariant;
  readonly?: TaskFormReadonly;
  showOwnerDiscipline?: boolean;
  showUpdatedAt?: boolean;
  quickCreateWidths?: ResolvedQuickCreateWidthMap;
  onComposerResizeStart?: (fieldKey: QuickCreateFieldKey, event: ReactPointerEvent<HTMLButtonElement>) => void;
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
}) {
  const gridClassName = layout === "composer" ? "composer-form-grid composer-scroll-track" : "detail-form-grid";
  const composerWidths = quickCreateWidths ?? quickCreateDefaultWidths;

  function getLabelProps(fieldKey: QuickCreateFieldKey | null, className: string) {
    if (layout !== "composer" || !fieldKey) {
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
    if (layout !== "composer" || !onComposerResizeStart) return null;
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
          <input className="detail-date-field" onChange={(event) => onChange("dueDate", event.target.value)} type="date" value={form.dueDate} />
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
      {showOwnerDiscipline ? (
        <label {...getLabelProps(null, "form-field--stretch")}>
          <span>{labelForField("ownerDiscipline")}</span>
          <textarea className="detail-text-field" onChange={(event) => onChange("ownerDiscipline", event.target.value)} rows={1} value={form.ownerDiscipline} />
        </label>
      ) : null}
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
        <textarea className="detail-text-field" onChange={(event) => onChange("assignee", event.target.value)} rows={1} value={form.assignee} />
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
          <input className="detail-date-field" onChange={(event) => onChange("reviewedAt", event.target.value)} type="date" value={form.reviewedAt} />
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

function handleTaskListInlineTextKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
  if (event.nativeEvent.isComposing) {
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
    return { columnWidths: {}, rowHeights: {} };
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return { columnWidths: {}, rowHeights: {} };
    return sanitizeTaskListLayoutPreference(JSON.parse(raw));
  } catch {
    return { columnWidths: {}, rowHeights: {} };
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
      return rowDraft ? { kind: "editable-date", fieldKey: "dueDate", value: rowDraft.dueDate } : { kind: "text", text: task.dueDate || "-" };
    case "workType":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "workType",
            value: rowDraft.workType,
            label: labelForTaskCategoricalFieldValue("workType", rowDraft.workType, categoricalFieldContext),
          }
        : { kind: "text", text: labelForTaskCategoricalFieldValue("workType", task.workType, categoricalFieldContext) };
    case "coordinationScope":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "coordinationScope",
            value: rowDraft.coordinationScope,
            label: labelForTaskCategoricalFieldValue("coordinationScope", rowDraft.coordinationScope, categoricalFieldContext),
          }
        : { kind: "text", text: labelForTaskCategoricalFieldValue("coordinationScope", task.coordinationScope, categoricalFieldContext) };
    case "requestedBy":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "requestedBy",
            value: rowDraft.requestedBy,
            label: labelForTaskCategoricalFieldValue("requestedBy", rowDraft.requestedBy, categoricalFieldContext),
          }
        : { kind: "text", text: labelForTaskCategoricalFieldValue("requestedBy", task.requestedBy, categoricalFieldContext) };
    case "relatedDisciplines":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "relatedDisciplines",
            value: rowDraft.relatedDisciplines,
            label: labelForTaskCategoricalFieldValue("relatedDisciplines", rowDraft.relatedDisciplines, categoricalFieldContext),
          }
        : { kind: "text", text: labelForTaskCategoricalFieldValue("relatedDisciplines", task.relatedDisciplines, categoricalFieldContext) };
    case "assignee":
      return rowDraft ? { kind: "editable-text", fieldKey: "assignee", value: rowDraft.assignee } : { kind: "text", text: task.assignee || "-" };
    case "issueTitle":
      return rowDraft
        ? { kind: "editable-text", fieldKey: "issueTitle", value: rowDraft.issueTitle, isTitle: true }
        : {
            kind: "title",
            text: task.issueTitle,
            isChildTask,
            isParentTask,
            isBranchTask,
          };
    case "reviewedAt":
      return rowDraft ? { kind: "editable-date", fieldKey: "reviewedAt", value: rowDraft.reviewedAt } : { kind: "text", text: task.reviewedAt || "-" };
    case "locationRef":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "locationRef",
            value: rowDraft.locationRef,
            label: labelForTaskCategoricalFieldValue("locationRef", rowDraft.locationRef, categoricalFieldContext),
          }
        : { kind: "text", text: labelForTaskCategoricalFieldValue("locationRef", task.locationRef, categoricalFieldContext) };
    case "calendarLinked":
      return rowDraft ? { kind: "editable-checkbox", checked: rowDraft.calendarLinked } : { kind: "readonly-checkbox", checked: task.calendarLinked };
    case "issueDetailNote":
      return rowDraft
        ? { kind: "editable-text", fieldKey: "issueDetailNote", value: rowDraft.issueDetailNote }
        : { kind: "text", text: task.issueDetailNote || "-" };
    case "status":
      return rowDraft
        ? {
            kind: "editable-categorical",
            fieldKey: "status",
            value: rowDraft.status,
            label: labelForTaskCategoricalFieldValue("status", rowDraft.status, categoricalFieldContext),
          }
        : { kind: "readonly-status", value: task.status };
    case "decision":
      return rowDraft ? { kind: "editable-text", fieldKey: "decision", value: rowDraft.decision } : { kind: "text", text: task.decision || "-" };
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

function measureTaskListRowHeight(context: TaskListRowPresentationContext, columnWidths: ResolvedTaskListColumnWidthMap) {
  if (typeof document === "undefined") {
    return TASK_LIST_ROW_MIN_HEIGHT;
  }

  const host = document.createElement("div");
  host.className = "sheet-table__measure-host";
  document.body.appendChild(host);

  try {
    let nextHeight = TASK_LIST_ROW_MIN_HEIGHT;

    for (const column of dailyTaskListColumns) {
      const presentation = buildTaskListCellPresentation(column.key, context);
      const shell = document.createElement("div");
      shell.className = clsx("sheet-table__cell-shell", column.className, column.key === "actionId" && "sheet-table__cell-shell--tree");
      shell.style.width = `${columnWidths[column.key]}px`;

      const content = document.createElement("div");
      content.className = clsx(
        "sheet-table__cell-content",
        isEditableTaskListCellPresentation(presentation) && "sheet-table__cell-content--editable",
        isCenteredCategoricalColumn(column.key) && "sheet-table__cell-content--centered",
      );
      appendTaskListCellMeasurementContent(content, presentation);
      shell.appendChild(content);
      host.appendChild(shell);

      nextHeight = Math.max(nextHeight, Math.ceil(shell.getBoundingClientRect().height));
    }

    return clampTaskListRowHeight(nextHeight);
  } finally {
    host.remove();
  }
}

function isIsoDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatLinkedDocumentsSummary(taskFiles: FileRecord[]) {
  if (taskFiles.length === 0) {
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

function matchesTaskFocus(task: TaskRecord, focusKey: TaskFocusKey, referenceDay: string) {
  switch (focusKey) {
    case "todo":
      return task.status === "todo";
    case "in_progress":
      return task.status === "in_progress";
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

function taskPayloadFromDraft(draft: Partial<TaskRecord>) {
  return {
    version: draft.version ?? 1,
    dueDate: draft.dueDate ?? "",
    workType: draft.workType ?? "",
    coordinationScope: draft.coordinationScope ?? "",
    ownerDiscipline: draft.ownerDiscipline?.trim() || "\uAC74\uCD95",
    requestedBy: draft.requestedBy ?? "",
    relatedDisciplines: draft.relatedDisciplines ?? "",
    assignee: draft.assignee ?? "",
    issueTitle: draft.issueTitle ?? "",
    reviewedAt: draft.reviewedAt ?? "",
    isDaily: Boolean(draft.isDaily),
    locationRef: draft.locationRef ?? "",
    calendarLinked: Boolean(draft.calendarLinked),
    issueDetailNote: draft.issueDetailNote ?? "",
    status: (draft.status ?? "waiting") as TaskStatus,
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
  try {
    const json = (await response.json()) as { error?: { code?: string | null } };
    return localizeError({ code: json.error?.code, fallbackKey });
  } catch {
    return localizeError({ fallbackKey });
  }
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

function formatDay(date: Date) {
  return getWeekdayLabelByIndex(date.getDay());
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

