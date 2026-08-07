import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantRecordMetadata,
  ProjectWikiReviewState,
  ApprovedKnowledgeItem,
  AssistantCandidateState,
  AssistantRecord,
  AssistantThread,
  AssistantThreadMessage,
  AssistantThreadMessageRole,
  AssistantThreadSummaryProvenance,
  AssistantWorkSummaryDraft,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";
import type { CreateExternalEvidenceInput, ExternalEvidenceRecord } from "@/domains/assistant/external-evidence";
import type { StructuredKnowledgeDraft } from "@/domains/knowledge/structured-knowledge";
import type {
  AssistantAuditEvent,
  AssistantPolicyDecision,
  AssistantPolicyProvider,
  AssistantRunPolicy,
  AssistantUsageEvent,
  AssistantUsageExecutionMode,
  AssistantUsageProvider,
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

export type CreateAssistantThreadInput = {
  projectId: string;
  taskId?: string | null;
  profileId: string;
  title: string;
  summary?: string;
  summaryProvenance?: AssistantThreadSummaryProvenance;
};

export type AppendAssistantThreadMessageInput = {
  threadId: string;
  assistantRecordId?: string | null;
  role: AssistantThreadMessageRole;
  content: string;
  evidenceSnapshot?: AssistantEvidence[];
};

export type ReviewKnowledgeCandidateInput =
  | {
      action: "approve";
      recordId: string;
      projectId: string;
      reviewerId: string;
      title: string;
      summary: string;
      bodyMarkdown: string;
      tags: string[];
      scope: KnowledgePublicationScope;
      structuredDraft: StructuredKnowledgeDraft;
      generationRunId?: string | null;
    }
  | {
      action: "reject";
      recordId: string;
      projectId: string;
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
  executionMode: AssistantUsageExecutionMode;
  runtimeMode: string;
  provider: AssistantUsageProvider;
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

export type UpdateAssistantUsageEventInput = {
  id: string;
  runtimeMode: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  status: AssistantUsageStatus;
  errorCode?: string | null;
  metadata?: Record<string, unknown>;
};

export type ListAssistantUsageEventsInput = {
  projectId: string;
  month?: string;
};

export type ListAssistantUsageEventsForProfileInput = {
  profileId: string;
  from: string;
  to: string;
  limit?: number;
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

export type SearchApprovedKnowledgeInput = {
  projectId: string;
  query: string;
  limit?: number;
};

export interface AssistantRepository {
  listRecordsByTask(taskId: string): Promise<AssistantRecord[]>;
  listExternalEvidenceByTask(taskId: string): Promise<ExternalEvidenceRecord[]>;
  listKnowledgeCandidateRecords(input?: {
    states?: AssistantCandidateState[];
    projectId?: string;
    includeOrganizationApproved?: boolean;
  }): Promise<AssistantRecord[]>;
  searchApprovedKnowledge(input: SearchApprovedKnowledgeInput): Promise<ApprovedKnowledgeItem[]>;
  findRecordById(recordId: string): Promise<AssistantRecord | null>;
  findWorkSummaryDraftByRecordId(recordId: string): Promise<AssistantWorkSummaryDraft | null>;
  createThread(input: CreateAssistantThreadInput): Promise<AssistantThread>;
  appendThreadMessage(input: AppendAssistantThreadMessageInput): Promise<AssistantThreadMessage>;
  listRecentThreadMessages(threadId: string, limit: number): Promise<AssistantThreadMessage[]>;
  updateThreadSummary(threadId: string, summary: string, provenance: AssistantThreadSummaryProvenance): Promise<void>;
  findThreadByTask(taskId: string): Promise<AssistantThread | null>;
  createRecord(input: CreateAssistantRecordInput): Promise<AssistantRecord>;
  softDeleteReviewSession(input: {
    projectId: string;
    recordId: string;
    profileId: string;
  }): Promise<AssistantRecord>;
  restoreReviewSession(input: {
    projectId: string;
    recordId: string;
    profileId: string;
  }): Promise<AssistantRecord>;
  updateReviewSessionProjectWikiState(input: {
    projectId: string;
    recordId: string;
    projectWikiState: ProjectWikiReviewState;
  }): Promise<AssistantRecord>;
  updateCommonWikiCandidateSourceStatus(input: {
    projectId: string;
    recordId: string;
    sourceProjectWikiStatus: "active" | "disabled";
  }): Promise<AssistantRecord | null>;
  createExternalEvidence(input: CreateExternalEvidenceInput): Promise<ExternalEvidenceRecord>;
  saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput): Promise<AssistantWorkSummaryDraft>;
  reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput): Promise<{
    record: AssistantRecord;
    approvedKnowledgeItem: ApprovedKnowledgeItem | null;
  }>;
  getRunPolicy(projectId: string): Promise<AssistantRunPolicy | null>;
  upsertRunPolicy(input: UpsertAssistantRunPolicyInput): Promise<AssistantRunPolicy>;
  createUsageEvent(input: CreateAssistantUsageEventInput): Promise<AssistantUsageEvent>;
  updateUsageEvent(input: UpdateAssistantUsageEventInput): Promise<AssistantUsageEvent>;
  listUsageEvents(input: ListAssistantUsageEventsInput): Promise<AssistantUsageEvent[]>;
  listUsageEventsForProfile(input: ListAssistantUsageEventsForProfileInput): Promise<AssistantUsageEvent[]>;
  createAuditEvent(input: CreateAssistantAuditEventInput): Promise<AssistantAuditEvent>;
  listAuditEvents(input: ListAssistantAuditEventsInput): Promise<AssistantAuditEvent[]>;
  deleteAuditEventsByIds(input: DeleteAssistantAuditEventsByIdsInput): Promise<DeleteAssistantAuditEventsByIdsResult>;
}
