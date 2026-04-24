// @ts-nocheck
import { collection, doc, getDoc, getDocs, getFirestore, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { randomUUID } from "node:crypto";
import { buildProjectIssueId } from "@/domains/task/identifiers";
import {
  canonicalizeTaskStatusHistory,
  DEFAULT_TASK_STATUS,
  normalizeTaskStatus,
} from "@/domains/task/status";
import { compareTasksBySiblingOrder } from "@/domains/task/ordering";
import type { FileRecord, TaskRecord, TaskStatus } from "@/domains/task/types";
import type {
  CreateTaskInput,
  FileRepository,
  TaskOrderUpdateInput,
  TaskRepository,
  UpdateTaskInput,
  VersionedTaskUpdateInput,
} from "@/repositories/contracts";
import { getFirebaseClientApp } from "@/lib/firebase/client";
import { requireStoredTaskWorkTypeValue } from "@/lib/task-work-type-write";
import { conflict } from "@/lib/api/errors";

function getDb() {
  const app = getFirebaseClientApp();
  return app ? getFirestore(app) : null;
}
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

  for (const file of items) {
    const current = latestByGroup.get(file.fileGroupId);
    if (!current || file.versionNumber > current.versionNumber) {
      latestByGroup.set(file.fileGroupId, file);
    }
  }

  return [...latestByGroup.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function parseNumeric(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^#\d+$/.test(trimmed)) return Number(trimmed.slice(1));
    if (/^\d+$/.test(trimmed)) return Number(trimmed);
  }
  return null;
}

function normalizeStatus(status: unknown): TaskStatus {
  return normalizeTaskStatus(status, DEFAULT_TASK_STATUS);
}

const toTaskRecord = (id: string, data: Record<string, unknown>): TaskRecord => {
  const taskNumber = parseNumeric(data.taskNumber) ?? 1;
  const actionId = parseNumeric(data.actionId) ?? taskNumber;
  const status = normalizeStatus(data.status);
  const updatedAt = toIsoString(data.updatedAt as FirestoreValue) || new Date().toISOString();

  return {
    id,
    projectId: String(data.projectId ?? "firebase-project"),
    taskNumber,
    actionId,
    issueId: String(data.issueId ?? `#${actionId}`),
    parentTaskId: typeof data.parentTaskId === "string" && data.parentTaskId ? String(data.parentTaskId) : null,
    rootTaskId: String(data.rootTaskId ?? id),
    depth: Number(data.depth ?? 0),
    siblingOrder: Number(data.siblingOrder ?? 0),
    dueDate: String(data.dueDate ?? ""),
    workType: String(data.workType ?? data.category ?? ""),
    coordinationScope: String(data.coordinationScope ?? ""),
    ownerDiscipline: String(data.ownerDiscipline ?? ""),
    requestedBy: String(data.requestedBy ?? data.requester ?? ""),
    relatedDisciplines: String(data.relatedDisciplines ?? ""),
    assignee: String(data.assignee ?? ""),
    assigneeProfileId: typeof data.assigneeProfileId === "string" && data.assigneeProfileId ? String(data.assigneeProfileId) : null,
    issueTitle: String(data.issueTitle ?? data.title ?? ""),
    reviewedAt: String(data.reviewedAt ?? ""),
    createdAt: normalizeStoredDate(toIsoString(data.createdAt as FirestoreValue)),
    createdBy: typeof data.createdBy === "string" ? String(data.createdBy) : null,
    isDaily: Boolean(data.isDaily),
    locationRef: String(data.locationRef ?? ""),
    calendarLinked: Boolean(data.calendarLinked),
    issueDetailNote: String(data.issueDetailNote ?? data.description ?? ""),
    status,
    statusHistory: canonicalizeTaskStatusHistory(data.statusHistory, status, updatedAt),
    decision: String(data.decision ?? data.conclusion ?? ""),
    completedAt: data.completedAt ? toIsoString(data.completedAt as FirestoreValue) : status === "done" ? updatedAt : null,
    version: Number(data.version ?? 1),
    updatedAt,
    updatedBy: typeof data.updatedBy === "string" ? String(data.updatedBy) : null,
    deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
    purgedAt: data.purgedAt ? toIsoString(data.purgedAt as FirestoreValue) : null,
  };
};

const toFileRecord = (id: string, data: Record<string, unknown>): FileRecord => {
  const versionNumber = Number(data.versionNumber ?? data.version ?? 1);
  return {
    id,
    taskId: String(data.taskId ?? ""),
    projectId: String(data.projectId ?? "firebase-project"),
    fileGroupId: String(data.fileGroupId ?? id),
    originalName: String(data.originalName ?? ""),
    mimeType: data.mimeType ? String(data.mimeType) : null,
    sizeBytes: Number(data.sizeBytes ?? 0),
    storageBucket: String(data.storageBucket ?? "firebase-bucket"),
    objectPath: String(data.objectPath ?? data.storedPath ?? ""),
    version: Number(data.version ?? versionNumber),
    versionNumber,
    versionLabel: String(data.versionLabel ?? `v${versionNumber}`),
    createdAt: toIsoString(data.createdAt as FirestoreValue),
    updatedAt: toIsoString(data.updatedAt as FirestoreValue) || toIsoString(data.createdAt as FirestoreValue),
    uploadedBy: typeof data.uploadedBy === "string" ? String(data.uploadedBy) : null,
    deletedAt: data.deletedAt ? toIsoString(data.deletedAt as FirestoreValue) : null,
    purgedAt: data.purgedAt ? toIsoString(data.purgedAt as FirestoreValue) : null,
  };
};

function sequenceDocId(projectId: string) {
  return `${sequenceDocName}-${projectId}`;
}

async function nextTaskNumber(projectId: string) {
  const db = getDb();
  if (!db) {
    throw new Error("Firestore is not configured");
  }

  const [sequenceSnapshot, taskSnapshot] = await Promise.all([
    getDoc(doc(db, "meta", sequenceDocId(projectId))),
    getDocs(collection(db, taskCollectionName)),
  ]);

  const maxExisting = taskSnapshot.docs.reduce((max, entry) => {
    if (String(entry.data().projectId ?? "") !== projectId) {
      return max;
    }
    const value = parseNumeric(entry.data().taskNumber);
    return value ? Math.max(max, value) : max;
  }, 0);
  const storedCurrent = sequenceSnapshot.exists() ? Number(sequenceSnapshot.data().value ?? 1) : 1;
  const nextValue = maxExisting > 0 ? Math.max(storedCurrent, maxExisting + 1) : 1;

  await setDoc(doc(db, "meta", sequenceDocId(projectId)), { value: nextValue + 1 }, { merge: true });
  return nextValue;
}

class FirestoreTaskRepository implements TaskRepository {
  async listActiveTasks(projectId?: string) {
    const db = getDb();
    if (!db) return [];

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs
      .map((entry) => toTaskRecord(entry.id, entry.data()))
      .filter((task) => !task.deletedAt && !task.purgedAt && (!projectId || task.projectId === projectId));
    return items.sort(compareTasksBySiblingOrder);
  }

  async listTrashTasks(projectId?: string) {
    const db = getDb();
    if (!db) return [];

    const snapshot = await getDocs(collection(db, taskCollectionName));
    const items = snapshot.docs
      .map((entry) => toTaskRecord(entry.id, entry.data()))
      .filter((task) => Boolean(task.deletedAt) && !task.purgedAt && (!projectId || task.projectId === projectId));
    return sortByDeletedAt(items);
  }

  async findTaskById(taskId: string) {
    const db = getDb();
    if (!db) return null;
    const snapshot = await getDoc(doc(db, taskCollectionName, taskId));
    if (!snapshot.exists()) return null;
    const record = toTaskRecord(snapshot.id, snapshot.data());
    return record.purgedAt ? null : record;
  }

  async getNextTaskNumber(projectId: string) {
    return nextTaskNumber(projectId);
  }

  async createTask(input: CreateTaskInput) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const ref = doc(collection(db, taskCollectionName));
    const actionId = await nextTaskNumber(input.projectId);
    const timestamp = new Date().toISOString();
    const record = {
      projectId: input.projectId,
      taskNumber: actionId,
      actionId,
      issueId: buildProjectIssueId(input.projectName, actionId),
      parentTaskId: input.parentTaskId ?? null,
      rootTaskId: input.rootTaskId?.trim() || ref.id,
      depth: input.depth ?? 0,
      siblingOrder: input.siblingOrder ?? 0,
      dueDate: input.dueDate,
      workType: requireStoredTaskWorkTypeValue(input.workType),
      coordinationScope: input.coordinationScope,
      ownerDiscipline: input.ownerDiscipline,
      requestedBy: input.requestedBy,
      relatedDisciplines: input.relatedDisciplines,
      assignee: input.assignee,
      assigneeProfileId: input.assigneeProfileId ?? null,
      issueTitle: input.issueTitle,
      reviewedAt: input.reviewedAt ?? "",
      createdAt: normalizeStoredDate(input.createdAt),
      createdBy: input.createdBy ?? null,
      isDaily: input.isDaily,
      locationRef: input.locationRef,
      calendarLinked: input.calendarLinked,
      issueDetailNote: input.issueDetailNote,
      status: normalizeStatus(input.status),
      statusHistory: canonicalizeTaskStatusHistory(input.statusHistory, normalizeStatus(input.status), timestamp),
      decision: input.decision,
      completedAt: input.completedAt ?? null,
      version: 1,
      updatedAt: timestamp,
      updatedBy: input.updatedBy ?? input.createdBy ?? null,
      deletedAt: null,
      purgedAt: null,
    };

    await setDoc(ref, record);
    return toTaskRecord(ref.id, record);
  }

  async updateTask(taskId: string, input: UpdateTaskInput) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const rawInput = input as UpdateTaskInput & { expectedVersion?: number; version?: number };
    const { parentTaskNumber: _parentTaskNumber, expectedVersion: _expectedVersion, version: _version, ...persistedInput } = rawInput;
    const normalizedPersistedInput = {
      ...persistedInput,
      workType:
        persistedInput.workType === undefined ? undefined : requireStoredTaskWorkTypeValue(persistedInput.workType),
    };
    const targetRef = doc(db, taskCollectionName, taskId);
    const currentSnapshot = await getDoc(targetRef);

    if (!currentSnapshot.exists()) {
      throw new Error("Task not found");
    }

    const currentTask = toTaskRecord(currentSnapshot.id, currentSnapshot.data());
    const updatedAt = new Date().toISOString();
    const nextStatus = normalizeStatus(normalizedPersistedInput.status ?? currentTask.status);
    await updateDoc(targetRef, {
      ...normalizedPersistedInput,
      status: nextStatus,
      statusHistory: canonicalizeTaskStatusHistory(
        normalizedPersistedInput.statusHistory ?? currentTask.statusHistory,
        nextStatus,
        updatedAt,
      ),
      updatedAt,
      updatedBy: normalizedPersistedInput.updatedBy ?? currentTask.updatedBy,
      version: currentTask.version + 1,
      deletedAt: input.deletedAt === undefined ? undefined : input.deletedAt,
      purgedAt: input.purgedAt === undefined ? undefined : input.purgedAt,
    } as Record<string, unknown>);
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("Task not found");
    }

    return toTaskRecord(snapshot.id, snapshot.data());
  }

  async updateTaskWithVersion(taskId: string, input: VersionedTaskUpdateInput) {
    const current = await this.findTaskById(taskId);
    if (!current || current.version !== input.expectedVersion) {
      return null;
    }

    return this.updateTask(taskId, {
      ...input,
      version: undefined,
    });
  }

  async updateTaskOrders(inputs: ReadonlyArray<TaskOrderUpdateInput>) {
    if (inputs.length === 0) {
      return [];
    }

    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const snapshots = await Promise.all(inputs.map(async (input) => {
      const targetRef = doc(db, taskCollectionName, input.id);
      const currentSnapshot = await getDoc(targetRef);
      if (!currentSnapshot.exists()) {
        throw new Error("Task not found");
      }
      return { input, targetRef, currentSnapshot };
    }));

    const batch = writeBatch(db);
    const updatedAt = new Date().toISOString();

    for (const { input, targetRef, currentSnapshot } of snapshots) {
      if (Number.isInteger(input.expectedVersion) && Number(currentSnapshot.data().version ?? 1) !== input.expectedVersion) {
        throw conflict(
          "Task order changed before this reorder could be saved. Reload the latest data and try again.",
          "TASK_REORDER_CONFLICT",
        );
      }

      batch.update(targetRef, {
        siblingOrder: input.siblingOrder,
        updatedAt,
        updatedBy: input.updatedBy ?? currentSnapshot.data().updatedBy ?? null,
        version: Number(currentSnapshot.data().version ?? 1) + 1,
      } as Record<string, unknown>);
    }

    await batch.commit();

    const updatedTasks = await Promise.all(
      snapshots.map(async ({ targetRef }) => {
        const snapshot = await getDoc(targetRef);
        if (!snapshot.exists()) {
          throw new Error("Task not found");
        }
        return toTaskRecord(snapshot.id, snapshot.data());
      }),
    );

    return updatedTasks;
  }

  async syncProjectTaskIssueIds(projectId: string, projectName: string, updatedBy?: string | null) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const [activeTasks, trashTasks] = await Promise.all([this.listActiveTasks(projectId), this.listTrashTasks(projectId)]);
    const tasks = [...activeTasks, ...trashTasks];
    if (tasks.length === 0) {
      return 0;
    }

    const timestamp = new Date().toISOString();
    const chunkSize = 500;
    let updatedCount = 0;

    for (let index = 0; index < tasks.length; index += chunkSize) {
      const batch = writeBatch(db);
      const chunk = tasks.slice(index, index + chunkSize);
      let chunkUpdated = false;

      for (const task of chunk) {
        const nextIssueId = buildProjectIssueId(projectName, task.taskNumber || task.actionId || 1);
        if (task.issueId === nextIssueId) {
          continue;
        }

        batch.update(doc(db, taskCollectionName, task.id), {
          issueId: nextIssueId,
          updatedAt: timestamp,
          updatedBy: updatedBy ?? task.updatedBy ?? null,
          version: task.version + 1,
        } as Record<string, unknown>);
        updatedCount += 1;
        chunkUpdated = true;
      }

      if (chunkUpdated) {
        await batch.commit();
      }
    }

    return updatedCount;
  }

  async moveTaskToTrash(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: new Date().toISOString(), updatedBy: updatedBy ?? null });
  }

  async restoreTask(taskId: string, updatedBy?: string | null) {
    return this.updateTask(taskId, { deletedAt: null, updatedBy: updatedBy ?? null });
  }

  async deleteTask(taskId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    await updateDoc(doc(db, taskCollectionName, taskId), {
      purgedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

class FirestoreFileRepository implements FileRepository {
  async listActiveFiles(taskId?: string) {
    const db = getDb();
    if (!db) return [];

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const items = snapshot.docs
      .map((entry) => toFileRecord(entry.id, entry.data()))
      .filter((file) => !file.deletedAt && !file.purgedAt && (!taskId || file.taskId === taskId));
    return latestFiles(items);
  }

  async listTrashFiles(taskId?: string) {
    const db = getDb();
    if (!db) return [];

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const items = snapshot.docs
      .map((entry) => toFileRecord(entry.id, entry.data()))
      .filter((file) => Boolean(file.deletedAt) && !file.purgedAt && (!taskId || file.taskId === taskId));
    return sortByDeletedAt(items);
  }

  async findFileById(fileId: string) {
    const db = getDb();
    if (!db) return null;
    const snapshot = await getDoc(doc(db, fileCollectionName, fileId));
    if (!snapshot.exists()) return null;
    const record = toFileRecord(snapshot.id, snapshot.data());
    return record.purgedAt ? null : record;
  }

  async listFilesByTask(taskId: string) {
    const db = getDb();
    if (!db) return [];

    const snapshot = await getDocs(collection(db, fileCollectionName));
    return snapshot.docs
      .map((entry) => toFileRecord(entry.id, entry.data()))
      .filter((file) => file.taskId === taskId && !file.purgedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async attachFile(input: CreateFileInput) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const versionNumber = input.versionNumber ?? input.version ?? 1;
    const version = input.version ?? versionNumber;
    const fileGroupId = input.fileGroupId ?? randomUUID();
    const existingSnapshot = await getDocs(collection(db, fileCollectionName));
    const duplicate = existingSnapshot.docs.some((entry) => {
      const data = entry.data();
      return String(data.fileGroupId ?? "") === fileGroupId && Number(data.version ?? data.versionNumber ?? 1) === version;
    });
    if (duplicate) {
      throw conflict(
        "Another upload created this file version first. Reload the latest files and try again.",
        "FILE_VERSION_CONFLICT",
      );
    }

    const record = {
      taskId: input.taskId,
      projectId: input.projectId,
      fileGroupId,
      originalName: input.originalName,
      mimeType: input.mimeType ?? null,
      sizeBytes: input.sizeBytes,
      storageBucket: input.storageBucket,
      objectPath: input.objectPath,
      version,
      versionNumber,
      versionLabel: `v${versionNumber}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      uploadedBy: input.uploadedBy ?? null,
      deletedAt: null,
      purgedAt: null,
    };

    const ref = doc(collection(db, fileCollectionName));
    await setDoc(ref, record);
    return toFileRecord(ref.id, record);
  }

  async moveFileToTrash(fileId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const targetRef = doc(db, fileCollectionName, fileId);
    await updateDoc(targetRef, { deletedAt: new Date().toISOString(), purgedAt: null, updatedAt: new Date().toISOString() });
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("File not found");
    }

    return toFileRecord(snapshot.id, snapshot.data());
  }

  async restoreFile(fileId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    const targetRef = doc(db, fileCollectionName, fileId);
    await updateDoc(targetRef, { deletedAt: null, purgedAt: null, updatedAt: new Date().toISOString() });
    const snapshot = await getDoc(targetRef);

    if (!snapshot.exists()) {
      throw new Error("File not found");
    }

    return toFileRecord(snapshot.id, snapshot.data());
  }

  async deleteFile(fileId: string) {
    const db = getDb();
    if (!db) {
      throw new Error("Firestore is not configured");
    }

    await updateDoc(doc(db, fileCollectionName, fileId), { purgedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }

  async moveFilesToTrashByTask(taskId: string) {
    const db = getDb();
    if (!db) return;

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId && !entry.data().purgedAt);
    const deletedAt = new Date().toISOString();
    await Promise.all(targets.map((entry) => updateDoc(doc(db, fileCollectionName, entry.id), { deletedAt, updatedAt: deletedAt })));
  }

  async restoreFilesByTask(taskId: string) {
    const db = getDb();
    if (!db) return;

    const snapshot = await getDocs(collection(db, fileCollectionName));
    const targets = snapshot.docs.filter((entry) => entry.data().taskId === taskId && !entry.data().purgedAt);
    const updatedAt = new Date().toISOString();
    await Promise.all(targets.map((entry) => updateDoc(doc(db, fileCollectionName, entry.id), { deletedAt: null, updatedAt })));
  }
}

export const firestoreTaskRepository = new FirestoreTaskRepository();
export const firestoreFileRepository = new FirestoreFileRepository();
