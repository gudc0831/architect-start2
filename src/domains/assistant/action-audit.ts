import type {
  AssistantActionAuditAction,
  AssistantActionAuditRecord,
  AssistantActionAuditSummary,
  AssistantAuditEvent,
} from "@/domains/assistant/saas-api-mode";

export function assistantActionEventType(action: AssistantActionAuditAction) {
  return `assistant.${action}`;
}

export function readAssistantAction(value: unknown): AssistantActionAuditAction | null {
  return value === "task_update_applied" || value === "follow_up_task_created" ? value : null;
}

export function normalizeActionAuditSummary(value: unknown): AssistantActionAuditSummary | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Partial<AssistantActionAuditSummary>;
  const conclusion = normalizeText(source.conclusion);
  const scope = normalizeText(source.scope);
  const followUpAction = normalizeText(source.followUpAction);
  const tags = normalizeTags(source.tags);

  if (!conclusion && !scope && !followUpAction && tags.length === 0) {
    return null;
  }

  return {
    conclusion,
    scope,
    followUpAction,
    tags,
  };
}

export function toAssistantActionAuditRecord(event: AssistantAuditEvent): AssistantActionAuditRecord | null {
  const metadata = event.metadata;
  const action = readAssistantAction(metadata.action);
  const projectId = normalizeText(event.projectId);
  const sourceTaskId = normalizeText(metadata.sourceTaskId);
  const targetTaskId = normalizeText(metadata.targetTaskId) || normalizeText(event.targetId);
  const assistantRecordId = normalizeText(metadata.assistantRecordId);

  if (!action || !projectId || !sourceTaskId || !targetTaskId || !assistantRecordId) {
    return null;
  }

  return {
    id: event.id,
    action,
    projectId,
    sourceTaskId,
    targetTaskId,
    createdTaskId: normalizeText(metadata.createdTaskId) || null,
    assistantRecordId,
    summary: normalizeActionAuditSummary(metadata.summary),
    statusFrom: normalizeText(metadata.statusFrom) || null,
    statusTo: normalizeText(metadata.statusTo) || null,
    decisionMarker: normalizeText(metadata.decisionMarker) || null,
    createdBy: event.profileId,
    createdAt: event.createdAt,
  };
}

export function isActionAuditRelevantToTask(record: AssistantActionAuditRecord, taskId: string) {
  return record.sourceTaskId === taskId || record.targetTaskId === taskId || record.createdTaskId === taskId;
}

function normalizeTags(value: unknown) {
  return Array.isArray(value)
    ? value.map((tag) => normalizeText(tag)).filter(Boolean).slice(0, 12)
    : [];
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
