import { createHash } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type { AssistantEvidence } from "@/domains/assistant/types";
import type { AssistantGenerateResult } from "@/domains/assistant/saas-api-mode";
import type {
  EvidenceReadinessItem,
  StructuredTaskReviewSchema,
  TaskReviewMode,
  TaskReviewResponse,
  TaskReviewSavedRecord,
} from "@/domains/assistant/task-review";
import {
  officialLawSourceToEvidence,
  verifyOfficialLawEvidence,
  type OfficialLawVerificationReport,
} from "@/domains/legal/official-law-api";
import { assistantRepository } from "@/repositories/assistant";
import { generateAssistantWithVerifiedEvidence } from "@/use-cases/assistant-saas-mode-service";
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
  const evidence = sanitizeTaskReviewEvidence([...officialEvidence, ...retrieved.evidence]).sort(
    (left, right) => left.priority - right.priority,
  );
  const evidenceDigest = buildEvidenceDigest(evidence);
  const officialLawDigest = buildOfficialLawDigest(lawReport);
  const evidenceReadiness = buildEvidenceReadiness({ unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds });
  const structuredReviewSchema = buildStructuredReviewPreview(input.question, evidence, lawReport);

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
      evidenceReadiness,
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

  if ((input.mode ?? "preview") === "generate") {
    const generated = await generateAssistantWithVerifiedEvidence(
      {
        taskContext: retrieved.taskContext,
        question: input.question,
        instruction: input.instruction,
        evidence,
        evidenceDigest,
        officialLawDigest,
        officialLawStatus: lawReport.status,
      },
      user,
    );
    const savedRecord = await saveGeneratedTaskReviewRecord({
      generated,
      user,
      taskId: retrieved.taskContext.taskId,
      projectId: retrieved.taskContext.projectId,
      question: input.question,
      evidence,
      regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
      lawReport,
      evidenceDigest,
      officialLawDigest,
    });

    return {
      status: "generated" as const,
      reason:
        lawReport.status === "verified"
          ? "Official law verification succeeded and the generated task review was saved server-side."
          : "Official law verification was not required and the generated task review was saved server-side.",
      taskContext: retrieved.taskContext,
      retrievedEvidence: {
        count: retrieved.evidence.length,
        regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
        unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
      },
      officialLawVerification: lawReport,
      evidence,
      evidenceReadiness,
      structuredReviewSchema,
      generation: {
        status: "generated" as const,
      },
      generated,
      savedRecord,
      wiki: {
        candidateCreated: false,
        approvalAttempted: false,
        approvedKnowledgeItemId: null,
        reason: "Generated task-review records are saved as not_candidate and are not submitted to WIKI approval.",
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
    evidenceReadiness,
    structuredReviewSchema,
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

function digestJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function sanitizeTaskReviewEvidence(evidence: AssistantEvidence[]) {
  return evidence.map((item) => ({
    ...item,
    sourceUrl: sanitizeEvidenceSourceUrl(item.sourceUrl),
  }));
}

function sanitizeEvidenceSourceUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const sanitized = new URL(value);
      for (const key of Array.from(sanitized.searchParams.keys())) {
        if (key.toUpperCase() === "OC") {
          sanitized.searchParams.delete(key);
        }
      }
      return sanitized.toString();
    } catch {
      return value;
    }
  }

  return stripOcQueryParam(value);
}

function stripOcQueryParam(value: string) {
  const queryIndex = value.indexOf("?");
  if (queryIndex === -1) {
    return value;
  }

  const hashIndex = value.indexOf("#", queryIndex);
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const base = withoutHash.slice(0, queryIndex);
  const params = new URLSearchParams(withoutHash.slice(queryIndex + 1));
  for (const key of Array.from(params.keys())) {
    if (key.toUpperCase() === "OC") {
      params.delete(key);
    }
  }
  const query = params.toString();
  return `${base}${query ? `?${query}` : ""}${hash}`;
}

function buildEvidenceDigest(evidence: AssistantEvidence[]) {
  return digestJson(
    evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      excerpt: item.excerpt,
      sourceUrl: item.sourceUrl,
      recordId: item.recordId,
      confidenceWeight: item.confidenceWeight,
    })),
  );
}

function buildOfficialLawDigest(lawReport: OfficialLawVerificationReport) {
  return digestJson({
    status: lawReport.status,
    failures: lawReport.failures,
    sources: lawReport.sources.map((source) => ({
      lawName: source.lawName,
      articleLabel: source.articleLabel,
      apiUrl: source.apiUrl,
      searchApiUrl: source.searchApiUrl,
    })),
  });
}

function buildEvidenceReadiness(input: { unavailableEvidenceKinds: string[] }): EvidenceReadinessItem[] {
  const missing = new Set(input.unavailableEvidenceKinds);
  return [
    {
      kind: "central_knowledge",
      status: missing.has("central_knowledge") ? "missing" : "available",
      action: missing.has("central_knowledge")
        ? "Approve a WIKI item or link an existing approved knowledge item before relying on central knowledge."
        : "Use approved WIKI evidence as reusable central knowledge.",
    },
    {
      kind: "project_document",
      status: missing.has("project_document") ? "missing" : "available",
      action: missing.has("project_document")
        ? "Attach or confirm project document analysis before treating document evidence as final."
        : "Use available project document evidence with source references.",
    },
    {
      kind: "web_or_skill",
      status: missing.has("web_or_skill") ? "missing" : "available",
      action: missing.has("web_or_skill")
        ? "Capture external web or skill evidence with user approval when extra context is required."
        : "Use captured external evidence only within its recorded permission scope.",
    },
  ];
}

async function saveGeneratedTaskReviewRecord(input: {
  generated: AssistantGenerateResult;
  user: AuthUser;
  projectId: string;
  taskId: string;
  question: string;
  evidence: AssistantEvidence[];
  regulationCount: number;
  lawReport: OfficialLawVerificationReport;
  evidenceDigest: string;
  officialLawDigest: string;
}): Promise<TaskReviewSavedRecord> {
  const providerCallMode = input.generated.provider.callMode;
  const record = await assistantRepository.createRecord({
    projectId: input.projectId,
    taskId: input.taskId,
    profileId: input.user.id,
    question: input.question,
    answer: input.generated.answer,
    evidence: input.evidence,
    confidenceScore: Math.min(95, Math.max(60, 80 + input.regulationCount)),
    confidenceReason:
      input.lawReport.status === "verified"
        ? "Official law API verification succeeded and the record was generated from the server-verified evidence bundle."
        : "Official law verification was not required and the record was generated from the server-verified evidence bundle.",
    executionMode: "saas-api",
    runtimeMode: providerCallMode === "live" ? "task-review-live-provider" : "task-review-mock-provider",
    draftSummary: input.generated.suggestedDraftSummary,
    candidateState: "not_candidate",
    metadata: {
      taskReview: {
        source: "assistant-task-review",
        officialLawStatus: input.lawReport.status,
        evidenceDigest: input.evidenceDigest,
        officialLawDigest: input.officialLawDigest,
        providerCallMode,
        savedByOrchestrator: true,
      },
    },
  });

  return {
    id: record.id,
    taskId: record.taskId,
    confidenceScore: record.confidenceScore,
    confidenceReason: record.confidenceReason,
    executionMode: record.executionMode,
    runtimeMode: record.runtimeMode,
    candidateState: "not_candidate",
    draftSummary: record.draftSummary,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
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
