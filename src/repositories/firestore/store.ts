import { collection, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc } from "firebase/firestore";
import { randomUUID } from "node:crypto";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import type { CreateTaskInput, FileRepository, TaskRepository, UpdateTaskInput } from "@/repositories/contracts";
import { getFirebaseClientApp } from "@/lib/firebase/client";

const app = getFirebaseClientApp();
const db = app ? getFirestore(app) : null;
const taskCollectionName = "tasks";
const fileCollectionName = "files";
const sequenceDocName = "task-sequence";
const validStatus = new Set<TaskStatus>(["waiting", "todo", "in_progress", "blocked", "done"]);

type FirestoreValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | { toDate?: () => Date; seconds?: number; nanoseconds?: number };

const toIsoString = (value: FirestoreValue) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "object" && typeof value.seconds === "number") return new Date(value.seconds * 1000).toISOString();
  return String(value);
};

const sortByDeletedAt = <T extends { deletedAt: string | null }>(items: T[]) => [...items].sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));
const normalizeStoredDate = (value?: string | null) => (value ? value.slice(0, 10) : new Date().toISOString().slice(0, 10));

function latestFiles(items: FileRecord[]) {
  const latestByGroup = new Map<string, FileRecord>();

  items.forEach((file) => {
    const current = latestByGroup.get(file.fileGroupId);
    if (!current || file.versionNumber > current.versionNumber) {
      latestByGroup.set(file.fileGroupId, file);
    }
  });

  return [...latestByGroup.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

const toTaskRecord = (id: string, data: Record<string, unknown>): TaskRecord => ({
  id,
  taskNumber: normalizeTaskNumber(String(data.taskNumber ?? ""), id),
  parentTaskId: typeof data.parentTaskId === "string" && data.parentTaskId ? String(data.parentTaskId) : null,
  rootTaskId: String(data.rootTaskId ?? id),
  depth: Number(data.depth ?? 0),
  siblingOrder: Number(data.siblingOrder ?? 0),
  dueDate: String(data.dueDate ?? ""),
  category: String(data.category ?? ""),
  requester: String(data.requester ?? ""),
  assignee: String(data.assignee ?? ""),
  title: String(data.title ?? ""),
  createdAt: normalizeStoredDate(toIsoString(data.createdAt as FirestoreValue)),
  isDaily: Boolean(data.isDaily),
  description: String(data.description ?? ""),
  status: validStatus.has(String(data.status ?? "waiting") as TaskStatus) ? (String(data.status ?? "waiting") as TaskStatus) : "waiting",
  progressNote: String(data.progressNote ?? ""),
  conclusion: String(data.conclusion ?? ""),
  fileMemo: String(data.fileMemo ?? ""),
  deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
});

const toFileRecord = (id: string, data: Record<string, unknown>): FileRecord => {
  const versionNumber = Number(data.versionNumber ?? 1);

  return {
    id,
    taskId: String(data.taskId ?? ""),
    fileGroupId: String(data.fileGroupId ?? id),
    originalName: String(data.originalName ?? ""),
    storedName: String(data.storedName ?? ""),
    storedPath: String(data.storedPath ?? ""),
    versionNumber,
    versionLabel: String(data.versionLabel ?? `v${versionNumber}`),
    createdAt: toIsoString(data.createdAt as FirestoreValue),
    deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
  };
};

async function nextTaskNumber() {
  if (!db) {
    throw new Error("Firestore is not configured");
  }

  const [sequenceSnapshot, taskSnapshot] = await Promise.all([
    getDoc(doc(db, "meta", sequenceDocName)),
    getDocs(collection(db, taskCollectionName)),
  ]);

  const maxExisting = taskSnapshot.docs.reduce((max, entry) => {
    const value = parseTaskNumber(String(entry.data().taskNumber ?? ""));
    return value ? Math.max(max, value) : max;
  }, 0);
  const storedCurrent = sequenceSnapshot.exists() ? Number(sequenceSnapshot.data().value ?? 1) : 1;
  const nextValue = Math.max(storedCurrent, maxExisting + 1);

  await setDoc(doc(db, "meta", sequenceDocName), { value: nextValue + 1 }, { merge: true });
  return `#${nextValue}`;
}

class FirestoreTaskRepository implements TaskRepository {
  async listActiveTasks() {
    if (!db) return [];

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs.map((entry) => toTaskRecord(entry.id, entry.data())).filter((task) => !task.deletedAt);
    await normalizeStoredTasks(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), items);
    return items;
  }

  async listTrashTasks() {
    if (!db) return [];

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs.map((entry) => toTaskRecord(entry.id, entry.data())).filter((task) => Boolean(task.deletedAt));
    await normalizeStoredTasks(snapshot.docs.map((entry) => ({ id: entry.id, data: entry.data() })), items);
    return sortByDeletedAt(items);
  }

  async createTask(input: CreateTaskInput) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const ref = doc(collection(db, taskCollectionName));
    const record = {
      taskNumber: await nextTaskNumber(),
      parentTaskId: input.parentTaskId ?? null,
      rootTaskId: input.rootTaskId?.trim() || ref.id,
      depth: input.depth ?? 0,
      siblingOrder: input.siblingOrder ?? 0,
      dueDate: input.dueDate,
      category: input.category,
      requester: input.requester,
      assignee: input.assignee,
      title: input.title,
      createdAt: normalizeStoredDate(input.createdAt),
      isDaily: input.isDaily,
      description: input.description,
      status: "waiting",
      progressNote: "",
      conclusion: "",
      fileMemo: input.fileMemo ?? "",
      deletedAt: null,
    };

    await setDoc(ref, record);
    return toTaskRecord(ref.id, record);
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const { parentTaskNumber: _parentTaskNumber, ...persistedInput } = input;
    const targetRef = doc(db, taskCollectionName, taskId);
    await updateDoc(targetRef, persistedInput as Record<string, unknown>);
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("Task not found");
    }

    return toTaskRecord(snapshot.id, snapshot.data());
  }

  async moveTaskToTrash(taskId: string) {
    return this.updateTask(taskId, { deletedAt: new Date().toISOString() });
  }

  async restoreTask(taskId: string) {
    return this.updateTask(taskId, { deletedAt: null });
  }
}

class FirestoreFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    if (!db) return [];

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const items = snapshot.docs.map((entry) => toFileRecord(entry.id, entry.data())).filter((file) => !file.deletedAt && (!taskId || file.taskId === taskId));
    return latestFiles(items);
  }

  async listTrashFiles(taskId?: string) {
    if (!db) return [];

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const items = snapshot.docs.map((entry) => toFileRecord(entry.id, entry.data())).filter((file) => Boolean(file.deletedAt) && (!taskId || file.taskId === taskId));
    return sortByDeletedAt(items);
  }

  async findFileById(fileId: string) {
    if (!db) return null;

    const snapshot = await getDoc(doc(db, fileCollectionName, fileId));
    if (!snapshot.exists()) return null;

    return toFileRecord(snapshot.id, snapshot.data());
  }

  async attachFile(input: { taskId: string; originalName: string; storedName: string; storedPath: string; fileGroupId?: string; versionNumber?: number }) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const versionNumber = input.versionNumber ?? 1;
    const record = {
      taskId: input.taskId,
      fileGroupId: input.fileGroupId ?? randomUUID(),
      originalName: input.originalName,
      storedName: input.storedName,
      storedPath: input.storedPath,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    const ref = doc(collection(db, fileCollectionName));
    await setDoc(ref, record);
    return toFileRecord(ref.id, record);
  }

  async moveFileToTrash(fileId: string) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const targetRef = doc(db, fileCollectionName, fileId);
    await updateDoc(targetRef, { deletedAt: new Date().toISOString() });
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("File not found");
    }

    return toFileRecord(snapshot.id, snapshot.data());
  }

  async restoreFile(fileId: string) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const targetRef = doc(db, fileCollectionName, fileId);
    await updateDoc(targetRef, { deletedAt: null });
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("File not found");
    }

    return toFileRecord(snapshot.id, snapshot.data());
  }

  async moveFilesToTrashByTask(taskId: string) {
    if (!db) return;

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId);

    await Promise.all(targets.map((entry) => updateDoc(doc(db, fileCollectionName, entry.id), { deletedAt: new Date().toISOString() })));
  }

  async restoreFilesByTask(taskId: string) {
    if (!db) return;

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId);

    await Promise.all(targets.map((entry) => updateDoc(doc(db, fileCollectionName, entry.id), { deletedAt: null })));
  }
}

async function normalizeStoredTasks(entries: Array<{ id: string; data: Record<string, unknown> }>, tasks: TaskRecord[]) {
  if (!db) return;

  await Promise.all(entries.map(async (entry) => {
    const task = tasks.find((item) => item.id === entry.id);
    if (!task) return;

    const next: Record<string, unknown> = {};
    if (String(entry.data.taskNumber ?? "") !== task.taskNumber) next.taskNumber = task.taskNumber;
    if (String(entry.data.rootTaskId ?? entry.id) !== task.rootTaskId) next.rootTaskId = task.rootTaskId;
    if (Number(entry.data.depth ?? 0) !== task.depth) next.depth = task.depth;
    if (Number(entry.data.siblingOrder ?? 0) !== task.siblingOrder) next.siblingOrder = task.siblingOrder;
    if ((typeof entry.data.parentTaskId === "string" && entry.data.parentTaskId ? String(entry.data.parentTaskId) : null) !== task.parentTaskId) next.parentTaskId = task.parentTaskId;
    if (!validStatus.has(String(entry.data.status ?? "waiting") as TaskStatus)) next.status = task.status;
    if (normalizeStoredDate(toIsoString(entry.data.createdAt as FirestoreValue)) !== task.createdAt) next.createdAt = task.createdAt;
    if (String(entry.data.fileMemo ?? "") !== task.fileMemo) next.fileMemo = task.fileMemo;

    if (Object.keys(next).length > 0) {
      await updateDoc(doc(db, taskCollectionName, entry.id), next);
    }
  }));
}

function normalizeTaskNumber(taskNumber: string, taskId: string) {
  const parsed = parseTaskNumber(taskNumber);
  if (parsed) return `#${parsed}`;
  return `#${fallbackNumericId(taskId)}`;
}

function parseTaskNumber(taskNumber: string) {
  const match = /^#(\d+)$/.exec(taskNumber) ?? /^MIL-(\d+)$/.exec(taskNumber);
  return match ? Number(match[1]) : null;
}

function fallbackNumericId(taskId: string) {
  const digits = taskId.replace(/\D+/g, "");
  return digits ? Number(digits.slice(-6)) : 1;
}

export const firestoreTaskRepository = new FirestoreTaskRepository();
export const firestoreFileRepository = new FirestoreFileRepository();