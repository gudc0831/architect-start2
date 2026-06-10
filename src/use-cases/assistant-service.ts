import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantLegalEvidenceMetadata,
  AssistantExecutionMode,
  AssistantThreadMessage,
  AssistantRecord,
  AssistantTaskContext,
  AssistantWorkSummaryDraft,
} from "@/domains/assistant/types";
import type { ProjectContextTraceSnapshot } from "@/domains/assistant/saas-api-mode";
import { buildThreadMemory, type AssistantThreadMemoryMessage } from "@/domains/assistant/thread-memory";
import type {
  AssistantActionAuditAction,
  AssistantActionAuditRecord,
} from "@/domains/assistant/saas-api-mode";
import {
  assistantActionEventType,
  isActionAuditRelevantToTask,
  normalizeActionAuditSummary,
  toAssistantActionAuditRecord,
} from "@/domains/assistant/action-audit";
import {
  externalEvidenceToAssistantEvidence,
  isExternalEvidenceSourceType,
  type ExternalEvidenceSourceType,
} from "@/domains/assistant/external-evidence";
import { getFileAnalysisEntries } from "@/domains/file/analysis";
import type { FileAnalysisEntry, FileAnalysisSourceType } from "@/domains/file/analysis";
import type { AuthUser } from "@/domains/auth/types";
import { searchFoundationRegulations } from "@/domains/regulation/foundation";
import { regulationSearchResultToEvidence, type RegulationSearchResult } from "@/domains/regulation/knowledge";
import type { TaskRecord } from "@/domains/task/types";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { fileRepository, taskRepository } from "@/repositories";
import { requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";
import { fetchVerifiedLegalSearchEvidence, selectLegalSearchContext } from "@/use-cases/verified-legal-search-service";
import { withVerifiedLegalServiceHeaders } from "@/use-cases/verified-legal-service-request";
import { retrieveProjectContextForTaskReview } from "@/use-cases/project-context-retrieval-service";
import { randomUUID } from "node:crypto";

const ASSISTANT_MEMORY_RETRIEVAL_QUERY_LIMIT = 6000;

type RetrieveAssistantEvidenceInput = {
  taskId: string;
  question: string;
  user?: AuthUser;
};

type EvidenceReadinessWarning = {
  code: string;
  message: string;
};

type VerifiedLegalEvidenceBundleResult = {
  evidence: AssistantEvidence[];
  warnings: EvidenceReadinessWarning[];
};

type SaveAssistantRecordInput = {
  taskId: string;
  question: string;
  answer: string;
  evidence?: AssistantEvidence[];
  confidenceScore?: number;
  confidenceReason?: string;
  executionMode?: AssistantExecutionMode;
  runtimeMode?: string;
  draftSummary?: AssistantDraftSummary | null;
};

type SaveWorkSummaryDraftInput = {
  taskId: string;
  recordId: string;
  conclusion: string;
  tags?: string[];
  scope: string;
  followUpAction?: string;
  status?: AssistantWorkSummaryDraft["status"];
};

type SaveExternalEvidenceInput = {
  taskId: string;
  sourceType?: unknown;
  title?: unknown;
  excerpt?: unknown;
  sourceUrl?: unknown;
  toolName?: unknown;
  permissionState?: unknown;
  capturedAt?: unknown;
};

type SaveAssistantActionAuditInput = {
  action?: unknown;
  sourceTaskId?: unknown;
  targetTaskId?: unknown;
  createdTaskId?: unknown;
  assistantRecordId?: unknown;
  summary?: unknown;
  statusFrom?: unknown;
  statusTo?: unknown;
  decisionMarker?: unknown;
};

export async function getAssistantTaskContext(taskId: string): Promise<AssistantTaskContext> {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  const project = await getSelectedTaskProject();
  return toTaskContext(task, project.name);
}

export async function retrieveAssistantEvidence(input: RetrieveAssistantEvidenceInput) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const project = await getSelectedTaskProject();
  const question = normalizeText(input.question);
  const thread = await assistantRepository.findThreadByTask(task.id);
  const recentThreadMessages = thread ? await assistantRepository.listRecentThreadMessages(thread.id, 6) : [];
  const conversationMemory = buildThreadMemory({
    currentQuestion: question,
    threadSummary: thread?.summary ?? "",
    recentMessages: recentThreadMessages,
    maxRecentMessages: 6,
  });
  const retrievalQuery = buildAssistantMemoryRetrievalQuery({
    question,
    taskTitle: task.issueTitle,
    taskIssueDetail: task.issueDetailNote,
    threadSummary: thread?.summary ?? "",
    recentMessages: recentThreadMessages,
  });
  const [tasks, files, previousRecords, externalEvidence, approvedKnowledge] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    fileRepository.listFilesByTask(task.id),
    assistantRepository.listRecordsByTask(task.id),
    assistantRepository.listExternalEvidenceByTask(task.id),
    assistantRepository.searchApprovedKnowledge({ projectId: project.id, query: retrievalQuery, limit: 4 }),
  ]);
  const queryEmbedding = await createFileAnalysisQueryEmbedding(retrievalQuery);
  const projectFileAnalysisMatches = await fileRepository.searchFileAnalyses({
    projectId: project.id,
    query: retrievalQuery,
    excludedFileIds: files.map((file) => file.id),
    limit: 4,
    queryEmbedding: queryEmbedding ?? undefined,
  });
  const regulationResults = searchFoundationRegulations(retrievalQuery, 4);
  const legalSearchContext = selectLegalSearchContext({ task, projectName: project.name });
  const [verifiedLegalEvidence, verifiedLegalSearchEvidence, projectContextRetrieval] = await Promise.all([
    fetchVerifiedLegalEvidenceBundle({
      question: retrievalQuery,
      sourceIds: selectVerifiedLegalEvidenceSourceIds(),
    }),
    fetchVerifiedLegalSearchEvidence({ question: retrievalQuery, ...legalSearchContext }),
    input.user
      ? retrieveProjectContextForTaskReview({
          projectId: project.id,
          taskId: task.id,
          reviewId: randomUUID(),
          query: retrievalQuery,
          user: input.user,
        })
      : Promise.resolve(defaultProjectContextTraceResult()),
  ]);
  const mergedEvidence = mergeRetrievedAssistantEvidence({
    baseEvidence: buildEvidence({
      task,
      projectName: project.name,
      question: retrievalQuery,
      tasks,
      files,
      projectFileAnalysisMatches,
      previousRecords,
      externalEvidence,
      approvedKnowledge,
      regulationResults,
    }),
    verifiedLegalEvidence,
    verifiedLegalSearchEvidence,
  });
  const evidence = mergedEvidence.evidence;
  const hasFileAnalysisEvidence = evidence.some(
    (item) =>
      item.kind === "project_document" &&
      (item.id.startsWith("file-analysis:") || item.id.startsWith("project-file-analysis:")),
  );
  const hasProjectDocumentEvidence = evidence.some((item) => item.kind === "project_document");
  const hasExternalEvidence = externalEvidence.length > 0 || evidence.some((item) => item.kind === "web_or_skill");
  const hasRegulationEvidence = evidence.some((item) => item.kind === "regulation");
  const unavailableEvidenceKinds: AssistantEvidence["kind"][] = [];
  if (!hasRegulationEvidence) {
    unavailableEvidenceKinds.push("regulation");
  }
  if (approvedKnowledge.length === 0) {
    unavailableEvidenceKinds.push("central_knowledge");
  }
  if (!hasFileAnalysisEvidence && !hasProjectDocumentEvidence) {
    unavailableEvidenceKinds.push("project_document");
  }
  if (!hasExternalEvidence) {
    unavailableEvidenceKinds.push("web_or_skill");
  }

  return {
    taskContext: toTaskContext(task, project.name),
    evidence,
    legalEvidence: evidence.filter((item) => Boolean(item.legal)),
    projectContextChunks: projectContextRetrieval.chunks,
    projectContextTrace: {
      corpusType: "project_context" as const,
      status: projectContextRetrieval.status,
      traceId: projectContextRetrieval.traceId,
      fallbackMode: projectContextRetrieval.fallbackMode,
      activeVersionIds: projectContextRetrieval.activeVersionIds,
      candidateChunkIds: projectContextRetrieval.candidateChunkIds,
      matchedChunkIds: projectContextRetrieval.matchedChunkIds,
      includedChunkIds: projectContextRetrieval.includedChunkIds,
      noRelevantChunkReason: projectContextRetrieval.noRelevantChunkReason,
      searchErrorCode: projectContextRetrieval.searchErrorCode,
    },
    unavailableEvidenceKinds,
    evidenceReadinessWarnings: mergedEvidence.evidenceReadinessWarnings,
    conversationMemory,
  };
}

function defaultProjectContextTraceResult(): {
  status: ProjectContextTraceSnapshot["status"];
  chunks: [];
  activeVersionIds: string[];
  candidateChunkIds: string[];
  matchedChunkIds: string[];
  includedChunkIds: string[];
  traceId: string | null;
  fallbackMode: ProjectContextTraceSnapshot["fallbackMode"];
  noRelevantChunkReason: string | null;
  searchErrorCode: string | null;
} {
  return {
    status: "active_corpus_missing",
    chunks: [],
    activeVersionIds: [],
    candidateChunkIds: [],
    matchedChunkIds: [],
    includedChunkIds: [],
    traceId: null,
    fallbackMode: "none",
    noRelevantChunkReason: null,
    searchErrorCode: null,
  };
}

export function buildAssistantMemoryRetrievalQuery(input: {
  question: string;
  taskTitle: string;
  taskIssueDetail: string;
  threadSummary: string;
  recentMessages: Array<Pick<AssistantThreadMessage, "role" | "content"> | AssistantThreadMemoryMessage>;
}): string {
  const conversationMemory = buildThreadMemory({
    currentQuestion: input.question,
    threadSummary: input.threadSummary,
    recentMessages: input.recentMessages,
    maxRecentMessages: 6,
  });
  return [
    conversationMemory,
    input.taskTitle ? `Task title: ${input.taskTitle}` : "",
    input.taskIssueDetail ? `Task issue detail: ${input.taskIssueDetail}` : "",
  ]
    .map((section) => section.trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, ASSISTANT_MEMORY_RETRIEVAL_QUERY_LIMIT)
    .trim();
}

export function mergeRetrievedAssistantEvidence(input: {
  baseEvidence: AssistantEvidence[];
  verifiedLegalEvidence: VerifiedLegalEvidenceBundleResult;
  verifiedLegalSearchEvidence: VerifiedLegalEvidenceBundleResult;
}) {
  const evidence = [
    ...input.baseEvidence,
    ...input.verifiedLegalEvidence.evidence,
    ...input.verifiedLegalSearchEvidence.evidence,
  ].sort((left, right) => left.priority - right.priority);

  return {
    evidence,
    evidenceReadinessWarnings: normalizeEvidenceReadinessWarnings([
      ...input.verifiedLegalEvidence.warnings,
      ...input.verifiedLegalSearchEvidence.warnings,
      ...readLegalEvidenceReadinessWarnings(evidence),
    ]),
  };
}

function readLegalEvidenceReadinessWarnings(evidence: AssistantEvidence[]): EvidenceReadinessWarning[] {
  const warnings: EvidenceReadinessWarning[] = [];
  const seen = new Set<string>();
  for (const item of evidence) {
    if (!item.legal) {
      continue;
    }
    if (item.legal.stale) {
      const key = `stale:${item.legal.sourceId}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push({
          code: "VERIFIED_LEGAL_EVIDENCE_STALE",
          message: `Legal evidence "${item.title}" is stale and must not be treated as current legal basis.`,
        });
      }
    }
    if (item.legal.legalChangeWarnings.length > 0) {
      const key = `change:${item.legal.sourceId}:${item.legal.legalChangeWarnings.join(",")}`;
      if (!seen.has(key)) {
        seen.add(key);
        warnings.push({
          code: "VERIFIED_LEGAL_CHANGE_WARNING",
          message: `Legal evidence "${item.title}" has legal-change warnings: ${item.legal.legalChangeWarnings.join(", ")}.`,
        });
      }
    }
  }
  return warnings;
}

function normalizeEvidenceReadinessWarnings(warnings: EvidenceReadinessWarning[]): EvidenceReadinessWarning[] {
  const seen = new Set<string>();
  return warnings
    .map((warning): EvidenceReadinessWarning | null => {
      const code = redactEvidenceReadinessWarningText(normalizeText(warning.code)) || "EVIDENCE_READINESS_WARNING";
      const message = redactEvidenceReadinessWarningText(normalizeText(warning.message));
      return message ? { code, message } : null;
    })
    .filter((warning): warning is EvidenceReadinessWarning => {
      if (!warning) {
        return false;
      }
      const key = `${warning.code}:${warning.message}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .filter((warning): warning is EvidenceReadinessWarning => Boolean(warning));
}

function redactEvidenceReadinessWarningText(value: string): string {
  return redactOfficialLawCredential(value);
}

async function fetchVerifiedLegalEvidenceBundle(input: {
  question: string;
  sourceIds: string[];
}): Promise<VerifiedLegalEvidenceBundleResult> {
  const serviceUrl = process.env.VERIFIED_LEGAL_EVIDENCE_API_URL?.trim();
  if (!serviceUrl) {
    return { evidence: [], warnings: [] };
  }
  const apiSecret = process.env.VERIFIED_LEGAL_EVIDENCE_API_SECRET?.trim();
  if (!apiSecret) {
    return {
      evidence: [],
      warnings: [
        {
          code: "VERIFIED_LEGAL_EVIDENCE_API_SECRET_MISSING",
          message: "Verified Legal Evidence API is configured, but the SaaS server has no server-to-server API secret.",
        },
      ],
    };
  }
  if (input.sourceIds.length === 0) {
    return {
      evidence: [],
      warnings: [
        {
          code: "VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS_MISSING",
          message: "Verified Legal Evidence API is configured, but the SaaS server has no selected evidence source ids.",
        },
      ],
    };
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/api/evidence/bundle", serviceUrl.endsWith("/") ? serviceUrl : `${serviceUrl}/`);
  } catch {
    return {
      evidence: [],
      warnings: [
        {
          code: "VERIFIED_LEGAL_EVIDENCE_API_URL_INVALID",
          message: "Verified Legal Evidence API URL is invalid.",
        },
      ],
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: withVerifiedLegalServiceHeaders({
        "Content-Type": "application/json",
        "x-verified-legal-evidence-api-secret": apiSecret,
      }),
      body: JSON.stringify({
        question: input.question,
        sourceIds: input.sourceIds,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        evidence: [],
        warnings: [
          {
            code: "VERIFIED_LEGAL_EVIDENCE_API_HTTP_ERROR",
            message: `Verified Legal Evidence API returned ${response.status}.`,
          },
        ],
      };
    }

    return mapVerifiedLegalEvidenceBundle(await response.json());
  } catch {
    return {
      evidence: [],
      warnings: [
        {
          code: "VERIFIED_LEGAL_EVIDENCE_API_UNREACHABLE",
          message: "Verified Legal Evidence API is unavailable; existing task-review evidence was used.",
        },
      ],
    };
  } finally {
    clearTimeout(timeout);
  }
}

function mapVerifiedLegalEvidenceBundle(payload: unknown): VerifiedLegalEvidenceBundleResult {
  if (!isRecord(payload)) {
    return {
      evidence: [],
      warnings: [{ code: "VERIFIED_LEGAL_EVIDENCE_BUNDLE_INVALID", message: "Verified legal evidence bundle is invalid." }],
    };
  }

  const status = normalizeText(payload.status);
  const officialLawVerified = status === "verified" || status === "partial";
  const warnings = readVerifiedLegalEvidenceWarnings(payload.warnings);
  const evidenceItems = Array.isArray(payload.evidence) ? payload.evidence : [];
  if (status === "failed") {
    warnings.push({
      code: "VERIFIED_LEGAL_EVIDENCE_FAILED",
      message: "Verified Legal Evidence API returned failed status; official-law evidence was not treated as verified.",
    });
  }

  const evidence = evidenceItems
    .map((item, index) => mapVerifiedLegalEvidenceItem(item, index, officialLawVerified))
    .filter((item): item is AssistantEvidence => Boolean(item));

  return { evidence, warnings };
}

function selectVerifiedLegalEvidenceSourceIds(): string[] {
  return (process.env.VERIFIED_LEGAL_EVIDENCE_SOURCE_IDS ?? "")
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function mapVerifiedLegalEvidenceItem(
  value: unknown,
  index: number,
  officialLawVerified: boolean,
): AssistantEvidence | null {
  if (!isRecord(value)) {
    return null;
  }

  const serviceKind = normalizeText(value.kind);
  const kind = mapVerifiedLegalEvidenceKind(serviceKind, officialLawVerified);
  if (!kind) {
    return null;
  }

  const title = normalizeText(value.title) || "Verified legal evidence";
  const excerpt = normalizeText(value.excerpt);
  if (!excerpt) {
    return null;
  }

  const sourceId = normalizeText(value.sourceId) || normalizeText(value.id) || `item-${index}`;
  if (containsOfficialLawCredential([sourceId, title, excerpt])) {
    return null;
  }
  return {
    id: `verified-legal-evidence:${sourceId}`,
    kind,
    priority: kind === "regulation" ? 2 : kind === "project_document" ? 4 : 5,
    title,
    excerpt,
    sourceUrl: normalizeOptionalHttpUrl(value.sourceUrl),
    recordId: sourceId,
    confidenceWeight: normalizeConfidenceWeight(value.confidenceWeight, kind),
  };
}

function mapVerifiedLegalEvidenceKind(
  serviceKind: string,
  officialLawVerified: boolean,
): AssistantEvidence["kind"] | null {
  if (serviceKind === "official_law") {
    return officialLawVerified ? "regulation" : null;
  }
  if (serviceKind === "reference_file" || serviceKind === "local_ordinance") {
    return "project_document";
  }
  if (serviceKind === "expert_note") {
    return "web_or_skill";
  }

  return null;
}

function readVerifiedLegalEvidenceWarnings(value: unknown): EvidenceReadinessWarning[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }
      const code = normalizeText(item.code) || "VERIFIED_LEGAL_EVIDENCE_WARNING";
      const message = normalizeText(item.message);
      return message ? { code, message } : null;
    })
    .filter((item): item is EvidenceReadinessWarning => Boolean(item));
}

function normalizeOptionalHttpUrl(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === "oc") {
        url.searchParams.delete(key);
      }
    }
    const sanitized = url.toString();
    if (/[?&]oc=/i.test(sanitized)) {
      return undefined;
    }

    return sanitized;
  } catch {
    return undefined;
  }
}

function containsOfficialLawCredential(values: string[]) {
  return values.some((value) => /(?:^|[?&\s])oc\s*=/i.test(value));
}

function redactOfficialLawCredential(value: string) {
  return value
    .replace(/\bOC\s*=\s*[^&\s"]+/gi, "[redacted-credential]")
    .replace(/([?&])OC=[^&#\s"]*/gi, "$1OC=[redacted-credential]");
}

function normalizeConfidenceWeight(value: unknown, kind: AssistantEvidence["kind"]) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, numeric));
  }

  return kind === "regulation" ? 0.78 : kind === "project_document" ? 0.38 : 0.28;
}

async function createFileAnalysisQueryEmbedding(question: string) {
  if (process.env.ARCHITECT_FILE_EMBEDDING_QUERY_ENABLED !== "1") {
    return null;
  }
  const provider = process.env.ARCHITECT_FILE_EMBEDDING_PROVIDER?.trim() || "disabled";
  const apiKey = process.env.ARCHITECT_FILE_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  const dimensions = Number.parseInt(process.env.ARCHITECT_FILE_EMBEDDING_DIMENSIONS ?? "1536", 10);
  if (provider !== "openai" || !apiKey || dimensions !== 1536 || !question.trim()) {
    return null;
  }

  try {
    const response = await fetch(process.env.ARCHITECT_FILE_EMBEDDING_ENDPOINT?.trim() || "https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.ARCHITECT_FILE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
        input: question,
        dimensions,
      }),
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json() as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    return Array.isArray(embedding) && embedding.length === 1536 ? embedding : null;
  } catch {
    return null;
  }
}

export async function saveAssistantRecord(input: SaveAssistantRecordInput, user: AuthUser) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const question = normalizeRequiredText(input.question, "question");
  const answer = normalizeRequiredText(input.answer, "answer");
  const evidence = normalizeAssistantEvidenceForStorage(input.evidence);
  const confidence = normalizeLegalChangeConfidence(normalizeConfidence(input.confidenceScore, evidence), evidence);

  return assistantRepository.createRecord({
    projectId: task.projectId,
    taskId: task.id,
    profileId: user.id,
    question,
    answer,
    evidence,
    confidenceScore: confidence,
    confidenceReason: hasLegalChangeEvidenceImpact(evidence)
      ? buildConfidenceReason(confidence, evidence)
      : normalizeText(input.confidenceReason) || buildConfidenceReason(confidence, evidence),
    executionMode: normalizeExecutionMode(input.executionMode),
    runtimeMode: normalizeText(input.runtimeMode) || "mock",
    draftSummary: normalizeDraftSummary(input.draftSummary),
  });
}

export async function listAssistantRecords(taskId: string) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  const records = await assistantRepository.listRecordsByTask(task.id);

  return records.slice(0, 12).map((record) => ({
    id: record.id,
    taskId: record.taskId,
    question: record.question,
    answer: record.answer,
    evidenceCount: record.evidence.length,
    evidenceKinds: Array.from(new Set(record.evidence.map((item) => item.kind))),
    confidenceScore: record.confidenceScore,
    confidenceReason: record.confidenceReason,
    executionMode: record.executionMode,
    runtimeMode: record.runtimeMode,
    draftSummary: record.draftSummary,
    cleanupState: record.cleanupState,
    candidateState: record.candidateState,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }));
}

export async function listExternalEvidence(taskId: string) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  return assistantRepository.listExternalEvidenceByTask(task.id);
}

export async function listAssistantActionAudits(taskId: string): Promise<AssistantActionAuditRecord[]> {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  const events = await assistantRepository.listAuditEvents({ projectId: task.projectId, limit: 250 });

  return events
    .map(toAssistantActionAuditRecord)
    .filter((record): record is AssistantActionAuditRecord => Boolean(record))
    .filter((record) => isActionAuditRelevantToTask(record, task.id))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 50);
}

export async function saveExternalEvidence(input: SaveExternalEvidenceInput, user: AuthUser) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const sourceType = normalizeExternalSourceType(input.sourceType);
  if (input.permissionState !== "user_approved") {
    throw badRequest("permissionState must be user_approved", "EXTERNAL_EVIDENCE_PERMISSION_REQUIRED");
  }

  const externalEvidence = await assistantRepository.createExternalEvidence({
    projectId: task.projectId,
    taskId: task.id,
    createdBy: user.id,
    sourceType,
    title: normalizeRequiredText(input.title, "title"),
    excerpt: normalizeRequiredText(input.excerpt, "excerpt"),
    sourceUrl: normalizeSourceUrl(input.sourceUrl),
    toolName: normalizeOptionalText(input.toolName),
    permissionState: "user_approved",
    capturedAt: normalizeCapturedAt(input.capturedAt),
  });

  return {
    externalEvidence,
    evidence: externalEvidenceToAssistantEvidence(externalEvidence),
  };
}

export async function saveWorkSummaryDraft(input: SaveWorkSummaryDraftInput, user: AuthUser) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const record = await assistantRepository.findRecordById(normalizeRequiredId(input.recordId, "recordId"));
  if (!record || record.taskId !== task.id || record.projectId !== task.projectId) {
    throw notFound("Assistant record not found", "ASSISTANT_RECORD_NOT_FOUND");
  }

  if (record.profileId !== user.id && user.role !== "admin") {
    throw forbidden("Only the record author or an admin can update this summary.", "ASSISTANT_SUMMARY_FORBIDDEN");
  }

  const status = normalizeSummaryStatus(input.status);
  const conclusion = normalizeRequiredText(input.conclusion, "conclusion");
  const scope = normalizeRequiredText(input.scope, "scope");
  const followUpAction = normalizeText(input.followUpAction);

  if (status === "approved") {
    assertApprovedSummaryReady({ record, conclusion, scope, followUpAction });
  }

  return assistantRepository.saveWorkSummaryDraft({
    projectId: task.projectId,
    taskId: task.id,
    recordId: record.id,
    profileId: user.id,
    conclusion,
    tags: normalizeTags(input.tags),
    scope,
    followUpAction,
    status,
  });
}

export async function saveAssistantActionAudit(input: SaveAssistantActionAuditInput, user: AuthUser) {
  const action = normalizeAssistantAction(input.action);
  const sourceTask = await requireTaskInSelectedProject(normalizeRequiredId(input.sourceTaskId, "sourceTaskId"));
  const targetTask = await requireTaskInSelectedProject(normalizeRequiredId(input.targetTaskId, "targetTaskId"));
  const createdTaskId = normalizeOptionalText(input.createdTaskId) ?? null;
  const createdTask = createdTaskId ? await requireTaskInSelectedProject(createdTaskId) : null;
  const assistantRecord = await assistantRepository.findRecordById(normalizeRequiredId(input.assistantRecordId, "assistantRecordId"));

  if (!assistantRecord || assistantRecord.projectId !== sourceTask.projectId) {
    throw notFound("Assistant record not found", "ASSISTANT_RECORD_NOT_FOUND");
  }
  if (sourceTask.projectId !== targetTask.projectId || (createdTask && createdTask.projectId !== sourceTask.projectId)) {
    throw badRequest("Assistant action audit tasks must belong to the same project.", "ASSISTANT_ACTION_AUDIT_PROJECT_MISMATCH");
  }
  if (action === "follow_up_task_created" && !createdTask) {
    throw badRequest("createdTaskId is required for follow-up audit records.", "ASSISTANT_ACTION_AUDIT_CREATED_TASK_REQUIRED");
  }

  const event = await assistantRepository.createAuditEvent({
    projectId: sourceTask.projectId,
    profileId: user.id,
    eventType: assistantActionEventType(action),
    targetType: "task",
    targetId: targetTask.id,
    metadata: {
      assistantActionAuditVersion: 1,
      action,
      sourceTaskId: sourceTask.id,
      targetTaskId: targetTask.id,
      createdTaskId,
      assistantRecordId: assistantRecord.id,
      summary: normalizeActionAuditSummary(input.summary),
      statusFrom: normalizeOptionalText(input.statusFrom) ?? null,
      statusTo: normalizeOptionalText(input.statusTo) ?? null,
      decisionMarker: normalizeOptionalText(input.decisionMarker) ?? null,
    },
  });

  const record = toAssistantActionAuditRecord(event);
  if (!record) {
    throw badRequest("Assistant action audit could not be normalized.", "ASSISTANT_ACTION_AUDIT_INVALID");
  }

  return record;
}

function assertApprovedSummaryReady(input: {
  record: AssistantRecord;
  conclusion: string;
  scope: string;
  followUpAction: string;
}) {
  const blockers: string[] = [];

  if (!input.conclusion) {
    blockers.push("conclusion is required");
  }
  if (!input.scope) {
    blockers.push("scope is required");
  }
  if (!input.followUpAction) {
    blockers.push("followUpAction is required");
  }
  if (input.record.evidence.length === 0) {
    blockers.push("linked evidence is required");
  }
  if (!input.record.confidenceReason.trim()) {
    blockers.push("confidence reason is required");
  }

  if (blockers.length > 0) {
    throw badRequest(`Cannot approve work summary: ${blockers.join("; ")}`, "ASSISTANT_SUMMARY_CLOSURE_GATE_FAILED");
  }
}

function normalizeAssistantAction(value: unknown): AssistantActionAuditAction {
  if (value === "task_update_applied" || value === "follow_up_task_created") {
    return value;
  }

  throw badRequest("action is invalid", "ASSISTANT_ACTION_AUDIT_ACTION_INVALID");
}

function toTaskContext(task: TaskRecord, projectName: string): AssistantTaskContext {
  return {
    taskId: task.id,
    projectId: task.projectId,
    title: task.issueTitle,
    description: task.issueDetailNote,
    status: task.status,
    issueId: task.issueId,
    projectName,
  };
}

function buildEvidence(input: {
  task: TaskRecord;
  projectName: string;
  question: string;
  tasks: TaskRecord[];
  files: Awaited<ReturnType<typeof fileRepository.listFilesByTask>>;
  projectFileAnalysisMatches: Awaited<ReturnType<typeof fileRepository.searchFileAnalyses>>;
  previousRecords: Awaited<ReturnType<typeof assistantRepository.listRecordsByTask>>;
  externalEvidence: Awaited<ReturnType<typeof assistantRepository.listExternalEvidenceByTask>>;
  approvedKnowledge: Awaited<ReturnType<typeof assistantRepository.searchApprovedKnowledge>>;
  regulationResults: RegulationSearchResult[];
}): AssistantEvidence[] {
  const evidence: AssistantEvidence[] = input.approvedKnowledge.map((item) => ({
    id: `approved-knowledge:${item.id}`,
    kind: "central_knowledge",
    priority: 1,
    title: item.title,
    excerpt: compactExcerpt([item.summary, item.bodyMarkdown]),
    recordId: item.sourceRecordId,
    confidenceWeight: 0.86,
  }));

  for (const regulationResult of input.regulationResults) {
    evidence.push(regulationSearchResultToEvidence(regulationResult));
  }

  evidence.push(
    {
      id: `task:${input.task.id}`,
      kind: "task",
      priority: 3,
      title: `Current task ${input.task.issueId || input.task.taskNumber}`,
      excerpt: compactExcerpt([input.task.issueTitle, input.task.issueDetailNote, input.task.decision]),
      recordId: input.task.id,
      confidenceWeight: 0.78,
    },
  );

  const previousAssistantRecords = input.previousRecords.filter(
    (record) => record.runtimeMode !== "external-evidence" && !record.metadata.externalEvidence,
  );

  for (const record of previousAssistantRecords.slice(0, 2)) {
    evidence.push({
      id: `assistant-record:${record.id}`,
      kind: "task",
      priority: 3,
      title: "Previous assistant record",
      excerpt: compactExcerpt([record.question, record.answer]),
      recordId: record.id,
      confidenceWeight: 0.6,
    });
  }

  for (const task of rankRelatedTasks(input.tasks, input.task, input.question).slice(0, 3)) {
    evidence.push({
      id: `related-task:${task.id}`,
      kind: "task",
      priority: 3,
      title: `Related task ${task.issueId || task.taskNumber}`,
      excerpt: compactExcerpt([task.issueTitle, task.issueDetailNote, task.decision]),
      recordId: task.id,
      confidenceWeight: 0.52,
    });
  }

  for (const file of input.files.slice(0, 3)) {
    const fileAnalysis = getUsableFileAnalysis(file.metadata).slice(0, 2);
    if (fileAnalysis.length > 0) {
      for (const analysis of fileAnalysis) {
        evidence.push({
          id: `file-analysis:${file.id}:${analysis.id}`,
          kind: "project_document",
          priority: 4,
          title: `${file.originalName} / ${formatFileAnalysisSource(analysis.sourceType)}`,
          excerpt: compactExcerpt([formatFileAnalysisNotice(analysis), analysis.summary, analysis.extractedText]),
          recordId: file.id,
          confidenceWeight: analysis.confidenceWeight,
        });
      }
      continue;
    }

    evidence.push({
      id: `file:${file.id}`,
      kind: "project_document",
      priority: 4,
      title: file.originalName,
      excerpt: `Attached file for ${input.task.issueId || "current task"} in ${input.projectName}. Text extraction has not been confirmed yet.`,
      recordId: file.id,
      confidenceWeight: 0.25,
    });
  }

  for (const match of input.projectFileAnalysisMatches.slice(0, 4)) {
    evidence.push({
      id: `project-file-analysis:${match.file.id}:${match.analysis.id}`,
      kind: "project_document",
      priority: 4,
      title: `Project document ${match.file.originalName} / ${formatFileAnalysisSource(match.analysis.sourceType)}`,
      excerpt: compactExcerpt([formatFileAnalysisNotice(match.analysis), match.analysis.summary, match.analysis.extractedText]),
      recordId: match.file.id,
      confidenceWeight: Math.min(0.62, Math.max(match.analysis.confidenceWeight, 0.42)),
    });
  }

  for (const externalEvidence of input.externalEvidence.slice(0, 3)) {
    evidence.push(externalEvidenceToAssistantEvidence(externalEvidence));
  }

  return evidence.sort((left, right) => left.priority - right.priority);
}

function getUsableFileAnalysis(metadata: unknown): FileAnalysisEntry[] {
  return getFileAnalysisEntries(metadata)
    .filter((entry) => entry.verificationState !== "rejected" && (entry.summary || entry.extractedText))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function formatFileAnalysisSource(sourceType: FileAnalysisSourceType) {
  switch (sourceType) {
    case "document_text":
      return "document text";
    case "ocr_text":
      return "OCR text";
    case "image_region":
      return "image region";
    case "manual_text":
    default:
      return "manual analysis";
  }
}

function formatFileAnalysisNotice(entry: FileAnalysisEntry) {
  if (entry.verificationState === "user_confirmed") {
    return "User-confirmed file evidence.";
  }

  if (entry.sourceType === "ocr_text" || entry.sourceType === "image_region") {
    return "Unconfirmed OCR/image evidence. Do not use as final official judgment before user review.";
  }

  return "Unconfirmed file evidence. Use as a review lead until the user confirms it.";
}

function rankRelatedTasks(tasks: TaskRecord[], currentTask: TaskRecord, question: string) {
  const terms = new Set(question.toLowerCase().split(/\s+/).filter((term) => term.length >= 2));
  return tasks
    .filter((task) => task.id !== currentTask.id)
    .map((task) => ({
      task,
      score: scoreText(`${task.issueTitle} ${task.issueDetailNote} ${task.decision}`, terms),
    }))
    .filter((entry) => entry.score > 0 || entry.task.workType === currentTask.workType)
    .sort((left, right) => right.score - left.score || right.task.updatedAt.localeCompare(left.task.updatedAt))
    .map((entry) => entry.task);
}

function scoreText(text: string, terms: Set<string>) {
  const haystack = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      score += 1;
    }
  }
  return score;
}

function compactExcerpt(parts: Array<string | null | undefined>) {
  const excerpt = parts.map((part) => normalizeText(part)).filter(Boolean).join(" / ");
  return excerpt.length > 600 ? `${excerpt.slice(0, 597)}...` : excerpt;
}

export function normalizeAssistantEvidenceForStorage(value: unknown): AssistantEvidence[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const evidence: AssistantEvidence[] = [];

  value.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return;
      }

      const record = entry as Partial<AssistantEvidence>;
      const normalized = {
        id: normalizeText(record.id) || `evidence:${index}`,
        kind: normalizeEvidenceKind(record.kind),
        priority: Number.isFinite(record.priority) ? Number(record.priority) : index + 1,
        title: normalizeText(record.title) || "Evidence",
        excerpt: normalizeText(record.excerpt),
        sourceUrl: normalizeOptionalHttpUrl(record.sourceUrl),
        recordId: normalizeOptionalText(record.recordId),
        confidenceWeight: Number.isFinite(record.confidenceWeight) ? Number(record.confidenceWeight) : undefined,
        officialSourceName: normalizeOptionalText(record.officialSourceName),
        lawName: normalizeOptionalText(record.lawName),
        articleLabel: normalizeOptionalText(record.articleLabel),
        articleNumber: normalizeOptionalText(record.articleNumber),
        effectiveDate: normalizeOptionalText(record.effectiveDate),
        checkedAt: normalizeOptionalText(record.checkedAt),
        apiSourceUrl: normalizeOptionalHttpUrl(record.apiSourceUrl),
        verificationStatus: normalizeVerificationStatus(record.verificationStatus),
        legal: normalizeLegalEvidenceMetadata(record.legal),
      } satisfies AssistantEvidence;
      if (normalized.excerpt) {
        evidence.push(normalized);
      }
    });

  return evidence;
}

function normalizeLegalEvidenceMetadata(value: unknown): AssistantLegalEvidenceMetadata | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sourceId = normalizeRedactedText(value.sourceId);
  const sourceKind = normalizeText(value.sourceKind);
  const authorityRank = normalizeText(value.authorityRank);
  if (!sourceId || !isLegalSourceAuthorityPair(sourceKind, authorityRank)) {
    return undefined;
  }
  const effective = normalizeLegalEffectiveRange(value.effective);
  const locator = normalizeLegalLocator(value.locator);
  return {
    sourceId,
    chunkId: normalizeOptionalRedactedText(value.chunkId),
    sourceKind,
    authorityRank,
    ...(effective ? { effective } : {}),
    ...(locator ? { locator } : {}),
    stale: value.stale === true,
    legalChangeWarnings: Array.isArray(value.legalChangeWarnings)
      ? value.legalChangeWarnings
        .map((warning) => normalizeRedactedText(warning))
        .filter(Boolean)
      : [],
    confidenceReason: normalizeOptionalRedactedText(value.confidenceReason),
  };
}

function normalizeVerificationStatus(value: unknown): AssistantEvidence["verificationStatus"] | undefined {
  return value === "verified" || value === "needs_review" || value === "failed" ? value : undefined;
}

function isLegalSourceAuthorityPair(sourceKind: string, authorityRank: string): boolean {
  return legalEvidenceAuthorityRankBySourceKind[sourceKind] === authorityRank;
}

function normalizeLegalEffectiveRange(value: unknown): AssistantLegalEvidenceMetadata["effective"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const effectiveFrom = normalizeOptionalText(value.effectiveFrom);
  const effectiveTo = normalizeOptionalText(value.effectiveTo);
  const promulgatedAt = normalizeOptionalText(value.promulgatedAt);
  if (!effectiveFrom && !effectiveTo && !promulgatedAt) {
    return undefined;
  }
  return {
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveTo ? { effectiveTo } : {}),
    ...(promulgatedAt ? { promulgatedAt } : {}),
  };
}

function normalizeLegalLocator(value: unknown): Record<string, unknown> | undefined {
  const normalized = sanitizeLegalLocatorValue(value);
  return isRecord(normalized) && Object.keys(normalized).length > 0 ? normalized : undefined;
}

function sanitizeLegalLocatorValue(value: unknown): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return normalizeOptionalHttpUrl(trimmed) ?? redactOfficialLawCredential(trimmed);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean" || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map(sanitizeLegalLocatorValue)
      .filter((item) => item !== undefined);
    return normalized.length > 0 ? normalized : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }

  const normalized: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = rawKey.trim();
    if (!key || key.toLowerCase() === "oc") {
      continue;
    }
    if (/oc\s*=/i.test(key) || redactOfficialLawCredential(key) !== key) {
      continue;
    }
    const sanitized = sanitizeLegalLocatorValue(rawValue);
    if (sanitized !== undefined) {
      normalized[key] = sanitized;
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeEvidenceKind(value: unknown): AssistantEvidence["kind"] {
  return value === "central_knowledge" ||
    value === "regulation" ||
    value === "task" ||
    value === "project_document" ||
    value === "web_or_skill"
    ? value
    : "task";
}

function normalizeExternalSourceType(value: unknown): ExternalEvidenceSourceType {
  if (!isExternalEvidenceSourceType(value)) {
    throw badRequest("sourceType is invalid", "EXTERNAL_EVIDENCE_SOURCE_TYPE_INVALID");
  }

  return value;
}

function normalizeSourceUrl(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported protocol");
    }

    return url.toString();
  } catch {
    throw badRequest("sourceUrl must be a valid http(s) URL", "EXTERNAL_EVIDENCE_SOURCE_URL_INVALID");
  }
}

function normalizeCapturedAt(value: unknown) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return new Date().toISOString();
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw badRequest("capturedAt must be a valid date", "EXTERNAL_EVIDENCE_CAPTURED_AT_INVALID");
  }

  return parsed.toISOString();
}

function normalizeDraftSummary(value: unknown): AssistantDraftSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Partial<AssistantDraftSummary>;
  const conclusion = normalizeText(source.conclusion);
  const scope = normalizeText(source.scope);
  if (!conclusion || !scope) {
    return null;
  }

  return {
    conclusion,
    tags: normalizeTags(source.tags),
    scope,
    followUpAction: normalizeOptionalText(source.followUpAction),
  };
}

function normalizeConfidence(value: unknown, evidence: AssistantEvidence[]) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(100, Math.round(numeric)));
  }

  if (evidence.length === 0) {
    return 25;
  }

  const averageWeight =
    evidence.reduce((total, item) => total + Math.max(0, Math.min(1, item.confidenceWeight ?? 0.5)), 0) / evidence.length;
  return Math.max(30, Math.min(85, Math.round(averageWeight * 100)));
}

function buildConfidenceReason(score: number, evidence: AssistantEvidence[]) {
  if (hasLegalChangeEvidenceImpact(evidence)) {
    return `Legal change detected; confidence is capped at ${score}% and requires legal-change review before use as current legal basis.`;
  }

  if (evidence.length === 0) {
    return "저장된 근거가 없어 신뢰도를 낮게 산정했습니다.";
  }

  return `SaaS task/project 근거 ${evidence.length}건을 기준으로 산정했습니다. 이 점수는 법적 확정이나 인허가 가능성 보장이 아닙니다. (${score}%)`;
}

function normalizeLegalChangeConfidence(score: number, evidence: AssistantEvidence[]) {
  return hasLegalChangeEvidenceImpact(evidence) ? Math.min(score, 45) : score;
}

function hasLegalChangeEvidenceImpact(evidence: AssistantEvidence[]) {
  return evidence.some((item) => item.legal?.stale || (item.legal?.legalChangeWarnings.length ?? 0) > 0);
}

function normalizeExecutionMode(value: unknown): AssistantExecutionMode {
  return value === "local-chatgpt-codex" || value === "mock" || value === "unavailable" || value === "saas-api" ? value : "mock";
}

function normalizeSummaryStatus(value: unknown): AssistantWorkSummaryDraft["status"] {
  return value === "approved" || value === "deferred" ? value : "draft";
}

function normalizeTags(value: unknown) {
  return Array.isArray(value)
    ? value.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 12)
    : [];
}

function normalizeRequiredId(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function normalizeRequiredText(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return normalizeText(value) || undefined;
}

function normalizeOptionalRedactedText(value: unknown) {
  return normalizeRedactedText(value) || undefined;
}

function normalizeRedactedText(value: unknown) {
  return redactOfficialLawCredential(normalizeText(value)).trim();
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const legalEvidenceAuthorityRankBySourceKind: Record<string, string> = {
  administrativeAppeal: "administrative_appeal",
  administrativeRule: "administrative_rule_or_notice",
  committeeDecision: "committee_decision",
  constitutionalDecision: "constitutional_decision",
  courtPrecedent: "court_precedent",
  enforcementDecree: "enforcement_decree",
  enforcementRule: "enforcement_rule",
  localOrdinance: "local_ordinance",
  molitInterpretation: "ministry_interpretation",
  statute: "statute",
  statutoryInterpretation: "statutory_interpretation",
  supremeCourtPrecedent: "supreme_court_precedent",
};
