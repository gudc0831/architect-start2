import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type DataGuardMode = "strict" | "warn";

export const dataGuardRoot = join(process.cwd(), "output", "data-guard");
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
  await ensureParent(path);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function appendAuditEvent(event: Record<string, unknown>) {
  await ensureParent(dataGuardAuditLogPath);
  const record = {
    timestamp: new Date().toISOString(),
    ...event,
  };
  await writeFile(dataGuardAuditLogPath, `${JSON.stringify(record)}\n`, {
    encoding: "utf8",
    flag: "a",
  });
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
