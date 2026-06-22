import type {
  AssistantEvidence,
  AssistantLegalApplicabilityBundle,
  AssistantLegalApplicabilityMatch,
  AssistantLegalCandidateImpact,
  AssistantOfficialVerifiedLegalApplicabilityMatch,
  AssistantTaskContext,
} from "@/domains/assistant/types";
import { isUnifiedReviewVerdict, type UnifiedReviewVerdict } from "@/domains/assistant/review-answer-contract";
import { TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION } from "@/domains/assistant/review-instruction";

export type TaskAssistantReviewSessionEvidenceSections = {
  officialLawEvidenceIds: string[];
  wikiEvidenceIds: string[];
  priorRecordEvidenceIds: string[];
  taskEvidenceIds: string[];
  projectDocumentEvidenceIds: string[];
  externalEvidenceIds: string[];
};

export type TaskAssistantReviewSession = {
  id: string;
  taskId: string;
  projectId: string;
  question: string;
  createdAt: string;
  reviewInstructionVersion: typeof TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION;
  verdict: UnifiedReviewVerdict;
  candidateImpact: AssistantLegalCandidateImpact;
  candidateFactsMissing: AssistantLegalCandidateImpact["missingFacts"];
  conclusionMayChange: boolean;
  officialVerified: AssistantOfficialVerifiedLegalApplicabilityMatch[];
  candidates: Array<AssistantLegalApplicabilityMatch & { status: "candidate" }>;
  evidenceSections: TaskAssistantReviewSessionEvidenceSections;
};

export function enforceCandidateImpactVerdict(
  verdict: UnifiedReviewVerdict,
  input: {
    canChangeConclusion: boolean;
    conclusionMayChange?: boolean;
    missingFacts?: string[];
    candidateFactsMissing?: string[];
    highRiskConcepts?: unknown[];
  },
): UnifiedReviewVerdict {
  const missingFacts = input.candidateFactsMissing ?? input.missingFacts ?? [];
  const conclusionMayChange = input.conclusionMayChange ?? input.canChangeConclusion;
  const highRiskConcepts = input.highRiskConcepts ?? [];
  if (conclusionMayChange && input.canChangeConclusion && missingFacts.length > 0 && highRiskConcepts.length > 0) {
    return "추가확인필요";
  }
  return isUnifiedReviewVerdict(verdict) ? verdict : "판단보류";
}

export function buildTaskAssistantReviewSession(input: {
  taskContext: AssistantTaskContext;
  question: string;
  evidence: AssistantEvidence[];
  legalApplicability?: AssistantLegalApplicabilityBundle | null;
  lawStatus: "not_required" | "verified" | "failed";
  now?: string;
}): TaskAssistantReviewSession {
  const createdAt = input.now ?? new Date().toISOString();
  const candidateImpact = input.legalApplicability?.candidateImpact ?? emptyCandidateImpact();
  const candidateFactsMissing = uniqueStrings([
    ...candidateImpact.missingFacts,
    ...(input.legalApplicability?.missingFacts ?? []),
  ]) as AssistantLegalCandidateImpact["missingFacts"];
  const conclusionMayChange = candidateImpact.canChangeConclusion;
  const baseVerdict = deriveBaseVerdict(input.lawStatus, input.legalApplicability);
  const verdict = enforceCandidateImpactVerdict(baseVerdict, {
    canChangeConclusion: candidateImpact.canChangeConclusion,
    conclusionMayChange,
    candidateFactsMissing,
    highRiskConcepts: candidateImpact.highRiskConcepts,
  });

  return {
    id: buildReviewSessionId(input.taskContext.taskId, createdAt),
    taskId: input.taskContext.taskId,
    projectId: input.taskContext.projectId,
    question: input.question,
    createdAt,
    reviewInstructionVersion: TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION,
    verdict,
    candidateImpact,
    candidateFactsMissing,
    conclusionMayChange,
    officialVerified: input.legalApplicability?.officialVerified ?? [],
    candidates: input.legalApplicability?.candidates ?? [],
    evidenceSections: splitEvidenceSections(input.evidence),
  };
}

export function listOfficialVerifiedLegalMatchLocators(session: TaskAssistantReviewSession) {
  return session.officialVerified.map(({ lawName, articleLabel, articleNumber, normalizedArticleNumber }) => ({
    lawName,
    articleLabel,
    articleNumber,
    normalizedArticleNumber,
  }));
}

function deriveBaseVerdict(
  lawStatus: "not_required" | "verified" | "failed",
  legalApplicability: AssistantLegalApplicabilityBundle | null | undefined,
): UnifiedReviewVerdict {
  if (lawStatus === "failed") {
    return "판단보류";
  }
  if ((legalApplicability?.conflicts.length ?? 0) > 0) {
    return "추가확인필요";
  }
  return lawStatus === "verified" ? "조건부" : "판단보류";
}

function splitEvidenceSections(evidence: AssistantEvidence[]): TaskAssistantReviewSessionEvidenceSections {
  return {
    officialLawEvidenceIds: evidence
      .filter((item) => item.kind === "regulation" || Boolean(item.legal))
      .map((item) => item.id),
    wikiEvidenceIds: evidence
      .filter((item) => item.kind === "central_knowledge")
      .map((item) => item.id),
    priorRecordEvidenceIds: evidence
      .filter((item) => item.id.startsWith("assistant-record:"))
      .map((item) => item.id),
    taskEvidenceIds: evidence
      .filter((item) => item.kind === "task" && !item.id.startsWith("assistant-record:"))
      .map((item) => item.id),
    projectDocumentEvidenceIds: evidence
      .filter((item) => item.kind === "project_document")
      .map((item) => item.id),
    externalEvidenceIds: evidence
      .filter((item) => item.kind === "web_or_skill")
      .map((item) => item.id),
  };
}

function emptyCandidateImpact(): AssistantLegalCandidateImpact {
  return {
    canChangeConclusion: false,
    highRiskConcepts: [],
    missingFacts: [],
    stricterCandidateRules: [],
    reason: "No legal applicability candidate impact was returned.",
  };
}

function buildReviewSessionId(taskId: string, createdAt: string) {
  return `task-review-session:${taskId}:${createdAt}`;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
