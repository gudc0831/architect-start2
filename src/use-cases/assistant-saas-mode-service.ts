import { createHash } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type { AssistantDraftSummary, AssistantEvidence } from "@/domains/assistant/types";
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
import { badRequest, forbidden } from "@/lib/api/errors";
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

  const answer = buildDeterministicAnswer({
    taskLabel: retrieved.taskContext.issueId || retrieved.taskContext.taskId,
    question,
    instruction,
    evidence: retrieved.evidence,
  });
  const suggestedDraftSummary = buildSuggestedSummary({
    taskLabel: retrieved.taskContext.issueId || retrieved.taskContext.taskId,
    evidence: retrieved.evidence,
  });
  const outputTokens = Math.min(estimateTokens(`${answer}\n${JSON.stringify(suggestedDraftSummary)}`), policy.maxOutputTokens);
  const estimatedCostCents = estimateCostCents(inputTokens, outputTokens);
  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: retrieved.taskContext.taskId,
    profileId: user.id,
    executionMode: "saas-api",
    runtimeMode: "saas-api-foundation",
    provider: policy.provider,
    model: policy.model,
    inputTokens,
    outputTokens,
    estimatedCostCents,
    status: "success",
    policyDecision: "allowed",
    requestHash,
    metadata: {
      evidenceCount: retrieved.evidence.length,
      evidenceKinds: [...new Set(retrieved.evidence.map((item) => item.kind))],
      providerCall: "not_configured_foundation_response",
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
      estimatedCostCents,
    },
  });

  return {
    answer,
    suggestedDraftSummary,
    citations: retrieved.evidence.slice(0, 8).map((item) => ({
      sourceType: item.kind,
      sourceId: item.id,
      title: item.title,
    })),
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostCents,
    },
    executionMode: "saas-api",
    policyDecision: "allowed",
    policy: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
    },
  };
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

function buildDeterministicAnswer(input: {
  taskLabel: string;
  question: string;
  instruction: string;
  evidence: AssistantEvidence[];
}) {
  const primary = input.evidence[0];
  const external = input.evidence.find((item) => item.kind === "web_or_skill");
  const projectDocument = input.evidence.find((item) => item.kind === "project_document");

  return [
    `${input.taskLabel} task를 SaaS API Mode foundation으로 검토했습니다.`,
    `질문: ${input.question}`,
    `지침: ${input.instruction}`,
    primary ? `주요 근거: ${primary.title} - ${primary.excerpt}` : "주요 근거: 현재 연결된 근거가 부족합니다.",
    projectDocument ? `문서 근거 확인: ${projectDocument.title} - ${projectDocument.excerpt}` : null,
    external ? `외부 근거 확인: ${external.title} - ${external.excerpt}` : null,
    "의견: 이 응답은 실제 provider 호출 전 정책/사용량/감사 로그 검증용 deterministic 응답입니다. 공식 결론으로 반영하기 전 도면, 기준 문서, 담당자 협의를 확인하세요.",
    "후속 조치: 부족한 근거를 보강하고, 확인 책임자와 기한이 필요한 항목은 별도 follow-up task로 분리하세요.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildSuggestedSummary(input: { taskLabel: string; evidence: AssistantEvidence[] }): AssistantDraftSummary {
  const primary = input.evidence[0];

  return {
    conclusion: primary
      ? "SaaS API Mode foundation이 연결된 task/project 근거를 기준으로 후속 확인 필요 의견을 생성했습니다."
      : "근거 보강 후 SaaS API Mode assistant 재검토가 필요합니다.",
    tags: ["assistant", "saas-api", "건축검토"],
    scope: input.taskLabel,
    followUpAction: "근거 문서와 담당자 확인 후 task 기록에 반영하세요.",
  };
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function estimateCostCents(inputTokens: number, outputTokens: number) {
  if (inputTokens + outputTokens <= 0) {
    return 0;
  }

  return Math.max(1, Math.ceil((inputTokens + outputTokens * 3) / 1000));
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
