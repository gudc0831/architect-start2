import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantRecord,
  AssistantWorkSummaryDraft,
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

export interface AssistantRepository {
  listRecordsByTask(taskId: string): Promise<AssistantRecord[]>;
  findRecordById(recordId: string): Promise<AssistantRecord | null>;
  createRecord(input: CreateAssistantRecordInput): Promise<AssistantRecord>;
  saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput): Promise<AssistantWorkSummaryDraft>;
}
