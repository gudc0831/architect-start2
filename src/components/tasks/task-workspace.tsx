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

const statusOrder: TaskStatus[] = ["waiting", "todo", "in_progress", "blocked", "done"];
const statusLabel: Record<TaskStatus, string> = {
  waiting: "대기",
  todo: "할 일",
  in_progress: "진행 중",
  blocked: "보류",
  done: "완료",
};

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

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const [taskResponse, fileResponse, statusResponse] = await Promise.all([
        fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
        fetch(`/api/files${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
        fetch("/api/system/status", { cache: "no-store" }),
      ]);

      if (!taskResponse.ok) {
        throw new Error(await readErrorMessage(taskResponse, "작업 목록을 불러오지 못했습니다."));
      }
      if (!fileResponse.ok) {
        throw new Error(await readErrorMessage(fileResponse, "파일 목록을 불러오지 못했습니다."));
      }

      const taskJson = (await taskResponse.json()) as { data: TaskRecord[] };
      const fileJson = (await fileResponse.json()) as { data: FileRecord[] };
      const statusJson = statusResponse.ok
        ? ((await statusResponse.json()) as { data: SystemMode })
        : { data: null };

      setTasks(taskJson.data);
      setFiles(fileJson.data);
      setSystemMode(statusJson.data ?? null);
      setSelectedTaskId((prev) => {
        if (focusTaskId && taskJson.data.some((task) => task.id === focusTaskId)) return focusTaskId;
        if (prev && taskJson.data.some((task) => task.id === prev)) return prev;
        return taskJson.data[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [focusTaskId, scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, tasks]);
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
  const selectedFiles = useMemo(() => (selectedTask ? filesByTaskId[selectedTask.id] ?? [] : []), [filesByTaskId, selectedTask]);
  const directChildren = useMemo(() => sortTasksByNumber(tasks.filter((task) => task.parentTaskId === selectedTask?.id)), [selectedTask, tasks]);
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
    () => statusOrder.map((status) => ({ status, items: tasks.filter((task) => task.status === status) })),
    [tasks],
  );
  const boardSummary = useMemo(() => {
    const overdueCount = tasks.filter((task) => task.dueDate && task.dueDate < todayKey() && task.status !== "done").length;
    const byStatus = statusOrder.reduce(
      (acc, status) => ({ ...acc, [status]: tasks.filter((task) => task.status === status).length }),
      {} as Record<TaskStatus, number>,
    );

    return { total: tasks.length, overdue: overdueCount, byStatus };
  }, [tasks]);
  const calendarBaseDate = useMemo(() => {
    const firstDueDate = tasks.find((task) => task.dueDate)?.dueDate;
    return firstDueDate ? parseISO(firstDueDate) : new Date();
  }, [tasks]);
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(calendarBaseDate), { weekStartsOn: 1 }),
      }),
    [calendarBaseDate],
  );

  function updateForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateChildForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setChildForm((prev) => ({ ...prev, [key]: value }));
  }

  async function createTaskFromForm(nextForm: TaskFormState, parentTaskNumber?: string) {
    setErrorMessage(null);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nextForm, parentTaskNumber }),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "작업 생성에 실패했습니다."));
      return;
    }

    const json = (await response.json()) as { data: TaskRecord };
    await loadData();
    setSelectedTaskId(json.data.id);
    if (parentTaskNumber) {
      setChildForm(defaultForm());
    } else {
      setForm(defaultForm());
    }
  }

  async function saveSelectedTask() {
    if (!draft) return;
    setSaving(true);
    setErrorMessage(null);

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
        const message = await readErrorMessage(response, "작업 저장에 실패했습니다.");
        if (response.status === 409) {
          await loadData();
        }
        throw new Error(message);
      }

      const json = (await response.json()) as { data: TaskRecord };
      setDraft(json.data);
      setTasks((prev) => prev.map((task) => (task.id === json.data.id ? json.data : task)));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "작업 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function patchTask(task: TaskRecord, payload: Partial<TaskRecord>) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, version: task.version }),
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "작업 수정에 실패했습니다."));
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
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "휴지통 이동에 실패했습니다."));
      return;
    }
    await loadData();
  }

  async function restoreTask(taskId: string) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "복원에 실패했습니다."));
      return;
    }
    await loadData();
  }

  async function uploadFileForTask(taskId: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    body.append("taskId", taskId);
    const response = await fetch("/api/upload", { method: "POST", body });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "파일 업로드에 실패했습니다."));
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

    const body = new FormData();
    body.append("file", pendingVersionUpload);
    const response = await fetch(`/api/files/${encodeURIComponent(versionTargetId)}/version`, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "파일 버전 업로드에 실패했습니다."));
      return;
    }

    setPendingVersionUpload(null);
    await loadData();
  }
  async function moveFileToTrash(fileId: string) {
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/trash`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "파일 삭제에 실패했습니다."));
      return;
    }
    await loadData();
  }

  async function restoreFile(fileId: string) {
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/restore`, { method: "POST" });
    if (!response.ok) {
      setErrorMessage(await readErrorMessage(response, "파일 복원에 실패했습니다."));
      return;
    }
    await loadData();
  }

  return (
    <section className={clsx("workspace", mode === "daily" && "workspace--daily")}>
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">{authUser?.displayName ?? "사용자"}</p>
          <p className="workspace__project">{projectName || "프로젝트"}</p>
          <h2>{titleByMode(mode)}</h2>
          <p className="workspace__copy">같은 작업 데이터를 보드, 일별 목록, 달력, 휴지통으로 확인합니다.</p>
          {systemMode ? (
            <>
              <p className="workspace__meta">데이터 모드 {systemMode.dataMode} / 업로드 {systemMode.uploadMode}</p>
              <p className="workspace__meta">프로젝트 메타 {projectLoaded ? (isSyncing ? "동기화 중" : projectSource ?? "unknown") : "불러오는 중"} / Supabase {systemMode.hasSupabase ? "configured" : "missing"}</p>
            </>
          ) : null}
        </div>
      </header>

      {errorMessage ? <p className="detail-panel__warning detail-panel__warning--error">{errorMessage}</p> : null}
      {loading ? <div className="empty-state"><h3>불러오는 중</h3></div> : null}

      <div className={clsx("workspace__body", mode !== "daily" && "workspace__body--single")}>
        <div className="workspace__main">
          {tasks.length === 0 && files.length === 0 && !loading ? (
            <div className="empty-state">
              <h3>아직 작업이 없습니다.</h3>
              <p>새 작업을 추가해 흐름을 시작하세요.</p>
            </div>
          ) : null}

          {mode === "board" ? (
            <div className="board-layout">
              <section className="board-summary">
                <article className="board-summary__card"><span className="board-summary__label">전체</span><strong>{boardSummary.total}</strong></article>
                <article className="board-summary__card"><span className="board-summary__label">대기</span><strong>{boardSummary.byStatus.waiting}</strong></article>
                <article className="board-summary__card"><span className="board-summary__label">할 일</span><strong>{boardSummary.byStatus.todo}</strong></article>
                <article className="board-summary__card"><span className="board-summary__label">진행 중</span><strong>{boardSummary.byStatus.in_progress}</strong></article>
                <article className="board-summary__card board-summary__card--warn"><span className="board-summary__label">지연</span><strong>{boardSummary.overdue}</strong></article>
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
                      {group.items.length === 0 ? <div className="board-column__empty">이 상태의 작업이 없습니다.</div> : null}
                      {group.items.map((task) => {
                        const taskFiles = filesByTaskId[task.id] ?? [];
                        return (
                          <article className={clsx("task-card", task.id === selectedTaskId && "task-card--active")} key={task.id} onClick={() => setSelectedTaskId(task.id)} role="button" tabIndex={0}>
                            <div className="task-card__top">
                              <strong>{formatTaskNumber(task.taskNumber)}</strong>
                              <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>
                            </div>
                            <div className="task-card__main">
                              <h4>{task.title}</h4>
                              <p>{task.description || "설명이 없습니다."}</p>
                            </div>
                            <div className="task-card__meta">
                              <span>기한 {task.dueDate || "-"}</span>
                              <span>분류 {task.category || "-"}</span>
                              <span>담당 {task.assignee || "-"}</span>
                              <span>파일 {taskFiles.length}</span>
                            </div>
                            <div className="task-card__actions">
                              <button className="secondary-button" disabled={task.status === statusOrder[0]} onClick={(event) => { event.stopPropagation(); void shiftTaskStatus(task, -1); }} type="button">이전</button>
                              <button className="primary-button" disabled={task.status === statusOrder[statusOrder.length - 1]} onClick={(event) => { event.stopPropagation(); void shiftTaskStatus(task, 1); }} type="button">다음</button>
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
              <div className="detail-section">
                <div className="detail-section__header"><h4>새 작업 추가</h4></div>
                <div className="detail-child-grid">
                  <input onChange={(event) => updateForm("title", event.target.value)} placeholder="제목" value={form.title} />
                  <input onChange={(event) => updateForm("dueDate", event.target.value)} type="date" value={form.dueDate} />
                  <input onChange={(event) => updateForm("createdAt", event.target.value)} type="date" value={form.createdAt} />
                  <input onChange={(event) => updateForm("category", event.target.value)} placeholder="분류" value={form.category} />
                  <input onChange={(event) => updateForm("requester", event.target.value)} placeholder="요청자" value={form.requester} />
                  <input onChange={(event) => updateForm("assignee", event.target.value)} placeholder="담당자" value={form.assignee} />
                  <textarea onChange={(event) => updateForm("description", event.target.value)} placeholder="설명" rows={2} value={form.description} />
                  <input onChange={(event) => updateForm("fileMemo", event.target.value)} placeholder="파일 메모" value={form.fileMemo} />
                </div>
                <button className="primary-button" onClick={() => void createTaskFromForm(form)} type="button">작업 추가</button>
              </div>

              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>작업번호</th>
                    <th>기한일</th>
                    <th>분류</th>
                    <th>요청자</th>
                    <th>담당자</th>
                    <th>항목</th>
                    <th>상태</th>
                    <th>파일</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const taskFiles = filesByTaskId[task.id] ?? [];
                    return (
                      <tr className={clsx(task.id === selectedTaskId && "sheet-row--active")} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                        <td>{formatTaskNumber(task.taskNumber)}</td>
                        <td>{task.dueDate || "-"}</td>
                        <td>{task.category || "-"}</td>
                        <td>{task.requester || "-"}</td>
                        <td>{task.assignee || "-"}</td>
                        <td>{task.title}</td>
                        <td><span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span></td>
                        <td>{taskFiles.length}</td>
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
                    <header>
                      <span>{format(day, "d")}</span>
                      <small>{formatDay(day)}</small>
                    </header>
                    <div className="calendar-cell__items">
                      {dayTasks.map((task) => (
                        <Link className="calendar-link" href={`/daily?taskId=${task.id}`} key={task.id}>
                          {formatTaskNumber(task.taskNumber)} {task.title}
                        </Link>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {mode === "trash" ? (
            <div className="trash-layout">
              <section className="trash-section">
                <header className="trash-section__header"><h3>삭제된 작업</h3><span>{tasks.length}</span></header>
                <div className="trash-list">
                  {tasks.length === 0 ? <div className="board-column__empty">삭제된 작업이 없습니다.</div> : null}
                  {tasks.map((task) => (
                    <article className="trash-card" key={task.id}>
                      <div>
                        <strong>{formatTaskNumber(task.taskNumber)}</strong>
                        <p>{task.title}</p>
                        <small>삭제일 {task.deletedAt?.slice(0, 10) || "-"}</small>
                      </div>
                      <button className="primary-button" onClick={() => void restoreTask(task.id)} type="button">복구</button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="trash-section">
                <header className="trash-section__header"><h3>삭제된 파일</h3><span>{files.length}</span></header>
                <div className="trash-list">
                  {files.length === 0 ? <div className="board-column__empty">삭제된 파일이 없습니다.</div> : null}
                  {files.map((file) => (
                    <article className="trash-card" key={file.id}>
                      <div>
                        <strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong>
                        <p>{file.downloadUrl ? "다운로드 링크 발급 가능" : "private storage"}</p>
                        <small>삭제일 {file.deletedAt?.slice(0, 10) || "-"}</small>
                      </div>
                      <button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">복구</button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}
        </div>

        {mode === "daily" ? (
          <aside className="detail-panel">
            <header className="detail-panel__header">
              <div>
                <p className="workspace__eyebrow">상세 편집</p>
                <h3>{selectedTask ? formatTaskNumber(selectedTask.taskNumber) : "선택된 작업 없음"}</h3>
              </div>
              {selectedTask && !isTrashMode ? <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">휴지통 이동</button> : null}
            </header>

            {draft ? (
              <div className="detail-panel__body">
                <div className="status-rail">
                  {statusOrder.map((status) => (
                    <button className={clsx("status-pill", `status-pill--${status}`, draft.status === status && "status-pill--selected")} key={status} onClick={() => setDraft((prev) => (prev ? { ...prev, status } : prev))} type="button">{statusLabel[status]}</button>
                  ))}
                </div>

                <label><span>제목</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, title: event.target.value } : prev))} value={draft.title} /></label>
                <label><span>기한일</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, dueDate: event.target.value } : prev))} type="date" value={draft.dueDate} /></label>
                <label><span>등록일</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, createdAt: event.target.value } : prev))} type="date" value={draft.createdAt} /></label>
                <label><span>분류</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, category: event.target.value } : prev))} value={draft.category} /></label>
                <label><span>요청자</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, requester: event.target.value } : prev))} value={draft.requester} /></label>
                <label><span>담당자</span><input onChange={(event) => setDraft((prev) => (prev ? { ...prev, assignee: event.target.value } : prev))} value={draft.assignee} /></label>
                <label><span>설명</span><textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))} rows={4} value={draft.description} /></label>
                <label><span>진행사항</span><textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, progressNote: event.target.value } : prev))} rows={4} value={draft.progressNote} /></label>
                <label><span>결론</span><textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, conclusion: event.target.value } : prev))} rows={4} value={draft.conclusion} /></label>
                <label><span>파일 메모</span><textarea onChange={(event) => setDraft((prev) => (prev ? { ...prev, fileMemo: event.target.value } : prev))} rows={3} value={draft.fileMemo} /></label>
                <label><span>상위 작업 번호</span><input onChange={(event) => setParentTaskNumberDraft(event.target.value)} placeholder="#12 또는 12" value={parentTaskNumberDraft} /></label>

                <div className="detail-actions">
                  <button className="primary-button" disabled={saving} onClick={() => void saveSelectedTask()} type="button">{saving ? "저장 중" : "저장"}</button>
                  <button className="secondary-button" onClick={() => setDraft(selectedTask ? { ...selectedTask } : null)} type="button">변경 취소</button>
                </div>

                <section className="detail-section">
                  <div className="detail-section__header"><h4>하위 작업</h4></div>
                  <p>현재 상위 작업: {selectedParentTask ? `${formatTaskNumber(selectedParentTask.taskNumber)} ${selectedParentTask.title}` : "없음"}</p>
                  {directChildren.length > 0 ? <ul className="detail-tree-list">{directChildren.map((child) => <li key={child.id}>{formatTaskNumber(child.taskNumber)} {child.title}</li>)}</ul> : <p>하위 작업 없음</p>}
                  <div className="detail-child-grid">
                    <input onChange={(event) => updateChildForm("title", event.target.value)} placeholder="제목" value={childForm.title} />
                    <input onChange={(event) => updateChildForm("dueDate", event.target.value)} type="date" value={childForm.dueDate} />
                    <input onChange={(event) => updateChildForm("createdAt", event.target.value)} type="date" value={childForm.createdAt} />
                    <input onChange={(event) => updateChildForm("category", event.target.value)} placeholder="분류" value={childForm.category} />
                    <input onChange={(event) => updateChildForm("requester", event.target.value)} placeholder="요청자" value={childForm.requester} />
                    <input onChange={(event) => updateChildForm("assignee", event.target.value)} placeholder="담당자" value={childForm.assignee} />
                    <textarea onChange={(event) => updateChildForm("description", event.target.value)} placeholder="설명" rows={2} value={childForm.description} />
                    <input onChange={(event) => updateChildForm("fileMemo", event.target.value)} placeholder="파일 메모" value={childForm.fileMemo} />
                  </div>
                  <button className="primary-button" onClick={() => void createTaskFromForm(childForm, selectedTask ? String(selectedTask.taskNumber) : undefined)} type="button">하위 작업 추가</button>
                </section>
                <section className="detail-section">
                  <div className="detail-section__header"><h4>파일</h4></div>
                  <div className="upload-box">
                    <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                    <button className="primary-button" onClick={() => void uploadSelectedFile()} type="button">파일 첨부</button>
                  </div>
                  {selectedFiles.length > 0 ? (
                    <div className="upload-box upload-box--version">
                      <select onChange={(event) => setVersionTargetId(event.target.value)} value={versionTargetId}>
                        {selectedFiles.map((file) => (
                          <option key={file.id} value={file.id}>{file.originalName} {file.versionLabel}</option>
                        ))}
                      </select>
                      <input onChange={(event) => setPendingVersionUpload(event.target.files?.[0] ?? null)} type="file" />
                      <button className="secondary-button" onClick={() => void uploadNextVersion()} type="button">다음 버전 업로드</button>
                    </div>
                  ) : null}
                  <div className="file-list">
                    {selectedFiles.length === 0 ? <p>연결된 파일이 없습니다.</p> : null}
                    {selectedFiles.map((file) => (
                      <article className="file-pill" key={file.id}>
                        <div>
                          <strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong>
                          <small>{file.downloadUrl ? "다운로드 링크 사용 가능" : "private storage"}</small>
                        </div>
                        <div className="file-pill__actions">
                          {file.downloadUrl ? <a className="secondary-button" href={file.downloadUrl} rel="noreferrer" target="_blank">다운로드</a> : null}
                          <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">삭제</button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="detail-panel__empty">작업을 선택하면 상세 정보를 편집할 수 있습니다.</div>
            )}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function titleByMode(mode: DashboardMode) {
  if (mode === "board") return "보드";
  if (mode === "daily") return "작업목록(일별)";
  if (mode === "calendar") return "작업목록(월별)";
  return "휴지통";
}

function boardColumnCopy(status: TaskStatus) {
  if (status === "waiting") return "시작 전 확인이 필요한 작업";
  if (status === "todo") return "곧 시작할 작업";
  if (status === "in_progress") return "현재 진행 중인 작업";
  if (status === "blocked") return "검토 또는 외부 입력 대기";
  return "마무리된 작업";
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
  return "#" + taskNumber;
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