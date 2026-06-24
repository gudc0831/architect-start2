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

export type AssistantLegalTaskFactField =
  | "use"
  | "facility"
  | "location"
  | "action"
  | "permitStage"
  | "requester"
  | "history"
  | "dimension"
  | "quantity"
  | "jurisdiction";

export type AssistantLegalTaskFactSource = "question" | "task" | "file" | "wiki" | "history";

export type AssistantLegalArchitecturalConcept = {
  conceptId: string;
  category: string;
  label: string;
  aliases: string[];
  requiredFacts: AssistantLegalTaskFactField[];
  stricterWhenMissingFacts?: boolean;
  relatedGraphLabels?: string[];
};

export type AssistantLegalTaskFact = {
  factId: string;
  field: AssistantLegalTaskFactField;
  value: string;
  source: AssistantLegalTaskFactSource;
  confidence: number;
};

export type AssistantLegalApplicabilityMatchStatus =
  | "official_verified"
  | "candidate"
  | "insufficient_facts"
  | "low_relevance"
  | "conflict";

export type AssistantLegalApplicabilityMatch = {
  status: AssistantLegalApplicabilityMatchStatus;
  lawName?: string;
  articleLabel?: string;
  articleNumber?: string;
  normalizedArticleNumber?: string;
  paragraphLabel?: string;
  itemLabel?: string;
  graphPath: string[];
  matchedConcepts: AssistantLegalArchitecturalConcept[];
  matchedFacts: AssistantLegalTaskFact[];
  missingFacts: AssistantLegalTaskFactField[];
  relevanceScore: number;
  canChangeConclusion: boolean;
  highRiskConcepts: AssistantLegalArchitecturalConcept[];
  reason: string;
};

export type AssistantOfficialVerifiedLegalApplicabilityMatch = AssistantLegalApplicabilityMatch & {
  status: "official_verified";
  lawName: string;
  articleLabel: string;
  articleNumber: string;
  normalizedArticleNumber: string;
};

export type AssistantLegalCandidateImpact = {
  canChangeConclusion: boolean;
  highRiskConcepts: AssistantLegalArchitecturalConcept[];
  missingFacts: AssistantLegalTaskFactField[];
  stricterCandidateRules: string[];
  reason: string;
};

export type AssistantLegalApplicabilityBundle = {
  officialVerified: AssistantOfficialVerifiedLegalApplicabilityMatch[];
  candidates: Array<AssistantLegalApplicabilityMatch & { status: "candidate" }>;
  insufficientFacts: Array<AssistantLegalApplicabilityMatch & { status: "insufficient_facts" }>;
  lowRelevance: Array<AssistantLegalApplicabilityMatch & { status: "low_relevance" }>;
  conflicts: Array<AssistantLegalApplicabilityMatch & { status: "conflict" }>;
  candidateImpact: AssistantLegalCandidateImpact;
  missingFacts: AssistantLegalTaskFactField[];
  graphPaths: string[][];
  llmExtractionStatus?: "fallback" | "provided" | "disabled";
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
    executionMode?: AssistantExecutionMode;
    runtimeMode?: string;
    savedByOrchestrator?: true;
    savedBy?: "user" | "orchestrator";
    reviewSessionId?: string;
    reviewSessionTitle?: string;
    reviewInstructionVersion?: number;
    candidateFactsMissing?: AssistantLegalTaskFactField[];
    conclusionMayChange?: boolean;
    legalApplicability?: AssistantLegalApplicabilityBundle;
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
