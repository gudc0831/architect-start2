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

type CloudBackupTables = Record<string, unknown[]>;

type CloudBackupTableSpec = {
  schemaName: "public" | "storage";
  tableName: string;
  backupKey: string;
  orderBy: string;
};

export const CLOUD_BACKUP_TABLE_SPECS = [
  { schemaName: "public", tableName: "profiles", backupKey: "profiles", orderBy: "row_data.created_at asc" },
  { schemaName: "public", tableName: "projects", backupKey: "projects", orderBy: "row_data.created_at asc" },
  { schemaName: "public", tableName: "tasks", backupKey: "tasks", orderBy: "row_data.created_at asc, row_data.task_number asc" },
  { schemaName: "public", tableName: "files", backupKey: "files", orderBy: "row_data.created_at asc, row_data.version asc" },
  { schemaName: "public", tableName: "profile_preferences", backupKey: "preferences", orderBy: "row_data.profile_id asc" },
  { schemaName: "public", tableName: "foundation_settings", backupKey: "foundationSettings", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "project_memberships", backupKey: "projectMemberships", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "project_invitations", backupKey: "projectInvitations", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "access_requests", backupKey: "accessRequests", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "edit_leases", backupKey: "editLeases", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "work_type_definitions", backupKey: "workTypeDefinitions", orderBy: "row_data.created_at asc, row_data.sort_order asc, row_data.id asc" },
  { schemaName: "public", tableName: "assistant_task_records", backupKey: "assistantTaskRecords", orderBy: "row_data.created_at asc, row_data.id asc" },
  {
    schemaName: "public",
    tableName: "assistant_work_summary_drafts",
    backupKey: "assistantWorkSummaryDrafts",
    orderBy: "row_data.created_at asc, row_data.id asc",
  },
  { schemaName: "public", tableName: "assistant_run_policies", backupKey: "assistantRunPolicies", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "assistant_usage_events", backupKey: "assistantUsageEvents", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "assistant_audit_events", backupKey: "assistantAuditEvents", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "file_analysis_chunks", backupKey: "fileAnalysisChunks", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "storage", tableName: "buckets", backupKey: "storageBuckets", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "storage", tableName: "objects", backupKey: "storageObjects", orderBy: "row_data.created_at asc, row_data.name asc" },
] satisfies CloudBackupTableSpec[];

export const CLOUD_RESTORE_LIMITATION =
  "Cloud backups are JSON coverage snapshots for inspection and emergency manual recovery planning. Automated cloud restore is not implemented; npm run data:restore restores local snapshots only.";

function tableIdentifier(spec: CloudBackupTableSpec) {
  return `${spec.schemaName}.${spec.tableName}`;
}

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

function normalizeJsonRows(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  }

  return [];
}

async function readBackupTableRows(schemaName: string, tableName: string, orderBy: string) {
  const { Pool } = await import("pg");
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for cloud backup");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });

  try {
    const result = await pool.query(
      `select coalesce(jsonb_agg(to_jsonb(row_data) order by ${orderBy}), '[]'::jsonb) as rows from (select * from "${schemaName}"."${tableName}") row_data`,
    );
    return normalizeJsonRows(result.rows[0]?.rows);
  } finally {
    await pool.end();
  }
}

async function readCloudBackupTables() {
  const tables: CloudBackupTables = Object.fromEntries(CLOUD_BACKUP_TABLE_SPECS.map((spec) => [spec.backupKey, []]));
  const tableCounts: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};

  for (const spec of CLOUD_BACKUP_TABLE_SPECS) {
    const identifier = tableIdentifier(spec);
    try {
      const rows = await readBackupTableRows(spec.schemaName, spec.tableName, spec.orderBy);
      tables[spec.backupKey] = rows;
      tableCounts[identifier] = rows.length;
    } catch (error) {
      tableErrors[identifier] = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    tables,
    tableCounts,
    tableErrors,
  };
}

async function getRowCounts(): Promise<CloudCounts> {
  const prisma = await getPrisma();
  const profiles = await prisma.profile.count();
  const projects = await prisma.project.count();
  const tasks = await prisma.task.count();
  const files = await prisma.file.count();
  const preferences = await prisma.profilePreference.count();

  return { profiles, projects, tasks, files, preferences };
}

async function disconnectPrisma() {
  try {
    const prisma = await getPrisma();
    await prisma.$disconnect();
  } catch {
    // Best effort: fallback row counts should still run if Prisma cleanup fails.
  }
}

async function getRowCountsViaPg(): Promise<CloudCounts> {
  const { Pool } = await import("pg");
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for cloud row count fallback");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });
  const tableSpecs = [
    ["profiles", "profiles"],
    ["projects", "projects"],
    ["tasks", "tasks"],
    ["files", "files"],
    ["preferences", "profile_preferences"],
  ] as const;

  try {
    const entries: Array<readonly [keyof CloudCounts, number]> = [];
    for (const [key, tableName] of tableSpecs) {
      const result = await pool.query<{ count: number }>(`select count(*)::int as count from "public"."${tableName}"`);
      entries.push([key, Number(result.rows[0]?.count ?? 0)] as const);
    }
    return Object.fromEntries(entries) as CloudCounts;
  } finally {
    await pool.end();
  }
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
    const prismaError = error instanceof Error ? error.message : String(error);
    await disconnectPrisma();
    try {
      rowCounts = await getRowCountsViaPg();
      rowCountError = `Prisma row count failed; pg fallback counts used. Prisma error: ${prismaError}`;
    } catch (fallbackError) {
      const pgError = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      rowCountError = `Prisma row count failed: ${prismaError}; pg fallback failed: ${pgError}`;
    }
  }

  const isNonEmpty = rowCounts ? Object.values(rowCounts).some((count) => count > 0) : Boolean(rowCountError);
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

  let tables: CloudBackupTables | null = null;
  let backupError: string | null = null;
  let tableCounts: Record<string, number> = {};
  let tableErrors: Record<string, string> = {};

  try {
    const backup = await readCloudBackupTables();
    tables = backup.tables;
    tableCounts = backup.tableCounts;
    tableErrors = backup.tableErrors;
    if (Object.keys(tableErrors).length > 0) {
      backupError = JSON.stringify(tableErrors);
    }
  } catch (error) {
    backupError = error instanceof Error ? error.message : String(error);
  }

  const expectedTables = CLOUD_BACKUP_TABLE_SPECS.map(tableIdentifier);
  const failedTables = Object.keys(tableErrors);
  const succeededTables = expectedTables.filter((tableName) => !failedTables.includes(tableName));

  const payload = {
    id: backupId,
    createdAt: new Date().toISOString(),
    reason,
    databaseTarget: summary.databaseTarget,
    databaseFingerprint: summary.databaseFingerprint,
    rowCounts: summary.rowCounts,
    rowCountError: summary.rowCountError,
    backupError,
    tableCounts,
    tableErrors,
    backupCoverage: {
      expectedTables,
      succeededTables,
      failedTables,
    },
    cloudRestoreLimitation: CLOUD_RESTORE_LIMITATION,
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
          tableCounts: parsed.tableCounts ?? null,
          tableErrors: parsed.tableErrors ?? null,
          backupCoverage: parsed.backupCoverage ?? null,
        };
      } catch {
        return null;
      }
    }),
  );
}
