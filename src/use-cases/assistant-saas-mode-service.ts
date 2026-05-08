import { createHash } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type { AssistantEvidence } from "@/domains/assistant/types";
import {
  defaultAssistantRunPolicy,
  normalizeAllowedEvidenceKinds,
  summarizeEvidenceForPrompt,
  type AssistantGenerateResult,
  type AssistantPolicyDecision,
  type AssistantPolicyProvider,
  type AssistantRunPolicy,
  type AssistantUsageEvent,
} from "@/domains/assistant/saas-api-mode";
import { badRequest, forbidden, serviceUnavailable } from "@/lib/api/errors";
import {
  AssistantProviderError,
  estimateCostCents,
  estimateTokens,
  runAssistantProvider,
} from "@/lib/assistant/saas-provider-adapter";
import { requireCurrentProjectAccess, requireProjectAccess } from "@/lib/auth/project-guards";
import { assistantRepository } from "@/repositories/assistant";
import { retrieveAssistantEvidence } from "@/use-cases/assistant-service";

type UpdateAssistantRunPolicyInput = {
  projectId?: unknown;
  enabled?: unknown;
  provider?: unknown;
  model?: unknown;
  monthlyBudgetCents?: unknown;
  maxInputTokens?: unknown;
  maxOutputTokens?: unknown;
  externalEvidenceAllowed?: unknown;
  allowedEvidenceKinds?: unknown;
  retentionDays?: unknown;
};

type GenerateAssistantInput = {
  taskId?: unknown;
  question?: unknown;
  instruction?: unknown;
};

export async function getAssistantRunPolicy(input: { projectId?: string | null }, user: AuthUser) {
  const projectId = await resolveProjectId(input.projectId, user);
  return getStoredOrDefaultPolicy(projectId);
}

export async function updateAssistantRunPolicy(input: UpdateAssistantRunPolicyInput, user: AuthUser) {
  const projectId = await resolveProjectId(normalizeOptionalText(input.projectId), user);
  const current = await getStoredOrDefaultPolicy(projectId);
  const policy = await assistantRepository.upsertRunPolicy({
    projectId,
    enabled: normalizeBoolean(input.enabled, current.enabled),
    provider: normalizeProvider(input.provider, current.provider),
    model: normalizeModel(input.model, current.model),
    monthlyBudgetCents: normalizePositiveInteger(input.monthlyBudgetCents, current.monthlyBudgetCents, 0, 100000000),
    maxInputTokens: normalizePositiveInteger(input.maxInputTokens, current.maxInputTokens, 100, 200000),
    maxOutputTokens: normalizePositiveInteger(input.maxOutputTokens, current.maxOutputTokens, 100, 20000),
    externalEvidenceAllowed: normalizeBoolean(input.externalEvidenceAllowed, current.externalEvidenceAllowed),
    allowedEvidenceKinds: normalizeAllowedEvidenceKinds(input.allowedEvidenceKinds ?? current.allowedEvidenceKinds),
    retentionDays: normalizePositiveInteger(input.retentionDays, current.retentionDays, 1, 3650),
    actorId: user.id,
  });

  await assistantRepository.createAuditEvent({
    projectId,
    profileId: user.id,
    eventType: "assistant.policy.updated",
    targetType: "assistant_run_policy",
    targetId: policy.id,
    metadata: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
      allowedEvidenceKinds: policy.allowedEvidenceKinds,
    },
  });

  return policy;
}

export async function getAssistantUsageSummary(input: { projectId?: string | null; month?: string | null }, user: AuthUser) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const events = await assistantRepository.listUsageEvents({ projectId, month });
  const successfulEvents = events.filter((event) => event.status === "success");
  const blockedEvents = events.filter((event) => event.status === "blocked");
  const failedEvents = events.filter((event) => event.status === "failed");

  return {
    projectId,
    month,
    requestCount: events.length,
    successCount: successfulEvents.length,
    blockedCount: blockedEvents.length,
    failedCount: failedEvents.length,
    inputTokens: sumBy(events, "inputTokens"),
    outputTokens: sumBy(events, "outputTokens"),
    estimatedCostCents: sumBy(successfulEvents, "estimatedCostCents"),
    events,
  };
}

export async function getAssistantAuditEvents(
  input: { projectId?: string | null; month?: string | null; limit?: string | null },
  user: AuthUser,
) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 100, 1, 500);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit });

  return { projectId, month, events };
}

export async function generateAssistantWithSaasApi(input: GenerateAssistantInput, user: AuthUser): Promise<AssistantGenerateResult> {
  const taskId = normalizeRequiredText(input.taskId, "taskId");
  const question = normalizeRequiredText(input.question, "question");
  const instruction = normalizeOptionalText(input.instruction) || "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변하세요.";
  const retrieved = await retrieveAssistantEvidence({ taskId, question });
  const policy = await getStoredOrDefaultPolicy(retrieved.taskContext.projectId);
  const promptText = buildPromptText({
    taskTitle: retrieved.taskContext.title,
    question,
    instruction,
    evidence: retrieved.evidence,
  });
  const inputTokens = estimateTokens(promptText);
  const requestHash = createRequestHash({
    taskId: retrieved.taskContext.taskId,
    question,
    instruction,
    evidenceIds: retrieved.evidence.map((item) => item.id),
  });

  await enforcePolicy({
    policy,
    taskId: retrieved.taskContext.taskId,
    profileId: user.id,
    evidence: retrieved.evidence,
    inputTokens,
    requestHash,
  });

  const taskLabel = retrieved.taskContext.issueId || retrieved.taskContext.taskId;
  const providerResult = await runProviderOrRecordFailure({
    policy,
    taskId: retrieved.taskContext.taskId,
    taskLabel,
    profileId: user.id,
    question,
    instruction,
    promptText,
    evidence: retrieved.evidence,
    inputTokens,
    requestHash,
  });

  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: retrieved.taskContext.taskId,
    profileId: user.id,
    executionMode: "saas-api",
    runtimeMode: providerResult.callMode === "live" ? "saas-api-live-provider" : "saas-api-mock-provider",
    provider: policy.provider,
    model: policy.model,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    estimatedCostCents: providerResult.estimatedCostCents,
    status: "success",
    policyDecision: "allowed",
    requestHash,
    metadata: {
      evidenceCount: retrieved.evidence.length,
      evidenceKinds: [...new Set(retrieved.evidence.map((item) => item.kind))],
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      ...providerResult.metadata,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: policy.projectId,
    profileId: user.id,
    eventType: "assistant.generate.success",
    targetType: "task",
    targetId: retrieved.taskContext.taskId,
    metadata: {
      executionMode: "saas-api",
      requestHash,
      evidenceCount: retrieved.evidence.length,
      provider: policy.provider,
      model: policy.model,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
  });

  return {
    answer: providerResult.answer,
    suggestedDraftSummary: providerResult.suggestedDraftSummary,
    citations: retrieved.evidence.slice(0, 8).map((item) => ({
      sourceType: item.kind,
      sourceId: item.id,
      title: item.title,
    })),
    usage: {
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
    executionMode: "saas-api",
    policyDecision: "allowed",
    policy: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
    },
    provider: {
      provider: policy.provider,
      model: policy.model,
      callMode: providerResult.callMode,
      requestId: providerResult.providerRequestId,
    },
  };
}

async function runProviderOrRecordFailure(input: {
  policy: AssistantRunPolicy;
  taskId: string;
  taskLabel: string;
  profileId: string;
  question: string;
  instruction: string;
  promptText: string;
  evidence: AssistantEvidence[];
  inputTokens: number;
  requestHash: string;
}) {
  try {
    return await runAssistantProvider({
      policy: input.policy,
      taskLabel: input.taskLabel,
      question: input.question,
      instruction: input.instruction,
      promptText: input.promptText,
      evidence: input.evidence,
      estimatedInputTokens: input.inputTokens,
      requestHash: input.requestHash,
    });
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      await recordFailedUsage(input, error);
      throw serviceUnavailable(error.message, error.code);
    }

    throw error;
  }
}

async function enforcePolicy(input: {
  policy: AssistantRunPolicy;
  taskId: string;
  profileId: string;
  evidence: AssistantEvidence[];
  inputTokens: number;
  requestHash: string;
}) {
  if (!input.policy.enabled) {
    await recordBlockedUsage(input, "disabled", "ASSISTANT_SAAS_API_DISABLED", "SaaS API Mode is disabled for this project.");
    throw forbidden("SaaS API Mode is disabled for this project.", "ASSISTANT_SAAS_API_DISABLED");
  }

  if (input.inputTokens > input.policy.maxInputTokens) {
    await recordBlockedUsage(input, "rate_limited", "ASSISTANT_INPUT_TOKEN_LIMIT_EXCEEDED", "Input token estimate exceeds policy.");
    throw forbidden("Input token estimate exceeds SaaS API Mode policy.", "ASSISTANT_INPUT_TOKEN_LIMIT_EXCEEDED");
  }

  if (!input.policy.externalEvidenceAllowed && input.evidence.some((item) => item.kind === "web_or_skill")) {
    await recordBlockedUsage(input, "evidence_disallowed", "ASSISTANT_EXTERNAL_EVIDENCE_DISABLED", "External evidence is disabled.");
    throw forbidden("External evidence is disabled for SaaS API Mode.", "ASSISTANT_EXTERNAL_EVIDENCE_DISABLED");
  }

  const disallowed = input.evidence.find((item) => !input.policy.allowedEvidenceKinds.includes(item.kind));
  if (disallowed) {
    await recordBlockedUsage(
      input,
      "evidence_disallowed",
      "ASSISTANT_EVIDENCE_KIND_DISALLOWED",
      `Evidence kind ${disallowed.kind} is not allowed.`,
    );
    throw forbidden(`Evidence kind ${disallowed.kind} is not allowed for SaaS API Mode.`, "ASSISTANT_EVIDENCE_KIND_DISALLOWED");
  }

  const month = normalizeMonth(null);
  const usage = await assistantRepository.listUsageEvents({ projectId: input.policy.projectId, month });
  const spentCents = usage
    .filter((event) => event.status === "success")
    .reduce((total, event) => total + event.estimatedCostCents, 0);
  const projectedCostCents = estimateCostCents(input.inputTokens, Math.min(800, input.policy.maxOutputTokens));
  if (spentCents + projectedCostCents > input.policy.monthlyBudgetCents) {
    await recordBlockedUsage(input, "budget_exceeded", "ASSISTANT_BUDGET_EXCEEDED", "Monthly assistant budget would be exceeded.");
    throw forbidden("Monthly SaaS API Mode budget would be exceeded.", "ASSISTANT_BUDGET_EXCEEDED");
  }
}

async function recordBlockedUsage(
  input: {
    policy: AssistantRunPolicy;
    taskId: string;
    profileId: string;
    evidence: AssistantEvidence[];
    inputTokens: number;
    requestHash: string;
  },
  policyDecision: AssistantPolicyDecision,
  errorCode: string,
  reason: string,
) {
  await assistantRepository.createUsageEvent({
    projectId: input.policy.projectId,
    taskId: input.taskId,
    profileId: input.profileId,
    executionMode: "saas-api",
    runtimeMode: "saas-api-foundation",
    provider: input.policy.provider,
    model: input.policy.model,
    inputTokens: input.inputTokens,
    outputTokens: 0,
    estimatedCostCents: 0,
    status: "blocked",
    policyDecision,
    requestHash: input.requestHash,
    errorCode,
    metadata: {
      reason,
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.policy.projectId,
    profileId: input.profileId,
    eventType: "assistant.generate.blocked",
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      policyDecision,
      errorCode,
      reason,
      requestHash: input.requestHash,
    },
  });
}

async function recordFailedUsage(
  input: {
    policy: AssistantRunPolicy;
    taskId: string;
    profileId: string;
    evidence: AssistantEvidence[];
    inputTokens: number;
    requestHash: string;
  },
  error: AssistantProviderError,
) {
  await assistantRepository.createUsageEvent({
    projectId: input.policy.projectId,
    taskId: input.taskId,
    profileId: input.profileId,
    executionMode: "saas-api",
    runtimeMode: "saas-api-provider-failed",
    provider: input.policy.provider,
    model: input.policy.model,
    inputTokens: input.inputTokens,
    outputTokens: 0,
    estimatedCostCents: 0,
    status: "failed",
    policyDecision: "allowed",
    requestHash: input.requestHash,
    errorCode: error.code,
    metadata: {
      reason: error.message,
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
      ...error.metadata,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.policy.projectId,
    profileId: input.profileId,
    eventType: "assistant.generate.failed",
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      errorCode: error.code,
      reason: error.message,
      requestHash: input.requestHash,
      ...error.metadata,
    },
  });
}

async function getStoredOrDefaultPolicy(projectId: string) {
  return (await assistantRepository.getRunPolicy(projectId)) ?? defaultAssistantRunPolicy({ projectId });
}

async function resolveProjectId(projectId: string | null | undefined, user: AuthUser) {
  if (projectId) {
    const context = await requireProjectAccess(projectId, user);
    return context.project.id;
  }

  const context = await requireCurrentProjectAccess(user);
  return context.project.id;
}

function buildPromptText(input: { taskTitle: string; question: string; instruction: string; evidence: AssistantEvidence[] }) {
  return [
    `Task: ${input.taskTitle}`,
    `Question: ${input.question}`,
    `Instruction: ${input.instruction}`,
    "Evidence:",
    summarizeEvidenceForPrompt(input.evidence),
  ].join("\n");
}

function createRequestHash(input: { taskId: string; question: string; instruction: string; evidenceIds: string[] }) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProvider(value: unknown, fallback: AssistantPolicyProvider): AssistantPolicyProvider {
  return value === "openai" || value === "mock" ? value : fallback;
}

function normalizeModel(value: unknown, fallback: string) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.slice(0, 120) : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeMonth(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (normalized) {
    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      throw badRequest("month must be YYYY-MM", "ASSISTANT_USAGE_MONTH_INVALID");
    }

    return normalized;
  }

  return new Date().toISOString().slice(0, 7);
}

function normalizeRequiredText(value: unknown, fieldName: string) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sumBy(events: AssistantUsageEvent[], key: "inputTokens" | "outputTokens" | "estimatedCostCents") {
  return events.reduce((total, event) => total + event[key], 0);
}
