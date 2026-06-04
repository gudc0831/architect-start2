"use client";

import type { TaskRecord } from "@/domains/task/types";
import type { DashboardSystemMode } from "@/lib/workspace/bootstrap-types";

export type DashboardSnapshotScope = "active";

export type DashboardTaskSnapshot = {
  cacheKey: string;
  version: 1;
  projectId: string;
  scope: DashboardSnapshotScope;
  savedAt: string;
  payloadSize: number;
  tasks: TaskRecord[];
  systemMode: DashboardSystemMode | null;
};

const DB_NAME = "architect-start.dashboard-snapshots";
const DB_VERSION = 1;
const STORE_NAME = "task-snapshots";
const projectIdStorageKey = "architect-start.project-id";
export const DASHBOARD_SNAPSHOT_PAYLOAD_SIZE_LIMIT_BYTES = 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

export function readLastDashboardSnapshotProjectId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(projectIdStorageKey)?.trim() || null;
}

export async function readDashboardTaskSnapshot(projectId: string, scope: DashboardSnapshotScope) {
  if (!canUseIndexedDb()) {
    return null;
  }

  const db = await openDashboardSnapshotDb();
  const snapshot = await runStoreRequest<DashboardTaskSnapshot | undefined>(db, "readonly", (store) =>
    store.get(buildDashboardSnapshotCacheKey(projectId, scope)),
  );

  return snapshot ?? null;
}

export async function writeDashboardTaskSnapshot(input: {
  projectId: string;
  scope: DashboardSnapshotScope;
  tasks: TaskRecord[];
  systemMode: DashboardSystemMode | null;
}) {
  if (!canUseIndexedDb() || input.tasks.length === 0) {
    return false;
  }

  const snapshot: DashboardTaskSnapshot = {
    cacheKey: buildDashboardSnapshotCacheKey(input.projectId, input.scope),
    version: 1,
    projectId: input.projectId,
    scope: input.scope,
    savedAt: new Date().toISOString(),
    payloadSize: 0,
    tasks: input.tasks,
    systemMode: input.systemMode,
  };
  const payloadSize = getJsonByteLength(snapshot);
  if (payloadSize > DASHBOARD_SNAPSHOT_PAYLOAD_SIZE_LIMIT_BYTES) {
    return false;
  }

  const db = await openDashboardSnapshotDb();
  await runStoreRequest(db, "readwrite", (store) => store.put({ ...snapshot, payloadSize }));
  return true;
}

function buildDashboardSnapshotCacheKey(projectId: string, scope: DashboardSnapshotScope) {
  return `${projectId}:${scope}`;
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDashboardSnapshotDb() {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error("IndexedDB is not available"));
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction?.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "cacheKey" });

      if (!store) {
        return;
      }

      if (!store.indexNames.contains("projectId")) {
        store.createIndex("projectId", "projectId", { unique: false });
      }
      if (!store.indexNames.contains("savedAt")) {
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });

  return dbPromise;
}

function runStoreRequest<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
) {
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = requestFactory(store);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function getJsonByteLength(value: unknown) {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).byteLength;
  }
  return json.length;
}
