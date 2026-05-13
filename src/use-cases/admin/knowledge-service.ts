import type { AuthUser } from "@/domains/auth/types";
import type {
  ApprovedKnowledgeItem,
  AssistantRecord,
  AssistantWorkSummaryDraft,
  KnowledgePublicationScope,
} from "@/domains/assistant/types";
import type { AssistantAuditEvent } from "@/domains/assistant/saas-api-mode";
import type { TaskRecord } from "@/domains/task/types";
import { badRequest, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import { adminRepository } from "@/repositories/admin";
import { taskRepository } from "@/repositories";
import { createHash } from "node:crypto";

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

export type KnowledgeExportSyncTarget = "portable_archive" | "obsidian" | "notion" | "assistant_retrieval";
export type KnowledgeExportSyncFormat = "json" | "markdown";
export type KnowledgeExportSyncScope = "visible" | "selected";
export type KnowledgeExportSyncAuditAction = "dry_run" | "execute";
export type KnowledgeExportSyncAuditStatus = "dry_run" | "blocked" | "provider_blocked" | "provider_ready";

export type KnowledgeExportSyncAudit = {
  id: string;
  createdAt: string;
  status: KnowledgeExportSyncAuditStatus;
  action: KnowledgeExportSyncAuditAction;
  target: KnowledgeExportSyncTarget;
  format: KnowledgeExportSyncFormat;
  scope: KnowledgeExportSyncScope;
  itemIds: string[];
  itemCount: number;
  readyCount: number;
  readinessCount: number;
  sourceReferences: number;
  unsourced: number;
  confirmation: "matched" | "missing_or_mismatch";
  packageName: string;
  dryRunWarnings: string[];
  providerConfigured: boolean;
  providerExecutionEnabled: boolean;
  projectId: string | null;
  createdBy: string | null;
};

export type KnowledgeSyncTargetConfig = {
  target: KnowledgeExportSyncTarget;
  label: string;
  enabled: boolean;
  dryRunOnly: boolean;
  adapter: "portable_archive" | "markdown_files" | "notion_blocks" | "retrieval_index";
  credentialRef: string | null;
  credentialStatus: "not_required" | "missing" | "configured";
  credentialSource: "not_required" | "target_config" | "server_env" | "secret_manager" | "missing";
  credentialScope: KnowledgeExportSyncTarget;
  credentialStore: "none" | "target_config" | "server_env" | "secret_manager" | "missing";
  credentialLastValidatedAt: string | null;
  credentialRotationDueAt: string | null;
  rollbackPlanRef: string | null;
  rollbackPlanStatus: "not_required" | "configured" | "missing";
  reconciliationPlanRef: string | null;
  reconciliationPlanStatus: "not_required" | "configured" | "missing";
  remoteWriteReady: boolean;
  remoteWriteBlockers: string[];
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  auditId: string | null;
};

export type KnowledgeProviderPreview = {
  id: string;
  createdAt: string;
  auditId: string;
  target: KnowledgeExportSyncTarget;
  status: "dry_run_preview";
  destination: string;
  packageName: string;
  operations: string[];
  warnings: string[];
  reconciliationPackage: KnowledgeProviderReconciliationPackage | null;
  createdBy: string | null;
};

export type KnowledgeProviderReconciliationIntent = "create" | "update" | "delete" | "noop";

export type KnowledgeProviderReconciliationOperation = {
  itemId: string;
  sourceTaskId: string;
  title: string;
  path: string;
  intent: KnowledgeProviderReconciliationIntent;
  contentDigest: string;
};

export type KnowledgeProviderReconciliationPackage = {
  packageName: string;
  generatedAt: string;
  target: KnowledgeExportSyncTarget;
  summary: {
    total: number;
    create: number;
    update: number;
    delete: number;
    noop: number;
  };
  operations: KnowledgeProviderReconciliationOperation[];
  warnings: string[];
};

export type KnowledgeProviderExecution = {
  id: string;
  createdAt: string;
  previewId: string;
  auditId: string;
  target: KnowledgeExportSyncTarget;
  status: "executed";
  destination: string;
  packageName: string;
  artifactName: string;
  artifactType: "portable_archive_manifest" | "obsidian_markdown_manifest";
  itemCount: number;
  contentDigest: string;
  warnings: string[];
  reconciliationPackage: KnowledgeProviderReconciliationPackage | null;
  createdBy: string | null;
};

type KnowledgeExportSyncAuditInput = {
  action?: unknown;
  target?: unknown;
  format?: unknown;
  scope?: unknown;
  itemIds?: unknown;
  packageName?: unknown;
  confirmation?: unknown;
  dryRunWarnings?: unknown;
};

type KnowledgeSyncTargetConfigInput = {
  target?: unknown;
  enabled?: unknown;
  dryRunOnly?: unknown;
  credentialRef?: unknown;
  notes?: unknown;
};

type KnowledgeProviderPreviewInput = {
  auditId?: unknown;
  confirmation?: unknown;
};

type KnowledgeProviderExecutionInput = {
  previewId?: unknown;
  confirmation?: unknown;
};

const knowledgeExportSyncEventType = "knowledge_export_sync";
const knowledgeExportSyncTargetType = "approved_wiki_export_package";
const knowledgeSyncTargetConfigEventType = "knowledge_sync_target_config";
const knowledgeSyncTargetConfigTargetType = "knowledge_sync_target";
const knowledgeProviderPreviewEventType = "knowledge_sync_provider_preview";
const knowledgeProviderPreviewTargetType = "knowledge_sync_provider_preview";
const knowledgeProviderExecutionEventType = "knowledge_sync_provider_execution";
const knowledgeProviderExecutionTargetType = "knowledge_sync_provider_execution";
const knowledgeExportSyncConfirmationText = "SYNC_APPROVED_WIKI";
const knowledgeProviderPreviewConfirmationText = "PREVIEW_APPROVED_WIKI_SYNC";
const knowledgeProviderExecutionConfirmationText = "EXECUTE_APPROVED_WIKI_SYNC";
const knowledgeProviderPreviewFreshnessMs = 24 * 60 * 60 * 1000;
const knowledgeCredentialRegistryEnvName = "KNOWLEDGE_SYNC_CREDENTIAL_REGISTRY_JSON";
const knowledgeCredentialEnvByTarget: Partial<Record<KnowledgeExportSyncTarget, string>> = {
  obsidian: "KNOWLEDGE_SYNC_OBSIDIAN_CREDENTIAL_REF",
  notion: "KNOWLEDGE_SYNC_NOTION_CREDENTIAL_REF",
  assistant_retrieval: "KNOWLEDGE_SYNC_RETRIEVAL_CREDENTIAL_REF",
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

export async function listKnowledgeExportSyncAudits(): Promise<KnowledgeExportSyncAudit[]> {
  const events = await assistantRepository.listAuditEvents({
    eventTypes: [knowledgeExportSyncEventType],
    targetType: knowledgeExportSyncTargetType,
    limit: 50,
  });
  return events.map(toKnowledgeExportSyncAudit).filter((item): item is KnowledgeExportSyncAudit => Boolean(item));
}

export async function createKnowledgeExportSyncAudit(
  input: KnowledgeExportSyncAuditInput,
  user: AuthUser,
): Promise<KnowledgeExportSyncAudit> {
  const action = normalizeKnowledgeExportSyncAction(input.action);
  const target = normalizeKnowledgeExportSyncTarget(input.target);
  const format = normalizeKnowledgeExportSyncFormat(input.format);
  const scope = normalizeKnowledgeExportSyncScope(input.scope);
  const itemIds = normalizeItemIds(input.itemIds);
  const packageName = normalizeOptionalText(input.packageName) || createKnowledgeExportPackageName(target, scope, itemIds.length, format);
  const requestedWarnings = normalizeStringArray(input.dryRunWarnings, 12);
  const confirmation = normalizeOptionalText(input.confirmation);
  const confirmationState = confirmation === knowledgeExportSyncConfirmationText ? "matched" : "missing_or_mismatch";
  const approvedItems = await listApprovedKnowledgeItems();
  const approvedItemsById = new Map(approvedItems.map((item) => [item.id, item]));
  const items = itemIds.map((id) => approvedItemsById.get(id));
  if (items.some((item) => !item)) {
    throw badRequest("Only approved WIKI item ids can be included in export sync audit records.", "KNOWLEDGE_EXPORT_UNAPPROVED_ITEM");
  }
  const includedItems = items.filter((item): item is ApprovedKnowledgeItem => Boolean(item));
  const stats = readKnowledgeExportStats(includedItems);
  const readiness = buildKnowledgeExportReadiness(includedItems, target, format);
  const readinessWarnings = readiness.filter((item) => !item.ready).map((item) => `${item.label}: ${item.detail}`);
  const dryRunWarnings = [...new Set([...requestedWarnings, ...readinessWarnings])].slice(0, 20);
  const provider = await readKnowledgeExportProviderState(target);
  const readyCount = readiness.filter((item) => item.ready).length;
  const status = resolveKnowledgeExportSyncAuditStatus({
    action,
    confirmationState,
    readyCount,
    readinessCount: readiness.length,
    providerConfigured: provider.configured,
    providerExecutionEnabled: provider.executionEnabled,
  });
  const projectId = resolveKnowledgeExportAuditProjectId(includedItems);
  const event = await assistantRepository.createAuditEvent({
    projectId,
    profileId: user.id,
    eventType: knowledgeExportSyncEventType,
    targetType: knowledgeExportSyncTargetType,
    targetId: includedItems.length === 1 ? includedItems[0].id : null,
    metadata: {
      knowledgeExportSyncAuditVersion: 1,
      action,
      status,
      target,
      format,
      scope,
      itemIds,
      itemCount: includedItems.length,
      readyCount,
      readinessCount: readiness.length,
      readiness,
      sourceReferences: stats.sourceReferences,
      unsourced: stats.unsourced,
      confirmation: confirmationState,
      packageName,
      dryRunWarnings,
      providerConfigured: provider.configured,
      providerExecutionEnabled: provider.executionEnabled,
      createdBy: user.id,
    },
  });
  const audit = toKnowledgeExportSyncAudit(event);
  if (!audit) {
    throw badRequest("Knowledge export sync audit could not be normalized.", "KNOWLEDGE_EXPORT_AUDIT_INVALID");
  }
  return audit;
}

export async function listKnowledgeSyncTargetConfigs(): Promise<KnowledgeSyncTargetConfig[]> {
  const events = await assistantRepository.listAuditEvents({
    eventTypes: [knowledgeSyncTargetConfigEventType],
    targetType: knowledgeSyncTargetConfigTargetType,
    limit: 200,
  });
  return readKnowledgeSyncTargetConfigs(events);
}

export async function updateKnowledgeSyncTargetConfig(
  input: KnowledgeSyncTargetConfigInput,
  user: AuthUser,
): Promise<KnowledgeSyncTargetConfig> {
  const target = normalizeKnowledgeExportSyncTarget(input.target);
  const credentialRef = normalizeCredentialRef(input.credentialRef);
  const event = await assistantRepository.createAuditEvent({
    projectId: null,
    profileId: user.id,
    eventType: knowledgeSyncTargetConfigEventType,
    targetType: knowledgeSyncTargetConfigTargetType,
    targetId: null,
    metadata: {
      knowledgeSyncTargetConfigVersion: 1,
      target,
      enabled: input.enabled === true,
      dryRunOnly: input.dryRunOnly !== false,
      credentialRef,
      notes: normalizeOptionalText(input.notes).slice(0, 500),
      updatedBy: user.id,
    },
  });
  const config = readKnowledgeSyncTargetConfigs([event]).find((item) => item.target === target);
  if (!config) {
    throw badRequest("Knowledge sync target config could not be normalized.", "KNOWLEDGE_SYNC_TARGET_CONFIG_INVALID");
  }
  return config;
}

export async function listKnowledgeProviderPreviews(): Promise<KnowledgeProviderPreview[]> {
  const events = await assistantRepository.listAuditEvents({
    eventTypes: [knowledgeProviderPreviewEventType],
    targetType: knowledgeProviderPreviewTargetType,
    limit: 50,
  });
  return events.map(toKnowledgeProviderPreview).filter((item): item is KnowledgeProviderPreview => Boolean(item));
}

export async function createKnowledgeProviderPreview(
  input: KnowledgeProviderPreviewInput,
  user: AuthUser,
): Promise<KnowledgeProviderPreview> {
  const auditId = normalizeRequiredText(input.auditId, "auditId");
  const confirmation = normalizeOptionalText(input.confirmation);
  if (confirmation !== knowledgeProviderPreviewConfirmationText) {
    throw badRequest("Provider preview confirmation is required.", "KNOWLEDGE_PROVIDER_PREVIEW_CONFIRMATION_REQUIRED");
  }
  const audits = await listKnowledgeExportSyncAudits();
  const audit = audits.find((item) => item.id === auditId);
  if (!audit) {
    throw badRequest("Knowledge export audit id was not found.", "KNOWLEDGE_EXPORT_AUDIT_NOT_FOUND");
  }
  if (audit.status !== "provider_ready") {
    throw badRequest("Provider preview requires a provider-ready export audit.", "KNOWLEDGE_PROVIDER_PREVIEW_AUDIT_NOT_READY");
  }
  const configs = await listKnowledgeSyncTargetConfigs();
  const config = configs.find((item) => item.target === audit.target);
  if (!config?.enabled) {
    throw badRequest("Knowledge sync target is not enabled.", "KNOWLEDGE_SYNC_TARGET_DISABLED");
  }

  const approvedItems = await listApprovedKnowledgeItems();
  const preview = buildKnowledgeProviderPreview(audit, config, approvedItems, user.id);
  const event = await assistantRepository.createAuditEvent({
    projectId: audit.projectId,
    profileId: user.id,
    eventType: knowledgeProviderPreviewEventType,
    targetType: knowledgeProviderPreviewTargetType,
    targetId: null,
    metadata: {
      knowledgeProviderPreviewVersion: 1,
      ...preview,
    },
  });

  return {
    ...preview,
    id: event.id,
    createdAt: event.createdAt,
  };
}

export async function listKnowledgeProviderExecutions(): Promise<KnowledgeProviderExecution[]> {
  const events = await assistantRepository.listAuditEvents({
    eventTypes: [knowledgeProviderExecutionEventType],
    targetType: knowledgeProviderExecutionTargetType,
    limit: 50,
  });
  return events.map(toKnowledgeProviderExecution).filter((item): item is KnowledgeProviderExecution => Boolean(item));
}

export async function createKnowledgeProviderExecution(
  input: KnowledgeProviderExecutionInput,
  user: AuthUser,
): Promise<KnowledgeProviderExecution> {
  const previewId = normalizeRequiredText(input.previewId, "previewId");
  const confirmation = normalizeOptionalText(input.confirmation);
  if (confirmation !== knowledgeProviderExecutionConfirmationText) {
    throw badRequest("Provider execution confirmation is required.", "KNOWLEDGE_PROVIDER_EXECUTION_CONFIRMATION_REQUIRED");
  }

  const previews = await listKnowledgeProviderPreviews();
  const preview = previews.find((item) => item.id === previewId);
  if (!preview) {
    throw badRequest("Knowledge provider preview id was not found.", "KNOWLEDGE_PROVIDER_PREVIEW_NOT_FOUND");
  }
  if (!isFreshProviderPreview(preview.createdAt)) {
    throw badRequest("Provider execution requires a fresh dry-run preview from the last 24 hours.", "KNOWLEDGE_PROVIDER_PREVIEW_STALE");
  }

  const audits = await listKnowledgeExportSyncAudits();
  const audit = audits.find((item) => item.id === preview.auditId);
  if (!audit || audit.status !== "provider_ready") {
    throw badRequest("Provider execution requires a provider-ready export audit.", "KNOWLEDGE_PROVIDER_EXECUTION_AUDIT_NOT_READY");
  }

  const configs = await listKnowledgeSyncTargetConfigs();
  const config = configs.find((item) => item.target === preview.target);
  if (!config?.enabled || config.dryRunOnly || config.credentialStatus === "missing") {
    throw badRequest("Knowledge sync target is not enabled for guarded execution.", "KNOWLEDGE_SYNC_TARGET_EXECUTION_BLOCKED");
  }
  if (preview.target !== "portable_archive" && preview.target !== "obsidian") {
    throw badRequest("Only portable archive and Obsidian execution adapters are enabled.", "KNOWLEDGE_PROVIDER_ADAPTER_NOT_ENABLED");
  }

  const execution = buildKnowledgeProviderExecution(preview, audit, config, user.id);
  const event = await assistantRepository.createAuditEvent({
    projectId: audit.projectId,
    profileId: user.id,
    eventType: knowledgeProviderExecutionEventType,
    targetType: knowledgeProviderExecutionTargetType,
    targetId: audit.itemCount === 1 ? audit.itemIds[0] : null,
    metadata: {
      knowledgeProviderExecutionVersion: 1,
      ...execution,
    },
  });

  return {
    ...execution,
    id: event.id,
    createdAt: event.createdAt,
  };
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

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCredentialRef(value: unknown) {
  const text = normalizeOptionalText(value).slice(0, 160);
  if (!text) {
    return null;
  }
  const lowered = text.toLowerCase();
  if (
    lowered.startsWith("sk-") ||
    lowered.includes("secret") ||
    lowered.includes("token=") ||
    lowered.includes("bearer ") ||
    text.length > 120
  ) {
    throw badRequest("Credential references must not include raw secrets.", "KNOWLEDGE_SYNC_CREDENTIAL_SECRET_REJECTED");
  }
  return text;
}

function normalizeKnowledgeExportSyncAction(value: unknown): KnowledgeExportSyncAuditAction {
  return value === "execute" ? "execute" : "dry_run";
}

function normalizeKnowledgeExportSyncTarget(value: unknown): KnowledgeExportSyncTarget {
  return value === "obsidian" ||
    value === "notion" ||
    value === "assistant_retrieval" ||
    value === "portable_archive"
    ? value
    : "portable_archive";
}

function normalizeKnowledgeExportSyncFormat(value: unknown): KnowledgeExportSyncFormat {
  return value === "markdown" ? "markdown" : "json";
}

function normalizeKnowledgeExportSyncScope(value: unknown): KnowledgeExportSyncScope {
  return value === "selected" ? "selected" : "visible";
}

function normalizeItemIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => normalizeText(item)).filter(Boolean))].slice(0, 250);
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizeText(item)).filter(Boolean).slice(0, limit);
}

function readKnowledgeExportStats(items: ApprovedKnowledgeItem[]) {
  let sourced = 0;
  let sourceReferences = 0;
  let bodyChars = 0;
  const tags = new Set<string>();
  for (const item of items) {
    if (item.sourceReferences.length) {
      sourced += 1;
    }
    sourceReferences += item.sourceReferences.length;
    bodyChars += item.bodyMarkdown.trim().length;
    for (const tag of item.tags) {
      tags.add(tag);
    }
  }
  return {
    items: items.length,
    sourced,
    unsourced: items.length - sourced,
    sourceReferences,
    tags: tags.size,
    bodyChars,
  };
}

function buildKnowledgeExportReadiness(
  items: ApprovedKnowledgeItem[],
  target: KnowledgeExportSyncTarget,
  format: KnowledgeExportSyncFormat,
) {
  const stats = readKnowledgeExportStats(items);
  return [
    {
      label: "Export scope",
      detail: items.length
        ? `${items.length} approved WIKI item(s) are included in the ${format} package.`
        : "No approved WIKI items are included in the export scope.",
      ready: items.length > 0,
    },
    {
      label: "Source lineage",
      detail: stats.unsourced
        ? `${stats.unsourced}/${stats.items} item(s) have no source references.`
        : `${stats.sourced}/${stats.items} item(s) include source references.`,
      ready: stats.items > 0 && stats.unsourced === 0,
    },
    {
      label: "Tag coverage",
      detail: stats.tags
        ? `${stats.tags} unique tag(s) are available for sync grouping.`
        : "No tags are available for sync grouping.",
      ready: stats.tags > 0,
    },
    {
      label: "Body content",
      detail: stats.bodyChars
        ? `${stats.bodyChars} total Markdown character(s) are available.`
        : "Export scope has no Markdown body content.",
      ready: stats.bodyChars > 0,
    },
    {
      label: "Target profile",
      detail: `${target} target requested with ${format} package format.`,
      ready: true,
    },
  ];
}

async function readKnowledgeExportProviderState(target: KnowledgeExportSyncTarget) {
  const configs = await listKnowledgeSyncTargetConfigs();
  const config = configs.find((item) => item.target === target);
  const enabledTargets = new Set(
    (process.env.KNOWLEDGE_SYNC_ENABLED_TARGETS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const executionEnabled = process.env.KNOWLEDGE_SYNC_EXECUTION_ENABLED === "true";
  const credentialReady = !config || config.credentialStatus !== "missing";
  return {
    configured: (config?.enabled === true && credentialReady) || enabledTargets.has(target),
    executionEnabled:
      config?.enabled === true && !config.dryRunOnly && credentialReady
        ? true
        : executionEnabled && enabledTargets.has(target),
  };
}

function resolveKnowledgeExportSyncAuditStatus(input: {
  action: KnowledgeExportSyncAuditAction;
  confirmationState: KnowledgeExportSyncAudit["confirmation"];
  readyCount: number;
  readinessCount: number;
  providerConfigured: boolean;
  providerExecutionEnabled: boolean;
}): KnowledgeExportSyncAuditStatus {
  if (input.action === "dry_run") {
    return "dry_run";
  }
  if (input.confirmationState !== "matched" || input.readyCount !== input.readinessCount) {
    return "blocked";
  }
  if (!input.providerConfigured || !input.providerExecutionEnabled) {
    return "provider_blocked";
  }
  return "provider_ready";
}

function resolveKnowledgeExportAuditProjectId(items: ApprovedKnowledgeItem[]) {
  if (!items.length) {
    return null;
  }
  const projectIds = new Set(items.map((item) => item.sourceProjectId).filter(Boolean));
  return projectIds.size === 1 ? [...projectIds][0] : null;
}

function createKnowledgeExportPackageName(
  target: KnowledgeExportSyncTarget,
  scope: KnowledgeExportSyncScope,
  itemCount: number,
  format: KnowledgeExportSyncFormat,
) {
  const extension = format === "json" ? "json" : "md";
  return `approved-wiki-${target}-${scope}-${itemCount}.${extension}`;
}

function toKnowledgeExportSyncAudit(event: AssistantAuditEvent): KnowledgeExportSyncAudit | null {
  if (event.eventType !== knowledgeExportSyncEventType || event.targetType !== knowledgeExportSyncTargetType) {
    return null;
  }
  const metadata = event.metadata;
  const action = normalizeKnowledgeExportSyncAction(metadata.action);
  const target = normalizeKnowledgeExportSyncTarget(metadata.target);
  const format = normalizeKnowledgeExportSyncFormat(metadata.format);
  const scope = normalizeKnowledgeExportSyncScope(metadata.scope);
  const itemIds = normalizeItemIds(metadata.itemIds);
  const itemCount = readNumber(metadata.itemCount, itemIds.length);
  const readinessCount = readNumber(metadata.readinessCount, 0);
  const readyCount = readNumber(metadata.readyCount, 0);
  const statusValue = normalizeOptionalText(metadata.status);
  const status: KnowledgeExportSyncAuditStatus =
    statusValue === "blocked" ||
    statusValue === "provider_blocked" ||
    statusValue === "provider_ready" ||
    statusValue === "dry_run"
      ? statusValue
      : "blocked";

  return {
    id: event.id,
    createdAt: event.createdAt,
    status,
    action,
    target,
    format,
    scope,
    itemIds,
    itemCount,
    readyCount,
    readinessCount,
    sourceReferences: readNumber(metadata.sourceReferences, 0),
    unsourced: readNumber(metadata.unsourced, 0),
    confirmation: metadata.confirmation === "matched" ? "matched" : "missing_or_mismatch",
    packageName: normalizeOptionalText(metadata.packageName) || createKnowledgeExportPackageName(target, scope, itemCount, format),
    dryRunWarnings: normalizeStringArray(metadata.dryRunWarnings, 20),
    providerConfigured: metadata.providerConfigured === true,
    providerExecutionEnabled: metadata.providerExecutionEnabled === true,
    projectId: event.projectId,
    createdBy: normalizeOptionalText(metadata.createdBy) || event.profileId,
  };
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readKnowledgeSyncTargetConfigs(events: AssistantAuditEvent[]): KnowledgeSyncTargetConfig[] {
  const latestByTarget = new Map<KnowledgeExportSyncTarget, AssistantAuditEvent>();
  for (const event of events) {
    if (event.eventType !== knowledgeSyncTargetConfigEventType || event.targetType !== knowledgeSyncTargetConfigTargetType) {
      continue;
    }
    const target = normalizeKnowledgeExportSyncTarget(event.metadata.target);
    const previous = latestByTarget.get(target);
    if (!previous || event.createdAt > previous.createdAt) {
      latestByTarget.set(target, event);
    }
  }

  const credentialRegistry = readKnowledgeCredentialRegistry();
  return (["portable_archive", "obsidian", "notion", "assistant_retrieval"] as KnowledgeExportSyncTarget[])
    .map((target) => {
      const event = latestByTarget.get(target);
      const metadata = event?.metadata ?? {};
      const configuredCredentialRef = normalizeOptionalText(metadata.credentialRef) || null;
      const registryEntry = credentialRegistry[target] ?? null;
      const credential = readKnowledgeSyncCredentialState(target, configuredCredentialRef, registryEntry);
      const remoteWrite = readKnowledgeRemoteWriteReadiness({
        target,
        enabled: metadata.enabled === true,
        dryRunOnly: metadata.dryRunOnly !== false,
        credential,
        registryEntry,
      });
      return {
        target,
        label: readKnowledgeSyncTargetLabel(target),
        enabled: metadata.enabled === true,
        dryRunOnly: metadata.dryRunOnly !== false,
        adapter: readKnowledgeSyncAdapter(target),
        credentialRef: credential.ref,
        credentialStatus: credential.status,
        credentialSource: credential.source,
        credentialScope: target,
        credentialStore: credential.store,
        credentialLastValidatedAt: credential.lastValidatedAt,
        credentialRotationDueAt: credential.rotationDueAt,
        rollbackPlanRef: remoteWrite.rollbackPlanRef,
        rollbackPlanStatus: remoteWrite.rollbackPlanStatus,
        reconciliationPlanRef: remoteWrite.reconciliationPlanRef,
        reconciliationPlanStatus: remoteWrite.reconciliationPlanStatus,
        remoteWriteReady: remoteWrite.ready,
        remoteWriteBlockers: remoteWrite.blockers,
        notes: normalizeOptionalText(metadata.notes),
        updatedAt: event?.createdAt ?? null,
        updatedBy: normalizeOptionalText(metadata.updatedBy) || (event?.profileId ?? null),
        auditId: event?.id ?? null,
      };
    });
}

function readKnowledgeSyncTargetLabel(target: KnowledgeExportSyncTarget) {
  if (target === "obsidian") {
    return "Obsidian vault";
  }
  if (target === "notion") {
    return "Notion import";
  }
  if (target === "assistant_retrieval") {
    return "Assistant retrieval";
  }
  return "Portable archive";
}

function readKnowledgeSyncAdapter(target: KnowledgeExportSyncTarget): KnowledgeSyncTargetConfig["adapter"] {
  if (target === "obsidian") {
    return "markdown_files";
  }
  if (target === "notion") {
    return "notion_blocks";
  }
  if (target === "assistant_retrieval") {
    return "retrieval_index";
  }
  return "portable_archive";
}

type KnowledgeCredentialRegistryEntry = {
  credentialRef: string | null;
  store: "secret_manager" | "server_env";
  lastValidatedAt: string | null;
  rotationDueAt: string | null;
  rollbackPlanRef: string | null;
  reconciliationPlanRef: string | null;
};

type KnowledgeCredentialState = {
  ref: string | null;
  status: KnowledgeSyncTargetConfig["credentialStatus"];
  source: KnowledgeSyncTargetConfig["credentialSource"];
  store: KnowledgeSyncTargetConfig["credentialStore"];
  lastValidatedAt: string | null;
  rotationDueAt: string | null;
};

function readKnowledgeCredentialRegistry(): Partial<Record<KnowledgeExportSyncTarget, KnowledgeCredentialRegistryEntry>> {
  const raw = normalizeOptionalText(process.env[knowledgeCredentialRegistryEnvName]);
  if (!raw) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const registry: Partial<Record<KnowledgeExportSyncTarget, KnowledgeCredentialRegistryEntry>> = {};
    for (const target of ["obsidian", "notion", "assistant_retrieval"] as KnowledgeExportSyncTarget[]) {
      const entry = (parsed as Record<string, unknown>)[target];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const record = entry as Record<string, unknown>;
      const credentialRef = normalizeRegistryCredentialRef(record.credentialRef);
      if (!credentialRef) {
        continue;
      }
      registry[target] = {
        credentialRef,
        store: record.store === "server_env" ? "server_env" : "secret_manager",
        lastValidatedAt: normalizeIsoDate(record.lastValidatedAt),
        rotationDueAt: normalizeIsoDate(record.rotationDueAt),
        rollbackPlanRef: normalizeCredentialControlRef(record.rollbackPlanRef),
        reconciliationPlanRef: normalizeCredentialControlRef(record.reconciliationPlanRef),
      };
    }
    return registry;
  } catch {
    return {};
  }
}

function readKnowledgeSyncCredentialState(
  target: KnowledgeExportSyncTarget,
  credentialRef: string | null,
  registryEntry: KnowledgeCredentialRegistryEntry | null,
): KnowledgeCredentialState {
  if (target === "portable_archive") {
    return {
      ref: null,
      status: "not_required",
      source: "not_required",
      store: "none",
      lastValidatedAt: null,
      rotationDueAt: null,
    };
  }
  if (registryEntry) {
    return {
      ref: registryEntry.credentialRef,
      status: "configured",
      source: registryEntry.store === "secret_manager" ? "secret_manager" : "server_env",
      store: registryEntry.store,
      lastValidatedAt: registryEntry.lastValidatedAt,
      rotationDueAt: registryEntry.rotationDueAt,
    };
  }
  if (credentialRef) {
    return {
      ref: credentialRef,
      status: "configured",
      source: "target_config",
      store: "target_config",
      lastValidatedAt: null,
      rotationDueAt: null,
    };
  }
  const envName = knowledgeCredentialEnvByTarget[target];
  const envRef = envName && normalizeOptionalText(process.env[envName]) ? `env:${envName}` : null;
  if (envRef) {
    return {
      ref: envRef,
      status: "configured",
      source: "server_env",
      store: "server_env",
      lastValidatedAt: null,
      rotationDueAt: null,
    };
  }
  return {
    ref: null,
    status: "missing",
    source: "missing",
    store: "missing",
    lastValidatedAt: null,
    rotationDueAt: null,
  };
}

function readKnowledgeRemoteWriteReadiness(input: {
  target: KnowledgeExportSyncTarget;
  enabled: boolean;
  dryRunOnly: boolean;
  credential: KnowledgeCredentialState;
  registryEntry: KnowledgeCredentialRegistryEntry | null;
}) {
  if (input.target === "portable_archive") {
    return {
      ready: false,
      blockers: ["Portable archive does not require remote provider writes."],
      rollbackPlanRef: null,
      rollbackPlanStatus: "not_required" as const,
      reconciliationPlanRef: null,
      reconciliationPlanStatus: "not_required" as const,
    };
  }

  const rollbackPlanRef = input.registryEntry?.rollbackPlanRef ?? null;
  const reconciliationPlanRef = input.registryEntry?.reconciliationPlanRef ?? null;
  const blockers = [
    ...(!input.enabled ? ["Target is disabled."] : []),
    ...(input.dryRunOnly ? ["Target is configured as dry-run only."] : []),
    ...(input.credential.status === "missing" ? ["Credential reference is missing."] : []),
    ...(input.credential.store !== "secret_manager" ? ["Secret-manager credential registry entry is missing."] : []),
    ...(!rollbackPlanRef ? ["Rollback plan reference is missing."] : []),
    ...(!reconciliationPlanRef ? ["Reconciliation plan reference is missing."] : []),
  ];

  return {
    ready: blockers.length === 0,
    blockers,
    rollbackPlanRef,
    rollbackPlanStatus: rollbackPlanRef ? "configured" as const : "missing" as const,
    reconciliationPlanRef,
    reconciliationPlanStatus: reconciliationPlanRef ? "configured" as const : "missing" as const,
  };
}

function normalizeRegistryCredentialRef(value: unknown) {
  const text = normalizeOptionalText(value);
  if (!text || looksLikeSecretMaterial(text)) {
    return null;
  }
  return text.slice(0, 200);
}

function normalizeCredentialControlRef(value: unknown) {
  const text = normalizeOptionalText(value);
  if (!text || looksLikeSecretMaterial(text)) {
    return null;
  }
  return text.slice(0, 200);
}

function looksLikeSecretMaterial(value: string) {
  const lowered = value.toLowerCase();
  return (
    lowered.startsWith("sk-") ||
    lowered.includes("token=") ||
    lowered.includes("bearer ") ||
    lowered.includes("api_key=") ||
    value.length > 180
  );
}

function normalizeIsoDate(value: unknown) {
  const text = normalizeOptionalText(value);
  if (!text) {
    return null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function buildKnowledgeProviderPreview(
  audit: KnowledgeExportSyncAudit,
  config: KnowledgeSyncTargetConfig,
  approvedItems: ApprovedKnowledgeItem[],
  actorId: string,
): KnowledgeProviderPreview {
  const reconciliationPackage = buildKnowledgeProviderReconciliationPackage(audit, config, approvedItems);
  return {
    id: `pending:${audit.id}`,
    createdAt: new Date().toISOString(),
    auditId: audit.id,
    target: audit.target,
    status: "dry_run_preview",
    destination: config.label,
    packageName: audit.packageName,
    operations: readKnowledgeProviderOperations(audit, config),
    warnings: [
      "Provider adapter is dry-run only in this slice; no external write is executed.",
      ...(config.dryRunOnly ? ["Target is configured as dry-run only."] : []),
      ...(config.credentialStatus === "missing" ? ["Target is missing a server-side credential reference."] : []),
      ...(config.credentialSource === "server_env" ? ["Credential readiness is satisfied by a server environment reference."] : []),
      ...(config.credentialSource === "target_config" ? ["Credential readiness uses an opaque target configuration reference."] : []),
      ...(config.credentialSource === "secret_manager" ? ["Credential readiness is satisfied by a server-side secret-manager registry entry."] : []),
      ...(config.remoteWriteReady ? ["Remote write deployment readiness checks pass, but live external writes remain disabled."] : []),
      ...config.remoteWriteBlockers.map((blocker) => `Remote write blocked: ${blocker}`),
      ...(reconciliationPackage ? reconciliationPackage.warnings : []),
      ...(audit.unsourced ? [`${audit.unsourced} item(s) have no source references.`] : []),
    ],
    reconciliationPackage,
    createdBy: actorId,
  };
}

function buildKnowledgeProviderReconciliationPackage(
  audit: KnowledgeExportSyncAudit,
  config: KnowledgeSyncTargetConfig,
  approvedItems: ApprovedKnowledgeItem[],
): KnowledgeProviderReconciliationPackage | null {
  if (config.adapter !== "markdown_files") {
    return null;
  }
  const itemById = new Map(approvedItems.map((item) => [item.id, item]));
  const operations = audit.itemIds.map((itemId) => {
    const item = itemById.get(itemId) ?? null;
    const title = item?.title || `Approved WIKI ${itemId.slice(0, 8)}`;
    const sourceTaskId = item?.sourceTaskId || "unknown";
    const path = `approved-wiki/${slugifyObsidianPath(title)}-${itemId.slice(0, 8)}.md`;
    const contentDigest = createHash("sha256")
      .update(JSON.stringify({
        itemId,
        title,
        sourceTaskId,
        bodyMarkdown: item?.bodyMarkdown ?? "",
        tags: item?.tags ?? [],
        scope: item?.scope ?? null,
      }))
      .digest("hex");
    return {
      itemId,
      sourceTaskId,
      title,
      path,
      intent: "create" as const,
      contentDigest,
    };
  });
  return {
    packageName: audit.packageName.replace(/\.(json|md)$/i, ".obsidian-reconciliation.json"),
    generatedAt: new Date().toISOString(),
    target: audit.target,
    summary: {
      total: operations.length,
      create: operations.length,
      update: 0,
      delete: 0,
      noop: 0,
    },
    operations,
    warnings: [
      "Obsidian reconciliation is dry-run only; no vault files are written.",
      "Remote Obsidian inventory is not connected yet, so all selected WIKI items are planned as create intents.",
      ...(operations.length !== audit.itemIds.length ? ["Some approved WIKI items could not be resolved for reconciliation."] : []),
    ],
  };
}

function slugifyObsidianPath(value: string) {
  const slug = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "approved-wiki";
}

function toKnowledgeProviderPreview(event: AssistantAuditEvent): KnowledgeProviderPreview | null {
  if (event.eventType !== knowledgeProviderPreviewEventType || event.targetType !== knowledgeProviderPreviewTargetType) {
    return null;
  }
  const metadata = event.metadata;
  return {
    id: event.id,
    createdAt: event.createdAt,
    auditId: normalizeOptionalText(metadata.auditId),
    target: normalizeKnowledgeExportSyncTarget(metadata.target),
    status: "dry_run_preview",
    destination: normalizeOptionalText(metadata.destination),
    packageName: normalizeOptionalText(metadata.packageName),
    operations: normalizeStringArray(metadata.operations, 20),
    warnings: normalizeStringArray(metadata.warnings, 20),
    reconciliationPackage: normalizeKnowledgeProviderReconciliationPackage(metadata.reconciliationPackage),
    createdBy: normalizeOptionalText(metadata.createdBy) || event.profileId,
  };
}

function normalizeKnowledgeProviderReconciliationPackage(value: unknown): KnowledgeProviderReconciliationPackage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const target = normalizeKnowledgeExportSyncTarget(record.target);
  if (target !== "obsidian") {
    return null;
  }
  const operations = Array.isArray(record.operations)
    ? record.operations
      .map(normalizeKnowledgeProviderReconciliationOperation)
      .filter((item): item is KnowledgeProviderReconciliationOperation => Boolean(item))
      .slice(0, 250)
    : [];
  const summaryRecord = record.summary && typeof record.summary === "object" && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};
  return {
    packageName: normalizeOptionalText(record.packageName),
    generatedAt: normalizeIsoDate(record.generatedAt) ?? new Date(0).toISOString(),
    target,
    summary: {
      total: readNumber(summaryRecord.total, operations.length),
      create: readNumber(summaryRecord.create, operations.filter((item) => item.intent === "create").length),
      update: readNumber(summaryRecord.update, operations.filter((item) => item.intent === "update").length),
      delete: readNumber(summaryRecord.delete, operations.filter((item) => item.intent === "delete").length),
      noop: readNumber(summaryRecord.noop, operations.filter((item) => item.intent === "noop").length),
    },
    operations,
    warnings: normalizeStringArray(record.warnings, 20),
  };
}

function normalizeKnowledgeProviderReconciliationOperation(value: unknown): KnowledgeProviderReconciliationOperation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const itemId = normalizeOptionalText(record.itemId);
  const path = normalizeOptionalText(record.path);
  if (!itemId || !path) {
    return null;
  }
  return {
    itemId,
    sourceTaskId: normalizeOptionalText(record.sourceTaskId) || "unknown",
    title: normalizeOptionalText(record.title) || itemId,
    path,
    intent: normalizeKnowledgeProviderReconciliationIntent(record.intent),
    contentDigest: normalizeOptionalText(record.contentDigest),
  };
}

function normalizeKnowledgeProviderReconciliationIntent(value: unknown): KnowledgeProviderReconciliationIntent {
  return value === "update" || value === "delete" || value === "noop" ? value : "create";
}

function isFreshProviderPreview(createdAt: string) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && Date.now() - created <= knowledgeProviderPreviewFreshnessMs;
}

function buildKnowledgeProviderExecution(
  preview: KnowledgeProviderPreview,
  audit: KnowledgeExportSyncAudit,
  config: KnowledgeSyncTargetConfig,
  actorId: string,
): KnowledgeProviderExecution {
  const artifact = buildKnowledgeProviderExecutionArtifact(audit, config);
  const reconciliationPackage = preview.reconciliationPackage;
  const digestInput = {
    previewId: preview.id,
    auditId: audit.id,
    target: audit.target,
    packageName: audit.packageName,
    itemIds: audit.itemIds,
    adapter: config.adapter,
    credentialSource: config.credentialSource,
    credentialScope: config.credentialScope,
    credentialStore: config.credentialStore,
    remoteWriteReady: config.remoteWriteReady,
    artifactType: artifact.type,
    reconciliationPackage,
  };
  return {
    id: `pending:${preview.id}`,
    createdAt: new Date().toISOString(),
    previewId: preview.id,
    auditId: audit.id,
    target: audit.target,
    status: "executed",
    destination: config.label,
    packageName: audit.packageName,
    artifactName: artifact.name,
    artifactType: artifact.type,
    itemCount: audit.itemCount,
    contentDigest: createHash("sha256").update(JSON.stringify(digestInput)).digest("hex"),
    warnings: [
      artifact.warning,
      ...(config.credentialSource === "server_env" ? ["Credential reference was resolved from server environment metadata."] : []),
      ...(config.credentialSource === "target_config" ? ["Credential reference was resolved from opaque target configuration metadata."] : []),
      ...(config.credentialSource === "secret_manager" ? ["Credential reference was resolved from server-side secret-manager registry metadata."] : []),
      ...(config.remoteWriteReady ? ["Remote write readiness passed; live external writes are still disabled in this slice."] : []),
      ...config.remoteWriteBlockers.map((blocker) => `Remote write remains blocked: ${blocker}`),
      ...(reconciliationPackage ? ["Reconciliation package was copied from the approved provider preview; no external files were written."] : []),
      ...(audit.unsourced ? [`${audit.unsourced} item(s) have no source references.`] : []),
    ],
    reconciliationPackage,
    createdBy: actorId,
  };
}

function buildKnowledgeProviderExecutionArtifact(
  audit: KnowledgeExportSyncAudit,
  config: KnowledgeSyncTargetConfig,
): { name: string; type: KnowledgeProviderExecution["artifactType"]; warning: string } {
  if (config.adapter === "markdown_files") {
    return {
      name: audit.packageName.replace(/\.(json|md)$/i, ".obsidian-manifest.json"),
      type: "obsidian_markdown_manifest",
      warning: "Obsidian execution wrote only an append-only server audit manifest in this slice; vault file writes remain disabled.",
    };
  }
  return {
    name: audit.packageName.replace(/\.(json|md)$/i, ".manifest.json"),
    type: "portable_archive_manifest",
    warning: "Portable archive execution wrote only an append-only server audit artifact in this slice.",
  };
}

function toKnowledgeProviderExecution(event: AssistantAuditEvent): KnowledgeProviderExecution | null {
  if (event.eventType !== knowledgeProviderExecutionEventType || event.targetType !== knowledgeProviderExecutionTargetType) {
    return null;
  }
  const metadata = event.metadata;
  const target = normalizeKnowledgeExportSyncTarget(metadata.target);
  return {
    id: event.id,
    createdAt: event.createdAt,
    previewId: normalizeOptionalText(metadata.previewId),
    auditId: normalizeOptionalText(metadata.auditId),
    target,
    status: "executed",
    destination: normalizeOptionalText(metadata.destination) || readKnowledgeSyncTargetLabel(target),
    packageName: normalizeOptionalText(metadata.packageName),
    artifactName: normalizeOptionalText(metadata.artifactName),
    artifactType: normalizeKnowledgeProviderExecutionArtifactType(metadata.artifactType),
    itemCount: readNumber(metadata.itemCount, 0),
    contentDigest: normalizeOptionalText(metadata.contentDigest),
    warnings: normalizeStringArray(metadata.warnings, 20),
    reconciliationPackage: normalizeKnowledgeProviderReconciliationPackage(metadata.reconciliationPackage),
    createdBy: normalizeOptionalText(metadata.createdBy) || event.profileId,
  };
}

function normalizeKnowledgeProviderExecutionArtifactType(value: unknown): KnowledgeProviderExecution["artifactType"] {
  return value === "obsidian_markdown_manifest" ? "obsidian_markdown_manifest" : "portable_archive_manifest";
}

function readKnowledgeProviderOperations(audit: KnowledgeExportSyncAudit, config: KnowledgeSyncTargetConfig) {
  if (config.adapter === "markdown_files") {
    return [
      `Create ${audit.itemCount} Markdown file(s) from ${audit.packageName}.`,
      "Preserve source lineage as YAML frontmatter.",
      "Map WIKI tags to Obsidian tags.",
    ];
  }
  if (config.adapter === "notion_blocks") {
    return [
      `Create ${audit.itemCount} Notion page draft(s).`,
      "Map title, summary, tags, scope, and source references to import properties.",
      "Keep Markdown body as a block conversion preview.",
    ];
  }
  if (config.adapter === "retrieval_index") {
    return [
      `Stage ${audit.itemCount} approved WIKI item(s) for retrieval indexing.`,
      "Preserve source task, project, tags, and publication scope.",
      "Generate index metadata without writing to a live retrieval backend.",
    ];
  }
  return [
    `Prepare ${audit.packageName} as a portable archive artifact.`,
    "Include package metadata, source lineage, and readiness status.",
    "Keep archive delivery in dry-run preview mode.",
  ];
}
