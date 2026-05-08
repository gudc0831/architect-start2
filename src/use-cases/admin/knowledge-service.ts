import type {
  ApprovedKnowledgeItem,
  AssistantRecord,
  AssistantWorkSummaryDraft,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";
import type { TaskRecord } from "@/domains/task/types";
import { badRequest, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { adminRepository } from "@/repositories/admin";
import { taskRepository } from "@/repositories";

export type KnowledgeCandidateListItem = {
  id: string;
  state: AssistantRecord["candidateState"];
  title: string;
  summary: string;
  tags: string[];
  projectId: string;
  projectName: string;
  taskId: string;
  taskIssueId: string;
  taskTitle: string;
  confidenceScore: number;
  cleanupState: AssistantRecord["cleanupState"];
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeCandidateDetail = KnowledgeCandidateListItem & {
  question: string;
  answer: string;
  evidence: AssistantRecord["evidence"];
  confidenceReason: string;
  draftSummary: AssistantRecord["draftSummary"];
  approvedSummary: AssistantWorkSummaryDraft | null;
  wikiDraft: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    tags: string[];
    scope: KnowledgePublicationScope;
  };
  review: AssistantRecord["metadata"]["knowledgeReview"] | null;
  approvedKnowledgeItem: ApprovedKnowledgeItem | null;
};

type ReviewKnowledgeCandidateInput =
  | {
      action: "approve";
      recordId: string;
      reviewerId: string;
      title: unknown;
      summary: unknown;
      bodyMarkdown: unknown;
      tags: unknown;
      scope: unknown;
    }
  | {
      action: "reject";
      recordId: string;
      reviewerId: string;
      rejectionReason: unknown;
    };

export async function listKnowledgeCandidates(): Promise<KnowledgeCandidateListItem[]> {
  const records = await assistantRepository.listKnowledgeCandidateRecords();
  return Promise.all(records.map(async (record) => toCandidateListItem(record)));
}

export async function getKnowledgeCandidate(recordId: string): Promise<KnowledgeCandidateDetail> {
  const record = await assistantRepository.findRecordById(normalizeRequiredText(recordId, "recordId"));
  if (!record || record.candidateState === "not_candidate") {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }

  return toCandidateDetail(record);
}

export async function reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput): Promise<KnowledgeCandidateDetail> {
  const record = await assistantRepository.findRecordById(normalizeRequiredText(input.recordId, "recordId"));
  if (!record || record.candidateState === "not_candidate") {
    throw notFound("Knowledge candidate not found", "KNOWLEDGE_CANDIDATE_NOT_FOUND");
  }

  if (input.action === "approve") {
    await assistantRepository.reviewKnowledgeCandidate({
      action: "approve",
      recordId: record.id,
      reviewerId: input.reviewerId,
      title: normalizeRequiredText(input.title, "title"),
      summary: normalizeRequiredText(input.summary, "summary"),
      bodyMarkdown: normalizeRequiredText(input.bodyMarkdown, "bodyMarkdown"),
      tags: normalizeTags(input.tags),
      scope: normalizeScope(input.scope),
    });
  } else {
    await assistantRepository.reviewKnowledgeCandidate({
      action: "reject",
      recordId: record.id,
      reviewerId: input.reviewerId,
      rejectionReason: normalizeRequiredText(input.rejectionReason, "rejectionReason"),
    });
  }

  return getKnowledgeCandidate(record.id);
}

export async function listApprovedKnowledgeItems(): Promise<ApprovedKnowledgeItem[]> {
  const records = await assistantRepository.listKnowledgeCandidateRecords({ states: ["approved"] });
  return records
    .map((record) => record.metadata.approvedKnowledgeItem)
    .filter((item): item is ApprovedKnowledgeItem => Boolean(item));
}

async function toCandidateDetail(record: AssistantRecord): Promise<KnowledgeCandidateDetail> {
  const [listItem, approvedSummary] = await Promise.all([
    toCandidateListItem(record),
    assistantRepository.findWorkSummaryDraftByRecordId(record.id),
  ]);

  const wikiDraft = buildWikiDraft(record, approvedSummary);

  return {
    ...listItem,
    question: record.question,
    answer: record.answer,
    evidence: record.evidence,
    confidenceReason: record.confidenceReason,
    draftSummary: record.draftSummary,
    approvedSummary,
    wikiDraft,
    review: record.metadata.knowledgeReview ?? null,
    approvedKnowledgeItem: record.metadata.approvedKnowledgeItem ?? null,
  };
}

async function toCandidateListItem(record: AssistantRecord): Promise<KnowledgeCandidateListItem> {
  const [task, project] = await Promise.all([
    taskRepository.findTaskById(record.taskId),
    adminRepository.getProjectById(record.projectId),
  ]);
  const approvedSummary = await assistantRepository.findWorkSummaryDraftByRecordId(record.id);
  const title = buildTitle(record, approvedSummary, task);
  const tags = approvedSummary?.tags.length ? approvedSummary.tags : record.draftSummary?.tags ?? [];

  return {
    id: record.id,
    state: record.candidateState,
    title,
    summary: buildSummary(record, approvedSummary),
    tags,
    projectId: record.projectId,
    projectName: project?.name ?? "Unknown project",
    taskId: record.taskId,
    taskIssueId: task?.issueId || (task?.taskNumber ? String(task.taskNumber) : record.taskId.slice(0, 8)),
    taskTitle: task?.issueTitle ?? "Unknown task",
    confidenceScore: record.confidenceScore,
    cleanupState: record.cleanupState,
    reviewedAt: record.metadata.knowledgeReview?.reviewedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function buildWikiDraft(record: AssistantRecord, summary: AssistantWorkSummaryDraft | null) {
  const title = buildTitle(record, summary, null);
  const tags = summary?.tags.length ? summary.tags : record.draftSummary?.tags ?? [];
  const summaryText = buildSummary(record, summary);
  const bodyMarkdown = record.metadata.approvedKnowledgeItem?.bodyMarkdown ?? [
    `# ${title}`,
    "",
    "## 요약",
    summaryText,
    "",
    "## 검토 의견",
    record.answer,
    "",
    "## 근거",
    ...record.evidence.map(formatEvidenceReference),
    "",
    "## 출처",
    `- task: ${record.taskId}`,
    `- assistant record: ${record.id}`,
  ].join("\n");

  return {
    title: record.metadata.approvedKnowledgeItem?.title ?? title,
    summary: record.metadata.approvedKnowledgeItem?.summary ?? summaryText,
    bodyMarkdown,
    tags: record.metadata.approvedKnowledgeItem?.tags ?? tags,
    scope: record.metadata.approvedKnowledgeItem?.scope ?? "organization",
  } satisfies KnowledgeCandidateDetail["wikiDraft"];
}

function formatEvidenceReference(evidence: AssistantRecord["evidence"][number]) {
  const source = evidence.sourceUrl ? ` (${evidence.sourceUrl})` : "";
  return `- ${evidence.title}${source}: ${evidence.excerpt}`;
}

function buildTitle(record: AssistantRecord, summary: AssistantWorkSummaryDraft | null, task: TaskRecord | null) {
  return (
    record.metadata.approvedKnowledgeItem?.title ??
    summary?.conclusion ??
    record.draftSummary?.conclusion ??
    task?.issueTitle ??
    record.question
  ).slice(0, 120);
}

function buildSummary(record: AssistantRecord, summary: AssistantWorkSummaryDraft | null) {
  return (
    record.metadata.approvedKnowledgeItem?.summary ??
    summary?.conclusion ??
    record.draftSummary?.conclusion ??
    record.answer
  ).slice(0, 280);
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 12);
}

function normalizeScope(value: unknown): KnowledgePublicationScope {
  return value === "admin_only" ||
    value === "organization" ||
    value === "project_members" ||
    value === "project"
    ? value
    : "organization";
}

function normalizeRequiredText(value: unknown, fieldName: string) {
  const normalized = normalizeText(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
