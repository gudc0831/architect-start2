import type { AuthUser } from "@/domains/auth/types";
import type { AssistantEvidence } from "@/domains/assistant/types";
import type {
  EvidenceReadinessItem,
  StructuredTaskReviewSchema,
  TaskReviewMode,
  TaskReviewResponse,
} from "@/domains/assistant/task-review";
import {
  officialLawSourceToEvidence,
  verifyOfficialLawEvidence,
  type OfficialLawVerificationReport,
} from "@/domains/legal/official-law-api";
import { retrieveAssistantEvidence } from "@/use-cases/assistant-service";

export type ReviewTaskInput = {
  taskId: string;
  question: string;
  instruction?: string;
  mode?: TaskReviewMode;
  fetchImpl?: typeof fetch;
};

export async function reviewTaskWithServerOrchestrator(
  input: ReviewTaskInput,
  user: AuthUser,
): Promise<TaskReviewResponse> {
  void user;
  const retrieved = await retrieveAssistantEvidence({
    taskId: input.taskId,
    question: input.question,
  });
  const lawReport = await verifyOfficialLawEvidence({
    question: input.question,
    evidence: retrieved.evidence,
    fetchImpl: input.fetchImpl,
  });
  const officialEvidence = lawReport.sources.map(officialLawSourceToEvidence).filter((item): item is AssistantEvidence => Boolean(item));
  const evidence = [...officialEvidence, ...retrieved.evidence].sort((left, right) => left.priority - right.priority);

  if (lawReport.status === "failed") {
    return {
      status: "blocked" as const,
      reason: "Official law verification failed before assistant record/WIKI candidate creation.",
      taskContext: retrieved.taskContext,
      retrievedEvidence: {
        count: retrieved.evidence.length,
        regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
        unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
      },
      officialLawVerification: lawReport,
      evidence,
      evidenceReadiness: buildEvidenceReadiness(),
      generation: {
        status: "blocked" as const,
        reason: "Generation is blocked until official law verification succeeds.",
      },
      savedRecord: null,
      wiki: {
        candidateCreated: false,
        approvalAttempted: false,
        approvedKnowledgeItemId: null,
        reason: "WIKI candidate creation is skipped when official law API verification has no verified source.",
      },
    };
  }

  return {
    status: "ready_for_generation" as const,
    reason:
      lawReport.status === "verified"
        ? "Official law verification succeeded. Server-side generation is waiting for an approved user-bound LLM execution mode."
        : "Official law verification was not required. Server-side generation is waiting for an approved user-bound LLM execution mode.",
    taskContext: retrieved.taskContext,
    retrievedEvidence: {
      count: retrieved.evidence.length,
      regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
      unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
    },
    officialLawVerification: lawReport,
    evidence,
    evidenceReadiness: buildEvidenceReadiness(),
    structuredReviewSchema: buildStructuredReviewPreview(input.question, evidence, lawReport),
    generation: {
      status: "blocked" as const,
      reason:
        "No server-side user-bound LLM execution mode is configured yet. Return this verified evidence bundle to the local extension/provider path before saving a record.",
    },
    savedRecord: null,
    wiki: {
      candidateCreated: false,
      approvalAttempted: false,
      approvedKnowledgeItemId: null,
      reason: "The task-review orchestrator never calls Knowledge WIKI approve routes. Candidate persistence requires a later verified generation step.",
    },
  };
}

function buildEvidenceReadiness(): EvidenceReadinessItem[] {
  return [];
}

function buildStructuredReviewPreview(
  question: string,
  evidence: AssistantEvidence[],
  lawReport: OfficialLawVerificationReport,
): StructuredTaskReviewSchema {
  const verifiedSources = lawReport.sources.filter((source) => source.status === "verified");
  const evidenceIds = evidence.map((item) => item.id);
  const lawEvidenceIds = new Set(verifiedSources.map((source) => source.evidenceId).filter((id): id is string => Boolean(id)));
  const citationEvidenceIds = evidence.filter((item) => item.id.startsWith("official-law:") || lawEvidenceIds.has(item.id)).map((item) => item.id);

  return {
    answerMarkdown: "",
    lawCitations: verifiedSources.map((source) => ({
      lawName: source.lawName,
      articleLabel: source.articleLabel,
      articleNumber: source.articleNumber,
      apiUrl: source.apiUrl,
      checkedAt: source.checkedAt,
      evidenceId: source.evidenceId,
    })),
    checklistItems: [
      {
        label: "공식 법규 API 출처와 조회 시점을 검토 답변에 포함",
        evidenceIds: citationEvidenceIds,
        status: citationEvidenceIds.length > 0 ? "todo" : "blocked",
      },
      {
        label: "task, project document, approved WIKI 근거를 답변 항목마다 연결",
        evidenceIds,
        status: evidenceIds.length > 0 ? "needs_review" : "blocked",
      },
    ],
    warnings: buildWarnings(lawReport, evidence),
    evidenceConflicts: [],
    confidence: {
      score: lawReport.status === "verified" ? 82 : 64,
      reason: `서버 retrieval evidence ${evidence.length}건과 공식 법규 검증 상태 ${lawReport.status}를 기준으로 산정했습니다.`,
    },
    wikiCandidateDraft:
      lawReport.status === "verified"
        ? {
            allowed: true,
            title: trimText(question || "공식 법규 task review 후보", 80),
            summary: "공식 법규 API 검증을 통과한 뒤 user-bound LLM 실행 결과를 바탕으로 후보 초안을 저장할 수 있습니다.",
            tags: ["official-law-api", "task-review"].slice(0, 12),
            sourceEvidenceIds: evidenceIds,
          }
        : null,
  };
}

function buildWarnings(lawReport: OfficialLawVerificationReport, evidence: AssistantEvidence[]): StructuredTaskReviewSchema["warnings"] {
  const warnings: StructuredTaskReviewSchema["warnings"] = [];
  if (lawReport.status === "verified" && lawReport.failures.length > 0) {
    warnings.push({
      message: `일부 법규 locator 검증이 실패했습니다: ${lawReport.failures.join(" / ")}`,
      severity: "warning",
      evidenceIds: evidence.filter((item) => item.kind === "regulation").map((item) => item.id),
    });
  }
  if (!evidence.some((item) => item.kind === "central_knowledge")) {
    warnings.push({
      message: "approved WIKI evidence가 검색되지 않았습니다. 후보 WIKI는 승인 전 central_knowledge로 재사용되지 않습니다.",
      severity: "info",
      evidenceIds: [],
    });
  }

  return warnings;
}

function trimText(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}
