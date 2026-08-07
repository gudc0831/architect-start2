import { backendMode } from "@/lib/backend-mode";
import type { AssistantRepository } from "@/repositories/assistant/contracts";
import { localAssistantRepository } from "@/repositories/assistant/local-store";
import { postgresAssistantRepository } from "@/repositories/assistant/postgres-store";

let assistantRepositoryInstance: AssistantRepository | null = null;

function getAssistantRepository() {
  if (!assistantRepositoryInstance) {
    assistantRepositoryInstance = backendMode === "cloud" ? postgresAssistantRepository : localAssistantRepository;
  }

  return assistantRepositoryInstance;
}

export const assistantRepository: AssistantRepository = {
  listRecordsByTask(taskId) {
    return getAssistantRepository().listRecordsByTask(taskId);
  },
  listExternalEvidenceByTask(taskId) {
    return getAssistantRepository().listExternalEvidenceByTask(taskId);
  },
  listKnowledgeCandidateRecords(input) {
    return getAssistantRepository().listKnowledgeCandidateRecords(input);
  },
  searchApprovedKnowledge(input) {
    return getAssistantRepository().searchApprovedKnowledge(input);
  },
  findRecordById(recordId) {
    return getAssistantRepository().findRecordById(recordId);
  },
  findWorkSummaryDraftByRecordId(recordId) {
    return getAssistantRepository().findWorkSummaryDraftByRecordId(recordId);
  },
  createThread(input) {
    return getAssistantRepository().createThread(input);
  },
  appendThreadMessage(input) {
    return getAssistantRepository().appendThreadMessage(input);
  },
  listRecentThreadMessages(threadId, limit) {
    return getAssistantRepository().listRecentThreadMessages(threadId, limit);
  },
  updateThreadSummary(threadId, summary, provenance) {
    return getAssistantRepository().updateThreadSummary(threadId, summary, provenance);
  },
  findThreadByTask(taskId) {
    return getAssistantRepository().findThreadByTask(taskId);
  },
  createRecord(input) {
    return getAssistantRepository().createRecord(input);
  },
  softDeleteReviewSession(input) {
    return getAssistantRepository().softDeleteReviewSession(input);
  },
  restoreReviewSession(input) {
    return getAssistantRepository().restoreReviewSession(input);
  },
  updateReviewSessionProjectWikiState(input) {
    return getAssistantRepository().updateReviewSessionProjectWikiState(input);
  },
  updateCommonWikiCandidateSourceStatus(input) {
    return getAssistantRepository().updateCommonWikiCandidateSourceStatus(input);
  },
  createExternalEvidence(input) {
    return getAssistantRepository().createExternalEvidence(input);
  },
  saveWorkSummaryDraft(input) {
    return getAssistantRepository().saveWorkSummaryDraft(input);
  },
  reviewKnowledgeCandidate(input) {
    return getAssistantRepository().reviewKnowledgeCandidate(input);
  },
  getRunPolicy(projectId) {
    return getAssistantRepository().getRunPolicy(projectId);
  },
  upsertRunPolicy(input) {
    return getAssistantRepository().upsertRunPolicy(input);
  },
  createUsageEvent(input) {
    return getAssistantRepository().createUsageEvent(input);
  },
  updateUsageEvent(input) {
    return getAssistantRepository().updateUsageEvent(input);
  },
  listUsageEvents(input) {
    return getAssistantRepository().listUsageEvents(input);
  },
  listUsageEventsForProfile(input) {
    return getAssistantRepository().listUsageEventsForProfile(input);
  },
  createAuditEvent(input) {
    return getAssistantRepository().createAuditEvent(input);
  },
  listAuditEvents(input) {
    return getAssistantRepository().listAuditEvents(input);
  },
  deleteAuditEventsByIds(input) {
    return getAssistantRepository().deleteAuditEventsByIds(input);
  },
};
