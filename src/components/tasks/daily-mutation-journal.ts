"use client";

import type { TaskRecord } from "@/domains/task/types";

export type DailyMutationOperationType = "create" | "update" | "trash" | "delete" | "reorder";
export type DailyMutationStatus = "pending" | "syncing" | "synced" | "failed";
export type DailyMutationFailureKind =
  | "network_or_database"
  | "version_conflict"
  | "reorder_conflict"
  | "not_found_desired_state_check"
  | "auth_or_permission"
  | "fatal";

export type DailyMutationFlushErrorInfo = {
  status: number | null;
  code: string | null;
  isNetworkError: boolean;
};

export type DailyMutationFailureDecision = {
  kind: DailyMutationFailureKind;
  retryable: boolean;
};

export type DailyMutationScope = {
  projectId: string;
  profileId: string;
};

export type DailyMutationReorderCommand =
  | {
      action: "manual_move";
      movedTaskId: string;
      targetParentTaskId: string | null;
      targetIndex: number;
      expectedVersions?: Record<string, number>;
    }
  | {
      action: "auto_sort";
      strategy: "priority" | "action_id";
      expectedVersions?: Record<string, number>;
    }
  | {
      action: "set_sibling_order";
      parentTaskId: string | null;
      orderedTaskIds: readonly string[];
      expectedVersions?: Record<string, number>;
    };

export type DailyMutationPayload =
  | {
      kind: "create";
      tempTask: TaskRecord;
      requestPayload: Record<string, unknown>;
    }
  | {
      kind: "update";
      taskId: string;
      baseVersion: number;
      patch: Partial<TaskRecord>;
    }
  | {
      kind: "trash";
      taskId: string;
      affectedTasks: TaskRecord[];
    }
  | {
      kind: "delete";
      taskId: string;
      affectedTasks: TaskRecord[];
      affectedFileIds: string[];
    }
  | {
      kind: "reorder";
      command: DailyMutationReorderCommand;
      desiredTasks: TaskRecord[];
    };

export type DailyMutationOperation = {
  operationId: string;
  clientMutationId: string;
  type: DailyMutationOperationType;
  status: DailyMutationStatus;
  scopeKey: string;
  projectId: string;
  profileId: string;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  lastError: string | null;
  lastHttpStatus?: number | null;
  lastErrorCode?: string | null;
  failureKind?: DailyMutationFailureKind | null;
  lastAttemptedAt?: string | null;
  nextRetryAt: string | null;
  tempTaskId: string | null;
  serverTaskId: string | null;
  payloadSize: number;
  payload: DailyMutationPayload;
};

export type DailyMutationSummary = {
  pending: number;
  syncing: number;
  failed: number;
  synced: number;
  totalActive: number;
};

const DB_NAME = "architect-start.daily-mutations";
const DB_VERSION = 1;
const STORE_NAME = "operations";
export const DAILY_MUTATION_PAYLOAD_SIZE_LIMIT_BYTES = 256 * 1024;
export const DAILY_MUTATION_MAX_RETRY_COUNT = 6;
const REORDER_OPERATION_ID_PREFIX = "daily-reorder:";

type StoredOperation = DailyMutationOperation & {
  statusScopeKey: string;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export function buildDailyMutationScopeKey(scope: DailyMutationScope) {
  return `${scope.projectId}:${scope.profileId}`;
}

export function createDailyMutationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function buildDailyOptimisticTaskId(clientMutationId: string) {
  return `optimistic-task:${clientMutationId}`;
}

export function getDailyCreateClientMutationIdFromTempTaskId(tempTaskId: string) {
  return tempTaskId.startsWith("optimistic-task:") ? tempTaskId.slice("optimistic-task:".length) : tempTaskId;
}

export function buildDailyMutationOperation(input: {
  scope: DailyMutationScope;
  type: DailyMutationOperationType;
  payload: DailyMutationPayload;
  operationId?: string;
  clientMutationId?: string;
  tempTaskId?: string | null;
  serverTaskId?: string | null;
  now?: string;
}): DailyMutationOperation {
  const now = input.now ?? new Date().toISOString();
  const clientMutationId = input.clientMutationId ?? createDailyMutationId();
  const operationId = input.operationId ?? `${input.type}:${clientMutationId}`;
  const payloadSize = getJsonByteLength(input.payload);
  assertDailyMutationPayloadSize(payloadSize);

  return {
    operationId,
    clientMutationId,
    type: input.type,
    status: "pending",
    scopeKey: buildDailyMutationScopeKey(input.scope),
    projectId: input.scope.projectId,
    profileId: input.scope.profileId,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    lastError: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    failureKind: null,
    lastAttemptedAt: null,
    nextRetryAt: null,
    tempTaskId: input.tempTaskId ?? null,
    serverTaskId: input.serverTaskId ?? null,
    payloadSize,
    payload: input.payload,
  };
}

export function buildCoalescedDailyReorderOperation(input: {
  scope: DailyMutationScope;
  command: DailyMutationReorderCommand;
  desiredTasks: TaskRecord[];
  now?: string;
}) {
  return buildDailyMutationOperation({
    scope: input.scope,
    type: "reorder",
    operationId: `${REORDER_OPERATION_ID_PREFIX}${buildDailyMutationScopeKey(input.scope)}`,
    clientMutationId: createDailyMutationId(),
    payload: {
      kind: "reorder",
      command: input.command,
      desiredTasks: input.desiredTasks,
    },
    now: input.now,
  });
}

export function summarizeDailyMutationOperations(operations: readonly DailyMutationOperation[]): DailyMutationSummary {
  return operations.reduce<DailyMutationSummary>(
    (summary, operation) => {
      summary[operation.status] += 1;
      if (operation.status === "pending" || operation.status === "syncing" || operation.status === "failed") {
        summary.totalActive += 1;
      }
      return summary;
    },
    { pending: 0, syncing: 0, failed: 0, synced: 0, totalActive: 0 },
  );
}

export function mergeDailyMutationOperationsIntoActiveTasks(
  tasks: readonly TaskRecord[],
  operations: readonly DailyMutationOperation[],
) {
  let next = [...tasks];
  const serverIdByTempId = buildServerIdByTempId(operations);

  for (const operation of operations) {
    if (operation.status === "synced") {
      continue;
    }

    const payload = operation.payload;
    switch (payload.kind) {
      case "create": {
        const serverTaskId = operation.serverTaskId ?? serverIdByTempId[payload.tempTask.id] ?? null;
        if (serverTaskId && next.some((task) => task.id === serverTaskId)) {
          next = next.filter((task) => task.id !== payload.tempTask.id);
          break;
        }
        if (!next.some((task) => task.id === payload.tempTask.id)) {
          next.push(payload.tempTask);
        }
        break;
      }
      case "update": {
        const taskId = serverIdByTempId[payload.taskId] ?? payload.taskId;
        next = next.map((task) => (task.id === taskId ? ({ ...task, ...payload.patch } as TaskRecord) : task));
        break;
      }
      case "trash": {
        const affectedIds = new Set(payload.affectedTasks.map((task) => serverIdByTempId[task.id] ?? task.id));
        next = next.filter((task) => !affectedIds.has(task.id));
        break;
      }
      case "delete":
        break;
      case "reorder":
        next = mergeDesiredTaskOrder(next, payload.desiredTasks);
        break;
    }
  }

  return next;
}

export function mergeDailyMutationOperationsIntoTrashTasks(
  tasks: readonly TaskRecord[],
  operations: readonly DailyMutationOperation[],
) {
  let next = [...tasks];
  for (const operation of operations) {
    if (operation.status === "synced") {
      continue;
    }

    const payload = operation.payload;
    if (payload.kind === "trash") {
      const existingIds = new Set(next.map((task) => task.id));
      for (const task of payload.affectedTasks) {
        if (!existingIds.has(task.id)) {
          next.push({ ...task, deletedAt: task.deletedAt ?? operation.createdAt });
          existingIds.add(task.id);
        }
      }
    }

    if (payload.kind === "delete") {
      const deletedIds = new Set(payload.affectedTasks.map((task) => task.id));
      next = next.filter((task) => !deletedIds.has(task.id));
    }
  }

  return next;
}

export function reconcileDailyMutationCreateSuccess(
  tasks: readonly TaskRecord[],
  tempTaskId: string,
  serverTask: TaskRecord,
) {
  let replaced = false;
  const next = tasks.map((task) => {
    if (task.id !== tempTaskId) {
      return task.id === serverTask.id ? serverTask : task;
    }
    replaced = true;
    return serverTask;
  });

  return replaced || next.some((task) => task.id === serverTask.id) ? next : [serverTask, ...next];
}

export function coalesceDailyReorderOperations(operations: readonly DailyMutationOperation[]) {
  const latestByScope = new Map<string, DailyMutationOperation>();
  const result: DailyMutationOperation[] = [];

  for (const operation of operations) {
    if (operation.payload.kind !== "reorder") {
      result.push(operation);
      continue;
    }

    latestByScope.set(operation.scopeKey, operation);
  }

  const emittedScopes = new Set<string>();
  for (const operation of operations) {
    if (operation.payload.kind !== "reorder" || emittedScopes.has(operation.scopeKey)) {
      continue;
    }

    const latestOperation = latestByScope.get(operation.scopeKey);
    if (latestOperation) {
      result.push(latestOperation);
      emittedScopes.add(operation.scopeKey);
    }
  }

  return result;
}

export function classifyDailyMutationFlushFailure(
  operation: DailyMutationOperation,
  error: DailyMutationFlushErrorInfo,
): DailyMutationFailureDecision {
  if (error.isNetworkError || error.code === "DATABASE_UNAVAILABLE" || error.status === 408 || error.status === 425 || error.status === 429) {
    return { kind: "network_or_database", retryable: true };
  }

  if (error.status !== null && error.status >= 500) {
    return { kind: "network_or_database", retryable: true };
  }

  if (operation.payload.kind === "update" && error.status === 409 && error.code === "TASK_VERSION_CONFLICT") {
    return { kind: "version_conflict", retryable: true };
  }

  if (operation.payload.kind === "reorder" && error.status === 409 && error.code === "TASK_REORDER_CONFLICT") {
    return { kind: "reorder_conflict", retryable: true };
  }

  if ((operation.payload.kind === "trash" || operation.payload.kind === "delete") && error.status === 404) {
    return { kind: "not_found_desired_state_check", retryable: true };
  }

  if (error.status === 401 || error.status === 403) {
    return { kind: "auth_or_permission", retryable: false };
  }

  return { kind: "fatal", retryable: false };
}

export function shouldRecoverLegacyFailedDailyMutation(operation: DailyMutationOperation) {
  return operation.status === "failed" && !operation.failureKind && operation.retryCount < DAILY_MUTATION_MAX_RETRY_COUNT;
}

export function shouldContinueRetryingDailyMutation(retryCount: number) {
  return retryCount < DAILY_MUTATION_MAX_RETRY_COUNT;
}

export function rebaseDailyUpdateMutationOperation(
  operation: DailyMutationOperation,
  latestTask: Pick<TaskRecord, "version">,
): DailyMutationOperation {
  if (operation.payload.kind !== "update") {
    return operation;
  }

  return {
    ...operation,
    status: "pending",
    updatedAt: new Date().toISOString(),
    lastError: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    failureKind: null,
    nextRetryAt: null,
    payload: {
      ...operation.payload,
      baseVersion: latestTask.version,
    },
  };
}

export function rebaseDailyReorderMutationOperation(
  operation: DailyMutationOperation,
  latestTasks: readonly TaskRecord[],
): DailyMutationOperation {
  if (operation.payload.kind !== "reorder") {
    return operation;
  }

  const latestById = new Map(latestTasks.map((task) => [task.id, task]));
  const desiredTasks = operation.payload.desiredTasks.map((task) => {
    const latestTask = latestById.get(task.id);
    return latestTask ? { ...latestTask, parentTaskId: task.parentTaskId, siblingOrder: task.siblingOrder } : task;
  });

  return {
    ...operation,
    status: "pending",
    updatedAt: new Date().toISOString(),
    lastError: null,
    lastHttpStatus: null,
    lastErrorCode: null,
    failureKind: null,
    nextRetryAt: null,
    payload: {
      ...operation.payload,
      desiredTasks,
    },
  };
}

export function shouldMarkDailyTrashMutationSyncedFromServerState(
  operation: DailyMutationOperation,
  activeTasks: readonly TaskRecord[],
  trashTasks: readonly TaskRecord[],
) {
  if (operation.payload.kind !== "trash") {
    return false;
  }

  const affectedIds = new Set(operation.payload.affectedTasks.map((task) => task.id));
  if (affectedIds.size === 0) {
    affectedIds.add(operation.payload.taskId);
  }

  const activeIds = new Set(activeTasks.map((task) => task.id));
  const trashIds = new Set(trashTasks.map((task) => task.id));

  for (const taskId of affectedIds) {
    if (activeIds.has(taskId)) {
      return false;
    }
  }

  return [...affectedIds].some((taskId) => trashIds.has(taskId)) || [...affectedIds].every((taskId) => !activeIds.has(taskId));
}

export function shouldMarkDailyDeleteMutationSyncedFromServerState(
  operation: DailyMutationOperation,
  activeTasks: readonly TaskRecord[],
  trashTasks: readonly TaskRecord[],
) {
  if (operation.payload.kind !== "delete") {
    return false;
  }

  const affectedIds = new Set(operation.payload.affectedTasks.map((task) => task.id));
  if (affectedIds.size === 0) {
    affectedIds.add(operation.payload.taskId);
  }

  const activeIds = new Set(activeTasks.map((task) => task.id));
  const trashIds = new Set(trashTasks.map((task) => task.id));
  return [...affectedIds].every((taskId) => !activeIds.has(taskId) && !trashIds.has(taskId));
}

export function shouldResetDailyMutationSyncingOperation(operation: DailyMutationOperation, now = Date.now()) {
  return operation.status === "syncing" && Date.parse(operation.updatedAt) < now - 30_000;
}

export async function putDailyMutationOperation(operation: DailyMutationOperation) {
  const db = await openDailyMutationDb();
  const stored = toStoredOperation(operation);
  await runStoreRequest(db, "readwrite", (store) => store.put(stored));
}

export async function listDailyMutationOperations(scope: DailyMutationScope) {
  if (!canUseIndexedDb()) {
    return [] as DailyMutationOperation[];
  }

  const scopeKey = buildDailyMutationScopeKey(scope);
  const db = await openDailyMutationDb();
  const records = await runStoreRequest<StoredOperation[]>(db, "readonly", (store) => store.getAll());
  return records
    .filter((operation) => operation.scopeKey === scopeKey)
    .map(fromStoredOperation)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function updateDailyMutationOperation(
  operationId: string,
  updater: (operation: DailyMutationOperation) => DailyMutationOperation | null,
) {
  const db = await openDailyMutationDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(operationId);
    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      const current = getRequest.result ? fromStoredOperation(getRequest.result as StoredOperation) : null;
      if (!current) {
        return;
      }

      const next = updater(current);
      if (!next) {
        store.delete(operationId);
        return;
      }

      const payloadSize = getJsonByteLength(next.payload);
      assertDailyMutationPayloadSize(payloadSize);
      store.put(toStoredOperation({ ...next, payloadSize }));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function deleteDailyMutationOperation(operationId: string) {
  const db = await openDailyMutationDb();
  await runStoreRequest(db, "readwrite", (store) => store.delete(operationId));
}

export function computeDailyMutationRetryDelayMs(retryCount: number) {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, retryCount));
}

function buildServerIdByTempId(operations: readonly DailyMutationOperation[]) {
  const map: Record<string, string> = {};
  for (const operation of operations) {
    if (operation.tempTaskId && operation.serverTaskId) {
      map[operation.tempTaskId] = operation.serverTaskId;
    }
  }
  return map;
}

function mergeDesiredTaskOrder(tasks: readonly TaskRecord[], desiredTasks: readonly TaskRecord[]) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const desiredOrderById = new Map(desiredTasks.map((task) => [task.id, task.siblingOrder]));
  const orderedIds = desiredTasks.map((task) => task.id);
  const next: TaskRecord[] = [];
  const used = new Set<string>();

  for (const taskId of orderedIds) {
    const task = taskById.get(taskId);
    if (!task) {
      continue;
    }

    used.add(taskId);
    next.push({
      ...task,
      siblingOrder: desiredOrderById.get(taskId) ?? task.siblingOrder,
    });
  }

  for (const task of tasks) {
    if (!used.has(task.id)) {
      next.push(task);
    }
  }

  return next;
}

function toStoredOperation(operation: DailyMutationOperation): StoredOperation {
  return {
    ...operation,
    statusScopeKey: `${operation.scopeKey}:${operation.status}`,
  };
}

function fromStoredOperation(operation: StoredOperation): DailyMutationOperation {
  const { statusScopeKey: _statusScopeKey, ...rest } = operation;
  return rest;
}

function canUseIndexedDb() {
  return typeof indexedDB !== "undefined";
}

function openDailyMutationDb() {
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
        : db.createObjectStore(STORE_NAME, { keyPath: "operationId" });

      if (!store) {
        return;
      }

      if (!store.indexNames.contains("scopeKey")) {
        store.createIndex("scopeKey", "scopeKey", { unique: false });
      }
      if (!store.indexNames.contains("statusScopeKey")) {
        store.createIndex("statusScopeKey", "statusScopeKey", { unique: false });
      }
      if (!store.indexNames.contains("createdAt")) {
        store.createIndex("createdAt", "createdAt", { unique: false });
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

function assertDailyMutationPayloadSize(payloadSize: number) {
  if (payloadSize > DAILY_MUTATION_PAYLOAD_SIZE_LIMIT_BYTES) {
    throw new Error("Daily mutation payload is too large to store locally.");
  }
}

function getJsonByteLength(value: unknown) {
  const json = JSON.stringify(value);
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(json).byteLength;
  }
  return json.length;
}
