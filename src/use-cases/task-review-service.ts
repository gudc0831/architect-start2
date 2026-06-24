import { createHash } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantLegalApplicabilityBundle,
  AssistantRecord,
  ProjectWikiReviewState,
} from "@/domains/assistant/types";
import type { AssistantGenerateResult } from "@/domains/assistant/saas-api-mode";
import type {
  EvidenceReadinessItem,
  StructuredTaskReviewSchema,
  TaskReviewLegalVerificationReport,
  TaskReviewMode,
  TaskReviewResponse,
  TaskReviewSavedRecord,
} from "@/domains/assistant/task-review";
import {
  isCentralizedVerifiedLegalEvidence,
  requiresCentralizedLegalVerification,
} from "@/domains/legal/legal-verification-intent";
import {
  TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION,
  TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION,
} from "@/domains/assistant/review-instruction";
import {
  buildTaskAssistantReviewSession,
  type TaskAssistantReviewSession,
} from "@/domains/assistant/review-session";
import { badRequest, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { generateAssistantWithVerifiedEvidence } from "@/use-cases/assistant-saas-mode-service";
import { retrieveAssistantEvidence } from "@/use-cases/assistant-service";
import { requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";

export type ReviewTaskInput = {
  taskId: string;
  question: string;
  instruction?: string;
  mode?: TaskReviewMode;
  fetchImpl?: typeof fetch;
};

export type SaveTaskReviewSessionRecordInput = {
  taskId: string;
  question: string;
  answer: string;
  evidence: AssistantEvidence[];
  title?: string;
  draftSummary?: AssistantDraftSummary | null;
  executionMode?: AssistantExecutionMode;
  runtimeMode?: string;
  generated?: AssistantGenerateResult | null;
  officialLawVerification?: TaskReviewLegalVerificationReport | null;
  legalApplicability?: AssistantLegalApplicabilityBundle | null;
  reviewSession?: TaskAssistantReviewSession | null;
};

export type TaskReviewSessionSummary = {
  id: string;
  taskId: string;
  title: string;
  question: string;
  answerPreview: string;
  verdict: string | null;
  conclusionMayChange: boolean;
  projectWikiState: ProjectWikiReviewState;
  savedAt: string;
  updatedAt: string;
  savedRecord: TaskReviewSavedRecord;
};

export type TaskReviewSessionDetail = TaskReviewSessionSummary & {
  answer: string;
  savedEvidenceSnapshot: AssistantEvidence[];
  latestEvidenceSnapshot: AssistantEvidence[];
  savedWikiEvidence: AssistantEvidence[];
  latestWikiEvidence: AssistantEvidence[];
  savedHistoryEvidence: AssistantEvidence[];
  latestHistoryEvidence: AssistantEvidence[];
  followUp: {
    savedEvidenceSnapshot: AssistantEvidence[];
    latestEvidenceSnapshot: AssistantEvidence[];
    savedWikiEvidence: AssistantEvidence[];
    latestWikiEvidence: AssistantEvidence[];
    savedHistoryEvidence: AssistantEvidence[];
    latestHistoryEvidence: AssistantEvidence[];
  };
};

const TASK_REVIEW_SESSION_RENAMED_EVENT = "assistant_review_session_renamed";

export async function reviewTaskWithServerOrchestrator(
  input: ReviewTaskInput,
  user: AuthUser,
): Promise<TaskReviewResponse> {
  const retrieved = await retrieveAssistantEvidence({
    taskId: input.taskId,
    question: input.question,
    user,
  });
  const legalVerificationRequired = requiresCentralizedLegalVerification(input.question, retrieved.evidence);
  const generationEvidence = selectEvidenceForTaskReviewGeneration(retrieved.evidence, legalVerificationRequired);
  const omittedRegulationCount =
    retrieved.evidence.filter((item) => item.kind === "regulation").length -
    generationEvidence.filter((item) => item.kind === "regulation").length;
  const evidence = sanitizeTaskReviewEvidence(generationEvidence).sort(
    (left, right) => left.priority - right.priority,
  );
  const lawReport = buildCentralizedLegalVerificationReport({
    question: input.question,
    evidence,
    originalEvidence: retrieved.evidence,
    evidenceReadinessWarnings: retrieved.evidenceReadinessWarnings,
    legalVerificationRequired,
  });
  const evidenceDigest = buildEvidenceDigest(evidence);
  const officialLawDigest = buildOfficialLawDigest(lawReport);
  const evidenceReadiness = buildEvidenceReadiness({ unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds });
  const structuredReviewSchema = buildStructuredReviewPreview(input.question, evidence, lawReport, omittedRegulationCount);
  const reviewSession = buildTaskAssistantReviewSession({
    taskContext: retrieved.taskContext,
    question: input.question,
    evidence,
    legalApplicability: retrieved.legalApplicability,
    lawStatus: lawReport.status,
  });

  if (lawReport.status === "failed") {
    return {
      status: "blocked" as const,
      reason: "Verified legal evidence API did not provide answer-ready legal evidence before assistant record/WIKI candidate creation.",
      taskContext: retrieved.taskContext,
      retrievedEvidence: {
        count: retrieved.evidence.length,
        regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
        unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
      },
      officialLawVerification: lawReport,
      legalApplicability: retrieved.legalApplicability,
      evidence,
      evidenceReadiness,
      reviewSession,
      generation: {
        status: "blocked" as const,
        reason: "Generation is blocked until centralized verified legal evidence succeeds.",
      },
      savedRecord: null,
      wiki: {
        candidateCreated: false,
        approvalAttempted: false,
        approvedKnowledgeItemId: null,
        reason: "WIKI candidate creation is skipped when the centralized verified legal API has no verified source.",
      },
    };
  }

  if ((input.mode ?? "preview") === "generate") {
    const generated = await generateAssistantWithVerifiedEvidence(
      {
        taskContext: retrieved.taskContext,
        question: input.question,
        instruction: TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION,
        evidence,
        evidenceDigest,
        officialLawDigest,
        officialLawStatus: lawReport.status,
        legalEvidence: evidence.filter(isCentralizedVerifiedLegalEvidence),
        projectContextChunks: retrieved.projectContextChunks,
        projectContextTrace: retrieved.projectContextTrace,
        unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
        evidenceReadinessWarnings: retrieved.evidenceReadinessWarnings,
        conversationMemory: retrieved.conversationMemory,
        legalApplicability: retrieved.legalApplicability,
      },
      user,
    );
    const generatedConfidence = buildGeneratedTaskReviewConfidence({
      evidence,
      lawReport,
      regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
    });
    const generatedStructuredReviewSchema = attachGeneratedAnswerToStructuredReviewSchema(
      structuredReviewSchema,
      generated.answer,
      generated.suggestedDraftSummary,
      generatedConfidence.score,
      generatedConfidence.reason,
    );

    return {
      status: "generated" as const,
      reason:
        lawReport.status === "verified"
          ? "Centralized verified legal evidence succeeded and the generated task review is ready for temporary review auto-save."
          : "Centralized legal verification was not required and the generated task review is ready for temporary review auto-save.",
      taskContext: retrieved.taskContext,
      retrievedEvidence: {
        count: retrieved.evidence.length,
        regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
        unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
      },
      officialLawVerification: lawReport,
      legalApplicability: retrieved.legalApplicability,
      evidence,
      evidenceReadiness,
      reviewSession,
      structuredReviewSchema: generatedStructuredReviewSchema,
      generation: {
        status: "generated" as const,
      },
      generated,
      savedRecord: null,
      wiki: {
        candidateCreated: false,
        approvalAttempted: false,
        approvedKnowledgeItemId: null,
        reason: "Temporary task-review records are not submitted to WIKI approval until a later explicit review-registration flow.",
      },
    };
  }

  return {
    status: "ready_for_generation" as const,
    reason:
      lawReport.status === "verified"
        ? "Centralized verified legal evidence succeeded. Server-side generation is waiting for an approved user-bound LLM execution mode."
        : "Centralized legal verification was not required. Server-side generation is waiting for an approved user-bound LLM execution mode.",
    taskContext: retrieved.taskContext,
    retrievedEvidence: {
      count: retrieved.evidence.length,
      regulationCount: retrieved.evidence.filter((item) => item.kind === "regulation").length,
      unavailableEvidenceKinds: retrieved.unavailableEvidenceKinds,
    },
    officialLawVerification: lawReport,
    legalApplicability: retrieved.legalApplicability,
    evidence,
    evidenceReadiness,
    reviewSession,
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

export async function saveTaskReviewSessionRecord(
  input: SaveTaskReviewSessionRecordInput,
  user: AuthUser,
) {
  const task = await requireTaskInSelectedProject(normalizeRequiredSessionText(input.taskId, "taskId"));
  const question = normalizeRequiredSessionText(input.question, "question");
  const answer = normalizeRequiredSessionText(input.answer, "answer");
  const evidence = sanitizeTaskReviewEvidence(input.evidence ?? []);
  const lawReport = input.officialLawVerification ?? buildStoredReviewLawReport(evidence);
  const providerCallMode = input.generated?.provider?.callMode ?? "mock";
  const executionMode = normalizeTaskReviewSessionExecutionMode(input.executionMode, input.generated);
  const runtimeMode = normalizeTaskReviewSessionRuntimeMode(input.runtimeMode, executionMode, providerCallMode);
  const confidence = buildGeneratedTaskReviewConfidence({
    evidence,
    lawReport,
    regulationCount: evidence.filter((item) => item.kind === "regulation").length,
  });
  const reviewSessionId = input.reviewSession?.id ?? `task-review-session:${task.id}:${new Date().toISOString()}`;
  const title = normalizeSessionTitle(input.title) ?? buildReviewSessionTitle(question);
  const legalApplicability = input.legalApplicability ?? null;
  const record = await assistantRepository.createRecord({
    projectId: task.projectId,
    taskId: task.id,
    profileId: user.id,
    question,
    answer,
    evidence,
    confidenceScore: confidence.score,
    confidenceReason: confidence.reason,
    executionMode,
    runtimeMode,
    draftSummary: input.draftSummary ?? input.generated?.suggestedDraftSummary ?? null,
    candidateState: "not_candidate",
    metadata: {
      taskReview: {
        source: "assistant-task-review",
        officialLawStatus: lawReport.status,
        evidenceDigest: buildEvidenceDigest(evidence),
        officialLawDigest: buildOfficialLawDigest(lawReport),
        providerCallMode,
        executionMode,
        runtimeMode,
        savedBy: "auto",
        reviewRecordKind: "temporary",
        reviewSessionId,
        reviewSessionTitle: title,
        reviewInstructionVersion: TASK_ASSISTANT_DEFAULT_REVIEW_INSTRUCTION_VERSION,
        candidateFactsMissing: input.reviewSession?.candidateFactsMissing ?? legalApplicability?.candidateImpact.missingFacts ?? [],
        conclusionMayChange: input.reviewSession?.conclusionMayChange ?? legalApplicability?.candidateImpact.canChangeConclusion ?? false,
        ...(legalApplicability ? { legalApplicability } : {}),
      },
    },
  });

  return toTaskReviewSessionSummary(record, title);
}

export async function listTaskReviewSessions(taskId: string): Promise<TaskReviewSessionSummary[]> {
  const task = await requireTaskInSelectedProject(normalizeRequiredSessionText(taskId, "taskId"));
  const records = (await assistantRepository.listRecordsByTask(task.id)).filter(isSavedTaskReviewRecord);
  const titleBySessionId = await readReviewSessionTitleOverrides(task.projectId);
  return records
    .slice(0, 6)
    .map((record) => toTaskReviewSessionSummary(record, titleBySessionId.get(record.id)));
}

export async function getTaskReviewSessionDetail(
  sessionId: string,
  user: AuthUser,
): Promise<TaskReviewSessionDetail> {
  const record = await findSavedTaskReviewRecord(sessionId);
  await requireTaskInSelectedProject(record.taskId);
  const latest = await retrieveAssistantEvidence({
    taskId: record.taskId,
    question: record.question,
    user,
  });
  const titleBySessionId = await readReviewSessionTitleOverrides(record.projectId);
  const summary = toTaskReviewSessionSummary(record, titleBySessionId.get(record.id));
  const savedEvidenceSnapshot = record.evidence;
  const latestEvidenceSnapshot = latest.evidence;
  const savedWikiEvidence = savedEvidenceSnapshot.filter(isWikiEvidence);
  const latestWikiEvidence = latestEvidenceSnapshot.filter(isWikiEvidence);
  const savedHistoryEvidence = savedEvidenceSnapshot.filter(isHistoryEvidence);
  const latestHistoryEvidence = latestEvidenceSnapshot.filter(isHistoryEvidence);

  return {
    ...summary,
    answer: record.answer,
    savedEvidenceSnapshot,
    latestEvidenceSnapshot,
    savedWikiEvidence,
    latestWikiEvidence,
    savedHistoryEvidence,
    latestHistoryEvidence,
    followUp: {
      savedEvidenceSnapshot,
      latestEvidenceSnapshot,
      savedWikiEvidence,
      latestWikiEvidence,
      savedHistoryEvidence,
      latestHistoryEvidence,
    },
  };
}

export async function renameTaskReviewSession(input: {
  sessionId: string;
  title: string;
}, user: AuthUser): Promise<TaskReviewSessionSummary> {
  const record = await findSavedTaskReviewRecord(input.sessionId);
  await requireTaskInSelectedProject(record.taskId);
  const title = normalizeSessionTitle(input.title);
  if (!title) {
    throw badRequest("title is required", "TASK_REVIEW_SESSION_TITLE_REQUIRED");
  }
  await assistantRepository.createAuditEvent({
    projectId: record.projectId,
    profileId: user.id,
    eventType: TASK_REVIEW_SESSION_RENAMED_EVENT,
    targetType: "assistant_review_session",
    targetId: record.id,
    metadata: { title },
  });
  return toTaskReviewSessionSummary(record, title);
}

export async function deleteTaskReviewSession(sessionId: string, user: AuthUser) {
  const record = await findSavedTaskReviewRecordIncludingDeleted(sessionId);
  await requireTaskInSelectedProject(record.taskId);
  const titleBySessionId = await readReviewSessionTitleOverrides(record.projectId);
  const deletedRecord = await assistantRepository.softDeleteReviewSession({
    projectId: record.projectId,
    recordId: record.id,
    profileId: user.id,
  });
  return toTaskReviewSessionSummary(deletedRecord, titleBySessionId.get(record.id));
}

export async function restoreTaskReviewSession(sessionId: string, user: AuthUser) {
  const record = await findSavedTaskReviewRecordIncludingDeleted(sessionId);
  await requireTaskInSelectedProject(record.taskId);
  const titleBySessionId = await readReviewSessionTitleOverrides(record.projectId);
  const restoredRecord = await assistantRepository.restoreReviewSession({
    projectId: record.projectId,
    recordId: record.id,
    profileId: user.id,
  });
  return toTaskReviewSessionSummary(restoredRecord, titleBySessionId.get(record.id));
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

export function selectEvidenceForCentralizedLegalVerification(evidence: AssistantEvidence[]) {
  return evidence.filter(isCentralizedVerifiedLegalEvidence);
}

export function selectEvidenceForTaskReviewGeneration(evidence: AssistantEvidence[], legalVerificationRequired: boolean) {
  if (!legalVerificationRequired) {
    return evidence;
  }
  return evidence.filter((item) => item.kind !== "regulation" || isCentralizedVerifiedLegalEvidence(item));
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

function buildOfficialLawDigest(lawReport: TaskReviewLegalVerificationReport) {
  return digestJson({
    status: lawReport.status,
    failures: lawReport.failures,
    sources: lawReport.sources.map((source) => ({
      lawName: source.lawName,
      articleLabel: source.articleLabel,
      apiUrl: source.apiUrl,
    })),
  });
}

function buildCentralizedLegalVerificationReport(input: {
  question: string;
  evidence: AssistantEvidence[];
  originalEvidence: AssistantEvidence[];
  evidenceReadinessWarnings: Array<{ code: string; message: string }>;
  legalVerificationRequired: boolean;
}): TaskReviewLegalVerificationReport {
  const checkedAt = new Date().toISOString();
  const provider = {
    name: "Verified Legal Evidence API",
    docsUrl: "/api/legal/search",
  };
  if (!input.legalVerificationRequired) {
    return {
      status: "not_required",
      checkedAt,
      provider,
      locators: [],
      sources: [],
      failures: [],
      retry: [],
    };
  }

  const verifiedLegalEvidence = input.evidence.filter(isCentralizedVerifiedLegalEvidence);
  if (verifiedLegalEvidence.length > 0) {
    return {
      status: "verified",
      checkedAt,
      provider,
      locators: verifiedLegalEvidence.map((item) => ({
        lawName: item.lawName ?? item.title,
        articleLabel: item.articleLabel,
        articleNumber: item.articleNumber,
        evidenceId: item.id,
        sourceUrl: item.sourceUrl ?? item.apiSourceUrl,
      })),
      sources: verifiedLegalEvidence.map((item) => ({
        status: "verified",
        lawName: item.lawName ?? item.title,
        articleLabel: item.articleLabel,
        articleNumber: item.articleNumber,
        apiUrl: item.apiSourceUrl ?? item.sourceUrl ?? item.recordId ?? item.id,
        checkedAt: item.checkedAt ?? checkedAt,
        evidenceId: item.id,
        reason: "Answer-ready legal evidence was supplied by the centralized verified legal API.",
      })),
      failures: [],
      retry: [],
    };
  }

  const failures = buildCentralizedLegalVerificationFailures(input.evidenceReadinessWarnings);
  return {
    status: "failed",
    checkedAt,
    provider,
    locators: input.originalEvidence
      .filter((item) => item.kind === "regulation")
      .map((item) => ({
        lawName: item.lawName ?? item.title,
        articleLabel: item.articleLabel,
        articleNumber: item.articleNumber,
        evidenceId: item.id,
        sourceUrl: item.sourceUrl ?? item.apiSourceUrl,
      })),
    sources: [],
    failures,
    retry: [
      "Configure VERIFIED_LEGAL_SEARCH_API_URL and VERIFIED_LEGAL_EVIDENCE_API_SECRET on the SaaS server if centralized legal verification should run here.",
      "Run verified-legal-evidence-api smoke/search validators and confirm the API returns answer-ready legal evidence for the requested task.",
      "Do not add LAW_OPEN_DATA_OC to architect-saas; keep the official law credential inside verified-legal-evidence-api.",
    ],
  };
}

function buildCentralizedLegalVerificationFailures(warnings: Array<{ code: string; message: string }>) {
  const legalWarnings = warnings.filter((warning) => /^VERIFIED_LEGAL_/.test(warning.code));
  if (legalWarnings.length > 0) {
    return legalWarnings.map((warning) => `${warning.code}: ${warning.message}`);
  }

  if (!process.env.VERIFIED_LEGAL_SEARCH_API_URL?.trim() && !process.env.VERIFIED_LEGAL_EVIDENCE_API_URL?.trim()) {
    return ["VERIFIED_LEGAL_SEARCH_API_URL is missing; legal/regulation task-review cannot be treated as verified."];
  }

  if (!process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET?.trim()) {
    return ["VERIFIED_LEGAL_EVIDENCE_API_SECRET is missing; legal/regulation task-review cannot call the centralized verified legal API."];
  }

  return ["Centralized verified legal API did not return answer-ready legal evidence for this legal/regulation task."];
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

function buildGeneratedTaskReviewConfidence(input: {
  evidence: AssistantEvidence[];
  regulationCount: number;
  lawReport: TaskReviewLegalVerificationReport;
}) {
  const evidenceCoverageBonus = Math.min(5, Math.floor(input.evidence.length / 4));
  return {
    score: Math.min(95, Math.max(60, 80 + input.regulationCount + evidenceCoverageBonus)),
    reason:
      input.lawReport.status === "verified"
        ? "Centralized verified legal evidence succeeded and the answer was generated from the server-verified evidence bundle."
        : "Centralized legal verification was not required and the answer was generated from the server-verified evidence bundle.",
  };
}

function toTaskReviewSavedRecord(record: AssistantRecord): TaskReviewSavedRecord {
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

function toTaskReviewSessionSummary(record: AssistantRecord, titleOverride?: string): TaskReviewSessionSummary {
  const taskReview = record.metadata.taskReview;
  const title = titleOverride ?? taskReview?.reviewSessionTitle ?? buildReviewSessionTitle(record.question);
  return {
    id: record.id,
    taskId: record.taskId,
    title,
    question: record.question,
    answerPreview: trimText(record.answer.replace(/\s+/g, " "), 160),
    verdict: readStoredVerdict(record),
    conclusionMayChange: taskReview?.conclusionMayChange ?? false,
    projectWikiState: taskReview?.projectWikiState ?? defaultProjectWikiReviewState(),
    savedAt: record.createdAt,
    updatedAt: record.updatedAt,
    savedRecord: toTaskReviewSavedRecord(record),
  };
}

async function findSavedTaskReviewRecord(sessionId: string): Promise<AssistantRecord> {
  const record = await assistantRepository.findRecordById(normalizeRequiredSessionText(sessionId, "sessionId"));
  if (!record || !isSavedTaskReviewRecord(record)) {
    throw notFound("Review session not found", "TASK_REVIEW_SESSION_NOT_FOUND");
  }
  return record;
}

function isSavedTaskReviewRecord(record: AssistantRecord) {
  const taskReview = record.metadata.taskReview;
  return (
    taskReview?.source === "assistant-task-review" &&
    (taskReview.savedBy === "auto" || taskReview.savedBy === "user") &&
    !record.reviewDeletedAt
  );
}

async function findSavedTaskReviewRecordIncludingDeleted(sessionId: string): Promise<AssistantRecord> {
  const record = await assistantRepository.findRecordById(normalizeRequiredSessionText(sessionId, "sessionId"));
  if (!record || !isSavedTaskReviewRecordIncludingDeleted(record)) {
    throw notFound("Review session not found", "TASK_REVIEW_SESSION_NOT_FOUND");
  }
  return record;
}

function isSavedTaskReviewRecordIncludingDeleted(record: AssistantRecord) {
  const taskReview = record.metadata.taskReview;
  return (
    taskReview?.source === "assistant-task-review" &&
    (taskReview.savedBy === "auto" || taskReview.savedBy === "user")
  );
}

function defaultProjectWikiReviewState(): ProjectWikiReviewState {
  return {
    registrationState: "not_evaluated",
    suitabilityReason: null,
    projectWikiItemId: null,
    commonCandidateRecordId: null,
    workSummaryDraftId: null,
  };
}

async function readReviewSessionTitleOverrides(projectId: string) {
  const events = await assistantRepository.listAuditEvents({
    projectId,
    limit: 250,
    eventTypes: [TASK_REVIEW_SESSION_RENAMED_EVENT],
    targetType: "assistant_review_session",
  });
  const titleBySessionId = new Map<string, string>();
  for (const event of events) {
    const title = typeof event.metadata.title === "string" ? normalizeSessionTitle(event.metadata.title) : null;
    if (event.targetId && title && !titleBySessionId.has(event.targetId)) {
      titleBySessionId.set(event.targetId, title);
    }
  }
  return titleBySessionId;
}

function isHistoryEvidence(item: AssistantEvidence) {
  return item.id.startsWith("assistant-record:") || item.kind === "task";
}

function isWikiEvidence(item: AssistantEvidence) {
  return item.kind === "project_wiki" || item.kind === "central_knowledge";
}

function buildStoredReviewLawReport(evidence: AssistantEvidence[]): TaskReviewLegalVerificationReport {
  const verifiedLegalEvidence = evidence.filter(isCentralizedVerifiedLegalEvidence);
  const checkedAt = new Date().toISOString();
  return {
    status: verifiedLegalEvidence.length > 0 ? "verified" : "not_required",
    checkedAt,
    provider: {
      name: "Task Assistant saved review session",
      docsUrl: "",
    },
    locators: verifiedLegalEvidence.map((item) => ({
      lawName: item.lawName ?? item.title,
      articleLabel: item.articleLabel,
      articleNumber: item.articleNumber,
      evidenceId: item.id,
      sourceUrl: item.sourceUrl,
    })),
    sources: verifiedLegalEvidence.map((item) => ({
      status: "verified" as const,
      lawName: item.lawName ?? item.title,
      articleLabel: item.articleLabel,
      articleNumber: item.articleNumber,
      apiUrl: item.apiSourceUrl ?? item.sourceUrl ?? "",
      checkedAt: item.checkedAt ?? checkedAt,
      evidenceId: item.id,
      reason: "Stored from Task Assistant temporary review-session save.",
    })),
    failures: [],
    retry: [],
  };
}

function readStoredVerdict(record: AssistantRecord) {
  const answerVerdict = /(?:최종\s*)?판정\s*[:：]\s*(가능|불가|조건부|추가확인필요|판단보류)/.exec(record.answer);
  return answerVerdict?.[1] ?? null;
}

function buildReviewSessionTitle(question: string) {
  return trimText(question.replace(/\s+/g, " "), 48) || "저장된 검토";
}

function normalizeSessionTitle(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? trimText(normalized, 80) : null;
}

function normalizeTaskReviewSessionExecutionMode(
  value: AssistantExecutionMode | undefined,
  generated: AssistantGenerateResult | null | undefined,
): AssistantExecutionMode {
  if (value === "local-chatgpt-codex" || value === "mock" || value === "unavailable" || value === "saas-api") {
    return value;
  }
  return generated?.executionMode ?? "saas-api";
}

function normalizeTaskReviewSessionRuntimeMode(
  value: string | undefined,
  executionMode: AssistantExecutionMode,
  providerCallMode: "mock" | "live",
) {
  const normalized = normalizeRuntimeMode(value);
  if (normalized) {
    return normalized;
  }
  if (executionMode === "local-chatgpt-codex") {
    return "extension-native-bridge-in-page";
  }
  if (executionMode === "mock") {
    return "daily-task-panel";
  }
  if (executionMode === "unavailable") {
    return "unavailable";
  }
  return providerCallMode === "live" ? "task-review-live-provider" : "task-review-mock-provider";
}

function normalizeRuntimeMode(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && /^[A-Za-z0-9._:-]{1,80}$/.test(normalized) ? normalized : null;
}

function normalizeRequiredSessionText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw badRequest(`${field} is required`, `TASK_REVIEW_${field.toUpperCase()}_REQUIRED`);
  }
  return normalized;
}

function buildStructuredReviewPreview(
  question: string,
  evidence: AssistantEvidence[],
  lawReport: TaskReviewLegalVerificationReport,
  omittedRegulationCount = 0,
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
    warnings: buildWarnings(lawReport, evidence, omittedRegulationCount),
    evidenceConflicts: [],
    confidence: {
      score: lawReport.status === "verified" ? 82 : 64,
      reason: `서버 retrieval evidence ${evidence.length}건과 공식 법규 검증 상태 ${lawReport.status}를 기준으로 산정했습니다.`,
    },
    wikiCandidateDraft:
      lawReport.status === "verified"
        ? {
            allowed: true,
            title: trimText(question || "검증 법령 task review 후보", 80),
            summary: "중앙 verified legal API 검증을 통과한 뒤 user-bound LLM 실행 결과를 바탕으로 후보 초안을 저장할 수 있습니다.",
            tags: ["verified-legal-api", "task-review"].slice(0, 12),
            sourceEvidenceIds: evidenceIds,
          }
        : null,
  };
}

export function attachGeneratedAnswerToStructuredReviewSchema(
  schema: StructuredTaskReviewSchema,
  answerMarkdown: string,
  draftSummary: AssistantGenerateResult["suggestedDraftSummary"],
  confidenceScore: number,
  confidenceReason: string,
): StructuredTaskReviewSchema {
  const draftConclusion = trimTextToMaxLength(draftSummary.conclusion, 500);

  return {
    ...schema,
    answerMarkdown: trimTextToMaxLength(answerMarkdown, 12000),
    checklistItems: schema.checklistItems.map((item) => ({
      ...item,
      status: item.status === "blocked" ? "blocked" : "needs_review",
    })),
    confidence: {
      score: clampConfidenceScore(confidenceScore),
      reason: trimTextToMaxLength(confidenceReason, 500),
    },
    wikiCandidateDraft: schema.wikiCandidateDraft
      ? {
          ...schema.wikiCandidateDraft,
          summary: draftConclusion || trimTextToMaxLength(schema.wikiCandidateDraft.summary, 500),
          tags: mergeWikiCandidateTags(schema.wikiCandidateDraft.tags, draftSummary.tags),
          sourceEvidenceIds: schema.wikiCandidateDraft.sourceEvidenceIds,
        }
      : null,
  };
}

function buildWarnings(
  lawReport: TaskReviewLegalVerificationReport,
  evidence: AssistantEvidence[],
  omittedRegulationCount = 0,
): StructuredTaskReviewSchema["warnings"] {
  const warnings: StructuredTaskReviewSchema["warnings"] = [];
  if (omittedRegulationCount > 0) {
    warnings.push({
      message: `${omittedRegulationCount}건의 regulation seed는 중앙 verified legal API의 answer-ready 근거가 아니어서 생성 근거에서 제외했습니다.`,
      severity: "warning",
      evidenceIds: [],
    });
  }
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

function trimTextToMaxLength(value: string, maxLength: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function clampConfidenceScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function mergeWikiCandidateTags(existingTags: string[], generatedTags: string[]) {
  return [...new Set([...existingTags, ...generatedTags].map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}
