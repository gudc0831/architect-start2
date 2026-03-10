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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
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
  | "createdAt"
  | "description"
  | "status"
  | "progressNote"
  | "conclusion"
  | "fileMemo";

type CreateSheetField =
  | "dueDate"
  | "category"
  | "requester"
  | "assignee"
  | "title"
  | "createdAt"
  | "description"
  | "fileMemo";

type SaveState = "idle" | "saving" | "error";

type DailyColumnKey =
  | "taskNumber"
  | "dueDate"
  | "category"
  | "requester"
  | "assignee"
  | "title"
  | "createdAt"
  | "isDaily"
  | "description"
  | "status"
  | "progressNote"
  | "conclusion"
  | "file";

const columnWidthStorageKey = "architect-start2.daily-column-widths";
const defaultColumnWidths: Record<DailyColumnKey, number> = {
  taskNumber: 82,
  dueDate: 92,
  category: 84,
  requester: 84,
  assignee: 84,
  title: 180,
  createdAt: 92,
  isDaily: 56,
  description: 190,
  status: 108,
  progressNote: 190,
  conclusion: 190,
  file: 150,
};
const minColumnWidths: Record<DailyColumnKey, number> = {
  taskNumber: 76,
  dueDate: 88,
  category: 72,
  requester: 72,
  assignee: 72,
  title: 140,
  createdAt: 88,
  isDaily: 48,
  description: 160,
  status: 92,
  progressNote: 160,
  conclusion: 160,
  file: 130,
};
const orderedColumnKeys: DailyColumnKey[] = [
  "taskNumber",
  "dueDate",
  "category",
  "requester",
  "assignee",
  "title",
  "createdAt",
  "isDaily",
  "description",
  "status",
  "progressNote",
  "conclusion",
  "file",
];
const resizableColumns = new Set<DailyColumnKey>([
  "taskNumber",
  "dueDate",
  "createdAt",
  "title",
  "description",
  "progressNote",
  "conclusion",
  "file",
]);
const statusOrder: TaskStatus[] = ["waiting", "todo", "in_progress", "blocked", "done"];
const statusLabel: Record<TaskStatus, string> = {
  waiting: "대기",
  todo: "할 일",
  in_progress: "진행 중",
  blocked: "보류",
  done: "완료",
};
const createFieldOrder: CreateSheetField[] = [
  "dueDate",
  "category",
  "requester",
  "assignee",
  "title",
  "createdAt",
  "description",
  "fileMemo",
];
const sheetFieldOrder: EditableSheetField[] = [
  "dueDate",
  "category",
  "requester",
  "assignee",
  "title",
  "createdAt",
  "description",
  "status",
  "progressNote",
  "conclusion",
  "fileMemo",
];

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
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [childForm, setChildForm] = useState<TaskFormState>(defaultForm);
  const [panelDraft, setPanelDraft] = useState<TaskRecord | null>(null);
  const [parentTaskNumberDraft, setParentTaskNumberDraft] = useState("");
  const [relationError, setRelationError] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<File | null>(null);
  const [pendingVersionUpload, setPendingVersionUpload] = useState<File | null>(null);
  const [versionTargetId, setVersionTargetId] = useState("");
  const [systemMode, setSystemMode] = useState<SystemMode | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [rowSaveStates, setRowSaveStates] = useState<Record<string, SaveState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [columnWidths, setColumnWidths] = useState<Record<DailyColumnKey, number>>(defaultColumnWidths);
  const saveVersionRef = useRef<Record<string, number>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const isTrashMode = mode === "trash";
  const scope = isTrashMode ? "trash" : "active";

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = window.localStorage.getItem(columnWidthStorageKey);
      if (!stored) return;
      const parsed = JSON.parse(stored) as Partial<Record<DailyColumnKey, number>>;
      setColumnWidths({ ...defaultColumnWidths, ...parsed });
    } catch {
      setColumnWidths(defaultColumnWidths);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(columnWidthStorageKey, JSON.stringify(columnWidths));
  }, [columnWidths]);

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
      if (focusTaskId && taskJson.data.some((task) => task.id === focusTaskId)) return focusTaskId;
      if (prev && taskJson.data.some((task) => task.id === prev)) return prev;
      return taskJson.data[0]?.id ?? null;
    });
  }, [focusTaskId, scope]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void fetch("/api/system/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((json: { data: SystemMode }) => setSystemMode(json.data))
      .catch(() => setSystemMode(null));
  }, []);

  const taskById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const childrenByParent = useMemo(
    () =>
      tasks.reduce<Map<string | null, TaskRecord[]>>((acc, task) => {
        const key = task.parentTaskId ?? null;
        const next = acc.get(key) ?? [];
        next.push(task);
        acc.set(key, next);
        return acc;
      }, new Map<string | null, TaskRecord[]>()),
    [tasks],
  );
  const childCountByTaskId = useMemo(
    () =>
      tasks.reduce<Map<string, number>>((acc, task) => {
        if (task.parentTaskId) acc.set(task.parentTaskId, (acc.get(task.parentTaskId) ?? 0) + 1);
        return acc;
      }, new Map<string, number>()),
    [tasks],
  );
  const selectedTask = useMemo(() => tasks.find((task) => task.id === selectedTaskId) ?? null, [selectedTaskId, tasks]);
  const selectedParentTask = useMemo(() => {
    const parentTaskId = selectedTask?.parentTaskId ?? null;
    return parentTaskId ? taskById.get(parentTaskId) ?? null : null;
  }, [selectedTask, taskById]);
  const filesByTaskId = useMemo(
    () =>
      files.reduce<Record<string, FileRecord[]>>((acc, file) => {
        if (!acc[file.taskId]) acc[file.taskId] = [];
        acc[file.taskId].push(file);
        return acc;
      }, {}),
    [files],
  );
  const selectedFiles = useMemo(() => (selectedTask ? filesByTaskId[selectedTask.id] ?? [] : []), [filesByTaskId, selectedTask]);

  useEffect(() => {
    if (!selectedTask) {
      setPanelDraft(null);
      setParentTaskNumberDraft("");
      return;
    }

    const saveState = rowSaveStates[selectedTask.id] ?? "idle";
    setPanelDraft((prev) => {
      if (prev?.id === selectedTask.id && saveState === "saving") return prev;
      return { ...selectedTask };
    });
    setParentTaskNumberDraft(selectedParentTask?.taskNumber ?? "");
  }, [rowSaveStates, selectedParentTask, selectedTask]);

  useEffect(() => {
    setChildForm(defaultForm());
    setRelationError(null);
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedFiles.length === 0) {
      setVersionTargetId("");
      return;
    }

    setVersionTargetId((prev) => (selectedFiles.some((file) => file.id === prev) ? prev : selectedFiles[0].id));
  }, [selectedFiles]);

  const directChildren = useMemo(
    () => (selectedTask ? sortTasksByNumber(childrenByParent.get(selectedTask.id) ?? []) : []),
    [childrenByParent, selectedTask],
  );
  const blockedByParent = useMemo(() => {
    if (!panelDraft || !selectedParentTask) return false;
    return selectedParentTask.status !== "done" && (panelDraft.status === "in_progress" || panelDraft.status === "done");
  }, [panelDraft, selectedParentTask]);
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

  function cellId(scopeKey: string, field: string) {
    return `sheet-${scopeKey}-${field}`;
  }

  function focusCell(scopeKey: string, field: string) {
    window.requestAnimationFrame(() => {
      const element = document.getElementById(cellId(scopeKey, field)) as HTMLElement | null;
      element?.focus();
    });
  }

  function registerFileInput(taskId: string) {
    return (element: HTMLInputElement | null) => {
      fileInputRefs.current[taskId] = element;
    };
  }

  function toggleExpandedRow(taskId: string) {
    setExpandedRows((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  }

  function applyTaskLocally(taskId: string, patch: Partial<TaskRecord>) {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    if (selectedTaskId === taskId) {
      setPanelDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    }
  }

  function currentDraftFor(task: TaskRecord) {
    if (task.id === selectedTaskId && panelDraft) {
      return panelDraft;
    }
    return task;
  }

  function updateTaskDraft(task: TaskRecord, patch: Partial<TaskRecord>) {
    const nextDraft = { ...currentDraftFor(task), ...patch };
    setSelectedTaskId(task.id);
    setPanelDraft(nextDraft);
    applyTaskLocally(task.id, patch);
    void persistTaskDraft(task.id, nextDraft);
  }

  async function persistTaskDraft(taskId: string, draft: TaskRecord) {
    const version = (saveVersionRef.current[taskId] ?? 0) + 1;
    saveVersionRef.current[taskId] = version;
    setRowSaveStates((prev) => ({ ...prev, [taskId]: "saving" }));
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(taskPayloadFromDraft(draft)),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "자동 저장에 실패했습니다."));
      }

      const json = (await response.json()) as { data: TaskRecord };
      if (saveVersionRef.current[taskId] !== version) return;

      setTasks((prev) => prev.map((task) => (task.id === taskId ? json.data : task)));
      if (selectedTaskId === taskId) {
        setPanelDraft(json.data);
      }
      setRowSaveStates((prev) => ({ ...prev, [taskId]: "idle" }));
    } catch (error) {
      if (saveVersionRef.current[taskId] !== version) return;
      const message = error instanceof Error ? error.message : "자동 저장에 실패했습니다.";
      setRowSaveStates((prev) => ({ ...prev, [taskId]: "error" }));
      setRowErrors((prev) => ({ ...prev, [taskId]: message }));
    }
  }

  async function createTaskFromForm(nextForm: TaskFormState, parentTaskNumber?: string) {
    if (!nextForm.title.trim()) {
      focusCell(parentTaskNumber ? "child-create" : "create", "title");
      return;
    }

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...nextForm, parentTaskNumber }),
    });

    if (!response.ok) {
      setRelationError(await readErrorMessage(response, "작업 생성에 실패했습니다."));
      return;
    }

    const json = (await response.json()) as { data: TaskRecord };
    if (parentTaskNumber) {
      setChildForm(defaultForm());
      focusCell("child-create", createFieldOrder[0]);
    } else {
      setForm(defaultForm());
      focusCell("create", createFieldOrder[0]);
    }
    await loadData();
    setSelectedTaskId(json.data.id);
  }

  async function applyParentTaskNumber() {
    if (!selectedTask || !panelDraft) return;
    setRelationError(null);

    const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...taskPayloadFromDraft(panelDraft),
        parentTaskNumber: normalizeParentTaskNumberInput(parentTaskNumberDraft),
      }),
    });

    if (!response.ok) {
      setRelationError(await readErrorMessage(response, "상위 작업 적용에 실패했습니다."));
      return;
    }

    await loadData();
    setSelectedTaskId(selectedTask.id);
  }

  async function detachToRoot() {
    if (!selectedTask || !panelDraft) return;
    setRelationError(null);

    const response = await fetch(`/api/tasks/${encodeURIComponent(selectedTask.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...taskPayloadFromDraft(panelDraft),
        parentTaskNumber: null,
      }),
    });

    if (!response.ok) {
      setRelationError(await readErrorMessage(response, "루트 분리에 실패했습니다."));
      return;
    }

    await loadData();
    setSelectedTaskId(selectedTask.id);
  }

  async function patchTask(taskId: string, payload: Partial<TaskRecord>) {
    const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "작업 수정에 실패했습니다."));
    }

    await loadData();
  }

  async function shiftTaskStatus(task: TaskRecord, direction: -1 | 1) {
    const currentIndex = statusOrder.indexOf(task.status);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= statusOrder.length) return;
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

  async function uploadFileForTask(taskId: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    body.append("taskId", taskId);

    await fetch("/api/upload", { method: "POST", body });
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

  function handleCreateFieldKeyDown(field: CreateSheetField, scopeKey: "create" | "child-create") {
    return async (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        await createTaskFromForm(scopeKey === "create" ? form : childForm, scopeKey === "child-create" && selectedTask ? selectedTask.taskNumber : undefined);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (scopeKey === "create") {
          setForm(defaultForm());
          focusCell("create", createFieldOrder[0]);
        } else {
          setChildForm(defaultForm());
          focusCell("child-create", createFieldOrder[0]);
        }
        return;
      }

      if (event.key !== "Enter") return;

      event.preventDefault();
      const index = createFieldOrder.indexOf(field);
      const nextField = createFieldOrder[index + 1];

      if (nextField) {
        focusCell(scopeKey, nextField);
        return;
      }

      await createTaskFromForm(scopeKey === "create" ? form : childForm, scopeKey === "child-create" && selectedTask ? selectedTask.taskNumber : undefined);
    };
  }

  function handleDraftFieldKeyDown(taskId: string, field: EditableSheetField) {
    return async (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const current = taskById.get(taskId);
        if (current) {
          await persistTaskDraft(taskId, currentDraftFor(current));
          focusCell(taskId, field);
        }
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

      if (event.key !== "Enter") return;

      event.preventDefault();
      const index = sheetFieldOrder.indexOf(field);
      const nextField = sheetFieldOrder[index + 1];
      if (nextField) {
        focusCell(taskId, nextField);
        return;
      }

      focusCell(taskId, sheetFieldOrder[0]);
    };
  }

  function beginResize(columnKey: DailyColumnKey) {
    return (event: ReactMouseEvent<HTMLSpanElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = columnWidths[columnKey];

      const handleMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startX;
        setColumnWidths((prev) => ({
          ...prev,
          [columnKey]: Math.max(minColumnWidths[columnKey], startWidth + delta),
        }));
      };

      const handleUp = () => {
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };

      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    };
  }

  function renderSheetHeader(label: string, columnKey: DailyColumnKey) {
    return (
      <th key={columnKey}>
        <div className="sheet-header-cell">
          <span>{label}</span>
          {resizableColumns.has(columnKey) ? (
            <span aria-hidden="true" className="sheet-resize-handle" onMouseDown={beginResize(columnKey)} />
          ) : null}
        </div>
      </th>
    );
  }

  function openInlineUpload(taskId: string) {
    fileInputRefs.current[taskId]?.click();
  }
  return (
    <section className={clsx("workspace", mode === "daily" && "workspace--daily")}>
      <header className="workspace__header">
        <div>
          <p className="workspace__eyebrow">{authUser.name}</p>
          <p className="workspace__project">{projectName || "새 프로젝트"}</p>
          <h2>{titleByMode(mode)}</h2>
          <p className="workspace__copy">같은 작업 데이터를 보드, 일별 시트, 월별 달력, 휴지통으로 확인합니다.</p>
          {systemMode ? (
            <>
              <p className="workspace__meta">데이터 모드 {systemMode.dataMode} / 업로드 경로 {systemMode.uploadRoot}</p>
              <p className="workspace__meta">
                프로젝트 메타 {systemMode.projectMetaPath} / 상태 {projectLoaded ? (isSyncing ? "동기화 중" : projectSource ?? "local") : "불러오는 중"}
              </p>
            </>
          ) : null}
        </div>
      </header>

      {mode === "daily" ? (
        <div className="keyboard-hints">
          <span>Enter 다음 칸</span>
          <span>Ctrl 또는 Command + S 현재 행 재요청</span>
          <span>위/아래 화살표 같은 열 이동</span>
          <span>Esc 선택 해제</span>
        </div>
      ) : null}

      <div className={clsx("workspace__body", mode !== "daily" && "workspace__body--single")}>
        <div className="workspace__main">
          {tasks.length === 0 && files.length === 0 ? (
            <div className="empty-state">
              <h3>아직 작업이 없습니다.</h3>
              <p>프로젝트명을 정하고 첫 작업을 입력해 전체 흐름을 확인하세요.</p>
            </div>
          ) : null}

          {mode === "board" ? (
            <div className="board-layout">
              <section className="board-summary">
                <article className="board-summary__card">
                  <span className="board-summary__label">전체</span>
                  <strong>{boardSummary.total}</strong>
                </article>
                <article className="board-summary__card">
                  <span className="board-summary__label">대기</span>
                  <strong>{boardSummary.byStatus.waiting}</strong>
                </article>
                <article className="board-summary__card">
                  <span className="board-summary__label">할 일</span>
                  <strong>{boardSummary.byStatus.todo}</strong>
                </article>
                <article className="board-summary__card">
                  <span className="board-summary__label">진행 중</span>
                  <strong>{boardSummary.byStatus.in_progress}</strong>
                </article>
                <article className="board-summary__card board-summary__card--warn">
                  <span className="board-summary__label">지연</span>
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
                      {group.items.length === 0 ? <div className="board-column__empty">이 상태의 작업이 없습니다.</div> : null}
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
              <table className="sheet-table">
                <colgroup>
                  {orderedColumnKeys.map((columnKey) => (
                    <col key={columnKey} style={{ width: `${columnWidths[columnKey]}px` }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {renderSheetHeader("작업번호", "taskNumber")}
                    {renderSheetHeader("기한일", "dueDate")}
                    {renderSheetHeader("분류", "category")}
                    {renderSheetHeader("요청자", "requester")}
                    {renderSheetHeader("담당자", "assignee")}
                    {renderSheetHeader("항목", "title")}
                    {renderSheetHeader("등록일", "createdAt")}
                    {renderSheetHeader("일일", "isDaily")}
                    {renderSheetHeader("설명", "description")}
                    {renderSheetHeader("상태", "status")}
                    {renderSheetHeader("진행사항", "progressNote")}
                    {renderSheetHeader("결론", "conclusion")}
                    {renderSheetHeader("파일", "file")}
                  </tr>
                </thead>
                <tbody>
                  <tr className="sheet-create-row">
                    <td>자동</td>
                    <td><input className="sheet-input" id={cellId("create", "dueDate")} onChange={(event) => updateForm("dueDate", event.target.value)} onKeyDown={handleCreateFieldKeyDown("dueDate", "create")} type="date" value={form.dueDate} /></td>
                    <td><input className="sheet-input" id={cellId("create", "category")} onChange={(event) => updateForm("category", event.target.value)} onKeyDown={handleCreateFieldKeyDown("category", "create")} placeholder="분류" value={form.category} /></td>
                    <td><input className="sheet-input" id={cellId("create", "requester")} onChange={(event) => updateForm("requester", event.target.value)} onKeyDown={handleCreateFieldKeyDown("requester", "create")} placeholder="요청자" value={form.requester} /></td>
                    <td><input className="sheet-input" id={cellId("create", "assignee")} onChange={(event) => updateForm("assignee", event.target.value)} onKeyDown={handleCreateFieldKeyDown("assignee", "create")} placeholder="담당자" value={form.assignee} /></td>
                    <td><input className="sheet-input" id={cellId("create", "title")} onChange={(event) => updateForm("title", event.target.value)} onKeyDown={handleCreateFieldKeyDown("title", "create")} placeholder="항목" value={form.title} /></td>
                    <td><input className="sheet-input" id={cellId("create", "createdAt")} onChange={(event) => updateForm("createdAt", event.target.value)} onKeyDown={handleCreateFieldKeyDown("createdAt", "create")} type="date" value={form.createdAt} /></td>
                    <td><input checked={form.isDaily} onChange={(event) => updateForm("isDaily", event.target.checked)} type="checkbox" /></td>
                    <td><textarea className="sheet-textarea sheet-textarea--single" id={cellId("create", "description")} onChange={(event) => updateForm("description", event.target.value)} onKeyDown={handleCreateFieldKeyDown("description", "create")} placeholder="설명" rows={1} value={form.description} /></td>
                    <td><span className="status-pill status-pill--waiting">{statusLabel.waiting}</span></td>
                    <td />
                    <td />
                    <td>
                      <div className="sheet-file-cell">
                        <span className="sheet-file-count sheet-file-count--muted">생성 후</span>
                        <input className="sheet-input sheet-file-memo" id={cellId("create", "fileMemo")} onChange={(event) => updateForm("fileMemo", event.target.value)} onKeyDown={handleCreateFieldKeyDown("fileMemo", "create")} placeholder="파일 메모" value={form.fileMemo} />
                      </div>
                    </td>
                  </tr>                  {tasks.map((task) => {
                    const isSelected = task.id === selectedTaskId;
                    const draft = currentDraftFor(task);
                    const isExpanded = Boolean(expandedRows[task.id]);
                    const taskFiles = filesByTaskId[task.id] ?? [];
                    const saveState = rowSaveStates[task.id] ?? "idle";
                    const rowError = rowErrors[task.id] ?? null;
                    const parentNumber = task.parentTaskId ? taskById.get(task.parentTaskId)?.taskNumber ?? "" : "";
                    const childCount = childCountByTaskId.get(task.id) ?? 0;
                    const rowClassName = clsx(
                      isSelected && "sheet-row--active",
                      task.depth === 0 ? "sheet-row--root" : "sheet-row--child",
                      isExpanded && "sheet-row--expanded",
                      saveState === "saving" && "sheet-row--saving",
                      saveState === "error" && "sheet-row--error",
                    );

                    return (
                      <tr className={rowClassName} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          <div className="sheet-task-number" style={{ ["--depth-indent" as string]: `${task.depth * 20}px` }}>
                            <div className="sheet-task-number__label">
                              <strong>{formatTaskNumber(task.taskNumber)}</strong>
                            </div>
                            <div className="sheet-task-meta">
                              {parentNumber ? <span className="sheet-parent-note">상위 {formatTaskNumber(parentNumber)}</span> : null}
                              {childCount > 0 ? <span className="sheet-children-note">하위 {childCount}개</span> : null}
                            </div>
                          </div>
                        </td>
                        <td>{isSelected ? <input className="sheet-input" id={cellId(task.id, "dueDate")} onChange={(event) => updateTaskDraft(task, { dueDate: event.target.value })} onDoubleClick={() => toggleExpandedRow(task.id)} onKeyDown={handleDraftFieldKeyDown(task.id, "dueDate")} type="date" value={draft.dueDate} /> : task.dueDate || "-"}</td>
                        <td>{isSelected ? <input className="sheet-input" id={cellId(task.id, "category")} onChange={(event) => updateTaskDraft(task, { category: event.target.value })} onDoubleClick={() => toggleExpandedRow(task.id)} onKeyDown={handleDraftFieldKeyDown(task.id, "category")} value={draft.category} /> : task.category || "-"}</td>
                        <td>{isSelected ? <input className="sheet-input" id={cellId(task.id, "requester")} onChange={(event) => updateTaskDraft(task, { requester: event.target.value })} onDoubleClick={() => toggleExpandedRow(task.id)} onKeyDown={handleDraftFieldKeyDown(task.id, "requester")} value={draft.requester} /> : task.requester || "-"}</td>
                        <td>{isSelected ? <input className="sheet-input" id={cellId(task.id, "assignee")} onChange={(event) => updateTaskDraft(task, { assignee: event.target.value })} onDoubleClick={() => toggleExpandedRow(task.id)} onKeyDown={handleDraftFieldKeyDown(task.id, "assignee")} value={draft.assignee} /> : task.assignee || "-"}</td>
                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          {isSelected ? (
                            <textarea className="sheet-textarea sheet-textarea--single" id={cellId(task.id, "title")} onChange={(event) => updateTaskDraft(task, { title: event.target.value })} onKeyDown={handleDraftFieldKeyDown(task.id, "title")} rows={isExpanded ? getTextRows(draft.title) : 1} value={draft.title} />
                          ) : (
                            <span className={clsx("sheet-cell__text", !isExpanded && "sheet-cell__text--clamp")}>{task.title}</span>
                          )}
                        </td>
                        <td>{isSelected ? <input className="sheet-input" id={cellId(task.id, "createdAt")} onChange={(event) => updateTaskDraft(task, { createdAt: event.target.value })} onDoubleClick={() => toggleExpandedRow(task.id)} onKeyDown={handleDraftFieldKeyDown(task.id, "createdAt")} type="date" value={draft.createdAt} /> : task.createdAt || "-"}</td>
                        <td>{isSelected ? <input checked={Boolean(draft.isDaily)} onChange={(event) => updateTaskDraft(task, { isDaily: event.target.checked })} type="checkbox" /> : task.isDaily ? "Y" : ""}</td>
                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          {isSelected ? (
                            <textarea className="sheet-textarea sheet-textarea--single" id={cellId(task.id, "description")} onChange={(event) => updateTaskDraft(task, { description: event.target.value })} onKeyDown={handleDraftFieldKeyDown(task.id, "description")} rows={isExpanded ? getTextRows(draft.description) : 1} value={draft.description} />
                          ) : (
                            <span className={clsx("sheet-cell__text", !isExpanded && "sheet-cell__text--clamp")}>{task.description || "-"}</span>
                          )}
                        </td>
                        <td>{isSelected ? <select className="sheet-select" id={cellId(task.id, "status")} onChange={(event) => updateTaskDraft(task, { status: event.target.value as TaskStatus })} onKeyDown={handleDraftFieldKeyDown(task.id, "status")} value={draft.status}>{statusOrder.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select> : <span className={clsx("status-pill", `status-pill--${task.status}`)}>{statusLabel[task.status]}</span>}</td>                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          {isSelected ? (
                            <textarea className="sheet-textarea sheet-textarea--single" id={cellId(task.id, "progressNote")} onChange={(event) => updateTaskDraft(task, { progressNote: event.target.value })} onKeyDown={handleDraftFieldKeyDown(task.id, "progressNote")} rows={isExpanded ? getTextRows(draft.progressNote) : 1} value={draft.progressNote} />
                          ) : (
                            <span className={clsx("sheet-cell__text", !isExpanded && "sheet-cell__text--clamp")}>{task.progressNote || "-"}</span>
                          )}
                        </td>
                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          {isSelected ? (
                            <textarea className="sheet-textarea sheet-textarea--single" id={cellId(task.id, "conclusion")} onChange={(event) => updateTaskDraft(task, { conclusion: event.target.value })} onKeyDown={handleDraftFieldKeyDown(task.id, "conclusion")} rows={isExpanded ? getTextRows(draft.conclusion) : 1} value={draft.conclusion} />
                          ) : (
                            <span className={clsx("sheet-cell__text", !isExpanded && "sheet-cell__text--clamp")}>{task.conclusion || "-"}</span>
                          )}
                        </td>
                        <td onDoubleClick={() => { setSelectedTaskId(task.id); toggleExpandedRow(task.id); }}>
                          <div className="sheet-file-cell">
                            {isSelected ? (
                              <>
                                <button className="sheet-inline-upload" onClick={() => openInlineUpload(task.id)} type="button">+</button>
                                <input className="sheet-input sheet-file-memo" id={cellId(task.id, "fileMemo")} onChange={(event) => updateTaskDraft(task, { fileMemo: event.target.value })} onKeyDown={handleDraftFieldKeyDown(task.id, "fileMemo")} placeholder="파일 메모" value={draft.fileMemo} />
                                <span className="sheet-file-count">{taskFiles.length}</span>
                                {saveState !== "idle" ? <span className={clsx("sheet-save-state", saveState === "error" && "sheet-save-state--error")}>{saveState === "saving" ? "저장 중" : "오류"}</span> : null}
                              </>
                            ) : (
                              <>
                                <span className="sheet-file-count">{taskFiles.length}</span>
                                <span className={clsx("sheet-cell__text", !isExpanded && "sheet-cell__text--clamp")}>{task.fileMemo || "-"}</span>
                              </>
                            )}
                            <input hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFileForTask(task.id, file); event.currentTarget.value = ""; }} ref={registerFileInput(task.id)} type="file" />
                          </div>
                          {rowError ? <p className="sheet-inline-error">{rowError}</p> : null}
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
                  <article className={clsx("calendar-cell", !isSameMonth(day, calendarBaseDate) && "calendar-cell--muted", isToday(day) && "calendar-cell--today")} key={dayKey}>
                    <header>
                      <span>{format(day, "d")}</span>
                      <small>{formatDay(day)}</small>
                    </header>
                    <div className="calendar-cell__items">
                      {dayTasks.map((task) => <Link className="calendar-link" href={`/daily?taskId=${task.id}`} key={task.id}>{formatTaskNumber(task.taskNumber)} {task.title}</Link>)}
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
                  {tasks.map((task) => <article className="trash-card" key={task.id}><div><strong>{formatTaskNumber(task.taskNumber)}</strong><p>{task.title}</p><small>삭제일 {task.deletedAt?.slice(0, 10) || "-"}</small></div><button className="primary-button" onClick={() => void restoreTask(task.id)} type="button">복구</button></article>)}
                </div>
              </section>

              <section className="trash-section">
                <header className="trash-section__header"><h3>삭제된 파일</h3><span>{files.length}</span></header>
                <div className="trash-list">
                  {files.length === 0 ? <div className="board-column__empty">삭제된 파일이 없습니다.</div> : null}
                  {files.map((file) => <article className="trash-card" key={file.id}><div><strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong><p>{file.storedPath}</p><small>삭제일 {file.deletedAt?.slice(0, 10) || "-"}</small></div><button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">복구</button></article>)}
                </div>
              </section>
            </div>
          ) : null}
        </div>        {mode === "daily" ? (
          <aside className="detail-panel">
            <header className="detail-panel__header">
              <div>
                <p className="workspace__eyebrow">상세 패널</p>
                <h3>{selectedTask ? formatTaskNumber(selectedTask.taskNumber) : "선택된 작업 없음"}</h3>
              </div>
              {selectedTask && !isTrashMode ? <button className="danger-button" onClick={() => void moveToTrash(selectedTask.id)} type="button">휴지통 이동</button> : null}
            </header>

            {panelDraft ? (
              <div className="detail-panel__body">
                <div className="status-rail">
                  {statusOrder.map((status) => <button className={clsx("status-pill", `status-pill--${status}`, panelDraft.status === status && "status-pill--selected")} key={status} onClick={() => updateTaskDraft(panelDraft, { status })} type="button">{statusLabel[status]}</button>)}
                </div>

                {blockedByParent ? <p className="detail-panel__warning">상위 작업이 완료되지 않았습니다. 진행 또는 완료 상태는 확인이 필요합니다.</p> : null}
                {rowErrors[panelDraft.id] ? <p className="detail-panel__warning detail-panel__warning--error">{rowErrors[panelDraft.id]}</p> : null}
                {relationError ? <p className="detail-panel__warning detail-panel__warning--error">{relationError}</p> : null}

                <label><span>항목</span><input onChange={(event) => updateTaskDraft(panelDraft, { title: event.target.value })} value={panelDraft.title} /></label>
                <label><span>기한일</span><input onChange={(event) => updateTaskDraft(panelDraft, { dueDate: event.target.value })} type="date" value={panelDraft.dueDate} /></label>
                <label><span>등록일</span><input onChange={(event) => updateTaskDraft(panelDraft, { createdAt: event.target.value })} type="date" value={panelDraft.createdAt} /></label>
                <label><span>분류</span><input onChange={(event) => updateTaskDraft(panelDraft, { category: event.target.value })} value={panelDraft.category} /></label>
                <label><span>요청자</span><input onChange={(event) => updateTaskDraft(panelDraft, { requester: event.target.value })} value={panelDraft.requester} /></label>
                <label><span>담당자</span><input onChange={(event) => updateTaskDraft(panelDraft, { assignee: event.target.value })} value={panelDraft.assignee} /></label>
                <label><span>설명</span><textarea onChange={(event) => updateTaskDraft(panelDraft, { description: event.target.value })} rows={4} value={panelDraft.description} /></label>
                <label><span>진행사항</span><textarea onChange={(event) => updateTaskDraft(panelDraft, { progressNote: event.target.value })} rows={4} value={panelDraft.progressNote} /></label>
                <label><span>결론</span><textarea onChange={(event) => updateTaskDraft(panelDraft, { conclusion: event.target.value })} rows={4} value={panelDraft.conclusion} /></label>
                <label><span>파일 메모</span><textarea onChange={(event) => updateTaskDraft(panelDraft, { fileMemo: event.target.value })} rows={3} value={panelDraft.fileMemo} /></label>

                <section className="detail-section">
                  <div className="detail-section__header"><h4>상위/하위 작업</h4></div>
                  <label><span>상위 작업 번호</span><input onChange={(event) => setParentTaskNumberDraft(event.target.value)} placeholder="#12 또는 12" value={parentTaskNumberDraft} /></label>
                  <div className="detail-actions">
                    <button className="secondary-button" onClick={() => void applyParentTaskNumber()} type="button">상위 작업 적용</button>
                    <button className="secondary-button" onClick={() => void detachToRoot()} type="button">루트로 분리</button>
                  </div>
                  <div className="detail-tree-summary">
                    <p>현재 상위 작업: {selectedParentTask ? `${formatTaskNumber(selectedParentTask.taskNumber)} ${selectedParentTask.title}` : "없음"}</p>
                    <p>하위 작업 목록: {directChildren.length === 0 ? "없음" : ""}</p>
                    {directChildren.length > 0 ? <ul className="detail-tree-list">{directChildren.map((child) => <li key={child.id}>{formatTaskNumber(child.taskNumber)} {child.title}</li>)}</ul> : null}
                  </div>
                </section>

                {!isTrashMode ? (
                  <section className="detail-section">
                    <div className="detail-section__header"><h4>하위 작업 추가</h4></div>
                    <div className="detail-child-grid">
                      <input id={cellId("child-create", "title")} onChange={(event) => updateChildForm("title", event.target.value)} onKeyDown={handleCreateFieldKeyDown("title", "child-create")} placeholder="항목" value={childForm.title} />
                      <input id={cellId("child-create", "dueDate")} onChange={(event) => updateChildForm("dueDate", event.target.value)} onKeyDown={handleCreateFieldKeyDown("dueDate", "child-create")} type="date" value={childForm.dueDate} />
                      <input id={cellId("child-create", "createdAt")} onChange={(event) => updateChildForm("createdAt", event.target.value)} onKeyDown={handleCreateFieldKeyDown("createdAt", "child-create")} type="date" value={childForm.createdAt} />
                      <input id={cellId("child-create", "category")} onChange={(event) => updateChildForm("category", event.target.value)} onKeyDown={handleCreateFieldKeyDown("category", "child-create")} placeholder="분류" value={childForm.category} />
                      <input id={cellId("child-create", "requester")} onChange={(event) => updateChildForm("requester", event.target.value)} onKeyDown={handleCreateFieldKeyDown("requester", "child-create")} placeholder="요청자" value={childForm.requester} />
                      <input id={cellId("child-create", "assignee")} onChange={(event) => updateChildForm("assignee", event.target.value)} onKeyDown={handleCreateFieldKeyDown("assignee", "child-create")} placeholder="담당자" value={childForm.assignee} />
                      <textarea id={cellId("child-create", "description")} onChange={(event) => updateChildForm("description", event.target.value)} onKeyDown={handleCreateFieldKeyDown("description", "child-create")} placeholder="설명" rows={2} value={childForm.description} />
                      <input id={cellId("child-create", "fileMemo")} onChange={(event) => updateChildForm("fileMemo", event.target.value)} onKeyDown={handleCreateFieldKeyDown("fileMemo", "child-create")} placeholder="파일 메모" value={childForm.fileMemo} />
                    </div>
                    <button className="primary-button" onClick={() => void createTaskFromForm(childForm, selectedTask?.taskNumber)} type="button">하위 작업 추가</button>
                  </section>
                ) : null}
                {!isTrashMode ? (
                  <>
                    <div className="upload-box">
                      <input onChange={(event) => setPendingUpload(event.target.files?.[0] ?? null)} type="file" />
                      <button className="primary-button" onClick={() => void uploadSelectedFile()} type="button">파일 첨부</button>
                    </div>
                    {selectedFiles.length > 0 ? (
                      <div className="upload-box upload-box--version">
                        <select onChange={(event) => setVersionTargetId(event.target.value)} value={versionTargetId}>
                          {selectedFiles.map((file) => <option key={file.id} value={file.id}>{file.originalName} {file.versionLabel}</option>)}
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
                            <small>{file.storedPath}</small>
                          </div>
                          <div className="file-pill__actions">
                            <button className="secondary-button" onClick={() => void moveFileToTrash(file.id)} type="button">제거</button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="file-list">
                    {selectedFiles.length === 0 ? <p>연결된 삭제 파일이 없습니다.</p> : null}
                    {selectedFiles.map((file) => (
                      <article className="file-pill" key={file.id}>
                        <div>
                          <strong>{file.originalName} <span className="file-pill__version">{file.versionLabel}</span></strong>
                          <small>{file.storedPath}</small>
                        </div>
                        <div className="file-pill__actions">
                          <button className="primary-button" onClick={() => void restoreFile(file.id)} type="button">파일 복구</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="detail-panel__empty">작업을 선택하면 상세 정보와 파일을 관리할 수 있습니다.</div>
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
  if (status === "waiting") return "시작 전 검토가 필요한 작업";
  if (status === "todo") return "곧 시작할 작업";
  if (status === "in_progress") return "현재 진행 중인 작업";
  if (status === "blocked") return "검토 또는 외부 입력 대기";
  return "마무리된 작업";
}

function taskPayloadFromDraft(draft: Partial<TaskRecord>) {
  return {
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

function formatTaskNumber(taskNumber: string) {
  const legacyMatch = /^MIL-(\d+)$/.exec(taskNumber);
  if (legacyMatch) return `#${legacyMatch[1]}`;
  return taskNumber;
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

function getTextRows(value: string) {
  const lines = value.split(/\r?\n/).length;
  return Math.max(2, Math.min(8, lines + 1));
}

function sortTasksByNumber(tasks: TaskRecord[]) {
  return [...tasks].sort((left, right) => {
    const numberCompare = taskNumberValue(left.taskNumber) - taskNumberValue(right.taskNumber);
    if (numberCompare !== 0) return numberCompare;
    return left.createdAt.localeCompare(right.createdAt);
  });
}

function taskNumberValue(taskNumber: string) {
  const match = /^#(\d+)$/.exec(taskNumber) ?? /^MIL-(\d+)$/.exec(taskNumber);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}