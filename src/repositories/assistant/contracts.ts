import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  ApprovedKnowledgeItem,
  AssistantCandidateState,
  AssistantRecord,
  AssistantWorkSummaryDraft,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";

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

export interface AssistantRepository {
  listRecordsByTask(taskId: string): Promise<AssistantRecord[]>;
  listKnowledgeCandidateRecords(input?: { states?: AssistantCandidateState[] }): Promise<AssistantRecord[]>;
  findRecordById(recordId: string): Promise<AssistantRecord | null>;
  findWorkSummaryDraftByRecordId(recordId: string): Promise<AssistantWorkSummaryDraft | null>;
  createRecord(input: CreateAssistantRecordInput): Promise<AssistantRecord>;
  saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput): Promise<AssistantWorkSummaryDraft>;
  reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput): Promise<{
    record: AssistantRecord;
    approvedKnowledgeItem: ApprovedKnowledgeItem | null;
  }>;
}
