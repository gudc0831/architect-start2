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
  liveWriteFeatureFlag: string | null;
  liveWriteFeatureFlagEnabled: boolean;
  inventoryManifest: KnowledgeProviderInventoryManifest | null;
  inventoryEntryCount: number;
  inventoryImportedAt: string | null;
  inventoryWarnings: string[];
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

export type KnowledgeProviderInventoryEntry = {
  path: string;
  itemId: string | null;
  sourceTaskId: string | null;
  contentDigest: string | null;
  updatedAt: string | null;
  managedBy: "approved_wiki" | null;
};

export type KnowledgeProviderInventoryManifest = {
  target: KnowledgeExportSyncTarget;
  importedAt: string;
  entries: KnowledgeProviderInventoryEntry[];
  warnings: string[];
};

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

export type KnowledgeProviderLiveWritePreflight = {
  target: "obsidian";
  generatedAt: string;
  featureFlag: string;
  featureFlagEnabled: boolean;
  mutationReady: boolean;
  rollbackPlanRef: string | null;
  reconciliationPlanRef: string | null;
  summary: KnowledgeProviderReconciliationPackage["summary"];
  operationCount: number;
  operations: KnowledgeProviderReconciliationOperation[];
  blockers: string[];
  warnings: string[];
};

export type KnowledgeProviderExecution = {
  id: string;
  projectId: string | null;
  createdAt: string;
  previewId: string;
  auditId: string;
  target: KnowledgeExportSyncTarget;
  status: "executed" | "preflight_recorded";
  destination: string;
  packageName: string;
  artifactName: string;
  artifactType: "portable_archive_manifest" | "obsidian_markdown_manifest" | "obsidian_live_write_preflight";
  itemCount: number;
  contentDigest: string;
  warnings: string[];
  reconciliationPackage: KnowledgeProviderReconciliationPackage | null;
  liveWritePreflight: KnowledgeProviderLiveWritePreflight | null;
  packageReview: KnowledgeProviderExecutionPackageReview;
  packageReviewNotes: KnowledgeProviderExecutionPackageReviewNote[];
  createdBy: string | null;
};

export type KnowledgeProviderExecutionPackageReview = {
  available: true;
  filename: string;
  packageDigest: string;
  source: "append_only_audit";
  immutable: true;
  localDownloadTracked: false;
  retentionLabel: "server_audit_retained";
  retentionNote: string;
  reviewNoteCount: number;
  latestReviewNoteAt: string | null;
};

export type KnowledgeProviderExecutionPackageReviewNoteCategory = "review_note" | "risk" | "follow_up" | "approval_context";

export type KnowledgeProviderExecutionPackageReviewNote = {
  id: string;
  createdAt: string;
  executionId: string;
  packageDigest: string;
  category: KnowledgeProviderExecutionPackageReviewNoteCategory;
  note: string;
  reviewerId: string | null;
};

export type KnowledgeProviderExecutionPackageReviewCoverageStatus = "reviewed" | "unreviewed" | "stale_unreviewed";

export type KnowledgeProviderExecutionPackageReviewNoteReportItem = KnowledgeProviderExecutionPackageReviewNote & {
  executionCreatedAt: string;
  target: KnowledgeExportSyncTarget;
  status: KnowledgeProviderExecution["status"];
  artifactType: KnowledgeProviderExecution["artifactType"];
  packageFilename: string;
};

export type KnowledgeProviderExecutionPackageReviewCoverageItem = {
  executionId: string;
  executionCreatedAt: string;
  target: KnowledgeExportSyncTarget;
  status: KnowledgeProviderExecution["status"];
  artifactType: KnowledgeProviderExecution["artifactType"];
  packageDigest: string;
  packageFilename: string;
  noteCount: number;
  latestReviewNoteAt: string | null;
  reviewerIds: string[];
  coverageStatus: KnowledgeProviderExecutionPackageReviewCoverageStatus;
  staleDays: number;
  isStale: boolean;
};

export type KnowledgeProviderExecutionPackageReviewNoteReport = {
  generatedAt: string;
  filters: {
    category: KnowledgeProviderExecutionPackageReviewNoteCategory | "all";
    reviewerId: string | null;
    packageDigest: string | null;
    executionId: string | null;
    coveragePreset: "all" | "reviewed" | "unreviewed" | "stale_unreviewed";
    staleDays: number;
  };
  summary: {
    packageCount: number;
    reviewedCount: number;
    unreviewedCount: number;
    staleUnreviewedCount: number;
    noteCount: number;
    reviewerCounts: { reviewerId: string | null; count: number }[];
    categoryCounts: { category: KnowledgeProviderExecutionPackageReviewNoteCategory; count: number }[];
  };
  notes: KnowledgeProviderExecutionPackageReviewNoteReportItem[];
  coverage: KnowledgeProviderExecutionPackageReviewCoverageItem[];
};

export type KnowledgeProviderExecutionPackage = {
  packageVersion: 1;
  packageGeneratedAt: string;
  executionId: string;
  execution: KnowledgeProviderExecution;
  exportAudit: KnowledgeExportSyncAudit | null;
  providerPreview: KnowledgeProviderPreview | null;
  providerEvidence: {
    target: KnowledgeExportSyncTarget;
    status: KnowledgeProviderExecution["status"];
    artifactName: string;
    artifactType: KnowledgeProviderExecution["artifactType"];
    executionDigest: string;
    packageDigest: string;
    credentialExcluded: true;
    externalWritesPerformed: false;
  };
  packageReviewContext: {
    packageDigest: string;
    reviewNoteCount: number;
    latestReviewNoteAt: string | null;
    notes: KnowledgeProviderExecutionPackageReviewNote[];
  };
  rollbackEvidence: {
    rollbackPlanRef: string | null;
    reconciliationPlanRef: string | null;
    preflightMutationReady: boolean | null;
    preflightBlockers: string[];
  };
  warnings: string[];
};

export type KnowledgeProviderExecutionPackageExport = {
  filename: string;
  json: string;
  digest: string;
  packageData: KnowledgeProviderExecutionPackage;
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
  inventoryManifest?: unknown;
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

type KnowledgeProviderExecutionPackageReviewNoteInput = {
  executionId?: unknown;
  packageDigest?: unknown;
  category?: unknown;
  note?: unknown;
};

type KnowledgeProviderExecutionPackageReviewNoteReportInput = {
  category?: unknown;
  reviewerId?: unknown;
  packageDigest?: unknown;
  executionId?: unknown;
  coveragePreset?: unknown;
  staleDays?: unknown;
};

const knowledgeExportSyncEventType = "knowledge_export_sync";
const knowledgeExportSyncTargetType = "approved_wiki_export_package";
const knowledgeSyncTargetConfigEventType = "knowledge_sync_target_config";
const knowledgeSyncTargetConfigTargetType = "knowledge_sync_target";
const knowledgeProviderPreviewEventType = "knowledge_sync_provider_preview";
const knowledgeProviderPreviewTargetType = "knowledge_sync_provider_preview";
const knowledgeProviderExecutionEventType = "knowledge_sync_provider_execution";
const knowledgeProviderExecutionTargetType = "knowledge_sync_provider_execution";
const knowledgeProviderExecutionPackageReviewNoteEventType = "knowledge_sync_provider_execution_package_review_note";
const knowledgeProviderExecutionPackageReviewNoteTargetType = "knowledge_sync_provider_execution_package";
const knowledgeExportSyncConfirmationText = "SYNC_APPROVED_WIKI";
const knowledgeProviderPreviewConfirmationText = "PREVIEW_APPROVED_WIKI_SYNC";
const knowledgeProviderExecutionConfirmationText = "EXECUTE_APPROVED_WIKI_SYNC";
const knowledgeProviderPreviewFreshnessMs = 24 * 60 * 60 * 1000;
const knowledgeCredentialRegistryEnvName = "KNOWLEDGE_SYNC_CREDENTIAL_REGISTRY_JSON";
const knowledgeObsidianLiveWriteFlagEnvName = "KNOWLEDGE_SYNC_OBSIDIAN_LIVE_WRITE_ENABLED";
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
  const inventoryManifest = normalizeKnowledgeProviderInventoryManifest(input.inventoryManifest, target);
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
      inventoryManifest,
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
  const [executionEvents, noteEvents] = await Promise.all([
    assistantRepository.listAuditEvents({
      eventTypes: [knowledgeProviderExecutionEventType],
      targetType: knowledgeProviderExecutionTargetType,
      limit: 50,
    }),
    assistantRepository.listAuditEvents({
      eventTypes: [knowledgeProviderExecutionPackageReviewNoteEventType],
      targetType: knowledgeProviderExecutionPackageReviewNoteTargetType,
      limit: 500,
    }),
  ]);
  const notesByExecutionId = groupProviderExecutionPackageReviewNotes(noteEvents);
  return executionEvents
    .map((event) => toKnowledgeProviderExecution(event, notesByExecutionId.get(event.id) ?? []))
    .filter((item): item is KnowledgeProviderExecution => Boolean(item));
}

export async function createKnowledgeProviderExecutionPackageReviewNote(
  input: KnowledgeProviderExecutionPackageReviewNoteInput,
  user: AuthUser,
): Promise<KnowledgeProviderExecutionPackageReviewNote> {
  const executionId = normalizeRequiredText(input.executionId, "executionId");
  const executions = await listKnowledgeProviderExecutions();
  const execution = executions.find((item) => item.id === executionId);
  if (!execution) {
    throw badRequest("Knowledge provider execution id was not found.", "KNOWLEDGE_PROVIDER_EXECUTION_NOT_FOUND");
  }

  const packageDigest = normalizeOptionalText(input.packageDigest);
  if (packageDigest && packageDigest !== execution.packageReview.packageDigest) {
    throw badRequest("Provider execution package digest does not match the retained package digest.", "KNOWLEDGE_PROVIDER_EXECUTION_PACKAGE_DIGEST_MISMATCH");
  }

  const event = await assistantRepository.createAuditEvent({
    projectId: execution.projectId,
    profileId: user.id,
    eventType: knowledgeProviderExecutionPackageReviewNoteEventType,
    targetType: knowledgeProviderExecutionPackageReviewNoteTargetType,
    targetId: execution.id,
    metadata: {
      knowledgeProviderExecutionPackageReviewNoteVersion: 1,
      executionId: execution.id,
      packageDigest: execution.packageReview.packageDigest,
      category: normalizeProviderExecutionPackageReviewNoteCategory(input.category),
      note: normalizeProviderExecutionPackageReviewNoteText(input.note),
      reviewerId: user.id,
    },
  });

  const note = toKnowledgeProviderExecutionPackageReviewNote(event);
  if (!note) {
    throw badRequest("Provider execution package review note could not be normalized.", "KNOWLEDGE_PROVIDER_EXECUTION_PACKAGE_REVIEW_NOTE_INVALID");
  }

  return note;
}

export async function getKnowledgeProviderExecutionPackageReviewNoteReport(
  input: KnowledgeProviderExecutionPackageReviewNoteReportInput,
): Promise<KnowledgeProviderExecutionPackageReviewNoteReport> {
  const category = normalizeOptionalProviderExecutionPackageReviewNoteCategory(input.category);
  const reviewerId = normalizeOptionalText(input.reviewerId).toLowerCase();
  const packageDigest = normalizeOptionalText(input.packageDigest).toLowerCase();
  const executionId = normalizeOptionalText(input.executionId).toLowerCase();
  const coveragePreset = normalizeProviderExecutionPackageReviewCoveragePreset(input.coveragePreset);
  const staleDays = normalizePositiveInteger(input.staleDays, 7, 0, 365);
  const executions = await listKnowledgeProviderExecutions();
  const coverage = executions
    .map((execution) => toProviderExecutionPackageReviewCoverageItem(execution, staleDays))
    .filter((item) => matchesProviderExecutionPackageCoveragePreset(item, coveragePreset))
    .filter((item) => !packageDigest || item.packageDigest.toLowerCase().includes(packageDigest))
    .filter((item) => !executionId || item.executionId.toLowerCase().includes(executionId));
  const visibleExecutionIds = new Set(coverage.map((item) => item.executionId));
  const notes = executions
    .flatMap((execution) => execution.packageReviewNotes.map((note) => toProviderExecutionPackageReviewNoteReportItem(note, execution)))
    .filter((note) => visibleExecutionIds.has(note.executionId))
    .filter((note) => !category || note.category === category)
    .filter((note) => !reviewerId || (note.reviewerId ?? "").toLowerCase().includes(reviewerId))
    .filter((note) => !packageDigest || note.packageDigest.toLowerCase().includes(packageDigest))
    .filter((note) => !executionId || note.executionId.toLowerCase().includes(executionId));

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      category: category ?? "all",
      reviewerId: reviewerId || null,
      packageDigest: packageDigest || null,
      executionId: executionId || null,
      coveragePreset,
      staleDays,
    },
    summary: summarizeProviderExecutionPackageReview(executions, staleDays),
    notes,
    coverage,
  };
}

export async function exportKnowledgeProviderExecutionPackageReviewNoteCsv(
  input: KnowledgeProviderExecutionPackageReviewNoteReportInput,
): Promise<{ filename: string; csv: string }> {
  const report = await getKnowledgeProviderExecutionPackageReviewNoteReport(input);
  const header = [
    "note_id",
    "created_at",
    "execution_id",
    "package_digest",
    "category",
    "reviewer_id",
    "target",
    "status",
    "artifact_type",
    "package_filename",
    "note",
  ];
  const rows = report.notes.map((note) => [
    note.id,
    note.createdAt,
    note.executionId,
    note.packageDigest,
    note.category,
    note.reviewerId ?? "",
    note.target,
    note.status,
    note.artifactType,
    note.packageFilename,
    note.note,
  ]);
  return {
    filename: `provider-execution-package-review-notes-${report.generatedAt.slice(0, 10)}.csv`,
    csv: [header, ...rows].map((row) => row.map(formatCsvCell).join(",")).join("\n"),
  };
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
  const { packageReview: _packageReview, packageReviewNotes: _packageReviewNotes, ...executionMetadata } = execution;
  const event = await assistantRepository.createAuditEvent({
    projectId: audit.projectId,
    profileId: user.id,
    eventType: knowledgeProviderExecutionEventType,
    targetType: knowledgeProviderExecutionTargetType,
    targetId: audit.itemCount === 1 ? audit.itemIds[0] : null,
    metadata: {
      knowledgeProviderExecutionVersion: 1,
      ...executionMetadata,
    },
  });

  const normalized = toKnowledgeProviderExecution(event);
  if (!normalized) {
    throw badRequest("Knowledge provider execution could not be normalized.", "KNOWLEDGE_PROVIDER_EXECUTION_INVALID");
  }
  return normalized;
}

export async function exportKnowledgeProviderExecutionPackage(
  input: { executionId?: unknown },
  user: AuthUser,
): Promise<KnowledgeProviderExecutionPackageExport> {
  void user;
  const executionId = normalizeRequiredText(input.executionId, "executionId");
  const executions = await listKnowledgeProviderExecutions();
  const execution = executions.find((item) => item.id === executionId);
  if (!execution) {
    throw badRequest("Knowledge provider execution id was not found.", "KNOWLEDGE_PROVIDER_EXECUTION_NOT_FOUND");
  }

  const [audits, previews] = await Promise.all([
    listKnowledgeExportSyncAudits(),
    listKnowledgeProviderPreviews(),
  ]);
  const exportAudit = audits.find((item) => item.id === execution.auditId) ?? null;
  const providerPreview = previews.find((item) => item.id === execution.previewId) ?? null;
  const packageData = buildKnowledgeProviderExecutionPackage(execution, exportAudit, providerPreview);
  const finalizedJson = JSON.stringify(packageData, null, 2);
  return {
    filename: execution.packageReview.filename,
    json: finalizedJson,
    digest: execution.packageReview.packageDigest,
    packageData,
  };
}

function buildKnowledgeProviderExecutionPackage(
  execution: KnowledgeProviderExecution,
  exportAudit: KnowledgeExportSyncAudit | null,
  providerPreview: KnowledgeProviderPreview | null,
): KnowledgeProviderExecutionPackage {
  const preflight = execution.liveWritePreflight;
  return {
    packageVersion: 1,
    packageGeneratedAt: execution.createdAt,
    executionId: execution.id,
    execution,
    exportAudit,
    providerPreview,
    providerEvidence: {
      target: execution.target,
      status: execution.status,
      artifactName: execution.artifactName,
      artifactType: execution.artifactType,
      executionDigest: execution.contentDigest,
      packageDigest: execution.packageReview.packageDigest,
      credentialExcluded: true,
      externalWritesPerformed: false,
    },
    packageReviewContext: {
      packageDigest: execution.packageReview.packageDigest,
      reviewNoteCount: execution.packageReview.reviewNoteCount,
      latestReviewNoteAt: execution.packageReview.latestReviewNoteAt,
      notes: execution.packageReviewNotes,
    },
    rollbackEvidence: {
      rollbackPlanRef: preflight?.rollbackPlanRef ?? null,
      reconciliationPlanRef: preflight?.reconciliationPlanRef ?? null,
      preflightMutationReady: preflight?.mutationReady ?? null,
      preflightBlockers: preflight?.blockers ?? [],
    },
    warnings: [
      "Provider execution package is read-only evidence generated from append-only audit records.",
      "Provider credentials and secret references are excluded from this package.",
      "Exporting this package does not perform external provider writes.",
      ...execution.warnings,
    ],
  };
}

function createKnowledgeProviderExecutionPackageReview(input: {
  id: string;
  createdAt: string;
  previewId: string;
  auditId: string;
  target: KnowledgeExportSyncTarget;
  status: KnowledgeProviderExecution["status"];
  artifactName: string;
  artifactType: KnowledgeProviderExecution["artifactType"];
  contentDigest: string;
  liveWritePreflight: KnowledgeProviderLiveWritePreflight | null;
  packageReviewNotes?: KnowledgeProviderExecutionPackageReviewNote[];
}): KnowledgeProviderExecutionPackageReview {
  const packageDigest = createHash("sha256")
    .update(JSON.stringify({
      executionId: input.id,
      createdAt: input.createdAt,
      previewId: input.previewId,
      auditId: input.auditId,
      target: input.target,
      status: input.status,
      artifactName: input.artifactName,
      artifactType: input.artifactType,
      executionDigest: input.contentDigest,
      rollbackPlanRef: input.liveWritePreflight?.rollbackPlanRef ?? null,
      reconciliationPlanRef: input.liveWritePreflight?.reconciliationPlanRef ?? null,
      operationCount: input.liveWritePreflight?.operationCount ?? null,
      blockerCount: input.liveWritePreflight?.blockers.length ?? null,
    }))
    .digest("hex");
  return {
    available: true,
    filename: createKnowledgeProviderExecutionPackageFilename(input),
    packageDigest,
    source: "append_only_audit",
    immutable: true,
    localDownloadTracked: false,
    retentionLabel: "server_audit_retained",
    retentionNote: "Package availability is derived from retained append-only provider execution audit metadata; local browser downloads are not tracked here.",
    reviewNoteCount: input.packageReviewNotes?.length ?? 0,
    latestReviewNoteAt: input.packageReviewNotes?.[0]?.createdAt ?? null,
  };
}

function createKnowledgeProviderExecutionPackageFilename(execution: { id: string }) {
  const safeId = execution.id.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80) || "execution";
  return `approved-wiki-provider-execution-${safeId}.json`;
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

function normalizeProviderExecutionPackageReviewNoteCategory(value: unknown): KnowledgeProviderExecutionPackageReviewNoteCategory {
  return value === "risk" || value === "follow_up" || value === "approval_context" ? value : "review_note";
}

function normalizeOptionalProviderExecutionPackageReviewNoteCategory(value: unknown): KnowledgeProviderExecutionPackageReviewNoteCategory | null {
  return value === "review_note" || value === "risk" || value === "follow_up" || value === "approval_context" ? value : null;
}

function normalizeProviderExecutionPackageReviewNoteText(value: unknown) {
  const text = normalizeText(value).slice(0, 4000);
  if (!text) {
    throw badRequest("Provider execution package review note is required.", "KNOWLEDGE_PROVIDER_EXECUTION_PACKAGE_REVIEW_NOTE_REQUIRED");
  }
  return text;
}

function normalizeProviderExecutionPackageReviewCoveragePreset(value: unknown): KnowledgeProviderExecutionPackageReviewNoteReport["filters"]["coveragePreset"] {
  return value === "reviewed" || value === "unreviewed" || value === "stale_unreviewed" ? value : "all";
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(normalizeOptionalText(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
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
      const inventoryManifest = normalizeKnowledgeProviderInventoryManifest(metadata.inventoryManifest, target);
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
        liveWriteFeatureFlag: target === "obsidian" ? knowledgeObsidianLiveWriteFlagEnvName : null,
        liveWriteFeatureFlagEnabled: target === "obsidian" && isObsidianLiveWriteFeatureFlagEnabled(),
        inventoryManifest,
        inventoryEntryCount: inventoryManifest?.entries.length ?? 0,
        inventoryImportedAt: inventoryManifest?.importedAt ?? null,
        inventoryWarnings: inventoryManifest?.warnings ?? [],
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
  const inventoryByPath = new Map((config.inventoryManifest?.entries ?? []).map((entry) => [entry.path, entry]));
  const plannedPaths = new Set<string>();
  const plannedOperations = audit.itemIds.map((itemId) => {
    const item = itemById.get(itemId) ?? null;
    const title = item?.title || `Approved WIKI ${itemId.slice(0, 8)}`;
    const sourceTaskId = item?.sourceTaskId || "unknown";
    const path = `approved-wiki/${slugifyObsidianPath(title)}-${itemId.slice(0, 8)}.md`;
    plannedPaths.add(path);
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
    const inventoryEntry = inventoryByPath.get(path) ?? null;
    const intent: KnowledgeProviderReconciliationIntent = !inventoryEntry
      ? "create"
      : inventoryEntry.contentDigest === contentDigest
        ? "noop"
        : "update";
    return {
      itemId,
      sourceTaskId,
      title,
      path,
      intent,
      contentDigest,
    };
  });
  const deleteOperations = (config.inventoryManifest?.entries ?? [])
    .filter((entry) => entry.managedBy === "approved_wiki" && !plannedPaths.has(entry.path))
    .map((entry) => ({
      itemId: entry.itemId ?? `inventory:${createHash("sha256").update(entry.path).digest("hex").slice(0, 12)}`,
      sourceTaskId: entry.sourceTaskId ?? "remote_inventory",
      title: entry.path.replace(/^approved-wiki\//, "").replace(/\.md$/i, ""),
      path: entry.path,
      intent: "delete" as const,
      contentDigest: entry.contentDigest ?? "",
    }));
  const operations = [...plannedOperations, ...deleteOperations];
  const summary = {
    total: operations.length,
    create: operations.filter((operation) => operation.intent === "create").length,
    update: operations.filter((operation) => operation.intent === "update").length,
    delete: operations.filter((operation) => operation.intent === "delete").length,
    noop: operations.filter((operation) => operation.intent === "noop").length,
  };
  return {
    packageName: audit.packageName.replace(/\.(json|md)$/i, ".obsidian-reconciliation.json"),
    generatedAt: new Date().toISOString(),
    target: audit.target,
    summary,
    operations,
    warnings: [
      "Obsidian reconciliation is dry-run only; no vault files are written.",
      ...(config.inventoryManifest
        ? ["Remote Obsidian inventory manifest is sanitized metadata only; file contents are not stored."]
        : ["Remote Obsidian inventory is not connected yet, so all selected WIKI items are planned as create intents."]),
      ...config.inventoryWarnings,
      ...(plannedOperations.length !== audit.itemIds.length ? ["Some approved WIKI items could not be resolved for reconciliation."] : []),
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

function normalizeKnowledgeProviderInventoryManifest(
  value: unknown,
  target: KnowledgeExportSyncTarget,
): KnowledgeProviderInventoryManifest | null {
  if (target !== "obsidian") {
    return null;
  }
  const parsed = parseInventoryManifestInput(value);
  if (!parsed) {
    return null;
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : { entries: parsed };
  const rawEntries = Array.isArray(record.entries)
    ? record.entries
    : Array.isArray(record.files)
      ? record.files
      : [];
  const warnings = new Set<string>(normalizeStringArray(record.warnings, 20));
  const entries = rawEntries
    .map((entry) => normalizeKnowledgeProviderInventoryEntry(entry, warnings))
    .filter((entry): entry is KnowledgeProviderInventoryEntry => Boolean(entry))
    .slice(0, 500);
  if (rawEntries.length > entries.length) {
    warnings.add("Some inventory entries were ignored because they were missing a safe Markdown path.");
  }
  if (rawEntries.length > 500) {
    warnings.add("Inventory manifest was truncated to 500 entries.");
  }
  return {
    target: "obsidian",
    importedAt: normalizeIsoDate(record.importedAt) ?? new Date().toISOString(),
    entries,
    warnings: [...warnings].slice(0, 20),
  };
}

function parseInventoryManifestInput(value: unknown): unknown | null {
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return {
        entries: [],
        warnings: ["Inventory manifest JSON could not be parsed."],
      };
    }
  }
  if (!value) {
    return null;
  }
  return value;
}

function normalizeKnowledgeProviderInventoryEntry(
  value: unknown,
  warnings: Set<string>,
): KnowledgeProviderInventoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if ("content" in record || "body" in record || "bodyMarkdown" in record || "text" in record) {
    warnings.add("Inventory file contents were ignored; only metadata is stored.");
  }
  const path = normalizeInventoryPath(record.path);
  if (!path) {
    return null;
  }
  const contentDigest = normalizeInventoryDigest(record.contentDigest) ?? normalizeInventoryDigest(record.digest);
  const itemId = normalizeOptionalText(record.itemId || record.sourceItemId).slice(0, 160) || null;
  const sourceTaskId = normalizeOptionalText(record.sourceTaskId).slice(0, 160) || null;
  const managedBy = record.managedBy === "approved_wiki" || path.startsWith("approved-wiki/") ? "approved_wiki" : null;
  return {
    path,
    itemId,
    sourceTaskId,
    contentDigest,
    updatedAt: normalizeIsoDate(record.updatedAt),
    managedBy,
  };
}

function normalizeInventoryPath(value: unknown) {
  const path = normalizeOptionalText(value).replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 220);
  if (!path || path.includes("..") || !path.toLowerCase().endsWith(".md")) {
    return null;
  }
  return path;
}

function normalizeInventoryDigest(value: unknown) {
  const text = normalizeOptionalText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : null;
}

function isObsidianLiveWriteFeatureFlagEnabled() {
  return process.env[knowledgeObsidianLiveWriteFlagEnvName]?.trim().toLowerCase() === "true";
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
  const liveWritePreflight = buildKnowledgeProviderLiveWritePreflight(config, reconciliationPackage);
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
    liveWritePreflight,
  };
  return {
    id: `pending:${preview.id}`,
    projectId: audit.projectId,
    createdAt: new Date().toISOString(),
    previewId: preview.id,
    auditId: audit.id,
    target: audit.target,
    status: liveWritePreflight ? "preflight_recorded" : "executed",
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
      ...(liveWritePreflight
        ? [
            liveWritePreflight.mutationReady
              ? "Obsidian live-write preflight passed; vault mutation adapter is still disabled in this slice."
              : "Obsidian live-write preflight is blocked; no vault files were written.",
            ...liveWritePreflight.blockers.map((blocker) => `Obsidian live-write preflight blocker: ${blocker}`),
          ]
        : []),
      ...(reconciliationPackage ? ["Reconciliation package was copied from the approved provider preview; no external files were written."] : []),
      ...(audit.unsourced ? [`${audit.unsourced} item(s) have no source references.`] : []),
    ],
    reconciliationPackage,
    liveWritePreflight,
    packageReview: createKnowledgeProviderExecutionPackageReview({
      id: `pending:${preview.id}`,
      createdAt: new Date(0).toISOString(),
      previewId: preview.id,
      auditId: audit.id,
      target: audit.target,
      status: liveWritePreflight ? "preflight_recorded" : "executed",
      artifactName: artifact.name,
      artifactType: artifact.type,
      contentDigest: createHash("sha256").update(JSON.stringify(digestInput)).digest("hex"),
      liveWritePreflight,
    }),
    packageReviewNotes: [],
    createdBy: actorId,
  };
}

function buildKnowledgeProviderLiveWritePreflight(
  config: KnowledgeSyncTargetConfig,
  reconciliationPackage: KnowledgeProviderReconciliationPackage | null,
): KnowledgeProviderLiveWritePreflight | null {
  if (config.target !== "obsidian") {
    return null;
  }
  const featureFlagEnabled = isObsidianLiveWriteFeatureFlagEnabled();
  const operations = (reconciliationPackage?.operations ?? []).filter((operation) => operation.intent !== "noop");
  const summary = reconciliationPackage?.summary ?? {
    total: 0,
    create: 0,
    update: 0,
    delete: 0,
    noop: 0,
  };
  const blockers = [
    ...(!featureFlagEnabled ? [`${knowledgeObsidianLiveWriteFlagEnvName} is not enabled.`] : []),
    ...(!config.remoteWriteReady ? config.remoteWriteBlockers : []),
    ...(!config.rollbackPlanRef ? ["Rollback plan reference is missing."] : []),
    ...(!config.reconciliationPlanRef ? ["Reconciliation plan reference is missing."] : []),
    ...(!reconciliationPackage ? ["Fresh Obsidian reconciliation package is missing."] : []),
  ];

  return {
    target: "obsidian",
    generatedAt: new Date().toISOString(),
    featureFlag: knowledgeObsidianLiveWriteFlagEnvName,
    featureFlagEnabled,
    mutationReady: blockers.length === 0,
    rollbackPlanRef: config.rollbackPlanRef,
    reconciliationPlanRef: config.reconciliationPlanRef,
    summary,
    operationCount: operations.length,
    operations,
    blockers,
    warnings: [
      "This is a preflight artifact only; no Obsidian vault files were written.",
      ...(operations.length
        ? [`${operations.length} create/update/delete operation(s) would require a future live-write adapter.`]
        : ["No create/update/delete operation requires live vault mutation."]
      ),
    ],
  };
}

function buildKnowledgeProviderExecutionArtifact(
  audit: KnowledgeExportSyncAudit,
  config: KnowledgeSyncTargetConfig,
): { name: string; type: KnowledgeProviderExecution["artifactType"]; warning: string } {
  if (config.adapter === "markdown_files") {
    return {
      name: audit.packageName.replace(/\.(json|md)$/i, ".obsidian-live-write-preflight.json"),
      type: "obsidian_live_write_preflight",
      warning: "Obsidian execution recorded only an append-only live-write preflight artifact in this slice; vault file writes remain disabled.",
    };
  }
  return {
    name: audit.packageName.replace(/\.(json|md)$/i, ".manifest.json"),
    type: "portable_archive_manifest",
    warning: "Portable archive execution wrote only an append-only server audit artifact in this slice.",
  };
}

function toKnowledgeProviderExecution(
  event: AssistantAuditEvent,
  packageReviewNotes: KnowledgeProviderExecutionPackageReviewNote[] = [],
): KnowledgeProviderExecution | null {
  if (event.eventType !== knowledgeProviderExecutionEventType || event.targetType !== knowledgeProviderExecutionTargetType) {
    return null;
  }
  const metadata = event.metadata;
  const target = normalizeKnowledgeExportSyncTarget(metadata.target);
  const liveWritePreflight = normalizeKnowledgeProviderLiveWritePreflight(metadata.liveWritePreflight);
  const execution = {
    id: event.id,
    projectId: event.projectId,
    createdAt: event.createdAt,
    previewId: normalizeOptionalText(metadata.previewId),
    auditId: normalizeOptionalText(metadata.auditId),
    target,
    status: normalizeKnowledgeProviderExecutionStatus(metadata.status),
    destination: normalizeOptionalText(metadata.destination) || readKnowledgeSyncTargetLabel(target),
    packageName: normalizeOptionalText(metadata.packageName),
    artifactName: normalizeOptionalText(metadata.artifactName),
    artifactType: normalizeKnowledgeProviderExecutionArtifactType(metadata.artifactType),
    itemCount: readNumber(metadata.itemCount, 0),
    contentDigest: normalizeOptionalText(metadata.contentDigest),
    warnings: normalizeStringArray(metadata.warnings, 20),
    reconciliationPackage: normalizeKnowledgeProviderReconciliationPackage(metadata.reconciliationPackage),
    liveWritePreflight,
    createdBy: normalizeOptionalText(metadata.createdBy) || event.profileId,
  };
  return {
    ...execution,
    packageReview: createKnowledgeProviderExecutionPackageReview({
      ...execution,
      packageReviewNotes,
    }),
    packageReviewNotes,
  };
}

function groupProviderExecutionPackageReviewNotes(events: AssistantAuditEvent[]) {
  const notesByExecutionId = new Map<string, KnowledgeProviderExecutionPackageReviewNote[]>();
  for (const event of events) {
    const note = toKnowledgeProviderExecutionPackageReviewNote(event);
    if (!note) {
      continue;
    }
    const current = notesByExecutionId.get(note.executionId) ?? [];
    current.push(note);
    notesByExecutionId.set(note.executionId, current);
  }
  for (const notes of notesByExecutionId.values()) {
    notes.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  return notesByExecutionId;
}

function toKnowledgeProviderExecutionPackageReviewNote(event: AssistantAuditEvent): KnowledgeProviderExecutionPackageReviewNote | null {
  if (
    event.eventType !== knowledgeProviderExecutionPackageReviewNoteEventType ||
    event.targetType !== knowledgeProviderExecutionPackageReviewNoteTargetType
  ) {
    return null;
  }
  const metadata = event.metadata;
  const executionId = normalizeOptionalText(metadata.executionId || event.targetId);
  const packageDigest = normalizeOptionalText(metadata.packageDigest);
  const note = normalizeOptionalText(metadata.note);
  if (!executionId || !packageDigest || !note) {
    return null;
  }
  return {
    id: event.id,
    createdAt: event.createdAt,
    executionId,
    packageDigest,
    category: normalizeProviderExecutionPackageReviewNoteCategory(metadata.category),
    note,
    reviewerId: normalizeOptionalText(metadata.reviewerId) || event.profileId,
  };
}

function toProviderExecutionPackageReviewNoteReportItem(
  note: KnowledgeProviderExecutionPackageReviewNote,
  execution: KnowledgeProviderExecution,
): KnowledgeProviderExecutionPackageReviewNoteReportItem {
  return {
    ...note,
    executionCreatedAt: execution.createdAt,
    target: execution.target,
    status: execution.status,
    artifactType: execution.artifactType,
    packageFilename: execution.packageReview.filename,
  };
}

function toProviderExecutionPackageReviewCoverageItem(
  execution: KnowledgeProviderExecution,
  staleDays: number,
): KnowledgeProviderExecutionPackageReviewCoverageItem {
  const createdAt = Date.parse(execution.createdAt);
  const staleAt = Number.isFinite(createdAt) ? createdAt + staleDays * 24 * 60 * 60 * 1000 : Number.POSITIVE_INFINITY;
  const isStale = execution.packageReviewNotes.length === 0 && Date.now() >= staleAt;
  const reviewerIds = [...new Set(execution.packageReviewNotes.map((note) => note.reviewerId).filter((item): item is string => Boolean(item)))];
  return {
    executionId: execution.id,
    executionCreatedAt: execution.createdAt,
    target: execution.target,
    status: execution.status,
    artifactType: execution.artifactType,
    packageDigest: execution.packageReview.packageDigest,
    packageFilename: execution.packageReview.filename,
    noteCount: execution.packageReviewNotes.length,
    latestReviewNoteAt: execution.packageReview.latestReviewNoteAt,
    reviewerIds,
    coverageStatus: execution.packageReviewNotes.length ? "reviewed" : isStale ? "stale_unreviewed" : "unreviewed",
    staleDays,
    isStale,
  };
}

function matchesProviderExecutionPackageCoveragePreset(
  item: KnowledgeProviderExecutionPackageReviewCoverageItem,
  preset: KnowledgeProviderExecutionPackageReviewNoteReport["filters"]["coveragePreset"],
) {
  return preset === "all" || item.coverageStatus === preset || (preset === "unreviewed" && item.noteCount === 0);
}

function summarizeProviderExecutionPackageReview(
  executions: KnowledgeProviderExecution[],
  staleDays: number,
): KnowledgeProviderExecutionPackageReviewNoteReport["summary"] {
  const coverage = executions.map((execution) => toProviderExecutionPackageReviewCoverageItem(execution, staleDays));
  const notes = executions.flatMap((execution) => execution.packageReviewNotes);
  const reviewerCountMap = new Map<string, { reviewerId: string | null; count: number }>();
  const categoryCountMap = new Map<KnowledgeProviderExecutionPackageReviewNoteCategory, number>();
  for (const note of notes) {
    const reviewerKey = note.reviewerId ?? "";
    const reviewerCount = reviewerCountMap.get(reviewerKey) ?? { reviewerId: note.reviewerId, count: 0 };
    reviewerCount.count += 1;
    reviewerCountMap.set(reviewerKey, reviewerCount);
    categoryCountMap.set(note.category, (categoryCountMap.get(note.category) ?? 0) + 1);
  }
  return {
    packageCount: executions.length,
    reviewedCount: coverage.filter((item) => item.noteCount > 0).length,
    unreviewedCount: coverage.filter((item) => item.noteCount === 0).length,
    staleUnreviewedCount: coverage.filter((item) => item.coverageStatus === "stale_unreviewed").length,
    noteCount: notes.length,
    reviewerCounts: [...reviewerCountMap.values()].sort((left, right) => right.count - left.count),
    categoryCounts: (["review_note", "risk", "follow_up", "approval_context"] as KnowledgeProviderExecutionPackageReviewNoteCategory[]).map((category) => ({
      category,
      count: categoryCountMap.get(category) ?? 0,
    })),
  };
}

function formatCsvCell(value: string) {
  const safeValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\r\n]/.test(safeValue)) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }
  return safeValue;
}

function normalizeKnowledgeProviderExecutionStatus(value: unknown): KnowledgeProviderExecution["status"] {
  return value === "preflight_recorded" ? "preflight_recorded" : "executed";
}

function normalizeKnowledgeProviderExecutionArtifactType(value: unknown): KnowledgeProviderExecution["artifactType"] {
  if (value === "obsidian_live_write_preflight") {
    return "obsidian_live_write_preflight";
  }
  return value === "obsidian_markdown_manifest" ? "obsidian_markdown_manifest" : "portable_archive_manifest";
}

function normalizeKnowledgeProviderLiveWritePreflight(value: unknown): KnowledgeProviderLiveWritePreflight | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (normalizeKnowledgeExportSyncTarget(record.target) !== "obsidian") {
    return null;
  }
  const packageData = record.summary && typeof record.summary === "object" && !Array.isArray(record.summary)
    ? record.summary as Record<string, unknown>
    : {};
  const operations = Array.isArray(record.operations)
    ? record.operations
      .map(normalizeKnowledgeProviderReconciliationOperation)
      .filter((operation): operation is KnowledgeProviderReconciliationOperation => Boolean(operation))
      .filter((operation) => operation.intent !== "noop")
      .slice(0, 250)
    : [];
  const summary = {
    total: readNumber(packageData.total, operations.length),
    create: readNumber(packageData.create, operations.filter((operation) => operation.intent === "create").length),
    update: readNumber(packageData.update, operations.filter((operation) => operation.intent === "update").length),
    delete: readNumber(packageData.delete, operations.filter((operation) => operation.intent === "delete").length),
    noop: readNumber(packageData.noop, 0),
  };
  return {
    target: "obsidian",
    generatedAt: normalizeIsoDate(record.generatedAt) ?? new Date(0).toISOString(),
    featureFlag: normalizeOptionalText(record.featureFlag) || knowledgeObsidianLiveWriteFlagEnvName,
    featureFlagEnabled: record.featureFlagEnabled === true,
    mutationReady: record.mutationReady === true,
    rollbackPlanRef: normalizeOptionalText(record.rollbackPlanRef) || null,
    reconciliationPlanRef: normalizeOptionalText(record.reconciliationPlanRef) || null,
    summary,
    operationCount: readNumber(record.operationCount, operations.length),
    operations,
    blockers: normalizeStringArray(record.blockers, 20),
    warnings: normalizeStringArray(record.warnings, 20),
  };
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
