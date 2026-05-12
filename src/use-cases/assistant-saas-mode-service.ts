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

export async function generateAssistantWithSaasApi(input: GenerateAssistantInput, user: AuthUser): Promise<AssistantGenerateResult> {
  const taskId = normalizeRequiredText(input.taskId, "taskId");
  const question = normalizeRequiredText(input.question, "question");
  const instruction = normalizeOptionalText(input.instruction) || "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변하세요.";
  const retrieved = await retrieveAssistantEvidence({ taskId, question });
  const policy = await getStoredOrDefaultPolicy(retrieved.taskContext.projectId);
  const promptText = buildPromptText({
    taskTitle: retrieved.taskContext.title,
    question,
    instruction,
    evidence: retrieved.evidence,
  });
  const inputTokens = estimateTokens(promptText);
  const requestHash = createRequestHash({
    taskId: retrieved.taskContext.taskId,
    question,
    instruction,
    evidenceIds: retrieved.evidence.map((item) => item.id),
  });

  await enforcePolicy({
    policy,
    taskId: retrieved.taskContext.taskId,
    profileId: user.id,
    evidence: retrieved.evidence,
    inputTokens,
    requestHash,
  });

  const taskLabel = retrieved.taskContext.issueId || retrieved.taskContext.taskId;
  const providerResult = await runProviderOrRecordFailure({
    policy,
    taskId: retrieved.taskContext.taskId,
    taskLabel,
    profileId: user.id,
    question,
    instruction,
    promptText,
    evidence: retrieved.evidence,
    inputTokens,
    requestHash,
  });

  await assistantRepository.createUsageEvent({
    projectId: policy.projectId,
    taskId: retrieved.taskContext.taskId,
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
      evidenceCount: retrieved.evidence.length,
      evidenceKinds: [...new Set(retrieved.evidence.map((item) => item.kind))],
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
    targetId: retrieved.taskContext.taskId,
    metadata: {
      executionMode: "saas-api",
      requestHash,
      evidenceCount: retrieved.evidence.length,
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
    citations: retrieved.evidence.slice(0, 8).map((item) => ({
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

function createRequestHash(input: { taskId: string; question: string; instruction: string; evidenceIds: string[] }) {
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
