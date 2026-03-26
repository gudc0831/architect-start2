import { readFile } from "node:fs/promises";
import type { DataGuardMode } from "@/lib/data-guard/shared";
import { localGuardStatePath } from "@/lib/data-guard/shared";

type StoredWriteLock = {
  reasonCode?: string | null;
  message?: string | null;
  recommendedCommand?: string | null;
};

type StoredLocalGuardState = {
  lastSnapshotId?: string | null;
  writeLock?: StoredWriteLock | null;
};

export type LocalWriteProtectionSummary = {
  locked: boolean;
  reasonCode: string | null;
  message: string | null;
  lastSnapshotId: string | null;
  recommendedCommand: string;
  guardMode: DataGuardMode;
};

function getGuardMode(): DataGuardMode {
  return process.env.DATA_GUARD_MODE?.trim() === "warn" ? "warn" : "strict";
}

export async function inspectLocalWriteProtectionSummary(): Promise<LocalWriteProtectionSummary> {
  const guardMode = getGuardMode();

  try {
    const raw = await readFile(localGuardStatePath, "utf8");
    const state = JSON.parse(raw) as StoredLocalGuardState;
    const writeLock = state.writeLock ?? null;

    return {
      locked: Boolean(writeLock),
      reasonCode: writeLock?.reasonCode ?? null,
      message: writeLock?.message ?? null,
      lastSnapshotId: state.lastSnapshotId ?? null,
      recommendedCommand: writeLock?.recommendedCommand ?? "npm run data:doctor",
      guardMode,
    };
  } catch {
    return {
      locked: false,
      reasonCode: null,
      message: null,
      lastSnapshotId: null,
      recommendedCommand: "npm run data:doctor",
      guardMode,
    };
  }
}