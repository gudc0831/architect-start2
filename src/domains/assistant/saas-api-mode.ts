import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantEvidenceKind,
  AssistantLegalEvidenceMetadata,
  AssistantTaskContext,
} from "@/domains/assistant/types";

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
export type AssistantProviderCallMode = "mock" | "live";

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

export type AssistantActionAuditAction = "task_update_applied" | "follow_up_task_created";

export type AssistantActionAuditSummary = {
  conclusion: string;
  scope: string;
  followUpAction: string;
  tags: string[];
};

export type AssistantActionAuditRecord = {
  id: string;
  action: AssistantActionAuditAction;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  createdTaskId: string | null;
  assistantRecordId: string;
  summary: AssistantActionAuditSummary | null;
  statusFrom: string | null;
  statusTo: string | null;
  decisionMarker: string | null;
  createdBy: string | null;
  createdAt: string;
};

export type AssistantEvidenceReadinessWarning = {
  code: string;
  message: string;
};

export type AssistantRetrievedEvidenceSnapshot = {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  unavailableEvidenceKinds: string[];
  evidenceReadinessWarnings: AssistantEvidenceReadinessWarning[];
  conversationMemory: string;
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
  provider: {
    provider: AssistantPolicyProvider;
    model: string;
    callMode: AssistantProviderCallMode;
    requestId: string | null;
  };
  retrieval: AssistantRetrievedEvidenceSnapshot;
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
    .map((item, index) => {
      const legalMetadata = summarizeLegalEvidenceForPrompt(item);
      return [
        `${index + 1}. [${item.kind}] ${item.title}: ${item.excerpt}`,
        legalMetadata,
      ].filter(Boolean).join("\n");
    })
    .join("\n");
}

function summarizeLegalEvidenceForPrompt(item: AssistantEvidence) {
  if (!item.legal) {
    return "";
  }

  const metadata = [
    `source kind: ${item.legal.sourceKind}`,
    `authority rank: ${item.legal.authorityRank}`,
    summarizeLegalEffectiveForPrompt(item.legal.effective),
    item.sourceUrl ? `source URL: ${item.sourceUrl}` : "",
    item.legal.locator ? `source locator: ${JSON.stringify(item.legal.locator)}` : "",
    item.legal.stale ? "stale: true" : "stale: false",
    item.legal.legalChangeWarnings.length > 0
      ? `legal change warnings: ${item.legal.legalChangeWarnings.join(", ")}`
      : "",
    item.legal.confidenceReason ? `confidence reason: ${item.legal.confidenceReason}` : "",
  ].filter(Boolean);

  return metadata.length ? `   Legal metadata: ${metadata.join("; ")}` : "";
}

function summarizeLegalEffectiveForPrompt(effective: AssistantLegalEvidenceMetadata["effective"] | undefined) {
  if (!effective) {
    return "";
  }
  if (effective.effectiveFrom && effective.effectiveTo) {
    return `effective: ${effective.effectiveFrom} to ${effective.effectiveTo}`;
  }
  if (effective.effectiveFrom) {
    return `effective: from ${effective.effectiveFrom}`;
  }
  if (effective.effectiveTo) {
    return `effective: until ${effective.effectiveTo}`;
  }
  return effective.promulgatedAt ? `promulgated at: ${effective.promulgatedAt}` : "";
}

export function buildAssistantPromptText(input: {
  taskTitle: string;
  question: string;
  instruction: string;
  conversationMemory?: string;
  evidence: AssistantEvidence[];
  evidenceReadinessWarnings?: AssistantEvidenceReadinessWarning[];
}) {
  return [
    `Task: ${input.taskTitle}`,
    `Question: ${input.question}`,
    `Instruction: ${input.instruction}`,
    summarizeConversationMemoryForPrompt(input.conversationMemory),
    "Evidence:",
    summarizeEvidenceForPrompt(input.evidence),
    summarizeEvidenceReadinessWarningsForPrompt(input.evidenceReadinessWarnings),
  ].filter((section) => section.length > 0).join("\n");
}

function summarizeConversationMemoryForPrompt(conversationMemory: string | undefined) {
  const normalized = conversationMemory?.trim() ?? "";
  if (!normalized) {
    return "";
  }

  return ["Conversation memory:", normalized].join("\n");
}

function summarizeEvidenceReadinessWarningsForPrompt(warnings: AssistantEvidenceReadinessWarning[] | undefined) {
  if (!warnings?.length) {
    return "";
  }

  return [
    "Evidence readiness warnings:",
    ...warnings.slice(0, 8).map((warning, index) => `${index + 1}. [${warning.code}] ${warning.message}`),
  ].join("\n");
}
