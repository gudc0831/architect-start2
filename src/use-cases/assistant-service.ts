import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantRecord,
  AssistantTaskContext,
  AssistantWorkSummaryDraft,
} from "@/domains/assistant/types";
import {
  externalEvidenceToAssistantEvidence,
  isExternalEvidenceSourceType,
  type ExternalEvidenceSourceType,
} from "@/domains/assistant/external-evidence";
import { getFileAnalysisEntries } from "@/domains/file/analysis";
import type { FileAnalysisEntry, FileAnalysisSourceType } from "@/domains/file/analysis";
import type { AuthUser } from "@/domains/auth/types";
import type { TaskRecord } from "@/domains/task/types";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { fileRepository, taskRepository } from "@/repositories";
import { requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";

type RetrieveAssistantEvidenceInput = {
  taskId: string;
  question: string;
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

export async function getAssistantTaskContext(taskId: string): Promise<AssistantTaskContext> {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  const project = await getSelectedTaskProject();
  return toTaskContext(task, project.name);
}

export async function retrieveAssistantEvidence(input: RetrieveAssistantEvidenceInput) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const project = await getSelectedTaskProject();
  const question = normalizeText(input.question);
  const [tasks, files, previousRecords, externalEvidence] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    fileRepository.listFilesByTask(task.id),
    assistantRepository.listRecordsByTask(task.id),
    assistantRepository.listExternalEvidenceByTask(task.id),
  ]);
  const evidence = buildEvidence({ task, projectName: project.name, question, tasks, files, previousRecords, externalEvidence });
  const hasFileAnalysisEvidence = evidence.some((item) => item.id.startsWith("file-analysis:"));
  const hasExternalEvidence = externalEvidence.length > 0;
  const unavailableEvidenceKinds: AssistantEvidence["kind"][] = ["central_knowledge", "regulation"];
  if (!hasFileAnalysisEvidence) {
    unavailableEvidenceKinds.push("project_document");
  }
  if (!hasExternalEvidence) {
    unavailableEvidenceKinds.push("web_or_skill");
  }

  return {
    taskContext: toTaskContext(task, project.name),
    evidence,
    unavailableEvidenceKinds,
  };
}

export async function saveAssistantRecord(input: SaveAssistantRecordInput, user: AuthUser) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const question = normalizeRequiredText(input.question, "question");
  const answer = normalizeRequiredText(input.answer, "answer");
  const evidence = normalizeEvidence(input.evidence);
  const confidence = normalizeConfidence(input.confidenceScore, evidence);

  return assistantRepository.createRecord({
    projectId: task.projectId,
    taskId: task.id,
    profileId: user.id,
    question,
    answer,
    evidence,
    confidenceScore: confidence,
    confidenceReason: normalizeText(input.confidenceReason) || buildConfidenceReason(confidence, evidence),
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
  previousRecords: Awaited<ReturnType<typeof assistantRepository.listRecordsByTask>>;
  externalEvidence: Awaited<ReturnType<typeof assistantRepository.listExternalEvidenceByTask>>;
}): AssistantEvidence[] {
  const evidence: AssistantEvidence[] = [
    {
      id: `task:${input.task.id}`,
      kind: "task",
      priority: 3,
      title: `Current task ${input.task.issueId || input.task.taskNumber}`,
      excerpt: compactExcerpt([input.task.issueTitle, input.task.issueDetailNote, input.task.decision]),
      recordId: input.task.id,
      confidenceWeight: 0.78,
    },
  ];

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

function normalizeEvidence(value: unknown): AssistantEvidence[] {
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
        sourceUrl: normalizeOptionalText(record.sourceUrl),
        recordId: normalizeOptionalText(record.recordId),
        confidenceWeight: Number.isFinite(record.confidenceWeight) ? Number(record.confidenceWeight) : undefined,
      } satisfies AssistantEvidence;
      if (normalized.excerpt) {
        evidence.push(normalized);
      }
    });

  return evidence;
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
  if (evidence.length === 0) {
    return "저장된 근거가 없어 신뢰도를 낮게 산정했습니다.";
  }

  return `SaaS task/project 근거 ${evidence.length}건을 기준으로 산정했습니다. 이 점수는 법적 확정이나 인허가 가능성 보장이 아닙니다. (${score}%)`;
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

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
