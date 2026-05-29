import { createHash } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type { AssistantEvidence, AssistantRecord, AssistantWorkSummaryDraft } from "@/domains/assistant/types";
import { readAssistantAction, toAssistantActionAuditRecord } from "@/domains/assistant/action-audit";
import {
  defaultAssistantRunPolicy,
  normalizeAllowedEvidenceKinds,
  summarizeEvidenceForPrompt,
  type AssistantActionAuditAction,
  type AssistantActionAuditRecord,
  type AssistantGenerateResult,
  type AssistantPolicyDecision,
  type AssistantPolicyProvider,
  type AssistantRunPolicy,
  type AssistantUsageEvent,
} from "@/domains/assistant/saas-api-mode";
import { badRequest, forbidden, notFound, serviceUnavailable } from "@/lib/api/errors";
import {
  AssistantProviderError,
  estimateCostCents,
  estimateTokens,
  runAssistantProvider,
} from "@/lib/assistant/saas-provider-adapter";
import { requireCurrentProjectAccess, requireProjectAccess } from "@/lib/auth/project-guards";
import { assistantRepository } from "@/repositories/assistant";
import { taskRepository } from "@/repositories";
import { formatTaskDisplayId } from "@/domains/task/daily-list";
import type { TaskRecord } from "@/domains/task/types";
import { retrieveAssistantEvidence } from "@/use-cases/assistant-service";

type UpdateAssistantRunPolicyInput = {
  projectId?: unknown;
  enabled?: unknown;
  provider?: unknown;
  model?: unknown;
  monthlyBudgetCents?: unknown;
  maxInputTokens?: unknown;
  maxOutputTokens?: unknown;
  externalEvidenceAllowed?: unknown;
  allowedEvidenceKinds?: unknown;
  retentionDays?: unknown;
};

type GenerateAssistantInput = {
  taskId?: unknown;
  question?: unknown;
  instruction?: unknown;
};

type GenerateAssistantWithEvidenceInput = {
  taskContext: {
    taskId: string;
    projectId: string;
    title: string;
    issueId: string;
  };
  question: string;
  instruction?: string;
  evidence: AssistantEvidence[];
  evidenceDigest: string;
  officialLawDigest: string;
  officialLawStatus: "not_required" | "verified" | "failed";
};

type GetAssistantActionAuditReviewInput = {
  projectId?: string | null;
  month?: string | null;
  limit?: string | null;
  action?: string | null;
  task?: string | null;
  assistantRecordId?: string | null;
  actorId?: string | null;
};

type GetAssistantActionAuditDetailInput = {
  auditId?: string | null;
  projectId?: string | null;
  month?: string | null;
};

type CreateAssistantActionAuditGovernanceNoteInput = GetAssistantActionAuditDetailInput & {
  category?: unknown;
  note?: unknown;
};

type GetAssistantActionAuditGovernanceNoteReportInput = {
  projectId?: string | null;
  month?: string | null;
  limit?: string | null;
  category?: string | null;
  reviewerId?: string | null;
  task?: string | null;
  assistantRecordId?: string | null;
};

type GetAssistantAuditCleanupReviewNoteReportInput = {
  projectId?: string | null;
  month?: string | null;
  limit?: string | null;
  category?: string | null;
  reviewerId?: string | null;
  archivePreviewToken?: string | null;
  cleanupId?: string | null;
  coveragePreset?: string | null;
};

type GetAssistantAuditCleanupReviewNoteSummaryInput = Omit<GetAssistantAuditCleanupReviewNoteReportInput, "limit"> & {
  staleDays?: string | null;
};
type GetAssistantAuditCleanupReviewCoverageInput = GetAssistantAuditCleanupReviewNoteSummaryInput & {
  staleDays?: string | null;
};

type GetAssistantAuditRetentionPreviewInput = {
  projectId?: string | null;
  retentionDays?: string | null;
  cutoffAt?: string | null;
  limit?: string | null;
};

type ExecuteAssistantAuditRetentionCleanupInput = GetAssistantAuditRetentionPreviewInput & {
  archivePreviewToken?: unknown;
  confirmation?: unknown;
};

type GetAssistantAuditCleanupHistoryInput = {
  projectId?: string | null;
  month?: string | null;
  actorId?: string | null;
  cutoffAt?: string | null;
  archivePreviewToken?: string | null;
  limit?: string | null;
};

type GetAssistantAuditCleanupComparisonInput = GetAssistantAuditRetentionPreviewInput & {
  month?: string | null;
  archivePreviewToken?: string | null;
};

type GetAssistantAuditCleanupDetailInput = {
  cleanupId?: string | null;
  projectId?: string | null;
  month?: string | null;
};

type CreateAssistantAuditCleanupReviewNoteInput = GetAssistantAuditCleanupDetailInput & {
  category?: unknown;
  note?: unknown;
};

export type AssistantActionAuditGovernanceNoteCategory = "review_note" | "risk" | "follow_up" | "approval_context";

export type AssistantActionAuditGovernanceNote = {
  id: string;
  sourceAuditId: string;
  sourceAssistantRecordId: string;
  category: AssistantActionAuditGovernanceNoteCategory;
  note: string;
  reviewerId: string | null;
  createdAt: string;
};

export type AdminAssistantActionAuditRecord = AssistantActionAuditRecord & {
  sourceTaskLabel: string | null;
  sourceTaskTitle: string | null;
  targetTaskLabel: string | null;
  targetTaskTitle: string | null;
  createdTaskLabel: string | null;
  createdTaskTitle: string | null;
  dailyTaskId: string;
  dailyTaskUrl: string;
};

export type AdminAssistantActionAuditTaskSnapshot = {
  id: string;
  label: string;
  title: string;
  status: string;
  decision: string;
  statusHistory: string;
  updatedAt: string;
};

export type AdminAssistantActionAuditDetail = {
  audit: AdminAssistantActionAuditRecord;
  rawAuditEvent: {
    id: string;
    eventType: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  assistantRecord: Pick<
    AssistantRecord,
    | "id"
    | "taskId"
    | "question"
    | "answer"
    | "evidence"
    | "confidenceScore"
    | "confidenceReason"
    | "executionMode"
    | "runtimeMode"
    | "draftSummary"
    | "cleanupState"
    | "candidateState"
    | "createdAt"
  > | null;
  workSummaryDraft: AssistantWorkSummaryDraft | null;
  tasks: {
    source: AdminAssistantActionAuditTaskSnapshot | null;
    target: AdminAssistantActionAuditTaskSnapshot | null;
    created: AdminAssistantActionAuditTaskSnapshot | null;
  };
  governance: {
    dailyTaskUrl: string;
    decisionMarker: string | null;
    statusTransition: string | null;
    closureState: string;
    taskHistory: string;
    provenance: string[];
  };
  governanceNotes: AssistantActionAuditGovernanceNote[];
};

export type AdminAssistantActionAuditGovernanceNoteReportItem = AssistantActionAuditGovernanceNote & {
  sourceAction: AssistantActionAuditAction;
  sourceAuditCreatedAt: string;
  sourceAuditActorId: string | null;
  sourceSummaryConclusion: string | null;
  sourceTaskId: string;
  sourceTaskLabel: string | null;
  sourceTaskTitle: string | null;
  targetTaskId: string;
  targetTaskLabel: string | null;
  targetTaskTitle: string | null;
  createdTaskId: string | null;
  createdTaskLabel: string | null;
  createdTaskTitle: string | null;
  dailyTaskUrl: string;
};

export type AdminAssistantAuditRetentionMonthCount = {
  month: string;
  total: number;
  eligible: number;
  actionAuditCount: number;
  governanceNoteCount: number;
};

export type AdminAssistantAuditRetentionArchiveItem = {
  id: string;
  eventType: string;
  targetType: string;
  targetId: string | null;
  profileId: string | null;
  createdAt: string;
  month: string;
  rawMetadata: Record<string, unknown>;
  actionAudit: AdminAssistantActionAuditRecord | null;
  governanceNote: AdminAssistantActionAuditGovernanceNoteReportItem | null;
};

export type AdminAssistantAuditRetentionPreview = {
  projectId: string;
  generatedAt: string;
  policyRetentionDays: number;
  previewRetentionDays: number;
  cutoffAt: string;
  archivePreviewToken: string;
  totalRelevantEvents: number;
  eligibleCount: number;
  protectedCount: number;
  countsByMonth: AdminAssistantAuditRetentionMonthCount[];
  archiveItems: AdminAssistantAuditRetentionArchiveItem[];
};

export type AdminAssistantAuditRetentionCleanupResult = {
  cleanupAuditId: string;
  projectId: string;
  executedAt: string;
  actorId: string | null;
  previewRetentionDays: number;
  cutoffAt: string;
  archivePreviewToken: string;
  requestedEligibleCount: number;
  deletedCount: number;
  skippedCount: number;
  deletedIds: string[];
  skippedIds: string[];
};

export type AdminAssistantAuditCleanupHistoryItem = {
  id: string;
  projectId: string;
  actorId: string | null;
  createdAt: string;
  cutoffAt: string;
  archivePreviewToken: string;
  previewRetentionDays: number;
  requestedEligibleCount: number;
  deletedCount: number;
  skippedCount: number;
  deletedIds: string[];
  skippedIds: string[];
};

export type AdminAssistantAuditCleanupHistoryReport = {
  projectId: string;
  month: string;
  filters: {
    actorId: string;
    cutoffAt: string;
    archivePreviewToken: string;
  };
  cleanups: AdminAssistantAuditCleanupHistoryItem[];
};

export type AdminAssistantAuditCleanupComparison = {
  projectId: string;
  generatedAt: string;
  previousCleanup: AdminAssistantAuditCleanupHistoryItem;
  currentPreview: {
    previewRetentionDays: number;
    cutoffAt: string;
    archivePreviewToken: string;
    eligibleCount: number;
    protectedCount: number;
  };
  newlyEligibleIds: string[];
  previouslyDeletedEligibleIds: string[];
  previouslySkippedEligibleIds: string[];
  stillProtectedCount: number;
};

export type AdminAssistantAuditCleanupDetail = {
  cleanup: AdminAssistantAuditCleanupHistoryItem;
  rawAuditEvent: {
    id: string;
    eventType: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  retentionContext: {
    archivePreviewToken: string;
    cutoffAt: string;
    previewRetentionDays: number;
    requestedEligibleCount: number;
  };
  reviewNotes: AssistantAuditCleanupReviewNote[];
};

export type AssistantAuditCleanupReviewNote = {
  id: string;
  sourceCleanupId: string;
  sourceCleanupMonth: string;
  sourceArchivePreviewToken: string;
  category: AssistantActionAuditGovernanceNoteCategory;
  note: string;
  reviewerId: string | null;
  createdAt: string;
};

export type AdminAssistantAuditCleanupReviewNoteReportItem = AssistantAuditCleanupReviewNote & {
  cleanupCreatedAt: string;
  cleanupActorId: string | null;
  cleanupCutoffAt: string;
  cleanupPreviewRetentionDays: number;
  cleanupRequestedEligibleCount: number;
  cleanupDeletedCount: number;
  cleanupSkippedCount: number;
};

export type AdminAssistantAuditCleanupReviewNoteReport = {
  projectId: string;
  month: string;
  filters: {
    category: AssistantActionAuditGovernanceNoteCategory | null;
    reviewerId: string;
    archivePreviewToken: string;
    cleanupId: string;
  };
  notes: AdminAssistantAuditCleanupReviewNoteReportItem[];
};

export type AdminAssistantAuditCleanupReviewNoteSummary = {
  projectId: string;
  month: string;
  filters: AdminAssistantAuditCleanupReviewNoteReport["filters"] & {
    coveragePreset: AssistantAuditCleanupReviewCoveragePreset;
  };
  totalNotes: number;
  totalCleanupRuns: number;
  reviewedCleanupRuns: number;
  unreviewedCleanupRuns: number;
  staleThresholdDays: number;
  staleUnreviewedCleanupRuns: number;
  categoryCounts: Array<{ category: AssistantActionAuditGovernanceNoteCategory; count: number }>;
  reviewerCounts: Array<{ reviewerId: string | null; count: number }>;
};

export type AdminAssistantAuditCleanupReviewCoverageItem = {
  cleanupId: string;
  coverageStatus: "reviewed" | "unreviewed";
  cleanupCreatedAt: string;
  cleanupActorId: string | null;
  archivePreviewToken: string;
  cutoffAt: string;
  previewRetentionDays: number;
  requestedEligibleCount: number;
  deletedCount: number;
  skippedCount: number;
  noteCount: number;
  latestNoteCreatedAt: string | null;
  reviewerIds: string[];
  staleThresholdDays: number;
  isStale: boolean;
};

export type AdminAssistantAuditCleanupReviewCoverageReport = {
  projectId: string;
  month: string;
  filters: AdminAssistantAuditCleanupReviewNoteSummary["filters"];
  coverage: AdminAssistantAuditCleanupReviewCoverageItem[];
};

type AssistantAuditCleanupReviewCoveragePreset = "all" | "reviewed" | "stale_unreviewed";

export async function getAssistantRunPolicy(input: { projectId?: string | null }, user: AuthUser) {
  const projectId = await resolveProjectId(input.projectId, user);
  return getStoredOrDefaultPolicy(projectId);
}

export async function updateAssistantRunPolicy(input: UpdateAssistantRunPolicyInput, user: AuthUser) {
  const projectId = await resolveProjectId(normalizeOptionalText(input.projectId), user);
  const current = await getStoredOrDefaultPolicy(projectId);
  const policy = await assistantRepository.upsertRunPolicy({
    projectId,
    enabled: normalizeBoolean(input.enabled, current.enabled),
    provider: normalizeProvider(input.provider, current.provider),
    model: normalizeModel(input.model, current.model),
    monthlyBudgetCents: normalizePositiveInteger(input.monthlyBudgetCents, current.monthlyBudgetCents, 0, 100000000),
    maxInputTokens: normalizePositiveInteger(input.maxInputTokens, current.maxInputTokens, 100, 200000),
    maxOutputTokens: normalizePositiveInteger(input.maxOutputTokens, current.maxOutputTokens, 100, 20000),
    externalEvidenceAllowed: normalizeBoolean(input.externalEvidenceAllowed, current.externalEvidenceAllowed),
    allowedEvidenceKinds: normalizeAllowedEvidenceKinds(input.allowedEvidenceKinds ?? current.allowedEvidenceKinds),
    retentionDays: normalizePositiveInteger(input.retentionDays, current.retentionDays, 1, 3650),
    actorId: user.id,
  });

  await assistantRepository.createAuditEvent({
    projectId,
    profileId: user.id,
    eventType: "assistant.policy.updated",
    targetType: "assistant_run_policy",
    targetId: policy.id,
    metadata: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
      allowedEvidenceKinds: policy.allowedEvidenceKinds,
    },
  });

  return policy;
}

export async function getAssistantUsageSummary(input: { projectId?: string | null; month?: string | null }, user: AuthUser) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const events = await assistantRepository.listUsageEvents({ projectId, month });
  const successfulEvents = events.filter((event) => event.status === "success");
  const blockedEvents = events.filter((event) => event.status === "blocked");
  const failedEvents = events.filter((event) => event.status === "failed");

  return {
    projectId,
    month,
    requestCount: events.length,
    successCount: successfulEvents.length,
    blockedCount: blockedEvents.length,
    failedCount: failedEvents.length,
    inputTokens: sumBy(events, "inputTokens"),
    outputTokens: sumBy(events, "outputTokens"),
    estimatedCostCents: sumBy(successfulEvents, "estimatedCostCents"),
    events,
  };
}

export async function getAssistantAuditEvents(
  input: { projectId?: string | null; month?: string | null; limit?: string | null },
  user: AuthUser,
) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 100, 1, 500);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit });

  return { projectId, month, events };
}

export async function getAssistantActionAuditReview(input: GetAssistantActionAuditReviewInput, user: AuthUser) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 250, 1, 500);
  const action = normalizeOptionalAction(input.action);
  const taskQuery = normalizeOptionalText(input.task).toLowerCase();
  const assistantRecordIdQuery = normalizeOptionalText(input.assistantRecordId).toLowerCase();
  const actorIdQuery = normalizeOptionalText(input.actorId).toLowerCase();
  const [events, tasks] = await Promise.all([
    assistantRepository.listAuditEvents({ projectId, month, limit }),
    taskRepository.listActiveTasks(projectId),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const actionRecords = events
    .map(toAssistantActionAuditRecord)
    .filter((record): record is AssistantActionAuditRecord => Boolean(record))
    .filter((record) => !action || record.action === action)
    .filter((record) => !assistantRecordIdQuery || record.assistantRecordId.toLowerCase().includes(assistantRecordIdQuery))
    .filter((record) => !actorIdQuery || String(record.createdBy ?? "").toLowerCase().includes(actorIdQuery))
    .map((record) => toAdminActionAuditRecord(record, taskById))
    .filter((record) => !taskQuery || actionAuditMatchesTaskQuery(record, taskQuery));

  return {
    projectId,
    month,
    filters: {
      action,
      task: taskQuery,
      assistantRecordId: assistantRecordIdQuery,
      actorId: actorIdQuery,
    },
    events: actionRecords,
  };
}

export async function exportAssistantActionAuditReview(input: GetAssistantActionAuditReviewInput, user: AuthUser) {
  const review = await getAssistantActionAuditReview(
    {
      ...input,
      limit: input.limit ?? "500",
    },
    user,
  );

  return {
    filename: `assistant-action-audits-${review.month}.csv`,
    csv: toActionAuditCsv(review.events),
  };
}

export async function getAssistantActionAuditGovernanceDetail(
  input: GetAssistantActionAuditDetailInput,
  user: AuthUser,
): Promise<AdminAssistantActionAuditDetail> {
  const auditId = normalizeRequiredText(input.auditId, "auditId");
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const event = events.find((item) => item.id === auditId);
  if (!event) {
    throw notFound("Assistant action audit record not found.", "ASSISTANT_ACTION_AUDIT_NOT_FOUND");
  }

  const record = toAssistantActionAuditRecord(event);
  if (!record) {
    throw notFound("Assistant action audit record not found.", "ASSISTANT_ACTION_AUDIT_NOT_FOUND");
  }

  const taskIds = [...new Set([record.sourceTaskId, record.targetTaskId, record.createdTaskId].filter(Boolean) as string[])];
  const [tasks, assistantRecord, workSummaryDraft, noteEvents] = await Promise.all([
    Promise.all(taskIds.map((taskId) => taskRepository.findTaskById(taskId))),
    assistantRepository.findRecordById(record.assistantRecordId),
    assistantRepository.findWorkSummaryDraftByRecordId(record.assistantRecordId),
    assistantRepository.listAuditEvents({ projectId, limit: 500 }),
  ]);
  const taskById = new Map(
    tasks
      .filter((task): task is TaskRecord => Boolean(task))
      .filter((task) => task.projectId === projectId)
      .map((task) => [task.id, task]),
  );

  if (assistantRecord && assistantRecord.projectId !== projectId) {
    throw notFound("Assistant record not found.", "ASSISTANT_RECORD_NOT_FOUND");
  }

  const adminRecord = toAdminActionAuditRecord(record, taskById);
  const sourceTask = taskById.get(record.sourceTaskId) ?? null;
  const targetTask = taskById.get(record.targetTaskId) ?? null;
  const createdTask = record.createdTaskId ? taskById.get(record.createdTaskId) ?? null : null;

  return {
    audit: adminRecord,
    rawAuditEvent: {
      id: event.id,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
      createdAt: event.createdAt,
    },
    assistantRecord: assistantRecord
      ? {
          id: assistantRecord.id,
          taskId: assistantRecord.taskId,
          question: assistantRecord.question,
          answer: assistantRecord.answer,
          evidence: assistantRecord.evidence,
          confidenceScore: assistantRecord.confidenceScore,
          confidenceReason: assistantRecord.confidenceReason,
          executionMode: assistantRecord.executionMode,
          runtimeMode: assistantRecord.runtimeMode,
          draftSummary: assistantRecord.draftSummary,
          cleanupState: assistantRecord.cleanupState,
          candidateState: assistantRecord.candidateState,
          createdAt: assistantRecord.createdAt,
        }
      : null,
    workSummaryDraft: workSummaryDraft?.projectId === projectId ? workSummaryDraft : null,
    tasks: {
      source: toGovernanceTaskSnapshot(sourceTask),
      target: toGovernanceTaskSnapshot(targetTask),
      created: toGovernanceTaskSnapshot(createdTask),
    },
    governance: {
      dailyTaskUrl: adminRecord.dailyTaskUrl,
      decisionMarker: record.decisionMarker,
      statusTransition: record.statusFrom || record.statusTo ? `${record.statusFrom ?? "-"} -> ${record.statusTo ?? "-"}` : null,
      closureState: workSummaryDraft?.status ?? assistantRecord?.cleanupState ?? "unknown",
      taskHistory: compactGovernanceText([targetTask?.statusHistory, createdTask?.statusHistory]),
      provenance: buildGovernanceProvenance({ record, assistantRecord, targetTask, createdTask }),
    },
    governanceNotes: noteEvents
      .map(toGovernanceNote)
      .filter((note): note is AssistantActionAuditGovernanceNote => Boolean(note))
      .filter((note) => note.sourceAuditId === auditId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export async function createAssistantActionAuditGovernanceNote(
  input: CreateAssistantActionAuditGovernanceNoteInput,
  user: AuthUser,
) {
  const auditId = normalizeRequiredText(input.auditId, "auditId");
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const sourceEvent = events.find((item) => item.id === auditId);
  if (!sourceEvent) {
    throw notFound("Assistant action audit record not found.", "ASSISTANT_ACTION_AUDIT_NOT_FOUND");
  }

  const sourceRecord = toAssistantActionAuditRecord(sourceEvent);
  if (!sourceRecord) {
    throw notFound("Assistant action audit record not found.", "ASSISTANT_ACTION_AUDIT_NOT_FOUND");
  }

  const event = await assistantRepository.createAuditEvent({
    projectId,
    profileId: user.id,
    eventType: "assistant.governance_note.created",
    targetType: "assistant_action_audit",
    targetId: auditId,
    metadata: {
      sourceAuditId: auditId,
      sourceAuditMonth: month,
      sourceAction: sourceRecord.action,
      sourceAssistantRecordId: sourceRecord.assistantRecordId,
      category: normalizeGovernanceNoteCategory(input.category),
      note: normalizeGovernanceNoteText(input.note),
    },
  });

  const note = toGovernanceNote(event);
  if (!note) {
    throw badRequest("Governance note could not be normalized.", "ASSISTANT_GOVERNANCE_NOTE_INVALID");
  }

  return note;
}

export async function exportAssistantActionAuditEvidencePackage(input: GetAssistantActionAuditDetailInput, user: AuthUser) {
  const detail = await getAssistantActionAuditGovernanceDetail(input, user);

  return {
    filename: `assistant-action-audit-${detail.audit.id}.md`,
    markdown: toAssistantActionAuditEvidencePackageMarkdown(detail),
  };
}

export async function getAssistantActionAuditGovernanceNoteReport(
  input: GetAssistantActionAuditGovernanceNoteReportInput,
  user: AuthUser,
) {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 250, 1, 500);
  const category = normalizeOptionalGovernanceNoteCategory(input.category);
  const reviewerIdQuery = normalizeOptionalText(input.reviewerId).toLowerCase();
  const taskQuery = normalizeOptionalText(input.task).toLowerCase();
  const assistantRecordIdQuery = normalizeOptionalText(input.assistantRecordId).toLowerCase();
  const [noteEvents, sourceEvents, tasks] = await Promise.all([
    assistantRepository.listAuditEvents({ projectId, month, limit: 500 }),
    assistantRepository.listAuditEvents({ projectId, limit: 500 }),
    taskRepository.listActiveTasks(projectId),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const sourceRecordById = new Map(
    sourceEvents
      .map(toAssistantActionAuditRecord)
      .filter((record): record is AssistantActionAuditRecord => Boolean(record))
      .map((record) => [record.id, toAdminActionAuditRecord(record, taskById)]),
  );
  const notes = noteEvents
    .map(toGovernanceNote)
    .filter((note): note is AssistantActionAuditGovernanceNote => Boolean(note))
    .map((note) => toGovernanceNoteReportItem(note, sourceRecordById))
    .filter((item): item is AdminAssistantActionAuditGovernanceNoteReportItem => Boolean(item))
    .filter((item) => !category || item.category === category)
    .filter((item) => !reviewerIdQuery || String(item.reviewerId ?? "").toLowerCase().includes(reviewerIdQuery))
    .filter((item) => !assistantRecordIdQuery || item.sourceAssistantRecordId.toLowerCase().includes(assistantRecordIdQuery))
    .filter((item) => !taskQuery || governanceNoteReportMatchesTaskQuery(item, taskQuery))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);

  return {
    projectId,
    month,
    filters: {
      category,
      reviewerId: reviewerIdQuery,
      task: taskQuery,
      assistantRecordId: assistantRecordIdQuery,
    },
    notes,
  };
}

export async function exportAssistantActionAuditGovernanceNoteReport(
  input: GetAssistantActionAuditGovernanceNoteReportInput,
  user: AuthUser,
) {
  const report = await getAssistantActionAuditGovernanceNoteReport(
    {
      ...input,
      limit: input.limit ?? "500",
    },
    user,
  );

  return {
    filename: `assistant-governance-notes-${report.month}.csv`,
    csv: toGovernanceNoteCsv(report.notes),
  };
}

export async function getAssistantAuditRetentionPreview(
  input: GetAssistantAuditRetentionPreviewInput,
  user: AuthUser,
): Promise<AdminAssistantAuditRetentionPreview> {
  const projectId = await resolveProjectId(input.projectId, user);
  const policy = await getStoredOrDefaultPolicy(projectId);
  const previewRetentionDays = normalizePositiveInteger(input.retentionDays, policy.retentionDays, 0, 3650);
  const limit = normalizePositiveInteger(input.limit, 500, 1, 500);
  const generatedAt = new Date();
  const cutoffAt =
    normalizeOptionalIsoDate(input.cutoffAt) ??
    new Date(generatedAt.getTime() - previewRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const [events, tasks] = await Promise.all([
    assistantRepository.listAuditEvents({ projectId, limit }),
    taskRepository.listActiveTasks(projectId),
  ]);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const sourceRecordById = new Map(
    events
      .map(toAssistantActionAuditRecord)
      .filter((record): record is AssistantActionAuditRecord => Boolean(record))
      .map((record) => [record.id, toAdminActionAuditRecord(record, taskById)]),
  );
  const archiveItems = events
    .map((event) => toRetentionArchiveItem(event, sourceRecordById, taskById))
    .filter((item): item is AdminAssistantAuditRetentionArchiveItem => Boolean(item));
  const eligibleItems = archiveItems.filter((item) => item.createdAt < cutoffAt);
  const archivePreviewToken = buildRetentionArchivePreviewToken(projectId, cutoffAt, eligibleItems);

  return {
    projectId,
    generatedAt: generatedAt.toISOString(),
    policyRetentionDays: policy.retentionDays,
    previewRetentionDays,
    cutoffAt,
    archivePreviewToken,
    totalRelevantEvents: archiveItems.length,
    eligibleCount: eligibleItems.length,
    protectedCount: archiveItems.length - eligibleItems.length,
    countsByMonth: buildRetentionMonthCounts(archiveItems, cutoffAt),
    archiveItems: eligibleItems,
  };
}

export async function exportAssistantAuditRetentionArchivePreview(
  input: GetAssistantAuditRetentionPreviewInput,
  user: AuthUser,
) {
  const preview = await getAssistantAuditRetentionPreview(input, user);

  return {
    filename: `assistant-audit-retention-archive-preview-${new Date().toISOString().slice(0, 10)}.json`,
    json: JSON.stringify(
      {
        warning: "Read-only archive preview. This export does not delete or mutate assistant audit records.",
        ...preview,
      },
      null,
      2,
    ),
  };
}

export async function executeAssistantAuditRetentionCleanup(
  input: ExecuteAssistantAuditRetentionCleanupInput,
  user: AuthUser,
): Promise<AdminAssistantAuditRetentionCleanupResult> {
  const archivePreviewToken = normalizeRequiredText(input.archivePreviewToken, "archivePreviewToken");
  const confirmation = normalizeRequiredText(input.confirmation, "confirmation");
  if (confirmation !== "DELETE_ASSISTANT_AUDIT_EVENTS") {
    throw badRequest("Cleanup confirmation text does not match.", "ASSISTANT_AUDIT_CLEANUP_CONFIRMATION_REQUIRED");
  }

  const preview = await getAssistantAuditRetentionPreview(input, user);
  if (archivePreviewToken !== preview.archivePreviewToken) {
    throw badRequest("Archive preview token does not match the current retention cutoff.", "ASSISTANT_AUDIT_CLEANUP_TOKEN_MISMATCH");
  }

  const requestedIds = preview.archiveItems.map((item) => item.id);
  const deletion = requestedIds.length
    ? await assistantRepository.deleteAuditEventsByIds({ projectId: preview.projectId, ids: requestedIds })
    : { deletedIds: [], skippedIds: [] };
  const cleanupAudit = await assistantRepository.createAuditEvent({
    projectId: preview.projectId,
    profileId: user.id,
    eventType: "assistant.audit_retention_cleanup.executed",
    targetType: "assistant_audit_retention_cleanup",
    targetId: null,
    metadata: {
      archivePreviewToken,
      cutoffAt: preview.cutoffAt,
      actorId: user.id,
      previewRetentionDays: preview.previewRetentionDays,
      requestedEligibleCount: requestedIds.length,
      deletedCount: deletion.deletedIds.length,
      skippedCount: deletion.skippedIds.length,
      deletedIds: deletion.deletedIds,
      skippedIds: deletion.skippedIds,
      countsByMonth: preview.countsByMonth,
    },
  });

  return {
    cleanupAuditId: cleanupAudit.id,
    projectId: preview.projectId,
    executedAt: cleanupAudit.createdAt,
    actorId: user.id,
    previewRetentionDays: preview.previewRetentionDays,
    cutoffAt: preview.cutoffAt,
    archivePreviewToken,
    requestedEligibleCount: requestedIds.length,
    deletedCount: deletion.deletedIds.length,
    skippedCount: deletion.skippedIds.length,
    deletedIds: deletion.deletedIds,
    skippedIds: deletion.skippedIds,
  };
}

export async function getAssistantAuditCleanupHistory(
  input: GetAssistantAuditCleanupHistoryInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupHistoryReport> {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 250, 1, 500);
  const actorIdQuery = normalizeOptionalText(input.actorId).toLowerCase();
  const cutoffAtQuery = normalizeOptionalText(input.cutoffAt).toLowerCase();
  const archivePreviewTokenQuery = normalizeOptionalText(input.archivePreviewToken).toLowerCase();
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const cleanups = events
    .map(toCleanupHistoryItem)
    .filter((item): item is AdminAssistantAuditCleanupHistoryItem => Boolean(item))
    .filter((item) => !actorIdQuery || String(item.actorId ?? "").toLowerCase().includes(actorIdQuery))
    .filter((item) => !cutoffAtQuery || item.cutoffAt.toLowerCase().includes(cutoffAtQuery))
    .filter((item) => !archivePreviewTokenQuery || item.archivePreviewToken.toLowerCase().includes(archivePreviewTokenQuery))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);

  return {
    projectId,
    month,
    filters: {
      actorId: actorIdQuery,
      cutoffAt: cutoffAtQuery,
      archivePreviewToken: archivePreviewTokenQuery,
    },
    cleanups,
  };
}

export async function exportAssistantAuditCleanupHistory(input: GetAssistantAuditCleanupHistoryInput, user: AuthUser) {
  const report = await getAssistantAuditCleanupHistory(
    {
      ...input,
      limit: input.limit ?? "500",
    },
    user,
  );

  return {
    filename: `assistant-audit-cleanups-${report.month}.csv`,
    csv: toCleanupHistoryCsv(report.cleanups),
  };
}

export async function getAssistantAuditCleanupComparison(
  input: GetAssistantAuditCleanupComparisonInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupComparison> {
  const archivePreviewToken = normalizeRequiredText(input.archivePreviewToken, "archivePreviewToken");
  const [history, preview] = await Promise.all([
    getAssistantAuditCleanupHistory(
      {
        projectId: input.projectId,
        month: input.month,
        archivePreviewToken,
        limit: "500",
      },
      user,
    ),
    getAssistantAuditRetentionPreview(input, user),
  ]);
  const previousCleanup = history.cleanups.find((cleanup) => cleanup.archivePreviewToken === archivePreviewToken);
  if (!previousCleanup) {
    throw notFound("Assistant audit cleanup history record not found.", "ASSISTANT_AUDIT_CLEANUP_NOT_FOUND");
  }

  const previousDeletedIds = new Set(previousCleanup.deletedIds);
  const previousSkippedIds = new Set(previousCleanup.skippedIds);
  const currentEligibleIds = preview.archiveItems.map((item) => item.id);

  return {
    projectId: preview.projectId,
    generatedAt: new Date().toISOString(),
    previousCleanup,
    currentPreview: {
      previewRetentionDays: preview.previewRetentionDays,
      cutoffAt: preview.cutoffAt,
      archivePreviewToken: preview.archivePreviewToken,
      eligibleCount: preview.eligibleCount,
      protectedCount: preview.protectedCount,
    },
    newlyEligibleIds: currentEligibleIds.filter((id) => !previousDeletedIds.has(id) && !previousSkippedIds.has(id)),
    previouslyDeletedEligibleIds: currentEligibleIds.filter((id) => previousDeletedIds.has(id)),
    previouslySkippedEligibleIds: currentEligibleIds.filter((id) => previousSkippedIds.has(id)),
    stillProtectedCount: preview.protectedCount,
  };
}

export async function exportAssistantAuditCleanupComparison(input: GetAssistantAuditCleanupComparisonInput, user: AuthUser) {
  const comparison = await getAssistantAuditCleanupComparison(input, user);

  return {
    filename: `assistant-audit-cleanup-comparison-${comparison.previousCleanup.archivePreviewToken}.json`,
    json: JSON.stringify(
      {
        warning: "Read-only cleanup comparison. This export does not delete or mutate assistant audit records.",
        ...comparison,
      },
      null,
      2,
    ),
  };
}

export async function getAssistantAuditCleanupDetail(
  input: GetAssistantAuditCleanupDetailInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupDetail> {
  const cleanupId = normalizeRequiredText(input.cleanupId, "cleanupId");
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const event = events.find((item) => item.id === cleanupId);
  if (!event) {
    throw notFound("Assistant audit cleanup record not found.", "ASSISTANT_AUDIT_CLEANUP_NOT_FOUND");
  }

  const cleanup = toCleanupHistoryItem(event);
  if (!cleanup) {
    throw notFound("Assistant audit cleanup record not found.", "ASSISTANT_AUDIT_CLEANUP_NOT_FOUND");
  }

  const reviewNotes = events
    .map(toCleanupReviewNote)
    .filter((note): note is AssistantAuditCleanupReviewNote => Boolean(note))
    .filter((note) => note.sourceCleanupId === cleanup.id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    cleanup,
    rawAuditEvent: {
      id: event.id,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      metadata: event.metadata,
      createdAt: event.createdAt,
    },
    retentionContext: {
      archivePreviewToken: cleanup.archivePreviewToken,
      cutoffAt: cleanup.cutoffAt,
      previewRetentionDays: cleanup.previewRetentionDays,
      requestedEligibleCount: cleanup.requestedEligibleCount,
    },
    reviewNotes,
  };
}

export async function exportAssistantAuditCleanupPackage(input: GetAssistantAuditCleanupDetailInput, user: AuthUser) {
  const detail = await getAssistantAuditCleanupDetail(input, user);

  return {
    filename: `assistant-audit-cleanup-${detail.cleanup.id}.md`,
    markdown: toCleanupDetailMarkdown(detail),
  };
}

export async function createAssistantAuditCleanupReviewNote(
  input: CreateAssistantAuditCleanupReviewNoteInput,
  user: AuthUser,
): Promise<AssistantAuditCleanupReviewNote> {
  const detail = await getAssistantAuditCleanupDetail(input, user);
  const event = await assistantRepository.createAuditEvent({
    projectId: detail.cleanup.projectId,
    profileId: user.id,
    eventType: "assistant.audit_cleanup_review_note.created",
    targetType: "assistant_audit_retention_cleanup",
    targetId: detail.cleanup.id,
    metadata: {
      sourceCleanupId: detail.cleanup.id,
      sourceCleanupMonth: detail.cleanup.createdAt.slice(0, 7),
      sourceArchivePreviewToken: detail.cleanup.archivePreviewToken,
      category: normalizeGovernanceNoteCategory(input.category),
      note: normalizeGovernanceNoteText(input.note),
      reviewerId: user.id,
    },
  });

  const note = toCleanupReviewNote(event);
  if (!note) {
    throw badRequest("Cleanup review note could not be normalized.", "ASSISTANT_AUDIT_CLEANUP_REVIEW_NOTE_INVALID");
  }

  return note;
}

export async function getAssistantAuditCleanupReviewNoteReport(
  input: GetAssistantAuditCleanupReviewNoteReportInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupReviewNoteReport> {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const limit = normalizePositiveInteger(input.limit, 250, 1, 500);
  const category = normalizeOptionalGovernanceNoteCategory(input.category);
  const reviewerQuery = normalizeOptionalText(input.reviewerId).toLowerCase();
  const tokenQuery = normalizeOptionalText(input.archivePreviewToken).toLowerCase();
  const cleanupIdQuery = normalizeOptionalText(input.cleanupId).toLowerCase();
  const coveragePreset = normalizeCleanupReviewCoveragePreset(input.coveragePreset);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit });
  const cleanupById = new Map(
    events
      .map(toCleanupHistoryItem)
      .filter((cleanup): cleanup is AdminAssistantAuditCleanupHistoryItem => Boolean(cleanup))
      .map((cleanup) => [cleanup.id, cleanup]),
  );
  const notes = events
    .map(toCleanupReviewNote)
    .filter((note): note is AssistantAuditCleanupReviewNote => Boolean(note))
    .filter((note) => !category || note.category === category)
    .filter((note) => !reviewerQuery || (note.reviewerId ?? "").toLowerCase().includes(reviewerQuery))
    .filter((note) => !tokenQuery || note.sourceArchivePreviewToken.toLowerCase().includes(tokenQuery))
    .filter((note) => !cleanupIdQuery || note.sourceCleanupId.toLowerCase().includes(cleanupIdQuery))
    .filter(() => coveragePreset !== "stale_unreviewed")
    .map((note) => toCleanupReviewNoteReportItem(note, cleanupById))
    .filter((note): note is AdminAssistantAuditCleanupReviewNoteReportItem => Boolean(note));

  return {
    projectId,
    month,
    filters: {
      category,
      reviewerId: reviewerQuery,
      archivePreviewToken: tokenQuery,
      cleanupId: cleanupIdQuery,
    },
    notes,
  };
}

export async function exportAssistantAuditCleanupReviewNoteReport(
  input: GetAssistantAuditCleanupReviewNoteReportInput,
  user: AuthUser,
) {
  const report = await getAssistantAuditCleanupReviewNoteReport(input, user);

  return {
    filename: `assistant-cleanup-review-notes-${report.month}.csv`,
    csv: toCleanupReviewNoteCsv(report.notes),
  };
}

export async function getAssistantAuditCleanupReviewNoteSummary(
  input: GetAssistantAuditCleanupReviewNoteSummaryInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupReviewNoteSummary> {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const category = normalizeOptionalGovernanceNoteCategory(input.category);
  const reviewerQuery = normalizeOptionalText(input.reviewerId).toLowerCase();
  const tokenQuery = normalizeOptionalText(input.archivePreviewToken).toLowerCase();
  const cleanupIdQuery = normalizeOptionalText(input.cleanupId).toLowerCase();
  const staleThresholdDays = normalizePositiveInteger(input.staleDays, 7, 0, 3650);
  const coveragePreset = normalizeCleanupReviewCoveragePreset(input.coveragePreset);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const cleanups = events
    .map(toCleanupHistoryItem)
    .filter((cleanup): cleanup is AdminAssistantAuditCleanupHistoryItem => Boolean(cleanup))
    .filter((cleanup) => !tokenQuery || cleanup.archivePreviewToken.toLowerCase().includes(tokenQuery))
    .filter((cleanup) => !cleanupIdQuery || cleanup.id.toLowerCase().includes(cleanupIdQuery));
  const cleanupIds = new Set(cleanups.map((cleanup) => cleanup.id));
  const notes = events
    .map(toCleanupReviewNote)
    .filter((note): note is AssistantAuditCleanupReviewNote => Boolean(note))
    .filter((note) => cleanupIds.has(note.sourceCleanupId))
    .filter((note) => !category || note.category === category)
    .filter((note) => !reviewerQuery || (note.reviewerId ?? "").toLowerCase().includes(reviewerQuery));
  const coverage = applyCleanupReviewCoveragePreset(
    toCleanupReviewCoverageItems(cleanups, notes, staleThresholdDays),
    coveragePreset,
  );
  const coverageCleanupIds = new Set(coverage.map((item) => item.cleanupId));
  const scopedNotes = notes.filter((note) => coverageCleanupIds.has(note.sourceCleanupId));
  const reviewedCleanupIds = new Set(scopedNotes.map((note) => note.sourceCleanupId));

  return {
    projectId,
    month,
    filters: {
      category,
      reviewerId: reviewerQuery,
      archivePreviewToken: tokenQuery,
      cleanupId: cleanupIdQuery,
      coveragePreset,
    },
    totalNotes: scopedNotes.length,
    totalCleanupRuns: coverage.length,
    reviewedCleanupRuns: reviewedCleanupIds.size,
    unreviewedCleanupRuns: coverage.filter((cleanup) => cleanup.coverageStatus === "unreviewed").length,
    staleThresholdDays,
    staleUnreviewedCleanupRuns: coverage.filter((cleanup) => cleanup.isStale).length,
    categoryCounts: countCleanupReviewNotesByCategory(scopedNotes),
    reviewerCounts: countCleanupReviewNotesByReviewer(scopedNotes),
  };
}

export async function getAssistantAuditCleanupReviewCoverageReport(
  input: GetAssistantAuditCleanupReviewCoverageInput,
  user: AuthUser,
): Promise<AdminAssistantAuditCleanupReviewCoverageReport> {
  const projectId = await resolveProjectId(input.projectId, user);
  const month = normalizeMonth(input.month);
  const category = normalizeOptionalGovernanceNoteCategory(input.category);
  const reviewerQuery = normalizeOptionalText(input.reviewerId).toLowerCase();
  const tokenQuery = normalizeOptionalText(input.archivePreviewToken).toLowerCase();
  const cleanupIdQuery = normalizeOptionalText(input.cleanupId).toLowerCase();
  const staleThresholdDays = normalizePositiveInteger(input.staleDays, 7, 0, 3650);
  const coveragePreset = normalizeCleanupReviewCoveragePreset(input.coveragePreset);
  const events = await assistantRepository.listAuditEvents({ projectId, month, limit: 500 });
  const cleanups = events
    .map(toCleanupHistoryItem)
    .filter((cleanup): cleanup is AdminAssistantAuditCleanupHistoryItem => Boolean(cleanup))
    .filter((cleanup) => !tokenQuery || cleanup.archivePreviewToken.toLowerCase().includes(tokenQuery))
    .filter((cleanup) => !cleanupIdQuery || cleanup.id.toLowerCase().includes(cleanupIdQuery));
  const cleanupIds = new Set(cleanups.map((cleanup) => cleanup.id));
  const notes = events
    .map(toCleanupReviewNote)
    .filter((note): note is AssistantAuditCleanupReviewNote => Boolean(note))
    .filter((note) => cleanupIds.has(note.sourceCleanupId))
    .filter((note) => !category || note.category === category)
    .filter((note) => !reviewerQuery || (note.reviewerId ?? "").toLowerCase().includes(reviewerQuery));

  return {
    projectId,
    month,
    filters: {
      category,
      reviewerId: reviewerQuery,
      archivePreviewToken: tokenQuery,
      cleanupId: cleanupIdQuery,
      coveragePreset,
    },
    coverage: applyCleanupReviewCoveragePreset(
      toCleanupReviewCoverageItems(cleanups, notes, staleThresholdDays),
      coveragePreset,
    ),
  };
}

export async function exportAssistantAuditCleanupReviewCoverageReport(
  input: GetAssistantAuditCleanupReviewCoverageInput,
  user: AuthUser,
) {
  const report = await getAssistantAuditCleanupReviewCoverageReport(input, user);

  return {
    filename: `assistant-cleanup-review-coverage-${report.month}.csv`,
    csv: toCleanupReviewCoverageCsv(report.coverage),
  };
}

export async function exportAssistantAuditCleanupReviewCoverageJson(
  input: GetAssistantAuditCleanupReviewCoverageInput,
  user: AuthUser,
) {
  const [report, summary] = await Promise.all([
    getAssistantAuditCleanupReviewCoverageReport(input, user),
    getAssistantAuditCleanupReviewNoteSummary(input, user),
  ]);

  return {
    filename: `assistant-cleanup-review-coverage-${report.month}.json`,
    json: JSON.stringify(
      {
        warning: "Read-only cleanup review coverage export. This export does not mutate cleanup notes or cleanup metadata.",
        projectId: report.projectId,
        month: report.month,
        filters: report.filters,
        summary: {
          totalNotes: summary.totalNotes,
          totalCleanupRuns: summary.totalCleanupRuns,
          reviewedCleanupRuns: summary.reviewedCleanupRuns,
          unreviewedCleanupRuns: summary.unreviewedCleanupRuns,
          staleThresholdDays: summary.staleThresholdDays,
          staleUnreviewedCleanupRuns: summary.staleUnreviewedCleanupRuns,
          categoryCounts: summary.categoryCounts,
          reviewerCounts: summary.reviewerCounts,
        },
        coverage: report.coverage,
      },
      null,
      2,
    ),
  };
}

export async function exportAssistantAuditCleanupReviewCoveragePackage(
  input: GetAssistantAuditCleanupReviewCoverageInput,
  user: AuthUser,
) {
  const [report, summary] = await Promise.all([
    getAssistantAuditCleanupReviewCoverageReport(input, user),
    getAssistantAuditCleanupReviewNoteSummary(input, user),
  ]);

  return {
    filename: `assistant-cleanup-review-rollup-${report.month}.md`,
    markdown: toCleanupReviewCoveragePackageMarkdown(report, summary),
  };
}

export async function generateAssistantWithSaasApi(input: GenerateAssistantInput, user: AuthUser): Promise<AssistantGenerateResult> {
  const taskId = normalizeRequiredText(input.taskId, "taskId");
  const question = normalizeRequiredText(input.question, "question");
  const instruction = normalizeOptionalText(input.instruction) || "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변하세요.";
  const retrieved = await retrieveAssistantEvidence({ taskId, question });

  return generateAssistantWithVerifiedEvidence(
    {
      taskContext: retrieved.taskContext,
      question,
      instruction,
      evidence: retrieved.evidence,
      evidenceDigest: createRequestHash({
        taskId: retrieved.taskContext.taskId,
        question,
        instruction,
        evidenceIds: retrieved.evidence.map((item) => item.id),
      }),
      officialLawDigest: "legacy-unverified",
      officialLawStatus: "not_required",
    },
    user,
  );
}

export async function generateAssistantWithVerifiedEvidence(
  input: GenerateAssistantWithEvidenceInput,
  user: AuthUser,
): Promise<AssistantGenerateResult> {
  const question = normalizeRequiredText(input.question, "question");
  const instruction =
    normalizeOptionalText(input.instruction) ||
    "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변하세요.";
  const policy = await getStoredOrDefaultPolicy(input.taskContext.projectId);
  const promptText = buildPromptText({
    taskTitle: input.taskContext.title,
    question,
    instruction,
    evidence: input.evidence,
  });
  const inputTokens = estimateTokens(promptText);
  const requestHash = createRequestHash({
    taskId: input.taskContext.taskId,
    question,
    instruction,
    evidenceIds: input.evidence.map((item) => item.id),
    evidenceDigest: input.evidenceDigest,
    officialLawDigest: input.officialLawDigest,
    officialLawStatus: input.officialLawStatus,
  });

  await enforcePolicy({
    policy,
    taskId: input.taskContext.taskId,
    profileId: user.id,
    evidence: input.evidence,
    inputTokens,
    requestHash,
  });

  const taskLabel = input.taskContext.issueId || input.taskContext.taskId;
  const providerResult = await runProviderOrRecordFailure({
    policy,
    taskId: input.taskContext.taskId,
    taskLabel,
    profileId: user.id,
    question,
    instruction,
    promptText,
    evidence: input.evidence,
    inputTokens,
    requestHash,
  });

  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: input.taskContext.taskId,
    profileId: user.id,
    executionMode: "saas-api",
    runtimeMode: providerResult.callMode === "live" ? "saas-api-live-provider" : "saas-api-mock-provider",
    provider: policy.provider,
    model: policy.model,
    inputTokens: providerResult.inputTokens,
    outputTokens: providerResult.outputTokens,
    estimatedCostCents: providerResult.estimatedCostCents,
    status: "success",
    policyDecision: "allowed",
    requestHash,
    metadata: {
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
      evidenceDigest: input.evidenceDigest,
      officialLawDigest: input.officialLawDigest,
      officialLawStatus: input.officialLawStatus,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      ...providerResult.metadata,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: policy.projectId,
    profileId: user.id,
    eventType: "assistant.generate.success",
    targetType: "task",
    targetId: input.taskContext.taskId,
    metadata: {
      executionMode: "saas-api",
      requestHash,
      evidenceCount: input.evidence.length,
      evidenceDigest: input.evidenceDigest,
      officialLawDigest: input.officialLawDigest,
      officialLawStatus: input.officialLawStatus,
      provider: policy.provider,
      model: policy.model,
      providerCallMode: providerResult.callMode,
      providerRequestId: providerResult.providerRequestId,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
  });

  return {
    answer: providerResult.answer,
    suggestedDraftSummary: providerResult.suggestedDraftSummary,
    citations: input.evidence.slice(0, 8).map((item) => ({
      sourceType: item.kind,
      sourceId: item.id,
      title: item.title,
    })),
    usage: {
      inputTokens: providerResult.inputTokens,
      outputTokens: providerResult.outputTokens,
      estimatedCostCents: providerResult.estimatedCostCents,
    },
    executionMode: "saas-api",
    policyDecision: "allowed",
    policy: {
      enabled: policy.enabled,
      provider: policy.provider,
      model: policy.model,
      monthlyBudgetCents: policy.monthlyBudgetCents,
    },
    provider: {
      provider: policy.provider,
      model: policy.model,
      callMode: providerResult.callMode,
      requestId: providerResult.providerRequestId,
    },
  };
}

async function runProviderOrRecordFailure(input: {
  policy: AssistantRunPolicy;
  taskId: string;
  taskLabel: string;
  profileId: string;
  question: string;
  instruction: string;
  promptText: string;
  evidence: AssistantEvidence[];
  inputTokens: number;
  requestHash: string;
}) {
  try {
    return await runAssistantProvider({
      policy: input.policy,
      taskLabel: input.taskLabel,
      question: input.question,
      instruction: input.instruction,
      promptText: input.promptText,
      evidence: input.evidence,
      estimatedInputTokens: input.inputTokens,
      requestHash: input.requestHash,
    });
  } catch (error) {
    if (error instanceof AssistantProviderError) {
      await recordFailedUsage(input, error);
      throw serviceUnavailable(error.message, error.code);
    }

    throw error;
  }
}

async function enforcePolicy(input: {
  policy: AssistantRunPolicy;
  taskId: string;
  profileId: string;
  evidence: AssistantEvidence[];
  inputTokens: number;
  requestHash: string;
}) {
  if (!input.policy.enabled) {
    await recordBlockedUsage(input, "disabled", "ASSISTANT_SAAS_API_DISABLED", "SaaS API Mode is disabled for this project.");
    throw forbidden("SaaS API Mode is disabled for this project.", "ASSISTANT_SAAS_API_DISABLED");
  }

  if (input.inputTokens > input.policy.maxInputTokens) {
    await recordBlockedUsage(input, "rate_limited", "ASSISTANT_INPUT_TOKEN_LIMIT_EXCEEDED", "Input token estimate exceeds policy.");
    throw forbidden("Input token estimate exceeds SaaS API Mode policy.", "ASSISTANT_INPUT_TOKEN_LIMIT_EXCEEDED");
  }

  if (!input.policy.externalEvidenceAllowed && input.evidence.some((item) => item.kind === "web_or_skill")) {
    await recordBlockedUsage(input, "evidence_disallowed", "ASSISTANT_EXTERNAL_EVIDENCE_DISABLED", "External evidence is disabled.");
    throw forbidden("External evidence is disabled for SaaS API Mode.", "ASSISTANT_EXTERNAL_EVIDENCE_DISABLED");
  }

  const disallowed = input.evidence.find((item) => !input.policy.allowedEvidenceKinds.includes(item.kind));
  if (disallowed) {
    await recordBlockedUsage(
      input,
      "evidence_disallowed",
      "ASSISTANT_EVIDENCE_KIND_DISALLOWED",
      `Evidence kind ${disallowed.kind} is not allowed.`,
    );
    throw forbidden(`Evidence kind ${disallowed.kind} is not allowed for SaaS API Mode.`, "ASSISTANT_EVIDENCE_KIND_DISALLOWED");
  }

  const month = normalizeMonth(null);
  const usage = await assistantRepository.listUsageEvents({ projectId: input.policy.projectId, month });
  const spentCents = usage
    .filter((event) => event.status === "success")
    .reduce((total, event) => total + event.estimatedCostCents, 0);
  const projectedCostCents = estimateCostCents(input.inputTokens, Math.min(800, input.policy.maxOutputTokens));
  if (spentCents + projectedCostCents > input.policy.monthlyBudgetCents) {
    await recordBlockedUsage(input, "budget_exceeded", "ASSISTANT_BUDGET_EXCEEDED", "Monthly assistant budget would be exceeded.");
    throw forbidden("Monthly SaaS API Mode budget would be exceeded.", "ASSISTANT_BUDGET_EXCEEDED");
  }
}

async function recordBlockedUsage(
  input: {
    policy: AssistantRunPolicy;
    taskId: string;
    profileId: string;
    evidence: AssistantEvidence[];
    inputTokens: number;
    requestHash: string;
  },
  policyDecision: AssistantPolicyDecision,
  errorCode: string,
  reason: string,
) {
  await assistantRepository.createUsageEvent({
    projectId: input.policy.projectId,
    taskId: input.taskId,
    profileId: input.profileId,
    executionMode: "saas-api",
    runtimeMode: "saas-api-foundation",
    provider: input.policy.provider,
    model: input.policy.model,
    inputTokens: input.inputTokens,
    outputTokens: 0,
    estimatedCostCents: 0,
    status: "blocked",
    policyDecision,
    requestHash: input.requestHash,
    errorCode,
    metadata: {
      reason,
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.policy.projectId,
    profileId: input.profileId,
    eventType: "assistant.generate.blocked",
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      policyDecision,
      errorCode,
      reason,
      requestHash: input.requestHash,
    },
  });
}

async function recordFailedUsage(
  input: {
    policy: AssistantRunPolicy;
    taskId: string;
    profileId: string;
    evidence: AssistantEvidence[];
    inputTokens: number;
    requestHash: string;
  },
  error: AssistantProviderError,
) {
  await assistantRepository.createUsageEvent({
    projectId: input.policy.projectId,
    taskId: input.taskId,
    profileId: input.profileId,
    executionMode: "saas-api",
    runtimeMode: "saas-api-provider-failed",
    provider: input.policy.provider,
    model: input.policy.model,
    inputTokens: input.inputTokens,
    outputTokens: 0,
    estimatedCostCents: 0,
    status: "failed",
    policyDecision: "allowed",
    requestHash: input.requestHash,
    errorCode: error.code,
    metadata: {
      reason: error.message,
      evidenceCount: input.evidence.length,
      evidenceKinds: [...new Set(input.evidence.map((item) => item.kind))],
      ...error.metadata,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.policy.projectId,
    profileId: input.profileId,
    eventType: "assistant.generate.failed",
    targetType: "task",
    targetId: input.taskId,
    metadata: {
      errorCode: error.code,
      reason: error.message,
      requestHash: input.requestHash,
      ...error.metadata,
    },
  });
}

async function getStoredOrDefaultPolicy(projectId: string) {
  return (await assistantRepository.getRunPolicy(projectId)) ?? defaultAssistantRunPolicy({ projectId });
}

async function resolveProjectId(projectId: string | null | undefined, user: AuthUser) {
  if (projectId) {
    const context = await requireProjectAccess(projectId, user);
    return context.project.id;
  }

  const context = await requireCurrentProjectAccess(user);
  return context.project.id;
}

function buildPromptText(input: { taskTitle: string; question: string; instruction: string; evidence: AssistantEvidence[] }) {
  return [
    `Task: ${input.taskTitle}`,
    `Question: ${input.question}`,
    `Instruction: ${input.instruction}`,
    "Evidence:",
    summarizeEvidenceForPrompt(input.evidence),
  ].join("\n");
}

function createRequestHash(input: {
  taskId: string;
  question: string;
  instruction: string;
  evidenceIds: string[];
  evidenceDigest?: string;
  officialLawDigest?: string;
  officialLawStatus?: "not_required" | "verified" | "failed";
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeProvider(value: unknown, fallback: AssistantPolicyProvider): AssistantPolicyProvider {
  return value === "openai" || value === "mock" ? value : fallback;
}

function normalizeOptionalAction(value: unknown): AssistantActionAuditAction | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized || normalized === "all") {
    return null;
  }

  const action = readAssistantAction(normalized);
  if (!action) {
    throw badRequest("action is invalid", "ASSISTANT_ACTION_AUDIT_ACTION_INVALID");
  }

  return action;
}

function normalizeModel(value: unknown, fallback: string) {
  const normalized = normalizeOptionalText(value);
  return normalized ? normalized.slice(0, 120) : fallback;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeMonth(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value);
  if (normalized) {
    if (!/^\d{4}-\d{2}$/.test(normalized)) {
      throw badRequest("month must be YYYY-MM", "ASSISTANT_USAGE_MONTH_INVALID");
    }

    return normalized;
  }

  return new Date().toISOString().slice(0, 7);
}

function normalizeRequiredText(value: unknown, fieldName: string) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`);
  }

  return normalized;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sumBy(events: AssistantUsageEvent[], key: "inputTokens" | "outputTokens" | "estimatedCostCents") {
  return events.reduce((total, event) => total + event[key], 0);
}

function toAdminActionAuditRecord(
  record: AssistantActionAuditRecord,
  taskById: ReadonlyMap<string, TaskRecord>,
): AdminAssistantActionAuditRecord {
  const sourceTask = taskById.get(record.sourceTaskId) ?? null;
  const targetTask = taskById.get(record.targetTaskId) ?? null;
  const createdTask = record.createdTaskId ? taskById.get(record.createdTaskId) ?? null : null;
  const dailyTaskId = record.createdTaskId ?? record.targetTaskId ?? record.sourceTaskId;

  return {
    ...record,
    sourceTaskLabel: sourceTask ? formatTaskDisplayId(sourceTask) : null,
    sourceTaskTitle: sourceTask?.issueTitle ?? null,
    targetTaskLabel: targetTask ? formatTaskDisplayId(targetTask) : null,
    targetTaskTitle: targetTask?.issueTitle ?? null,
    createdTaskLabel: createdTask ? formatTaskDisplayId(createdTask) : null,
    createdTaskTitle: createdTask?.issueTitle ?? null,
    dailyTaskId,
    dailyTaskUrl: `/daily?taskId=${encodeURIComponent(dailyTaskId)}`,
  };
}

function toGovernanceTaskSnapshot(task: TaskRecord | null): AdminAssistantActionAuditTaskSnapshot | null {
  if (!task) {
    return null;
  }

  return {
    id: task.id,
    label: formatTaskDisplayId(task),
    title: task.issueTitle,
    status: task.status,
    decision: task.decision,
    statusHistory: task.statusHistory,
    updatedAt: task.updatedAt,
  };
}

function compactGovernanceText(parts: Array<string | null | undefined>) {
  const text = parts.map((part) => normalizeOptionalText(part)).filter(Boolean).join("\n\n");
  return text.length > 1200 ? `${text.slice(0, 1197)}...` : text;
}

function buildGovernanceProvenance(input: {
  record: AssistantActionAuditRecord;
  assistantRecord: AssistantRecord | null;
  targetTask: TaskRecord | null;
  createdTask: TaskRecord | null;
}) {
  return [
    `Audit event ${input.record.id} recorded ${input.record.action}.`,
    `Assistant record ${input.record.assistantRecordId}${input.assistantRecord ? ` captured ${input.assistantRecord.evidence.length} evidence items` : " is not available"}.`,
    input.record.decisionMarker ? `Decision marker: ${input.record.decisionMarker}` : null,
    input.targetTask ? `Target task ${formatTaskDisplayId(input.targetTask)} is ${input.targetTask.status}.` : null,
    input.createdTask ? `Created task ${formatTaskDisplayId(input.createdTask)} is ${input.createdTask.status}.` : null,
  ].filter((item): item is string => Boolean(item));
}

function toGovernanceNote(event: {
  id: string;
  eventType: string;
  targetId: string | null;
  profileId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}): AssistantActionAuditGovernanceNote | null {
  if (event.eventType !== "assistant.governance_note.created") {
    return null;
  }

  const sourceAuditId = normalizeOptionalText(event.metadata.sourceAuditId) || normalizeOptionalText(event.targetId);
  const sourceAssistantRecordId = normalizeOptionalText(event.metadata.sourceAssistantRecordId);
  const category = readGovernanceNoteCategory(event.metadata.category);
  const note = normalizeOptionalText(event.metadata.note);
  if (!sourceAuditId || !sourceAssistantRecordId || !category || !note) {
    return null;
  }

  return {
    id: event.id,
    sourceAuditId,
    sourceAssistantRecordId,
    category,
    note,
    reviewerId: event.profileId,
    createdAt: event.createdAt,
  };
}

function toGovernanceNoteReportItem(
  note: AssistantActionAuditGovernanceNote,
  sourceRecordById: ReadonlyMap<string, AdminAssistantActionAuditRecord>,
): AdminAssistantActionAuditGovernanceNoteReportItem | null {
  const sourceRecord = sourceRecordById.get(note.sourceAuditId);
  if (!sourceRecord) {
    return null;
  }

  return {
    ...note,
    sourceAction: sourceRecord.action,
    sourceAuditCreatedAt: sourceRecord.createdAt,
    sourceAuditActorId: sourceRecord.createdBy,
    sourceSummaryConclusion: sourceRecord.summary?.conclusion ?? null,
    sourceTaskId: sourceRecord.sourceTaskId,
    sourceTaskLabel: sourceRecord.sourceTaskLabel,
    sourceTaskTitle: sourceRecord.sourceTaskTitle,
    targetTaskId: sourceRecord.targetTaskId,
    targetTaskLabel: sourceRecord.targetTaskLabel,
    targetTaskTitle: sourceRecord.targetTaskTitle,
    createdTaskId: sourceRecord.createdTaskId,
    createdTaskLabel: sourceRecord.createdTaskLabel,
    createdTaskTitle: sourceRecord.createdTaskTitle,
    dailyTaskUrl: sourceRecord.dailyTaskUrl,
  };
}

function toRetentionArchiveItem(
  event: {
    id: string;
    projectId: string | null;
    eventType: string;
    targetType: string;
    targetId: string | null;
    profileId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  },
  sourceRecordById: ReadonlyMap<string, AdminAssistantActionAuditRecord>,
  taskById: ReadonlyMap<string, TaskRecord>,
): AdminAssistantAuditRetentionArchiveItem | null {
  const actionRecord = toAssistantActionAuditRecord(event);
  if (actionRecord) {
    return {
      id: event.id,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      profileId: event.profileId,
      createdAt: event.createdAt,
      month: event.createdAt.slice(0, 7),
      rawMetadata: event.metadata,
      actionAudit: toAdminActionAuditRecord(actionRecord, taskById),
      governanceNote: null,
    };
  }

  const note = toGovernanceNote(event);
  if (note) {
    return {
      id: event.id,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      profileId: event.profileId,
      createdAt: event.createdAt,
      month: event.createdAt.slice(0, 7),
      rawMetadata: event.metadata,
      actionAudit: null,
      governanceNote: toGovernanceNoteReportItem(note, sourceRecordById),
    };
  }

  return null;
}

function buildRetentionMonthCounts(items: AdminAssistantAuditRetentionArchiveItem[], cutoffAt: string) {
  const countsByMonth = new Map<string, AdminAssistantAuditRetentionMonthCount>();
  for (const item of items) {
    const current = countsByMonth.get(item.month) ?? {
      month: item.month,
      total: 0,
      eligible: 0,
      actionAuditCount: 0,
      governanceNoteCount: 0,
    };
    current.total += 1;
    current.eligible += item.createdAt < cutoffAt ? 1 : 0;
    current.actionAuditCount += item.actionAudit ? 1 : 0;
    current.governanceNoteCount += item.eventType === "assistant.governance_note.created" ? 1 : 0;
    countsByMonth.set(item.month, current);
  }

  return [...countsByMonth.values()].sort((left, right) => right.month.localeCompare(left.month));
}

function buildRetentionArchivePreviewToken(
  projectId: string,
  cutoffAt: string,
  eligibleItems: AdminAssistantAuditRetentionArchiveItem[],
) {
  const eligibleIds = eligibleItems.map((item) => item.id).sort();
  return createHash("sha256")
    .update(JSON.stringify({ projectId, cutoffAt, eligibleIds }))
    .digest("hex")
    .slice(0, 24);
}

function toCleanupHistoryItem(event: {
  id: string;
  projectId: string | null;
  eventType: string;
  profileId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}): AdminAssistantAuditCleanupHistoryItem | null {
  if (event.eventType !== "assistant.audit_retention_cleanup.executed" || !event.projectId) {
    return null;
  }

  const archivePreviewToken = normalizeOptionalText(event.metadata.archivePreviewToken);
  const cutoffAt = normalizeOptionalText(event.metadata.cutoffAt);
  if (!archivePreviewToken || !cutoffAt) {
    return null;
  }

  return {
    id: event.id,
    projectId: event.projectId,
    actorId: normalizeOptionalText(event.metadata.actorId) || event.profileId,
    createdAt: event.createdAt,
    cutoffAt,
    archivePreviewToken,
    previewRetentionDays: normalizeMetadataNumber(event.metadata.previewRetentionDays),
    requestedEligibleCount: normalizeMetadataNumber(event.metadata.requestedEligibleCount),
    deletedCount: normalizeMetadataNumber(event.metadata.deletedCount),
    skippedCount: normalizeMetadataNumber(event.metadata.skippedCount),
    deletedIds: normalizeStringArray(event.metadata.deletedIds),
    skippedIds: normalizeStringArray(event.metadata.skippedIds),
  };
}

function toCleanupReviewNote(event: {
  id: string;
  eventType: string;
  targetId: string | null;
  profileId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}): AssistantAuditCleanupReviewNote | null {
  if (event.eventType !== "assistant.audit_cleanup_review_note.created") {
    return null;
  }

  const sourceCleanupId = normalizeOptionalText(event.metadata.sourceCleanupId) || normalizeOptionalText(event.targetId);
  const sourceCleanupMonth = normalizeOptionalText(event.metadata.sourceCleanupMonth) || event.createdAt.slice(0, 7);
  const sourceArchivePreviewToken = normalizeOptionalText(event.metadata.sourceArchivePreviewToken);
  const category = readGovernanceNoteCategory(event.metadata.category);
  const note = normalizeOptionalText(event.metadata.note);
  if (!sourceCleanupId || !sourceArchivePreviewToken || !category || !note) {
    return null;
  }

  return {
    id: event.id,
    sourceCleanupId,
    sourceCleanupMonth,
    sourceArchivePreviewToken,
    category,
    note,
    reviewerId: normalizeOptionalText(event.metadata.reviewerId) || event.profileId,
    createdAt: event.createdAt,
  };
}

function toCleanupReviewNoteReportItem(
  note: AssistantAuditCleanupReviewNote,
  cleanupById: ReadonlyMap<string, AdminAssistantAuditCleanupHistoryItem>,
): AdminAssistantAuditCleanupReviewNoteReportItem | null {
  const cleanup = cleanupById.get(note.sourceCleanupId);
  if (!cleanup) {
    return null;
  }

  return {
    ...note,
    cleanupCreatedAt: cleanup.createdAt,
    cleanupActorId: cleanup.actorId,
    cleanupCutoffAt: cleanup.cutoffAt,
    cleanupPreviewRetentionDays: cleanup.previewRetentionDays,
    cleanupRequestedEligibleCount: cleanup.requestedEligibleCount,
    cleanupDeletedCount: cleanup.deletedCount,
    cleanupSkippedCount: cleanup.skippedCount,
  };
}

function countCleanupReviewNotesByCategory(notes: AssistantAuditCleanupReviewNote[]) {
  const counts = new Map<AssistantActionAuditGovernanceNoteCategory, number>();
  for (const note of notes) {
    counts.set(note.category, (counts.get(note.category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function countCleanupReviewNotesByReviewer(notes: AssistantAuditCleanupReviewNote[]) {
  const counts = new Map<string | null, number>();
  for (const note of notes) {
    counts.set(note.reviewerId, (counts.get(note.reviewerId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([reviewerId, count]) => ({ reviewerId, count }))
    .sort((left, right) => right.count - left.count || (left.reviewerId ?? "").localeCompare(right.reviewerId ?? ""));
}

function toCleanupReviewCoverageItems(
  cleanups: AdminAssistantAuditCleanupHistoryItem[],
  notes: AssistantAuditCleanupReviewNote[],
  staleThresholdDays: number,
): AdminAssistantAuditCleanupReviewCoverageItem[] {
  const notesByCleanupId = new Map<string, AssistantAuditCleanupReviewNote[]>();
  const staleCutoffAt = new Date(Date.now() - staleThresholdDays * 24 * 60 * 60 * 1000).toISOString();
  for (const note of notes) {
    const current = notesByCleanupId.get(note.sourceCleanupId) ?? [];
    current.push(note);
    notesByCleanupId.set(note.sourceCleanupId, current);
  }

  return cleanups.map((cleanup) => {
    const cleanupNotes = notesByCleanupId.get(cleanup.id) ?? [];
    const reviewerIds = Array.from(new Set(cleanupNotes.map((note) => note.reviewerId).filter((id): id is string => Boolean(id)))).sort();
    const latestNoteCreatedAt = cleanupNotes
      .map((note) => note.createdAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? null;

    return {
      cleanupId: cleanup.id,
      coverageStatus: cleanupNotes.length ? "reviewed" : "unreviewed",
      cleanupCreatedAt: cleanup.createdAt,
      cleanupActorId: cleanup.actorId,
      archivePreviewToken: cleanup.archivePreviewToken,
      cutoffAt: cleanup.cutoffAt,
      previewRetentionDays: cleanup.previewRetentionDays,
      requestedEligibleCount: cleanup.requestedEligibleCount,
      deletedCount: cleanup.deletedCount,
      skippedCount: cleanup.skippedCount,
      noteCount: cleanupNotes.length,
      latestNoteCreatedAt,
      reviewerIds,
      staleThresholdDays,
      isStale: cleanupNotes.length === 0 && cleanup.createdAt < staleCutoffAt,
    };
  });
}

function applyCleanupReviewCoveragePreset(
  coverage: AdminAssistantAuditCleanupReviewCoverageItem[],
  preset: AssistantAuditCleanupReviewCoveragePreset,
) {
  if (preset === "reviewed") {
    return coverage.filter((item) => item.coverageStatus === "reviewed");
  }
  if (preset === "stale_unreviewed") {
    return coverage.filter((item) => item.coverageStatus === "unreviewed" && item.isStale);
  }
  return coverage;
}

function normalizeCleanupReviewCoveragePreset(value: unknown): AssistantAuditCleanupReviewCoveragePreset {
  const normalized = normalizeOptionalText(value).toLowerCase();
  if (!normalized || normalized === "all") {
    return "all";
  }
  if (normalized === "reviewed") {
    return "reviewed";
  }
  if (normalized === "stale_unreviewed" || normalized === "stale-unreviewed") {
    return "stale_unreviewed";
  }
  throw badRequest("coveragePreset must be all, reviewed, or stale_unreviewed.", "INVALID_CLEANUP_COVERAGE_PRESET");
}

function normalizeOptionalIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw badRequest("cutoffAt must be a valid ISO date.", "INVALID_CUTOFF_AT");
  }
  return date.toISOString();
}

function normalizeMetadataNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => normalizeOptionalText(item)).filter(Boolean) : [];
}

function normalizeGovernanceNoteCategory(value: unknown): AssistantActionAuditGovernanceNoteCategory {
  const category = readGovernanceNoteCategory(value);
  if (!category) {
    throw badRequest("category is invalid", "ASSISTANT_GOVERNANCE_NOTE_CATEGORY_INVALID");
  }

  return category;
}

function readGovernanceNoteCategory(value: unknown): AssistantActionAuditGovernanceNoteCategory | null {
  return value === "review_note" || value === "risk" || value === "follow_up" || value === "approval_context" ? value : null;
}

function normalizeOptionalGovernanceNoteCategory(value: unknown): AssistantActionAuditGovernanceNoteCategory | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized || normalized === "all") {
    return null;
  }

  return normalizeGovernanceNoteCategory(normalized);
}

function normalizeGovernanceNoteText(value: unknown) {
  const note = normalizeRequiredText(value, "note");
  if (note.length > 1200) {
    throw badRequest("note must be 1200 characters or fewer", "ASSISTANT_GOVERNANCE_NOTE_TOO_LONG");
  }

  return note;
}

function actionAuditMatchesTaskQuery(record: AdminAssistantActionAuditRecord, taskQuery: string) {
  return [
    record.sourceTaskId,
    record.targetTaskId,
    record.createdTaskId,
    record.sourceTaskLabel,
    record.sourceTaskTitle,
    record.targetTaskLabel,
    record.targetTaskTitle,
    record.createdTaskLabel,
    record.createdTaskTitle,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(taskQuery));
}

function governanceNoteReportMatchesTaskQuery(item: AdminAssistantActionAuditGovernanceNoteReportItem, taskQuery: string) {
  return [
    item.sourceTaskId,
    item.sourceTaskLabel,
    item.sourceTaskTitle,
    item.targetTaskId,
    item.targetTaskLabel,
    item.targetTaskTitle,
    item.createdTaskId,
    item.createdTaskLabel,
    item.createdTaskTitle,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(taskQuery));
}

function toActionAuditCsv(records: AdminAssistantActionAuditRecord[]) {
  const headers = [
    "audit_id",
    "action",
    "created_at",
    "actor_id",
    "source_task_id",
    "source_task_label",
    "source_task_title",
    "target_task_id",
    "target_task_label",
    "target_task_title",
    "created_task_id",
    "created_task_label",
    "created_task_title",
    "assistant_record_id",
    "daily_task_url",
    "status_from",
    "status_to",
    "conclusion",
    "scope",
    "follow_up_action",
    "tags",
    "decision_marker",
  ];

  const rows = records.map((record) => [
    record.id,
    record.action,
    record.createdAt,
    record.createdBy ?? "",
    record.sourceTaskId,
    record.sourceTaskLabel ?? "",
    record.sourceTaskTitle ?? "",
    record.targetTaskId,
    record.targetTaskLabel ?? "",
    record.targetTaskTitle ?? "",
    record.createdTaskId ?? "",
    record.createdTaskLabel ?? "",
    record.createdTaskTitle ?? "",
    record.assistantRecordId,
    record.dailyTaskUrl,
    record.statusFrom ?? "",
    record.statusTo ?? "",
    record.summary?.conclusion ?? "",
    record.summary?.scope ?? "",
    record.summary?.followUpAction ?? "",
    record.summary?.tags.join("; ") ?? "",
    record.decisionMarker ?? "",
  ]);

  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\r\n") + "\r\n";
}

function toGovernanceNoteCsv(notes: AdminAssistantActionAuditGovernanceNoteReportItem[]) {
  const headers = [
    "note_id",
    "category",
    "note_created_at",
    "reviewer_id",
    "source_audit_id",
    "source_action",
    "source_audit_created_at",
    "source_actor_id",
    "assistant_record_id",
    "daily_task_url",
    "source_task_id",
    "source_task_label",
    "source_task_title",
    "target_task_id",
    "target_task_label",
    "target_task_title",
    "created_task_id",
    "created_task_label",
    "created_task_title",
    "source_summary_conclusion",
    "note",
  ];

  const rows = notes.map((note) => [
    note.id,
    note.category,
    note.createdAt,
    note.reviewerId ?? "",
    note.sourceAuditId,
    note.sourceAction,
    note.sourceAuditCreatedAt,
    note.sourceAuditActorId ?? "",
    note.sourceAssistantRecordId,
    note.dailyTaskUrl,
    note.sourceTaskId,
    note.sourceTaskLabel ?? "",
    note.sourceTaskTitle ?? "",
    note.targetTaskId,
    note.targetTaskLabel ?? "",
    note.targetTaskTitle ?? "",
    note.createdTaskId ?? "",
    note.createdTaskLabel ?? "",
    note.createdTaskTitle ?? "",
    note.sourceSummaryConclusion ?? "",
    note.note,
  ]);

  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\r\n") + "\r\n";
}

function toCleanupHistoryCsv(cleanups: AdminAssistantAuditCleanupHistoryItem[]) {
  const headers = [
    "cleanup_audit_id",
    "created_at",
    "actor_id",
    "cutoff_at",
    "archive_preview_token",
    "preview_retention_days",
    "requested_eligible_count",
    "deleted_count",
    "skipped_count",
    "deleted_ids",
    "skipped_ids",
  ];

  const rows = cleanups.map((cleanup) => [
    cleanup.id,
    cleanup.createdAt,
    cleanup.actorId ?? "",
    cleanup.cutoffAt,
    cleanup.archivePreviewToken,
    String(cleanup.previewRetentionDays),
    String(cleanup.requestedEligibleCount),
    String(cleanup.deletedCount),
    String(cleanup.skippedCount),
    cleanup.deletedIds.join("; "),
    cleanup.skippedIds.join("; "),
  ]);

  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\r\n") + "\r\n";
}

function toCleanupReviewNoteCsv(notes: AdminAssistantAuditCleanupReviewNoteReportItem[]) {
  const headers = [
    "note_id",
    "category",
    "note_created_at",
    "reviewer_id",
    "cleanup_id",
    "cleanup_created_at",
    "cleanup_actor_id",
    "archive_preview_token",
    "cutoff_at",
    "preview_retention_days",
    "requested_eligible_count",
    "deleted_count",
    "skipped_count",
    "note",
  ];

  const rows = notes.map((note) => [
    note.id,
    note.category,
    note.createdAt,
    note.reviewerId ?? "",
    note.sourceCleanupId,
    note.cleanupCreatedAt,
    note.cleanupActorId ?? "",
    note.sourceArchivePreviewToken,
    note.cleanupCutoffAt,
    String(note.cleanupPreviewRetentionDays),
    String(note.cleanupRequestedEligibleCount),
    String(note.cleanupDeletedCount),
    String(note.cleanupSkippedCount),
    note.note,
  ]);

  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\r\n") + "\r\n";
}

function toCleanupReviewCoverageCsv(coverage: AdminAssistantAuditCleanupReviewCoverageItem[]) {
  const headers = [
    "cleanup_id",
    "coverage_status",
    "cleanup_created_at",
    "cleanup_actor_id",
    "archive_preview_token",
    "cutoff_at",
    "preview_retention_days",
    "requested_eligible_count",
    "deleted_count",
    "skipped_count",
    "note_count",
    "latest_note_created_at",
    "reviewer_ids",
    "stale_threshold_days",
    "is_stale",
  ];
  const rows = coverage.map((item) => [
    item.cleanupId,
    item.coverageStatus,
    item.cleanupCreatedAt,
    item.cleanupActorId ?? "",
    item.archivePreviewToken,
    item.cutoffAt,
    String(item.previewRetentionDays),
    String(item.requestedEligibleCount),
    String(item.deletedCount),
    String(item.skippedCount),
    String(item.noteCount),
    item.latestNoteCreatedAt ?? "",
    item.reviewerIds.join("; "),
    String(item.staleThresholdDays),
    item.isStale ? "true" : "false",
  ]);

  return [headers, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\r\n") + "\r\n";
}

function toCleanupReviewCoveragePackageMarkdown(
  report: AdminAssistantAuditCleanupReviewCoverageReport,
  summary: AdminAssistantAuditCleanupReviewNoteSummary,
) {
  return [
    "# Assistant Audit Cleanup Review Rollup",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Project id: ${report.projectId}`,
    `Month: ${report.month}`,
    "",
    "## Filters",
    "",
    `- Category: ${report.filters.category ?? "all"}`,
    `- Reviewer: ${report.filters.reviewerId || "all"}`,
    `- Archive preview token: ${report.filters.archivePreviewToken || "all"}`,
    `- Cleanup id: ${report.filters.cleanupId || "all"}`,
    `- Coverage preset: ${report.filters.coveragePreset}`,
    "",
    "## Summary",
    "",
    `- Cleanup notes: ${summary.totalNotes}`,
    `- Total cleanup runs: ${summary.totalCleanupRuns}`,
    `- Reviewed cleanup runs: ${summary.reviewedCleanupRuns}`,
    `- Unreviewed cleanup runs: ${summary.unreviewedCleanupRuns}`,
    `- Stale threshold days: ${summary.staleThresholdDays}`,
    `- Stale unreviewed cleanup runs: ${summary.staleUnreviewedCleanupRuns}`,
    "",
    "## Category Counts",
    "",
    summary.categoryCounts.length
      ? summary.categoryCounts.map((item) => `- ${item.category}: ${item.count}`).join("\n")
      : "- No category counts.",
    "",
    "## Reviewer Counts",
    "",
    summary.reviewerCounts.length
      ? summary.reviewerCounts.map((item) => `- ${item.reviewerId ?? "-"}: ${item.count}`).join("\n")
      : "- No reviewer counts.",
    "",
    "## Coverage Rows",
    "",
    report.coverage.length
      ? report.coverage
          .map((item) =>
            [
              `### ${item.coverageStatus}: ${item.cleanupId}`,
              "",
              `- Archive preview token: ${item.archivePreviewToken}`,
              `- Created at: ${item.cleanupCreatedAt}`,
              `- Actor id: ${item.cleanupActorId ?? "-"}`,
              `- Cutoff: ${item.cutoffAt}`,
              `- Deleted/skipped: ${item.deletedCount}/${item.skippedCount}`,
              `- Note count: ${item.noteCount}`,
              `- Latest note: ${item.latestNoteCreatedAt ?? "-"}`,
              `- Reviewers: ${item.reviewerIds.length ? item.reviewerIds.join(", ") : "-"}`,
              `- Stale: ${item.isStale ? "yes" : "no"}`,
            ].join("\n"),
          )
          .join("\n\n")
      : "No cleanup coverage rows match the current filters.",
    "",
  ].join("\n");
}

function toCleanupDetailMarkdown(detail: AdminAssistantAuditCleanupDetail) {
  const cleanup = detail.cleanup;

  return [
    "# Assistant Audit Cleanup Evidence Package",
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Cleanup audit id: ${cleanup.id}`,
    `Created at: ${cleanup.createdAt}`,
    `Actor id: ${cleanup.actorId ?? "-"}`,
    "",
    "## Retention Context",
    "",
    `- Archive preview token: ${cleanup.archivePreviewToken}`,
    `- Cutoff: ${cleanup.cutoffAt}`,
    `- Preview retention days: ${cleanup.previewRetentionDays}`,
    `- Requested eligible count: ${cleanup.requestedEligibleCount}`,
    "",
    "## Cleanup Counts",
    "",
    `- Deleted count: ${cleanup.deletedCount}`,
    `- Skipped count: ${cleanup.skippedCount}`,
    "",
    "## Deleted IDs",
    "",
    cleanup.deletedIds.length ? cleanup.deletedIds.map((id) => `- ${id}`).join("\n") : "- None",
    "",
    "## Skipped IDs",
    "",
    cleanup.skippedIds.length ? cleanup.skippedIds.map((id) => `- ${id}`).join("\n") : "- None",
    "",
    "## Cleanup Review Notes",
    "",
    detail.reviewNotes.length
      ? detail.reviewNotes
          .map(
            (note) =>
              [`### ${note.category}`, "", `- Note id: ${note.id}`, `- Reviewer: ${note.reviewerId ?? "-"}`, `- Created at: ${note.createdAt}`, "", formatMarkdownBlock(note.note)].join("\n"),
          )
          .join("\n\n")
      : "No cleanup review notes have been added.",
    "",
    "## Raw Cleanup Audit Metadata",
    "",
    "```json",
    JSON.stringify(detail.rawAuditEvent.metadata, null, 2),
    "```",
    "",
  ].join("\n");
}

function formatCsvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  return safeValue;
}

function toAssistantActionAuditEvidencePackageMarkdown(detail: AdminAssistantActionAuditDetail) {
  const assistant = detail.assistantRecord;
  const summary = detail.workSummaryDraft ?? assistant?.draftSummary ?? null;

  return [
    `# Assistant Action Audit Evidence Package`,
    "",
    `Generated at: ${new Date().toISOString()}`,
    `Audit id: ${detail.audit.id}`,
    `Action: ${detail.audit.action}`,
    `Created at: ${detail.audit.createdAt}`,
    `Actor id: ${detail.audit.createdBy ?? "-"}`,
    `Daily task link: ${detail.governance.dailyTaskUrl}`,
    "",
    "## Audit Event",
    "",
    `- Event type: ${detail.rawAuditEvent.eventType}`,
    `- Target: ${detail.rawAuditEvent.targetType}:${detail.rawAuditEvent.targetId ?? "-"}`,
    `- Assistant record: ${detail.audit.assistantRecordId}`,
    `- Status transition: ${detail.governance.statusTransition ?? "-"}`,
    `- Decision marker: ${detail.governance.decisionMarker ?? "-"}`,
    "",
    "## Assistant Record",
    "",
    assistant
      ? [
          `- ID: ${assistant.id}`,
          `- Task ID: ${assistant.taskId}`,
          `- Execution: ${assistant.executionMode} / ${assistant.runtimeMode}`,
          `- Confidence: ${assistant.confidenceScore}%`,
          `- Confidence reason: ${assistant.confidenceReason || "-"}`,
          `- Evidence count: ${assistant.evidence.length}`,
          `- Cleanup state: ${assistant.cleanupState}`,
          `- Candidate state: ${assistant.candidateState}`,
          "",
          "### Question",
          "",
          formatMarkdownBlock(assistant.question),
          "",
          "### Answer",
          "",
          formatMarkdownBlock(assistant.answer),
        ].join("\n")
      : "Assistant record was not available.",
    "",
    "## Closure Fields",
    "",
    `- State: ${detail.governance.closureState}`,
    `- Conclusion: ${summary?.conclusion || "-"}`,
    `- Scope: ${summary?.scope || "-"}`,
    `- Follow-up: ${summary?.followUpAction || "-"}`,
    `- Tags: ${summary?.tags?.join(", ") || "-"}`,
    "",
    "## Task Snapshots",
    "",
    formatTaskSnapshotMarkdown("Source", detail.tasks.source),
    "",
    formatTaskSnapshotMarkdown("Target", detail.tasks.target),
    "",
    formatTaskSnapshotMarkdown("Created", detail.tasks.created),
    "",
    "## Provenance",
    "",
    detail.governance.provenance.length
      ? detail.governance.provenance.map((item) => `- ${item}`).join("\n")
      : "- No provenance entries.",
    "",
    "## Governance Notes",
    "",
    detail.governanceNotes.length
      ? detail.governanceNotes
          .map(
            (note) =>
              [`### ${note.category}`, "", `- Note id: ${note.id}`, `- Reviewer: ${note.reviewerId ?? "-"}`, `- Created at: ${note.createdAt}`, "", formatMarkdownBlock(note.note)].join("\n"),
          )
          .join("\n\n")
      : "No governance notes have been added.",
    "",
    "## Raw Audit Metadata",
    "",
    "```json",
    JSON.stringify(detail.rawAuditEvent.metadata, null, 2),
    "```",
    "",
  ].join("\n");
}

function formatTaskSnapshotMarkdown(label: string, task: AdminAssistantActionAuditTaskSnapshot | null) {
  if (!task) {
    return `### ${label}\n\nTask snapshot was not available.`;
  }

  return [
    `### ${label}`,
    "",
    `- ID: ${task.id}`,
    `- Label: ${task.label}`,
    `- Title: ${task.title}`,
    `- Status: ${task.status}`,
    `- Updated at: ${task.updatedAt}`,
    "",
    "Decision:",
    "",
    formatMarkdownBlock(task.decision || "-"),
    "",
    "Status history:",
    "",
    formatMarkdownBlock(task.statusHistory || "-"),
  ].join("\n");
}

function formatMarkdownBlock(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}
