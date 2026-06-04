import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { localDataRoot } from "@/lib/runtime-config";

export type DataGuardMode = "strict" | "warn";

export const dataGuardRoot = join(localDataRoot, "data-guard");
export const localGuardStatePath = join(dataGuardRoot, "local-state.json");
export const cloudGuardStatePath = join(dataGuardRoot, "cloud-state.json");
export const dataGuardAuditLogPath = join(dataGuardRoot, "audit.log");
export const localSnapshotsRoot = join(dataGuardRoot, "local-snapshots");
export const cloudBackupsRoot = join(dataGuardRoot, "cloud-backups");
export const localQuarantineRoot = join(dataGuardRoot, "quarantine");

export async function pathExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureParent(path: string) {
  await mkdir(dirname(path), { recursive: true });
}

export async function ensureDir(path: string) {
  await mkdir(path, { recursive: true });
}

export function getDataGuardMode(): DataGuardMode {
  return process.env.DATA_GUARD_MODE?.trim() === "warn" ? "warn" : "strict";
}

export function safeSnapshotId(prefix: string) {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

export function hashValue(input: string) {
  return createHash("sha1").update(input).digest("hex");
}

export function readConfirmationToken() {
  return process.env.DATA_GUARD_CONFIRM?.trim() || "";
}

export async function writeJsonFile(path: string, value: unknown) {
  const targetPath = resolveDataGuardPath(path);
  await ensureParent(targetPath);
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

export async function appendAuditEvent(event: Record<string, unknown>) {
  const auditPath = resolveDataGuardPath(dataGuardAuditLogPath);
  await ensureParent(auditPath);
  const record = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  await writeFile(auditPath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    flag: "a",
    mode: 0o600,
  });
}

function resolveDataGuardPath(path: string) {
  const root = resolve(dataGuardRoot);
  const target = resolve(path);
  const relativePath = relative(root, target);
  if (relativePath.startsWith("..") || relativePath.includes(":")) {
    throw new Error("Data guard write path must stay under the data guard root.");
  }
  return target;
}

export async function listDirectories(path: string) {
  if (!(await pathExists(path))) {
    return [];
  }

  const entries = await readdir(path, { withFileTypes: true });
  const directories = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => ({
        name: entry.name,
        path: join(path, entry.name),
        mtimeMs: (await stat(join(path, entry.name))).mtimeMs,
      })),
  );

  return directories.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

export function sanitizeFileSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "-");
}
