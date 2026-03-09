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
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthUser } from "@/providers/auth-provider";
import { useProjectMeta } from "@/providers/project-provider";
import type { DashboardMode, FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";

type TaskWorkspaceProps = {
  mode: DashboardMode;
};

type TaskFormState = {
  dueDate: string;
  category: string;
  requester: string;
  assignee: string;
  title: string;
  isDaily: boolean;
  description: string;
};

type SystemMode = {
  dataMode: string;
  uploadRoot: string;
  dataRoot: string;
  projectMetaPath: string;
};

type EditableSheetField =
  | "dueDate"
  | "category"
  | "requester"
  | "assignee"
  | "title"
  | "description"
  | "status"
  | "progressNote"
  | "conclusion";

type CreateSheetField = "dueDate" | "category" | "requester" | "assignee" | "title" | "description";

const defaultForm = (): TaskFormState => ({
  dueDate: new Date().toISOString().slice(0, 10),
  category: "",
  requester: "",
  assignee: "",
  title: "",
  isDaily: true,
  description: "",
});

const statusOrder: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
const statusLabel: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
};

const createFieldOrder: CreateSheetField[] = ["dueDate", "category", "requester", "assignee", "title", "description"];
const sheetFieldOrder: EditableSheetField[] = [
  "dueDate",
  "category",
  "requester",
  "assignee",
  "title",
  "description",
  "status",
  "progressNote",
  "conclusion",
];

export function TaskWorkspace({ mode }: TaskWorkspaceProps) {
  const authUser = useAuthUser();
  const { projectName, projectLoaded, projectSource, isSyncing } = useProjectMeta();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [panelDraft, setPanelDraft] = useState<Partial<TaskRecord> | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingVersionUpload, setPendingVersionUpload] = useState<File | null>(null);
  const [versionTargetId, setVersionTargetId] = useState("");
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";

  const loadData = useCallback(async () => {
    const [taskResponse, fileResponse] = await Promise.all([
      fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
      fetch(`/api/files${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
    ]);

    const taskJson = (await taskResponse.json()) as { data: TaskRecord[] };
    const fileJson = (await fileResponse.json()) as { data: FileRecord[] };

    setTasks(taskJson.data);
    setFiles(fileJson.data);
    setSelectedTaskId((prev) => {
      if (prev && taskJson.data.some((task) => task.id === prev)) {
        return prev;
      }

      return taskJson.data[0]?.id ?? null;
    });
  }, [scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { data: SystemMode }) => setSystemMode(json.data))
      .catch(() => setSystemMode(null));
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    setPanelDraft(selectedTask ? { ...selectedTask } : null);
  }, [selectedTask]);

  const filesByTaskId = useMemo(() => {
    return files.reduce<Record<string, FileRecord[]>>((acc, file) => {
      if (!acc[file.taskId]) {
        acc[file.taskId] = [];
      }

      acc[file.taskId].push(file);
      return acc;
    }, {});
  }, [files]);

  const selectedFiles = useMemo(() => {
    if (!selectedTask) {
      return [];
    }

    return filesByTaskId[selectedTask.id] ?? [];
  }, [filesByTaskId, selectedTask]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setVersionTargetId("");
      return;
    }

    setVersionTargetId((prev) => (selectedFiles.some((file) => file.id === prev) ? prev : selectedFiles[0].id));
  }, [selectedFiles]);

  const boardGroups = useMemo(
    () =>
      statusOrder.map((status) => ({
        status,
        items: tasks.filter((task) => task.status === status),
      })),
    [tasks],
  );
  const boardSummary = useMemo(() => {
    const overdueCount = tasks.filter((task) => task.dueDate && task.dueDate < todayKey() && task.status !== "done").length;

    return {
      total: tasks.length,
      overdue: overdueCount,
      byStatus: Object.fromEntries(boardGroups.map((group) => [group.status, group.items.length])) as Record<TaskStatus, number>,
    };
  }, [boardGroups, tasks]);

  const calendarBaseDate = useMemo(() => {
    const firstDueDate = tasks.find((task) => task.dueDate)?.dueDate;
    return firstDueDate ? parseISO(firstDueDate) : new Date();
  }, [tasks]);

  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
    });
  }, [calendarBaseDate]);

  function updateForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDraft<K extends keyof TaskRecord>(key: K, value: TaskRecord[K]) {
    setPanelDraft((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  function cellId(scopeKey: string, field: string) {
    return `sheet-${scopeKey}-${field}`;
  }

  function focusCell(scopeKey: string, field: string) {
    window.requestAnimationFrame(() => {
      const element = document.getElementById(cellId(scopeKey, field)) as HTMLElement | null;
      element?.focus();
    });
  }

  async function createTaskFromForm() {
    if (!form.title.trim()) {
      focusCell("create", "title");
      return;
    }

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setForm(defaultForm());
    await loadData();
    focusCell("create", createFieldOrder[0]);
  }

  async function saveTask(taskId = selectedTask?.id, draft = panelDraft) {
    if (!taskId || !draft) {
      return;
    }

    await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dueDate: draft.dueDate,
        category: draft.category,
        requester: draft.requester,
        assignee: draft.assignee,
        title: draft.title,
        description: draft.description,
        isDaily: draft.isDaily,
        status: draft.status,
        progressNote: draft.progressNote,
        conclusion: draft.conclusion,
      }),
    });

    await loadData();
  }

  async function patchTask(taskId: string, payload: Partial<TaskRecord>) {
    await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await loadData();
  }

  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;

    if (nextIndex < 0 || nextIndex >= statusOrder.length) {
      return;
    }

    await patchTask(task.id, { status: statusOrder[nextIndex] });
    setSelectedTaskId(task.id);
  }

  async function moveToTrash(taskId: string) {
    await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    await loadData();
  }

  async function restoreTask(taskId: string) {
    await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    await loadData();
  }

  async function uploadFile() {
    if (!selectedTask || !pendingUpload) {
      return;
    }

    const body = new FormData();
    body.append("file", pendingUpload);
    body.append("taskId", selectedTask.id);

    await fetch("/api/upload", {
      method: "POST",
      body,
    });

    setPendingUpload(null);
    await loadData();
  }

  async function uploadNextVersion() {
    if (!versionTargetId || !pendingVersionUpload) {
      return;
    }

    const body = new FormData();
    body.append("file", pendingVersionUpload);

    await fetch(`/api/files/${encodeURIComponent(versionTargetId)}/version`, {
      method: "POST",
      body,
    });

    setPendingVersionUpload(null);
    await loadData();
  }

  async function moveFileToTrash(fileId: string) {
    await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    await loadData();
  }

  async function restoreFile(fileId: string) {
    await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    await loadData();
  }

  function handleCreateFieldKeyDown(field: CreateSheetField) {
    return async (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        await createTaskFromForm();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setForm(defaultForm());
        focusCell("create", createFieldOrder[0]);
        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      const index = createFieldOrder.indexOf(field);
      const nextField = createFieldOrder[index + 1];

      if (nextField) {
        focusCell("create", nextField);
        return;
      }

      await createTaskFromForm();
    };
  }

  function handleDraftFieldKeyDown(taskId: string, field: EditableSheetField) {
    return async (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        await saveTask(taskId, panelDraft);
        focusCell(taskId, field);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedTaskId(null);
        return;
      }

      const currentIndex = tasks.findIndex((task) => task.id === taskId);
      if (event.key === "ArrowDown") {
        const nextTask = tasks[currentIndex + 1];

        if (nextTask) {
          event.preventDefault();
          setSelectedTaskId(nextTask.id);
          focusCell(nextTask.id, field);
        }

        return;
      }

      if (event.key === "ArrowUp") {
        const prevTask = tasks[currentIndex - 1];

        if (prevTask) {
          event.preventDefault();
          setSelectedTaskId(prevTask.id);
          focusCell(prevTask.id, field);
        }

        return;
      }

      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      const index = sheetFieldOrder.indexOf(field);
      const nextField = sheetFieldOrder[index + 1];

      if (nextField) {
        focusCell(taskId, nextField);
        return;
      }

      await saveTask(taskId, panelDraft);
      focusCell(taskId, sheetFieldOrder[0]);
    };
  }

  return (
    <section className={clsx("workspace", mode === "daily" && "workspace--daily")}>
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">{authUser.name}</p>
          <p className="workspace__project">{projectName || "New Project"}</p>
          <h2>{titleByMode(mode)}</h2>
          <p className="workspace__copy">The same task data is shown as a board, daily sheet, monthly calendar, and trash view.</p>
          {systemMode ? (
            <>
              <p className="workspace__meta">
                Data mode {systemMode.dataMode} / Upload root {systemMode.uploadRoot}
              </p>
              <p className="workspace__meta">
                Project meta {systemMode.projectMetaPath} / Status {projectLoaded ? (isSyncing ? "Syncing" : projectSource ?? "local") : "Loading"}
              </p>
            </>
          ) : null}
        </div>

        {!isTrashMode ? (
          <form
            className={clsx("quick-form", mode === "daily" && "quick-form--wide")}
            onSubmit={(event) => {
              event.preventDefault();
              void createTaskFromForm();
            }}
          >
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Task title" />
            <input type="date" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} />
            <input value={form.category} onChange={(event) => updateForm("category", event.target.value)} placeholder="Category" />
            <input value={form.requester} onChange={(event) => updateForm("requester", event.target.value)} placeholder="Requester" />
            <input value={form.assignee} onChange={(event) => updateForm("assignee", event.target.value)} placeholder="Assignee" />
            <button type="submit">Add</button>
          </form>
        ) : null}
      </header>

      {mode === "daily" ? (
        <div className="keyboard-hints">
          <span>Enter next cell</span>
          <span>Ctrl or Command plus S save</span>
          <span>Arrow Up and Down keep the same column</span>
          <span>Escape clear selection</span>
        </div>
      ) : null}

      <div className={clsx("workspace__body", mode !== "daily" && "workspace__body--single")}>
        <div className="workspace__main">
          {tasks.length === 0 && files.length === 0 ? (
            <div className="empty-state">
              <h3>No data yet.</h3>
              <p>Set a project name and add the first task to validate the full flow.</p>
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
                  <span className="board-summary__label">Todo</span>
                  <strong>{boardSummary.byStatus.todo}</strong>
                </article>
                <article className="board-summary__card">
                  <span className="board-summary__label">In Progress</span>
                  <strong>{boardSummary.byStatus.in_progress}</strong>
                </article>
                <article className="board-summary__card">
                  <span className="board-summary__label">Blocked</span>
                  <strong>{boardSummary.byStatus.blocked}</strong>
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
                        const isActive = task.id === selectedTaskId;

                        return (
                          <article
                            className={clsx("task-card", isActive && "task-card--active")}
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
                              <p>{task.description || "No description yet."}</p>
                            </div>
                            <div className="task-card__meta">
                              <span>Due {task.dueDate || "n/a"}</span>
                              <span>Category {task.category || "n/a"}</span>
                              <span>Assignee {task.assignee || "n/a"}</span>
                              <span>Files {taskFiles.length}</span>
                            </div>
                            <div className="task-card__actions">
                              <button className="secondary-button" disabled={task.status === statusOrder[0]} onClick={(event) => { event.stopPropagation(); void shiftTaskStatus(task, -1); }} type="button">Prev</button>
                              <button className="primary-button" disabled={task.status === statusOrder[statusOrder.length - 1]} onClick={(event) => { event.stopPropagation(); void shiftTaskStatus(task, 1); }} type="button">Next</button>
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
            <div className="sheet-wrapper">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>Task No</th>
                    <th>Due Date</th>
                    <th>Category</th>
                    <th>Requester</th>
                    <th>Assignee</th>
                    <th>Title</th>
                    <th>Created</th>
                    <th>Daily</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Conclusion</th>
                    <th>Files</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="sheet-create-row">
                    <td>Auto</td>
                    <td><input className="sheet-input" id={cellId("create", "dueDate")} type="date" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} onKeyDown={handleCreateFieldKeyDown("dueDate")} /></td>
                    <td><input className="sheet-input" id={cellId("create", "category")} value={form.category} onChange={(event) => updateForm("category", event.target.value)} onKeyDown={handleCreateFieldKeyDown("category")} placeholder="Category" /></td>
                    <td><input className="sheet-input" id={cellId("create", "requester")} value={form.requester} onChange={(event) => updateForm("requester", event.target.value)} onKeyDown={handleCreateFieldKeyDown("requester")} placeholder="Requester" /></td>
                    <td><input className="sheet-input" id={cellId("create", "assignee")} value={form.assignee} onChange={(event) => updateForm("assignee", event.target.value)} onKeyDown={handleCreateFieldKeyDown("assignee")} placeholder="Assignee" /></td>
                    <td><input className="sheet-input" id={cellId("create", "title")} value={form.title} onChange={(event) => updateForm("title", event.target.value)} onKeyDown={handleCreateFieldKeyDown("title")} placeholder="Title" /></td>
                    <td>{format(new Date(), "yyyy-MM-dd")}</td>
                    <td><input checked={form.isDaily} onChange={(event) => updateForm("isDaily", event.target.checked)} type="checkbox" /></td>
                    <td><textarea className="sheet-textarea" id={cellId("create", "description")} rows={2} value={form.description} onChange={(event) => updateForm("description", event.target.value)} onKeyDown={handleCreateFieldKeyDown("description")} placeholder="Description" /></td>
                    <td><span className="status-pill status-pill--todo">Todo</span></td>
                    <td />
                    <td />
                    <td><button className="sheet-action" onClick={() => void createTaskFromForm()} type="button">Add</button></td>
                  </tr>

                  {tasks.map((task) => {
                    const isSelected = task.id === selectedTaskId;
                    const draft = isSelected && panelDraft ? panelDraft : null;
                    const taskFiles = filesByTaskId[task.id] ?? [];

                    return (
                      <tr className={clsx(isSelected && "sheet-row--active", isSelected && "sheet-row--editing")} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                        <td>{formatTaskNumber(task.taskNumber)}</td>
                        <td>{draft ? <input className="sheet-input" id={cellId(task.id, "dueDate")} type="date" value={draft.dueDate ?? ""} onChange={(event) => updateDraft("dueDate", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "dueDate")} /> : task.dueDate || "-"}</td>
                        <td>{draft ? <input className="sheet-input" id={cellId(task.id, "category")} value={draft.category ?? ""} onChange={(event) => updateDraft("category", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "category")} /> : task.category || "-"}</td>
                        <td>{draft ? <input className="sheet-input" id={cellId(task.id, "requester")} value={draft.requester ?? ""} onChange={(event) => updateDraft("requester", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "requester")} /> : task.requester || "-"}</td>
                        <td>{draft ? <input className="sheet-input" id={cellId(task.id, "assignee")} value={draft.assignee ?? ""} onChange={(event) => updateDraft("assignee", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "assignee")} /> : task.assignee || "-"}</td>
                        <td>{draft ? <input className="sheet-input" id={cellId(task.id, "title")} value={draft.title ?? ""} onChange={(event) => updateDraft("title", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "title")} /> : task.title}</td>
                        <td>{format(parseISO(task.createdAt), "yyyy-MM-dd")}</td>
                        <td>{draft ? <input checked={Boolean(draft.isDaily)} onChange={(event) => updateDraft("isDaily", event.target.checked)} type="checkbox" /> : task.isDaily ? "Y" : ""}</td>
                        <td>{draft ? <textarea className="sheet-textarea" id={cellId(task.id, "description")} rows={2} value={draft.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "description")} /> : <span className="sheet-cell__text">{task.description || "-"}</span>}</td>
                        <td>{draft ? <select className="sheet-select" id={cellId(task.id, "status")} value={(draft.status as TaskStatus | undefined) ?? "todo"} onChange={(event) => updateDraft("status", event.target.value as TaskStatus)} onKeyDown={handleDraftFieldKeyDown(task.id, "status")}>{statusOrder.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select> : <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>}</td>
                        <td>{draft ? <textarea className="sheet-textarea" id={cellId(task.id, "progressNote")} rows={2} value={draft.progressNote ?? ""} onChange={(event) => updateDraft("progressNote", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "progressNote")} /> : <span className="sheet-cell__text">{task.progressNote || "-"}</span>}</td>
                        <td>{draft ? <textarea className="sheet-textarea" id={cellId(task.id, "conclusion")} rows={2} value={draft.conclusion ?? ""} onChange={(event) => updateDraft("conclusion", event.target.value)} onKeyDown={handleDraftFieldKeyDown(task.id, "conclusion")} /> : <span className="sheet-cell__text">{task.conclusion || "-"}</span>}</td>
                        <td><div className="sheet-file-cell"><span>{taskFiles.length}</span>{draft ? <button className="sheet-action" onClick={(event) => { event.stopPropagation(); void saveTask(task.id, panelDraft); }} type="button">Save</button> : null}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {mode === "calendar" ? (
            <div className="calendar-grid">
              {calendarDays.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayTasks = tasks.filter((task) => task.dueDate === dayKey);

                return (
                  <article className={clsx("calendar-cell", !isSameMonth(day, calendarBaseDate) && "calendar-cell--muted", isToday(day) && "calendar-cell--today")} key={dayKey}>
                    <header><span>{format(day, "d")}</span></header>
                    <div className="calendar-cell__items">
                      {dayTasks.map((task) => <Link className="calendar-link" key={task.id} href={`/daily?taskId=${task.id}`}>{formatTaskNumber(task.taskNumber)} {task.title}</Link>)}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {mode === "trash" ? (
            <div className="trash-layout">
              <section className="trash-section">
                <header className="trash-section__header"><h3>Deleted tasks</h3><span>{tasks.length}</span></header>
                <div className="trash-list">
                  {tasks.length === 0 ? <div className="board-column__empty">No deleted tasks.</div> : null}
                  {tasks.map((task) => <article className="trash-card" key={task.id}><div><strong>{formatTaskNumber(task.taskNumber)}</strong><p>{task.title}</p><small>Deleted {task.deletedAt?.slice(0, 10) || "-"}</small></div><button className="primary-button" onClick={() => void restoreTask(task.id)} type="button">Restore</button></article>)}
                </div>
              </section>

              <section className="trash-section">
                <header className="trash-section__header"><h3>Deleted files</h3><span>{files.length}</span></header>
                <div className="trash-list">
                  {files.length === 0 ? <div className="board-column__empty">No deleted files.</div> : null}
                  {files.map((file) => <article className="trash-card" key={file.id}><div><strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong><p>{file.storedPath}</p><small>Deleted {file.deletedAt?.slice(0, 10) || "-"}</small></div><button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">Restore</button></article>)}
                </div>
              </section>
            </div>
          ) : null}
        </div>
        {mode === "daily" ? (
          <aside className="detail-panel">
          <header className="detail-panel__header">
            <div>
              <p className="workspace__eyebrow">Detail panel</p>
              <h3>{selectedTask ? formatTaskNumber(selectedTask.taskNumber) : "No task selected"}</h3>
            </div>
            {selectedTask && !isTrashMode ? <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">Move to trash</button> : null}
          </header>

          {panelDraft ? (
            <div className="detail-panel__body">
              <div className="status-rail">
                {statusOrder.map((status) => <button className={clsx("status-pill", `status-pill--${status}`, panelDraft.status === status && "status-pill--selected")} key={status} onClick={() => updateDraft("status", status)} type="button">{statusLabel[status]}</button>)}
              </div>

              <label><span>Title</span><input value={panelDraft.title ?? ""} onChange={(event) => updateDraft("title", event.target.value)} /></label>
              <label><span>Due date</span><input type="date" value={panelDraft.dueDate ?? ""} onChange={(event) => updateDraft("dueDate", event.target.value)} /></label>
              <label><span>Category</span><input value={panelDraft.category ?? ""} onChange={(event) => updateDraft("category", event.target.value)} /></label>
              <label><span>Requester</span><input value={panelDraft.requester ?? ""} onChange={(event) => updateDraft("requester", event.target.value)} /></label>
              <label><span>Assignee</span><input value={panelDraft.assignee ?? ""} onChange={(event) => updateDraft("assignee", event.target.value)} /></label>
              <label><span>Description</span><textarea rows={4} value={panelDraft.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} /></label>
              <label><span>Progress</span><textarea rows={4} value={panelDraft.progressNote ?? ""} onChange={(event) => updateDraft("progressNote", event.target.value)} /></label>
              <label><span>Conclusion</span><textarea rows={4} value={panelDraft.conclusion ?? ""} onChange={(event) => updateDraft("conclusion", event.target.value)} /></label>

              {!isTrashMode ? (
                <>
                  <div className="upload-box">
                    <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                    <button className="primary-button" onClick={() => void uploadFile()} type="button">Attach file</button>
                  </div>
                  {selectedFiles.length > 0 ? (
                    <div className="upload-box upload-box--version">
                      <select value={versionTargetId} onChange={(event) => setVersionTargetId(event.target.value)}>
                        {selectedFiles.map((file) => <option key={file.id} value={file.id}>{file.originalName} {file.versionLabel}</option>)}
                      </select>
                      <input onChange={(event) => setPendingVersionUpload(event.target.files?.[0] ?? null)} type="file" />
                      <button className="secondary-button" onClick={() => void uploadNextVersion()} type="button">Upload next version</button>
                    </div>
                  ) : null}
                  <div className="file-list">
                    {selectedFiles.length === 0 ? <p>No attached files.</p> : null}
                    {selectedFiles.map((file) => (
                      <article className="file-pill" key={file.id}>
                        <div>
                          <strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong>
                          <small>{file.storedPath}</small>
                        </div>
                        <div className="file-pill__actions">
                          <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">Remove</button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <button className="primary-button" onClick={() => void saveTask()} type="button">Save task</button>
                </>
              ) : (
                <div className="file-list">
                  {selectedFiles.length === 0 ? <p>No deleted files linked.</p> : null}
                  {selectedFiles.map((file) => (
                    <article className="file-pill" key={file.id}>
                      <div>
                        <strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong>
                        <small>{file.storedPath}</small>
                      </div>
                      <div className="file-pill__actions">
                        <button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">Restore file</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="detail-panel__empty">Select a task to edit details and manage files.</div>
          )}
        </aside>
        ) : null}
      </div>
    </section>
  );
}

function titleByMode(mode: DashboardMode) {
  if (mode === "board") return "Board";
  if (mode === "daily") return "Daily sheet";
  if (mode === "calendar") return "Monthly calendar";
  return "Trash";
}

function boardColumnCopy(status: TaskStatus) {
  if (status === "todo") return "New requests and waiting tasks";
  if (status === "in_progress") return "Tasks currently in motion";
  if (status === "blocked") return "Waiting for review or external input";
  return "Closed and reflected tasks";
}

function formatTaskNumber(taskNumber: string) {
  const legacyMatch = /^MIL-(\d+)$/.exec(taskNumber);

  if (legacyMatch) {
    return `#${legacyMatch[1]}`;
  }

  return taskNumber;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}