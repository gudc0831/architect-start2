import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantRecordMetadata,
  ApprovedKnowledgeItem,
  AssistantCandidateState,
  AssistantRecord,
  AssistantWorkSummaryDraft,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";
import type { CreateExternalEvidenceInput, ExternalEvidenceRecord } from "@/domains/assistant/external-evidence";
import type {
  AssistantAuditEvent,
  AssistantPolicyDecision,
  AssistantPolicyProvider,
  AssistantRunPolicy,
  AssistantUsageEvent,
  AssistantUsageStatus,
} from "@/domains/assistant/saas-api-mode";

export type CreateAssistantRecordInput = {
  projectId: string;
  taskId: string;
  profileId: string;
  question: string;
  answer: string;
  evidence: AssistantEvidence[];
  confidenceScore: number;
  confidenceReason: string;
  executionMode: AssistantExecutionMode;
  runtimeMode: string;
  draftSummary: AssistantDraftSummary | null;
  metadata?: AssistantRecordMetadata;
  cleanupState?: AssistantRecord["cleanupState"];
  candidateState?: AssistantCandidateState;
};

export type SaveAssistantWorkSummaryDraftInput = {
  projectId: string;
  taskId: string;
  recordId: string;
  profileId: string;
  conclusion: string;
  tags: string[];
  scope: string;
  followUpAction: string;
  status: "draft" | "approved" | "deferred";
};

export type ReviewKnowledgeCandidateInput =
  | {
      action: "approve";
      recordId: string;
      reviewerId: string;
      title: string;
      summary: string;
      bodyMarkdown: string;
      tags: string[];
      scope: KnowledgePublicationScope;
    }
  | {
      action: "reject";
      recordId: string;
      reviewerId: string;
      rejectionReason: string;
    };

export type UpsertAssistantRunPolicyInput = {
  projectId: string;
  enabled: boolean;
  provider: AssistantPolicyProvider;
  model: string;
  monthlyBudgetCents: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: AssistantRunPolicy["allowedEvidenceKinds"];
  retentionDays: number;
  actorId: string | null;
};

export type CreateAssistantUsageEventInput = {
  projectId: string;
  taskId?: string | null;
  profileId: string;
  assistantRecordId?: string | null;
  executionMode: "saas-api";
  runtimeMode: string;
  provider: AssistantPolicyProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  status: AssistantUsageStatus;
  policyDecision: AssistantPolicyDecision;
  requestHash?: string | null;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type ListAssistantUsageEventsInput = {
  projectId: string;
  month?: string;
};

export type ListAssistantAuditEventsInput = {
  projectId?: string | null;
  month?: string;
  limit?: number;
  eventTypes?: string[];
  targetType?: string;
};

export type CreateAssistantAuditEventInput = {
  projectId?: string | null;
  profileId?: string | null;
  eventType: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export type DeleteAssistantAuditEventsByIdsInput = {
  projectId: string;
  ids: string[];
};

export type DeleteAssistantAuditEventsByIdsResult = {
  deletedIds: string[];
  skippedIds: string[];
};

export interface AssistantRepository {
  listRecordsByTask(taskId: string): Promise<AssistantRecord[]>;
  listExternalEvidenceByTask(taskId: string): Promise<ExternalEvidenceRecord[]>;
  listKnowledgeCandidateRecords(input?: { states?: AssistantCandidateState[] }): Promise<AssistantRecord[]>;
  findRecordById(recordId: string): Promise<AssistantRecord | null>;
  findWorkSummaryDraftByRecordId(recordId: string): Promise<AssistantWorkSummaryDraft | null>;
  createRecord(input: CreateAssistantRecordInput): Promise<AssistantRecord>;
  createExternalEvidence(input: CreateExternalEvidenceInput): Promise<ExternalEvidenceRecord>;
  saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput): Promise<AssistantWorkSummaryDraft>;
  reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput): Promise<{
    record: AssistantRecord;
    approvedKnowledgeItem: ApprovedKnowledgeItem | null;
  }>;
  getRunPolicy(projectId: string): Promise<AssistantRunPolicy | null>;
  upsertRunPolicy(input: UpsertAssistantRunPolicyInput): Promise<AssistantRunPolicy>;
  createUsageEvent(input: CreateAssistantUsageEventInput): Promise<AssistantUsageEvent>;
  listUsageEvents(input: ListAssistantUsageEventsInput): Promise<AssistantUsageEvent[]>;
  createAuditEvent(input: CreateAssistantAuditEventInput): Promise<AssistantAuditEvent>;
  listAuditEvents(input: ListAssistantAuditEventsInput): Promise<AssistantAuditEvent[]>;
  deleteAuditEventsByIds(input: DeleteAssistantAuditEventsByIdsInput): Promise<DeleteAssistantAuditEventsByIdsResult>;
}
