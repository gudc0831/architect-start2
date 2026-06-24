import { backendMode } from "@/lib/backend-mode";
import { localProjectWikiRepository } from "@/repositories/project-wiki/local-store";
import { postgresProjectWikiRepository } from "@/repositories/project-wiki/postgres-store";

export type {
  BuildProjectWikiRegistrationPreviewInput,
  FindProjectWikiBySourceReviewRecordInput,
  GetProjectWikiItemInput,
  ListProjectWikiItemsInput,
  ProjectWikiRepository,
  RegisterProjectWikiInput,
  SearchProjectWikiForAssistantInput,
  SetProjectWikiStatusInput,
  SetProjectWikiStatusResult,
} from "@/repositories/project-wiki/contracts";

import type { ProjectWikiRepository } from "@/repositories/project-wiki/contracts";

let projectWikiRepositoryInstance: ProjectWikiRepository | null = null;

function getProjectWikiRepository() {
  if (!projectWikiRepositoryInstance) {
    projectWikiRepositoryInstance = backendMode === "cloud" ? postgresProjectWikiRepository : localProjectWikiRepository;
  }

  return projectWikiRepositoryInstance;
}

export const projectWikiRepository: ProjectWikiRepository = {
  listProjectWikiItems(input) {
    return getProjectWikiRepository().listProjectWikiItems(input);
  },
  getProjectWikiItem(input) {
    return getProjectWikiRepository().getProjectWikiItem(input);
  },
  findProjectWikiBySourceReviewRecord(input) {
    return getProjectWikiRepository().findProjectWikiBySourceReviewRecord(input);
  },
  buildProjectWikiRegistrationPreview(input) {
    return getProjectWikiRepository().buildProjectWikiRegistrationPreview(input);
  },
  registerProjectWiki(input) {
    return getProjectWikiRepository().registerProjectWiki(input);
  },
  setProjectWikiStatus(input) {
    return getProjectWikiRepository().setProjectWikiStatus(input);
  },
  searchProjectWikiForAssistant(input) {
    return getProjectWikiRepository().searchProjectWikiForAssistant(input);
  },
};
