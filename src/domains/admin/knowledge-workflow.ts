import { conflict } from "@/lib/api/errors";

export type KnowledgeCandidateSource =
  | { type: "user_ai_review"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "discovery_request"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "local_wiki_import"; refId: string; sourceDigest: string; importedAt: string }
  | { type: "verified_legal_import"; refId: string; sourceDigest: string; importedAt: string };

export const knowledgeCandidateStateTransitions = {
  candidate: ["approved", "rejected"],
  pending_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
  not_candidate: [],
} as const;

export type KnowledgeCandidateReviewSourceState = keyof typeof knowledgeCandidateStateTransitions;
export type KnowledgeCandidateReviewTargetState = "approved" | "rejected";

export function assertKnowledgeCandidateReviewTransition(
  currentState: KnowledgeCandidateReviewSourceState,
  nextState: KnowledgeCandidateReviewTargetState,
) {
  const allowedTransitions: readonly KnowledgeCandidateReviewTargetState[] = knowledgeCandidateStateTransitions[currentState];
  if (!allowedTransitions.includes(nextState)) {
    throw conflict(
      `Invalid knowledge candidate transition: ${currentState} -> ${nextState}`,
      "KNOWLEDGE_CANDIDATE_TRANSITION_INVALID",
    );
  }
}

export const knowledgeAuditEventTypes = {
  candidateApproved: "knowledge.candidate.approved",
  candidateRejected: "knowledge.candidate.rejected",
  discoveryPromoted: "knowledge.discovery.promoted",
  discoveryDismissed: "knowledge.discovery.dismissed",
  importPreviewCreated: "knowledge.import.preview_created",
  importPreviewConfirmed: "knowledge.import.preview_confirmed",
  importCandidateImported: "knowledge.import.candidate_imported",
  rubricCreated: "knowledge.rubric.created",
  rubricUpdated: "knowledge.rubric.updated",
  rubricActivated: "knowledge.rubric.activated",
  rubricArchived: "knowledge.rubric.archived",
  rubricRolledBack: "knowledge.rubric.rolled_back",
  generationProfileCreated: "knowledge.generation_profile.created",
  generationProfileActivated: "knowledge.generation_profile.activated",
  generationProfileRolledBack: "knowledge.generation_profile.rolled_back",
} as const;

export type KnowledgeWorkflowAuditEventType =
  typeof knowledgeAuditEventTypes[keyof typeof knowledgeAuditEventTypes];

export const nonDeletableWorkflowAuditTargetTypes = [
  "knowledge_discovery_request",
  "knowledge_import_preview",
  "knowledge_import_rubric",
  "knowledge_generation_profile",
  "knowledge_candidate_transition",
] as const;
