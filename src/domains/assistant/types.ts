import type { ExternalEvidenceRecord } from "@/domains/assistant/external-evidence";

export type AssistantEvidenceKind =
  | "central_knowledge"
  | "regulation"
  | "task"
  | "project_document"
  | "web_or_skill";

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
  approvedBy: string;
  approvedAt: string;
};

export type AssistantRecordMetadata = {
  knowledgeReview?: KnowledgeReviewMetadata;
  approvedKnowledgeItem?: ApprovedKnowledgeItem;
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
