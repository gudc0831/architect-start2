import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import type { FileRecord, TaskRecord } from "@/domains/task/types";
import type {
  CreateTaskInput,
  FileRepository,
  TaskRepository,
  UpdateTaskInput,
} from "@/repositories/contracts";
import { getFirebaseClientApp } from "@/lib/firebase/client";

const app = getFirebaseClientApp();
const db = app ? getFirestore(app) : null;
const taskCollectionName = "tasks";
const fileCollectionName = "files";
const sequenceDocName = "task-sequence";

type FirestoreValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Date
  | { toDate?: () => Date; seconds?: number; nanoseconds?: number };

const toIsoString = (value: FirestoreValue) => {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }

  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000).toISOString();
  }

  return String(value);
};

const sortByDueDate = (items: TaskRecord[]) =>
  [...items].sort((left, right) => left.dueDate.localeCompare(right.dueDate));

const sortByDeletedAt = <T extends { deletedAt: string | null }>(items: T[]) =>
  [...items].sort((left, right) => (right.deletedAt ?? "").localeCompare(left.deletedAt ?? ""));

const toTaskRecord = (id: string, data: Record<string, unknown>): TaskRecord => ({
  id,
  taskNumber: String(data.taskNumber ?? ""),
  dueDate: String(data.dueDate ?? ""),
  category: String(data.category ?? ""),
  requester: String(data.requester ?? ""),
  assignee: String(data.assignee ?? ""),
  title: String(data.title ?? ""),
  createdAt: toIsoString(data.createdAt as FirestoreValue),
  isDaily: Boolean(data.isDaily),
  description: String(data.description ?? ""),
  status: String(data.status ?? "todo") as TaskRecord["status"],
  progressNote: String(data.progressNote ?? ""),
  conclusion: String(data.conclusion ?? ""),
  deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
});

const toFileRecord = (id: string, data: Record<string, unknown>): FileRecord => ({
  id,
  taskId: String(data.taskId ?? ""),
  originalName: String(data.originalName ?? ""),
  storedName: String(data.storedName ?? ""),
  storedPath: String(data.storedPath ?? ""),
  createdAt: toIsoString(data.createdAt as FirestoreValue),
  deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
});

async function nextTaskNumber() {
  if (!db) {
    throw new Error("Firestore is not configured");
  }

  const sequenceRef = doc(db, "meta", sequenceDocName);
  const snapshot = await getDoc(sequenceRef);
  const current = snapshot.exists() ? Number(snapshot.data().value ?? 700) : 700;
  const next = current + 1;

  await setDoc(sequenceRef, { value: next }, { merge: true });

  return `MIL-${current}`;
}

class FirestoreTaskRepository implements TaskRepository {
  async listActiveTasks() {
    if (!db) {
      return [];
    }

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs
      .map((entry) => toTaskRecord(entry.id, entry.data()))
      .filter((task) => !task.deletedAt);

    return sortByDueDate(items);
  }

  async listTrashTasks() {
    if (!db) {
      return [];
    }

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs
      .map((entry) => toTaskRecord(entry.id, entry.data()))
      .filter((task) => Boolean(task.deletedAt));

    return sortByDeletedAt(items);
  }

  async createTask(input: CreateTaskInput) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const record = {
      taskNumber: await nextTaskNumber(),
      dueDate: input.dueDate,
      category: input.category,
      requester: input.requester,
      assignee: input.assignee,
      title: input.title,
      createdAt: new Date().toISOString(),
      isDaily: input.isDaily,
      description: input.description,
      status: "todo",
      progressNote: "",
      conclusion: "",
      deletedAt: null,
    };

    const ref = await addDoc(collection(db, taskCollectionName), record);
    return toTaskRecord(ref.id, record);
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const targetRef = doc(db, taskCollectionName, taskId);
    await updateDoc(targetRef, input as Record<string, unknown>);
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
    if (!db) {
      return [];
    }

    const snapshot = await getDocs(collection(db, fileCollectionName));
    return snapshot.docs
      .map((entry) => toFileRecord(entry.id, entry.data()))
      .filter((file) => !file.deletedAt && (!taskId || file.taskId === taskId));
  }

  async listTrashFiles(taskId?: string) {
    if (!db) {
      return [];
    }

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const items = snapshot.docs
      .map((entry) => toFileRecord(entry.id, entry.data()))
      .filter((file) => Boolean(file.deletedAt) && (!taskId || file.taskId === taskId));

    return sortByDeletedAt(items);
  }

  async attachFile(input: {
    taskId: string;
    originalName: string;
    storedName: string;
    storedPath: string;
  }) {
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const record = {
      taskId: input.taskId,
      originalName: input.originalName,
      storedName: input.storedName,
      storedPath: input.storedPath,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };

    const ref = await addDoc(collection(db, fileCollectionName), record);
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
    if (!db) {
      return;
    }

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId);

    await Promise.all(
      targets.map((entry) =>
        updateDoc(doc(db, fileCollectionName, entry.id), {
          deletedAt: new Date().toISOString(),
        }),
      ),
    );
  }

  async restoreFilesByTask(taskId: string) {
    if (!db) {
      return;
    }

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId);

    await Promise.all(
      targets.map((entry) =>
        updateDoc(doc(db, fileCollectionName, entry.id), {
          deletedAt: null,
        }),
      ),
    );
  }
}

export const firestoreTaskRepository = new FirestoreTaskRepository();
export const firestoreFileRepository = new FirestoreFileRepository();