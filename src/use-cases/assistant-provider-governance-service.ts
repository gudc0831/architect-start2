import type { AssistantEvidence } from "@/domains/assistant/types";
import {
  defaultAssistantRunPolicy,
  type AssistantPolicyDecision,
  type AssistantRunPolicy,
} from "@/domains/assistant/saas-api-mode";
import { forbidden, serviceUnavailable } from "@/lib/api/errors";
import {
  AssistantProviderError,
  estimateCostCents,
  estimateTokens,
  runAssistantProvider,
  type AssistantProviderResult,
} from "@/lib/assistant/saas-provider-adapter";
import { assistantRepository } from "@/repositories/assistant";

type GovernedProviderInput = {
  projectId: string;
  taskId: string;
  profileId: string;
  taskLabel: string;
  question: string;
  instruction: string;
  promptText: string;
  evidence: AssistantEvidence[];
  requestHash: string;
  runtimeMode: string;
  auditEventType: string;
  metadata?: Record<string, unknown>;
  estimatedInputTokens?: number;
};

type ProviderPolicyContext = {
  policy: AssistantRunPolicy;
  taskId: string;
  profileId: string;
  evidence: AssistantEvidence[];
  inputTokens: number;
  requestHash: string;
  metadata?: Record<string, unknown>;
};

export async function runAssistantProviderWithSaasGovernance(
  input: GovernedProviderInput,
): Promise<{ policy: AssistantRunPolicy; providerResult: AssistantProviderResult; inputTokens: number }> {
  const policy = await getStoredOrDefaultPolicy(input.projectId);
  const inputTokens = input.estimatedInputTokens ?? estimateTokens(input.promptText);
  const policyContext = {
    policy,
    taskId: input.taskId,
    profileId: input.profileId,
    evidence: input.evidence,
    inputTokens,
    requestHash: input.requestHash,
    metadata: input.metadata,
  };

  await enforcePolicy(policyContext);

  const providerResult = await runProviderOrRecordFailure({
    ...policyContext,
    taskLabel: input.taskLabel,
    question: input.question,
    instruction: input.instruction,
    promptText: input.promptText,
  });

  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: input.taskId,
    profileId: input.profileId,
    executionMode: "saas-api",
    runtimeMode: input.runtimeMode,
    provider: policy.provider,
    model: policy.model,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    estimatedCostCents: providerResult.estimatedCostCents,
    status: "success",
    policyDecision: "allowed",
    requestHash: input.requestHash,
    metadata: {
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      ...input.metadata,
      ...providerResult.metadata,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: policy.projectId,
    profileId: input.profileId,
    eventType: input.auditEventType,
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      executionMode: "saas-api",
      requestHash: input.requestHash,
      evidenceCount: input.evidence.length,
      provider: policy.provider,
      model: policy.model,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      estimatedCostCents: providerResult.estimatedCostCents,
      ...input.metadata,
    },
  });

  return { policy, providerResult, inputTokens };
}

async function runProviderOrRecordFailure(
  input: ProviderPolicyContext & {
    taskLabel: string;
    question: string;
    instruction: string;
    promptText: string;
  },
) {
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

async function enforcePolicy(input: ProviderPolicyContext) {
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
  input: ProviderPolicyContext,
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
      ...input.metadata,
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
      ...input.metadata,
    },
  });
}

async function recordFailedUsage(input: ProviderPolicyContext, error: AssistantProviderError) {
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
      ...input.metadata,
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
      ...input.metadata,
      ...error.metadata,
    },
  });
}

async function getStoredOrDefaultPolicy(projectId: string) {
  return (await assistantRepository.getRunPolicy(projectId)) ?? defaultAssistantRunPolicy({ projectId });
}

function normalizeMonth(value: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 7);
  }
  return /^\d{4}-\d{2}$/.test(value) ? value : new Date().toISOString().slice(0, 7);
}
