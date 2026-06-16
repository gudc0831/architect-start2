import { backendMode } from "@/lib/backend-mode";
import type { StructuredKnowledgeRepository } from "@/repositories/knowledge/contracts";
import { localStructuredKnowledgeRepository } from "@/repositories/knowledge/local-store";
import { postgresStructuredKnowledgeRepository } from "@/repositories/knowledge/postgres-store";

let structuredKnowledgeRepositoryInstance: StructuredKnowledgeRepository | null = null;

function getStructuredKnowledgeRepository() {
  if (!structuredKnowledgeRepositoryInstance) {
    structuredKnowledgeRepositoryInstance =
      backendMode === "cloud" ? postgresStructuredKnowledgeRepository : localStructuredKnowledgeRepository;
  }

  return structuredKnowledgeRepositoryInstance;
}

export const structuredKnowledgeRepository: StructuredKnowledgeRepository = {
  createItem(input) {
    return getStructuredKnowledgeRepository().createItem(input);
  },
  publishVersion(input) {
    return getStructuredKnowledgeRepository().publishVersion(input);
  },
  listApprovedItems(input) {
    return getStructuredKnowledgeRepository().listApprovedItems(input);
  },
  listApprovedKnowledgeItems(input) {
    return getStructuredKnowledgeRepository().listApprovedKnowledgeItems(input);
  },
  searchApprovedKnowledge(input) {
    return getStructuredKnowledgeRepository().searchApprovedKnowledge(input);
  },
  getActiveGenerationProfile(name) {
    return getStructuredKnowledgeRepository().getActiveGenerationProfile(name);
  },
};
