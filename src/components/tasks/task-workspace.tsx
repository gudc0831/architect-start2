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
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuthUser } from "@/providers/auth-provider";
import { useProjectMeta } from "@/providers/project-provider";
import { previewFiles, previewSystemMode, previewTasks } from "@/lib/preview/demo-data";
import type { DashboardMode, FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";

type TaskWorkspaceProps = { mode: DashboardMode };
type DetailPanelState = "collapsed" | "expanded";

type TaskFormState = {
  actionId: string;
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
  completedAt: string;
  statusHistory: string;
  decision: string;
  isDaily: boolean;
};

type TaskFormReadonly = Partial<Record<Exclude<keyof TaskFormState, "isDaily">, boolean>>;

type TaskFormDisplayState = {
  actionId?: string | number | null;
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
  completedAt?: string | null;
  statusHistory: string;
  decision: string;
};

type SystemMode = {
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

const WIDE_BREAKPOINT = 1440;
const TABLET_BREAKPOINT = 1100;
const DETAIL_PANEL_BREAKPOINT = 1360;
const statusOrder: TaskStatus[] = ["waiting", "todo", "in_progress", "blocked", "done"];
const statusLabel: Record<TaskStatus, string> = {
  waiting: "Waiting",
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};
const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const defaultForm = (): TaskFormState => ({
  actionId: "",
  dueDate: todayKey(),
  workType: "",
  coordinationScope: "",
  ownerDiscipline: "",
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
  completedAt: "",
  statusHistory: "",
  decision: "",
  isDaily: true,
});

const createReadonlyFields: TaskFormReadonly = {
  actionId: true,
  updatedAt: true,
  completedAt: true,
  statusHistory: true,
};

export function TaskWorkspace({ mode }: TaskWorkspaceProps) {
  const authUser = useAuthUser();
  const pathname = usePathname();
  const isPreview = pathname.startsWith("/preview");
  const basePath = isPreview ? "/preview" : "";
  const searchParams = useSearchParams();
  const focusTaskId = searchParams.get("taskId");
  const { projectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TaskRecord | null>(null);
  const [parentTaskNumberDraft, setParentTaskNumberDraft] = useState("");
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [childForm, setChildForm] = useState<TaskFormState>(defaultForm);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingVersionUpload, setPendingVersionUpload] = useState<File | null>(null);
  const [versionTargetId, setVersionTargetId] = useState("");
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(WIDE_BREAKPOINT);
  const [hasViewportSync, setHasViewportSync] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(true);
  const [hasInitializedCreateForm, setHasInitializedCreateForm] = useState(false);
  const [detailPanelState, setDetailPanelState] = useState<DetailPanelState>("collapsed");
  const [canHoverDetails, setCanHoverDetails] = useState(false);

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";
  const isDetailDocked = viewportWidth >= DETAIL_PANEL_BREAKPOINT;
  const usesAgendaView = viewportWidth < TABLET_BREAKPOINT;
  const canCollapseCreateForm = viewportWidth < TABLET_BREAKPOINT;
  const isLocalAuthPlaceholder = authUser?.id === "local-auth-placeholder";
  const isDetailExpanded = detailPanelState === "expanded";

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
        throw new Error(await readErrorMessage(taskResponse, "Failed to load tasks."));
      }
      if (!fileResponse.ok) {
        throw new Error(await readErrorMessage(fileResponse, "Failed to load files."));
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
      setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [focusTaskId, isPreview, scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const sortedTasks = useMemo(() => sortTasksByActionId(tasks), [tasks]);
  const taskById = useMemo(() => new Map(sortedTasks.map((task) => [task.id, task])), [sortedTasks]);
  const selectedTask = useMemo(() => sortedTasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, sortedTasks]);
  const selectedParentTask = useMemo(() => {
    if (!selectedTask?.parentTaskId) return null;
    return taskById.get(selectedTask.parentTaskId) ?? null;
  }, [selectedTask, taskById]);
  const filesByTaskId = useMemo(() => {
    return files.reduce<Record<string, FileRecord[]>>((acc, file) => {
      if (!acc[file.taskId]) acc[file.taskId] = [];
      acc[file.taskId].push(file);
      return acc;
    }, {});
  }, [files]);
  const tasksByDueDate = useMemo(() => {
    return sortedTasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
      if (!task.dueDate) return acc;
      if (!acc[task.dueDate]) acc[task.dueDate] = [];
      acc[task.dueDate].push(task);
      return acc;
    }, {});
  }, [sortedTasks]);
  const selectedFiles = useMemo(() => (selectedTask ? filesByTaskId[selectedTask.id] ?? [] : []), [filesByTaskId, selectedTask]);
  const directChildren = useMemo(() => sortTasksByActionId(sortedTasks.filter((task) => task.parentTaskId === selectedTask?.id)), [selectedTask, sortedTasks]);
  const detailSummary = selectedTask ? formatActionId(selectedTask.actionId) : "Nothing selected";

  useEffect(() => {
    if (!selectedTask) {
      setDraft(null);
      setParentTaskNumberDraft("");
      return;
    }

    setDraft({ ...selectedTask });
    setParentTaskNumberDraft(selectedParentTask ? String(selectedParentTask.actionId) : "");
  }, [selectedParentTask, selectedTask]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setVersionTargetId("");
      return;
    }

    setVersionTargetId((prev) => (selectedFiles.some((file) => file.id === prev) ? prev : selectedFiles[0].id));
  }, [selectedFiles]);

  const boardGroups = useMemo(
    () => statusOrder.map((status) => ({ status, items: sortedTasks.filter((task) => task.status === status) })),
    [sortedTasks],
  );
  const boardSummary = useMemo(() => {
    const overdueCount = sortedTasks.filter((task) => task.dueDate && task.dueDate < todayKey() && task.status !== "done").length;
    const byStatus = statusOrder.reduce(
      (acc, status) => ({ ...acc, [status]: sortedTasks.filter((task) => task.status === status).length }),
      {} as Record<TaskStatus, number>,
    );

    return { total: sortedTasks.length, overdue: overdueCount, byStatus };
  }, [sortedTasks]);
  const calendarBaseDate = useMemo(() => {
    const firstDueDate = sortedTasks.find((task) => task.dueDate)?.dueDate;
    return firstDueDate ? parseISO(firstDueDate) : new Date();
  }, [sortedTasks]);
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

  function updateChildForm<K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) {
    setChildForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDraftForm<K extends EditableTaskFormKey>(key: K, value: TaskFormState[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function createTaskFromForm(nextForm: TaskFormState, parentTaskNumber?: string) {
    setErrorMessage(null);

    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nextForm, parentTaskNumber }),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to create the task."));
      return;
    }

    const json = (await response.json()) as { data: TaskRecord };
    await loadData();
    setSelectedTaskId(json.data.id);
    if (parentTaskNumber) {
      setChildForm(defaultForm());
    } else {
      setForm(defaultForm());
      if (canCollapseCreateForm) {
        setIsCreateFormOpen(false);
      }
    }
  }

  async function saveSelectedTask() {
    if (!draft) return;
    setSaving(true);
    setErrorMessage(null);

    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...taskPayloadFromDraft(draft),
          parentTaskNumber: normalizeParentTaskNumberInput(parentTaskNumberDraft),
        }),
      });

      if (!response.ok) {
        const message = await readErrorMessage(response, "Failed to save the task.");
        if (response.status === 409) {
          await loadData();
        }
        throw new Error(message);
      }

      const json = (await response.json()) as { data: TaskRecord };
      setDraft(json.data);
      setTasks((prev) => prev.map((task) => (task.id === json.data.id ? json.data : task)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save the task.");
    } finally {
      setSaving(false);
    }
  }

  async function patchTask(task: TaskRecord, payload: Partial<TaskRecord>) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, version: task.version }),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to update the task."));
      if (response.status === 409) {
        await loadData();
      }
      return;
    }

    await loadData();
    setSelectedTaskId(task.id);
  }

  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statusOrder.length) return;
    await patchTask(task, { status: statusOrder[nextIndex] });
  }

  async function moveToTrash(taskId: string) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to move the task to trash."));
      return;
    }
    await loadData();
  }

  async function restoreTask(taskId: string) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to restore the task."));
      return;
    }
    await loadData();
  }

  async function uploadFileForTask(taskId: string, file: File) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const body = new FormData();
    body.append("file", file);
    body.append("taskId", taskId);
    const response = await fetch("/api/upload", { method: "POST", body });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to upload the file."));
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
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const body = new FormData();
    body.append("file", pendingVersionUpload);
    const response = await fetch(`/api/files/${encodeURIComponent(versionTargetId)}/version`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to upload the next file version."));
      return;
    }

    setPendingVersionUpload(null);
    await loadData();
  }

  async function moveFileToTrash(fileId: string) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to move the file to trash."));
      return;
    }
    await loadData();
  }

  async function restoreFile(fileId: string) {
    if (isPreview) {
      setErrorMessage("Preview mode does not allow mutations.");
      return;
    }

    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "Failed to restore the file."));
      return;
    }
    await loadData();
  }

  function expandDetailPanel() {
    setDetailPanelState("expanded");
  }

  function collapseDetailPanel() {
    setDetailPanelState("collapsed");
  }

  function handleDetailPanelPointerEnter() {
    if (!canHoverDetails) return;
    expandDetailPanel();
  }

  function handleDetailPanelPointerLeave(event: ReactPointerEvent<HTMLElement>) {
    if (!canHoverDetails) return;
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
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    collapseDetailPanel();
  }

  function handleDetailPanelToggle() {
    if (canHoverDetails) {
      expandDetailPanel();
      return;
    }

    setDetailPanelState((prev) => (prev === "expanded" ? "collapsed" : "expanded"));
  }

  function handleDetailPanelKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (canHoverDetails) {
        expandDetailPanel();
        return;
      }
      handleDetailPanelToggle();
      return;
    }

    if (event.key === "Escape") {
      collapseDetailPanel();
    }
  }

  return (
    <section className={clsx("workspace", `workspace--${mode}`)}>
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">{authUser?.displayName ?? "Workspace"}</p>
          <p className="workspace__project">{projectName || "Project"}</p>
          <h2>{titleByMode(mode)}</h2>
          <p className="workspace__copy">Switch between board, list, calendar, and archive views without losing context.</p>
          {systemMode ? (
            <>
              <p className="workspace__meta">Data: {systemMode.dataMode} / Upload: {systemMode.uploadMode}</p>
              <p className="workspace__meta">
                Project metadata: {projectLoaded ? (isSyncing ? "Syncing..." : projectSource ?? "unknown") : "Loading..."} / Supabase {systemMode.hasSupabase ? "configured" : "missing"}
              </p>
              {isLocalAuthPlaceholder && !isPreview ? (
                <p className="workspace__meta">Authentication is running in local placeholder mode. Real sign-in can be connected later without changing this screen flow.</p>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      {errorMessage ? <p className="detail-panel__warning detail-panel__warning--error">{errorMessage}</p> : null}
      {loading ? (
        <div className="empty-state">
          <h3>Loading workspace...</h3>
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
        >
          <div className="workspace__main">
            {sortedTasks.length === 0 && files.length === 0 ? (
              <div className="empty-state">
                <h3>No items yet.</h3>
                <p>Add a task to start tracking work.</p>
              </div>
            ) : null}

            {mode === "board" ? (
              <div className="board-layout">
                <section className="board-summary">
                  <article className="board-summary__card">
                    <span className="board-summary__label">Total</span>
                    <strong>{boardSummary.total}</strong>
                  </article>
                  <article className="board-summary__card">
                    <span className="board-summary__label">Waiting</span>
                    <strong>{boardSummary.byStatus.waiting}</strong>
                  </article>
                  <article className="board-summary__card">
                    <span className="board-summary__label">To do</span>
                    <strong>{boardSummary.byStatus.todo}</strong>
                  </article>
                  <article className="board-summary__card">
                    <span className="board-summary__label">In progress</span>
                    <strong>{boardSummary.byStatus.in_progress}</strong>
                  </article>
                  <article className="board-summary__card board-summary__card--warn">
                    <span className="board-summary__label">Overdue</span>
                    <strong>{boardSummary.overdue}</strong>
                  </article>
                </section>

                <div className="board-columns">
                  {boardGroups.map((group) => (
                    <section className="board-column" key={group.status}>
                      <header className="board-column__header">
                        <div>
                          <h3>{statusLabel[group.status]}</h3>
                          <p>{boardColumnCopy(group.status)}</p>
                        </div>
                        <span className={clsx("status-pill", `status-pill--${group.status}`)}>{group.items.length}</span>
                      </header>
                      <div className="board-column__items">
                        {group.items.length === 0 ? <div className="board-column__empty">No tasks in this state.</div> : null}
                        {group.items.map((task) => {
                          const taskFiles = filesByTaskId[task.id] ?? [];
                          return (
                            <article
                              className={clsx("task-card", task.id === selectedTaskId && "task-card--active")}
                              key={task.id}
                              onClick={() => setSelectedTaskId(task.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  setSelectedTaskId(task.id);
                                }
                              }}
                              role="button"
                              tabIndex={0}
                            >
                              <div className="task-card__top">
                                <strong>{formatActionId(task.actionId)}</strong>
                                <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>
                              </div>
                              <div className="task-card__main">
                                <h4>{task.issueTitle}</h4>
                                <p>{task.issueDetailNote || "No description"}</p>
                              </div>
                              <div className="task-card__meta">
                                <span>Due {task.dueDate || "-"}</span>
                                <span>{task.workType || "Uncategorized"}</span>
                                <span>{task.assignee || "Unassigned"}</span>
                                <span>{taskFiles.length} files</span>
                              </div>
                              <div className="task-card__actions">
                                <button
                                  className="secondary-button"
                                  disabled={task.status === statusOrder[0]}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void shiftTaskStatus(task, -1);
                                  }}
                                  type="button"
                                >
                                  Back
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
                                  Next
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            {mode === "daily" ? (
              <>
                <section className="composer-card">
                  <div className="composer-card__header">
                    <div>
                      <p className="workspace__eyebrow">Quick Create</p>
                      <h3>Add a task</h3>
                      <p className="workspace__meta">The form follows your requested field order and keeps linked_documents as a post-create file flow.</p>
                    </div>
                    <button className="secondary-button composer-card__toggle" onClick={() => setIsCreateFormOpen((prev) => !prev)} type="button">
                      {isCreateFormOpen ? "Hide form" : "Show form"}
                    </button>
                  </div>

                  {isCreateFormOpen ? (
                    <div className="composer-card__body">
                      <TaskFormFields form={form} onChange={updateForm} readonly={createReadonlyFields} />
                      <div className="detail-actions detail-actions--inline">
                        <button className="primary-button" onClick={() => void createTaskFromForm(form)} type="button">
                          Create task
                        </button>
                        {canCollapseCreateForm ? (
                          <button className="secondary-button" onClick={() => setIsCreateFormOpen(false)} type="button">
                            Keep list visible
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>

                <div className="sheet-wrapper">
                  <table className="sheet-table sheet-table--expanded">
                    <thead>
                      <tr>
                        <th>action_id</th>
                        <th>due_date</th>
                        <th>work_type</th>
                        <th>Coordination Scope</th>
                        <th>Owner Discipline</th>
                        <th>requested_by</th>
                        <th>Related Disciplines</th>
                        <th>assignee</th>
                        <th className="sheet-table__title">issue_title</th>
                        <th>reviewed_at</th>
                        <th>Updated At</th>
                        <th>Location Ref</th>
                        <th>Calendar Linked</th>
                        <th className="sheet-table__wide">ISSUE Detail Note</th>
                        <th>status</th>
                        <th>Completed At</th>
                        <th className="sheet-table__wide">status_history</th>
                        <th className="sheet-table__wide">decision</th>
                        <th>linked_documents</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTasks.map((task) => {
                        const taskFiles = filesByTaskId[task.id] ?? [];
                        return (
                          <tr className={clsx(task.id === selectedTaskId && "sheet-row--active")} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                            <td>{formatActionId(task.actionId)}</td>
                            <td>{task.dueDate || "-"}</td>
                            <td>{task.workType || "-"}</td>
                            <td>{task.coordinationScope || "-"}</td>
                            <td>{task.ownerDiscipline || "-"}</td>
                            <td>{task.requestedBy || "-"}</td>
                            <td>{task.relatedDisciplines || "-"}</td>
                            <td>{task.assignee || "-"}</td>
                            <td className="sheet-table__title">{task.issueTitle}</td>
                            <td>{task.reviewedAt || "-"}</td>
                            <td>{formatDateTimeField(task.updatedAt)}</td>
                            <td>{task.locationRef || "-"}</td>
                            <td>{task.calendarLinked ? "Yes" : "No"}</td>
                            <td className="sheet-table__wide">{task.issueDetailNote || "-"}</td>
                            <td>
                              <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>
                            </td>
                            <td>{formatDateTimeField(task.completedAt)}</td>
                            <td className="sheet-table__wide">{task.statusHistory || "-"}</td>
                            <td className="sheet-table__wide">{task.decision || "-"}</td>
                            <td>{taskFiles.length}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}

            {mode === "calendar" ? (
              usesAgendaView ? (
                <div className="calendar-agenda">
                  {agendaGroups.length === 0 ? (
                    <div className="empty-state">
                      <h3>No scheduled tasks.</h3>
                      <p>Add due dates to populate the agenda view.</p>
                    </div>
                  ) : (
                    agendaGroups.map((group) => (
                      <section className="calendar-agenda__day" key={group.dayKey}>
                        <header className="calendar-agenda__header">
                          <div>
                            <h3>{format(group.date, "MMM d")}</h3>
                            <p>{format(group.date, "EEEE")}</p>
                          </div>
                          <span>{group.items.length}</span>
                        </header>
                        <div className="calendar-agenda__items">
                          {group.items.map((task) => (
                            <Link className="calendar-link" href={`${basePath}/daily?taskId=${task.id}` as Route} key={task.id}>
                              <strong>{formatActionId(task.actionId)}</strong>
                              <span>{task.issueTitle}</span>
                              <small>
                                {statusLabel[task.status]} / {task.assignee || "Unassigned"}
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
                                {formatActionId(task.actionId)} {task.issueTitle}
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
              <div className="trash-layout">
                <section className="trash-section">
                  <header className="trash-section__header">
                    <h3>Deleted tasks</h3>
                    <span>{sortedTasks.length}</span>
                  </header>
                  <div className="trash-list">
                    {sortedTasks.length === 0 ? <div className="board-column__empty">No deleted tasks.</div> : null}
                    {sortedTasks.map((task) => (
                      <article className="trash-card" key={task.id}>
                        <div>
                          <strong>{formatActionId(task.actionId)}</strong>
                          <p>{task.issueTitle}</p>
                          <small>Deleted {fileSafeDate(task.deletedAt)}</small>
                        </div>
                        <button className="primary-button" onClick={() => void restoreTask(task.id)} type="button">
                          Restore
                        </button>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="trash-section">
                  <header className="trash-section__header">
                    <h3>Deleted files</h3>
                    <span>{files.length}</span>
                  </header>
                  <div className="trash-list">
                    {files.length === 0 ? <div className="board-column__empty">No deleted files.</div> : null}
                    {files.map((file) => (
                      <article className="trash-card" key={file.id}>
                        <div>
                          <strong>
                            {file.originalName} <span className="file-pill__version">{file.versionLabel}</span>
                          </strong>
                          <p>{file.downloadUrl ? "Download available" : "Private storage"}</p>
                          <small>Deleted {fileSafeDate(file.deletedAt)}</small>
                        </div>
                        <button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">
                          Restore
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
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
              onPointerEnter={handleDetailPanelPointerEnter}
              onPointerLeave={handleDetailPanelPointerLeave}
            >
              <header className="detail-panel__header">
                <button
                  aria-expanded={isDetailExpanded}
                  className="detail-panel__toggle"
                  onClick={handleDetailPanelToggle}
                  onKeyDown={handleDetailPanelKeyDown}
                  type="button"
                >
                  <div className="detail-panel__summary">
                    <p className="workspace__eyebrow">Task details</p>
                    <h3>{detailSummary}</h3>
                  </div>
                  <span aria-hidden="true" className="detail-panel__toggle-indicator">
                    {isDetailExpanded ? "-" : "+"}
                  </span>
                </button>
                {selectedTask && !isTrashMode && isDetailExpanded ? (
                  <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">
                    Move to trash
                  </button>
                ) : null}
              </header>

              {isDetailExpanded ? (
                draft ? (
                  <div className="detail-panel__body">
                    <TaskFormFields form={draft} onChange={updateDraftForm} readonly={createReadonlyFields} />

                    <label>
                      <span>Parent action_id</span>
                      <input onChange={(event) => setParentTaskNumberDraft(event.target.value)} placeholder="#12 or 12" value={parentTaskNumberDraft} />
                    </label>

                    <div className="detail-actions">
                      <button className="primary-button" disabled={saving} onClick={() => void saveSelectedTask()} type="button">
                        {saving ? "Saving..." : "Save"}
                      </button>
                      <button className="secondary-button" onClick={() => setDraft(selectedTask ? { ...selectedTask } : null)} type="button">
                        Reset changes
                      </button>
                    </div>

                    <section className="detail-section">
                      <div className="detail-section__header">
                        <h4>Child tasks</h4>
                      </div>
                      <p>
                        Current parent: {selectedParentTask ? formatActionId(selectedParentTask.actionId) + " " + selectedParentTask.issueTitle : "None"}
                      </p>
                      {directChildren.length > 0 ? (
                        <ul className="detail-tree-list">
                          {directChildren.map((child) => (
                            <li key={child.id}>
                              {formatActionId(child.actionId)} {child.issueTitle}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>No child tasks yet.</p>
                      )}
                      <TaskFormFields form={childForm} onChange={updateChildForm} readonly={createReadonlyFields} />
                      <button className="primary-button" onClick={() => void createTaskFromForm(childForm, selectedTask ? String(selectedTask.actionId) : undefined)} type="button">
                        Create child task
                      </button>
                    </section>

                    <section className="detail-section">
                      <div className="detail-section__header">
                        <h4>linked_documents</h4>
                      </div>
                      <div className="upload-box">
                        <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                        <button className="primary-button" onClick={() => void uploadSelectedFile()} type="button">
                          Upload file
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
                            Upload next version
                          </button>
                        </div>
                      ) : null}
                      <div className="file-list">
                        {selectedFiles.length === 0 ? <p>No linked_documents attached to this task.</p> : null}
                        {selectedFiles.map((file) => (
                          <article className="file-pill" key={file.id}>
                            <div>
                              <strong>
                                {file.originalName} <span className="file-pill__version">{file.versionLabel}</span>
                              </strong>
                              <small>{file.downloadUrl ? "Download available" : "Private storage"}</small>
                            </div>
                            <div className="file-pill__actions">
                              {file.downloadUrl ? (
                                <a className="secondary-button" href={file.downloadUrl} rel="noreferrer" target="_blank">
                                  Download
                                </a>
                              ) : null}
                              <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">
                                Remove
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                ) : (
                  <div className="detail-panel__empty">Select a task from the list to edit its details and manage linked_documents.</div>
                )
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TaskFormFields({
  form,
  onChange,
  readonly = {},
}: {
  form: TaskFormDisplayState;
  onChange: TaskFormChangeHandler;
  readonly?: TaskFormReadonly;
}) {
  return (
    <div className="detail-form-grid">
      <label>
        <span>action_id</span>
        <input readOnly={Boolean(readonly.actionId)} value={formatReadonlyActionId(form.actionId)} />
      </label>
      <label>
        <span>due_date</span>
        <input onChange={(event) => onChange("dueDate", event.target.value)} type="date" value={form.dueDate} />
      </label>
      <label>
        <span>work_type</span>
        <input onChange={(event) => onChange("workType", event.target.value)} value={form.workType} />
      </label>
      <label>
        <span>Coordination Scope</span>
        <input onChange={(event) => onChange("coordinationScope", event.target.value)} value={form.coordinationScope} />
      </label>
      <label>
        <span>Owner Discipline</span>
        <input onChange={(event) => onChange("ownerDiscipline", event.target.value)} value={form.ownerDiscipline} />
      </label>
      <label>
        <span>requested_by</span>
        <input onChange={(event) => onChange("requestedBy", event.target.value)} value={form.requestedBy} />
      </label>
      <label>
        <span>Related Disciplines</span>
        <input onChange={(event) => onChange("relatedDisciplines", event.target.value)} value={form.relatedDisciplines} />
      </label>
      <label>
        <span>assignee</span>
        <input onChange={(event) => onChange("assignee", event.target.value)} value={form.assignee} />
      </label>
      <label className="detail-field--wide">
        <span>issue_title</span>
        <input onChange={(event) => onChange("issueTitle", event.target.value)} value={form.issueTitle} />
      </label>
      <label>
        <span>reviewed_at</span>
        <input onChange={(event) => onChange("reviewedAt", event.target.value)} type="date" value={form.reviewedAt} />
      </label>
      <label>
        <span>Updated At</span>
        <input readOnly={Boolean(readonly.updatedAt)} value={formatReadonlyValue(form.updatedAt)} />
      </label>
      <label>
        <span>Location Ref</span>
        <input onChange={(event) => onChange("locationRef", event.target.value)} value={form.locationRef} />
      </label>
      <label className="detail-checkbox-field">
        <span>Calendar Linked</span>
        <input checked={form.calendarLinked} onChange={(event) => onChange("calendarLinked", event.target.checked)} type="checkbox" />
      </label>
      <label className="detail-field--wide">
        <span>ISSUE Detail Note</span>
        <textarea onChange={(event) => onChange("issueDetailNote", event.target.value)} rows={5} value={form.issueDetailNote} />
      </label>
      <label>
        <span>status</span>
        <select onChange={(event) => onChange("status", event.target.value as TaskStatus)} value={form.status}>
          {statusOrder.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Completed At</span>
        <input readOnly={Boolean(readonly.completedAt)} value={formatReadonlyValue(form.completedAt)} />
      </label>
      <label className="detail-field--wide">
        <span>status_history</span>
        <textarea readOnly={Boolean(readonly.statusHistory)} rows={4} value={form.statusHistory || "Tracked automatically after the first save."} />
      </label>
      <label className="detail-field--wide">
        <span>decision</span>
        <textarea onChange={(event) => onChange("decision", event.target.value)} rows={4} value={form.decision} />
      </label>
    </div>
  );
}

function titleByMode(mode: DashboardMode) {
  if (mode === "board") return "Board";
  if (mode === "daily") return "Daily List";
  if (mode === "calendar") return "Calendar";
  return "Trash";
}

function boardColumnCopy(status: TaskStatus) {
  if (status === "waiting") return "Tasks waiting for a decision or kickoff.";
  if (status === "todo") return "Ready to start next.";
  if (status === "in_progress") return "Work that is actively moving.";
  if (status === "blocked") return "Waiting on a blocker or external input.";
  return "Finished work kept for reference.";
}

function taskPayloadFromDraft(draft: Partial<TaskRecord>) {
  return {
    version: draft.version ?? 1,
    dueDate: draft.dueDate ?? "",
    workType: draft.workType ?? "",
    coordinationScope: draft.coordinationScope ?? "",
    ownerDiscipline: draft.ownerDiscipline ?? "",
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
    statusHistory: draft.statusHistory ?? "",
    decision: draft.decision ?? "",
    completedAt: draft.completedAt ?? null,
  };
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const json = (await response.json()) as { error?: { message?: string } };
    return json.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

function formatActionId(actionId: number | string | null | undefined) {
  const raw = String(actionId ?? "").trim();
  if (!raw) return "#-";
  if (raw.startsWith("#")) return raw;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? "#" + numeric : raw;
}

function formatReadonlyActionId(actionId: number | string | null | undefined) {
  const raw = String(actionId ?? "").trim();
  return raw ? formatActionId(raw) : "Auto after create";
}

function formatReadonlyValue(value: string | null | undefined) {
  const formatted = formatDateTimeField(value);
  return formatted === "-" ? "Auto" : formatted;
}

function normalizeParentTaskNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^#d+$/.test(trimmed)) return trimmed;
  if (/^d+$/.test(trimmed)) return "#" + trimmed;
  return trimmed;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(date: Date) {
  return format(date, "EEE");
}

function formatDateTimeField(value: string | null | undefined) {
  if (!value) return "-";
  if (/^d{4}-d{2}-d{2}$/.test(value)) return value;
  return value.replace("T", " ").slice(0, 16);
}

function sortTasksByActionId(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const actionCompare = (left.actionId ?? left.taskNumber) - (right.actionId ?? right.taskNumber);
    if (actionCompare !== 0) return actionCompare;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function fileSafeDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}
