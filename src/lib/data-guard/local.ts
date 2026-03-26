import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serviceUnavailable } from "@/lib/api/errors";
import { backendMode } from "@/lib/backend-mode";
import {
  defaultProjectName,
  localDataRoot,
  localFileStorePath,
  localPreferenceStorePath,
  localProjectMetaPath,
  localSequenceStorePath,
  localTaskStorePath,
  localUploadRoot,
} from "@/lib/runtime-config";
import {
  appendAuditEvent,
  ensureDir,
  ensureParent,
  getDataGuardMode,
  hashValue,
  listDirectories,
  localGuardStatePath,
  localQuarantineRoot,
  localSnapshotsRoot,
  pathExists,
  readConfirmationToken,
  safeSnapshotId,
  sanitizeFileSegment,
  writeJsonFile,
} from "@/lib/data-guard/shared";

export type LocalStoreName = "project" | "tasks" | "files" | "sequence" | "preferences";

type LocalGuardStoreState = {
  exists: boolean;
  path: string;
  recordCount: number;
  updatedAt: string | null;
};

type LocalFingerprint = {
  signature: string;
  backendMode: string;
  localDataRoot: string;
  localUploadRoot: string;
  projectMetaPath: string;
  taskStorePath: string;
  fileStorePath: string;
  preferenceStorePath: string;
  sequenceStorePath: string;
  projectId: string | null;
};

type LocalWriteLock = {
  store: LocalStoreName;
  reasonCode: string;
  message: string;
  confirmToken: string;
  fingerprintSignature: string;
  previousPath: string | null;
  currentPath: string;
  createdAt: string;
  recommendedCommand: string;
};

type LocalGuardState = {
  version: 1;
  fingerprint: LocalFingerprint | null;
  stores: Record<LocalStoreName, LocalGuardStoreState>;
  lastSnapshotId: string | null;
  writeLock: LocalWriteLock | null;
  lastConsumedConfirmTokenHash: string | null;
};

type ReadResult<T> = {
  exists: boolean;
  path: string;
  value: T;
};

type WriteOptions = {
  reason: string;
};

type SnapshotStoreMeta = {
  store: LocalStoreName;
  path: string;
  exists: boolean;
  recordCount: number;
};

type SnapshotMeta = {
  id: string;
  createdAt: string;
  reason: string;
  fingerprint: LocalFingerprint;
  stores: SnapshotStoreMeta[];
  details?: Record<string, unknown>;
};

type StoreDefinition = {
  path: string;
  snapshotName: string;
  fallback: unknown;
  countRecords(value: unknown): number;
};

const storeDefinitions: Record<LocalStoreName, StoreDefinition> = {
  project: {
    path: localProjectMetaPath,
    snapshotName: "project-meta.json",
    fallback: {
      id: "project-local",
      name: defaultProjectName,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      source: "local-file",
    },
    countRecords(value) {
      return value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length > 0 ? 1 : 0;
    },
  },
  tasks: {
    path: localTaskStorePath,
    snapshotName: "tasks.json",
    fallback: [],
    countRecords(value) {
      return Array.isArray(value) ? value.length : 0;
    },
  },
  files: {
    path: localFileStorePath,
    snapshotName: "files.json",
    fallback: [],
    countRecords(value) {
      return Array.isArray(value) ? value.length : 0;
    },
  },
  sequence: {
    path: localSequenceStorePath,
    snapshotName: "task-sequence.json",
    fallback: { current: 1 },
    countRecords(value) {
      return value && typeof value === "object" && Number.isFinite((value as { current?: number }).current) ? 1 : 0;
    },
  },
  preferences: {
    path: localPreferenceStorePath,
    snapshotName: "profile-preferences.json",
    fallback: {},
    countRecords(value) {
      return value && typeof value === "object" ? Object.keys(value as Record<string, unknown>).length : 0;
    },
  },
};

function defaultState(): LocalGuardState {
  return {
    version: 1,
    fingerprint: null,
    stores: {
      project: { exists: false, path: localProjectMetaPath, recordCount: 0, updatedAt: null },
      tasks: { exists: false, path: localTaskStorePath, recordCount: 0, updatedAt: null },
      files: { exists: false, path: localFileStorePath, recordCount: 0, updatedAt: null },
      sequence: { exists: false, path: localSequenceStorePath, recordCount: 0, updatedAt: null },
      preferences: { exists: false, path: localPreferenceStorePath, recordCount: 0, updatedAt: null },
    },
    lastSnapshotId: null,
    writeLock: null,
    lastConsumedConfirmTokenHash: null,
  };
}

async function loadState() {
  try {
    const raw = await readFile(localGuardStatePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalGuardState>;
    return {
      ...defaultState(),
      ...parsed,
      stores: {
        ...defaultState().stores,
        ...(parsed.stores ?? {}),
      },
    } satisfies LocalGuardState;
  } catch {
    return defaultState();
  }
}

async function saveState(state: LocalGuardState) {
  await writeJsonFile(localGuardStatePath, state);
}

async function parseJsonOrThrow<T>(path: string, fallback: T): Promise<ReadResult<T>> {
  try {
    const raw = await readFile(path, "utf8");
    return {
      exists: true,
      path,
      value: JSON.parse(raw) as T,
    };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";

    if (code === "ENOENT") {
      return { exists: false, path, value: fallback };
    }

    if (error instanceof SyntaxError) {
      throw serviceUnavailable(`Local data file is invalid: ${path}`, "LOCAL_DATA_FILE_INVALID");
    }

    throw serviceUnavailable(`Unable to read local data file: ${path}`, "LOCAL_DATA_FILE_UNAVAILABLE");
  }
}

async function readProjectId() {
  const project = await parseJsonOrThrow<Record<string, unknown>>(localProjectMetaPath, {});
  return typeof project.value.id === "string" && project.value.id.trim() ? project.value.id.trim() : null;
}

async function computeFingerprint(): Promise<LocalFingerprint> {
  const projectId = await readProjectId();
  const payload = {
    backendMode,
    localDataRoot,
    localUploadRoot,
    projectMetaPath: localProjectMetaPath,
    taskStorePath: localTaskStorePath,
    fileStorePath: localFileStorePath,
    preferenceStorePath: localPreferenceStorePath,
    sequenceStorePath: localSequenceStorePath,
    projectId,
  };

  return {
    ...payload,
    signature: hashValue(JSON.stringify(payload)),
  };
}

async function captureStoreState(store: LocalStoreName): Promise<LocalGuardStoreState> {
  const definition = storeDefinitions[store];
  const exists = await pathExists(definition.path);

  if (!exists) {
    return {
      exists: false,
      path: definition.path,
      recordCount: 0,
      updatedAt: null,
    };
  }

  const parsed = await parseJsonOrThrow(definition.path, definition.fallback);
  const fileStat = await stat(definition.path);

  return {
    exists: true,
    path: definition.path,
    recordCount: definition.countRecords(parsed.value),
    updatedAt: fileStat.mtime.toISOString(),
  };
}

async function captureAllStoreStates() {
  const entries = await Promise.all(
    (Object.keys(storeDefinitions) as LocalStoreName[]).map(async (store) => [store, await captureStoreState(store)] as const),
  );

  return Object.fromEntries(entries) as Record<LocalStoreName, LocalGuardStoreState>;
}

function hasHistoricalData(state: LocalGuardState) {
  return Object.values(state.stores).some((store) => store.exists || store.recordCount > 0);
}

function buildWriteLock(
  state: LocalGuardState,
  input: Omit<LocalWriteLock, "confirmToken" | "createdAt" | "recommendedCommand">,
) {
  const current = state.writeLock;

  if (
    current &&
    current.store === input.store &&
    current.reasonCode === input.reasonCode &&
    current.fingerprintSignature === input.fingerprintSignature &&
    current.currentPath === input.currentPath &&
    current.previousPath === input.previousPath
  ) {
    return current;
  }

  return {
    ...input,
    createdAt: new Date().toISOString(),
    confirmToken: hashValue(`${input.reasonCode}:${input.store}:${input.fingerprintSignature}:${Date.now()}`).slice(0, 12),
    recommendedCommand: "npm run data:doctor",
  } satisfies LocalWriteLock;
}

function isConfirmationAccepted(lock: LocalWriteLock | null, state: LocalGuardState) {
  const token = readConfirmationToken();
  if (!lock || !token) {
    return false;
  }

  const tokenHash = hashValue(token);
  return token === lock.confirmToken && tokenHash !== state.lastConsumedConfirmTokenHash;
}

async function maybeBlockWrite(
  store: LocalStoreName,
  state: LocalGuardState,
  fingerprint: LocalFingerprint,
  current: LocalGuardStoreState,
  nextRecordCount: number,
) {
  const guardMode = getDataGuardMode();

  if (state.writeLock) {
    if (isConfirmationAccepted(state.writeLock, state)) {
      return state.writeLock;
    }

    if (guardMode === "warn") {
      return state.writeLock;
    }

    throw serviceUnavailable(
      `${state.writeLock.message} Run \`${state.writeLock.recommendedCommand}\` and retry with DATA_GUARD_CONFIRM=${state.writeLock.confirmToken} if the change is intentional.`,
      "LOCAL_DATA_WRITE_LOCKED",
    );
  }

  let lock: LocalWriteLock | null = null;

  if (state.fingerprint && state.fingerprint.signature !== fingerprint.signature && hasHistoricalData(state)) {
    lock = buildWriteLock(state, {
      store,
      reasonCode: "LOCAL_DATA_FINGERPRINT_CHANGED",
      message: `Local data fingerprint changed from ${state.fingerprint.localDataRoot} to ${fingerprint.localDataRoot}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: state.stores[store]?.path ?? null,
      currentPath: current.path,
    });
  } else if (state.stores[store]?.path && state.stores[store].path !== current.path && state.stores[store].recordCount > 0) {
    lock = buildWriteLock(state, {
      store,
      reasonCode: "LOCAL_STORE_PATH_CHANGED",
      message: `Tracked local store path changed from ${state.stores[store].path} to ${current.path}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: state.stores[store].path,
      currentPath: current.path,
    });
  } else if (!current.exists && state.stores[store].exists && state.stores[store].recordCount > 0) {
    lock = buildWriteLock(state, {
      store,
      reasonCode: "LOCAL_STORE_MISSING",
      message: `Tracked local store is missing at ${current.path} even though previous data exists.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: state.stores[store].path,
      currentPath: current.path,
    });
  } else if (Math.max(current.recordCount, state.stores[store].recordCount) > 0 && nextRecordCount === 0) {
    lock = buildWriteLock(state, {
      store,
      reasonCode: "LOCAL_EMPTY_OVERWRITE",
      message: `Blocked an empty overwrite for ${store} at ${current.path}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: state.stores[store].path,
      currentPath: current.path,
    });
  }

  if (!lock) {
    return null;
  }

  const nextState = {
    ...state,
    writeLock: lock,
  };
  await saveState(nextState);
  await appendAuditEvent({
    action: "local.write.locked",
    store,
    reasonCode: lock.reasonCode,
    currentPath: lock.currentPath,
    previousPath: lock.previousPath,
    fingerprintSignature: lock.fingerprintSignature,
  });

  if (guardMode === "warn") {
    return lock;
  }

  throw serviceUnavailable(
    `${lock.message} Run \`${lock.recommendedCommand}\` and retry with DATA_GUARD_CONFIRM=${lock.confirmToken} if the change is intentional.`,
    "LOCAL_DATA_WRITE_LOCKED",
  );
}

async function snapshotStores(reason: string, details?: Record<string, unknown>) {
  await ensureDir(localSnapshotsRoot);
  const id = safeSnapshotId("local");
  const snapshotDir = join(localSnapshotsRoot, id);
  await mkdir(snapshotDir, { recursive: true });

  const fingerprint = await computeFingerprint();
  const stores: SnapshotStoreMeta[] = [];

  for (const store of Object.keys(storeDefinitions) as LocalStoreName[]) {
    const definition = storeDefinitions[store];
    const exists = await pathExists(definition.path);
    let recordCount = 0;

    if (exists) {
      await copyFile(definition.path, join(snapshotDir, definition.snapshotName));
      const parsed = await parseJsonOrThrow(definition.path, definition.fallback);
      recordCount = definition.countRecords(parsed.value);
    }

    stores.push({
      store,
      path: definition.path,
      exists,
      recordCount,
    });
  }

  const meta: SnapshotMeta = {
    id,
    createdAt: new Date().toISOString(),
    reason,
    fingerprint,
    stores,
    details,
  };

  await writeJsonFile(join(snapshotDir, "meta.json"), meta);

  const state = await loadState();
  await saveState({
    ...state,
    fingerprint,
    stores: await captureAllStoreStates(),
    lastSnapshotId: id,
  });

  await appendAuditEvent({
    action: "local.snapshot.created",
    snapshotId: id,
    reason,
    details,
  });

  return meta;
}

export async function createLocalSnapshot(reason: string, details?: Record<string, unknown>) {
  return snapshotStores(reason, details);
}

export async function listLocalSnapshots(limit = 10) {
  const directories = await listDirectories(localSnapshotsRoot);

  return Promise.all(
    directories.slice(0, limit).map(async (entry) => {
      try {
        const raw = await readFile(join(entry.path, "meta.json"), "utf8");
        return JSON.parse(raw) as SnapshotMeta;
      } catch {
        return null;
      }
    }),
  );
}

export async function readLocalStore<T>(store: LocalStoreName, fallback: T): Promise<ReadResult<T>> {
  const definition = storeDefinitions[store];
  return parseJsonOrThrow<T>(definition.path, fallback);
}

export async function writeLocalStore<T>(store: LocalStoreName, nextValue: T, options: WriteOptions) {
  const definition = storeDefinitions[store];
  const state = await loadState();
  const fingerprint = await computeFingerprint();
  const currentState = await captureStoreState(store);
  const nextRecordCount = definition.countRecords(nextValue);
  const lock = await maybeBlockWrite(store, state, fingerprint, currentState, nextRecordCount);
  const snapshot = await snapshotStores(`write:${options.reason}`, {
    store,
    nextRecordCount,
    currentRecordCount: currentState.recordCount,
  });

  await ensureParent(definition.path);
  await writeFile(definition.path, `${JSON.stringify(nextValue, null, 2)}\n`, "utf8");

  const nextState = await loadState();
  const confirmationToken = readConfirmationToken();
  const tokenHash = confirmationToken ? hashValue(confirmationToken) : null;
  const confirmedLock = lock && confirmationToken === lock.confirmToken;

  await saveState({
    ...nextState,
    fingerprint,
    stores: await captureAllStoreStates(),
    lastSnapshotId: snapshot.id,
    writeLock: confirmedLock ? null : nextState.writeLock,
    lastConsumedConfirmTokenHash: confirmedLock && tokenHash ? tokenHash : nextState.lastConsumedConfirmTokenHash,
  });

  await appendAuditEvent({
    action: "local.write.applied",
    store,
    reason: options.reason,
    snapshotId: snapshot.id,
    nextRecordCount,
  });

  return {
    snapshotId: snapshot.id,
  };
}

export async function inspectLocalWriteProtection() {
  const state = await loadState();
  const stores = await captureAllStoreStates();
  const latestSnapshots = (await listLocalSnapshots(5)).filter(Boolean);

  return {
    guardMode: getDataGuardMode(),
    backendMode,
    localDataRoot,
    localUploadRoot,
    locked: Boolean(state.writeLock),
    reasonCode: state.writeLock?.reasonCode ?? null,
    message: state.writeLock?.message ?? null,
    confirmToken: state.writeLock?.confirmToken ?? null,
    recommendedCommand: state.writeLock?.recommendedCommand ?? "npm run data:doctor",
    lastSnapshotId: state.lastSnapshotId,
    fingerprint: state.fingerprint,
    stores,
    latestSnapshots,
    quarantineRoot: localQuarantineRoot,
  };
}

export async function restoreLocalSnapshot(snapshotId: string) {
  const targetDir = join(localSnapshotsRoot, snapshotId);

  if (!(await pathExists(targetDir))) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  for (const store of Object.keys(storeDefinitions) as LocalStoreName[]) {
    const definition = storeDefinitions[store];
    const sourcePath = join(targetDir, definition.snapshotName);

    if (!(await pathExists(sourcePath))) {
      continue;
    }

    await ensureParent(definition.path);
    const raw = await readFile(sourcePath, "utf8");
    await writeFile(definition.path, raw, "utf8");
  }

  const fingerprint = await computeFingerprint();
  const state = await loadState();
  await saveState({
    ...state,
    fingerprint,
    stores: await captureAllStoreStates(),
    lastSnapshotId: snapshotId,
    writeLock: null,
  });

  await appendAuditEvent({
    action: "local.snapshot.restored",
    snapshotId,
  });

  return {
    snapshotId,
  };
}

export async function quarantineLocalUpload(objectPath: string) {
  const normalized = objectPath.trim().replace(/\//g, "\\");
  const sourcePath = join(localUploadRoot, normalized);

  if (!(await pathExists(sourcePath))) {
    return null;
  }

  const quarantineId = safeSnapshotId("quarantine");
  const targetPath = join(
    localQuarantineRoot,
    quarantineId,
    ...normalized
      .split(/[\\/]/)
      .filter(Boolean)
      .map((segment) => sanitizeFileSegment(segment)),
  );

  await ensureParent(targetPath);

  try {
    await rename(sourcePath, targetPath);
  } catch {
    await copyFile(sourcePath, targetPath);
    await unlink(sourcePath);
  }

  await appendAuditEvent({
    action: "local.upload.quarantined",
    objectPath,
    quarantineId,
    targetPath,
  });

  return {
    quarantineId,
    targetPath,
  };
}
