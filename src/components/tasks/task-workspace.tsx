"use client";

import { eachDayOfInterval, endOfMonth, format, isSameMonth, parseISO, startOfMonth } from "date-fns";
import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
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
};

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
  todo: "대기",
  in_progress: "진행중",
  blocked: "보류",
  done: "완료",
};

export function TaskWorkspace({ mode }: TaskWorkspaceProps) {
  const authUser = useAuthUser();
  const { projectName } = useProjectMeta();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [panelDraft, setPanelDraft] = useState<Partial<TaskRecord> | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);

  const scope = mode === "trash" ? "trash" : "active";

  const loadData = useCallback(async () => {
    const [taskResponse, fileResponse] = await Promise.all([
      fetch(`/api/tasks${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
      fetch(`/api/files${scope === "trash" ? "?scope=trash" : ""}`, { cache: "no-store" }),
    ]);

    const taskJson = await taskResponse.json();
    const fileJson = await fileResponse.json();

    setTasks(taskJson.data);
    setFiles(fileJson.data);

    if (!selectedTaskId && taskJson.data.length > 0) {
      setSelectedTaskId(taskJson.data[0].id);
    }

    if (taskJson.data.length === 0) {
      setSelectedTaskId(null);
      setPanelDraft(null);
    }
  }, [scope, selectedTaskId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((json) => setSystemMode({ dataMode: json.data.dataMode, uploadRoot: json.data.uploadRoot }))
      .catch(() => setSystemMode(null));
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    setPanelDraft(selectedTask);
  }, [selectedTask]);

  const selectedFiles = useMemo(() => {
    if (!selectedTask) {
      return [];
    }

    return files.filter((file) => file.taskId === selectedTask.id);
  }, [files, selectedTask]);

  const fileCountMap = useMemo(() => {
    return files.reduce<Record<string, number>>((acc, file) => {
      acc[file.taskId] = (acc[file.taskId] ?? 0) + 1;
      return acc;
    }, {});
  }, [files]);

  const groupedTasks = useMemo(
    () =>
      statusOrder.map((status) => ({
        status,
        items: tasks.filter((task) => task.status === status),
      })),
    [tasks],
  );

  const calendarDays = useMemo(() => {
    const firstDueDate = tasks.find((task) => task.dueDate)?.dueDate;
    const baseDate = firstDueDate ? parseISO(firstDueDate) : new Date();

    return eachDayOfInterval({
      start: startOfMonth(baseDate),
      end: endOfMonth(baseDate),
    });
  }, [tasks]);

  function updateForm<K extends keyof TaskFormState>(key: K, value: TaskFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function updateDraft<K extends keyof TaskRecord>(key: K, value: TaskRecord[K]) {
    setPanelDraft((prev) => ({ ...(prev ?? {}), [key]: value }));
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      return;
    }

    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setForm(defaultForm());
    await loadData();
  }

  async function saveTask() {
    if (!selectedTask || !panelDraft) {
      return;
    }

    await fetch(`/api/tasks/${selectedTask.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dueDate: panelDraft.dueDate,
        category: panelDraft.category,
        requester: panelDraft.requester,
        assignee: panelDraft.assignee,
        title: panelDraft.title,
        description: panelDraft.description,
        isDaily: panelDraft.isDaily,
        status: panelDraft.status,
        progressNote: panelDraft.progressNote,
        conclusion: panelDraft.conclusion,
      }),
    });

    await loadData();
  }

  async function moveToTrash(taskId: string) {
    await fetch(`/api/tasks/${taskId}/trash`, { method: "POST" });
    await loadData();
  }

  async function restoreTask(taskId: string) {
    await fetch(`/api/tasks/${taskId}/restore`, { method: "POST" });
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

  return (
    <section className="workspace">
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">{authUser.name}</p>
          <p className="workspace__project">{projectName || "새 프로젝트"}</p>
          <h2>{titleByMode(mode)}</h2>
          <p className="workspace__copy">보드와 일별 시트는 같은 task 데이터를 다른 뷰로 보여줍니다.</p>
          {systemMode ? (
            <p className="workspace__meta">
              데이터 모드: {systemMode.dataMode} / 업로드: {systemMode.uploadRoot}
            </p>
          ) : null}
        </div>
        <form className={clsx("quick-form", mode === "daily" && "quick-form--wide")} onSubmit={createTask}>
          <input
            value={form.title}
            onChange={(event) => updateForm("title", event.target.value)}
            placeholder="새 작업 항목"
          />
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => updateForm("dueDate", event.target.value)}
          />
          <input
            value={form.category}
            onChange={(event) => updateForm("category", event.target.value)}
            placeholder="분류"
          />
          <input
            value={form.requester}
            onChange={(event) => updateForm("requester", event.target.value)}
            placeholder="요청자"
          />
          <input
            value={form.assignee}
            onChange={(event) => updateForm("assignee", event.target.value)}
            placeholder="담당자"
          />
          <button type="submit">추가</button>
        </form>
      </header>

      <div className="workspace__body">
        <div className="workspace__main">
          {tasks.length === 0 ? (
            <div className="empty-state">
              <h3>아직 입력된 작업이 없습니다.</h3>
              <p>상단 입력 영역에서 첫 todo를 추가하면 보드, 일별, 달력, 휴지통 흐름을 바로 확인할 수 있습니다.</p>
            </div>
          ) : null}

          {mode === "board" ? (
            <div className="board-grid">
              {groupedTasks.map((group) => (
                <section className="board-column" key={group.status}>
                  <header>
                    <h3>{statusLabel[group.status]}</h3>
                    <span>{group.items.length}</span>
                  </header>
                  <div className="board-column__items">
                    {group.items.map((task) => (
                      <button
                        className={clsx("task-card", task.id === selectedTaskId && "task-card--active")}
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                        type="button"
                      >
                        <strong>{task.taskNumber}</strong>
                        <span>{task.title}</span>
                        <small>{task.assignee || "담당자 미지정"}</small>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}

          {mode === "daily" ? (
            <div className="sheet-wrapper">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>작업번호</th>
                    <th>기한/날짜</th>
                    <th>분류</th>
                    <th>요청자</th>
                    <th>담당자</th>
                    <th>항목</th>
                    <th>작성일시</th>
                    <th>일일등록</th>
                    <th>설명</th>
                    <th>진행상황</th>
                    <th>진행사항</th>
                    <th>결론</th>
                    <th>관련파일</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="sheet-create-row">
                    <td>자동</td>
                    <td>
                      <input
                        className="sheet-input"
                        type="date"
                        value={form.dueDate}
                        onChange={(event) => updateForm("dueDate", event.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="sheet-input"
                        value={form.category}
                        onChange={(event) => updateForm("category", event.target.value)}
                        placeholder="분류"
                      />
                    </td>
                    <td>
                      <input
                        className="sheet-input"
                        value={form.requester}
                        onChange={(event) => updateForm("requester", event.target.value)}
                        placeholder="요청자"
                      />
                    </td>
                    <td>
                      <input
                        className="sheet-input"
                        value={form.assignee}
                        onChange={(event) => updateForm("assignee", event.target.value)}
                        placeholder="담당자"
                      />
                    </td>
                    <td>
                      <input
                        className="sheet-input"
                        value={form.title}
                        onChange={(event) => updateForm("title", event.target.value)}
                        placeholder="항목"
                      />
                    </td>
                    <td>{format(new Date(), "yyyy-MM-dd")}</td>
                    <td>
                      <input
                        checked={form.isDaily}
                        onChange={(event) => updateForm("isDaily", event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <textarea
                        className="sheet-textarea"
                        rows={2}
                        value={form.description}
                        onChange={(event) => updateForm("description", event.target.value)}
                        placeholder="설명"
                      />
                    </td>
                    <td>대기</td>
                    <td />
                    <td />
                    <td>
                      <button className="sheet-action" onClick={(event) => void createTask(event as never)} type="button">
                        추가
                      </button>
                    </td>
                  </tr>
                  {tasks.map((task) => {
                    const isSelected = task.id === selectedTaskId;
                    const draft = isSelected && panelDraft ? panelDraft : null;

                    return (
                      <tr
                        className={clsx(isSelected && "sheet-row--active", isSelected && "sheet-row--editing")}
                        key={task.id}
                        onClick={() => setSelectedTaskId(task.id)}
                      >
                        <td>{task.taskNumber}</td>
                        <td>
                          {draft ? (
                            <input
                              className="sheet-input"
                              type="date"
                              value={draft.dueDate ?? ""}
                              onChange={(event) => updateDraft("dueDate", event.target.value)}
                            />
                          ) : (
                            task.dueDate
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <input
                              className="sheet-input"
                              value={draft.category ?? ""}
                              onChange={(event) => updateDraft("category", event.target.value)}
                            />
                          ) : (
                            task.category
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <input
                              className="sheet-input"
                              value={draft.requester ?? ""}
                              onChange={(event) => updateDraft("requester", event.target.value)}
                            />
                          ) : (
                            task.requester
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <input
                              className="sheet-input"
                              value={draft.assignee ?? ""}
                              onChange={(event) => updateDraft("assignee", event.target.value)}
                            />
                          ) : (
                            task.assignee
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <input
                              className="sheet-input"
                              value={draft.title ?? ""}
                              onChange={(event) => updateDraft("title", event.target.value)}
                            />
                          ) : (
                            task.title
                          )}
                        </td>
                        <td>{format(parseISO(task.createdAt), "yyyy-MM-dd")}</td>
                        <td>
                          {draft ? (
                            <input
                              checked={Boolean(draft.isDaily)}
                              onChange={(event) => updateDraft("isDaily", event.target.checked)}
                              type="checkbox"
                            />
                          ) : task.isDaily ? (
                            "Y"
                          ) : (
                            ""
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <textarea
                              className="sheet-textarea"
                              rows={2}
                              value={draft.description ?? ""}
                              onChange={(event) => updateDraft("description", event.target.value)}
                            />
                          ) : (
                            task.description
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <select
                              className="sheet-select"
                              value={(draft.status as TaskStatus | undefined) ?? "todo"}
                              onChange={(event) => updateDraft("status", event.target.value as TaskStatus)}
                            >
                              {statusOrder.map((status) => (
                                <option key={status} value={status}>
                                  {statusLabel[status]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            statusLabel[task.status]
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <textarea
                              className="sheet-textarea"
                              rows={2}
                              value={draft.progressNote ?? ""}
                              onChange={(event) => updateDraft("progressNote", event.target.value)}
                            />
                          ) : (
                            task.progressNote
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <textarea
                              className="sheet-textarea"
                              rows={2}
                              value={draft.conclusion ?? ""}
                              onChange={(event) => updateDraft("conclusion", event.target.value)}
                            />
                          ) : (
                            task.conclusion
                          )}
                        </td>
                        <td>
                          {draft ? (
                            <div className="sheet-file-cell">
                              <span>{fileCountMap[task.id] ?? 0}개</span>
                              <button
                                className="sheet-action"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void saveTask();
                                }}
                                type="button"
                              >
                                저장
                              </button>
                            </div>
                          ) : (
                            `${fileCountMap[task.id] ?? 0}개`
                          )}
                        </td>
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
                  <article
                    className={clsx(
                      "calendar-cell",
                      !isSameMonth(day, calendarDays[0]) && "calendar-cell--muted",
                    )}
                    key={dayKey}
                  >
                    <header>{format(day, "d")}</header>
                    <div className="calendar-cell__items">
                      {dayTasks.map((task) => (
                        <button key={task.id} onClick={() => setSelectedTaskId(task.id)} type="button">
                          {task.taskNumber} · {task.title}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {mode === "trash" ? (
            <div className="trash-list">
              {tasks.map((task) => (
                <article className="trash-card" key={task.id}>
                  <div>
                    <strong>{task.taskNumber}</strong>
                    <p>{task.title}</p>
                    <small>삭제일 {task.deletedAt?.slice(0, 10)}</small>
                  </div>
                  <button onClick={() => restoreTask(task.id)} type="button">
                    복구
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="detail-panel">
          <header className="detail-panel__header">
            <h3>{selectedTask ? selectedTask.taskNumber : "선택된 작업 없음"}</h3>
            {selectedTask && mode !== "trash" ? (
              <button onClick={() => moveToTrash(selectedTask.id)} type="button">
                휴지통 이동
              </button>
            ) : null}
          </header>

          {panelDraft ? (
            <div className="detail-panel__body">
              <label>
                <span>항목</span>
                <input
                  value={panelDraft.title ?? ""}
                  onChange={(event) => updateDraft("title", event.target.value)}
                />
              </label>
              <label>
                <span>기한일</span>
                <input
                  type="date"
                  value={panelDraft.dueDate ?? ""}
                  onChange={(event) => updateDraft("dueDate", event.target.value)}
                />
              </label>
              <label>
                <span>분류</span>
                <input
                  value={panelDraft.category ?? ""}
                  onChange={(event) => updateDraft("category", event.target.value)}
                />
              </label>
              <label>
                <span>요청자</span>
                <input
                  value={panelDraft.requester ?? ""}
                  onChange={(event) => updateDraft("requester", event.target.value)}
                />
              </label>
              <label>
                <span>담당자</span>
                <input
                  value={panelDraft.assignee ?? ""}
                  onChange={(event) => updateDraft("assignee", event.target.value)}
                />
              </label>
              <label>
                <span>설명</span>
                <textarea
                  rows={4}
                  value={panelDraft.description ?? ""}
                  onChange={(event) => updateDraft("description", event.target.value)}
                />
              </label>
              <label>
                <span>진행상황</span>
                <select
                  value={(panelDraft.status as TaskStatus | undefined) ?? "todo"}
                  onChange={(event) => updateDraft("status", event.target.value as TaskStatus)}
                >
                  {statusOrder.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>진행사항</span>
                <textarea
                  rows={4}
                  value={panelDraft.progressNote ?? ""}
                  onChange={(event) => updateDraft("progressNote", event.target.value)}
                />
              </label>
              <label>
                <span>결론</span>
                <textarea
                  rows={4}
                  value={panelDraft.conclusion ?? ""}
                  onChange={(event) => updateDraft("conclusion", event.target.value)}
                />
              </label>
              {mode !== "trash" ? (
                <>
                  <div className="upload-box">
                    <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                    <button onClick={uploadFile} type="button">
                      파일 연결
                    </button>
                  </div>
                  <div className="file-list">
                    {selectedFiles.length === 0 ? <p>연결된 파일이 없습니다.</p> : null}
                    {selectedFiles.map((file) => (
                      <article className="file-pill" key={file.id}>
                        <strong>{file.originalName}</strong>
                        <small>{file.storedPath}</small>
                      </article>
                    ))}
                  </div>
                  <button className="primary-button" onClick={saveTask} type="button">
                    저장
                  </button>
                </>
              ) : (
                <div className="file-list">
                  {selectedFiles.map((file) => (
                    <article className="file-pill" key={file.id}>
                      <strong>{file.originalName}</strong>
                      <small>{file.storedPath}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="detail-panel__empty">작업을 선택하면 상세 패널이 열립니다.</div>
          )}
        </aside>
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