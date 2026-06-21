import type { MyAssistantUsageBucket, MyAssistantUsageSummary } from "@/domains/assistant/saas-api-mode";

export type LocalCodexUsageBucket = {
  bucket: string;
  directInputTokens: number;
  directOutputTokens: number;
  directTotalTokens: number;
  directEntryCount: number;
  uncertainInputTokens: number;
  uncertainOutputTokens: number;
  uncertainTotalTokens: number;
  uncertainEntryCount: number;
};

export type LocalCodexUsageSummary = {
  schemaVersion: number;
  scannedAt: string;
  rangeDays: 30 | 90 | 0;
  status: "available" | "partial" | "unavailable";
  direct: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    entryCount: number;
  };
  uncertain: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    entryCount: number;
  };
  buckets: LocalCodexUsageBucket[];
  scanDurationMs?: number;
};

export type CombinedUsageBucket = {
  bucket: string;
  serviceTotalTokens: number;
  localDirectTotalTokens: number;
  localUncertainTotalTokens: number;
  combinedCertainTotalTokens: number;
  serviceRunCount: number;
  localDirectEntryCount: number;
  localUncertainEntryCount: number;
};

export type CombinedUsageMetrics = {
  serviceTotalTokens: number;
  localDirectTotalTokens: number;
  localUncertainTotalTokens: number;
  combinedCertainTotalTokens: number;
  serviceRunCount: number;
  localDirectEntryCount: number;
  localUncertainEntryCount: number;
  buckets: CombinedUsageBucket[];
};

export function buildCombinedUsageMetrics(
  serviceSummary: MyAssistantUsageSummary | null,
  localSummary: LocalCodexUsageSummary | null,
): CombinedUsageMetrics {
  const serviceBuckets = new Map<string, MyAssistantUsageBucket>();
  const localBuckets = new Map<string, LocalCodexUsageBucket>();

  for (const bucket of serviceSummary?.buckets ?? []) {
    serviceBuckets.set(bucket.bucket, bucket);
  }

  for (const bucket of localSummary?.buckets ?? []) {
    localBuckets.set(bucket.bucket, bucket);
  }

  const keys = [...new Set([...serviceBuckets.keys(), ...localBuckets.keys()])].sort();
  const buckets = keys.map((bucket) => {
    const service = serviceBuckets.get(bucket);
    const local = localBuckets.get(bucket);
    const serviceTotalTokens = normalizeCount(service?.serviceTotalTokens);
    const localDirectTotalTokens = normalizeCount(local?.directTotalTokens);
    const localUncertainTotalTokens = normalizeCount(local?.uncertainTotalTokens);
    return {
      bucket,
      serviceTotalTokens,
      localDirectTotalTokens,
      localUncertainTotalTokens,
      combinedCertainTotalTokens: serviceTotalTokens + localDirectTotalTokens,
      serviceRunCount: normalizeCount(service?.serviceRunCount),
      localDirectEntryCount: normalizeCount(local?.directEntryCount),
      localUncertainEntryCount: normalizeCount(local?.uncertainEntryCount),
    } satisfies CombinedUsageBucket;
  });

  const serviceTotalTokens = normalizeCount(serviceSummary?.totals.serviceTotalTokens);
  const localDirectTotalTokens = normalizeCount(localSummary?.direct.totalTokens);
  const localUncertainTotalTokens = normalizeCount(localSummary?.uncertain.totalTokens);

  return {
    serviceTotalTokens,
    localDirectTotalTokens,
    localUncertainTotalTokens,
    combinedCertainTotalTokens: serviceTotalTokens + localDirectTotalTokens,
    serviceRunCount: normalizeCount(serviceSummary?.totals.serviceRunCount),
    localDirectEntryCount: normalizeCount(localSummary?.direct.entryCount),
    localUncertainEntryCount: normalizeCount(localSummary?.uncertain.entryCount),
    buckets,
  };
}

export function normalizeLocalCodexUsageSummary(value: unknown, fallbackRangeDays: 30 | 90 | 0): LocalCodexUsageSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const bucketsValue = Array.isArray(record.buckets)
    ? record.buckets
    : Array.isArray(record.byDay)
      ? record.byDay
      : [];
  const buckets = bucketsValue.map(normalizeLocalBucket).filter((bucket): bucket is LocalCodexUsageBucket => Boolean(bucket));
  const direct = normalizeUsageTotal(record.direct);
  const uncertain = normalizeUsageTotal(record.uncertain);

  return {
    schemaVersion: normalizeCount(record.schemaVersion ?? record.bridgeSchemaVersion) || 1,
    scannedAt: typeof record.scannedAt === "string" ? record.scannedAt : new Date().toISOString(),
    rangeDays: normalizeRangeDays(record.rangeDays, fallbackRangeDays),
    status: record.status === "partial" || record.status === "unavailable" ? record.status : "available",
    direct: {
      ...direct,
      totalTokens: direct.totalTokens || direct.inputTokens + direct.outputTokens,
    },
    uncertain: {
      ...uncertain,
      totalTokens: uncertain.totalTokens || uncertain.inputTokens + uncertain.outputTokens,
    },
    buckets,
    scanDurationMs: typeof record.scanDurationMs === "number" ? Math.max(0, Math.floor(record.scanDurationMs)) : undefined,
  };
}

function normalizeLocalBucket(value: unknown): LocalCodexUsageBucket | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const bucket = typeof record.bucket === "string" ? record.bucket : typeof record.date === "string" ? record.date : "";
  if (!bucket) {
    return null;
  }

  const directInputTokens = normalizeCount(record.directInputTokens);
  const directOutputTokens = normalizeCount(record.directOutputTokens);
  const uncertainInputTokens = normalizeCount(record.uncertainInputTokens);
  const uncertainOutputTokens = normalizeCount(record.uncertainOutputTokens);

  return {
    bucket,
    directInputTokens,
    directOutputTokens,
    directTotalTokens: normalizeCount(record.directTotalTokens) || directInputTokens + directOutputTokens,
    directEntryCount: normalizeCount(record.directEntryCount ?? record.entryCount),
    uncertainInputTokens,
    uncertainOutputTokens,
    uncertainTotalTokens: normalizeCount(record.uncertainTotalTokens) || uncertainInputTokens + uncertainOutputTokens,
    uncertainEntryCount: normalizeCount(record.uncertainEntryCount),
  };
}

function normalizeUsageTotal(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0, entryCount: 0 };
  }

  const record = value as Record<string, unknown>;
  return {
    inputTokens: normalizeCount(record.inputTokens),
    outputTokens: normalizeCount(record.outputTokens),
    totalTokens: normalizeCount(record.totalTokens),
    entryCount: normalizeCount(record.entryCount),
  };
}

function normalizeRangeDays(value: unknown, fallback: 30 | 90 | 0): 30 | 90 | 0 {
  if (value === 30 || value === 90 || value === 0) {
    return value;
  }
  return fallback;
}

function normalizeCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}
