import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { serviceUnavailable } from "@/lib/api/errors";
import { backendMode } from "@/lib/backend-mode";
import {
  defaultProjectName,
  localAdminStorePath,
  localAssistantStorePath,
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

export type LocalStoreName = "project" | "tasks" | "files" | "assistant" | "sequence" | "preferences" | "admin";

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
  assistantStorePath: string;
  preferenceStorePath: string;
  sequenceStorePath: string;
  adminStorePath: string;
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
  sizeBytes: number;
  sha256: string | null;
};

type SnapshotUploadFileMeta = {
  relativePath: string;
  sizeBytes: number;
  sha256: string;
};

type SnapshotMeta = {
  manifestVersion: 2;
  id: string;
  createdAt: string;
  reason: string;
  fingerprint: LocalFingerprint;
  stores: SnapshotStoreMeta[];
  uploads: {
    exists: boolean;
    fileCount: number;
    totalBytes: number;
    files: SnapshotUploadFileMeta[];
  };
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
  assistant: {
    path: localAssistantStorePath,
    snapshotName: "assistant-records.json",
    fallback: { records: [], summaries: [], threads: [], threadMessages: [], runPolicies: [], usageEvents: [], auditEvents: [] },
    countRecords(value) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return 0;
      }

      const store = value as {
        records?: unknown;
        summaries?: unknown;
        threads?: unknown;
        threadMessages?: unknown;
        runPolicies?: unknown;
        usageEvents?: unknown;
        auditEvents?: unknown;
      };
      return (
        (Array.isArray(store.records) ? store.records.length : 0) +
        (Array.isArray(store.summaries) ? store.summaries.length : 0) +
        (Array.isArray(store.threads) ? store.threads.length : 0) +
        (Array.isArray(store.threadMessages) ? store.threadMessages.length : 0) +
        (Array.isArray(store.runPolicies) ? store.runPolicies.length : 0) +
        (Array.isArray(store.usageEvents) ? store.usageEvents.length : 0) +
        (Array.isArray(store.auditEvents) ? store.auditEvents.length : 0)
      );
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
  admin: {
    path: localAdminStorePath,
    snapshotName: "admin-foundation.json",
    fallback: {},
    countRecords(value) {
      return value && typeof value === "object" ? Object.keys(value as Record<string, unknown>).length : 0;
    },
  },
};

const localMutationContext = new AsyncLocalStorage<boolean>();
let localMutationTail = Promise.resolve();

export async function withLocalDataMutationLock<T>(operation: () => Promise<T>): Promise<T> {
  if (localMutationContext.getStore()) {
    return operation();
  }

  const previous = localMutationTail;
  let release: () => void = () => undefined;
  localMutationTail = new Promise<void>((resolvePromise) => {
    release = resolvePromise;
  });
  await previous;
  try {
    return await localMutationContext.run(true, operation);
  } finally {
    release();
  }
}

function defaultState(): LocalGuardState {
  return {
    version: 1,
    fingerprint: null,
    stores: {
      project: { exists: false, path: localProjectMetaPath, recordCount: 0, updatedAt: null },
      tasks: { exists: false, path: localTaskStorePath, recordCount: 0, updatedAt: null },
      files: { exists: false, path: localFileStorePath, recordCount: 0, updatedAt: null },
      assistant: { exists: false, path: localAssistantStorePath, recordCount: 0, updatedAt: null },
      sequence: { exists: false, path: localSequenceStorePath, recordCount: 0, updatedAt: null },
      preferences: { exists: false, path: localPreferenceStorePath, recordCount: 0, updatedAt: null },
      admin: { exists: false, path: localAdminStorePath, recordCount: 0, updatedAt: null },
    },
    lastSnapshotId: null,
    writeLock: null,
    lastConsumedConfirmTokenHash: null,
  };
}

function buildFingerprintSignature(input: Omit<LocalFingerprint, "signature" | "projectId">) {
  return hashValue(JSON.stringify(input));
}

function normalizeFingerprint(input: LocalFingerprint | null | undefined) {
  if (!input) {
    return null;
  }

  const stableFingerprint = {
    backendMode: input.backendMode,
    localDataRoot: input.localDataRoot,
    localUploadRoot: input.localUploadRoot,
    projectMetaPath: input.projectMetaPath,
    taskStorePath: input.taskStorePath,
    fileStorePath: input.fileStorePath,
    assistantStorePath: input.assistantStorePath,
    preferenceStorePath: input.preferenceStorePath,
    sequenceStorePath: input.sequenceStorePath,
    adminStorePath: input.adminStorePath,
  };

  return {
    ...input,
    signature: buildFingerprintSignature(stableFingerprint),
  } satisfies LocalFingerprint;
}

async function loadState() {
  try {
    const raw = await readFile(localGuardStatePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalGuardState>;
    return {
      ...defaultState(),
      ...parsed,
      fingerprint: normalizeFingerprint(parsed.fingerprint as LocalFingerprint | null | undefined),
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
  const stablePayload = {
    backendMode,
    localDataRoot,
    localUploadRoot,
    projectMetaPath: localProjectMetaPath,
    taskStorePath: localTaskStorePath,
    fileStorePath: localFileStorePath,
    assistantStorePath: localAssistantStorePath,
    preferenceStorePath: localPreferenceStorePath,
    sequenceStorePath: localSequenceStorePath,
    adminStorePath: localAdminStorePath,
  };

  return {
    ...stablePayload,
    projectId,
    signature: buildFingerprintSignature(stablePayload),
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
  let currentState = state;

  if (
    currentState.writeLock?.reasonCode === "LOCAL_DATA_FINGERPRINT_CHANGED" &&
    currentState.fingerprint?.signature === fingerprint.signature
  ) {
    currentState = {
      ...currentState,
      writeLock: null,
    };
    await saveState(currentState);
  }

  if (currentState.writeLock) {
    if (isConfirmationAccepted(currentState.writeLock, currentState)) {
      return currentState.writeLock;
    }

    if (guardMode === "warn") {
      return currentState.writeLock;
    }

    throw serviceUnavailable(
      `${currentState.writeLock.message} Run \`${currentState.writeLock.recommendedCommand}\` and retry with DATA_GUARD_CONFIRM=${currentState.writeLock.confirmToken} if the change is intentional.`,
      "LOCAL_DATA_WRITE_LOCKED",
    );
  }

  let lock: LocalWriteLock | null = null;

  if (currentState.fingerprint && currentState.fingerprint.signature !== fingerprint.signature && hasHistoricalData(currentState)) {
    lock = buildWriteLock(currentState, {
      store,
      reasonCode: "LOCAL_DATA_FINGERPRINT_CHANGED",
      message: `Local data fingerprint changed from ${currentState.fingerprint.localDataRoot} to ${fingerprint.localDataRoot}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: currentState.stores[store]?.path ?? null,
      currentPath: current.path,
    });
  } else if (
    currentState.stores[store]?.path &&
    currentState.stores[store].path !== current.path &&
    currentState.stores[store].recordCount > 0
  ) {
    lock = buildWriteLock(currentState, {
      store,
      reasonCode: "LOCAL_STORE_PATH_CHANGED",
      message: `Tracked local store path changed from ${currentState.stores[store].path} to ${current.path}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: currentState.stores[store].path,
      currentPath: current.path,
    });
  } else if (!current.exists && currentState.stores[store].exists && currentState.stores[store].recordCount > 0) {
    lock = buildWriteLock(currentState, {
      store,
      reasonCode: "LOCAL_STORE_MISSING",
      message: `Tracked local store is missing at ${current.path} even though previous data exists.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: currentState.stores[store].path,
      currentPath: current.path,
    });
  } else if (Math.max(current.recordCount, currentState.stores[store].recordCount) > 0 && nextRecordCount === 0) {
    lock = buildWriteLock(currentState, {
      store,
      reasonCode: "LOCAL_EMPTY_OVERWRITE",
      message: `Blocked an empty overwrite for ${store} at ${current.path}.`,
      fingerprintSignature: fingerprint.signature,
      previousPath: currentState.stores[store].path,
      currentPath: current.path,
    });
  }

  if (!lock) {
    return null;
  }

  const nextState = {
    ...currentState,
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

async function snapshotStoresUnlocked(reason: string, details?: Record<string, unknown>) {
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
    let sizeBytes = 0;
    let sha256: string | null = null;

    if (exists) {
      const snapshotPath = join(snapshotDir, definition.snapshotName);
      await copyFile(definition.path, snapshotPath);
      const raw = await readFile(snapshotPath);
      const parsed = JSON.parse(raw.toString("utf8")) as unknown;
      recordCount = definition.countRecords(parsed);
      sizeBytes = raw.byteLength;
      sha256 = createHash("sha256").update(raw).digest("hex");
    }

    stores.push({
      store,
      path: definition.path,
      exists,
      recordCount,
      sizeBytes,
      sha256,
    });
  }

  const uploadSnapshotPath = join(snapshotDir, "uploads");
  const uploadsExist = await pathExists(localUploadRoot);
  if (uploadsExist) {
    await cp(localUploadRoot, uploadSnapshotPath, {
      recursive: true,
      force: true,
    });
  }
  const uploadStats = await inspectDirectory(uploadSnapshotPath);

  const meta: SnapshotMeta = {
    manifestVersion: 2,
    id,
    createdAt: new Date().toISOString(),
    reason,
    fingerprint,
    stores,
    uploads: uploadStats,
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
  return withLocalDataMutationLock(() => snapshotStoresUnlocked(reason, details));
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
  return withLocalDataMutationLock(() => writeLocalStoreUnlocked(store, nextValue, options));
}

async function writeLocalStoreUnlocked<T>(store: LocalStoreName, nextValue: T, options: WriteOptions) {
  const definition = storeDefinitions[store];
  const state = await loadState();
  const fingerprint = await computeFingerprint();
  const currentState = await captureStoreState(store);
  const nextRecordCount = definition.countRecords(nextValue);
  const lock = await maybeBlockWrite(store, state, fingerprint, currentState, nextRecordCount);
  const snapshot = await snapshotStoresUnlocked(`write:${options.reason}`, {
    store,
    nextRecordCount,
    currentRecordCount: currentState.recordCount,
  });

  await writeLocalStoreFile(definition.path, nextValue);

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

async function writeLocalStoreFile(path: string, value: unknown) {
  const targetPath = resolveLocalDataPath(path);
  await ensureParent(targetPath);

  // Local backend writes only predefined store files under localDataRoot after snapshot and lock checks.
  // codeql[js/http-to-file-access]
  await writeTextAtomically(targetPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeTextAtomically(targetPath: string, value: string) {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

function resolveLocalDataPath(path: string) {
  const root = resolve(localDataRoot);
  const target = resolve(path);
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error("Local store write path must stay under the local data root.");
  }
  return target;
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

type ValidatedRestoreStore = {
  store: LocalStoreName;
  definition: StoreDefinition;
  exists: boolean;
  raw: Buffer | null;
};

type RestorePlanItem = {
  label: string;
  targetPath: string;
  stagedPath: string | null;
};

type AppliedRestoreItem = RestorePlanItem & {
  rollbackPath: string;
  hadOriginal: boolean;
};

export async function restoreLocalSnapshot(
  snapshotId: string,
  options: { testFailureAfterSwapCount?: number } = {},
) {
  return withLocalDataMutationLock(() => restoreLocalSnapshotUnlocked(snapshotId, options));
}

async function restoreLocalSnapshotUnlocked(
  snapshotId: string,
  options: { testFailureAfterSwapCount?: number },
) {
  const targetDir = resolveSnapshotDirectory(snapshotId);

  if (!(await pathExists(targetDir))) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const { meta, stores } = await validateLocalSnapshotForRestore(targetDir, snapshotId);
  const preRestoreSnapshot = await snapshotStoresUnlocked(`pre-restore:${snapshotId}`, {
    targetSnapshotId: snapshotId,
  });
  const restoreRoot = join(localQuarantineRoot, safeSnapshotId("restore-transaction"));
  const stagedRoot = join(restoreRoot, "staged");
  await ensureDir(stagedRoot);
  const plan: RestorePlanItem[] = [];

  for (const input of stores) {
    const stagedPath = input.exists ? join(stagedRoot, `${input.store}.json`) : null;
    if (stagedPath && input.raw) {
      await ensureParent(stagedPath);
      await writeFile(stagedPath, input.raw, { mode: 0o600 });
    }
    plan.push({
      label: `store-${input.store}`,
      targetPath: resolveLocalDataPath(input.definition.path),
      stagedPath,
    });
  }

  const snapshotUploadRoot = join(targetDir, "uploads");
  const stagedUploadRoot = meta.uploads.exists ? join(stagedRoot, "uploads") : null;
  if (stagedUploadRoot) {
    await cp(snapshotUploadRoot, stagedUploadRoot, {
      recursive: true,
      force: true,
    });
  }
  plan.push({
    label: "uploads",
    targetPath: resolve(localUploadRoot),
    stagedPath: stagedUploadRoot,
  });

  await applyRestorePlan(plan, restoreRoot, options);

  const fingerprint = await computeFingerprint();
  const state = await loadState();
  await saveState({
    ...state,
    fingerprint,
    stores: await captureAllStoreStates(),
    lastSnapshotId: snapshotId,
  });

  await appendAuditEvent({
    action: "local.snapshot.restored",
    snapshotId,
    preRestoreSnapshotId: preRestoreSnapshot.id,
  });

  return {
    snapshotId,
    preRestoreSnapshotId: preRestoreSnapshot.id,
  };
}

async function validateLocalSnapshotForRestore(targetDir: string, snapshotId: string) {
  const metaPath = join(targetDir, "meta.json");
  if (!(await pathExists(metaPath))) {
    throw new Error(`Snapshot manifest is missing: ${snapshotId}`);
  }

  let meta: SnapshotMeta;
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8")) as SnapshotMeta;
  } catch {
    throw new Error(`Snapshot manifest is invalid JSON: ${snapshotId}`);
  }

  if (meta.manifestVersion !== 2) {
    throw new Error(`Snapshot manifest version is unsupported or missing: ${snapshotId}`);
  }
  if (meta.id !== snapshotId) {
    throw new Error(`Snapshot manifest id does not match requested snapshot: ${snapshotId}`);
  }
  if (!meta.fingerprint || !Array.isArray(meta.stores) || !meta.uploads) {
    throw new Error(`Snapshot manifest is incomplete: ${snapshotId}`);
  }

  const snapshotFingerprint = normalizeFingerprint(meta.fingerprint);
  const currentFingerprint = await computeFingerprint();
  if (!snapshotFingerprint || snapshotFingerprint.signature !== currentFingerprint.signature) {
    throw new Error("Snapshot fingerprint does not match the configured local data paths.");
  }

  const manifestByStore = new Map<LocalStoreName, SnapshotStoreMeta>();
  for (const item of meta.stores) {
    if (!item || !(item.store in storeDefinitions) || manifestByStore.has(item.store)) {
      throw new Error(`Snapshot store manifest is invalid or duplicated: ${String(item?.store)}`);
    }
    manifestByStore.set(item.store, item);
  }

  const stores: ValidatedRestoreStore[] = [];
  for (const store of Object.keys(storeDefinitions) as LocalStoreName[]) {
    const definition = storeDefinitions[store];
    const manifest = manifestByStore.get(store);
    if (!manifest || resolve(manifest.path) !== resolve(definition.path)) {
      throw new Error(`Snapshot store manifest is missing or targets a different path: ${store}`);
    }
    const sourcePath = join(targetDir, definition.snapshotName);
    const artifactExists = await pathExists(sourcePath);

    if (!manifest.exists) {
      if (artifactExists || manifest.recordCount !== 0 || manifest.sizeBytes !== 0 || manifest.sha256 !== null) {
        throw new Error(`Snapshot empty-store manifest is inconsistent: ${store}`);
      }
      stores.push({ store, definition, exists: false, raw: null });
      continue;
    }

    if (!artifactExists || !Number.isInteger(manifest.sizeBytes) || manifest.sizeBytes < 0 || !isSha256(manifest.sha256)) {
      throw new Error(`Snapshot required store artifact is missing or has invalid metadata: ${store}`);
    }
    const raw = await readFile(sourcePath);
    const checksum = createHash("sha256").update(raw).digest("hex");
    if (raw.byteLength !== manifest.sizeBytes || checksum !== manifest.sha256) {
      throw new Error(`Snapshot store artifact checksum failed: ${store}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString("utf8")) as unknown;
    } catch {
      throw new Error(`Snapshot store artifact is invalid JSON: ${store}`);
    }
    if (definition.countRecords(parsed) !== manifest.recordCount) {
      throw new Error(`Snapshot store record count does not match manifest: ${store}`);
    }
    stores.push({ store, definition, exists: true, raw });
  }

  if (manifestByStore.size !== Object.keys(storeDefinitions).length) {
    throw new Error(`Snapshot store manifest contains unexpected entries: ${snapshotId}`);
  }

  const snapshotUploadRoot = join(targetDir, "uploads");
  const uploadArtifactExists = await pathExists(snapshotUploadRoot);
  if (!meta.uploads.exists) {
    if (
      uploadArtifactExists ||
      meta.uploads.fileCount !== 0 ||
      meta.uploads.totalBytes !== 0 ||
      !Array.isArray(meta.uploads.files) ||
      meta.uploads.files.length !== 0
    ) {
      throw new Error("Snapshot empty-upload manifest is inconsistent.");
    }
  } else {
    if (!uploadArtifactExists || !Array.isArray(meta.uploads.files)) {
      throw new Error("Snapshot required upload artifact is missing.");
    }
    const actualUploads = await inspectDirectory(snapshotUploadRoot);
    if (
      !actualUploads.exists ||
      actualUploads.fileCount !== meta.uploads.fileCount ||
      actualUploads.totalBytes !== meta.uploads.totalBytes ||
      !areUploadManifestsEqual(actualUploads.files, meta.uploads.files)
    ) {
      throw new Error("Snapshot upload artifact manifest or checksum failed.");
    }
  }

  return { meta, stores };
}

async function applyRestorePlan(
  plan: RestorePlanItem[],
  restoreRoot: string,
  options: { testFailureAfterSwapCount?: number },
) {
  const rollbackRoot = join(restoreRoot, "rollback");
  const failedRoot = join(restoreRoot, "failed-apply");
  const applied: AppliedRestoreItem[] = [];

  try {
    for (const item of plan) {
      const rollbackPath = join(rollbackRoot, item.label);
      const hadOriginal = await pathExists(item.targetPath);
      if (hadOriginal) {
        await ensureParent(rollbackPath);
        await rename(item.targetPath, rollbackPath);
      }

      try {
        if (item.stagedPath) {
          await ensureParent(item.targetPath);
          await rename(item.stagedPath, item.targetPath);
        }
      } catch (error) {
        if (hadOriginal) {
          await rename(rollbackPath, item.targetPath).catch(() => undefined);
        }
        throw error;
      }

      applied.push({ ...item, rollbackPath, hadOriginal });
      if (
        options.testFailureAfterSwapCount &&
        applied.length >= options.testFailureAfterSwapCount
      ) {
        throw new Error("Simulated restore swap failure.");
      }
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const item of [...applied].reverse()) {
      try {
        if (await pathExists(item.targetPath)) {
          const failedPath = join(failedRoot, item.label);
          await ensureParent(failedPath);
          await rename(item.targetPath, failedPath);
        }
        if (item.hadOriginal && (await pathExists(item.rollbackPath))) {
          await ensureParent(item.targetPath);
          await rename(item.rollbackPath, item.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }

    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Local snapshot restore failed and rollback was incomplete. Recovery artifacts remain at ${restoreRoot}.`,
      );
    }
    await rm(restoreRoot, { recursive: true, force: true });
    throw error;
  }

  await rm(restoreRoot, { recursive: true, force: true });
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function areUploadManifestsEqual(left: SnapshotUploadFileMeta[], right: SnapshotUploadFileMeta[]) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => {
    const candidate = right[index];
    return (
      candidate?.relativePath === item.relativePath &&
      candidate.sizeBytes === item.sizeBytes &&
      candidate.sha256 === item.sha256
    );
  });
}

function resolveSnapshotDirectory(snapshotId: string) {
  if (!/^local-[A-Za-z0-9._-]+$/.test(snapshotId)) {
    throw new Error("Snapshot id is invalid.");
  }

  const root = resolve(localSnapshotsRoot);
  const target = resolve(root, snapshotId);
  const relativePath = relative(root, target);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error("Snapshot path must stay under the local snapshot root.");
  }
  return target;
}

async function inspectDirectory(path: string): Promise<SnapshotMeta["uploads"]> {
  if (!(await pathExists(path))) {
    return {
      exists: false,
      fileCount: 0,
      totalBytes: 0,
      files: [],
    };
  }

  let fileCount = 0;
  let totalBytes = 0;
  const files: SnapshotUploadFileMeta[] = [];
  const visit = async (currentPath: string) => {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        const fileStat = await stat(entryPath);
        const bytes = await readFile(entryPath);
        fileCount += 1;
        totalBytes += fileStat.size;
        files.push({
          relativePath: relative(path, entryPath).replace(/\\/g, "/"),
          sizeBytes: bytes.byteLength,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  };
  await visit(path);
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  return {
    exists: true,
    fileCount,
    totalBytes,
    files,
  };
}

export async function quarantineLocalUpload(objectPath: string) {
  return withLocalDataMutationLock(() => quarantineLocalUploadUnlocked(objectPath));
}

async function quarantineLocalUploadUnlocked(objectPath: string) {
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
