import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantRecord,
  AssistantTaskContext,
} from "@/domains/assistant/types";
import type { AssistantGenerateResult } from "@/domains/assistant/saas-api-mode";
import type { OfficialLawVerificationReport } from "@/domains/legal/official-law-api";

export type TaskReviewMode = "preview" | "generate";

export type TaskReviewRequest = {
  taskId: string;
  question: string;
  instruction?: string;
  mode?: TaskReviewMode;
};

export type EvidenceReadinessItem = {
  kind: "central_knowledge" | "project_document" | "web_or_skill";
  status: "available" | "missing";
  action: string;
};

export type TaskReviewSavedRecord = Pick<
  AssistantRecord,
  | "id"
  | "taskId"
  | "confidenceScore"
  | "confidenceReason"
  | "executionMode"
  | "runtimeMode"
  | "candidateState"
  | "createdAt"
  | "updatedAt"
> & {
  candidateState: "not_candidate";
  draftSummary: AssistantDraftSummary | null;
};

export type TaskReviewChecklistItem = {
  label: string;
  evidenceIds: string[];
  status: "todo" | "needs_review" | "blocked";
};

export type TaskReviewWarning = {
  message: string;
  severity: "info" | "warning" | "blocker";
  evidenceIds: string[];
};

export type StructuredTaskReviewSchema = {
  answerMarkdown: string;
  lawCitations: Array<{
    lawName: string;
    articleLabel?: string;
    articleNumber?: string;
    apiUrl: string;
    checkedAt: string;
    evidenceId?: string;
  }>;
  checklistItems: TaskReviewChecklistItem[];
  warnings: TaskReviewWarning[];
  evidenceConflicts: Array<{
    summary: string;
    evidenceIds: string[];
  }>;
  confidence: {
    score: number;
    reason: string;
  };
  wikiCandidateDraft: {
    allowed: boolean;
    title: string;
    summary: string;
    tags: string[];
    sourceEvidenceIds: string[];
  } | null;
};

export type TaskReviewBaseResponse = {
  taskContext: AssistantTaskContext;
  retrievedEvidence: {
    count: number;
    regulationCount: number;
    unavailableEvidenceKinds: string[];
  };
  officialLawVerification: OfficialLawVerificationReport;
  evidence: AssistantEvidence[];
  evidenceReadiness: EvidenceReadinessItem[];
  savedRecord: TaskReviewSavedRecord | null;
  wiki: {
    candidateCreated: false;
    approvalAttempted: false;
    approvedKnowledgeItemId: null;
    reason?: string;
  };
};

export type TaskReviewBlockedResponse = TaskReviewBaseResponse & {
  status: "blocked";
  reason: string;
  savedRecord: null;
  generation: {
    status: "blocked";
    reason: string;
  };
};

export type TaskReviewReadyResponse = TaskReviewBaseResponse & {
  status: "ready_for_generation";
  reason: string;
  savedRecord: null;
  structuredReviewSchema: StructuredTaskReviewSchema;
  generation: {
    status: "blocked";
    reason: string;
  };
};

export type TaskReviewGeneratedResponse = TaskReviewBaseResponse & {
  status: "generated";
  reason: string;
  savedRecord: TaskReviewSavedRecord;
  structuredReviewSchema: StructuredTaskReviewSchema;
  generation: {
    status: "generated";
  };
  generated: AssistantGenerateResult;
};

export type TaskReviewResponse =
  | TaskReviewBlockedResponse
  | TaskReviewReadyResponse
  | TaskReviewGeneratedResponse;
