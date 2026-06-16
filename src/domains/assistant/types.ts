import type { KnowledgeCandidateSource } from "@/domains/admin/knowledge-workflow";
import type { ExternalEvidenceRecord } from "@/domains/assistant/external-evidence";

export type AssistantEvidenceKind =
  | "central_knowledge"
  | "regulation"
  | "task"
  | "project_document"
  | "web_or_skill";

export type AssistantLegalEvidenceMetadata = {
  sourceId: string;
  chunkId?: string;
  sourceKind: string;
  authorityRank: string;
  effective?: {
    effectiveFrom?: string;
    effectiveTo?: string;
    promulgatedAt?: string;
  };
  locator?: Record<string, unknown>;
  stale: boolean;
  legalChangeWarnings: string[];
  confidenceReason?: string;
};

export type AssistantThreadMessageRole = "user" | "assistant" | "system";

export type AssistantThreadSummaryProvenance = {
  sourceMessageIds?: string[];
  generatedAt?: string;
  provider?: string;
  model?: string;
};

export type AssistantThread = {
  id: string;
  projectId: string;
  taskId: string | null;
  profileId: string;
  title: string;
  summary: string;
  summaryProvenance: AssistantThreadSummaryProvenance;
  createdAt: string;
  updatedAt: string;
};

export type AssistantThreadMessage = {
  id: string;
  threadId: string;
  assistantRecordId: string | null;
  role: AssistantThreadMessageRole;
  content: string;
  evidenceSnapshot: AssistantEvidence[];
  createdAt: string;
};

export type AssistantExecutionMode = "local-chatgpt-codex" | "mock" | "unavailable" | "saas-api";

export type AssistantEvidence = {
  id: string;
  kind: AssistantEvidenceKind;
  priority: number;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  recordId?: string;
  confidenceWeight?: number;
  officialSourceName?: string;
  lawName?: string;
  articleLabel?: string;
  articleNumber?: string;
  effectiveDate?: string;
  checkedAt?: string;
  apiSourceUrl?: string;
  verificationStatus?: "verified" | "needs_review" | "failed";
  legal?: AssistantLegalEvidenceMetadata;
};

export type AssistantTaskContext = {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  issueId: string;
  projectName: string;
};

export type AssistantDraftSummary = {
  conclusion: string;
  tags: string[];
  scope: string;
  followUpAction?: string;
};

export type AssistantCandidateState =
  | "candidate"
  | "not_candidate"
  | "pending_review"
  | "approved"
  | "rejected";

export type KnowledgePublicationScope = "admin_only" | "organization" | "project_members" | "project";

export type KnowledgeReviewMetadata = {
  status: "approved" | "rejected";
  reviewerId: string;
  reviewedAt: string;
  rejectionReason?: string;
};

export type ApprovedKnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  scope: KnowledgePublicationScope;
  sourceRecordId: string;
  sourceTaskId: string;
  sourceProjectId: string;
  sourceReferences: AssistantEvidence[];
  structuredKnowledgeItemId?: string;
  structuredKnowledgeVersionId?: string;
  generationRunId?: string;
  approvedBy: string;
  approvedAt: string;
};

export type AssistantRecordMetadata = {
  knowledgeReview?: KnowledgeReviewMetadata;
  approvedKnowledgeItem?: ApprovedKnowledgeItem;
  knowledgeCandidateSource?: KnowledgeCandidateSource;
  externalEvidence?: ExternalEvidenceRecord;
  taskReview?: {
    source: "assistant-task-review";
    officialLawStatus: "not_required" | "verified" | "failed";
    evidenceDigest: string;
    officialLawDigest: string;
    providerCallMode: "mock" | "live";
    savedByOrchestrator: true;
  };
};

export type AssistantRecord = {
  id: string;
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
  cleanupState: "draft" | "approved" | "deferred";
  candidateState: AssistantCandidateState;
  metadata: AssistantRecordMetadata;
  createdAt: string;
  updatedAt: string;
};

export type AssistantWorkSummaryDraft = {
  id: string;
  projectId: string;
  taskId: string;
  recordId: string;
  profileId: string;
  conclusion: string;
  tags: string[];
  scope: string;
  followUpAction: string;
  status: "draft" | "approved" | "deferred";
  createdAt: string;
  updatedAt: string;
};
