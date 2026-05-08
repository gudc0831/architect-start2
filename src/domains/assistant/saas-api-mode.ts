import type { AssistantDraftSummary, AssistantEvidence, AssistantEvidenceKind } from "@/domains/assistant/types";

export type AssistantPolicyScopeType = "project";
export type AssistantPolicyProvider = "mock" | "openai";
export type AssistantPolicyDecision =
  | "allowed"
  | "disabled"
  | "budget_exceeded"
  | "evidence_disallowed"
  | "unauthorized"
  | "rate_limited";
export type AssistantUsageStatus = "success" | "blocked" | "failed" | "cancelled";

export type AssistantRunPolicy = {
  id: string;
  scopeType: AssistantPolicyScopeType;
  projectId: string;
  enabled: boolean;
  provider: AssistantPolicyProvider;
  model: string;
  monthlyBudgetCents: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: AssistantEvidenceKind[];
  retentionDays: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantUsageEvent = {
  id: string;
  projectId: string;
  taskId: string | null;
  profileId: string;
  assistantRecordId: string | null;
  executionMode: "saas-api";
  runtimeMode: string;
  provider: AssistantPolicyProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  status: AssistantUsageStatus;
  policyDecision: AssistantPolicyDecision;
  requestHash: string | null;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AssistantAuditEvent = {
  id: string;
  projectId: string | null;
  profileId: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AssistantGenerateResult = {
  answer: string;
  suggestedDraftSummary: AssistantDraftSummary;
  citations: Array<{
    sourceType: AssistantEvidenceKind;
    sourceId: string;
    title: string;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
  executionMode: "saas-api";
  policyDecision: AssistantPolicyDecision;
  policy: Pick<AssistantRunPolicy, "enabled" | "provider" | "model" | "monthlyBudgetCents">;
};

export const ASSISTANT_EVIDENCE_KINDS: AssistantEvidenceKind[] = [
  "central_knowledge",
  "regulation",
  "task",
  "project_document",
  "web_or_skill",
];

export function defaultAssistantRunPolicy(input: {
  projectId: string;
  actorId?: string | null;
  now?: string;
}): AssistantRunPolicy {
  const timestamp = input.now ?? new Date().toISOString();

  return {
    id: `default:${input.projectId}`,
    scopeType: "project",
    projectId: input.projectId,
    enabled: false,
    provider: "mock",
    model: "deterministic-foundation",
    monthlyBudgetCents: 50000,
    maxInputTokens: 12000,
    maxOutputTokens: 2000,
    externalEvidenceAllowed: true,
    allowedEvidenceKinds: ASSISTANT_EVIDENCE_KINDS,
    retentionDays: 365,
    createdBy: input.actorId ?? null,
    updatedBy: input.actorId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isAssistantEvidenceKind(value: unknown): value is AssistantEvidenceKind {
  return ASSISTANT_EVIDENCE_KINDS.includes(value as AssistantEvidenceKind);
}

export function normalizeAllowedEvidenceKinds(value: unknown): AssistantEvidenceKind[] {
  if (!Array.isArray(value)) {
    return ASSISTANT_EVIDENCE_KINDS;
  }

  const kinds = value.filter(isAssistantEvidenceKind);
  return kinds.length ? [...new Set(kinds)] : ASSISTANT_EVIDENCE_KINDS;
}

export function summarizeEvidenceForPrompt(evidence: AssistantEvidence[]) {
  return evidence
    .slice(0, 10)
    .map((item, index) => `${index + 1}. [${item.kind}] ${item.title}: ${item.excerpt}`)
    .join("\n");
}
