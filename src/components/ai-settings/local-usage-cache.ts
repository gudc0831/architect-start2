import {
  normalizeLocalCodexUsageSummary,
  type LocalCodexUsageSummary,
} from "@/components/ai-settings/usage-aggregation";

export type LocalScanRange = 30 | 90 | 0;

export type LocalUsageCacheStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const localUsageCachePrefix = "architect:ai-settings:local-usage:";
export const localUsageCacheTtlMs = 10 * 60 * 1000;

export function createLocalUsageCacheKey(range: LocalScanRange) {
  return `${localUsageCachePrefix}${range}`;
}

export function readLocalUsageCache(
  storage: LocalUsageCacheStorage,
  range: LocalScanRange,
  nowMs = Date.now(),
) {
  const key = createLocalUsageCacheKey(range);
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!isCacheEnvelope(parsed)) {
      removeLocalUsageCache(storage, key);
      return null;
    }

    const cachedAtMs = typeof parsed.cachedAt === "string" ? Date.parse(parsed.cachedAt) : NaN;
    if (!Number.isFinite(cachedAtMs) || nowMs - cachedAtMs > localUsageCacheTtlMs) {
      removeLocalUsageCache(storage, key);
      return null;
    }

    return normalizeLocalCodexUsageSummary(parsed.summary, range);
  } catch {
    removeLocalUsageCache(storage, key);
    return null;
  }
}

export function writeLocalUsageCache(
  storage: LocalUsageCacheStorage,
  range: LocalScanRange,
  summary: LocalCodexUsageSummary,
  now = new Date(),
) {
  try {
    storage.setItem(createLocalUsageCacheKey(range), JSON.stringify({ cachedAt: now.toISOString(), summary }));
    return true;
  } catch {
    return false;
  }
}

function isCacheEnvelope(value: unknown): value is { cachedAt?: unknown; summary?: unknown } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "cachedAt" in value && "summary" in value);
}

function removeLocalUsageCache(storage: LocalUsageCacheStorage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    return;
  }
}
