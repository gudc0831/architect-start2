import type { AssistantCandidateState } from "@/domains/assistant/types";

export type ProjectWikiStatus = "active" | "disabled";
export type ProjectWikiSuitabilityState = "recommended" | "caution" | "not_recommended";
export type ProjectWikiRegistrationState = "not_evaluated" | "recommended" | "caution" | "not_recommended" | "registered";
export type ProjectWikiSourceBadge = "프로젝트 WIKI" | "공용 WIKI" | "task" | "도면/문서" | "법규" | "외부";
export type ProjectWikiCommonCandidateStatus = AssistantCandidateState | null;

export type ProjectWikiDraft = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  aiSuitabilityState: ProjectWikiSuitabilityState;
  aiSuitabilityReason: string;
  commonizationCaution: string;
};

export type ProjectWikiItem = ProjectWikiDraft & {
  id: string;
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  commonCandidateRecordId: string | null;
  commonCandidateStatus: ProjectWikiCommonCandidateStatus;
  supplementalNote: string;
  status: ProjectWikiStatus;
  createdBy: string;
  createdByDisplay: string;
  createdAt: string;
  updatedAt: string;
  disabledBy: string | null;
  disabledAt: string | null;
  restoredBy: string | null;
  restoredAt: string | null;
};

export type ProjectWikiActionLog = {
  id: string;
  projectId: string;
  projectWikiItemId: string;
  action: "disable" | "restore";
  actorProfileId: string;
  actorDisplay: string;
  reason: string;
  createdAt: string;
};

export type ProjectWikiRegistrationPreview = {
  state: ProjectWikiRegistrationState;
  draft: ProjectWikiDraft | null;
  existingItem: ProjectWikiItem | null;
  blockingReason: string;
  canRegister: boolean;
};

export type ProjectWikiAssistantSearchResult = {
  item: ProjectWikiItem;
  score: number;
  matchedTerms: string[];
  sourceBadge: ProjectWikiSourceBadge;
};
