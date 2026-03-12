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

type TaskFormState = {
  dueDate: string;
  category: string;
  requester: string;
  assignee: string;
  title: string;
  createdAt: string;
  isDaily: boolean;
  description: string;
  fileMemo: string;
};

type SystemMode = {
  dataMode: string;
  uploadMode: string;
  hasSupabase: boolean;
  hasFirebaseProjectId: boolean;
};

type TaskFormChangeHandler = <K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) => void;

const WIDE_BREAKPOINT = 1440;
const TABLET_BREAKPOINT = 1100;
const MOBILE_BREAKPOINT = 768;
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
  dueDate: todayKey(),
  category: "",
  requester: "",
  assignee: "",
  title: "",
  createdAt: todayKey(),
  isDaily: true,
  description: "",
  fileMemo: "",
});

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

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";
  const isDetailDocked = viewportWidth >= DETAIL_PANEL_BREAKPOINT;
  const usesAgendaView = viewportWidth < TABLET_BREAKPOINT;
  const canCollapseCreateForm = viewportWidth < TABLET_BREAKPOINT;

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
    if (!hasViewportSync || hasInitializedCreateForm) return;
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

  const sortedTasks = useMemo(() => sortTasksByNumber(tasks), [tasks]);
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
  const directChildren = useMemo(() => sortTasksByNumber(sortedTasks.filter((task) => task.parentTaskId === selectedTask?.id)), [selectedTask, sortedTasks]);

  useEffect(() => {
    if (!selectedTask) {
      setDraft(null);
      setParentTaskNumberDraft("");
      return;
    }

    setDraft({ ...selectedTask });
    setParentTaskNumberDraft(selectedParentTask ? String(selectedParentTask.taskNumber) : "");
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
        items: sortTasksByNumber(items),
      }));
  }, [tasksByDueDate]);

  function updateForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateChildForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setChildForm((prev) => ({ ...prev, [key]: value }));
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
        <div className={clsx("workspace__body", mode !== "daily" && "workspace__body--single", mode === "daily" && !isDetailDocked && "workspace__body--stacked")}>
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
                                <strong>{formatTaskNumber(task.taskNumber)}</strong>
                                <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>
                              </div>
                              <div className="task-card__main">
                                <h4>{task.title}</h4>
                                <p>{task.description || "No description"}</p>
                              </div>
                              <div className="task-card__meta">
                                <span>Due {task.dueDate || "-"}</span>
                                <span>{task.category || "Uncategorized"}</span>
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
                      <p className="workspace__meta">Keep the creation form compact on narrow widths so the list remains readable.</p>
                    </div>
                    <button className="secondary-button composer-card__toggle" onClick={() => setIsCreateFormOpen((prev) => !prev)} type="button">
                      {isCreateFormOpen ? "Hide form" : "Show form"}
                    </button>
                  </div>

                  {isCreateFormOpen ? (
                    <div className="composer-card__body">
                      <TaskFormFields form={form} onChange={updateForm} />
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
                  <table className="sheet-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Due</th>
                        <th>Category</th>
                        <th>Requester</th>
                        <th>Assignee</th>
                        <th>Title</th>
                        <th>Status</th>
                        <th>Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTasks.map((task) => {
                        const taskFiles = filesByTaskId[task.id] ?? [];
                        return (
                          <tr className={clsx(task.id === selectedTaskId && "sheet-row--active")} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                            <td>{formatTaskNumber(task.taskNumber)}</td>
                            <td>{task.dueDate || "-"}</td>
                            <td>{task.category || "-"}</td>
                            <td>{task.requester || "-"}</td>
                            <td>{task.assignee || "-"}</td>
                            <td className="sheet-table__title">{task.title}</td>
                            <td>
                              <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>
                            </td>
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
                              <strong>{formatTaskNumber(task.taskNumber)}</strong>
                              <span>{task.title}</span>
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
                                {formatTaskNumber(task.taskNumber)} {task.title}
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
                          <strong>{formatTaskNumber(task.taskNumber)}</strong>
                          <p>{task.title}</p>
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
            <aside className={clsx("detail-panel", !isDetailDocked && "detail-panel--below")}>
              <header className="detail-panel__header">
                <div>
                  <p className="workspace__eyebrow">Task details</p>
                  <h3>{selectedTask ? formatTaskNumber(selectedTask.taskNumber) : "Nothing selected"}</h3>
                </div>
                {selectedTask && !isTrashMode ? (
                  <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">
                    Move to trash
                  </button>
                ) : null}
              </header>

              {draft ? (
                <div className="detail-panel__body">
                  <div className="status-rail">
                    {statusOrder.map((status) => (
                      <button
                        className={clsx("status-pill", `status-pill--${status}`, draft.status === status && "status-pill--selected")}
                        key={status}
                        onClick={() => setDraft((prev) => (prev ? { ...prev, status } : prev))}
                        type="button"
                      >
                        {statusLabel[status]}
                      </button>
                    ))}
                  </div>

                  <label>
                    <span>Title</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))} value={draft.title} />
                  </label>
                  <label>
                    <span>Due date</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, dueDate: event.target.value } : prev))} type="date" value={draft.dueDate} />
                  </label>
                  <label>
                    <span>Created date</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, createdAt: event.target.value } : prev))} type="date" value={draft.createdAt} />
                  </label>
                  <label>
                    <span>Category</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, category: event.target.value } : prev))} value={draft.category} />
                  </label>
                  <label>
                    <span>Requester</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, requester: event.target.value } : prev))} value={draft.requester} />
                  </label>
                  <label>
                    <span>Assignee</span>
                    <input onChange={(event) => setDraft((prev) => (prev ? { ...prev, assignee: event.target.value } : prev))} value={draft.assignee} />
                  </label>
                  <label>
                    <span>Description</span>
                    <textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))} rows={4} value={draft.description} />
                  </label>
                  <label>
                    <span>Progress note</span>
                    <textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, progressNote: event.target.value } : prev))} rows={4} value={draft.progressNote} />
                  </label>
                  <label>
                    <span>Conclusion</span>
                    <textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, conclusion: event.target.value } : prev))} rows={4} value={draft.conclusion} />
                  </label>
                  <label>
                    <span>File note</span>
                    <textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, fileMemo: event.target.value } : prev))} rows={3} value={draft.fileMemo} />
                  </label>
                  <label>
                    <span>Parent task number</span>
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
                      Current parent: {selectedParentTask ? `${formatTaskNumber(selectedParentTask.taskNumber)} ${selectedParentTask.title}` : "None"}
                    </p>
                    {directChildren.length > 0 ? (
                      <ul className="detail-tree-list">
                        {directChildren.map((child) => (
                          <li key={child.id}>
                            {formatTaskNumber(child.taskNumber)} {child.title}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No child tasks yet.</p>
                    )}
                    <TaskFormFields form={childForm} onChange={updateChildForm} />
                    <button className="primary-button" onClick={() => void createTaskFromForm(childForm, selectedTask ? String(selectedTask.taskNumber) : undefined)} type="button">
                      Create child task
                    </button>
                  </section>

                  <section className="detail-section">
                    <div className="detail-section__header">
                      <h4>Files</h4>
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
                      {selectedFiles.length === 0 ? <p>No files linked to this task.</p> : null}
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
                <div className="detail-panel__empty">Select a task from the list to edit its details and manage files.</div>
              )}
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TaskFormFields({ form, onChange }: { form: TaskFormState; onChange: TaskFormChangeHandler }) {
  return (
    <div className="detail-child-grid">
      <input onChange={(event) => onChange("title", event.target.value)} placeholder="Title" value={form.title} />
      <input onChange={(event) => onChange("dueDate", event.target.value)} type="date" value={form.dueDate} />
      <input onChange={(event) => onChange("createdAt", event.target.value)} type="date" value={form.createdAt} />
      <input onChange={(event) => onChange("category", event.target.value)} placeholder="Category" value={form.category} />
      <input onChange={(event) => onChange("requester", event.target.value)} placeholder="Requester" value={form.requester} />
      <input onChange={(event) => onChange("assignee", event.target.value)} placeholder="Assignee" value={form.assignee} />
      <textarea onChange={(event) => onChange("description", event.target.value)} placeholder="Description" rows={3} value={form.description} />
      <input onChange={(event) => onChange("fileMemo", event.target.value)} placeholder="File note" value={form.fileMemo} />
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
    category: draft.category ?? "",
    requester: draft.requester ?? "",
    assignee: draft.assignee ?? "",
    title: draft.title ?? "",
    createdAt: draft.createdAt ?? todayKey(),
    isDaily: Boolean(draft.isDaily),
    description: draft.description ?? "",
    status: (draft.status ?? "waiting") as TaskStatus,
    progressNote: draft.progressNote ?? "",
    conclusion: draft.conclusion ?? "",
    fileMemo: draft.fileMemo ?? "",
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

function formatTaskNumber(taskNumber: number) {
  return `#${taskNumber}`;
}

function normalizeParentTaskNumberInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^#\d+$/.test(trimmed)) return trimmed;
  if (/^\d+$/.test(trimmed)) return `#${trimmed}`;
  return trimmed;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDay(date: Date) {
  return format(date, "EEE");
}

function sortTasksByNumber(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const numberCompare = left.taskNumber - right.taskNumber;
    if (numberCompare !== 0) return numberCompare;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function fileSafeDate(value: string | null) {
  return value ? value.slice(0, 10) : "-";
}
