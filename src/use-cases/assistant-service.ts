import type {
  AssistantDraftSummary,
  AssistantEvidence,
  AssistantExecutionMode,
  AssistantTaskContext,
  AssistantWorkSummaryDraft,
} from "@/domains/assistant/types";
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

export async function getAssistantTaskContext(taskId: string): Promise<AssistantTaskContext> {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(taskId, "taskId"));
  const project = await getSelectedTaskProject();
  return toTaskContext(task, project.name);
}

export async function retrieveAssistantEvidence(input: RetrieveAssistantEvidenceInput) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const project = await getSelectedTaskProject();
  const question = normalizeText(input.question);
  const [tasks, files, previousRecords] = await Promise.all([
    taskRepository.listActiveTasks(project.id),
    fileRepository.listFilesByTask(task.id),
    assistantRepository.listRecordsByTask(task.id),
  ]);
  const evidence = buildEvidence({ task, projectName: project.name, question, tasks, files, previousRecords });

  return {
    taskContext: toTaskContext(task, project.name),
    evidence,
    unavailableEvidenceKinds: ["central_knowledge", "regulation", "project_document"] as const,
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

export async function saveWorkSummaryDraft(input: SaveWorkSummaryDraftInput, user: AuthUser) {
  const task = await requireTaskInSelectedProject(normalizeRequiredId(input.taskId, "taskId"));
  const record = await assistantRepository.findRecordById(normalizeRequiredId(input.recordId, "recordId"));
  if (!record || record.taskId !== task.id || record.projectId !== task.projectId) {
    throw notFound("Assistant record not found", "ASSISTANT_RECORD_NOT_FOUND");
  }

  if (record.profileId !== user.id && user.role !== "admin") {
    throw forbidden("Only the record author or an admin can update this summary.", "ASSISTANT_SUMMARY_FORBIDDEN");
  }

  return assistantRepository.saveWorkSummaryDraft({
    projectId: task.projectId,
    taskId: task.id,
    recordId: record.id,
    profileId: user.id,
    conclusion: normalizeRequiredText(input.conclusion, "conclusion"),
    tags: normalizeTags(input.tags),
    scope: normalizeRequiredText(input.scope, "scope"),
    followUpAction: normalizeText(input.followUpAction),
    status: normalizeSummaryStatus(input.status),
  });
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

  for (const record of input.previousRecords.slice(0, 2)) {
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
    evidence.push({
      id: `file:${file.id}`,
      kind: "project_document",
      priority: 4,
      title: file.originalName,
      excerpt: `Attached file for ${input.task.issueId || "current task"} in ${input.projectName}. Text extraction is planned for a later slice.`,
      recordId: file.id,
      confidenceWeight: 0.35,
    });
  }

  return evidence.sort((left, right) => left.priority - right.priority);
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
  return value === "local-chatgpt-codex" || value === "mock" || value === "unavailable" ? value : "mock";
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
