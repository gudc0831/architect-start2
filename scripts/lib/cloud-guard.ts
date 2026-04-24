import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  appendAuditEvent,
  cloudBackupsRoot,
  cloudGuardStatePath,
  ensureDir,
  getDataGuardMode,
  hashValue,
  listDirectories,
  pathExists,
  readConfirmationToken,
  safeSnapshotId,
  writeJsonFile,
} from "../../src/lib/data-guard/shared";
import { captureNpmExec } from "./run-command";

loadEnvConfig(process.cwd());

type CloudCounts = {
  profiles: number;
  projects: number;
  tasks: number;
  files: number;
  preferences: number;
};

type CloudGuardLock = {
  operation: string;
  reasonCode: string;
  message: string;
  confirmToken: string;
  databaseFingerprint: string;
  createdAt: string;
  recommendedCommand: string;
};

type CloudGuardState = {
  version: 1;
  lastBackupId: string | null;
  writeLock: CloudGuardLock | null;
  lastConsumedConfirmTokenHash: string | null;
};

type CloudGuardSummary = {
  configured: boolean;
  backendMode: string;
  guardMode: "strict" | "warn";
  databaseFingerprint: string | null;
  databaseTarget: string | null;
  rowCounts: CloudCounts | null;
  rowCountError: string | null;
  isNonEmpty: boolean;
  migrationStatus: {
    ok: boolean;
    status: number;
    stdout: string;
    stderr: string;
  } | null;
  lastBackupId: string | null;
  writeLock: CloudGuardLock | null;
};

function getBackendMode() {
  return process.env.APP_BACKEND_MODE?.trim() || "local";
}

function defaultState(): CloudGuardState {
  return {
    version: 1,
    lastBackupId: null,
    writeLock: null,
    lastConsumedConfirmTokenHash: null,
  };
}

async function loadState() {
  try {
    const raw = await readFile(cloudGuardStatePath, "utf8");
    return {
      ...defaultState(),
      ...(JSON.parse(raw) as Partial<CloudGuardState>),
    } satisfies CloudGuardState;
  } catch {
    return defaultState();
  }
}

async function saveState(state: CloudGuardState) {
  await writeJsonFile(cloudGuardStatePath, state);
}

function resolveDatabaseTarget() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    return { fingerprint: null, target: null };
  }

  try {
    const parsed = new URL(url);
    const target = `${parsed.hostname}${parsed.pathname}`;
    return {
      fingerprint: hashValue(target),
      target,
    };
  } catch {
    return {
      fingerprint: hashValue(url),
      target: "unparsed-database-url",
    };
  }
}

async function getPrisma() {
  const prismaModule = await import("../../src/lib/prisma");
  return prismaModule.prisma;
}

async function getRowCounts(): Promise<CloudCounts> {
  const prisma = await getPrisma();
  const [profiles, projects, tasks, files, preferences] = await Promise.all([
    prisma.profile.count(),
    prisma.project.count(),
    prisma.task.count(),
    prisma.file.count(),
    prisma.profilePreference.count(),
  ]);

  return { profiles, projects, tasks, files, preferences };
}

export async function getCloudGuardSummary(options?: { includeMigrationStatus?: boolean }): Promise<CloudGuardSummary> {
  const state = await loadState();
  const { fingerprint, target } = resolveDatabaseTarget();
  const backendMode = getBackendMode();
  const configured = backendMode === "cloud" && Boolean(process.env.DATABASE_URL?.trim());

  if (!configured) {
    return {
      configured: false,
      backendMode,
      guardMode: getDataGuardMode(),
      databaseFingerprint: fingerprint,
      databaseTarget: target,
      rowCounts: null,
      rowCountError: null,
      isNonEmpty: false,
      migrationStatus: null,
      lastBackupId: state.lastBackupId,
      writeLock: state.writeLock,
    };
  }

  let rowCounts: CloudCounts | null = null;
  let rowCountError: string | null = null;

  try {
    rowCounts = await getRowCounts();
  } catch (error) {
    rowCountError = error instanceof Error ? error.message : String(error);
  }

  const isNonEmpty = rowCounts ? Object.values(rowCounts).some((count) => count > 0) : false;
  const migrationStatus = options?.includeMigrationStatus
    ? (() => {
        const result = captureNpmExec(["prisma", "migrate", "status", "--schema", "prisma/schema.prisma"]);
        return {
          ok: result.status === 0,
          status: result.status,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        };
      })()
    : null;

  return {
    configured: true,
    backendMode,
    guardMode: getDataGuardMode(),
    databaseFingerprint: fingerprint,
    databaseTarget: target,
    rowCounts,
    rowCountError,
    isNonEmpty,
    migrationStatus,
    lastBackupId: state.lastBackupId,
    writeLock: state.writeLock,
  };
}

function buildLock(state: CloudGuardState, input: Omit<CloudGuardLock, "confirmToken" | "createdAt" | "recommendedCommand">) {
  const current = state.writeLock;

  if (
    current &&
    current.operation === input.operation &&
    current.reasonCode === input.reasonCode &&
    current.databaseFingerprint === input.databaseFingerprint
  ) {
    return current;
  }

  return {
    ...input,
    confirmToken: hashValue(`${input.operation}:${input.reasonCode}:${input.databaseFingerprint}:${Date.now()}`).slice(0, 12),
    createdAt: new Date().toISOString(),
    recommendedCommand: "npm run data:doctor",
  } satisfies CloudGuardLock;
}

function isConfirmationAccepted(lock: CloudGuardLock | null, state: CloudGuardState) {
  const token = readConfirmationToken();
  if (!lock || !token) {
    return false;
  }

  const tokenHash = hashValue(token);
  return token === lock.confirmToken && tokenHash !== state.lastConsumedConfirmTokenHash;
}

export async function assertCloudMutationAllowed(options: {
  operation: string;
  reasonCode: string;
  message: string;
  databaseFingerprint: string;
}) {
  const state = await loadState();
  const guardMode = getDataGuardMode();

  if (state.writeLock) {
    if (isConfirmationAccepted(state.writeLock, state)) {
      return state.writeLock;
    }

    if (guardMode === "warn") {
      return state.writeLock;
    }

    throw new Error(
      `${state.writeLock.message} Run ${state.writeLock.recommendedCommand} and retry with DATA_GUARD_CONFIRM=${state.writeLock.confirmToken} if the change is intentional.`,
    );
  }

  const lock = buildLock(state, options);
  await saveState({
    ...state,
    writeLock: lock,
  });
  await appendAuditEvent({
    action: "cloud.write.locked",
    operation: options.operation,
    reasonCode: options.reasonCode,
    databaseFingerprint: options.databaseFingerprint,
  });

  if (guardMode === "warn") {
    return lock;
  }

  throw new Error(
    `${lock.message} Run ${lock.recommendedCommand} and retry with DATA_GUARD_CONFIRM=${lock.confirmToken} if the change is intentional.`,
  );
}

export async function finalizeCloudMutation(lock: CloudGuardLock | null, backupId?: string | null) {
  const state = await loadState();
  const token = readConfirmationToken();
  const tokenHash = token ? hashValue(token) : null;
  const confirmedLock = lock && token === lock.confirmToken;

  await saveState({
    ...state,
    lastBackupId: backupId ?? state.lastBackupId,
    writeLock: confirmedLock ? null : state.writeLock,
    lastConsumedConfirmTokenHash: confirmedLock && tokenHash ? tokenHash : state.lastConsumedConfirmTokenHash,
  });
}

export async function createCloudBackup(reason: string) {
  const summary = await getCloudGuardSummary();
  if (!summary.configured) {
    return null;
  }

  await ensureDir(cloudBackupsRoot);
  const backupId = safeSnapshotId("cloud");
  const backupDir = join(cloudBackupsRoot, backupId);
  await ensureDir(backupDir);

  let tables: Record<string, unknown> | null = null;
  let backupError: string | null = null;

  try {
    const prisma = await getPrisma();
    tables = {
      profiles: await prisma.profile.findMany({ orderBy: { createdAt: "asc" } }),
      projects: await prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
      tasks: await prisma.task.findMany({ orderBy: [{ createdAt: "asc" }, { taskNumber: "asc" }] }),
      files: await prisma.file.findMany({ orderBy: [{ createdAt: "asc" }, { version: "asc" }] }),
      preferences: await prisma.profilePreference.findMany({ orderBy: { profileId: "asc" } }),
    };
  } catch (error) {
    backupError = error instanceof Error ? error.message : String(error);
  }

  const payload = {
    id: backupId,
    createdAt: new Date().toISOString(),
    reason,
    databaseTarget: summary.databaseTarget,
    databaseFingerprint: summary.databaseFingerprint,
    rowCounts: summary.rowCounts,
    rowCountError: summary.rowCountError,
    backupError,
    tables,
  };

  await writeJsonFile(join(backupDir, "backup.json"), payload);
  const state = await loadState();
  await saveState({
    ...state,
    lastBackupId: backupId,
  });
  await appendAuditEvent({
    action: "cloud.backup.created",
    backupId,
    reason,
    databaseFingerprint: summary.databaseFingerprint,
  });

  return {
    backupId,
    backupDir,
  };
}

export async function readCloudState() {
  return loadState();
}

export async function listCloudBackups(limit = 10) {
  if (!(await pathExists(cloudBackupsRoot))) {
    return [];
  }

  const entries = await listDirectories(cloudBackupsRoot);
  return Promise.all(
    entries.slice(0, limit).map(async (entry) => {
      try {
        const raw = await readFile(join(entry.path, "backup.json"), "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        return {
          id: parsed.id,
          createdAt: parsed.createdAt,
          reason: parsed.reason,
          databaseTarget: parsed.databaseTarget,
        };
      } catch {
        return null;
      }
    }),
  );
}
