import type {
  ProjectWikiActionLog,
  ProjectWikiAssistantSearchResult,
  ProjectWikiDraft,
  ProjectWikiItem,
  ProjectWikiRegistrationPreview,
  ProjectWikiStatus,
} from "@/domains/project-wiki/types";

export type ListProjectWikiItemsInput = {
  projectId: string;
  status?: ProjectWikiStatus;
  query?: string;
  limit?: number;
};

export type GetProjectWikiItemInput = {
  projectId: string;
  itemId: string;
};

export type FindProjectWikiBySourceReviewRecordInput = {
  projectId: string;
  sourceReviewRecordId: string;
};

export type BuildProjectWikiRegistrationPreviewInput = {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId?: string;
};

export type RegisterProjectWikiInput = {
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  supplementalNote: string;
  draft: ProjectWikiDraft;
  actorProfileId: string;
  actorDisplay?: string;
};

export type SetProjectWikiStatusInput = {
  projectId: string;
  itemId: string;
  status: ProjectWikiStatus;
  actorProfileId: string;
  actorDisplay?: string;
  reason?: string;
};

export type SearchProjectWikiForAssistantInput = {
  projectId: string;
  query: string;
  limit?: number;
  excludedItemIds?: Iterable<string>;
};

export type SetProjectWikiStatusResult = {
  item: ProjectWikiItem;
  actionLog: ProjectWikiActionLog | null;
};

export interface ProjectWikiRepository {
  listProjectWikiItems(input: ListProjectWikiItemsInput): Promise<ProjectWikiItem[]>;
  getProjectWikiItem(input: GetProjectWikiItemInput): Promise<ProjectWikiItem | null>;
  findProjectWikiBySourceReviewRecord(
    input: FindProjectWikiBySourceReviewRecordInput,
  ): Promise<ProjectWikiItem | null>;
  buildProjectWikiRegistrationPreview(
    input: BuildProjectWikiRegistrationPreviewInput,
  ): Promise<ProjectWikiRegistrationPreview>;
  registerProjectWiki(input: RegisterProjectWikiInput): Promise<ProjectWikiItem>;
  setProjectWikiStatus(input: SetProjectWikiStatusInput): Promise<SetProjectWikiStatusResult>;
  searchProjectWikiForAssistant(input: SearchProjectWikiForAssistantInput): Promise<ProjectWikiAssistantSearchResult[]>;
}
