import { loadEnvConfig } from "@next/env";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
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
type StorageObjectCopy = {
  storageBucket: string;
  objectPath: string;
  backupFile: string;
  sizeBytes: number;
  sha256: string;
  databaseMetadataSizeBytes: number | null;
};

type CloudDatabaseSnapshot = {
  consistencyMode: "repeatable-read-read-only";
  fixedConnection: true;
  snapshotToken: string;
  transactionStartedAt: string;
  transactionCompletedAt: string;
  status: "committed" | "rolled-back";
};

type CloudDatabaseDumpArtifact = {
  format: "postgresql-custom";
  backupFile: "database.dump";
  sizeBytes: number;
  sha256: string;
  databaseFingerprint: string;
  snapshotToken: string;
  pgDumpExecutable: string;
  pgDumpVersion: string;
  includedSchemas: ["public", "storage"];
  noOwner: true;
  noPrivileges: true;
};

type CloudStorageConsistencyBoundary = {
  atomicWithDatabase: false;
  objectListPinnedAtDatabaseSnapshot: true;
  bytesPointInTimeGuaranteed: false;
  captureStartedAt: string;
  captureCompletedAt: string;
  limitation: string;
};

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
  { schemaName: "public", tableName: "task_user_orders", backupKey: "taskUserOrders", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "task_cell_documents", backupKey: "taskCellDocuments", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "task_cell_updates", backupKey: "taskCellUpdates", orderBy: "row_data.created_at asc, row_data.id asc" },
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
  { schemaName: "public", tableName: "assistant_threads", backupKey: "assistantThreads", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "assistant_thread_messages", backupKey: "assistantThreadMessages", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "knowledge_discovery_requests", backupKey: "knowledgeDiscoveryRequests", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "knowledge_import_previews", backupKey: "knowledgeImportPreviews", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "knowledge_import_rubrics", backupKey: "knowledgeImportRubrics", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "knowledge_items", backupKey: "knowledgeItems", orderBy: "row_data.created_at asc, row_data.id asc" },
  {
    schemaName: "public",
    tableName: "knowledge_item_versions",
    backupKey: "knowledgeItemVersions",
    orderBy: "row_data.created_at asc, row_data.version asc, row_data.id asc",
  },
  {
    schemaName: "public",
    tableName: "knowledge_source_references",
    backupKey: "knowledgeSourceReferences",
    orderBy: "row_data.created_at asc, row_data.id asc",
  },
  {
    schemaName: "public",
    tableName: "knowledge_generation_profiles",
    backupKey: "knowledgeGenerationProfiles",
    orderBy: "row_data.created_at asc, row_data.name asc, row_data.version asc",
  },
  {
    schemaName: "public",
    tableName: "knowledge_generation_runs",
    backupKey: "knowledgeGenerationRuns",
    orderBy: "row_data.created_at asc, row_data.id asc",
  },
  { schemaName: "public", tableName: "file_analysis_chunks", backupKey: "fileAnalysisChunks", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "project_wiki_items", backupKey: "projectWikiItems", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "project_wiki_action_logs", backupKey: "projectWikiActionLogs", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "public", tableName: "project_upload_source", backupKey: "projectUploadSources", orderBy: "row_data.created_at asc, row_data.source_id asc" },
  { schemaName: "public", tableName: "project_upload_version", backupKey: "projectUploadVersions", orderBy: "row_data.created_at asc, row_data.version_id asc" },
  { schemaName: "public", tableName: "upload_reference", backupKey: "uploadReferences", orderBy: "row_data.created_at asc, row_data.upload_id asc" },
  { schemaName: "public", tableName: "project_upload_chunk", backupKey: "projectUploadChunks", orderBy: "row_data.created_at asc, row_data.chunk_id asc" },
  { schemaName: "public", tableName: "chunk_location", backupKey: "chunkLocations", orderBy: "row_data.chunk_id asc" },
  { schemaName: "public", tableName: "review_corpus_trace", backupKey: "reviewCorpusTraces", orderBy: "row_data.searched_at asc, row_data.trace_id asc" },
  { schemaName: "storage", tableName: "buckets", backupKey: "storageBuckets", orderBy: "row_data.created_at asc, row_data.id asc" },
  { schemaName: "storage", tableName: "objects", backupKey: "storageObjects", orderBy: "row_data.created_at asc, row_data.name asc" },
] satisfies CloudBackupTableSpec[];

export const CLOUD_RESTORE_LIMITATION =
  "Cloud database tables and the PostgreSQL custom dump are captured from one exported repeatable-read, read-only snapshot. Storage object membership is pinned by that database snapshot, but Storage bytes are copied after the database transaction and are not transactionally atomic with it. Database-only pg_restore requires explicit --apply, --database-only, --ack-storage-boundary, and backup-specific --confirm flags; full database-plus-Storage apply remains unsupported.";

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
    const target = `${parsed.protocol}//${parsed.username || "anonymous"}@${parsed.hostname}:${parsed.port || "default"}${parsed.pathname}`;
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

async function createPostgresDumpArtifact(input: {
  backupDir: string;
  snapshotToken: string;
  databaseFingerprint: string;
}) {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for pg_dump");
  }

  const pgDumpExecutable = process.env.PG_DUMP_PATH?.trim() || "pg_dump";
  const backupFile = "database.dump" as const;
  const artifactPath = join(input.backupDir, backupFile);
  const childEnvironment = {
    ...process.env,
    DATABASE_URL: undefined,
    PGDATABASE: databaseUrl,
  };
  const versionResult = spawnSync(pgDumpExecutable, ["--version"], {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });
  if (versionResult.error || versionResult.status !== 0) {
    throw new Error(
      `pg_dump is unavailable. Set PG_DUMP_PATH to a compatible PostgreSQL client executable. ${
        versionResult.error?.message || versionResult.stderr || ""
      }`.trim(),
    );
  }

  const result = spawnSync(
    pgDumpExecutable,
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--schema=public",
      "--schema=storage",
      `--snapshot=${input.snapshotToken}`,
      `--file=${artifactPath}`,
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment,
      encoding: "utf8",
      shell: false,
      stdio: "pipe",
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `pg_dump failed while using the exported backup snapshot. ${
        result.error?.message || result.stderr || result.stdout || ""
      }`.trim(),
    );
  }

  const bytes = await readFile(artifactPath);
  const artifactStat = await stat(artifactPath);
  if (!artifactStat.isFile() || bytes.byteLength === 0) {
    throw new Error("pg_dump did not create a non-empty custom-format artifact.");
  }

  return {
    format: "postgresql-custom",
    backupFile,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    databaseFingerprint: input.databaseFingerprint,
    snapshotToken: input.snapshotToken,
    pgDumpExecutable: basename(pgDumpExecutable),
    pgDumpVersion: String(versionResult.stdout || versionResult.stderr).trim(),
    includedSchemas: ["public", "storage"],
    noOwner: true,
    noPrivileges: true,
  } satisfies CloudDatabaseDumpArtifact;
}

async function readCloudBackupTables(backupDir: string, databaseFingerprint: string) {
  const { Pool } = await import("pg");
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for cloud backup");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
  });
  const client = await pool.connect();
  const tables: CloudBackupTables = Object.fromEntries(CLOUD_BACKUP_TABLE_SPECS.map((spec) => [spec.backupKey, []]));
  const tableCounts: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};
  const transactionStartedAt = new Date().toISOString();
  let snapshotToken = "";
  let transactionCompletedAt = transactionStartedAt;
  let status: CloudDatabaseSnapshot["status"] = "rolled-back";
  let databaseDumpArtifact: CloudDatabaseDumpArtifact | null = null;

  try {
    await client.query("begin transaction isolation level repeatable read read only");
    const snapshotResult = await client.query<{ snapshot_token: string }>(
      "select pg_export_snapshot()::text as snapshot_token",
    );
    snapshotToken = String(snapshotResult.rows[0]?.snapshot_token ?? "").trim();
    if (!snapshotToken) {
      throw new Error("PostgreSQL did not export a repeatable-read snapshot token.");
    }

    for (let index = 0; index < CLOUD_BACKUP_TABLE_SPECS.length; index += 1) {
      const spec = CLOUD_BACKUP_TABLE_SPECS[index];
      const identifier = tableIdentifier(spec);
      try {
        const result = await client.query(
          `select coalesce(jsonb_agg(to_jsonb(row_data) order by ${spec.orderBy}), '[]'::jsonb) as rows from (select * from "${spec.schemaName}"."${spec.tableName}") row_data`,
        );
        const rows = normalizeJsonRows(result.rows[0]?.rows);
        tables[spec.backupKey] = rows;
        tableCounts[identifier] = rows.length;
      } catch (error) {
        tableErrors[identifier] = error instanceof Error ? error.message : String(error);
        for (const remaining of CLOUD_BACKUP_TABLE_SPECS.slice(index + 1)) {
          tableErrors[tableIdentifier(remaining)] =
            "Not read because the fixed repeatable-read backup transaction was aborted by an earlier table failure.";
        }
        break;
      }
    }

    if (Object.keys(tableErrors).length === 0) {
      databaseDumpArtifact = await createPostgresDumpArtifact({
        backupDir,
        snapshotToken,
        databaseFingerprint,
      });
    }

    if (Object.keys(tableErrors).length > 0) {
      await client.query("rollback");
      status = "rolled-back";
    } else {
      await client.query("commit");
      status = "committed";
    }
    transactionCompletedAt = new Date().toISOString();
  } finally {
    if (transactionCompletedAt === transactionStartedAt) {
      await client.query("rollback").catch(() => undefined);
      transactionCompletedAt = new Date().toISOString();
    }
    client.release();
    await pool.end();
  }

  return {
    tables,
    tableCounts,
    tableErrors,
    databaseDumpArtifact,
    databaseSnapshot: {
      consistencyMode: "repeatable-read-read-only",
      fixedConnection: true,
      snapshotToken,
      transactionStartedAt,
      transactionCompletedAt,
      status,
    } satisfies CloudDatabaseSnapshot,
  };
}

async function copyCloudStorageObjects(backupDir: string, tables: CloudBackupTables | null) {
  const captureStartedAt = new Date().toISOString();
  const rows = Array.isArray(tables?.storageObjects) ? tables.storageObjects : [];
  const copies: StorageObjectCopy[] = [];
  const errors: Record<string, string> = {};
  if (rows.length === 0) {
    return {
      copies,
      errors,
      boundary: buildStorageConsistencyBoundary(captureStartedAt),
    };
  }

  const { storageProvider } = await import("../../src/storage");
  await ensureDir(join(backupDir, "storage-objects"));
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] as Record<string, unknown>;
    const storageBucket = String(row.bucket_id ?? row.bucketId ?? "").trim();
    const objectPath = String(row.name ?? row.objectPath ?? "").trim();
    const databaseMetadataSizeBytes = readStorageObjectMetadataSize(row);
    const identifier = `${storageBucket}/${objectPath}`;
    if (!storageBucket || !objectPath) {
      errors[`storage-object-row-${index}`] = "storage object row is missing bucket_id or name";
      continue;
    }

    try {
      const bytes = await storageProvider.download({ storageBucket, objectPath });
      if (databaseMetadataSizeBytes !== null && bytes.byteLength !== databaseMetadataSizeBytes) {
        errors[identifier] =
          `Storage bytes changed across the database/storage capture boundary: database metadata size ${databaseMetadataSizeBytes}, downloaded ${bytes.byteLength}.`;
        continue;
      }
      const backupFile = `storage-objects/${String(index).padStart(8, "0")}.bin`;
      await writeFile(join(backupDir, backupFile), bytes, { mode: 0o600 });
      copies.push({
        storageBucket,
        objectPath,
        backupFile,
        sizeBytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        databaseMetadataSizeBytes,
      });
    } catch (error) {
      errors[identifier] = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    copies,
    errors,
    boundary: buildStorageConsistencyBoundary(captureStartedAt),
  };
}

function buildStorageConsistencyBoundary(captureStartedAt: string): CloudStorageConsistencyBoundary {
  return {
    atomicWithDatabase: false,
    objectListPinnedAtDatabaseSnapshot: true,
    bytesPointInTimeGuaranteed: false,
    captureStartedAt,
    captureCompletedAt: new Date().toISOString(),
    limitation:
      "Storage bytes are copied after the database snapshot transaction. Size is compared with storage.objects metadata when available, but an equal-size in-place object rewrite cannot be proven absent.",
  };
}

function readStorageObjectMetadataSize(row: Record<string, unknown>) {
  let metadata = row.metadata;
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata) as unknown;
    } catch {
      return null;
    }
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const size = Number((metadata as Record<string, unknown>).size);
  return Number.isInteger(size) && size >= 0 ? size : null;
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
  let databaseSnapshot: CloudDatabaseSnapshot | null = null;
  let databaseDumpArtifact: CloudDatabaseDumpArtifact | null = null;
  let storageObjectCopies: StorageObjectCopy[] = [];
  let storageObjectErrors: Record<string, string> = {};
  let storageConsistencyBoundary: CloudStorageConsistencyBoundary | null = null;

  try {
    const backup = await readCloudBackupTables(
      backupDir,
      summary.databaseFingerprint ?? "",
    );
    tables = backup.tables;
    tableCounts = backup.tableCounts;
    tableErrors = backup.tableErrors;
    databaseSnapshot = backup.databaseSnapshot;
    databaseDumpArtifact = backup.databaseDumpArtifact;
    if (Object.keys(tableErrors).length > 0) {
      backupError = JSON.stringify(tableErrors);
    }
    const storageBackup = await copyCloudStorageObjects(backupDir, tables);
    storageObjectCopies = storageBackup.copies;
    storageObjectErrors = storageBackup.errors;
    storageConsistencyBoundary = storageBackup.boundary;
    if (Object.keys(storageObjectErrors).length > 0) {
      backupError = JSON.stringify({
        tableErrors,
        storageObjectErrors,
      });
    }
  } catch (error) {
    backupError = error instanceof Error ? error.message : String(error);
  }

  const expectedTables = CLOUD_BACKUP_TABLE_SPECS.map(tableIdentifier);
  const failedTables = Object.keys(tableErrors);
  const succeededTables = expectedTables.filter((tableName) => !failedTables.includes(tableName));

  const payload = {
    backupFormatVersion: 2,
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
    databaseSnapshot,
    databaseDumpArtifact,
    storageObjectCopies,
    storageObjectErrors,
    storageConsistencyBoundary,
    backupCoverage: {
      expectedTables,
      succeededTables,
      failedTables,
    },
    cloudRestoreLimitation: CLOUD_RESTORE_LIMITATION,
    tables,
  };

  await writeJsonFile(join(backupDir, "backup.json"), payload);
  if (
    backupError ||
    failedTables.length > 0 ||
    succeededTables.length !== expectedTables.length ||
    Object.keys(storageObjectErrors).length > 0 ||
    databaseSnapshot?.status !== "committed" ||
    !databaseDumpArtifact ||
    !storageConsistencyBoundary ||
    !tables
  ) {
    await appendAuditEvent({
      action: "cloud.backup.failed",
      backupId,
      reason,
      databaseFingerprint: summary.databaseFingerprint,
      failedTables,
      failedStorageObjects: Object.keys(storageObjectErrors),
    });
    throw new Error(
      `Cloud backup ${backupId} is incomplete and the requested mutation was blocked. Failed tables: ${
        failedTables.length > 0 ? failedTables.join(", ") : "unknown"
      }`,
    );
  }

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

export async function inspectCloudBackupForRestore(backupId: string) {
  if (!/^cloud-[A-Za-z0-9._-]+$/.test(backupId)) {
    throw new Error("Cloud backup id is invalid.");
  }
  const root = resolve(cloudBackupsRoot);
  const backupDir = resolve(root, backupId);
  const relativePath = relative(root, backupDir);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error("Cloud backup path must stay under the cloud backup root.");
  }

  const raw = await readFile(join(backupDir, "backup.json"), "utf8");
  const backup = JSON.parse(raw) as {
    backupFormatVersion?: unknown;
    id?: unknown;
    databaseFingerprint?: unknown;
    backupError?: unknown;
    databaseSnapshot?: Partial<CloudDatabaseSnapshot>;
    databaseDumpArtifact?: Partial<CloudDatabaseDumpArtifact>;
    storageConsistencyBoundary?: Partial<CloudStorageConsistencyBoundary>;
    backupCoverage?: {
      succeededTables?: unknown;
      failedTables?: unknown;
    };
    tableCounts?: Record<string, unknown>;
    storageObjectCopies?: unknown;
    storageObjectErrors?: unknown;
  };
  if (backup.id !== backupId || backup.backupError) {
    throw new Error(`Cloud backup ${backupId} is incomplete.`);
  }
  if (backup.backupFormatVersion !== 2) {
    throw new Error(`Cloud backup ${backupId} does not contain the required v2 restore manifest.`);
  }

  const expectedTables = CLOUD_BACKUP_TABLE_SPECS.map(tableIdentifier);
  const succeededTables = Array.isArray(backup.backupCoverage?.succeededTables)
    ? backup.backupCoverage.succeededTables.map(String)
    : [];
  const failedTables = Array.isArray(backup.backupCoverage?.failedTables)
    ? backup.backupCoverage.failedTables.map(String)
    : [];
  if (
    failedTables.length > 0 ||
    succeededTables.length !== expectedTables.length ||
    !expectedTables.every((table) => succeededTables.includes(table))
  ) {
    throw new Error(`Cloud backup ${backupId} does not match the current backup manifest.`);
  }

  const summary = await getCloudGuardSummary();
  if (
    !summary.configured ||
    !summary.databaseFingerprint ||
    backup.databaseFingerprint !== summary.databaseFingerprint
  ) {
    throw new Error("Cloud backup target fingerprint does not match the configured database.");
  }

  const databaseSnapshot = backup.databaseSnapshot;
  if (
    databaseSnapshot?.consistencyMode !== "repeatable-read-read-only" ||
    databaseSnapshot.fixedConnection !== true ||
    databaseSnapshot.status !== "committed" ||
    typeof databaseSnapshot.snapshotToken !== "string" ||
    !databaseSnapshot.snapshotToken ||
    !isValidIsoTimestamp(databaseSnapshot.transactionStartedAt) ||
    !isValidIsoTimestamp(databaseSnapshot.transactionCompletedAt) ||
    new Date(databaseSnapshot.transactionCompletedAt).getTime() <
      new Date(databaseSnapshot.transactionStartedAt).getTime()
  ) {
    throw new Error(`Cloud backup ${backupId} has an invalid database snapshot boundary.`);
  }

  const databaseDumpArtifact = backup.databaseDumpArtifact;
  if (
    databaseDumpArtifact?.format !== "postgresql-custom" ||
    databaseDumpArtifact.backupFile !== "database.dump" ||
    databaseDumpArtifact.databaseFingerprint !== summary.databaseFingerprint ||
    databaseDumpArtifact.snapshotToken !== databaseSnapshot.snapshotToken ||
    databaseDumpArtifact.noOwner !== true ||
    databaseDumpArtifact.noPrivileges !== true ||
    !Array.isArray(databaseDumpArtifact.includedSchemas) ||
    databaseDumpArtifact.includedSchemas.join(",") !== "public,storage" ||
    !Number.isInteger(databaseDumpArtifact.sizeBytes) ||
    Number(databaseDumpArtifact.sizeBytes) <= 0 ||
    typeof databaseDumpArtifact.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(databaseDumpArtifact.sha256)
  ) {
    throw new Error(`Cloud backup ${backupId} has an invalid PostgreSQL dump manifest.`);
  }
  const databaseDumpPath = resolve(backupDir, databaseDumpArtifact.backupFile);
  const databaseDumpRelativePath = relative(backupDir, databaseDumpPath);
  if (
    !databaseDumpRelativePath ||
    databaseDumpRelativePath.startsWith("..") ||
    databaseDumpRelativePath.includes(":")
  ) {
    throw new Error("Cloud database dump path is invalid.");
  }
  const databaseDumpBytes = await readFile(databaseDumpPath);
  if (
    databaseDumpBytes.byteLength !== databaseDumpArtifact.sizeBytes ||
    createHash("sha256").update(databaseDumpBytes).digest("hex") !==
      databaseDumpArtifact.sha256
  ) {
    throw new Error("Cloud database dump checksum failed.");
  }

  const storageBoundary = backup.storageConsistencyBoundary;
  if (
    storageBoundary?.atomicWithDatabase !== false ||
    storageBoundary.objectListPinnedAtDatabaseSnapshot !== true ||
    storageBoundary.bytesPointInTimeGuaranteed !== false ||
    !isValidIsoTimestamp(storageBoundary.captureStartedAt) ||
    !isValidIsoTimestamp(storageBoundary.captureCompletedAt) ||
    new Date(storageBoundary.captureCompletedAt).getTime() <
      new Date(storageBoundary.captureStartedAt).getTime() ||
    typeof storageBoundary.limitation !== "string" ||
    !storageBoundary.limitation
  ) {
    throw new Error(`Cloud backup ${backupId} has an invalid Storage consistency boundary.`);
  }

  const copies = Array.isArray(backup.storageObjectCopies)
    ? (backup.storageObjectCopies as StorageObjectCopy[])
    : [];
  const expectedStorageObjectCount = Number(backup.tableCounts?.["storage.objects"] ?? 0);
  if (!Number.isInteger(expectedStorageObjectCount) || expectedStorageObjectCount !== copies.length) {
    throw new Error(
      `Cloud storage byte coverage mismatch: expected ${expectedStorageObjectCount}, found ${copies.length}.`,
    );
  }
  for (const copy of copies) {
    const filePath = resolve(backupDir, copy.backupFile);
    const copyRelativePath = relative(backupDir, filePath);
    if (!copyRelativePath || copyRelativePath.startsWith("..") || copyRelativePath.includes(":")) {
      throw new Error(`Cloud storage backup path is invalid: ${copy.backupFile}`);
    }
    const bytes = await readFile(filePath);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (bytes.byteLength !== copy.sizeBytes || checksum !== copy.sha256) {
      throw new Error(`Cloud storage backup checksum failed: ${copy.storageBucket}/${copy.objectPath}`);
    }
    if (
      copy.databaseMetadataSizeBytes !== null &&
      copy.databaseMetadataSizeBytes !== copy.sizeBytes
    ) {
      throw new Error(
        `Cloud storage metadata size mismatch: ${copy.storageBucket}/${copy.objectPath}`,
      );
    }
  }
  if (
    backup.storageObjectErrors &&
    typeof backup.storageObjectErrors === "object" &&
    Object.keys(backup.storageObjectErrors).length > 0
  ) {
    throw new Error(`Cloud backup ${backupId} contains storage object errors.`);
  }

  return {
    backupId,
    databaseFingerprint: summary.databaseFingerprint,
    expectedTableCount: expectedTables.length,
    storageObjectCount: copies.length,
    databaseDump: {
      backupFile: databaseDumpArtifact.backupFile,
      sizeBytes: databaseDumpArtifact.sizeBytes,
      sha256: databaseDumpArtifact.sha256,
      pgDumpVersion: databaseDumpArtifact.pgDumpVersion,
    },
    storageConsistencyBoundary: storageBoundary,
    requiredConfirmation: buildCloudRestoreConfirmation(
      backupId,
      summary.databaseFingerprint,
    ),
    applySupported: "database-only",
  };
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function buildCloudRestoreConfirmation(backupId: string, databaseFingerprint: string) {
  return `RESTORE:${backupId}:${databaseFingerprint.slice(0, 12)}`;
}

export async function applyCloudDatabaseRestore(input: {
  backupId: string;
  confirmation: string;
  acknowledgeStorageBoundary: boolean;
}) {
  const report = await inspectCloudBackupForRestore(input.backupId);
  if (!input.acknowledgeStorageBoundary) {
    throw new Error(
      "Database-only cloud restore requires --ack-storage-boundary because Storage bytes are not restored atomically.",
    );
  }
  if (input.confirmation !== report.requiredConfirmation) {
    throw new Error(
      `Cloud restore confirmation mismatch. Re-run the dry-run and pass --confirm=${report.requiredConfirmation}.`,
    );
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for pg_restore.");
  }
  const pgRestoreExecutable = process.env.PG_RESTORE_PATH?.trim() || "pg_restore";
  const backupDir = resolve(cloudBackupsRoot, input.backupId);
  const dumpPath = resolve(backupDir, report.databaseDump.backupFile);
  const childEnvironment = {
    ...process.env,
    DATABASE_URL: undefined,
    PGDATABASE: databaseUrl,
  };
  const versionResult = spawnSync(pgRestoreExecutable, ["--version"], {
    cwd: process.cwd(),
    env: childEnvironment,
    encoding: "utf8",
    shell: false,
    stdio: "pipe",
  });
  if (versionResult.error || versionResult.status !== 0) {
    throw new Error(
      `pg_restore is unavailable. Set PG_RESTORE_PATH to a compatible PostgreSQL client executable. ${
        versionResult.error?.message || versionResult.stderr || ""
      }`.trim(),
    );
  }

  await appendAuditEvent({
    action: "cloud.restore.database.started",
    backupId: input.backupId,
    databaseFingerprint: report.databaseFingerprint,
  });
  const result = spawnSync(
    pgRestoreExecutable,
    [
      "--exit-on-error",
      "--single-transaction",
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      dumpPath,
    ],
    {
      cwd: process.cwd(),
      env: childEnvironment,
      encoding: "utf8",
      shell: false,
      stdio: "pipe",
    },
  );
  if (result.error || result.status !== 0) {
    await appendAuditEvent({
      action: "cloud.restore.database.failed",
      backupId: input.backupId,
      databaseFingerprint: report.databaseFingerprint,
      status: result.status ?? null,
    });
    throw new Error(
      `pg_restore failed and PostgreSQL rolled back the single transaction. ${
        result.error?.message || result.stderr || result.stdout || ""
      }`.trim(),
    );
  }

  await appendAuditEvent({
    action: "cloud.restore.database.completed",
    backupId: input.backupId,
    databaseFingerprint: report.databaseFingerprint,
    pgRestoreVersion: String(versionResult.stdout || versionResult.stderr).trim(),
  });
  return {
    backupId: input.backupId,
    databaseFingerprint: report.databaseFingerprint,
    databaseRestored: true,
    storageRestored: false,
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
          backupFormatVersion: parsed.backupFormatVersion ?? null,
          databaseSnapshot: parsed.databaseSnapshot ?? null,
          databaseDumpArtifact: parsed.databaseDumpArtifact ?? null,
          storageObjectCopyCount: Array.isArray(parsed.storageObjectCopies)
            ? parsed.storageObjectCopies.length
            : null,
          storageObjectErrors: parsed.storageObjectErrors ?? null,
          storageConsistencyBoundary: parsed.storageConsistencyBoundary ?? null,
          backupCoverage: parsed.backupCoverage ?? null,
        };
      } catch {
        return null;
      }
    }),
  );
}
