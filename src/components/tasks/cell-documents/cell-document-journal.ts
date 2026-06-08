"use client";

const DB_NAME = "architect-start.task-cell-documents";
const DB_VERSION = 1;
const STORE_NAME = "updates";

export type CellDocumentJournalOperation = {
  operationId: string;
  projectId: string;
  taskId: string;
  fieldKey: string;
  clientUpdateId: string;
  updateBase64: string;
  status: "pending" | "syncing" | "failed";
  createdAt: string;
  updatedAt: string;
  lastError: string | null;
};

let dbPromise: Promise<IDBDatabase> | null = null;

export async function putCellDocumentJournalOperation(operation: CellDocumentJournalOperation) {
  const db = await openCellDocumentJournalDb();
  await runStoreRequest(db, "readwrite", (store) => store.put(operation));
}

export async function deleteCellDocumentJournalOperation(operationId: string) {
  const db = await openCellDocumentJournalDb();
  await runStoreRequest(db, "readwrite", (store) => store.delete(operationId));
}

export async function listCellDocumentJournalOperations(input: {
  projectId: string;
  taskId: string;
  fieldKey: string;
}) {
  const db = await openCellDocumentJournalDb();
  const operations = await runStoreRequest(db, "readonly", (store) =>
    store.index("cellKey").getAll([input.projectId, input.taskId, input.fieldKey]),
  );
  return (operations as CellDocumentJournalOperation[]).sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export async function updateCellDocumentJournalOperation(
  operationId: string,
  updater: (operation: CellDocumentJournalOperation) => CellDocumentJournalOperation,
) {
  const db = await openCellDocumentJournalDb();
  await runTransaction(db, "readwrite", (store) => {
    const getRequest = store.get(operationId);
    getRequest.onsuccess = () => {
      const operation = getRequest.result as CellDocumentJournalOperation | undefined;
      if (!operation) {
        return;
      }

      store.put(updater(operation));
    };
  });
}

export function createCellDocumentUpdateId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openCellDocumentJournalDb() {
  if (typeof indexedDB === "undefined") {
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
      if (store && !store.indexNames.contains("cellKey")) {
        store.createIndex("cellKey", ["projectId", "taskId", "fieldKey"], { unique: false });
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

function runTransaction(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    run(store);
  });
}
