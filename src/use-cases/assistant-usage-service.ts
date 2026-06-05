import type { AssistantUsageEvent, MyAssistantUsageSummary } from "@/domains/assistant/saas-api-mode";
import type { AuthUser } from "@/domains/auth/types";
import { badRequest, forbidden } from "@/lib/api/errors";
import { taskRepository } from "@/repositories";
import { assistantRepository } from "@/repositories/assistant";

type UsageGranularity = MyAssistantUsageSummary["range"]["granularity"];

type LocalCodexUsageInput = {
  projectId: string;
  taskId?: string | null;
  profileId: string;
  assistantRecordId?: string | null;
  runtimeMode: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  status?: "success" | "failed" | "cancelled";
  metadata?: Record<string, unknown>;
};

const MAX_LOCAL_CODEX_USAGE_TOKENS = 10_000_000;

export async function getMyAssistantUsageSummary(
  input: { range?: string | null; granularity?: string | null },
  user: AuthUser,
): Promise<MyAssistantUsageSummary> {
  const to = new Date();
  const from = resolveRangeStart(input.range, to);
  const granularity = normalizeGranularity(input.granularity);
  const events = await assistantRepository.listUsageEventsForProfile({
    profileId: user.id,
    from: from.toISOString(),
    to: to.toISOString(),
    limit: 1000,
  });

  return buildMyAssistantUsageSummary({
    events,
    from: from.toISOString(),
    to: to.toISOString(),
    granularity,
  });
}

export async function createLocalCodexUsageEvent(input: LocalCodexUsageInput) {
  const taskId = normalizeRequiredShortId(input.taskId, "taskId");
  const assistantRecordId = normalizeRequiredShortId(input.assistantRecordId, "assistantRecordId");
  const [task, record] = await Promise.all([
    taskRepository.findTaskById(taskId),
    assistantRepository.findRecordById(assistantRecordId),
  ]);

  if (!task || task.projectId !== input.projectId) {
    throw forbidden("Assistant usage task is not available in the selected project", "ASSISTANT_USAGE_TASK_FORBIDDEN");
  }

  if (
    !record ||
    record.projectId !== input.projectId ||
    record.taskId !== task.id ||
    record.profileId !== input.profileId ||
    record.executionMode !== "local-chatgpt-codex"
  ) {
    throw forbidden("Assistant usage record is not available for this profile", "ASSISTANT_USAGE_RECORD_FORBIDDEN");
  }

  return assistantRepository.createUsageEvent({
    projectId: input.projectId,
    taskId,
    profileId: input.profileId,
    assistantRecordId,
    executionMode: "local-chatgpt-codex",
    runtimeMode: normalizeShortText(input.runtimeMode, "extension-native-bridge-in-page"),
    provider: "local-codex",
    model: normalizeShortText(input.model, "gpt-5-codex"),
    inputTokens: normalizeInputTokenCount(input.inputTokens, "inputTokens"),
    outputTokens: normalizeInputTokenCount(input.outputTokens, "outputTokens"),
    estimatedCostCents: 0,
    status: normalizeLocalUsageStatus(input.status),
    policyDecision: "allowed",
    requestHash: null,
    errorCode: null,
    metadata: sanitizeUsageMetadata(input.metadata ?? {}),
  });
}

export function buildMyAssistantUsageSummary(input: {
  events: AssistantUsageEvent[];
  from: string;
  to: string;
  granularity: UsageGranularity;
}): MyAssistantUsageSummary {
  const buckets = new Map<string, MyAssistantUsageSummary["buckets"][number]>();

  for (const event of input.events) {
    const bucket = bucketKey(event.createdAt, input.granularity);
    const current =
      buckets.get(bucket) ??
      ({
        bucket,
        serviceInputTokens: 0,
        serviceOutputTokens: 0,
        serviceTotalTokens: 0,
        serviceRunCount: 0,
        failedRunCount: 0,
        workflowCounts: {},
      } satisfies MyAssistantUsageSummary["buckets"][number]);
    const inputTokens = normalizeTokenCount(event.inputTokens);
    const outputTokens = normalizeTokenCount(event.outputTokens);

    current.serviceInputTokens += inputTokens;
    current.serviceOutputTokens += outputTokens;
    current.serviceTotalTokens += inputTokens + outputTokens;
    current.serviceRunCount += 1;
    if (event.status === "failed" || event.status === "blocked") {
      current.failedRunCount += 1;
    }

    const workflow = normalizeWorkflow(event.metadata.workflow);
    current.workflowCounts[workflow] = (current.workflowCounts[workflow] ?? 0) + 1;
    buckets.set(bucket, current);
  }

  const orderedBuckets = [...buckets.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));

  return {
    range: {
      from: input.from,
      to: input.to,
      granularity: input.granularity,
    },
    totals: {
      serviceInputTokens: sumBuckets(orderedBuckets, "serviceInputTokens"),
      serviceOutputTokens: sumBuckets(orderedBuckets, "serviceOutputTokens"),
      serviceTotalTokens: sumBuckets(orderedBuckets, "serviceTotalTokens"),
      serviceRunCount: sumBuckets(orderedBuckets, "serviceRunCount"),
      failedRunCount: sumBuckets(orderedBuckets, "failedRunCount"),
    },
    buckets: orderedBuckets,
    metadataOnly: true,
  };
}

function resolveRangeStart(range: string | null | undefined, now: Date) {
  const normalized = range === "7d" || range === "30d" || range === "90d" ? range : "30d";
  const days = Number.parseInt(normalized, 10);
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - days);
  return from;
}

function normalizeGranularity(value: string | null | undefined): UsageGranularity {
  if (value === "week" || value === "month") {
    return value;
  }
  return "day";
}

function bucketKey(value: string, granularity: UsageGranularity) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("Invalid usage event timestamp", "ASSISTANT_USAGE_TIMESTAMP_INVALID");
  }

  if (granularity === "month") {
    return date.toISOString().slice(0, 7);
  }

  if (granularity === "week") {
    const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = weekStart.getUTCDay() || 7;
    weekStart.setUTCDate(weekStart.getUTCDate() - day + 1);
    return weekStart.toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
}

function normalizeTokenCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeInputTokenCount(value: number | null | undefined, fieldName: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  const normalized = Math.floor(value);
  if (normalized > MAX_LOCAL_CODEX_USAGE_TOKENS) {
    throw badRequest(`${fieldName} exceeds local usage token limit`, "ASSISTANT_USAGE_TOKEN_LIMIT_EXCEEDED");
  }

  return normalized;
}

function normalizeRequiredShortId(value: string | null | undefined, fieldName: string) {
  if (typeof value !== "string") {
    throw badRequest(`${fieldName} is required`, "ASSISTANT_USAGE_ID_REQUIRED");
  }

  const normalized = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(normalized)) {
    throw badRequest(`${fieldName} is invalid`, "ASSISTANT_USAGE_ID_INVALID");
  }

  return normalized;
}

function normalizeLocalUsageStatus(value: unknown): "success" | "failed" | "cancelled" {
  return value === "failed" || value === "cancelled" ? value : "success";
}

function normalizeShortText(value: string, fallback: string) {
  const trimmed = value.trim();
  return /^[A-Za-z0-9._:-]{1,80}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeWorkflow(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,80}$/.test(value) ? value : "unknown";
}

function sanitizeUsageMetadata(metadata: Record<string, unknown>) {
  return {
    workflow: normalizeWorkflow(metadata.workflow),
    architectRunId: typeof metadata.architectRunId === "string" ? metadata.architectRunId.slice(0, 80) : undefined,
    usageAvailable: typeof metadata.usageAvailable === "boolean" ? metadata.usageAvailable : undefined,
    bridgeSchemaVersion:
      typeof metadata.bridgeSchemaVersion === "number" && Number.isFinite(metadata.bridgeSchemaVersion)
        ? Math.floor(metadata.bridgeSchemaVersion)
        : undefined,
  };
}

function sumBuckets<T extends keyof MyAssistantUsageSummary["buckets"][number]>(
  buckets: MyAssistantUsageSummary["buckets"],
  key: T,
) {
  return buckets.reduce((sum, bucket) => {
    const value = bucket[key];
    return typeof value === "number" ? sum + value : sum;
  }, 0);
}
