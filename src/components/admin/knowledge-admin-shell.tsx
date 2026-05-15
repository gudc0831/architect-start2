"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/components/admin/knowledge-admin-shell.module.css";

type CandidateState = "candidate" | "pending_review" | "approved" | "rejected" | "not_candidate";
type Scope = "admin_only" | "organization" | "project_members" | "project";

type Evidence = {
  id: string;
  kind: string;
  title: string;
  excerpt: string;
  priority: number;
  sourceUrl?: string;
};

type ApprovedKnowledgeItem = {
  id: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: string[];
  scope: Scope;
  sourceRecordId: string;
  sourceTaskId: string;
  sourceProjectId: string;
  sourceReferences: Evidence[];
  approvedBy: string;
  approvedAt: string;
};

type CandidateListItem = {
  id: string;
  state: CandidateState;
  title: string;
  summary: string;
  tags: string[];
  projectName: string;
  taskIssueId: string;
  taskTitle: string;
  confidenceScore: number;
  cleanupState: "draft" | "approved" | "deferred";
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CandidateDetail = CandidateListItem & {
  question: string;
  answer: string;
  evidence: Evidence[];
  confidenceReason: string;
  wikiDraft: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    tags: string[];
    scope: Scope;
  };
  review: {
    status: "approved" | "rejected";
    reviewedAt: string;
    rejectionReason?: string;
  } | null;
  approvedKnowledgeItem: ApprovedKnowledgeItem | null;
};

type KnowledgeAdminShellProps = {
  initialCandidates: CandidateListItem[];
};

type ApprovalGuardrail = {
  label: string;
  detail: string;
  tone: "ready" | "warning";
};

type ApprovalRiskGroup = {
  key: "scope" | "metadata" | "structure" | "evidence" | "state";
  label: string;
  readyCount: number;
  warningCount: number;
  items: ApprovalGuardrail[];
};

type ApprovalRiskFilter = ApprovalRiskGroup["key"] | "all";

type RejectionReasonPreset = {
  label: string;
  reason: string;
};

type ReviewChecklistItem = {
  label: string;
  detail: string;
  ready: boolean;
};

type MarkdownHeading = {
  level: number;
  line: number;
  text: string;
};

type MarkdownStructureSummary = {
  headings: number;
  paragraphs: number;
  listItems: number;
  lines: number;
};

type MarkdownWikiLink = {
  line: number;
  target: string;
  label: string;
};

type CandidateRiskFilter = "all" | "low_confidence" | "unreviewed" | "cleanup_approved";
type CandidateSort = "newest" | "low_confidence";
type EvidenceSourceFilter = "all" | "sourced" | "unsourced";
type EvidencePriorityFilter = "all" | "high" | "normal" | "low";
type ApprovedSourceFilter = "all" | "sourced" | "unsourced";
type ApprovedSort = "newest" | "title" | "source_count";
type ApprovedExportFormat = "json" | "markdown";
type ApprovedExportScope = "visible" | "selected";
type ApprovedSyncTarget = "portable_archive" | "obsidian" | "notion" | "assistant_retrieval";
type ApprovedSyncRunStatus = "dry_run" | "blocked" | "simulated" | "provider_blocked" | "provider_ready";
type ApprovedSyncAction = "dry_run" | "execute";

type ApprovedSyncRun = {
  id: string;
  createdAt: string;
  status: ApprovedSyncRunStatus;
  action?: ApprovedSyncAction;
  target: ApprovedSyncTarget;
  format: ApprovedExportFormat;
  scope: ApprovedExportScope;
  itemIds?: string[];
  itemCount: number;
  readyCount: number;
  readinessCount: number;
  sourceReferences: number;
  unsourced: number;
  confirmation: string;
  packageName: string;
  dryRunWarnings: string[];
  providerConfigured?: boolean;
  providerExecutionEnabled?: boolean;
  projectId?: string | null;
  createdBy?: string | null;
};

type ApprovedSyncTargetConfig = {
  target: ApprovedSyncTarget;
  label: string;
  enabled: boolean;
  dryRunOnly: boolean;
  adapter: "portable_archive" | "markdown_files" | "notion_blocks" | "retrieval_index";
  credentialRef: string | null;
  credentialStatus: "not_required" | "missing" | "configured";
  credentialSource: "not_required" | "target_config" | "server_env" | "secret_manager" | "missing";
  credentialScope: ApprovedSyncTarget;
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
  inventoryManifest: ApprovedProviderInventoryManifest | null;
  inventoryEntryCount: number;
  inventoryImportedAt: string | null;
  inventoryWarnings: string[];
  notes: string;
  updatedAt: string | null;
  updatedBy: string | null;
  auditId: string | null;
};

type ApprovedProviderInventoryManifest = {
  target: ApprovedSyncTarget;
  importedAt: string;
  entries: ApprovedProviderInventoryEntry[];
  warnings: string[];
};

type ApprovedProviderInventoryEntry = {
  path: string;
  itemId: string | null;
  sourceTaskId: string | null;
  contentDigest: string | null;
  updatedAt: string | null;
  managedBy: "approved_wiki" | null;
};

type ApprovedProviderPreview = {
  id: string;
  createdAt: string;
  auditId: string;
  target: ApprovedSyncTarget;
  status: "dry_run_preview";
  destination: string;
  packageName: string;
  operations: string[];
  warnings: string[];
  reconciliationPackage: ApprovedProviderReconciliationPackage | null;
  createdBy: string | null;
};

type ApprovedProviderReconciliationOperation = {
  itemId: string;
  sourceTaskId: string;
  title: string;
  path: string;
  intent: "create" | "update" | "delete" | "noop";
  contentDigest: string;
};

type ApprovedProviderReconciliationPackage = {
  packageName: string;
  generatedAt: string;
  target: ApprovedSyncTarget;
  summary: {
    total: number;
    create: number;
    update: number;
    delete: number;
    noop: number;
  };
  operations: ApprovedProviderReconciliationOperation[];
  warnings: string[];
};

type ApprovedProviderLiveWritePreflight = {
  target: "obsidian";
  generatedAt: string;
  featureFlag: string;
  featureFlagEnabled: boolean;
  mutationReady: boolean;
  rollbackPlanRef: string | null;
  reconciliationPlanRef: string | null;
  summary: ApprovedProviderReconciliationPackage["summary"];
  operationCount: number;
  operations: ApprovedProviderReconciliationOperation[];
  blockers: string[];
  warnings: string[];
};

type ApprovedProviderExecution = {
  id: string;
  projectId: string | null;
  createdAt: string;
  previewId: string;
  auditId: string;
  target: ApprovedSyncTarget;
  status: "executed" | "preflight_recorded";
  destination: string;
  packageName: string;
  artifactName: string;
  artifactType: "portable_archive_manifest" | "obsidian_markdown_manifest" | "obsidian_live_write_preflight";
  itemCount: number;
  contentDigest: string;
  warnings: string[];
  reconciliationPackage: ApprovedProviderReconciliationPackage | null;
  liveWritePreflight: ApprovedProviderLiveWritePreflight | null;
  packageReview: ApprovedProviderExecutionPackageReview;
  packageReviewNotes: ApprovedProviderExecutionPackageReviewNote[];
  createdBy: string | null;
};

type ApprovedProviderExecutionPackageReview = {
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

type ProviderExecutionPackageReviewNoteCategory = "review_note" | "risk" | "follow_up" | "approval_context";

type ApprovedProviderExecutionPackageReviewNote = {
  id: string;
  createdAt: string;
  executionId: string;
  packageDigest: string;
  category: ProviderExecutionPackageReviewNoteCategory;
  note: string;
  reviewerId: string | null;
};

type ProviderExecutionPackageReviewCoveragePreset = "all" | "reviewed" | "unreviewed" | "stale_unreviewed";
type ProviderExecutionPackageReviewCoverageStatus = Exclude<ProviderExecutionPackageReviewCoveragePreset, "all">;
type ProviderExecutionPackageReviewQueueDensity = "comfortable" | "compact";

type ProviderExecutionPackageReviewNoteReport = {
  generatedAt: string;
  filters: {
    category: ProviderExecutionPackageReviewNoteCategory | "all";
    reviewerId: string | null;
    packageDigest: string | null;
    executionId: string | null;
    coveragePreset: ProviderExecutionPackageReviewCoveragePreset;
    staleDays: number;
  };
  summary: {
    packageCount: number;
    reviewedCount: number;
    unreviewedCount: number;
    staleUnreviewedCount: number;
    noteCount: number;
    coverageGroupTotals: {
      totalCount: number;
      reviewedCount: number;
      unreviewedCount: number;
      staleUnreviewedCount: number;
      noteCount: number;
    };
    reviewerCounts: { reviewerId: string | null; count: number }[];
    categoryCounts: { category: ProviderExecutionPackageReviewNoteCategory; count: number }[];
  };
  notes: (ApprovedProviderExecutionPackageReviewNote & {
    executionCreatedAt: string;
    target: ApprovedSyncTarget;
    status: ApprovedProviderExecution["status"];
    artifactType: ApprovedProviderExecution["artifactType"];
    packageFilename: string;
  })[];
  coverage: {
    executionId: string;
    executionCreatedAt: string;
    target: ApprovedSyncTarget;
    status: ApprovedProviderExecution["status"];
    artifactType: ApprovedProviderExecution["artifactType"];
    packageDigest: string;
    packageFilename: string;
    noteCount: number;
    latestReviewNoteAt: string | null;
    reviewerIds: string[];
    coverageStatus: "reviewed" | "unreviewed" | "stale_unreviewed";
    staleDays: number;
    isStale: boolean;
  }[];
};

type RegulationGovernanceRefreshStatus = "scheduled" | "due" | "overdue";
type RegulationGovernanceSourceReviewState = "reviewed" | "needs_follow_up" | "blocked";

type RegulationGovernanceAcknowledgement = {
  id: string;
  createdAt: string;
  packageId: string;
  packageDigest: string;
  asOf: string;
  note: string;
  reviewerId: string | null;
  sourceCount: number;
  documentCount: number;
  statusCounts: Record<RegulationGovernanceRefreshStatus, number>;
  valid: boolean;
  productionImportEnabled: boolean;
};

type RegulationGovernanceSourceReview = {
  id: string;
  createdAt: string;
  packageId: string;
  packageDigest: string;
  asOf: string;
  sourceId: string;
  sourceName: string;
  reviewState: RegulationGovernanceSourceReviewState;
  note: string;
  reviewerId: string | null;
  refreshStatus: RegulationGovernanceRefreshStatus;
  documentCount: number;
  adminReviewRequiredCount: number;
  checklistCount: number;
};

type RegulationGovernanceReport = {
  packageId: string;
  packageDigest: string;
  title: string;
  generatedAt: string;
  asOf: string;
  valid: boolean;
  seedValid: boolean;
  errors: string[];
  warnings: string[];
  productionImport: {
    enabled: boolean;
    requiredReview: "knowledge_admin";
    blockedReason?: string;
  };
  refreshPolicy: {
    cadenceDays: number;
    staleAfterDays: number;
    ownerRole: "knowledge_admin";
  };
  sourceCount: number;
  documentCount: number;
  statusCounts: Record<RegulationGovernanceRefreshStatus, number>;
  sources: {
    sourceId: string;
    sourceName: string;
    publisher: string;
    officialUrl: string;
    refreshDueAt: string;
    refreshStatus: RegulationGovernanceRefreshStatus;
    daysUntilDue: number | null;
    verificationChecklist: string[];
    documentCount: number;
    adminReviewRequiredCount: number;
    approvedDocumentCount: number;
    reviewSummary: {
      count: number;
      latestReviewedAt: string | null;
      latestReviewerId: string | null;
      latestReviewState: RegulationGovernanceSourceReviewState | null;
      latestNote: string | null;
    };
    reviews: RegulationGovernanceSourceReview[];
  }[];
  sourceReviewSummary: {
    count: number;
    reviewedSourceCount: number;
    unreviewedSourceCount: number;
    followUpSourceCount: number;
    blockedSourceCount: number;
    latestReviewedAt: string | null;
    latestReviewerId: string | null;
  };
  productionImportPreflight: {
    status: "ready" | "blocked";
    canImport: boolean;
    requiredReview: "knowledge_admin";
    packageDigest: string;
    acknowledgementCount: number;
    sourceReviewCoverage: {
      reviewedSourceCount: number;
      requiredSourceCount: number;
      blockedSourceCount: number;
      followUpSourceCount: number;
    };
    blockers: string[];
    warnings: string[];
  };
  acknowledgementSummary: {
    count: number;
    latestAcknowledgedAt: string | null;
    latestReviewerId: string | null;
  };
  acknowledgements: RegulationGovernanceAcknowledgement[];
};

type RegulationSourceReviewCoveragePreset = "all" | "reviewed" | "unreviewed" | "stale";

type RegulationSourceReviewCoverageReport = {
  generatedAt: string;
  packageId: string;
  packageDigest: string;
  filters: {
    coveragePreset: RegulationSourceReviewCoveragePreset;
    staleDays: number;
  };
  summary: {
    sourceCount: number;
    reviewedSourceCount: number;
    unreviewedSourceCount: number;
    staleSourceCount: number;
    blockedSourceCount: number;
    followUpSourceCount: number;
    latestReviewedAt: string | null;
    latestReviewerId: string | null;
  };
  sources: {
    sourceId: string;
    sourceName: string;
    officialUrl: string;
    packageDigest: string;
    coverageStatus: RegulationSourceReviewCoveragePreset;
    reviewCount: number;
    latestReviewedAt: string | null;
    latestReviewerId: string | null;
    latestReviewState: RegulationGovernanceSourceReviewState | null;
    staleDays: number;
    isStale: boolean;
    refreshStatus: RegulationGovernanceRefreshStatus;
    documentCount: number;
    adminReviewRequiredCount: number;
  }[];
};

type FileAnalysisChunkDebugReport = {
  generatedAt: string;
  database: {
    available: boolean;
    reason: string | null;
    totalChunks: number;
    embeddedChunks: number;
    missingEmbeddings: number;
    projectCount: number;
    fileCount: number;
    analysisCount: number;
  };
  filters: {
    query: string | null;
    sourceType: string | null;
    verificationState: string | null;
    sampleLimit: number;
  };
  coverage: {
    sourceType: string;
    verificationState: string;
    totalChunks: number;
    embeddedChunks: number;
    missingEmbeddings: number;
  }[];
  missingSamples: {
    id: string;
    fileId: string;
    analysisId: string;
    chunkIndex: number;
    tokenHash: string;
    sourceType: string;
    verificationState: string;
    chars: number;
    preview: string;
  }[];
  retrieval: {
    id: string;
    fileName: string;
    chunkIndex: number;
    sourceType: string;
    verificationState: string;
    ftsRank: number;
    vectorReady: boolean;
    preview: string;
  }[];
  blockers: string[];
  warnings: string[];
};

type KnowledgeExternalSyncWorkerReport = {
  generatedAt: string;
  dryRun: true;
  queue: {
    pendingProviderReadyAudits: number;
    pendingPreviewCount: number;
    executionCount: number;
    targetCounts: Record<ApprovedSyncTarget, number>;
  };
  targets: {
    target: ApprovedSyncTarget;
    enabled: boolean;
    dryRunOnly: boolean;
    credentialStatus: string;
    remoteWriteReady: boolean;
    remoteWriteBlockers: string[];
    liveWriteFeatureFlag: string | null;
    liveWriteFeatureFlagEnabled: boolean;
  }[];
  nextActions: {
    auditId: string;
    target: ApprovedSyncTarget;
    packageName: string;
    status: ApprovedSyncRun["status"];
    action: "blocked" | "preflight_only" | "ready_for_guarded_execution";
    blockers: string[];
  }[];
  blockers: string[];
  warnings: string[];
};

type KnowledgeAdminCapabilityReport = {
  userId: string;
  accessStatus: string;
  allowed: boolean;
  role: "admin" | "member";
  mapping: "global_admin_backfill" | "explicit_capability" | "none";
  capabilities: string[];
  migration: {
    schemaVersion: 1;
    profileCapabilityTableReady: false;
    backfillRequired: boolean;
    backfillSource: "global_admin";
  };
};

const stateLabels: Record<CandidateState, string> = {
  candidate: "검토 대기",
  pending_review: "검토 중",
  approved: "승인됨",
  rejected: "반려됨",
  not_candidate: "후보 제외",
};

const scopeLabels: Record<Scope, string> = {
  admin_only: "관리자 전용",
  organization: "조직 공통",
  project_members: "프로젝트 멤버",
  project: "프로젝트 전용",
};

const candidateRiskFilterLabels: Record<CandidateRiskFilter, string> = {
  all: "All risk",
  low_confidence: "Low confidence",
  unreviewed: "Unreviewed",
  cleanup_approved: "Cleanup approved",
};

const candidateSortLabels: Record<CandidateSort, string> = {
  newest: "Newest first",
  low_confidence: "Low confidence first",
};

const evidenceSourceFilterLabels: Record<EvidenceSourceFilter, string> = {
  all: "All evidence",
  sourced: "Sourced",
  unsourced: "Unsourced",
};

const evidencePriorityFilterLabels: Record<EvidencePriorityFilter, string> = {
  all: "All priorities",
  high: "High priority",
  normal: "Normal priority",
  low: "Low priority",
};

const approvedSourceFilterLabels: Record<ApprovedSourceFilter, string> = {
  all: "All source states",
  sourced: "Has source refs",
  unsourced: "No source refs",
};

const approvedSortLabels: Record<ApprovedSort, string> = {
  newest: "Newest approved",
  title: "Title A-Z",
  source_count: "Most source refs",
};

const approvedExportFormatLabels: Record<ApprovedExportFormat, string> = {
  json: "JSON package",
  markdown: "Markdown package",
};

const approvedExportScopeLabels: Record<ApprovedExportScope, string> = {
  visible: "Visible items",
  selected: "Selected item",
};

const approvedSyncTargetLabels: Record<ApprovedSyncTarget, string> = {
  portable_archive: "Portable archive",
  obsidian: "Obsidian vault",
  notion: "Notion import",
  assistant_retrieval: "Assistant retrieval",
};

const approvedSyncConfirmationText = "SYNC_APPROVED_WIKI";
const approvedProviderPreviewConfirmationText = "PREVIEW_APPROVED_WIKI_SYNC";
const approvedProviderExecutionConfirmationText = "EXECUTE_APPROVED_WIKI_SYNC";
const approvedSyncHistoryStorageKey = "architect.approvedWikiSyncHistory.v1";
const providerExecutionPackageReviewNoteCategories: { value: ProviderExecutionPackageReviewNoteCategory; label: string }[] = [
  { value: "review_note", label: "Review note" },
  { value: "risk", label: "Risk" },
  { value: "follow_up", label: "Follow-up" },
  { value: "approval_context", label: "Approval context" },
];
const providerExecutionPackageReviewCoverageStatusLabels: Record<ProviderExecutionPackageReviewCoverageStatus, string> = {
  reviewed: "Reviewed",
  unreviewed: "Unreviewed",
  stale_unreviewed: "Stale unreviewed",
};

const regulationGovernanceStatusLabels: Record<RegulationGovernanceRefreshStatus, string> = {
  scheduled: "Scheduled",
  due: "Due soon",
  overdue: "Overdue",
};
const regulationGovernanceSourceReviewStateOptions: { value: RegulationGovernanceSourceReviewState; label: string }[] = [
  { value: "reviewed", label: "Reviewed" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "blocked", label: "Blocked" },
];
const regulationGovernanceSourceReviewStateLabels: Record<RegulationGovernanceSourceReviewState, string> = {
  reviewed: "Reviewed",
  needs_follow_up: "Needs follow-up",
  blocked: "Blocked",
};
const regulationSourceReviewCoverageLabels: Record<RegulationSourceReviewCoveragePreset, string> = {
  all: "All source reviews",
  reviewed: "Reviewed",
  unreviewed: "Unreviewed",
  stale: "Stale",
};

export function KnowledgeAdminShell({ initialCandidates }: KnowledgeAdminShellProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedId, setSelectedId] = useState(initialCandidates[0]?.id ?? "");
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState("후보를 선택하세요.");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CandidateState | "all">("candidate");
  const [riskFilter, setRiskFilter] = useState<CandidateRiskFilter>("all");
  const [candidateSort, setCandidateSort] = useState<CandidateSort>("newest");
  const [candidateQueueCompact, setCandidateQueueCompact] = useState(false);
  const [evidenceSourceFilter, setEvidenceSourceFilter] = useState<EvidenceSourceFilter>("all");
  const [evidencePriorityFilter, setEvidencePriorityFilter] = useState<EvidencePriorityFilter>("all");
  const [approvalRiskFilter, setApprovalRiskFilter] = useState<ApprovalRiskFilter>("all");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [previewCompact, setPreviewCompact] = useState(false);
  const [approvedItems, setApprovedItems] = useState<ApprovedKnowledgeItem[]>([]);
  const [approvedItemsLoaded, setApprovedItemsLoaded] = useState(false);
  const [approvedSearch, setApprovedSearch] = useState("");
  const [approvedScopeFilter, setApprovedScopeFilter] = useState<Scope | "all">("all");
  const [approvedTagFilter, setApprovedTagFilter] = useState("all");
  const [approvedSourceFilter, setApprovedSourceFilter] = useState<ApprovedSourceFilter>("all");
  const [approvedSort, setApprovedSort] = useState<ApprovedSort>("newest");
  const [selectedApprovedId, setSelectedApprovedId] = useState("");
  const [approvedPreviewCompact, setApprovedPreviewCompact] = useState(true);
  const [approvedExportFormat, setApprovedExportFormat] = useState<ApprovedExportFormat>("json");
  const [approvedExportScope, setApprovedExportScope] = useState<ApprovedExportScope>("visible");
  const [approvedSyncTarget, setApprovedSyncTarget] = useState<ApprovedSyncTarget>("portable_archive");
  const [approvedSyncConfirmation, setApprovedSyncConfirmation] = useState("");
  const [approvedSyncHistory, setApprovedSyncHistory] = useState<ApprovedSyncRun[]>([]);
  const [approvedSyncHistoryLoaded, setApprovedSyncHistoryLoaded] = useState(false);
  const [approvedSyncTargetConfigs, setApprovedSyncTargetConfigs] = useState<ApprovedSyncTargetConfig[]>([]);
  const [approvedSyncTargetEnabled, setApprovedSyncTargetEnabled] = useState(false);
  const [approvedSyncTargetDryRunOnly, setApprovedSyncTargetDryRunOnly] = useState(true);
  const [approvedSyncTargetCredentialRef, setApprovedSyncTargetCredentialRef] = useState("");
  const [approvedSyncTargetInventoryManifest, setApprovedSyncTargetInventoryManifest] = useState("");
  const [approvedSyncTargetNotes, setApprovedSyncTargetNotes] = useState("");
  const [approvedProviderPreviewConfirmation, setApprovedProviderPreviewConfirmation] = useState("");
  const [approvedProviderPreview, setApprovedProviderPreview] = useState<ApprovedProviderPreview | null>(null);
  const [approvedProviderExecutionConfirmation, setApprovedProviderExecutionConfirmation] = useState("");
  const [approvedProviderExecution, setApprovedProviderExecution] = useState<ApprovedProviderExecution | null>(null);
  const [approvedProviderExecutions, setApprovedProviderExecutions] = useState<ApprovedProviderExecution[]>([]);
  const [approvedProviderExecutionTargetFilter, setApprovedProviderExecutionTargetFilter] = useState<ApprovedSyncTarget | "all">("all");
  const [approvedProviderExecutionStatusFilter, setApprovedProviderExecutionStatusFilter] = useState<ApprovedProviderExecution["status"] | "all">("all");
  const [approvedProviderExecutionArtifactFilter, setApprovedProviderExecutionArtifactFilter] = useState<ApprovedProviderExecution["artifactType"] | "all">("all");
  const [approvedProviderExecutionDigestFilter, setApprovedProviderExecutionDigestFilter] = useState("");
  const [approvedProviderExecutionReviewNoteCategory, setApprovedProviderExecutionReviewNoteCategory] =
    useState<ProviderExecutionPackageReviewNoteCategory>("review_note");
  const [approvedProviderExecutionReviewNoteText, setApprovedProviderExecutionReviewNoteText] = useState("");
  const [approvedProviderExecutionReviewNoteSaving, setApprovedProviderExecutionReviewNoteSaving] = useState(false);
  const [approvedProviderExecutionReviewReport, setApprovedProviderExecutionReviewReport] =
    useState<ProviderExecutionPackageReviewNoteReport | null>(null);
  const [approvedProviderExecutionReviewCategoryFilter, setApprovedProviderExecutionReviewCategoryFilter] =
    useState<ProviderExecutionPackageReviewNoteCategory | "all">("all");
  const [approvedProviderExecutionReviewCoveragePreset, setApprovedProviderExecutionReviewCoveragePreset] =
    useState<ProviderExecutionPackageReviewCoveragePreset>("all");
  const [approvedProviderExecutionReviewReviewerFilter, setApprovedProviderExecutionReviewReviewerFilter] = useState("");
  const [approvedProviderExecutionReviewStaleDays, setApprovedProviderExecutionReviewStaleDays] = useState(7);
  const [approvedProviderExecutionReviewQueueDensity, setApprovedProviderExecutionReviewQueueDensity] =
    useState<ProviderExecutionPackageReviewQueueDensity>("comfortable");
  const [approvedProviderExecutionCoverageSummaryDownloadFilename, setApprovedProviderExecutionCoverageSummaryDownloadFilename] =
    useState("");
  const [approvedProviderExecutionCoverageSummaryCopied, setApprovedProviderExecutionCoverageSummaryCopied] = useState(false);
  const [approvedProviderExecutionCoverageSummaryCopiedFilename, setApprovedProviderExecutionCoverageSummaryCopiedFilename] =
    useState("");
  const [approvedProviderExecutionCoverageSummaryResetAt, setApprovedProviderExecutionCoverageSummaryResetAt] = useState("");
  const [
    approvedProviderExecutionCoverageSummaryCopiedResetConfirmation,
    setApprovedProviderExecutionCoverageSummaryCopiedResetConfirmation,
  ] = useState("");
  const [
    approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt,
    setApprovedProviderExecutionCoverageSummaryResetConfirmationCopiedAt,
  ] = useState("");
  const [regulationGovernance, setRegulationGovernance] = useState<RegulationGovernanceReport | null>(null);
  const [regulationGovernanceLoading, setRegulationGovernanceLoading] = useState(false);
  const [regulationGovernanceAcknowledgementNote, setRegulationGovernanceAcknowledgementNote] = useState("");
  const [regulationGovernanceAcknowledgementSaving, setRegulationGovernanceAcknowledgementSaving] = useState(false);
  const [regulationGovernanceSourceReviewNotes, setRegulationGovernanceSourceReviewNotes] = useState<Record<string, string>>({});
  const [regulationGovernanceSourceReviewStates, setRegulationGovernanceSourceReviewStates] = useState<Record<string, RegulationGovernanceSourceReviewState>>({});
  const [regulationGovernanceSourceReviewSaving, setRegulationGovernanceSourceReviewSaving] = useState("");
  const [regulationSourceReviewCoverage, setRegulationSourceReviewCoverage] = useState<RegulationSourceReviewCoverageReport | null>(null);
  const [regulationSourceReviewCoveragePreset, setRegulationSourceReviewCoveragePreset] =
    useState<RegulationSourceReviewCoveragePreset>("all");
  const [regulationSourceReviewStaleDays, setRegulationSourceReviewStaleDays] = useState(30);
  const [fileChunkDebug, setFileChunkDebug] = useState<FileAnalysisChunkDebugReport | null>(null);
  const [fileChunkDebugQuery, setFileChunkDebugQuery] = useState("");
  const [knowledgeSyncWorker, setKnowledgeSyncWorker] = useState<KnowledgeExternalSyncWorkerReport | null>(null);
  const [knowledgeCapabilityReport, setKnowledgeCapabilityReport] = useState<KnowledgeAdminCapabilityReport | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    summary: "",
    bodyMarkdown: "",
    tagsText: "",
    scope: "organization" as Scope,
    rejectionReason: "",
  });

  const visibleCandidates = useMemo(() => {
    const search = candidateSearch.trim().toLowerCase();
    return candidates.filter((candidate) => {
      const stateMatches = filter === "all" || candidate.state === filter;
      if (!stateMatches) {
        return false;
      }
      const riskMatches =
        riskFilter === "all" ||
        (riskFilter === "low_confidence" && candidate.confidenceScore < 60) ||
        (riskFilter === "unreviewed" && !candidate.reviewedAt) ||
        (riskFilter === "cleanup_approved" && candidate.cleanupState === "approved");
      if (!riskMatches) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        candidate.title,
        candidate.summary,
        candidate.projectName,
        candidate.taskIssueId,
        candidate.taskTitle,
        candidate.tags.join(" "),
      ].some((value) => value.toLowerCase().includes(search));
    }).sort((left, right) => {
      if (candidateSort === "low_confidence") {
        return left.confidenceScore - right.confidenceScore || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }, [candidateSearch, candidateSort, candidates, filter, riskFilter]);
  const activeCandidateFilterChips = useMemo(() => {
    const search = candidateSearch.trim();
    return [
      `State: ${filter === "all" ? "All" : stateLabels[filter]}`,
      `Risk: ${candidateRiskFilterLabels[riskFilter]}`,
      `Sort: ${candidateSortLabels[candidateSort]}`,
      search ? `Search: ${search}` : "Search: none",
      `Showing: ${visibleCandidates.length}/${candidates.length}`,
    ];
  }, [candidateSearch, candidateSort, candidates.length, filter, riskFilter, visibleCandidates.length]);
  const candidateStateCounts = useMemo(
    () => ({
      all: candidates.length,
      candidate: candidates.filter((candidate) => candidate.state === "candidate").length,
      approved: candidates.filter((candidate) => candidate.state === "approved").length,
      rejected: candidates.filter((candidate) => candidate.state === "rejected").length,
    }),
    [candidates],
  );
  const candidateRiskCounts = useMemo(
    () => ({
      lowConfidence: candidates.filter((candidate) => candidate.confidenceScore < 60).length,
      unreviewed: candidates.filter((candidate) => !candidate.reviewedAt).length,
      cleanupApproved: candidates.filter((candidate) => candidate.cleanupState === "approved").length,
    }),
    [candidates],
  );
  const visibleCandidateRiskCounts = useMemo(
    () => ({
      lowConfidence: visibleCandidates.filter((candidate) => candidate.confidenceScore < 60).length,
      unreviewed: visibleCandidates.filter((candidate) => !candidate.reviewedAt).length,
      cleanupApproved: visibleCandidates.filter((candidate) => candidate.cleanupState === "approved").length,
    }),
    [visibleCandidates],
  );
  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? null,
    [candidates, selectedId],
  );
  const selectedCandidateIndex = visibleCandidates.findIndex((candidate) => candidate.id === selectedId);
  const originalDraft = useMemo(() => (detail ? createDraftFromDetail(detail) : null), [detail]);
  const draftTags = useMemo(() => splitTags(draft.tagsText), [draft.tagsText]);
  const duplicateDraftTags = useMemo(() => readDuplicateTags(draftTags), [draftTags]);
  const scopeReview = useMemo(
    () => readScopeReview(draft.scope, originalDraft?.scope ?? null),
    [draft.scope, originalDraft?.scope],
  );
  const draftReadiness = useMemo(
    () => [
      { label: "Title", ready: Boolean(draft.title.trim()) },
      { label: "Summary", ready: Boolean(draft.summary.trim()) },
      { label: "Body", ready: Boolean(draft.bodyMarkdown.trim()) },
      { label: "Tags", ready: draftTags.length > 0 },
      { label: "Evidence", ready: Boolean(detail?.evidence.length) },
    ],
    [detail?.evidence.length, draft.bodyMarkdown, draft.summary, draft.title, draftTags.length],
  );
  const draftDirtyStates = useMemo(() => {
    if (!originalDraft) {
      return [];
    }

    return [
      { label: "Title", dirty: draft.title !== originalDraft.title },
      { label: "Summary", dirty: draft.summary !== originalDraft.summary },
      { label: "Body", dirty: draft.bodyMarkdown !== originalDraft.bodyMarkdown },
      { label: "Tags", dirty: draftTags.join("|") !== splitTags(originalDraft.tagsText).join("|") },
      { label: "Scope", dirty: draft.scope !== originalDraft.scope },
      { label: "Rejection reason", dirty: draft.rejectionReason.trim() !== originalDraft.rejectionReason.trim() },
    ];
  }, [draft.bodyMarkdown, draft.rejectionReason, draft.scope, draft.summary, draft.title, draftTags, originalDraft]);
  const dirtyDraftCount = draftDirtyStates.filter((item) => item.dirty).length;
  const markdownOutline = useMemo(
    () => readMarkdownOutline(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const markdownStructureSummary = useMemo(
    () => readMarkdownStructureSummary(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const markdownWikiLinks = useMemo(
    () => readMarkdownWikiLinks(draft.bodyMarkdown),
    [draft.bodyMarkdown],
  );
  const evidenceKindCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of detail?.evidence ?? []) {
      counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [detail?.evidence]);
  const evidencePriorityCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of detail?.evidence ?? []) {
      const tier = readEvidencePriorityTier(item.priority);
      counts.set(tier, (counts.get(tier) ?? 0) + 1);
    }
    return Array.from(counts.entries());
  }, [detail?.evidence]);
  const evidenceSourceCoverage = useMemo(() => {
    const evidence = detail?.evidence ?? [];
    const sourced = evidence.filter((item) => Boolean(item.sourceUrl)).length;
    return {
      sourced,
      unsourced: evidence.length - sourced,
      total: evidence.length,
    };
  }, [detail?.evidence]);
  const visibleEvidence = useMemo(() => {
    const evidence = detail?.evidence ?? [];
    return evidence.filter((item) => {
      const sourceMatches =
        evidenceSourceFilter === "all" ||
        (evidenceSourceFilter === "sourced" && Boolean(item.sourceUrl)) ||
        (evidenceSourceFilter === "unsourced" && !item.sourceUrl);
      const priorityMatches =
        evidencePriorityFilter === "all" ||
        readEvidencePriorityFilter(item.priority) === evidencePriorityFilter;
      return sourceMatches && priorityMatches;
    });
  }, [detail?.evidence, evidencePriorityFilter, evidenceSourceFilter]);
  const activeEvidenceFilterChips = useMemo(() => {
    const total = detail?.evidence.length ?? 0;
    return [
      `Source: ${evidenceSourceFilterLabels[evidenceSourceFilter]}`,
      `Priority: ${evidencePriorityFilterLabels[evidencePriorityFilter]}`,
      `Visible: ${visibleEvidence.length}/${total}`,
    ];
  }, [detail?.evidence.length, evidencePriorityFilter, evidenceSourceFilter, visibleEvidence.length]);
  const visibleEvidenceSummary = useMemo(() => {
    const sourced = visibleEvidence.filter((item) => Boolean(item.sourceUrl)).length;
    const high = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "high").length;
    const normal = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "normal").length;
    const low = visibleEvidence.filter((item) => readEvidencePriorityFilter(item.priority) === "low").length;
    return {
      sourced,
      unsourced: visibleEvidence.length - sourced,
      high,
      normal,
      low,
    };
  }, [visibleEvidence]);
  const approvalGuardrails = useMemo(
    () => buildApprovalGuardrails(
      draftReadiness,
      detail,
      draftDirtyStates,
      markdownOutline,
      markdownStructureSummary,
      markdownWikiLinks,
      draftTags,
      duplicateDraftTags,
      draft.scope,
      originalDraft?.scope ?? null,
      draft.bodyMarkdown,
    ),
    [
      detail,
      draft.bodyMarkdown,
      draftDirtyStates,
      draftReadiness,
      markdownOutline,
      markdownStructureSummary,
      markdownWikiLinks,
      draftTags,
      duplicateDraftTags,
      draft.scope,
      originalDraft?.scope,
    ],
  );
  const guardrailWarningCount = approvalGuardrails.filter((item) => item.tone === "warning").length;
  const approvalRiskGroups = useMemo(
    () => readApprovalRiskGroups(approvalGuardrails),
    [approvalGuardrails],
  );
  const visibleApprovalRiskGroups = useMemo(
    () => approvalRiskFilter === "all"
      ? approvalRiskGroups
      : approvalRiskGroups.filter((group) => group.key === approvalRiskFilter),
    [approvalRiskFilter, approvalRiskGroups],
  );
  const approvalRiskWarningGroupCount = approvalRiskGroups.filter((group) => group.warningCount > 0).length;
  const readyReadinessCount = draftReadiness.filter((item) => item.ready).length;
  const reviewStatus = useMemo(
    () => readReviewStatus(guardrailWarningCount, readyReadinessCount, draftReadiness.length),
    [draftReadiness.length, guardrailWarningCount, readyReadinessCount],
  );
  const approvalDecisionMode = useMemo(
    () => readApprovalDecisionMode(guardrailWarningCount, approvalRiskWarningGroupCount),
    [approvalRiskWarningGroupCount, guardrailWarningCount],
  );
  const rejectionReasonPresets = useMemo(
    () => buildRejectionReasonPresets(approvalGuardrails),
    [approvalGuardrails],
  );
  const approvalPackageSections = 4;
  const approvalPackageQuality = useMemo(
    () => buildApprovalPackageQuality(
      detail,
      draft,
      approvalGuardrails,
      approvalRiskGroups,
      draftReadiness,
      evidenceKindCounts,
      evidenceSourceCoverage,
      reviewStatus,
    ),
    [
      approvalGuardrails,
      approvalRiskGroups,
      detail,
      draft,
      draftReadiness,
      evidenceKindCounts,
      evidenceSourceCoverage,
      reviewStatus,
    ],
  );
  const approvalPackageQualityReadyCount = approvalPackageQuality.filter((item) => item.ready).length;
  const approvalPackageQualityMissingCount = approvalPackageQuality.length - approvalPackageQualityReadyCount;
  const approvalPackageQualityStatus = useMemo(
    () => readChecklistStatus(
      approvalPackageQualityReadyCount,
      approvalPackageQuality.length,
      "Package quality complete",
      "Package quality review needed",
    ),
    [approvalPackageQuality.length, approvalPackageQualityReadyCount],
  );
  const finalReviewNextAction = useMemo(
    () => readFinalReviewNextAction(
      approvalPackageQualityStatus,
      guardrailWarningCount,
      draft.rejectionReason,
    ),
    [approvalPackageQualityStatus, draft.rejectionReason, guardrailWarningCount],
  );
  const finalReviewChecklist = useMemo(
    () => buildFinalReviewChecklist(
      detail,
      approvalPackageQualityStatus,
      guardrailWarningCount,
      approvalRiskWarningGroupCount,
      draft.rejectionReason,
      finalReviewNextAction,
    ),
    [
      approvalPackageQualityStatus,
      approvalRiskWarningGroupCount,
      detail,
      draft.rejectionReason,
      finalReviewNextAction,
      guardrailWarningCount,
    ],
  );
  const finalReviewReadyCount = finalReviewChecklist.filter((item) => item.ready).length;
  const finalReviewStatus = useMemo(
    () => readChecklistStatus(
      finalReviewReadyCount,
      finalReviewChecklist.length,
      "Final closeout ready",
      "Final closeout needs review",
    ),
    [finalReviewChecklist.length, finalReviewReadyCount],
  );
  const approvedTagOptions = useMemo(
    () => Array.from(new Set(approvedItems.flatMap((item) => item.tags))).sort((left, right) => left.localeCompare(right)),
    [approvedItems],
  );
  const approvedScopeCounts = useMemo(() => {
    const counts: Record<Scope, number> = {
      admin_only: 0,
      organization: 0,
      project_members: 0,
      project: 0,
    };
    for (const item of approvedItems) {
      counts[item.scope] += 1;
    }
    return counts;
  }, [approvedItems]);
  const visibleApprovedItems = useMemo(() => {
    const search = approvedSearch.trim().toLowerCase();
    return approvedItems
      .filter((item) => {
        const scopeMatches = approvedScopeFilter === "all" || item.scope === approvedScopeFilter;
        if (!scopeMatches) {
          return false;
        }
        const tagMatches = approvedTagFilter === "all" || item.tags.includes(approvedTagFilter);
        if (!tagMatches) {
          return false;
        }
        const sourceMatches =
          approvedSourceFilter === "all" ||
          (approvedSourceFilter === "sourced" && item.sourceReferences.length > 0) ||
          (approvedSourceFilter === "unsourced" && item.sourceReferences.length === 0);
        if (!sourceMatches) {
          return false;
        }
        if (!search) {
          return true;
        }
        return [
          item.title,
          item.summary,
          item.bodyMarkdown,
          item.sourceRecordId,
          item.sourceTaskId,
          item.sourceProjectId,
          item.tags.join(" "),
        ].some((value) => value.toLowerCase().includes(search));
      })
      .sort((left, right) => {
        if (approvedSort === "title") {
          return left.title.localeCompare(right.title);
        }
        if (approvedSort === "source_count") {
          return right.sourceReferences.length - left.sourceReferences.length || Date.parse(right.approvedAt) - Date.parse(left.approvedAt);
        }
        return Date.parse(right.approvedAt) - Date.parse(left.approvedAt);
      });
  }, [approvedItems, approvedScopeFilter, approvedSearch, approvedSort, approvedSourceFilter, approvedTagFilter]);
  const selectedApprovedItem = useMemo(
    () => approvedItems.find((item) => item.id === selectedApprovedId) ?? visibleApprovedItems[0] ?? null,
    [approvedItems, selectedApprovedId, visibleApprovedItems],
  );
  const approvedSourceCoverage = useMemo(() => {
    const sourced = approvedItems.filter((item) => item.sourceReferences.length > 0).length;
    return {
      sourced,
      unsourced: approvedItems.length - sourced,
      total: approvedItems.length,
    };
  }, [approvedItems]);
  const approvedQualityChecks = useMemo(
    () => selectedApprovedItem ? buildApprovedItemQuality(selectedApprovedItem) : [],
    [selectedApprovedItem],
  );
  const approvedQualityReadyCount = approvedQualityChecks.filter((item) => item.ready).length;
  const activeApprovedFilterChips = useMemo(() => {
    const search = approvedSearch.trim();
    return [
      `Scope: ${approvedScopeFilter === "all" ? "All scopes" : scopeLabels[approvedScopeFilter]}`,
      `Tag: ${approvedTagFilter}`,
      `Source: ${approvedSourceFilterLabels[approvedSourceFilter]}`,
      `Sort: ${approvedSortLabels[approvedSort]}`,
      search ? `Search: ${search}` : "Search: none",
      `Showing: ${visibleApprovedItems.length}/${approvedItems.length}`,
    ];
  }, [
    approvedItems.length,
    approvedScopeFilter,
    approvedSearch,
    approvedSort,
    approvedSourceFilter,
    approvedTagFilter,
    visibleApprovedItems.length,
  ]);
  const approvedExportItems = useMemo(
    () => approvedExportScope === "selected"
      ? selectedApprovedItem ? [selectedApprovedItem] : []
      : visibleApprovedItems,
    [approvedExportScope, selectedApprovedItem, visibleApprovedItems],
  );
  const approvedExportStats = useMemo(
    () => readApprovedExportStats(approvedExportItems),
    [approvedExportItems],
  );
  const approvedExportReadiness = useMemo(
    () => buildApprovedExportReadiness(
      approvedExportItems,
      approvedExportFormat,
      approvedSyncTarget,
      activeApprovedFilterChips,
    ),
    [activeApprovedFilterChips, approvedExportFormat, approvedExportItems, approvedSyncTarget],
  );
  const approvedExportReadyCount = approvedExportReadiness.filter((item) => item.ready).length;
  const approvedSyncPackageName = createApprovedSyncPackageName(
    approvedSyncTarget,
    approvedExportScope,
    approvedExportItems.length,
    approvedExportFormat,
  );
  const approvedSyncDryRunWarnings = useMemo(
    () => buildApprovedSyncDryRunWarnings(
      approvedExportItems,
      approvedExportReadiness,
      approvedSyncTarget,
      approvedExportFormat,
    ),
    [approvedExportFormat, approvedExportItems, approvedExportReadiness, approvedSyncTarget],
  );
  const approvedSyncCanRun =
    approvedExportItems.length > 0 &&
    approvedExportReadyCount === approvedExportReadiness.length &&
    approvedSyncConfirmation.trim() === approvedSyncConfirmationText;
  const latestApprovedSyncRun = approvedSyncHistory[0] ?? null;
  const selectedApprovedSyncTargetConfig = approvedSyncTargetConfigs.find((item) => item.target === approvedSyncTarget) ?? null;
  const regulationGovernanceChecks = useMemo<ReviewChecklistItem[]>(() => {
    if (!regulationGovernance) {
      return [];
    }
    const checklistCount = regulationGovernance.sources.reduce(
      (total, source) => total + source.verificationChecklist.length,
      0,
    );
    return [
      {
        label: "Manifest validation",
        detail: regulationGovernance.valid
          ? "Seed package and governance manifest pass the offline validator."
          : `${regulationGovernance.errors.length} blocking issue(s) require review.`,
        ready: regulationGovernance.valid,
      },
      {
        label: "Production import gate",
        detail: regulationGovernance.productionImport.enabled
          ? "Production import is enabled for this package."
          : regulationGovernance.productionImport.blockedReason ?? "Production import is blocked until review context is recorded.",
        ready: !regulationGovernance.productionImport.enabled && Boolean(regulationGovernance.productionImport.blockedReason),
      },
      {
        label: "Refresh schedule",
        detail: `${regulationGovernance.statusCounts.overdue} overdue / ${regulationGovernance.statusCounts.due} due soon / ${regulationGovernance.statusCounts.scheduled} scheduled source(s).`,
        ready: regulationGovernance.statusCounts.overdue === 0,
      },
      {
        label: "Verification checklist",
        detail: `${checklistCount} checklist item(s) are attached across ${regulationGovernance.sourceCount} official source(s).`,
        ready: checklistCount >= regulationGovernance.sourceCount,
      },
      {
        label: "Source review coverage",
        detail: `${regulationGovernance.sourceReviewSummary.reviewedSourceCount}/${regulationGovernance.sourceCount} source(s) reviewed; ${regulationGovernance.sourceReviewSummary.followUpSourceCount} need follow-up and ${regulationGovernance.sourceReviewSummary.blockedSourceCount} are blocked.`,
        ready: regulationGovernance.sourceReviewSummary.reviewedSourceCount === regulationGovernance.sourceCount &&
          regulationGovernance.sourceReviewSummary.blockedSourceCount === 0,
      },
      {
        label: "Reviewer acknowledgement",
        detail: regulationGovernance.acknowledgementSummary.latestAcknowledgedAt
          ? `Latest acknowledgement ${formatDate(regulationGovernance.acknowledgementSummary.latestAcknowledgedAt)} by ${regulationGovernance.acknowledgementSummary.latestReviewerId ?? "unknown reviewer"}.`
          : "No persisted governance acknowledgement has been recorded for this package.",
        ready: Boolean(regulationGovernance.acknowledgementSummary.latestAcknowledgedAt),
      },
    ];
  }, [regulationGovernance]);
  const regulationGovernanceReadyCount = regulationGovernanceChecks.filter((item) => item.ready).length;
  const providerPreviewAudit = approvedSyncHistory.find(
    (item) => item.target === approvedSyncTarget && item.status === "provider_ready",
  ) ?? null;
  const visibleApprovedProviderExecutions = useMemo(() => {
    const digestSearch = approvedProviderExecutionDigestFilter.trim().toLowerCase();
    return approvedProviderExecutions.filter((execution) => {
      const targetMatches = approvedProviderExecutionTargetFilter === "all" || execution.target === approvedProviderExecutionTargetFilter;
      const statusMatches = approvedProviderExecutionStatusFilter === "all" || execution.status === approvedProviderExecutionStatusFilter;
      const artifactMatches = approvedProviderExecutionArtifactFilter === "all" || execution.artifactType === approvedProviderExecutionArtifactFilter;
      const digestMatches = !digestSearch || execution.packageReview.packageDigest.toLowerCase().includes(digestSearch);
      return targetMatches && statusMatches && artifactMatches && digestMatches;
    });
  }, [
    approvedProviderExecutionArtifactFilter,
    approvedProviderExecutionDigestFilter,
    approvedProviderExecutionStatusFilter,
    approvedProviderExecutionTargetFilter,
    approvedProviderExecutions,
  ]);
  const providerExecutionPackageReviewReportQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (approvedProviderExecutionReviewCategoryFilter !== "all") {
      params.set("category", approvedProviderExecutionReviewCategoryFilter);
    }
    if (approvedProviderExecutionReviewReviewerFilter.trim()) {
      params.set("reviewerId", approvedProviderExecutionReviewReviewerFilter.trim());
    }
    if (approvedProviderExecutionDigestFilter.trim()) {
      params.set("packageDigest", approvedProviderExecutionDigestFilter.trim());
    }
    if (approvedProviderExecution?.id) {
      params.set("executionId", approvedProviderExecution.id);
    }
    params.set("coveragePreset", approvedProviderExecutionReviewCoveragePreset);
    params.set("staleDays", String(approvedProviderExecutionReviewStaleDays));
    return params.toString();
  }, [
    approvedProviderExecution?.id,
    approvedProviderExecutionDigestFilter,
    approvedProviderExecutionReviewCategoryFilter,
    approvedProviderExecutionReviewCoveragePreset,
    approvedProviderExecutionReviewReviewerFilter,
    approvedProviderExecutionReviewStaleDays,
  ]);
  const hasProviderExecutionReviewShortcutFilters =
    Boolean(approvedProviderExecutionDigestFilter.trim()) ||
    approvedProviderExecutionReviewCategoryFilter !== "all" ||
    Boolean(approvedProviderExecutionReviewReviewerFilter.trim());
  const providerExecutionPackageReviewHandoffPreview = useMemo(
    () => createProviderExecutionPackageReviewHandoff(approvedProviderExecutionReviewReport),
    [approvedProviderExecutionReviewReport],
  );
  const providerExecutionPackageReviewCoverageGroups = useMemo(() => {
    const coverage = approvedProviderExecutionReviewReport?.coverage ?? [];
    return [
      {
        key: "stale",
        title: "Stale review queue",
        description: "Unreviewed packages older than the active stale threshold.",
        rows: coverage.filter((item) => item.coverageStatus === "stale_unreviewed"),
      },
      {
        key: "unreviewed",
        title: "Unreviewed queue",
        description: "Packages that still need a matching review note.",
        rows: coverage.filter((item) => item.coverageStatus === "unreviewed"),
      },
      {
        key: "reviewed",
        title: "Reviewed queue",
        description: "Packages with retained review notes in the active scope.",
        rows: coverage.filter((item) => item.coverageStatus === "reviewed"),
      },
    ];
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageDominantQueueChip = useMemo(() => {
    const [dominantGroup] = [...providerExecutionPackageReviewCoverageGroups].sort((first, second) => second.rows.length - first.rows.length);
    if (!dominantGroup || dominantGroup.rows.length === 0) {
      return "Dominant queue none";
    }
    return `Dominant queue ${dominantGroup.title} (${dominantGroup.rows.length})`;
  }, [providerExecutionPackageReviewCoverageGroups]);
  const providerExecutionPackageCoverageEmptyQueueChip = useMemo(() => {
    const emptyQueueCount = providerExecutionPackageReviewCoverageGroups.filter((group) => group.rows.length === 0).length;
    return `Empty queues ${emptyQueueCount}/${providerExecutionPackageReviewCoverageGroups.length}`;
  }, [providerExecutionPackageReviewCoverageGroups]);
  const providerExecutionPackageCoverageReviewNeededChip = useMemo(() => {
    const totals = approvedProviderExecutionReviewReport?.summary.coverageGroupTotals;
    if (!totals) {
      return "Needs review unavailable";
    }
    return `Needs review ${totals.unreviewedCount}`;
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageStalePriorityChip = useMemo(() => {
    const report = approvedProviderExecutionReviewReport;
    if (!report) {
      return "Priority stale unavailable";
    }
    const staleCount = report.summary.coverageGroupTotals.staleUnreviewedCount;
    return staleCount > 0
      ? `Priority stale ${staleCount} over ${report.filters.staleDays}d`
      : `Priority no stale packages over ${report.filters.staleDays}d`;
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageReviewActiveFilterLabels = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return [];
    }
    const { filters } = approvedProviderExecutionReviewReport;
    return [
      `review ${filters.coveragePreset}`,
      filters.packageDigest ? `digest ${filters.packageDigest.slice(0, 12)}` : null,
      filters.reviewerId ? `reviewer ${filters.reviewerId}` : null,
      filters.category !== "all" ? `note type ${getProviderExecutionPackageReviewNoteCategoryLabel(filters.category)}` : null,
      filters.executionId ? `execution ${filters.executionId}` : null,
      `stale ${filters.staleDays} day(s)`,
    ].filter((label): label is string => Boolean(label));
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageGroupSummary = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return "Provider execution package review report is not loaded.";
    }
    const totals = approvedProviderExecutionReviewReport.summary.coverageGroupTotals;
    return [
      "# Provider execution package coverage group summary",
      `- Filters: ${providerExecutionPackageReviewActiveFilterLabels.join(", ")}`,
      `- Visible packages: ${totals.totalCount}`,
      `- Reviewed packages: ${totals.reviewedCount}`,
      `- Unreviewed packages: ${totals.unreviewedCount}`,
      `- Stale unreviewed packages: ${totals.staleUnreviewedCount}`,
      `- Visible review notes: ${totals.noteCount}`,
      "",
      "## Groups",
      ...providerExecutionPackageReviewCoverageGroups.map((group) => `- ${group.title}: ${group.rows.length} package(s)`),
    ].join("\n");
  }, [
    approvedProviderExecutionReviewReport,
    providerExecutionPackageReviewActiveFilterLabels,
    providerExecutionPackageReviewCoverageGroups,
  ]);
  const providerExecutionPackageCoverageGroupSummarySizeChips = useMemo(
    () => [
      `Summary lines ${providerExecutionPackageCoverageGroupSummary.split("\n").length}`,
      `Summary chars ${providerExecutionPackageCoverageGroupSummary.length}`,
    ],
    [providerExecutionPackageCoverageGroupSummary],
  );
  const providerExecutionPackageCoverageGroupSummaryNextDownloadFilename = useMemo(
    () => approvedProviderExecutionReviewReport
      ? createProviderExecutionPackageCoverageSummaryFilename(approvedProviderExecutionReviewReport.generatedAt)
      : "Next filename unavailable",
    [approvedProviderExecutionReviewReport],
  );
  const providerExecutionPackageCoverageGroupSummaryResetConfirmation = approvedProviderExecutionCoverageSummaryResetAt
    ? `Last local reset ${approvedProviderExecutionCoverageSummaryResetAt}`
    : "Local reset not run";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationTitle = approvedProviderExecutionCoverageSummaryResetAt
    ? `Last local reset was recorded at ${approvedProviderExecutionCoverageSummaryResetAt}. Reset summary status replaces this browser-only timestamp.`
    : "Local reset has not run in this browser session.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopiedAtTitle =
    approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
      ? `Reset confirmation was copied locally at ${approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt}. Reset summary status clears this browser-only copied-at indicator.`
      : "Reset confirmation copied-at is pending until Copy reset confirmation succeeds locally.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyStatusTitle =
    approvedProviderExecutionCoverageSummaryCopiedResetConfirmation
      ? "Reset confirmation text was copied locally for handoff. Reset summary status clears this browser-only copy status."
      : "Reset confirmation copy status is pending until Copy reset confirmation succeeds locally.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyFreshness =
    !approvedProviderExecutionCoverageSummaryResetAt
      ? "Reset confirmation copy freshness pending"
      : approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
        ? "Reset confirmation copy current"
        : "Reset confirmation copy refresh needed";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationFreshnessTitle =
    "Pending before reset; refresh needed after reset until the latest reset confirmation is copied; current after Copy reset confirmation.";
  const providerExecutionPackageCoverageSummaryCountChips = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return [];
    }
    const totals = approvedProviderExecutionReviewReport.summary.coverageGroupTotals;
    return [
      `Visible ${totals.totalCount}`,
      `Reviewed ${totals.reviewedCount}`,
      `Unreviewed ${totals.unreviewedCount}`,
      `Stale ${totals.staleUnreviewedCount}`,
      `Notes ${totals.noteCount}`,
    ];
  }, [approvedProviderExecutionReviewReport]);
  const hasCustomCandidateFilters =
    filter !== "candidate" || riskFilter !== "all" || Boolean(candidateSearch.trim());
  const hasCustomEvidenceFilters = evidenceSourceFilter !== "all" || evidencePriorityFilter !== "all";
  const regulationSourceReviewCoverageQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("coveragePreset", regulationSourceReviewCoveragePreset);
    params.set("staleDays", String(regulationSourceReviewStaleDays));
    return params.toString();
  }, [regulationSourceReviewCoveragePreset, regulationSourceReviewStaleDays]);
  const fileChunkDebugQueryString = useMemo(() => {
    const params = new URLSearchParams();
    if (fileChunkDebugQuery.trim()) {
      params.set("query", fileChunkDebugQuery.trim());
    }
    params.set("sampleLimit", "8");
    return params.toString();
  }, [fileChunkDebugQuery]);

  useEffect(() => {
    if (!selectedId && visibleCandidates[0]) {
      setSelectedId(visibleCandidates[0].id);
    }
  }, [selectedId, visibleCandidates]);

  useEffect(() => {
    setApprovedSyncHistory(readApprovedSyncHistory());
    setApprovedSyncHistoryLoaded(true);
  }, []);

  useEffect(() => {
    if (!approvedSyncHistoryLoaded) {
      return;
    }
    writeApprovedSyncHistory(approvedSyncHistory);
  }, [approvedSyncHistory, approvedSyncHistoryLoaded]);

  useEffect(() => {
    let active = true;
    readJson<ApprovedSyncRun[]>("/api/admin/knowledge/export-audits")
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedSyncHistory(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Approved WIKI sync history could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readJson<ApprovedSyncTargetConfig[]>("/api/admin/knowledge/sync-targets")
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedSyncTargetConfigs(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Approved WIKI sync target config could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setRegulationGovernanceLoading(true);
    readJson<RegulationGovernanceReport>("/api/admin/knowledge/regulation-governance")
      .then((data) => {
        if (!active) {
          return;
        }
        setRegulationGovernance(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Regulation governance report could not be loaded.");
      })
      .finally(() => {
        if (active) {
          setRegulationGovernanceLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readJson<RegulationSourceReviewCoverageReport>(
      `/api/admin/knowledge/regulation-governance/source-review-coverage?${regulationSourceReviewCoverageQuery}`,
    )
      .then((data) => {
        if (!active) {
          return;
        }
        setRegulationSourceReviewCoverage(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Regulation source-review coverage could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [regulationSourceReviewCoverageQuery]);

  useEffect(() => {
    let active = true;
    readJson<FileAnalysisChunkDebugReport>(`/api/admin/knowledge/file-analysis-chunks?${fileChunkDebugQueryString}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setFileChunkDebug(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "File-analysis chunk debug report could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [fileChunkDebugQueryString]);

  useEffect(() => {
    let active = true;
    Promise.all([
      readJson<KnowledgeExternalSyncWorkerReport>("/api/admin/knowledge/sync-worker"),
      readJson<KnowledgeAdminCapabilityReport>("/api/admin/knowledge/capabilities"),
    ])
      .then(([syncWorker, capabilityReport]) => {
        if (!active) {
          return;
        }
        setKnowledgeSyncWorker(syncWorker);
        setKnowledgeCapabilityReport(capabilityReport);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Knowledge operational reports could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readJson<ApprovedProviderExecution[]>("/api/admin/knowledge/provider-executions")
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedProviderExecutions(data);
        if (data[0]) {
          setApprovedProviderExecution(data[0]);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Provider execution package history could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    readJson<ProviderExecutionPackageReviewNoteReport>(
      `/api/admin/knowledge/provider-execution-package-review-notes?${providerExecutionPackageReviewReportQuery}`,
    )
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedProviderExecutionReviewReport(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setStatus(error instanceof Error ? error.message : "Provider execution package review report could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, [providerExecutionPackageReviewReportQuery]);

  useEffect(() => {
    if (!selectedApprovedSyncTargetConfig) {
      setApprovedSyncTargetEnabled(false);
      setApprovedSyncTargetDryRunOnly(true);
      setApprovedSyncTargetCredentialRef("");
      setApprovedSyncTargetInventoryManifest("");
      setApprovedSyncTargetNotes("");
      return;
    }
    setApprovedSyncTargetEnabled(selectedApprovedSyncTargetConfig.enabled);
    setApprovedSyncTargetDryRunOnly(selectedApprovedSyncTargetConfig.dryRunOnly);
    setApprovedSyncTargetCredentialRef(selectedApprovedSyncTargetConfig.credentialRef ?? "");
    setApprovedSyncTargetInventoryManifest(
      selectedApprovedSyncTargetConfig.inventoryManifest
        ? JSON.stringify(selectedApprovedSyncTargetConfig.inventoryManifest, null, 2)
        : "",
    );
    setApprovedSyncTargetNotes(selectedApprovedSyncTargetConfig.notes);
  }, [selectedApprovedSyncTargetConfig]);

  useEffect(() => {
    let active = true;
    readJson<ApprovedKnowledgeItem[]>("/api/admin/knowledge/items")
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedItems(data);
        setApprovedItemsLoaded(true);
        if (data[0]) {
          setSelectedApprovedId(data[0].id);
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setApprovedItemsLoaded(true);
        setStatus(error instanceof Error ? error.message : "Approved WIKI items could not be loaded.");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedApprovedId && visibleApprovedItems[0]) {
      setSelectedApprovedId(visibleApprovedItems[0].id);
    }
  }, [selectedApprovedId, visibleApprovedItems]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let active = true;
    setBusy(true);
    setStatus("후보 상세를 불러오는 중입니다.");
    readJson<CandidateDetail>(`/api/admin/knowledge/candidates/${selectedId}`)
      .then((data) => {
        if (!active) {
          return;
        }
        setDetail(data);
        setDraft(createDraftFromDetail(data));
        setStatus(`${stateLabels[data.state]} 후보를 불러왔습니다.`);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setDetail(null);
        setStatus(error instanceof Error ? error.message : "후보 상세를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedId]);

  async function refreshCandidates(nextSelectedId = selectedId) {
    const data = await readJson<CandidateListItem[]>("/api/admin/knowledge/candidates");
    setCandidates(data);
    setSelectedId(nextSelectedId);
  }

  async function refreshApprovedItems() {
    try {
      const data = await readJson<ApprovedKnowledgeItem[]>("/api/admin/knowledge/items");
      setApprovedItems(data);
      setApprovedItemsLoaded(true);
      if (!selectedApprovedId && data[0]) {
        setSelectedApprovedId(data[0].id);
      }
    } catch (error) {
      setApprovedItemsLoaded(true);
      setStatus(error instanceof Error ? error.message : "Approved WIKI items could not be loaded.");
    }
  }

  async function refreshRegulationGovernance() {
    setRegulationGovernanceLoading(true);
    try {
      const data = await readJson<RegulationGovernanceReport>("/api/admin/knowledge/regulation-governance");
      setRegulationGovernance(data);
      await refreshRegulationSourceReviewCoverage();
      setStatus(`Regulation governance loaded: ${data.sourceCount} source(s), ${data.statusCounts.overdue} overdue.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Regulation governance report could not be loaded.");
    } finally {
      setRegulationGovernanceLoading(false);
    }
  }

  async function refreshRegulationSourceReviewCoverage() {
    const data = await readJson<RegulationSourceReviewCoverageReport>(
      `/api/admin/knowledge/regulation-governance/source-review-coverage?${regulationSourceReviewCoverageQuery}`,
    );
    setRegulationSourceReviewCoverage(data);
  }

  async function refreshFileChunkDebug() {
    try {
      const data = await readJson<FileAnalysisChunkDebugReport>(`/api/admin/knowledge/file-analysis-chunks?${fileChunkDebugQueryString}`);
      setFileChunkDebug(data);
      setStatus(`File-analysis chunks loaded: ${data.database.totalChunks} chunk(s), ${data.database.missingEmbeddings} missing embedding(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "File-analysis chunk debug report could not be loaded.");
    }
  }

  async function refreshKnowledgeSyncWorker() {
    try {
      const data = await readJson<KnowledgeExternalSyncWorkerReport>("/api/admin/knowledge/sync-worker");
      setKnowledgeSyncWorker(data);
      setStatus(`Knowledge sync worker loaded: ${data.queue.pendingProviderReadyAudits} pending provider-ready audit(s).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Knowledge sync worker report could not be loaded.");
    }
  }

  async function copyRegulationGovernanceReport() {
    if (!regulationGovernance) {
      setStatus("Regulation governance report is not loaded.");
      return;
    }

    try {
      await navigator.clipboard.writeText(createRegulationGovernanceReport(regulationGovernance));
      setStatus("Regulation governance report copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the regulation governance panel manually.");
    }
  }

  async function saveRegulationGovernanceAcknowledgement() {
    if (!regulationGovernance) {
      setStatus("Regulation governance report is not loaded.");
      return;
    }
    if (!regulationGovernanceAcknowledgementNote.trim()) {
      setStatus("Regulation governance acknowledgement note is required.");
      return;
    }

    setRegulationGovernanceAcknowledgementSaving(true);
    try {
      const data = await writeJson<RegulationGovernanceReport>("/api/admin/knowledge/regulation-governance/acknowledgements", {
        packageId: regulationGovernance.packageId,
        packageDigest: regulationGovernance.packageDigest,
        note: regulationGovernanceAcknowledgementNote.trim(),
      });
      setRegulationGovernance(data);
      await refreshRegulationSourceReviewCoverage();
      setRegulationGovernanceAcknowledgementNote("");
      setStatus(`Regulation governance acknowledgement saved for ${data.packageId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Regulation governance acknowledgement could not be saved.");
    } finally {
      setRegulationGovernanceAcknowledgementSaving(false);
    }
  }

  async function saveRegulationGovernanceSourceReview(sourceId: string) {
    if (!regulationGovernance) {
      setStatus("Regulation governance report is not loaded.");
      return;
    }
    const note = regulationGovernanceSourceReviewNotes[sourceId]?.trim() ?? "";
    if (!note) {
      setStatus("Regulation governance source review note is required.");
      return;
    }

    setRegulationGovernanceSourceReviewSaving(sourceId);
    try {
      const data = await writeJson<RegulationGovernanceReport>(
        `/api/admin/knowledge/regulation-governance/sources/${encodeURIComponent(sourceId)}/reviews`,
        {
          packageId: regulationGovernance.packageId,
          packageDigest: regulationGovernance.packageDigest,
          reviewState: regulationGovernanceSourceReviewStates[sourceId] ?? "reviewed",
          note,
        },
      );
      setRegulationGovernance(data);
      await refreshRegulationSourceReviewCoverage();
      setRegulationGovernanceSourceReviewNotes((current) => ({
        ...current,
        [sourceId]: "",
      }));
      setStatus(`Regulation governance source review saved for ${sourceId}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Regulation governance source review could not be saved.");
    } finally {
      setRegulationGovernanceSourceReviewSaving("");
    }
  }

  function resetDraft() {
    if (!detail) {
      return;
    }

    setDraft(createDraftFromDetail(detail));
    setStatus("Draft restored from selected candidate.");
  }

  function applyRejectionReasonPreset(preset: RejectionReasonPreset) {
    setDraft((current) => ({
      ...current,
      rejectionReason: preset.reason,
    }));
    setStatus(`Rejection reason preset applied: ${preset.label}`);
  }

  async function copyDraftMarkdown() {
    if (!draft.bodyMarkdown.trim()) {
      setStatus("No Markdown body to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.bodyMarkdown);
      setStatus("Markdown draft copied.");
    } catch {
      setStatus("Clipboard copy failed. Select the Markdown body manually.");
    }
  }

  async function copySourceHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createSourceHandoff(detail, draft, evidenceKindCounts));
      setStatus("Source handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Use the source chips to assemble the handoff manually.");
    }
  }

  async function copyApprovalChecklist() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createApprovalChecklist(detail, draftReadiness, approvalGuardrails, evidenceKindCounts),
      );
      setStatus("Approval checklist copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the guardrails manually.");
    }
  }

  async function copyApprovalRiskSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge approval risk summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Warning groups: ${approvalRiskWarningGroupCount}/${approvalRiskGroups.length}`,
          `- Warnings: ${guardrailWarningCount}`,
          "",
          ...approvalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- Warnings: ${group.warningCount}`,
            `- Ready: ${group.readyCount}`,
            ...group.items
              .filter((item) => item.tone === "warning")
              .map((item) => `- ${item.label}: ${item.detail}`),
            group.warningCount ? "" : "- No warnings",
            "",
          ]),
        ].join("\n"),
      );
      setStatus("Approval risk summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approval risk summary manually.");
    }
  }

  async function copyApprovalRiskFilterHandoff() {
    if (!detail) {
      return;
    }

    const activeLabel = approvalRiskFilter === "all"
      ? "All risk groups"
      : approvalRiskGroups.find((group) => group.key === approvalRiskFilter)?.label ?? approvalRiskFilter;
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge approval risk filter handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Active risk group: ${activeLabel}`,
          `- Showing: ${visibleApprovalRiskGroups.length}/${approvalRiskGroups.length}`,
          "",
          ...visibleApprovalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- Warnings: ${group.warningCount}`,
            `- Ready: ${group.readyCount}`,
            ...(
              group.warningCount
                ? group.items
                  .filter((item) => item.tone === "warning")
                  .map((item) => `- Warning: ${item.label} - ${item.detail}`)
                : [`- No ${group.label.toLowerCase()} warnings in the current draft.`]
            ),
            ...group.items
              .filter((item) => item.tone === "ready")
              .slice(0, 4)
              .map((item) => `- Ready: ${item.label}`),
            "",
          ]),
        ].join("\n"),
      );
      setStatus("Approval risk filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the active risk filter chips manually.");
    }
  }

  async function copyApprovalDecisionNote() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createApprovalDecisionNote(
          detail,
          draft,
          draftReadiness,
          approvalGuardrails,
          approvalRiskGroups,
          evidenceKindCounts,
          reviewStatus,
        ),
      );
      setStatus("Approval decision note copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approval decision context manually.");
    }
  }

  async function copyRejectionReason() {
    if (!detail) {
      return;
    }

    const reason = draft.rejectionReason.trim();
    if (!reason) {
      setStatus("No rejection reason to copy.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge rejection reason",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Review status: ${reviewStatus.label}`,
          "",
          reason,
        ].join("\n"),
      );
      setStatus("Rejection reason copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the rejection reason manually.");
    }
  }

  async function copyApprovalBlockers() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovalBlockerHandoff(detail, approvalGuardrails, approvalRiskGroups));
      setStatus("Approval blockers copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approval submit guardrails manually.");
    }
  }

  async function copyApprovalPackage() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createApprovalPackage(
          detail,
          draft,
          approvalGuardrails,
          approvalRiskGroups,
          draftReadiness,
          evidenceKindCounts,
          reviewStatus,
        ),
      );
      setStatus("Approval package copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approval package context manually.");
    }
  }

  async function copyApprovalPackageQuality() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createApprovalPackageQualityReport(detail, approvalPackageQuality, approvalPackageQualityStatus),
      );
      setStatus("Approval package quality copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the package quality checks manually.");
    }
  }

  async function copyFinalReviewCloseout() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createFinalReviewCloseout(
          detail,
          approvalPackageQuality,
          approvalPackageQualityStatus,
          finalReviewChecklist,
          finalReviewStatus,
          finalReviewNextAction,
        ),
      );
      setStatus("Final review closeout copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the final closeout checks manually.");
    }
  }

  async function copyCandidateFilterHandoff() {
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge candidate queue handoff",
          `- State: ${filter === "all" ? "All" : stateLabels[filter]}`,
          `- Risk: ${candidateRiskFilterLabels[riskFilter]}`,
          `- Sort: ${candidateSortLabels[candidateSort]}`,
          `- Search: ${candidateSearch.trim() || "none"}`,
          `- Showing: ${visibleCandidates.length}/${candidates.length}`,
          `- Selected: ${selectedCandidate ? `${selectedCandidate.title} (${selectedCandidate.id})` : "none"}`,
        ].join("\n"),
      );
      setStatus("Candidate filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the active filter chips manually.");
    }
  }

  async function copyEvidenceFilterHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge evidence filter handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Source filter: ${evidenceSourceFilterLabels[evidenceSourceFilter]}`,
          `- Priority filter: ${evidencePriorityFilterLabels[evidencePriorityFilter]}`,
          `- Visible evidence: ${visibleEvidence.length}/${detail.evidence.length}`,
          "",
          "Visible evidence",
          ...visibleEvidence.map((item) => `- ${item.title} (${item.kind}, ${readEvidencePriorityTier(item.priority)}, priority ${item.priority})`),
        ].join("\n"),
      );
      setStatus("Evidence filter handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the evidence filter chips manually.");
    }
  }

  async function copyDirtyDraftSummary() {
    if (!detail) {
      return;
    }

    const changedFields = draftDirtyStates.filter((item) => item.dirty).map((item) => item.label);
    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge dirty draft summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Changed fields: ${changedFields.length}/${draftDirtyStates.length}`,
          `- Fields: ${changedFields.join(", ") || "none"}`,
          `- Scope: ${scopeLabels[draft.scope]}`,
          `- Tags: ${draftTags.join(", ") || "none"}`,
        ].join("\n"),
      );
      setStatus("Dirty draft summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the dirty-state indicators manually.");
    }
  }

  async function copyMarkdownOutline() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown outline",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Headings: ${markdownOutline.length}`,
          "",
          ...(
            markdownOutline.length
              ? markdownOutline.map((heading) => `- H${heading.level} L${heading.line}: ${heading.text}`)
              : ["- No Markdown headings"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown outline copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown outline manually.");
    }
  }

  async function copyMarkdownStructureSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown structure summary",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Headings: ${markdownStructureSummary.headings}`,
          `- Paragraphs: ${markdownStructureSummary.paragraphs}`,
          `- List items: ${markdownStructureSummary.listItems}`,
          `- Non-empty lines: ${markdownStructureSummary.lines}`,
        ].join("\n"),
      );
      setStatus("Markdown structure summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown structure summary manually.");
    }
  }

  async function copyMarkdownWikiLinks() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge Markdown WIKI links",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- WIKI links: ${markdownWikiLinks.length}`,
          "",
          ...(
            markdownWikiLinks.length
              ? markdownWikiLinks.map((link) => `- L${link.line}: [[${link.target}]]${link.label !== link.target ? ` as ${link.label}` : ""}`)
              : ["- No Markdown WIKI links"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown WIKI links copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the Markdown WIKI link preview manually.");
    }
  }

  async function copyDraftTagHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge draft tag handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Tags: ${draftTags.length}`,
          `- Duplicate tags: ${duplicateDraftTags.join(", ") || "none"}`,
          "",
          ...(
            draftTags.length
              ? draftTags.map((tag) => `- ${tag}`)
              : ["- No draft tags"]
          ),
        ].join("\n"),
      );
      setStatus("Draft tag handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the draft tag preview manually.");
    }
  }

  async function copyScopeHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# Knowledge publication scope handoff",
          `- Candidate: ${detail.title} (${detail.id})`,
          `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- Current scope: ${scopeLabels[draft.scope]}`,
          `- Original scope: ${originalDraft ? scopeLabels[originalDraft.scope] : "unknown"}`,
          `- Scope changed: ${scopeReview.changed ? "yes" : "no"}`,
          `- Scope review: ${scopeReview.label}`,
          `- Review note: ${scopeReview.detail}`,
        ].join("\n"),
      );
      setStatus("Publication scope handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the publication scope preview manually.");
    }
  }

  async function approveCandidate() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setStatus("WIKI 지식으로 승인하는 중입니다.");
    try {
      const data = await writeJson<CandidateDetail>(`/api/admin/knowledge/candidates/${detail.id}/approve`, {
        title: draft.title,
        summary: draft.summary,
        bodyMarkdown: draft.bodyMarkdown,
        tags: draftTags,
        scope: draft.scope,
      });
      setDetail(data);
      await refreshCandidates(data.id);
      await refreshApprovedItems();
      setStatus("승인된 지식으로 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function rejectCandidate() {
    if (!detail) {
      return;
    }

    setBusy(true);
    setStatus("후보를 반려하는 중입니다.");
    try {
      const data = await writeJson<CandidateDetail>(`/api/admin/knowledge/candidates/${detail.id}/reject`, {
        rejectionReason: draft.rejectionReason,
      });
      setDetail(data);
      await refreshCandidates(data.id);
      setStatus("후보를 반려했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "반려에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function clearCandidateFilters() {
    setFilter("candidate");
    setRiskFilter("all");
    setCandidateSearch("");
  }

  function revealSelectedCandidate() {
    if (!selectedCandidate) {
      return;
    }
    if (selectedCandidate.state === "candidate" || selectedCandidate.state === "approved" || selectedCandidate.state === "rejected") {
      setFilter(selectedCandidate.state);
    } else {
      setFilter("all");
    }
    setRiskFilter("all");
    setCandidateSearch("");
    setCandidateSort("newest");
  }

  function clearEvidenceFilters() {
    setEvidenceSourceFilter("all");
    setEvidencePriorityFilter("all");
  }

  function clearApprovalRiskFilter() {
    setApprovalRiskFilter("all");
  }

  function clearApprovedFilters() {
    setApprovedSearch("");
    setApprovedScopeFilter("all");
    setApprovedTagFilter("all");
    setApprovedSourceFilter("all");
    setApprovedSort("newest");
  }

  async function copyApprovedMarkdown() {
    if (!selectedApprovedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(selectedApprovedItem.bodyMarkdown);
      setStatus("Approved WIKI Markdown copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approved Markdown preview manually.");
    }
  }

  async function copyApprovedItemHandoff() {
    if (!selectedApprovedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovedItemHandoff(selectedApprovedItem, approvedQualityChecks));
      setStatus("Approved WIKI item handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approved WIKI detail manually.");
    }
  }

  async function copyApprovedSearchHandoff() {
    try {
      await navigator.clipboard.writeText(
        createApprovedSearchHandoff(visibleApprovedItems, activeApprovedFilterChips, approvedSourceCoverage),
      );
      setStatus("Approved WIKI search handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approved WIKI filters manually.");
    }
  }

  async function copyApprovedSourcePackage() {
    if (!selectedApprovedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovedSourcePackage(selectedApprovedItem));
      setStatus("Approved WIKI source package copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the source references manually.");
    }
  }

  async function copyApprovedIndexPackage() {
    try {
      await navigator.clipboard.writeText(createApprovedIndexPackage(visibleApprovedItems, activeApprovedFilterChips));
      setStatus("Approved WIKI index package copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the approved WIKI list manually.");
    }
  }

  async function copyApprovedSyncManifest() {
    try {
      await navigator.clipboard.writeText(
        createApprovedSyncManifest(
          approvedExportItems,
          activeApprovedFilterChips,
          approvedExportReadiness,
          approvedSyncTarget,
          approvedExportFormat,
        ),
      );
      setStatus("Approved WIKI sync manifest copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the export readiness panel manually.");
    }
  }

  async function copyApprovedExportChecklist() {
    try {
      await navigator.clipboard.writeText(
        createApprovedExportChecklist(
          approvedExportItems,
          approvedExportReadiness,
          approvedExportStats,
          approvedSyncTarget,
          approvedExportFormat,
        ),
      );
      setStatus("Approved WIKI export checklist copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the export checklist manually.");
    }
  }

  function downloadApprovedExport() {
    const content = approvedExportFormat === "json"
      ? JSON.stringify(
        createApprovedExportPayload(approvedExportItems, activeApprovedFilterChips, approvedSyncTarget, approvedExportStats),
        null,
        2,
      )
      : createApprovedExportMarkdown(approvedExportItems, activeApprovedFilterChips, approvedSyncTarget, approvedExportStats);
    const mimeType = approvedExportFormat === "json" ? "application/json" : "text/markdown";
    downloadTextFile(
      approvedSyncPackageName,
      content,
      mimeType,
    );
    setStatus(`Approved WIKI ${approvedExportFormatLabels[approvedExportFormat]} downloaded.`);
  }

  async function recordApprovedSyncDryRun() {
    try {
      const run = await writeJson<ApprovedSyncRun>(
        "/api/admin/knowledge/export-audits",
        createApprovedSyncAuditPayload(
          "dry_run",
          approvedSyncTarget,
          approvedExportFormat,
          approvedExportScope,
          approvedExportItems,
          approvedSyncPackageName,
          approvedSyncConfirmation,
          approvedSyncDryRunWarnings,
        ),
      );
      setApprovedSyncHistory((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 20));
      setStatus("Approved WIKI sync dry-run persisted to server audit history.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approved WIKI sync dry-run could not be persisted.");
    }
  }

  async function runGuardedApprovedSync() {
    try {
      const run = await writeJson<ApprovedSyncRun>(
        "/api/admin/knowledge/export-audits",
        createApprovedSyncAuditPayload(
          "execute",
          approvedSyncTarget,
          approvedExportFormat,
          approvedExportScope,
          approvedExportItems,
          approvedSyncPackageName,
          approvedSyncConfirmation,
          approvedSyncDryRunWarnings,
        ),
      );
      setApprovedSyncHistory((current) => [run, ...current.filter((item) => item.id !== run.id)].slice(0, 20));
      if (run.status === "provider_ready") {
        setStatus("Approved WIKI provider sync passed server guard and is ready for configured provider execution.");
        return;
      }
      if (run.status === "provider_blocked") {
        setStatus("Approved WIKI sync audit persisted; provider execution is blocked until target configuration is enabled.");
        return;
      }
      setStatus(
        run.status === "blocked"
          ? "Approved WIKI guarded sync blocked and persisted to server audit history."
          : "Approved WIKI guarded sync audit persisted.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approved WIKI guarded sync could not be persisted.");
    }
  }

  async function copyApprovedSyncHistoryReport() {
    try {
      await navigator.clipboard.writeText(createApprovedSyncHistoryReport(approvedSyncHistory));
      setStatus("Approved WIKI sync history report copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the sync history manually.");
    }
  }

  function clearApprovedSyncHistory() {
    setApprovedSyncHistory([]);
    setStatus("Approved WIKI sync history cleared from the local view. Server audit history remains append-only.");
  }

  async function saveApprovedSyncTargetConfig() {
    try {
      const config = await writeJson<ApprovedSyncTargetConfig>(
        "/api/admin/knowledge/sync-targets",
        {
          target: approvedSyncTarget,
          enabled: approvedSyncTargetEnabled,
          dryRunOnly: approvedSyncTargetDryRunOnly,
          credentialRef: approvedSyncTargetCredentialRef,
          inventoryManifest: approvedSyncTargetInventoryManifest,
          notes: approvedSyncTargetNotes,
        },
      );
      setApprovedSyncTargetConfigs((current) => [
        config,
        ...current.filter((item) => item.target !== config.target),
      ]);
      setStatus(`Approved WIKI sync target config saved for ${config.label}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approved WIKI sync target config could not be saved.");
    }
  }

  async function createApprovedProviderPreview() {
    if (!providerPreviewAudit) {
      setStatus("Create a provider-ready sync audit before requesting a provider preview.");
      return;
    }
    try {
      const preview = await writeJson<ApprovedProviderPreview>(
        "/api/admin/knowledge/provider-previews",
        {
          auditId: providerPreviewAudit.id,
          confirmation: approvedProviderPreviewConfirmation,
        },
      );
      setApprovedProviderPreview(preview);
      setStatus("Approved WIKI provider dry-run preview created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approved WIKI provider preview could not be created.");
    }
  }

  async function copyApprovedProviderPreview() {
    if (!approvedProviderPreview) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createApprovedProviderPreviewReport(approvedProviderPreview));
      setStatus("Approved WIKI provider preview copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the provider preview manually.");
    }
  }

  async function executeApprovedProviderAdapter() {
    if (!approvedProviderPreview) {
      setStatus("Create a fresh provider preview before guarded execution.");
      return;
    }
    try {
      const execution = await writeJson<ApprovedProviderExecution>(
        "/api/admin/knowledge/provider-executions",
        {
          previewId: approvedProviderPreview.id,
          confirmation: approvedProviderExecutionConfirmation,
        },
      );
      setApprovedProviderExecution(execution);
      setApprovedProviderExecutions((current) => [execution, ...current.filter((item) => item.id !== execution.id)].slice(0, 50));
      setStatus("Approved WIKI provider adapter execution recorded to server audit history.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approved WIKI provider execution could not be recorded.");
    }
  }

  async function copyApprovedProviderExecution() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createApprovedProviderExecutionReport(approvedProviderExecution));
      setStatus("Approved WIKI provider execution report copied.");
    } catch {
      setStatus("Clipboard copy failed. Review the provider execution manually.");
    }
  }

  async function copyApprovedProviderExecutionPackage() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      const attachment = await readTextAttachment(`/api/admin/knowledge/provider-executions/${encodeURIComponent(approvedProviderExecution.id)}/package`);
      await navigator.clipboard.writeText(attachment.text);
      setStatus(`Approved WIKI provider execution package copied (${attachment.digest.slice(0, 12)} digest).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Provider execution package could not be copied.");
    }
  }

  async function downloadApprovedProviderExecutionPackage() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      const attachment = await readTextAttachment(`/api/admin/knowledge/provider-executions/${encodeURIComponent(approvedProviderExecution.id)}/package`);
      downloadTextFile(attachment.filename, attachment.text, "application/json");
      setStatus(`Approved WIKI provider execution package downloaded (${attachment.digest.slice(0, 12)} digest).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Provider execution package could not be downloaded.");
    }
  }

  async function saveApprovedProviderExecutionPackageReviewNote() {
    if (!approvedProviderExecution) {
      setStatus("Select a provider execution package before adding a review note.");
      return;
    }
    if (!approvedProviderExecutionReviewNoteText.trim()) {
      setStatus("Provider execution package review note text is required.");
      return;
    }

    setApprovedProviderExecutionReviewNoteSaving(true);
    try {
      const note = await writeJson<ApprovedProviderExecutionPackageReviewNote>(
        `/api/admin/knowledge/provider-executions/${encodeURIComponent(approvedProviderExecution.id)}/notes`,
        {
          category: approvedProviderExecutionReviewNoteCategory,
          note: approvedProviderExecutionReviewNoteText.trim(),
          packageDigest: approvedProviderExecution.packageReview.packageDigest,
        },
      );
      const applyNote = (execution: ApprovedProviderExecution): ApprovedProviderExecution =>
        execution.id === note.executionId
          ? {
              ...execution,
              packageReview: {
                ...execution.packageReview,
                reviewNoteCount: execution.packageReview.reviewNoteCount + 1,
                latestReviewNoteAt: note.createdAt,
              },
              packageReviewNotes: [note, ...execution.packageReviewNotes],
            }
          : execution;
      setApprovedProviderExecution((current) => (current ? applyNote(current) : current));
      setApprovedProviderExecutions((current) => current.map(applyNote));
      setApprovedProviderExecutionReviewNoteText("");
      setStatus("Provider execution package review note saved.");
      readJson<ProviderExecutionPackageReviewNoteReport>(
        `/api/admin/knowledge/provider-execution-package-review-notes?${providerExecutionPackageReviewReportQuery}`,
      )
        .then(setApprovedProviderExecutionReviewReport)
        .catch(() => undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Provider execution package review note could not be saved.");
    } finally {
      setApprovedProviderExecutionReviewNoteSaving(false);
    }
  }

  function downloadApprovedProviderExecutionPackageReviewNotesCsv() {
    const url = `/api/admin/knowledge/provider-execution-package-review-notes/export?${providerExecutionPackageReviewReportQuery}`;
    window.location.href = url;
    setStatus("Provider execution package review-note CSV export started.");
  }

  async function copyApprovedProviderExecutionPackageReviewHandoff() {
    try {
      await navigator.clipboard.writeText(createProviderExecutionPackageReviewHandoff(approvedProviderExecutionReviewReport));
      setStatus("Provider execution package review handoff copied.");
    } catch {
      setStatus("Clipboard copy failed. Review package filters manually.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummary() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("Provider execution package review report is not loaded.");
      return;
    }
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummary);
      setApprovedProviderExecutionCoverageSummaryCopied(true);
      setStatus("Provider execution package coverage group summary copied.");
    } catch {
      setStatus("Clipboard copy failed. Review coverage group summary manually.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummaryFilename() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("Provider execution package review report is not loaded.");
      return;
    }
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummaryNextDownloadFilename);
      setApprovedProviderExecutionCoverageSummaryCopiedFilename(providerExecutionPackageCoverageGroupSummaryNextDownloadFilename);
      setStatus("Provider execution package coverage group summary filename copied.");
    } catch {
      setStatus("Clipboard copy failed. Review coverage group summary filename manually.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummaryResetConfirmation() {
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummaryResetConfirmation);
      setApprovedProviderExecutionCoverageSummaryCopiedResetConfirmation(
        providerExecutionPackageCoverageGroupSummaryResetConfirmation,
      );
      setApprovedProviderExecutionCoverageSummaryResetConfirmationCopiedAt(new Date().toISOString());
      setStatus("Provider execution package coverage group summary reset confirmation copied.");
    } catch {
      setStatus("Clipboard copy failed. Review coverage group summary reset confirmation manually.");
    }
  }

  function downloadApprovedProviderExecutionPackageCoverageGroupSummary() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("Provider execution package review report is not loaded.");
      return;
    }
    const filename = providerExecutionPackageCoverageGroupSummaryNextDownloadFilename;
    downloadTextFile(filename, providerExecutionPackageCoverageGroupSummary, "text/markdown");
    setApprovedProviderExecutionCoverageSummaryDownloadFilename(filename);
    setStatus("Provider execution package coverage group summary downloaded.");
  }

  function resetApprovedProviderExecutionPackageCoverageGroupSummaryStatus() {
    setApprovedProviderExecutionCoverageSummaryDownloadFilename("");
    setApprovedProviderExecutionCoverageSummaryCopied(false);
    setApprovedProviderExecutionCoverageSummaryCopiedFilename("");
    setApprovedProviderExecutionCoverageSummaryCopiedResetConfirmation("");
    setApprovedProviderExecutionCoverageSummaryResetConfirmationCopiedAt("");
    setApprovedProviderExecutionCoverageSummaryResetAt(new Date().toISOString());
    setStatus("Provider execution package coverage group summary local status reset.");
  }

  function clearApprovedProviderExecutionReviewShortcutFilters() {
    setApprovedProviderExecutionDigestFilter("");
    setApprovedProviderExecutionReviewCategoryFilter("all");
    setApprovedProviderExecutionReviewReviewerFilter("");
    setStatus("Provider execution package review shortcut filters cleared.");
  }

  function showApprovedProviderExecutionReviewCoverageGroup(preset: ProviderExecutionPackageReviewCoveragePreset) {
    setApprovedProviderExecutionReviewCoveragePreset(preset);
    setStatus(`Provider execution package review coverage filter set to ${preset}.`);
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Knowledge Admin</p>
          <h1>WIKI 후보 검토</h1>
        </div>
        <a className={styles.secondaryLink} href="/admin">관리 설정</a>
      </header>

      <div className={styles.layout}>
        <aside className={styles.queue} aria-label="Knowledge candidates">
          <div className={styles.queueHeader}>
            <h2>후보 목록</h2>
            <select
              aria-label="후보 상태 필터"
              value={filter}
              onChange={(event) => setFilter(event.target.value as CandidateState | "all")}
            >
              <option value="candidate">검토 대기</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
              <option value="all">전체</option>
            </select>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge candidate state counts">
            <span>Candidate {candidateStateCounts.candidate}</span>
            <span>Approved {candidateStateCounts.approved}</span>
            <span>Rejected {candidateStateCounts.rejected}</span>
            <span>All {candidateStateCounts.all}</span>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge candidate risk totals">
            <span>Low confidence {candidateRiskCounts.lowConfidence}</span>
            <span>Unreviewed {candidateRiskCounts.unreviewed}</span>
            <span>Cleanup approved {candidateRiskCounts.cleanupApproved}</span>
            <span>Risk groups 3</span>
          </div>
          <div className={styles.queueCounts} aria-label="Knowledge visible candidate risk totals">
            <span>Visible low {visibleCandidateRiskCounts.lowConfidence}</span>
            <span>Visible unreviewed {visibleCandidateRiskCounts.unreviewed}</span>
            <span>Visible cleanup {visibleCandidateRiskCounts.cleanupApproved}</span>
            <span>Visible {visibleCandidates.length}</span>
          </div>
          <div className={styles.queueQuickFilters} aria-label="Knowledge candidate quick filters">
            {(["candidate", "approved", "rejected", "all"] as Array<CandidateState | "all">).map((value) => (
              <button
                className={filter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "all" ? "All" : stateLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.queueQuickFilters} aria-label="Knowledge candidate risk quick filters">
            {(["all", "low_confidence", "unreviewed", "cleanup_approved"] as CandidateRiskFilter[]).map((value) => (
              <button
                className={riskFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                key={value}
                onClick={() => setRiskFilter(value)}
                type="button"
              >
                {candidateRiskFilterLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.queueFilterSummary} aria-label="Knowledge candidate active filter chips">
            {activeCandidateFilterChips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
          <div className={styles.queueFilterActions}>
            <button disabled={!hasCustomCandidateFilters} onClick={clearCandidateFilters} type="button">
              Clear candidate filters
            </button>
            <button onClick={copyCandidateFilterHandoff} type="button">Copy filter handoff</button>
          </div>
          <label className={styles.queueSort}>
            Sort candidates
            <select
              aria-label="Knowledge candidate sort"
              onChange={(event) => setCandidateSort(event.target.value as CandidateSort)}
              value={candidateSort}
            >
              {(["newest", "low_confidence"] as CandidateSort[]).map((value) => (
                <option key={value} value={value}>{candidateSortLabels[value]}</option>
              ))}
            </select>
          </label>
          <div className={styles.queueSelectionSummary} aria-label="Knowledge candidate selection summary">
            {selectedCandidate ? (
              <>
                <span>{selectedCandidateIndex >= 0 ? `Selected ${selectedCandidateIndex + 1}/${visibleCandidates.length}` : "Selected outside filters"}</span>
                <strong>{selectedCandidate.title}</strong>
                {selectedCandidateIndex < 0 ? (
                  <button onClick={revealSelectedCandidate} type="button">Show selected candidate</button>
                ) : null}
              </>
            ) : (
              <span>No selected candidate</span>
            )}
          </div>
          <div className={styles.queueDensity} aria-label="Knowledge candidate queue density controls">
            <button
              className={candidateQueueCompact ? styles.queueQuickFilter : styles.queueQuickFilterActive}
              onClick={() => setCandidateQueueCompact(false)}
              type="button"
            >
              Detailed queue
            </button>
            <button
              className={candidateQueueCompact ? styles.queueQuickFilterActive : styles.queueQuickFilter}
              onClick={() => setCandidateQueueCompact(true)}
              type="button"
            >
              Compact queue
            </button>
          </div>
          <label className={styles.queueSearch}>
            Search candidates
            <div>
              <input
                onChange={(event) => setCandidateSearch(event.target.value)}
                placeholder="Title, task, project, tag"
                value={candidateSearch}
              />
              <button disabled={!candidateSearch.trim()} onClick={() => setCandidateSearch("")} type="button">
                Clear
              </button>
            </div>
          </label>

          <div className={styles.candidateList}>
            {visibleCandidates.length ? visibleCandidates.map((candidate) => (
              <button
                className={candidate.id === selectedId ? styles.candidateActive : styles.candidate}
                key={candidate.id}
                onClick={() => setSelectedId(candidate.id)}
                type="button"
              >
                <span>{stateLabels[candidate.state]}</span>
                <strong>{candidate.title}</strong>
                {candidateQueueCompact ? null : <small>{candidate.projectName} / {candidate.taskIssueId}</small>}
                <span className={styles.candidateRiskChips}>
                  <span>Confidence {readConfidenceBand(candidate.confidenceScore)}</span>
                  <span>{candidate.reviewedAt ? "Reviewed" : "Unreviewed"}</span>
                  <span>Cleanup {candidate.cleanupState}</span>
                </span>
              </button>
            )) : (
              <p className={styles.empty}>표시할 후보가 없습니다.</p>
            )}
          </div>
        </aside>

        <main className={styles.detail}>
          {detail ? (
            <>
              <section className={styles.summaryBand}>
                <div>
                  <p>{detail.projectName} / {detail.taskIssueId}</p>
                  <h2>{detail.taskTitle}</h2>
                </div>
                <span>{detail.confidenceScore}%</span>
              </section>

              <section className={styles.grid}>
                <div className={styles.panel}>
                  <h3>원문 검토</h3>
                  <dl className={styles.meta}>
                    <div>
                      <dt>상태</dt>
                      <dd>{stateLabels[detail.state]}</dd>
                    </div>
                    <div>
                      <dt>정리 상태</dt>
                      <dd>{detail.cleanupState}</dd>
                    </div>
                    <div>
                      <dt>신뢰도</dt>
                      <dd>{detail.confidenceReason}</dd>
                    </div>
                  </dl>
                  <h4>질문</h4>
                  <p>{detail.question}</p>
                  <h4>답변</h4>
                  <p className={styles.answer}>{detail.answer}</p>
                </div>

                <div className={styles.panel}>
                  <h3>근거</h3>
                  <div className={styles.evidenceFilters} aria-label="Knowledge evidence source filters">
                    {(["all", "sourced", "unsourced"] as EvidenceSourceFilter[]).map((value) => (
                      <button
                        className={evidenceSourceFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                        key={value}
                        onClick={() => setEvidenceSourceFilter(value)}
                        type="button"
                      >
                        {evidenceSourceFilterLabels[value]}
                      </button>
                    ))}
                  </div>
                  <div className={styles.evidenceFilters} aria-label="Knowledge evidence priority filters">
                    {(["all", "high", "normal", "low"] as EvidencePriorityFilter[]).map((value) => (
                      <button
                        className={evidencePriorityFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                        key={value}
                        onClick={() => setEvidencePriorityFilter(value)}
                        type="button"
                      >
                        {evidencePriorityFilterLabels[value]}
                      </button>
                    ))}
                  </div>
                  <div className={styles.sourceChips} aria-label="Knowledge active evidence filter chips">
                    {activeEvidenceFilterChips.map((chip) => (
                      <span key={chip}>{chip}</span>
                    ))}
                  </div>
                  <div className={styles.sourceChips} aria-label="Knowledge visible evidence summary">
                    <span>Visible sourced {visibleEvidenceSummary.sourced}</span>
                    <span>Visible unsourced {visibleEvidenceSummary.unsourced}</span>
                    <span>Visible high {visibleEvidenceSummary.high}</span>
                    <span>Visible normal {visibleEvidenceSummary.normal}</span>
                    <span>Visible low {visibleEvidenceSummary.low}</span>
                  </div>
                  <div className={styles.evidenceFilters}>
                    <button
                      className={styles.queueQuickFilter}
                      disabled={!hasCustomEvidenceFilters}
                      onClick={clearEvidenceFilters}
                      type="button"
                    >
                      Clear evidence filters
                    </button>
                    <button className={styles.queueQuickFilter} onClick={copyEvidenceFilterHandoff} type="button">
                      Copy evidence filter handoff
                    </button>
                  </div>
                  <div className={styles.evidenceList}>
                    {visibleEvidence.length ? visibleEvidence.map((evidence) => (
                      <article className={styles.evidence} key={evidence.id}>
                        <span>{evidence.kind}</span>
                        <span>{readEvidencePriorityTier(evidence.priority)} / Priority {evidence.priority}</span>
                        <strong>{evidence.title}</strong>
                        <p>{evidence.excerpt}</p>
                        {evidence.sourceUrl ? (
                          <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
                            source
                          </a>
                        ) : null}
                      </article>
                    )) : (
                      <p className={styles.empty}>
                        No evidence matches {evidenceSourceFilterLabels[evidenceSourceFilter]} and {evidencePriorityFilterLabels[evidencePriorityFilter]}. Clear evidence filters to restore rows.
                      </p>
                    )}
                  </div>
                </div>
              </section>

              <section className={styles.editor}>
                <div className={styles.editorHeader}>
                  <div>
                    <p>WIKI Draft</p>
                    <h3>승인 전 편집</h3>
                  </div>
                  <div className={styles.editorTools}>
                    <button onClick={resetDraft} type="button">Reset draft</button>
                    <button disabled={!draft.bodyMarkdown.trim()} onClick={copyDraftMarkdown} type="button">
                      Copy Markdown
                    </button>
                    <button onClick={copyMarkdownOutline} type="button">Copy Markdown outline</button>
                    <button onClick={copyMarkdownStructureSummary} type="button">Copy Markdown structure</button>
                    <button onClick={copyMarkdownWikiLinks} type="button">Copy WIKI links</button>
                    <button onClick={copyDraftTagHandoff} type="button">Copy draft tags</button>
                    <button onClick={copyScopeHandoff} type="button">Copy scope handoff</button>
                    <button onClick={copySourceHandoff} type="button">Copy source handoff</button>
                    <button onClick={copyApprovalChecklist} type="button">Copy approval checklist</button>
                    <button onClick={copyApprovalRiskSummary} type="button">Copy risk summary</button>
                    <button onClick={copyApprovalDecisionNote} type="button">Copy decision note</button>
                    <button onClick={copyDirtyDraftSummary} type="button">Copy dirty draft summary</button>
                    <select
                      aria-label="공개 범위"
                      value={draft.scope}
                      onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value as Scope }))}
                    >
                      {Object.entries(scopeLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <section
                  className={dirtyDraftCount ? styles.reviewBannerWarning : styles.reviewBannerReady}
                  aria-label="Knowledge dirty draft reset warning"
                >
                  <strong>{dirtyDraftCount ? "Draft has unsaved edits" : "Draft matches selected candidate"}</strong>
                  <p>
                    {dirtyDraftCount
                      ? `Reset draft will discard ${dirtyDraftCount} changed field${dirtyDraftCount === 1 ? "" : "s"}.`
                      : "Reset draft will keep the current values unchanged."}
                  </p>
                </section>
                <section
                  className={reviewStatus.tone === "ready" ? styles.reviewBannerReady : styles.reviewBannerWarning}
                  aria-label="Knowledge review status banner"
                >
                  <strong>{reviewStatus.label}</strong>
                  <p>{reviewStatus.detail}</p>
                </section>
                <div className={styles.sourceChips} aria-label="Knowledge draft source references">
                  <span>Task {detail.taskIssueId}</span>
                  <span>Record {detail.id.slice(0, 8)}</span>
                  <span>{detail.evidence.length} evidence</span>
                  <span>Scope {scopeLabels[draft.scope]}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft freshness">
                  <span>Created {formatDate(detail.createdAt)}</span>
                  <span>Updated {formatDate(detail.updatedAt)}</span>
                  <span>Reviewed {detail.reviewedAt ? formatDate(detail.reviewedAt) : "-"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft approval summary">
                  <span>State {stateLabels[detail.state]}</span>
                  <span>Cleanup {detail.cleanupState}</span>
                  <span>Confidence {detail.confidenceScore}%</span>
                  <span>Review {detail.review?.status ?? "pending"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge publication scope preview">
                  <span>Current scope {scopeLabels[draft.scope]}</span>
                  <span>{scopeReview.label}</span>
                  <span>{scopeReview.changed ? "Scope changed" : "Scope unchanged"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence kind rollup">
                  {evidenceKindCounts.length ? (
                    evidenceKindCounts.map(([kind, count]) => <span key={kind}>{kind} {count}</span>)
                  ) : (
                    <span>No evidence kinds</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence priority rollup">
                  {evidencePriorityCounts.length ? (
                    evidencePriorityCounts.map(([tier, count]) => <span key={tier}>{tier} {count}</span>)
                  ) : (
                    <span>No evidence priority</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge evidence source coverage">
                  <span>Sourced {evidenceSourceCoverage.sourced}</span>
                  <span>Unsourced {evidenceSourceCoverage.unsourced}</span>
                  <span>Total evidence {evidenceSourceCoverage.total}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft length counters">
                  <span>Title {draft.title.trim().length} chars</span>
                  <span>Summary {draft.summary.trim().length} chars</span>
                  <span>Body {draft.bodyMarkdown.trim().length} chars</span>
                  <span>Tags {draftTags.length}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft dirty-state indicators">
                  <span>Changed {dirtyDraftCount}/{draftDirtyStates.length}</span>
                  {draftDirtyStates.map((item) => (
                    <span key={item.label}>{item.dirty ? "Changed" : "Original"} {item.label}</span>
                  ))}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge draft tag preview">
                  {draftTags.length ? (
                    draftTags.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)
                  ) : (
                    <span>No draft tags</span>
                  )}
                  {duplicateDraftTags.map((tag) => (
                    <span key={`duplicate-${tag}`}>Duplicate {tag}</span>
                  ))}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge guardrail summary">
                  <span>Guardrails {guardrailWarningCount} warnings</span>
                  <span>Risk groups {approvalRiskWarningGroupCount}/{approvalRiskGroups.length}</span>
                  <span>Readiness {readyReadinessCount}/{draftReadiness.length}</span>
                  <span>Confidence {detail ? readConfidenceBand(detail.confidenceScore) : "unknown"}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge approval decision note context">
                  <span>{approvalDecisionMode.label}</span>
                  <span>{approvalDecisionMode.detail}</span>
                  <span>Scope {scopeLabels[draft.scope]}</span>
                  <span>Review {reviewStatus.label}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge approval risk summary">
                  {approvalRiskGroups.map((group) => (
                    <span key={group.key}>
                      {group.label} {group.warningCount} warnings
                    </span>
                  ))}
                </div>
                <div className={styles.queueQuickFilters} aria-label="Knowledge approval risk filter shortcuts">
                  {(["all", "scope", "metadata", "structure", "evidence", "state"] as ApprovalRiskFilter[]).map((value) => (
                    <button
                      className={approvalRiskFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                      key={value}
                      onClick={() => setApprovalRiskFilter(value)}
                      type="button"
                    >
                      {value === "all" ? "All risk groups" : approvalRiskGroups.find((group) => group.key === value)?.label ?? value}
                    </button>
                  ))}
                  <button
                    className={styles.queueQuickFilter}
                    disabled={approvalRiskFilter === "all"}
                    onClick={clearApprovalRiskFilter}
                    type="button"
                  >
                    Clear risk group
                  </button>
                  <button className={styles.queueQuickFilter} onClick={copyApprovalRiskFilterHandoff} type="button">
                    Copy risk filter
                  </button>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge active approval risk filter chips">
                  <span>
                    Risk group {approvalRiskFilter === "all" ? "All risk groups" : approvalRiskGroups.find((group) => group.key === approvalRiskFilter)?.label ?? approvalRiskFilter}
                  </span>
                  <span>Showing {visibleApprovalRiskGroups.length}/{approvalRiskGroups.length}</span>
                </div>
                <section className={styles.guardrails} aria-label="Knowledge approval risk groups">
                  <h4>Approval risk groups</h4>
                  <div>
                    {visibleApprovalRiskGroups.map((group) => (
                      <article
                        className={group.warningCount ? styles.guardrailWarning : styles.guardrailReady}
                        key={group.key}
                      >
                        <strong>{group.label}</strong>
                        <p>{group.warningCount} warnings / {group.readyCount} ready notes</p>
                        {group.warningCount ? (
                          <ul>
                            {group.items.filter((item) => item.tone === "warning").map((item) => (
                              <li key={item.label}>{item.label}</li>
                            ))}
                          </ul>
                        ) : (
                          <p>No {group.label.toLowerCase()} warnings in the current draft.</p>
                        )}
                        {group.readyCount ? (
                          <p>
                            Ready: {group.items
                              .filter((item) => item.tone === "ready")
                              .map((item) => item.label)
                              .slice(0, 4)
                              .join(", ")}
                          </p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                </section>
                <section className={styles.guardrails} aria-label="Knowledge approval guardrail notes">
                  <h4>Approval guardrails</h4>
                  <div>
                    {approvalGuardrails.map((item) => (
                      <article
                        className={item.tone === "ready" ? styles.guardrailReady : styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section className={styles.guardrails} aria-label="Knowledge approval package quality checks">
                  <h4>Approval package quality</h4>
                  <div>
                    {approvalPackageQuality.map((item) => (
                      <article
                        className={item.ready ? styles.guardrailReady : styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <section className={styles.guardrails} aria-label="Knowledge final review closeout checklist">
                  <h4>Final review closeout</h4>
                  <div>
                    {finalReviewChecklist.map((item) => (
                      <article
                        className={item.ready ? styles.guardrailReady : styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                  </div>
                </section>
                <label>
                  제목
                  <input
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  />
                </label>
                <div className={styles.readinessList} aria-label="Knowledge draft readiness">
                  {draftReadiness.map((item) => (
                    <span className={item.ready ? styles.readinessReady : styles.readinessMissing} key={item.label}>
                      {item.ready ? "Ready" : "Missing"} {item.label}
                    </span>
                  ))}
                </div>
                <label>
                  요약
                  <textarea
                    rows={3}
                    value={draft.summary}
                    onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
                <label>
                  태그
                  <input
                    value={draft.tagsText}
                    onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))}
                  />
                </label>
                <label>
                  Markdown 본문
                  <textarea
                    rows={10}
                    value={draft.bodyMarkdown}
                    onChange={(event) => setDraft((current) => ({ ...current, bodyMarkdown: event.target.value }))}
                  />
                </label>
                <section
                  className={[
                    styles.markdownPreview,
                    previewCompact ? styles.markdownPreviewCompact : "",
                  ].filter(Boolean).join(" ")}
                  aria-label="Knowledge draft Markdown preview"
                >
                  <div className={styles.markdownPreviewHeader}>
                    <h4>Markdown preview</h4>
                    <button onClick={() => setPreviewCompact((current) => !current)} type="button">
                      {previewCompact ? "Expanded preview" : "Compact preview"}
                    </button>
                  </div>
                  <pre>{draft.bodyMarkdown.trim() || "No Markdown body yet."}</pre>
                </section>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown outline preview">
                  {markdownOutline.length ? (
                    markdownOutline.map((heading) => (
                      <span key={`${heading.line}-${heading.text}`}>
                        H{heading.level} L{heading.line}: {heading.text}
                      </span>
                    ))
                  ) : (
                    <span>No Markdown headings</span>
                  )}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown structure summary">
                  <span>Headings {markdownStructureSummary.headings}</span>
                  <span>Paragraphs {markdownStructureSummary.paragraphs}</span>
                  <span>List items {markdownStructureSummary.listItems}</span>
                  <span>Lines {markdownStructureSummary.lines}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge Markdown WIKI link preview">
                  {markdownWikiLinks.length ? (
                    markdownWikiLinks.map((link) => (
                      <span key={`${link.line}-${link.target}-${link.label}`}>
                        L{link.line}: [[{link.target}]]
                      </span>
                    ))
                  ) : (
                    <span>No Markdown WIKI links</span>
                  )}
                </div>
              </section>

              <footer className={styles.footer}>
                <div className={styles.sourceChips} aria-label="Knowledge approval submit guardrails">
                  <span>Approval blockers {guardrailWarningCount}</span>
                  <span>{guardrailWarningCount ? "Resolve before approval" : "Ready to approve"}</span>
                  <span>Warning groups {approvalRiskWarningGroupCount}/{approvalRiskGroups.length}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge approval package summary">
                  <span>Package sections {approvalPackageSections}</span>
                  <span>Draft {draft.bodyMarkdown.trim().length} chars</span>
                  <span>Evidence {detail.evidence.length}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge approval package quality summary">
                  <span>Package quality {approvalPackageQualityReadyCount}/{approvalPackageQuality.length}</span>
                  <span>{approvalPackageQualityStatus.label}</span>
                  <span>Missing {approvalPackageQualityMissingCount}</span>
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge final review closeout summary">
                  <span>Final closeout {finalReviewReadyCount}/{finalReviewChecklist.length}</span>
                  <span>{finalReviewStatus.label}</span>
                  <span>{finalReviewNextAction}</span>
                </div>
                <div className={styles.queueQuickFilters} aria-label="Knowledge rejection reason presets">
                  {rejectionReasonPresets.map((preset) => (
                    <button
                      className={styles.queueQuickFilter}
                      key={preset.label}
                      onClick={() => applyRejectionReasonPreset(preset)}
                      type="button"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <div className={styles.sourceChips} aria-label="Knowledge rejection reason draft status">
                  <span>Reason presets {rejectionReasonPresets.length}</span>
                  <span>Reason {draft.rejectionReason.trim() ? "filled" : "empty"}</span>
                  <span>{draft.rejectionReason.trim().length} chars</span>
                </div>
                <label>
                  반려 사유
                  <input
                    value={draft.rejectionReason}
                    onChange={(event) => setDraft((current) => ({ ...current, rejectionReason: event.target.value }))}
                    placeholder="반려할 때 필요한 사유"
                  />
                </label>
                <div className={styles.actions}>
                  <button onClick={copyApprovalPackage} type="button">
                    Copy approval package
                  </button>
                  <button onClick={copyApprovalPackageQuality} type="button">
                    Copy package quality
                  </button>
                  <button onClick={copyFinalReviewCloseout} type="button">
                    Copy final closeout
                  </button>
                  <button disabled={!guardrailWarningCount} onClick={copyApprovalBlockers} type="button">
                    Copy approval blockers
                  </button>
                  <button disabled={!draft.rejectionReason.trim()} onClick={copyRejectionReason} type="button">
                    Copy rejection reason
                  </button>
                  <button disabled={busy} onClick={rejectCandidate} type="button">반려</button>
                  <button
                    disabled={busy}
                    onClick={approveCandidate}
                    title={guardrailWarningCount ? `${guardrailWarningCount} active guardrail warning(s) remain` : "No active guardrail warnings"}
                    type="button"
                  >
                    WIKI 지식 승인
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <p className={styles.empty}>선택된 후보가 없습니다.</p>
          )}

          <section className={styles.editor} aria-label="Approved WIKI knowledge readback">
            <div className={styles.editorHeader}>
              <div>
                <p>Approved WIKI</p>
                <h3>Approved item readback</h3>
              </div>
              <div className={styles.editorTools}>
                <button onClick={refreshApprovedItems} type="button">Refresh approved</button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedMarkdown} type="button">
                  Copy approved Markdown
                </button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedItemHandoff} type="button">
                  Copy item handoff
                </button>
                <button onClick={copyApprovedSearchHandoff} type="button">Copy search handoff</button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedSourcePackage} type="button">
                  Copy source package
                </button>
                <button onClick={copyApprovedIndexPackage} type="button">Copy index package</button>
              </div>
            </div>

            <div className={styles.sourceChips} aria-label="Approved WIKI summary counts">
              <span>Total {approvedItems.length}</span>
              <span>Visible {visibleApprovedItems.length}</span>
              <span>Sourced {approvedSourceCoverage.sourced}</span>
              <span>Unsourced {approvedSourceCoverage.unsourced}</span>
              <span>Tags {approvedTagOptions.length}</span>
              <span>{approvedItemsLoaded ? "Loaded" : "Loading"}</span>
            </div>
            <div className={styles.sourceChips} aria-label="Approved WIKI scope counts">
              <span>Admin only {approvedScopeCounts.admin_only}</span>
              <span>Organization {approvedScopeCounts.organization}</span>
              <span>Project members {approvedScopeCounts.project_members}</span>
              <span>Project {approvedScopeCounts.project}</span>
            </div>
            <div className={styles.queueFilterSummary} aria-label="Approved WIKI active filter chips">
              {activeApprovedFilterChips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>

            <div className={styles.approvedToolbar}>
              <label>
                Search approved
                <input
                  onChange={(event) => setApprovedSearch(event.target.value)}
                  placeholder="Title, body, tag, source id"
                  value={approvedSearch}
                />
              </label>
              <label>
                Scope
                <select
                  aria-label="Approved WIKI scope filter"
                  onChange={(event) => setApprovedScopeFilter(event.target.value as Scope | "all")}
                  value={approvedScopeFilter}
                >
                  <option value="all">All scopes</option>
                  {Object.entries(scopeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Tag
                <select
                  aria-label="Approved WIKI tag filter"
                  onChange={(event) => setApprovedTagFilter(event.target.value)}
                  value={approvedTagFilter}
                >
                  <option value="all">All tags</option>
                  {approvedTagOptions.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  aria-label="Approved WIKI source filter"
                  onChange={(event) => setApprovedSourceFilter(event.target.value as ApprovedSourceFilter)}
                  value={approvedSourceFilter}
                >
                  {(["all", "sourced", "unsourced"] as ApprovedSourceFilter[]).map((value) => (
                    <option key={value} value={value}>{approvedSourceFilterLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label>
                Sort
                <select
                  aria-label="Approved WIKI sort"
                  onChange={(event) => setApprovedSort(event.target.value as ApprovedSort)}
                  value={approvedSort}
                >
                  {(["newest", "title", "source_count"] as ApprovedSort[]).map((value) => (
                    <option key={value} value={value}>{approvedSortLabels[value]}</option>
                  ))}
                </select>
              </label>
              <button
                className={styles.queueQuickFilter}
                disabled={
                  !approvedSearch.trim() &&
                  approvedScopeFilter === "all" &&
                  approvedTagFilter === "all" &&
                  approvedSourceFilter === "all" &&
                  approvedSort === "newest"
                }
                onClick={clearApprovedFilters}
                type="button"
              >
                Clear approved filters
              </button>
            </div>

            <section className={styles.exportPanel} aria-label="Approved WIKI export sync readiness">
              <div className={styles.exportHeader}>
                <div>
                  <p>Export / Sync</p>
                  <h4>Approved package readiness</h4>
                </div>
                <div className={styles.editorTools}>
                  <button disabled={!approvedExportItems.length} onClick={copyApprovedSyncManifest} type="button">
                    Copy sync manifest
                  </button>
                  <button disabled={!approvedExportItems.length} onClick={copyApprovedExportChecklist} type="button">
                    Copy export checklist
                  </button>
                  <button disabled={!approvedExportItems.length} onClick={downloadApprovedExport} type="button">
                    Download package
                  </button>
                </div>
              </div>
              <div className={styles.approvedToolbar}>
                <label>
                  Export scope
                  <select
                    aria-label="Approved WIKI export scope"
                    onChange={(event) => setApprovedExportScope(event.target.value as ApprovedExportScope)}
                    value={approvedExportScope}
                  >
                    {(["visible", "selected"] as ApprovedExportScope[]).map((value) => (
                      <option key={value} value={value}>{approvedExportScopeLabels[value]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Package format
                  <select
                    aria-label="Approved WIKI export format"
                    onChange={(event) => setApprovedExportFormat(event.target.value as ApprovedExportFormat)}
                    value={approvedExportFormat}
                  >
                    {(["json", "markdown"] as ApprovedExportFormat[]).map((value) => (
                      <option key={value} value={value}>{approvedExportFormatLabels[value]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Sync target
                  <select
                    aria-label="Approved WIKI sync target"
                    onChange={(event) => setApprovedSyncTarget(event.target.value as ApprovedSyncTarget)}
                    value={approvedSyncTarget}
                  >
                    {(["portable_archive", "obsidian", "notion", "assistant_retrieval"] as ApprovedSyncTarget[]).map((value) => (
                      <option key={value} value={value}>{approvedSyncTargetLabels[value]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.sourceChips} aria-label="Approved WIKI export stats">
                <span>Items {approvedExportItems.length}</span>
                <span>Sourced {approvedExportStats.sourced}</span>
                <span>Unsourced {approvedExportStats.unsourced}</span>
                <span>Tags {approvedExportStats.tags}</span>
                <span>Body {approvedExportStats.bodyChars} chars</span>
                <span>Format {approvedExportFormatLabels[approvedExportFormat]}</span>
                <span>Target {approvedSyncTargetLabels[approvedSyncTarget]}</span>
              </div>
              <section className={styles.guardrails} aria-label="Approved WIKI export readiness checks">
                <h4>Export readiness checks</h4>
                <div>
                  {approvedExportReadiness.map((item) => (
                    <article
                      className={item.ready ? styles.guardrailReady : styles.guardrailWarning}
                      key={item.label}
                    >
                      <strong>{item.label}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </section>
              <div className={styles.sourceChips} aria-label="Approved WIKI export readiness summary">
                <span>Readiness {approvedExportReadyCount}/{approvedExportReadiness.length}</span>
                <span>{approvedExportReadyCount === approvedExportReadiness.length ? "Ready to export" : "Review before sync"}</span>
                <span>File {approvedSyncPackageName}</span>
              </div>
              <section className={styles.syncRunPanel} aria-label="Approved WIKI guarded sync execution">
                <div className={styles.exportHeader}>
                  <div>
                    <p>Guarded execution</p>
                    <h4>Dry-run and server audit history</h4>
                  </div>
                  <div className={styles.editorTools}>
                    <button disabled={!approvedExportItems.length} onClick={recordApprovedSyncDryRun} type="button">
                      Preview sync dry-run
                    </button>
                    <button disabled={!approvedExportItems.length} onClick={runGuardedApprovedSync} type="button">
                      Run guarded sync
                    </button>
                    <button disabled={!approvedSyncHistory.length} onClick={copyApprovedSyncHistoryReport} type="button">
                      Copy sync history
                    </button>
                    <button disabled={!approvedSyncHistory.length} onClick={clearApprovedSyncHistory} type="button">
                      Clear local history
                    </button>
                  </div>
                </div>
                <div className={styles.sourceChips} aria-label="Approved WIKI guarded sync summary">
                  <span>Confirmation {approvedSyncConfirmation.trim() === approvedSyncConfirmationText ? "matched" : "required"}</span>
                  <span>Server audit {approvedSyncHistory.length}</span>
                  <span>Last {latestApprovedSyncRun ? latestApprovedSyncRun.status : "none"}</span>
                  <span>{approvedSyncCanRun ? "Guard open" : "Guard closed"}</span>
                </div>
                <label className={styles.syncConfirmation}>
                  Sync confirmation
                  <input
                    aria-label="Approved WIKI sync confirmation"
                    onChange={(event) => setApprovedSyncConfirmation(event.target.value)}
                    placeholder={approvedSyncConfirmationText}
                    value={approvedSyncConfirmation}
                  />
                </label>
                <div className={styles.syncWarnings} aria-label="Approved WIKI sync dry-run warnings">
                  {approvedSyncDryRunWarnings.length ? approvedSyncDryRunWarnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  )) : <span>No dry-run warnings for the current package.</span>}
                </div>
                <div className={styles.syncHistory} aria-label="Approved WIKI sync history">
                  {approvedSyncHistory.length ? approvedSyncHistory.slice(0, 5).map((run) => (
                    <article key={run.id}>
                      <strong>{run.status} / {approvedSyncTargetLabels[run.target]}</strong>
                      <p>{formatDate(run.createdAt)} / {run.packageName}</p>
                      <span>{run.readyCount}/{run.readinessCount} ready</span>
                      <span>{run.itemCount} items</span>
                      <span>{run.sourceReferences} source refs</span>
                      <span>{run.unsourced} unsourced</span>
                      <span>{run.providerConfigured ? "provider configured" : "provider blocked"}</span>
                    </article>
                  )) : <p className={styles.empty}>No server sync audit history has been recorded yet.</p>}
                </div>
                <section className={styles.syncTargetPanel} aria-label="Approved WIKI provider target configuration">
                  <div className={styles.exportHeader}>
                    <div>
                      <p>Provider target</p>
                      <h4>Configuration and dry-run adapter</h4>
                    </div>
                    <div className={styles.editorTools}>
                      <button onClick={saveApprovedSyncTargetConfig} type="button">
                        Save target config
                      </button>
                      <button disabled={!providerPreviewAudit} onClick={createApprovedProviderPreview} type="button">
                        Create provider preview
                      </button>
                      <button disabled={!approvedProviderPreview} onClick={copyApprovedProviderPreview} type="button">
                        Copy provider preview
                      </button>
                      <button disabled={!approvedProviderPreview} onClick={executeApprovedProviderAdapter} type="button">
                        Execute adapter
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={copyApprovedProviderExecution} type="button">
                        Copy execution
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={copyApprovedProviderExecutionPackage} type="button">
                        Copy execution package
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={downloadApprovedProviderExecutionPackage} type="button">
                        Download execution package
                      </button>
                    </div>
                  </div>
                  <div className={styles.sourceChips} aria-label="Approved WIKI sync target config summary">
                    <span>{selectedApprovedSyncTargetConfig?.label ?? approvedSyncTargetLabels[approvedSyncTarget]}</span>
                    <span>{approvedSyncTargetEnabled ? "Target enabled" : "Target disabled"}</span>
                    <span>{approvedSyncTargetDryRunOnly ? "Dry-run only" : "Execution allowed"}</span>
                    <span>Adapter {selectedApprovedSyncTargetConfig?.adapter ?? "pending"}</span>
                    <span>Credential {selectedApprovedSyncTargetConfig?.credentialStatus ?? "not saved"}</span>
                    <span>Source {selectedApprovedSyncTargetConfig?.credentialSource ?? "not saved"}</span>
                    <span>Scope {selectedApprovedSyncTargetConfig?.credentialScope ?? approvedSyncTarget}</span>
                    <span>Store {selectedApprovedSyncTargetConfig?.credentialStore ?? "not saved"}</span>
                    <span>{selectedApprovedSyncTargetConfig?.remoteWriteReady ? "Remote write ready" : "Remote write blocked"}</span>
                    <span>Live flag {selectedApprovedSyncTargetConfig?.liveWriteFeatureFlagEnabled ? "enabled" : "disabled"}</span>
                    <span>Rollback {selectedApprovedSyncTargetConfig?.rollbackPlanStatus ?? "not saved"}</span>
                    <span>Reconcile {selectedApprovedSyncTargetConfig?.reconciliationPlanStatus ?? "not saved"}</span>
                    <span>Inventory {selectedApprovedSyncTargetConfig?.inventoryEntryCount ?? 0}</span>
                    <span>{providerPreviewAudit ? "Provider-ready audit available" : "No provider-ready audit"}</span>
                  </div>
                  <div className={styles.syncWarnings} aria-label="Approved WIKI remote write blockers">
                    {selectedApprovedSyncTargetConfig?.credentialLastValidatedAt ? (
                      <span>Credential validated {formatDate(selectedApprovedSyncTargetConfig.credentialLastValidatedAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.credentialRotationDueAt ? (
                      <span>Rotation due {formatDate(selectedApprovedSyncTargetConfig.credentialRotationDueAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.rollbackPlanRef ? (
                      <span>Rollback {selectedApprovedSyncTargetConfig.rollbackPlanRef}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.reconciliationPlanRef ? (
                      <span>Reconciliation {selectedApprovedSyncTargetConfig.reconciliationPlanRef}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.liveWriteFeatureFlag ? (
                      <span>{selectedApprovedSyncTargetConfig.liveWriteFeatureFlag} {selectedApprovedSyncTargetConfig.liveWriteFeatureFlagEnabled ? "enabled" : "disabled"}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.inventoryImportedAt ? (
                      <span>Inventory imported {formatDate(selectedApprovedSyncTargetConfig.inventoryImportedAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.inventoryWarnings.map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                    {selectedApprovedSyncTargetConfig?.remoteWriteBlockers.length
                      ? selectedApprovedSyncTargetConfig.remoteWriteBlockers.map((blocker) => (
                        <span key={blocker}>{blocker}</span>
                      ))
                      : <span>Remote write prerequisites are ready, but live provider writes remain disabled.</span>}
                  </div>
                  <div className={styles.syncTargetControls}>
                    <label>
                      <input
                        checked={approvedSyncTargetEnabled}
                        onChange={(event) => setApprovedSyncTargetEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      Target enabled
                    </label>
                    <label>
                      <input
                        checked={approvedSyncTargetDryRunOnly}
                        onChange={(event) => setApprovedSyncTargetDryRunOnly(event.target.checked)}
                        type="checkbox"
                      />
                      Dry-run only
                    </label>
                    <label>
                      Credential reference
                      <input
                        aria-label="Approved WIKI sync target credential reference"
                        onChange={(event) => setApprovedSyncTargetCredentialRef(event.target.value)}
                        placeholder="server secret reference only"
                        value={approvedSyncTargetCredentialRef}
                      />
                    </label>
                    <label>
                      Provider preview confirmation
                      <input
                        aria-label="Approved WIKI provider preview confirmation"
                        onChange={(event) => setApprovedProviderPreviewConfirmation(event.target.value)}
                        placeholder={approvedProviderPreviewConfirmationText}
                        value={approvedProviderPreviewConfirmation}
                      />
                    </label>
                    <label>
                      Provider execution confirmation
                      <input
                        aria-label="Approved WIKI provider execution confirmation"
                        onChange={(event) => setApprovedProviderExecutionConfirmation(event.target.value)}
                        placeholder={approvedProviderExecutionConfirmationText}
                        value={approvedProviderExecutionConfirmation}
                      />
                    </label>
                    <label>
                      Target notes
                      <input
                        aria-label="Approved WIKI sync target notes"
                        onChange={(event) => setApprovedSyncTargetNotes(event.target.value)}
                        placeholder="Optional provider target notes"
                        value={approvedSyncTargetNotes}
                      />
                    </label>
                    <label>
                      Obsidian inventory manifest
                      <textarea
                        aria-label="Approved WIKI Obsidian inventory manifest"
                        onChange={(event) => setApprovedSyncTargetInventoryManifest(event.target.value)}
                        placeholder='{"entries":[{"path":"approved-wiki/example.md","contentDigest":"...","managedBy":"approved_wiki"}]}'
                        value={approvedSyncTargetInventoryManifest}
                      />
                    </label>
                  </div>
                  {approvedProviderPreview ? (
                    <div className={styles.providerPreview} aria-label="Approved WIKI provider preview">
                      <strong>{approvedProviderPreview.destination} / {approvedProviderPreview.status}</strong>
                      <p>{approvedProviderPreview.packageName}</p>
                      <div>
                        {approvedProviderPreview.operations.map((operation) => (
                          <span key={operation}>{operation}</span>
                        ))}
                      </div>
                      <div>
                        {approvedProviderPreview.warnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </div>
                      {approvedProviderPreview.reconciliationPackage ? (
                        <ProviderReconciliationPackageView packageData={approvedProviderPreview.reconciliationPackage} />
                      ) : null}
                    </div>
                  ) : null}
                  {approvedProviderExecution ? (
                    <div className={styles.providerPreview} aria-label="Approved WIKI provider execution">
                      <strong>{approvedProviderExecution.destination} / {approvedProviderExecution.status}</strong>
                      <p>{approvedProviderExecution.artifactName}</p>
                      <div>
                        <span>{approvedProviderExecution.itemCount} item(s)</span>
                        <span>{approvedProviderExecution.artifactType}</span>
                        <span>{approvedProviderExecution.contentDigest.slice(0, 16)} digest</span>
                      </div>
                      <div>
                        {approvedProviderExecution.warnings.map((warning) => (
                          <span key={warning}>{warning}</span>
                        ))}
                      </div>
                      {approvedProviderExecution.reconciliationPackage ? (
                        <ProviderReconciliationPackageView packageData={approvedProviderExecution.reconciliationPackage} />
                      ) : null}
                      {approvedProviderExecution.liveWritePreflight ? (
                        <ProviderLiveWritePreflightView preflight={approvedProviderExecution.liveWritePreflight} />
                      ) : null}
                      <div className={styles.sourceChips} aria-label="Approved WIKI provider execution package review note summary">
                        <span>Review notes {approvedProviderExecution.packageReview.reviewNoteCount}</span>
                        <span>{approvedProviderExecution.packageReview.latestReviewNoteAt ? `Latest ${formatDate(approvedProviderExecution.packageReview.latestReviewNoteAt)}` : "No notes yet"}</span>
                        <span>{approvedProviderExecution.packageReview.packageDigest.slice(0, 16)} package digest</span>
                      </div>
                      <div className={styles.reviewNoteForm} aria-label="Approved WIKI provider execution package review note form">
                        <label>
                          Category
                          <select
                            aria-label="Provider execution package review note category"
                            onChange={(event) => setApprovedProviderExecutionReviewNoteCategory(event.target.value as ProviderExecutionPackageReviewNoteCategory)}
                            value={approvedProviderExecutionReviewNoteCategory}
                          >
                            {providerExecutionPackageReviewNoteCategories.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Review note
                          <textarea
                            aria-label="Provider execution package review note text"
                            onChange={(event) => setApprovedProviderExecutionReviewNoteText(event.target.value)}
                            placeholder="Append package review context without changing immutable package evidence"
                            value={approvedProviderExecutionReviewNoteText}
                          />
                        </label>
                        <button
                          disabled={approvedProviderExecutionReviewNoteSaving || !approvedProviderExecutionReviewNoteText.trim()}
                          onClick={saveApprovedProviderExecutionPackageReviewNote}
                          type="button"
                        >
                          {approvedProviderExecutionReviewNoteSaving ? "Saving..." : "Add review note"}
                        </button>
                      </div>
                      <div className={styles.reviewNotes} aria-label="Approved WIKI provider execution package review notes">
                        {approvedProviderExecution.packageReviewNotes.length ? approvedProviderExecution.packageReviewNotes.map((note) => (
                          <article key={note.id}>
                            <strong>{getProviderExecutionPackageReviewNoteCategoryLabel(note.category)}</strong>
                            <p>{note.note}</p>
                            <span>{formatDate(note.createdAt)} / {note.reviewerId ?? "unknown reviewer"}</span>
                            <span>{note.packageDigest.slice(0, 16)} package digest</span>
                          </article>
                        )) : <p className={styles.empty}>No package review notes have been added.</p>}
                      </div>
                    </div>
                  ) : null}
                  <section className={styles.providerPreview} aria-label="Approved WIKI provider execution package history">
                    <strong>Execution package review history</strong>
                    <div className={styles.sourceChips} aria-label="Approved WIKI provider execution package history summary">
                      <span>Packages {approvedProviderExecutions.length}</span>
                      <span>Visible {visibleApprovedProviderExecutions.length}</span>
                      <span>Source append-only audit</span>
                      <span>Local downloads not tracked</span>
                    </div>
                    <div className={styles.approvedToolbar} aria-label="Approved WIKI provider execution package history filters">
                      <label>
                        Target
                        <select
                          aria-label="Provider execution package target filter"
                          onChange={(event) => setApprovedProviderExecutionTargetFilter(event.target.value as ApprovedSyncTarget | "all")}
                          value={approvedProviderExecutionTargetFilter}
                        >
                          <option value="all">All targets</option>
                          {(["portable_archive", "obsidian", "notion", "assistant_retrieval"] as ApprovedSyncTarget[]).map((target) => (
                            <option key={target} value={target}>{approvedSyncTargetLabels[target]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select
                          aria-label="Provider execution package status filter"
                          onChange={(event) => setApprovedProviderExecutionStatusFilter(event.target.value as ApprovedProviderExecution["status"] | "all")}
                          value={approvedProviderExecutionStatusFilter}
                        >
                          <option value="all">All statuses</option>
                          <option value="executed">executed</option>
                          <option value="preflight_recorded">preflight_recorded</option>
                        </select>
                      </label>
                      <label>
                        Artifact
                        <select
                          aria-label="Provider execution package artifact filter"
                          onChange={(event) => setApprovedProviderExecutionArtifactFilter(event.target.value as ApprovedProviderExecution["artifactType"] | "all")}
                          value={approvedProviderExecutionArtifactFilter}
                        >
                          <option value="all">All artifacts</option>
                          <option value="portable_archive_manifest">portable_archive_manifest</option>
                          <option value="obsidian_markdown_manifest">obsidian_markdown_manifest</option>
                          <option value="obsidian_live_write_preflight">obsidian_live_write_preflight</option>
                        </select>
                      </label>
                      <label>
                        Digest
                        <input
                          aria-label="Provider execution package digest filter"
                          onChange={(event) => setApprovedProviderExecutionDigestFilter(event.target.value)}
                          placeholder="package digest prefix"
                          value={approvedProviderExecutionDigestFilter}
                        />
                      </label>
                      <label>
                        Review
                        <select
                          aria-label="Provider execution package review coverage filter"
                          onChange={(event) => setApprovedProviderExecutionReviewCoveragePreset(event.target.value as ProviderExecutionPackageReviewCoveragePreset)}
                          value={approvedProviderExecutionReviewCoveragePreset}
                        >
                          <option value="all">All review states</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="unreviewed">Unreviewed</option>
                          <option value="stale_unreviewed">Stale unreviewed</option>
                        </select>
                      </label>
                      <label>
                        Reviewer
                        <input
                          aria-label="Provider execution package review reviewer filter"
                          onChange={(event) => setApprovedProviderExecutionReviewReviewerFilter(event.target.value)}
                          placeholder="reviewer id"
                          value={approvedProviderExecutionReviewReviewerFilter}
                        />
                      </label>
                      <label>
                        Note type
                        <select
                          aria-label="Provider execution package review note category filter"
                          onChange={(event) => setApprovedProviderExecutionReviewCategoryFilter(event.target.value as ProviderExecutionPackageReviewNoteCategory | "all")}
                          value={approvedProviderExecutionReviewCategoryFilter}
                        >
                          <option value="all">All note types</option>
                          {providerExecutionPackageReviewNoteCategories.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Stale days
                        <input
                          aria-label="Provider execution package review stale days"
                          min={0}
                          max={365}
                          onChange={(event) => setApprovedProviderExecutionReviewStaleDays(Number.parseInt(event.target.value, 10) || 0)}
                          type="number"
                          value={approvedProviderExecutionReviewStaleDays}
                        />
                      </label>
                      <button onClick={downloadApprovedProviderExecutionPackageReviewNotesCsv} type="button">
                        Export notes CSV
                      </button>
                      <button onClick={copyApprovedProviderExecutionPackageReviewHandoff} type="button">
                        Copy review handoff
                      </button>
                    </div>
                    <div className={styles.sourceChips} aria-label="Provider execution package review shortcut reset chips">
                      {approvedProviderExecutionDigestFilter.trim() ? (
                        <button onClick={() => setApprovedProviderExecutionDigestFilter("")} type="button">
                          Clear digest {approvedProviderExecutionDigestFilter.trim().slice(0, 12)}
                        </button>
                      ) : null}
                      {approvedProviderExecutionReviewCategoryFilter !== "all" ? (
                        <button onClick={() => setApprovedProviderExecutionReviewCategoryFilter("all")} type="button">
                          Clear note type {getProviderExecutionPackageReviewNoteCategoryLabel(approvedProviderExecutionReviewCategoryFilter)}
                        </button>
                      ) : null}
                      {approvedProviderExecutionReviewReviewerFilter.trim() ? (
                        <button onClick={() => setApprovedProviderExecutionReviewReviewerFilter("")} type="button">
                          Clear reviewer {approvedProviderExecutionReviewReviewerFilter.trim()}
                        </button>
                      ) : null}
                      {hasProviderExecutionReviewShortcutFilters ? (
                        <button onClick={clearApprovedProviderExecutionReviewShortcutFilters} type="button">
                          Clear review shortcuts
                        </button>
                      ) : (
                        <span>No shortcut filters active</span>
                      )}
                    </div>
                    <div className={styles.handoffPreview} aria-label="Provider execution package review handoff preview">
                      <div className={styles.handoffPreviewHeader}>
                        <strong>Active review handoff preview</strong>
                        <span>Read-only preview before copy</span>
                      </div>
                      {approvedProviderExecutionReviewReport ? (
                        <>
                          <div className={styles.sourceChips} aria-label="Provider execution package review handoff active filters">
                            <span>Coverage {approvedProviderExecutionReviewReport.filters.coveragePreset}</span>
                            <span>Stale days {approvedProviderExecutionReviewReport.filters.staleDays}</span>
                            <span>
                              Note type{" "}
                              {approvedProviderExecutionReviewReport.filters.category === "all"
                                ? "all"
                                : getProviderExecutionPackageReviewNoteCategoryLabel(approvedProviderExecutionReviewReport.filters.category)}
                            </span>
                            <span>Reviewer {approvedProviderExecutionReviewReport.filters.reviewerId ?? "all"}</span>
                            <span>Digest {approvedProviderExecutionReviewReport.filters.packageDigest?.slice(0, 16) ?? "all"}</span>
                          </div>
                          <div className={styles.sourceChips} aria-label="Provider execution package review handoff summary counts">
                            <span>Packages {approvedProviderExecutionReviewReport.summary.packageCount}</span>
                            <span>Reviewed {approvedProviderExecutionReviewReport.summary.reviewedCount}</span>
                            <span>Unreviewed {approvedProviderExecutionReviewReport.summary.unreviewedCount}</span>
                            <span>Stale {approvedProviderExecutionReviewReport.summary.staleUnreviewedCount}</span>
                            <span>Notes {approvedProviderExecutionReviewReport.summary.noteCount}</span>
                          </div>
                          <div className={styles.handoffPreviewGrid}>
                            <div aria-label="Provider execution package review handoff reviewer counts">
                              <strong>Reviewer counts</strong>
                              {approvedProviderExecutionReviewReport.summary.reviewerCounts.length ? (
                                approvedProviderExecutionReviewReport.summary.reviewerCounts.slice(0, 4).map((item) => (
                                  <span key={item.reviewerId ?? "unknown"}>{item.reviewerId ?? "unknown"}: {item.count}</span>
                                ))
                              ) : (
                                <span>none</span>
                              )}
                            </div>
                            <div aria-label="Provider execution package review handoff category counts">
                              <strong>Note category counts</strong>
                              {approvedProviderExecutionReviewReport.summary.categoryCounts.length ? (
                                approvedProviderExecutionReviewReport.summary.categoryCounts.map((item) => (
                                  <span key={item.category}>{getProviderExecutionPackageReviewNoteCategoryLabel(item.category)}: {item.count}</span>
                                ))
                              ) : (
                                <span>none</span>
                              )}
                            </div>
                          </div>
                          <div className={styles.reviewNotes} aria-label="Provider execution package review handoff coverage preview">
                            {approvedProviderExecutionReviewReport.coverage.slice(0, 4).map((item) => (
                              <article key={item.executionId}>
                                <strong>{item.coverageStatus} / {approvedSyncTargetLabels[item.target]}</strong>
                                <p>{item.packageFilename}</p>
                                <span>{item.noteCount} note(s)</span>
                                <span>{item.packageDigest.slice(0, 16)} digest</span>
                              </article>
                            ))}
                          </div>
                          <pre aria-label="Provider execution package review handoff markdown preview">
                            {providerExecutionPackageReviewHandoffPreview}
                          </pre>
                        </>
                      ) : (
                        <p>Provider execution package review report is not loaded.</p>
                      )}
                    </div>
                    {approvedProviderExecutionReviewReport ? (
                      <div className={styles.providerReviewReport} aria-label="Approved WIKI provider execution package review report">
                        <div className={styles.sourceChips}>
                          <span>Reviewed {approvedProviderExecutionReviewReport.summary.reviewedCount}</span>
                          <span>Unreviewed {approvedProviderExecutionReviewReport.summary.unreviewedCount}</span>
                          <span>Stale {approvedProviderExecutionReviewReport.summary.staleUnreviewedCount}</span>
                          <span>Notes {approvedProviderExecutionReviewReport.summary.noteCount}</span>
                        </div>
                        <div className={styles.sourceChips} aria-label="Provider execution package reviewer quick filters">
                          {approvedProviderExecutionReviewReport.summary.reviewerCounts.length ? approvedProviderExecutionReviewReport.summary.reviewerCounts.slice(0, 4).map((item) => (
                            <button
                              key={item.reviewerId ?? "unknown"}
                              onClick={() => setApprovedProviderExecutionReviewReviewerFilter(item.reviewerId ?? "")}
                              type="button"
                            >
                              {item.reviewerId ?? "unknown"} ({item.count})
                            </button>
                          )) : <span>No reviewers yet</span>}
                        </div>
                        <div className={styles.sourceChips} aria-label="Provider execution package note category quick filters">
                          <button onClick={() => setApprovedProviderExecutionReviewCategoryFilter("all")} type="button">
                            All note types
                          </button>
                          {approvedProviderExecutionReviewReport.summary.categoryCounts.map((item) => (
                            <button
                              key={item.category}
                              onClick={() => setApprovedProviderExecutionReviewCategoryFilter(item.category)}
                              type="button"
                            >
                              {getProviderExecutionPackageReviewNoteCategoryLabel(item.category)} ({item.count})
                            </button>
                          ))}
                        </div>
                        <div className={styles.coverageGroupTotals} aria-label="Provider execution package coverage queue group totals">
                          <article>
                            <strong>All visible</strong>
                            <span>{approvedProviderExecutionReviewReport.summary.coverageGroupTotals.totalCount} package(s)</span>
                            <span>{approvedProviderExecutionReviewReport.summary.coverageGroupTotals.noteCount} note(s)</span>
                          </article>
                          <article>
                            <strong>Reviewed</strong>
                            <span>{approvedProviderExecutionReviewReport.summary.coverageGroupTotals.reviewedCount} package(s)</span>
                            <span>Has package review notes</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("reviewed")} type="button">
                              Focus reviewed
                            </button>
                          </article>
                          <article>
                            <strong>Unreviewed</strong>
                            <span>{approvedProviderExecutionReviewReport.summary.coverageGroupTotals.unreviewedCount} package(s)</span>
                            <span>No matching review notes</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("unreviewed")} type="button">
                              Focus unreviewed
                            </button>
                          </article>
                          <article>
                            <strong>Stale</strong>
                            <span>{approvedProviderExecutionReviewReport.summary.coverageGroupTotals.staleUnreviewedCount} package(s)</span>
                            <span>{approvedProviderExecutionReviewReport.filters.staleDays} day threshold</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("stale_unreviewed")} type="button">
                              Focus stale
                            </button>
                          </article>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage queue density controls"
                          title="Queue density controls change only local grouped coverage queue spacing for review scanning."
                        >
                          {(["comfortable", "compact"] as ProviderExecutionPackageReviewQueueDensity[]).map((density) => (
                            <button
                              key={density}
                              aria-pressed={approvedProviderExecutionReviewQueueDensity === density}
                              onClick={() => setApprovedProviderExecutionReviewQueueDensity(density)}
                              type="button"
                            >
                              {density === "comfortable" ? "Comfortable queue" : "Compact queue"}
                            </button>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary local handoff actions"
                          title="Local handoff actions copy, download, and reset browser-only provider execution package coverage summary status."
                        >
                          <button onClick={copyApprovedProviderExecutionPackageCoverageGroupSummary} type="button">
                            Copy group summary
                          </button>
                          <button onClick={downloadApprovedProviderExecutionPackageCoverageGroupSummary} type="button">
                            Download group summary
                          </button>
                          <button onClick={copyApprovedProviderExecutionPackageCoverageGroupSummaryFilename} type="button">
                            Copy filename
                          </button>
                          <button
                            onClick={copyApprovedProviderExecutionPackageCoverageGroupSummaryResetConfirmation}
                            type="button"
                          >
                            Copy reset confirmation
                          </button>
                          <button onClick={resetApprovedProviderExecutionPackageCoverageGroupSummaryStatus} type="button">
                            Reset summary status
                          </button>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary filter chips"
                          title="Summary filter chips show the active provider execution package review scope used by the preview and local handoffs."
                        >
                          {providerExecutionPackageReviewActiveFilterLabels.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary count chips"
                          title="Summary count chips show visible, reviewed, unreviewed, stale, and note totals used by the copied Markdown summary."
                        >
                          {providerExecutionPackageCoverageSummaryCountChips.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary download status chip"
                          title="Download status is browser-only and updates after Download group summary creates the local Markdown file."
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryDownloadFilename
                              ? `Downloaded ${approvedProviderExecutionCoverageSummaryDownloadFilename}`
                              : "Download pending"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary copy status chip"
                          title="Copy status is browser-only and updates after Copy group summary succeeds locally."
                        >
                          <span>{approvedProviderExecutionCoverageSummaryCopied ? "Copied group summary" : "Copy pending"}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary filename copy status chip"
                          title="Filename copy status is browser-only and updates after Copy filename succeeds locally."
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryCopiedFilename
                              ? `Copied filename ${approvedProviderExecutionCoverageSummaryCopiedFilename}`
                              : "Filename copy pending"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary reset explanation chip"
                          title="Reset status affects browser-only summary copy, filename copy, reset-confirmation copy, copied-at, and download indicators only."
                        >
                          <span>
                            Reset clears browser-only summary copy, filename copy, reset-confirmation copy, copied-at, and
                            download status
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary reset confirmation chip"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationTitle}
                        >
                          <span>{providerExecutionPackageCoverageGroupSummaryResetConfirmation}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary reset confirmation copy status chip"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyStatusTitle}
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryCopiedResetConfirmation
                              ? `Copied reset confirmation ${approvedProviderExecutionCoverageSummaryCopiedResetConfirmation}`
                              : "Reset confirmation copy pending"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary reset confirmation copied-at chip"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationCopiedAtTitle}
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
                              ? `Reset confirmation copied at ${approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt}`
                              : "Reset confirmation copied-at pending"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary reset confirmation freshness chip"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationFreshnessTitle}
                        >
                          <span>{providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyFreshness}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary generated-at chip"
                          title="Generated-at is the provider review report timestamp used by the visible preview and local handoff actions."
                        >
                          <span>Generated {approvedProviderExecutionReviewReport.generatedAt}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary next download filename chip"
                          title="Next file is the Markdown filename used by Download group summary and Copy filename local handoffs."
                        >
                          <span>Next file {providerExecutionPackageCoverageGroupSummaryNextDownloadFilename}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary Markdown size chips"
                          title="Line and character counts are computed from the exact Markdown preview text used for copy and download."
                        >
                          {providerExecutionPackageCoverageGroupSummarySizeChips.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary dominant queue chip"
                          title="Dominant queue identifies the currently largest visible provider execution package coverage queue."
                        >
                          <span>{providerExecutionPackageCoverageDominantQueueChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary empty queue count chip"
                          title="Empty queue count shows how many visible provider execution package coverage queues have no packages under the active filters."
                        >
                          <span>{providerExecutionPackageCoverageEmptyQueueChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary review-needed chip"
                          title="Review-needed count shows visible provider execution packages that still have no matching review note."
                        >
                          <span>{providerExecutionPackageCoverageReviewNeededChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary stale priority chip"
                          title="Stale priority shows whether visible unreviewed provider execution packages exceed the active stale-day threshold."
                        >
                          <span>{providerExecutionPackageCoverageStalePriorityChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider execution package coverage summary local-only handoff chip"
                          title="Local handoff only means copy and download actions do not create a server archive or mutate provider review state."
                        >
                          <span>Local handoff only, not server archived</span>
                        </div>
                        <pre
                          className={styles.coverageGroupSummaryPreview}
                          aria-label="Provider execution package coverage group summary preview"
                        >
                          {providerExecutionPackageCoverageGroupSummary}
                        </pre>
                        <div
                          className={`${styles.coverageGroupQueues} ${
                            approvedProviderExecutionReviewQueueDensity === "compact" ? styles.coverageGroupQueuesCompact : ""
                          }`}
                          aria-label="Provider execution package coverage queue groups"
                          title="Grouped coverage queues show visible provider execution package review-state buckets under the active filters."
                        >
                          {approvedProviderExecutionReviewReport.coverage.length === 0 ? (
                            <p
                              className={styles.coverageQueueEmptyState}
                              title="Queue empty state appears when no provider execution packages match the active coverage filters."
                            >
                              No provider execution packages match the active coverage filters: {providerExecutionPackageReviewActiveFilterLabels.join(", ")}.
                            </p>
                          ) : null}
                          {providerExecutionPackageReviewCoverageGroups.map((group) => (
                            <section
                              key={group.key}
                              className={styles.coverageGroupQueue}
                              title={`${group.title} queue shows ${group.rows.length} visible provider execution package(s) for this review-state bucket.`}
                            >
                              <header>
                                <strong>{group.title}</strong>
                                <span
                                  title={`${group.title} count is ${group.rows.length} visible provider execution package(s) under the active filters.`}
                                >
                                  {group.rows.length} package(s)
                                </span>
                                <p>{group.description}</p>
                              </header>
                              <div
                                className={styles.reviewNotes}
                                aria-label={`${group.title} rows`}
                                title={`${group.title} rows show the first visible provider execution packages in this review-state bucket.`}
                              >
                                {group.rows.length ? group.rows.slice(0, 4).map((item) => (
                                  <article
                                    key={item.executionId}
                                    title={`${item.packageFilename} is in the ${providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]} queue for ${approvedSyncTargetLabels[item.target]}.`}
                                  >
                                    <strong title="Queue row status pairs review coverage state with the provider sync target.">
                                      {providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]} / {approvedSyncTargetLabels[item.target]}
                                    </strong>
                                    <p title="Package filename identifies the local provider execution package evidence file for this queue row.">
                                      {item.packageFilename}
                                    </p>
                                    <div
                                      className={styles.sourceChips}
                                      aria-label="Provider execution package coverage row chips"
                                      title="Coverage row chips summarize state, review-note count, target, and latest-review or stale-threshold details."
                                    >
                                      <span>State {providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]}</span>
                                      <span>{item.noteCount} note(s)</span>
                                      <span>Target {approvedSyncTargetLabels[item.target]}</span>
                                      <span
                                        title={
                                          item.latestReviewNoteAt
                                            ? "Latest-review chip shows the most recent review note date for this provider execution package."
                                            : "Stale-threshold chip shows the active stale-day threshold for unreviewed provider execution packages."
                                        }
                                      >
                                        {item.latestReviewNoteAt ? `Latest ${formatDate(item.latestReviewNoteAt)}` : `Stale threshold ${item.staleDays} day(s)`}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => setApprovedProviderExecutionDigestFilter(item.packageDigest)}
                                      title="Focus digest filters the provider execution package review surface to this package digest without mutating review state."
                                      type="button"
                                    >
                                      Focus digest {item.packageDigest.slice(0, 12)}
                                    </button>
                                  </article>
                                )) : (
                                  <p>No provider execution packages match this review group under {providerExecutionPackageReviewActiveFilterLabels.join(", ")}.</p>
                                )}
                              </div>
                            </section>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className={styles.syncHistory} aria-label="Approved WIKI provider execution package rows">
                      {visibleApprovedProviderExecutions.length ? visibleApprovedProviderExecutions.slice(0, 8).map((execution) => (
                        <article key={execution.id}>
                          <strong>{execution.status} / {approvedSyncTargetLabels[execution.target]}</strong>
                          <p>{formatDate(execution.createdAt)} / {execution.packageReview.filename}</p>
                          <span>{execution.artifactType}</span>
                          <span>{execution.packageReview.packageDigest.slice(0, 16)} package digest</span>
                          <span>{execution.packageReview.available ? "package available" : "package unavailable"}</span>
                          <span>{execution.packageReview.retentionLabel}</span>
                          <span>{execution.packageReview.immutable ? "immutable evidence" : "mutable evidence"}</span>
                          <span>{execution.packageReview.localDownloadTracked ? "local download tracked" : "local download separate"}</span>
                          <span>{execution.packageReview.reviewNoteCount} review note(s)</span>
                          <span>{execution.packageReview.latestReviewNoteAt ? `latest ${formatDate(execution.packageReview.latestReviewNoteAt)}` : "unreviewed package"}</span>
                          <button onClick={() => setApprovedProviderExecutionDigestFilter(execution.packageReview.packageDigest)} type="button">
                            Focus digest
                          </button>
                          <button onClick={() => setApprovedProviderExecution(execution)} type="button">
                            Review package
                          </button>
                        </article>
                      )) : <p className={styles.empty}>No provider execution packages match the current filters.</p>}
                    </div>
                  </section>
                </section>
              </section>
            </section>

            <section className={styles.exportPanel} aria-label="Knowledge operational validation">
              <div className={styles.exportHeader}>
                <div>
                  <p>Operational validation</p>
                  <h4>Chunks, sync worker, and capabilities</h4>
                </div>
                <div className={styles.exportActions}>
                  <button onClick={refreshFileChunkDebug} type="button">
                    Refresh chunks
                  </button>
                  <button onClick={refreshKnowledgeSyncWorker} type="button">
                    Refresh sync worker
                  </button>
                </div>
              </div>
              <div className={styles.reviewNoteForm} aria-label="File-analysis chunk retrieval debug query">
                <input
                  aria-label="Chunk debug query"
                  onChange={(event) => setFileChunkDebugQuery(event.target.value)}
                  placeholder="FTS query for chunk retrieval debug"
                  value={fileChunkDebugQuery}
                />
                <button onClick={refreshFileChunkDebug} type="button">
                  Run query
                </button>
              </div>
              <div className={styles.sourceChips} aria-label="Knowledge capability migration state">
                <span>{knowledgeCapabilityReport?.allowed ? "Knowledge admin allowed" : "Knowledge admin blocked"}</span>
                <span>Mapping {knowledgeCapabilityReport?.mapping ?? "unknown"}</span>
                <span>Capabilities {knowledgeCapabilityReport?.capabilities.length ?? 0}</span>
                <span>
                  Capability table {knowledgeCapabilityReport?.migration.profileCapabilityTableReady ? "ready" : "pending"}
                </span>
              </div>
              <div className={styles.sourceChips} aria-label="File-analysis chunk coverage summary">
                <span>{fileChunkDebug?.database.available ? "Chunk DB available" : "Chunk DB unavailable"}</span>
                <span>Total {fileChunkDebug?.database.totalChunks ?? 0}</span>
                <span>Embedded {fileChunkDebug?.database.embeddedChunks ?? 0}</span>
                <span>Missing {fileChunkDebug?.database.missingEmbeddings ?? 0}</span>
                <span>Retrieval hits {fileChunkDebug?.retrieval.length ?? 0}</span>
              </div>
              {fileChunkDebug?.blockers.length ? (
                <div className={styles.syncWarnings} aria-label="File-analysis chunk debug blockers">
                  {fileChunkDebug.blockers.map((blocker) => (
                    <span key={blocker}>{blocker}</span>
                  ))}
                </div>
              ) : null}
              <div className={styles.syncHistory} aria-label="File-analysis chunk coverage rows">
                {fileChunkDebug?.coverage.length ? fileChunkDebug.coverage.map((group) => (
                  <article key={`${group.sourceType}:${group.verificationState}`}>
                    <strong>{group.sourceType} / {group.verificationState}</strong>
                    <span>Total {group.totalChunks}</span>
                    <span>Embedded {group.embeddedChunks}</span>
                    <span>Missing {group.missingEmbeddings}</span>
                  </article>
                )) : <p className={styles.empty}>No chunk coverage rows are available.</p>}
              </div>
              <div className={styles.syncHistory} aria-label="File-analysis retrieval debug hits">
                {fileChunkDebug?.retrieval.length ? fileChunkDebug.retrieval.slice(0, 5).map((hit) => (
                  <article key={hit.id}>
                    <strong>{hit.fileName} / chunk {hit.chunkIndex}</strong>
                    <span>FTS {hit.ftsRank.toFixed(4)}</span>
                    <span>{hit.vectorReady ? "Vector ready" : "No embedding"}</span>
                    <p>{hit.preview}</p>
                  </article>
                )) : <p className={styles.empty}>No retrieval debug hits for the active query.</p>}
              </div>
              <div className={styles.sourceChips} aria-label="Approved WIKI sync worker summary">
                <span>Pending {knowledgeSyncWorker?.queue.pendingProviderReadyAudits ?? 0}</span>
                <span>Previews {knowledgeSyncWorker?.queue.pendingPreviewCount ?? 0}</span>
                <span>Executions {knowledgeSyncWorker?.queue.executionCount ?? 0}</span>
                <span>{knowledgeSyncWorker?.dryRun ? "Dry-run/preflight only" : "Execution enabled"}</span>
              </div>
              <div className={styles.syncHistory} aria-label="Approved WIKI sync worker next actions">
                {knowledgeSyncWorker?.nextActions.length ? knowledgeSyncWorker.nextActions.slice(0, 5).map((action) => (
                  <article key={action.auditId}>
                    <strong>{action.action} / {approvedSyncTargetLabels[action.target]}</strong>
                    <p>{action.packageName}</p>
                    <span>{action.blockers.length} blocker(s)</span>
                  </article>
                )) : <p className={styles.empty}>No provider-ready sync audits are queued.</p>}
              </div>
            </section>

            <section className={styles.exportPanel} aria-label="Regulation legal-source governance refresh">
              <div className={styles.exportHeader}>
                <div>
                  <p>Legal source governance</p>
                  <h4>Offline refresh review</h4>
                </div>
                <div className={styles.editorTools}>
                  <button disabled={regulationGovernanceLoading} onClick={refreshRegulationGovernance} type="button">
                    Refresh governance
                  </button>
                  <button disabled={!regulationGovernance} onClick={copyRegulationGovernanceReport} type="button">
                    Copy governance report
                  </button>
                </div>
              </div>
              {regulationGovernance ? (
                <>
                  <div className={styles.sourceChips} aria-label="Regulation governance summary">
                    <span>Package {regulationGovernance.packageId}</span>
                    <span>As of {regulationGovernance.asOf}</span>
                    <span>Sources {regulationGovernance.sourceCount}</span>
                    <span>Documents {regulationGovernance.documentCount}</span>
                    <span>{regulationGovernance.packageDigest.slice(0, 16)} package digest</span>
                    <span>Ready {regulationGovernanceReadyCount}/{regulationGovernanceChecks.length}</span>
                    <span>Source reviews {regulationGovernance.sourceReviewSummary.count}</span>
                    <span>{regulationGovernance.sourceReviewSummary.reviewedSourceCount}/{regulationGovernance.sourceCount} sources reviewed</span>
                    <span>{regulationGovernance.sourceReviewSummary.latestReviewedAt ? `Latest source review ${formatDate(regulationGovernance.sourceReviewSummary.latestReviewedAt)}` : "No source review"}</span>
                    <span>Acknowledgements {regulationGovernance.acknowledgementSummary.count}</span>
                    <span>{regulationGovernance.acknowledgementSummary.latestAcknowledgedAt ? `Latest ${formatDate(regulationGovernance.acknowledgementSummary.latestAcknowledgedAt)}` : "No acknowledgement"}</span>
                    <span>{regulationGovernance.productionImport.enabled ? "Production import enabled" : "Production import blocked"}</span>
                    <span>{regulationGovernance.productionImportPreflight.status === "ready" ? "Production preflight ready" : "Production preflight blocked"}</span>
                  </div>
                  <div className={styles.syncWarnings} aria-label="Regulation production import preflight">
                    {regulationGovernance.productionImportPreflight.blockers.length ? regulationGovernance.productionImportPreflight.blockers.map((blocker) => (
                      <span key={blocker}>Preflight blocker: {blocker}</span>
                    )) : <span>Production import preflight has no blockers.</span>}
                    {regulationGovernance.productionImportPreflight.warnings.map((warning) => (
                      <span key={warning}>Preflight warning: {warning}</span>
                    ))}
                  </div>
                  <div className={styles.reviewNoteForm} aria-label="Regulation source-review coverage filters">
                    <label>
                      Source-review coverage
                      <select
                        onChange={(event) => setRegulationSourceReviewCoveragePreset(event.target.value as RegulationSourceReviewCoveragePreset)}
                        value={regulationSourceReviewCoveragePreset}
                      >
                        {(Object.keys(regulationSourceReviewCoverageLabels) as RegulationSourceReviewCoveragePreset[]).map((value) => (
                          <option key={value} value={value}>
                            {regulationSourceReviewCoverageLabels[value]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Stale days
                      <input
                        min={0}
                        onChange={(event) => setRegulationSourceReviewStaleDays(Math.max(0, Number.parseInt(event.target.value, 10) || 0))}
                        type="number"
                        value={regulationSourceReviewStaleDays}
                      />
                    </label>
                    <a
                      download
                      href={`/api/admin/knowledge/regulation-governance/source-review-coverage/export?${regulationSourceReviewCoverageQuery}`}
                    >
                      Download source-review CSV
                    </a>
                  </div>
                  <div className={styles.sourceChips} aria-label="Regulation source-review coverage summary">
                    <span>Reviewed {regulationSourceReviewCoverage?.summary.reviewedSourceCount ?? 0}</span>
                    <span>Unreviewed {regulationSourceReviewCoverage?.summary.unreviewedSourceCount ?? 0}</span>
                    <span>Stale {regulationSourceReviewCoverage?.summary.staleSourceCount ?? 0}</span>
                    <span>Blocked {regulationSourceReviewCoverage?.summary.blockedSourceCount ?? 0}</span>
                    <span>Follow-up {regulationSourceReviewCoverage?.summary.followUpSourceCount ?? 0}</span>
                    <span>{regulationSourceReviewCoverage?.packageDigest.slice(0, 16) ?? "No"} coverage digest</span>
                  </div>
                  <section className={styles.guardrails} aria-label="Regulation governance checks">
                    <h4>Governance checks</h4>
                    <div>
                      {regulationGovernanceChecks.map((item) => (
                        <article
                          className={item.ready ? styles.guardrailReady : styles.guardrailWarning}
                          key={item.label}
                        >
                          <strong>{item.label}</strong>
                          <p>{item.detail}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                  {(regulationGovernance.errors.length || regulationGovernance.warnings.length) ? (
                    <div className={styles.syncWarnings} aria-label="Regulation governance warnings">
                      {regulationGovernance.errors.map((error) => (
                        <span key={`error-${error}`}>Error: {error}</span>
                      ))}
                      {regulationGovernance.warnings.map((warning) => (
                        <span key={`warning-${warning}`}>Warning: {warning}</span>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.syncWarnings} aria-label="Regulation governance warnings">
                      <span>No blocking governance errors in the offline manifest.</span>
                    </div>
                  )}
                  <div className={styles.reviewNoteForm} aria-label="Regulation governance acknowledgement form">
                    <label>
                      Reviewer acknowledgement
                      <textarea
                        aria-label="Regulation governance acknowledgement note"
                        onChange={(event) => setRegulationGovernanceAcknowledgementNote(event.target.value)}
                        placeholder="Record reviewer context for this governance package and current validation snapshot"
                        value={regulationGovernanceAcknowledgementNote}
                      />
                    </label>
                    <button
                      disabled={regulationGovernanceAcknowledgementSaving || !regulationGovernanceAcknowledgementNote.trim()}
                      onClick={saveRegulationGovernanceAcknowledgement}
                      type="button"
                    >
                      {regulationGovernanceAcknowledgementSaving ? "Saving..." : "Record acknowledgement"}
                    </button>
                  </div>
                  <div className={styles.reviewNotes} aria-label="Regulation governance acknowledgement records">
                    {regulationGovernance.acknowledgements.length ? regulationGovernance.acknowledgements.map((acknowledgement) => (
                      <article key={acknowledgement.id}>
                        <strong>{formatDate(acknowledgement.createdAt)} / {acknowledgement.reviewerId ?? "unknown reviewer"}</strong>
                        <p>{acknowledgement.note}</p>
                        <span>{acknowledgement.packageDigest.slice(0, 16)} package digest</span>
                        <span>As of {acknowledgement.asOf}</span>
                        <span>{acknowledgement.sourceCount} source(s)</span>
                        <span>{acknowledgement.documentCount} document(s)</span>
                        <span>{acknowledgement.statusCounts.overdue} overdue</span>
                        <span>{acknowledgement.productionImportEnabled ? "production import enabled" : "production import blocked"}</span>
                      </article>
                    )) : <p className={styles.empty}>No governance acknowledgements have been recorded.</p>}
                  </div>
                  <div className={styles.syncHistory} aria-label="Regulation source-review coverage rows">
                    {regulationSourceReviewCoverage?.sources.length ? regulationSourceReviewCoverage.sources.map((source) => (
                      <article key={source.sourceId}>
                        <strong>{source.sourceName}</strong>
                        <p>{source.officialUrl}</p>
                        <span>{regulationSourceReviewCoverageLabels[source.coverageStatus]}</span>
                        <span>{source.reviewCount} review(s)</span>
                        <span>{source.latestReviewerId ?? "no reviewer"}</span>
                        <span>{source.latestReviewedAt ? `Latest ${formatDate(source.latestReviewedAt)}` : "No latest review"}</span>
                        <span>{source.packageDigest.slice(0, 16)} package digest</span>
                      </article>
                    )) : <p className={styles.empty}>No source-review coverage rows match the active filters.</p>}
                  </div>
                  <div className={styles.syncHistory} aria-label="Regulation governance source refresh rows">
                    {regulationGovernance.sources.map((source) => (
                      <article key={source.sourceId}>
                        <strong>{source.sourceName}</strong>
                        <p>{source.publisher} / {source.sourceId}</p>
                        <span>{regulationGovernanceStatusLabels[source.refreshStatus]}</span>
                        <span>Refresh due {source.refreshDueAt || "missing"}</span>
                        <span>{source.daysUntilDue === null ? "Due date invalid" : `${source.daysUntilDue} day(s) left`}</span>
                        <span>{source.documentCount} document(s)</span>
                        <span>{source.adminReviewRequiredCount} admin review required</span>
                        <span>{source.verificationChecklist.length} checklist item(s)</span>
                        <span>{source.reviewSummary.count} source review(s)</span>
                        <span>{source.reviewSummary.latestReviewState ? regulationGovernanceSourceReviewStateLabels[source.reviewSummary.latestReviewState] : "Unreviewed"}</span>
                        <div className={styles.sourceReviewForm}>
                          <label>
                            Review state
                            <select
                              onChange={(event) => {
                                setRegulationGovernanceSourceReviewStates((current) => ({
                                  ...current,
                                  [source.sourceId]: event.target.value as RegulationGovernanceSourceReviewState,
                                }));
                              }}
                              value={regulationGovernanceSourceReviewStates[source.sourceId] ?? "reviewed"}
                            >
                              {regulationGovernanceSourceReviewStateOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Source review note
                            <textarea
                              onChange={(event) => {
                                setRegulationGovernanceSourceReviewNotes((current) => ({
                                  ...current,
                                  [source.sourceId]: event.target.value,
                                }));
                              }}
                              placeholder="Record source-specific official URL, refresh, checklist, or follow-up review context"
                              value={regulationGovernanceSourceReviewNotes[source.sourceId] ?? ""}
                            />
                          </label>
                          <button
                            disabled={
                              regulationGovernanceSourceReviewSaving === source.sourceId ||
                              !regulationGovernanceSourceReviewNotes[source.sourceId]?.trim()
                            }
                            onClick={() => void saveRegulationGovernanceSourceReview(source.sourceId)}
                            type="button"
                          >
                            {regulationGovernanceSourceReviewSaving === source.sourceId ? "Saving..." : "Record source review"}
                          </button>
                        </div>
                        <div className={styles.sourceReviewNotes} aria-label={`${source.sourceName} source review records`}>
                          {source.reviews.length ? source.reviews.slice(0, 2).map((review) => (
                            <article key={review.id}>
                              <strong>
                                {regulationGovernanceSourceReviewStateLabels[review.reviewState]} / {formatDate(review.createdAt)} / {review.reviewerId ?? "unknown reviewer"}
                              </strong>
                              <p>{review.note}</p>
                            </article>
                          )) : <p className={styles.empty}>No source-specific review has been recorded.</p>}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className={styles.empty}>
                  {regulationGovernanceLoading ? "Loading regulation governance..." : "Regulation governance report is not loaded."}
                </p>
              )}
            </section>

            <div className={styles.approvedGrid}>
              <div className={styles.approvedList} aria-label="Approved WIKI visible items">
                {visibleApprovedItems.length ? visibleApprovedItems.map((item) => (
                  <button
                    className={selectedApprovedItem?.id === item.id ? styles.candidateActive : styles.candidate}
                    key={item.id}
                    onClick={() => setSelectedApprovedId(item.id)}
                    type="button"
                  >
                    <span>{scopeLabels[item.scope]}</span>
                    <strong>{item.title}</strong>
                    <small>{formatDate(item.approvedAt)} / {item.sourceReferences.length} source refs</small>
                    <span className={styles.candidateRiskChips}>
                      <span>Tags {item.tags.length}</span>
                      <span>Record {item.sourceRecordId.slice(0, 8)}</span>
                      <span>Task {item.sourceTaskId.slice(0, 8)}</span>
                    </span>
                  </button>
                )) : (
                  <p className={styles.empty}>
                    {approvedItemsLoaded
                      ? "No approved WIKI items match the current filters."
                      : "Approved WIKI items are loading."}
                  </p>
                )}
              </div>

              <div className={styles.approvedDetail}>
                {selectedApprovedItem ? (
                  <>
                    <div>
                      <p>Selected approved item</p>
                      <h4>{selectedApprovedItem.title}</h4>
                    </div>
                    <p>{selectedApprovedItem.summary}</p>
                    <dl className={styles.meta}>
                      <div>
                        <dt>Scope</dt>
                        <dd>{scopeLabels[selectedApprovedItem.scope]}</dd>
                      </div>
                      <div>
                        <dt>Approved</dt>
                        <dd>{formatDate(selectedApprovedItem.approvedAt)} by {selectedApprovedItem.approvedBy}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{selectedApprovedItem.sourceRecordId}</dd>
                      </div>
                      <div>
                        <dt>Task</dt>
                        <dd>{selectedApprovedItem.sourceTaskId}</dd>
                      </div>
                    </dl>
                    <div className={styles.sourceChips} aria-label="Approved WIKI selected tags">
                      {selectedApprovedItem.tags.length ? selectedApprovedItem.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      )) : <span>No tags</span>}
                    </div>
                    <section className={styles.guardrails} aria-label="Approved WIKI quality checks">
                      <h4>Approved item quality</h4>
                      <div>
                        {approvedQualityChecks.map((item) => (
                          <article
                            className={item.ready ? styles.guardrailReady : styles.guardrailWarning}
                            key={item.label}
                          >
                            <strong>{item.label}</strong>
                            <p>{item.detail}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                    <div className={styles.sourceChips} aria-label="Approved WIKI quality summary">
                      <span>Quality {approvedQualityReadyCount}/{approvedQualityChecks.length}</span>
                      <span>Sources {selectedApprovedItem.sourceReferences.length}</span>
                      <span>Body {selectedApprovedItem.bodyMarkdown.trim().length} chars</span>
                    </div>
                    <section
                      className={[
                        styles.markdownPreview,
                        approvedPreviewCompact ? styles.markdownPreviewCompact : "",
                      ].filter(Boolean).join(" ")}
                      aria-label="Approved WIKI Markdown preview"
                    >
                      <div className={styles.markdownPreviewHeader}>
                        <h4>Approved Markdown</h4>
                        <button onClick={() => setApprovedPreviewCompact((current) => !current)} type="button">
                          {approvedPreviewCompact ? "Expanded preview" : "Compact preview"}
                        </button>
                      </div>
                      <pre>{selectedApprovedItem.bodyMarkdown.trim() || "No approved Markdown body."}</pre>
                    </section>
                    <section className={styles.guardrails} aria-label="Approved WIKI source references">
                      <h4>Source references</h4>
                      <div>
                        {selectedApprovedItem.sourceReferences.length ? selectedApprovedItem.sourceReferences.map((reference) => (
                          <article className={styles.guardrailReady} key={reference.id}>
                            <strong>{reference.kind} / priority {reference.priority}: {reference.title}</strong>
                            <p>{reference.sourceUrl ?? "No source URL"} - {reference.excerpt}</p>
                          </article>
                        )) : (
                          <article className={styles.guardrailWarning}>
                            <strong>No source references</strong>
                            <p>This approved item can still be read, but retrieval handoff should flag missing source references.</p>
                          </article>
                        )}
                      </div>
                    </section>
                  </>
                ) : (
                  <p className={styles.empty}>Approve a Knowledge candidate to populate this readback surface.</p>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
      <p className={styles.status}>{status}</p>
    </section>
  );
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload));
  }
  return payload.data as T;
}

async function writeJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readError(payload));
  }
  return payload.data as T;
}

async function readTextAttachment(url: string): Promise<{ text: string; filename: string; digest: string }> {
  const response = await fetch(url, { credentials: "same-origin" });
  const text = await response.text();
  if (!response.ok) {
    let payload: unknown = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    throw new Error(readError(payload));
  }
  return {
    text,
    filename: readAttachmentFilename(response.headers.get("content-disposition")) ?? "provider-execution-package.json",
    digest: response.headers.get("x-provider-execution-package-digest") ?? "unknown",
  };
}

function readAttachmentFilename(value: string | null) {
  const match = value?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? null;
}

function readError(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: { message?: string } }).error;
    if (error?.message) {
      return error.message;
    }
  }
  return "요청을 처리하지 못했습니다.";
}

function splitTags(value: string) {
  return value.split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12);
}

function readDuplicateTags(tags: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tag of tags) {
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      duplicates.add(tag);
    }
    seen.add(key);
  }
  return Array.from(duplicates);
}

function readScopeReview(scope: Scope, originalScope: Scope | null) {
  const changed = Boolean(originalScope && originalScope !== scope);
  if (scope === "organization") {
    return {
      label: "Organization-wide scope",
      detail: "This draft will be visible at organization scope. Confirm it is reusable beyond one project.",
      changed,
    };
  }
  if (scope === "admin_only") {
    return {
      label: "Admin-only scope",
      detail: "This draft remains limited to admins until it is ready for broader publication.",
      changed,
    };
  }
  return {
    label: "Restricted scope",
    detail: "This draft is limited to project or project-member scope.",
    changed,
  };
}

function readMarkdownOutline(markdown: string): MarkdownHeading[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line.trim());
    if (!match) {
      return [];
    }

    return [{
      level: match[1].length,
      line: index + 1,
      text: match[2].trim(),
    }];
  }).slice(0, 12);
}

function readMarkdownStructureSummary(markdown: string): MarkdownStructureSummary {
  const lines = markdown.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const headings = lines.filter((line) => /^#{1,6}\s+/.test(line)).length;
  const listItems = lines.filter((line) => /^([-*+]|\d+\.)\s+/.test(line)).length;
  const paragraphs = lines.filter((line) => !/^#{1,6}\s+/.test(line) && !/^([-*+]|\d+\.)\s+/.test(line)).length;
  return {
    headings,
    paragraphs,
    listItems,
    lines: lines.length,
  };
}

function readMarkdownWikiLinks(markdown: string): MarkdownWikiLink[] {
  return markdown.split(/\r?\n/).flatMap((line, index) => {
    const links: MarkdownWikiLink[] = [];
    for (const match of line.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const raw = match[1].trim();
      if (!raw) {
        continue;
      }
      const [target, label] = raw.split("|").map((item) => item.trim());
      links.push({
        line: index + 1,
        target,
        label: label || target,
      });
    }
    return links;
  }).slice(0, 12);
}

function createDraftFromDetail(detail: CandidateDetail) {
  return {
    title: detail.wikiDraft.title,
    summary: detail.wikiDraft.summary,
    bodyMarkdown: detail.wikiDraft.bodyMarkdown,
    tagsText: detail.wikiDraft.tags.join(", "),
    scope: detail.wikiDraft.scope,
    rejectionReason: detail.review?.rejectionReason ?? "",
  };
}

function createSourceHandoff(
  detail: CandidateDetail,
  draft: ReturnType<typeof createDraftFromDetail>,
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "Knowledge candidate handoff",
    `Record: ${detail.id}`,
    `Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `Project: ${detail.projectName}`,
    `State: ${detail.state}`,
    `Review: ${detail.review?.status ?? "pending"}`,
    `Scope: ${draft.scope}`,
    `Confidence: ${detail.confidenceScore}%`,
    `Evidence: ${detail.evidence.length}`,
    `Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
  ].join("\n");
}

function createApprovalChecklist(
  detail: CandidateDetail,
  readiness: Array<{ label: string; ready: boolean }>,
  guardrails: ApprovalGuardrail[],
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "Knowledge approval checklist",
    `Record: ${detail.id}`,
    `Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `State: ${detail.state}`,
    `Confidence: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `Evidence: ${detail.evidence.length}`,
    `Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
    "",
    "Readiness",
    ...readiness.map((item) => `- ${item.ready ? "Ready" : "Missing"} ${item.label}`),
    "",
    "Guardrails",
    ...guardrails.map((item) => `- ${item.tone}: ${item.label} - ${item.detail}`),
  ].join("\n");
}

function createApprovalDecisionNote(
  detail: CandidateDetail,
  draft: ReturnType<typeof createDraftFromDetail>,
  readiness: Array<{ label: string; ready: boolean }>,
  guardrails: ApprovalGuardrail[],
  riskGroups: ApprovalRiskGroup[],
  evidenceKindCounts: Array<[string, number]>,
  reviewStatus: ApprovalGuardrail,
) {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  const readyItems = guardrails.filter((item) => item.tone === "ready");
  const decisionLabel = warnings.length ? "Blocker review" : "Approve-ready review";
  const decisionGuidance = warnings.length
    ? "Resolve or explicitly accept warning items before final approval."
    : "Confirm final audience and evidence policy before approving the WIKI item.";

  return [
    "# Knowledge approval decision note",
    `- Candidate: ${detail.title} (${detail.id})`,
    `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- Project: ${detail.projectName}`,
    `- Proposed decision context: ${decisionLabel}`,
    `- Current candidate state: ${detail.state}`,
    `- Review status: ${reviewStatus.label}`,
    `- Publication scope: ${scopeLabels[draft.scope]}`,
    `- Rejection reason draft: ${draft.rejectionReason.trim() || "none"}`,
    `- Confidence: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `- Readiness: ${readiness.filter((item) => item.ready).length}/${readiness.length}`,
    `- Warning groups: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    `- Evidence: ${detail.evidence.length}`,
    `- Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
    "",
    "## Decision guidance",
    `- ${decisionGuidance}`,
    "",
    "## Blocking warnings",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- No blocking warnings"]),
    "",
    "## Ready checks",
    ...(readyItems.length
      ? readyItems.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- No ready checks recorded"]),
    "",
    "## Risk groups",
    ...riskGroups.map((group) => `- ${group.label}: ${group.warningCount} warnings, ${group.readyCount} ready notes`),
  ].join("\n");
}

function buildRejectionReasonPresets(guardrails: ApprovalGuardrail[]): RejectionReasonPreset[] {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  if (!warnings.length) {
    return [
      {
        label: "Manual review reason",
        reason: "No active approval guardrail blockers are present. Add a manual rejection reason before rejecting.",
      },
    ];
  }

  return warnings.slice(0, 5).map((item) => ({
    label: item.label,
    reason: `Reject until resolved: ${item.label}. ${item.detail}`,
  }));
}

function createApprovalBlockerHandoff(
  detail: CandidateDetail,
  guardrails: ApprovalGuardrail[],
  riskGroups: ApprovalRiskGroup[],
) {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  return [
    "# Knowledge approval blockers",
    `- Candidate: ${detail.title} (${detail.id})`,
    `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- Warning count: ${warnings.length}`,
    `- Warning groups: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    "",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- No active approval blockers"]),
  ].join("\n");
}

function createApprovalPackage(
  detail: CandidateDetail,
  draft: ReturnType<typeof createDraftFromDetail>,
  guardrails: ApprovalGuardrail[],
  riskGroups: ApprovalRiskGroup[],
  readiness: Array<{ label: string; ready: boolean }>,
  evidenceKindCounts: Array<[string, number]>,
  reviewStatus: ApprovalGuardrail,
) {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  return [
    "# Knowledge approval package",
    `- Candidate: ${detail.title} (${detail.id})`,
    `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- Project: ${detail.projectName}`,
    `- Review status: ${reviewStatus.label}`,
    `- Confidence: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `- Readiness: ${readiness.filter((item) => item.ready).length}/${readiness.length}`,
    `- Warning groups: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    `- Evidence kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}`,
    "",
    "## Draft",
    `- Title: ${draft.title}`,
    `- Summary: ${draft.summary}`,
    `- Scope: ${scopeLabels[draft.scope]}`,
    `- Tags: ${draft.tagsText || "none"}`,
    "",
    draft.bodyMarkdown.trim() || "No Markdown body.",
    "",
    "## Decision",
    warnings.length
      ? "- Decision context: Blocker review"
      : "- Decision context: Approve-ready review",
    `- Rejection reason draft: ${draft.rejectionReason.trim() || "none"}`,
    "",
    "## Blockers",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- No active approval blockers"]),
    "",
    "## Evidence",
    ...(detail.evidence.length
      ? detail.evidence.map((item) => `- ${item.kind} / priority ${item.priority}: ${item.title}${item.sourceUrl ? ` (${item.sourceUrl})` : ""}`)
      : ["- No evidence rows"]),
  ].join("\n");
}

function buildApprovalPackageQuality(
  detail: CandidateDetail | null,
  draft: ReturnType<typeof createDraftFromDetail>,
  guardrails: ApprovalGuardrail[],
  riskGroups: ApprovalRiskGroup[],
  readiness: Array<{ label: string; ready: boolean }>,
  evidenceKindCounts: Array<[string, number]>,
  evidenceSourceCoverage: { sourced: number; unsourced: number; total: number },
  reviewStatus: ApprovalGuardrail,
): ReviewChecklistItem[] {
  if (!detail) {
    return [
      {
        label: "Candidate loaded",
        detail: "Select a candidate before building an approval package.",
        ready: false,
      },
    ];
  }

  const draftFieldReadiness = readiness.filter((item) => item.label !== "Evidence");
  const missingDraftFields = draftFieldReadiness.filter((item) => !item.ready).map((item) => item.label);
  const warningCount = guardrails.filter((item) => item.tone === "warning").length;

  return [
    {
      label: "Draft section",
      detail: missingDraftFields.length
        ? `Missing draft fields before handoff: ${missingDraftFields.join(", ")}.`
        : `Draft section includes title, summary, body, scope, and tags (${draft.tagsText || "none"}).`,
      ready: !missingDraftFields.length,
    },
    {
      label: "Decision section",
      detail: reviewStatus.tone === "ready"
        ? `${reviewStatus.label}: ${reviewStatus.detail}`
        : `${reviewStatus.label}: ${reviewStatus.detail} Capture the decision path before final approval.`,
      ready: reviewStatus.tone === "ready",
    },
    {
      label: "Blocker section",
      detail: warningCount
        ? `${warningCount} blocker warnings are included for explicit reviewer handling.`
        : "No active blockers; the package records a clear blocker state.",
      ready: Boolean(guardrails.length && riskGroups.length),
    },
    {
      label: "Evidence section",
      detail: detail.evidence.length
        ? `${detail.evidence.length} evidence rows included; kinds: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "none"}.`
        : "No evidence rows are available for this package.",
      ready: detail.evidence.length > 0,
    },
    {
      label: "Source coverage",
      detail: evidenceSourceCoverage.unsourced
        ? `${evidenceSourceCoverage.unsourced}/${evidenceSourceCoverage.total} evidence rows have no source URL. Confirm whether the excerpt is sufficient.`
        : `All ${evidenceSourceCoverage.total} evidence rows include source URLs.`,
      ready: evidenceSourceCoverage.total > 0 && evidenceSourceCoverage.unsourced === 0,
    },
    {
      label: "Risk group coverage",
      detail: `${riskGroups.length} approval risk groups are represented in the package review.`,
      ready: riskGroups.length >= 5,
    },
  ];
}

function createApprovalPackageQualityReport(
  detail: CandidateDetail,
  quality: ReviewChecklistItem[],
  status: ApprovalGuardrail,
) {
  const readyCount = quality.filter((item) => item.ready).length;
  return [
    "# Knowledge approval package quality",
    `- Candidate: ${detail.title} (${detail.id})`,
    `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- Package status: ${status.label}`,
    `- Ready checks: ${readyCount}/${quality.length}`,
    `- Missing checks: ${quality.length - readyCount}`,
    "",
    "## Quality checks",
    ...quality.map((item) => `- ${item.ready ? "Ready" : "Review"}: ${item.label} - ${item.detail}`),
  ].join("\n");
}

function buildFinalReviewChecklist(
  detail: CandidateDetail | null,
  packageStatus: ApprovalGuardrail,
  warningCount: number,
  warningGroupCount: number,
  rejectionReason: string,
  nextAction: string,
): ReviewChecklistItem[] {
  const reason = rejectionReason.trim();
  return [
    {
      label: "Candidate context",
      detail: detail
        ? `${detail.taskIssueId} / ${detail.projectName} is loaded for final review.`
        : "No candidate is loaded.",
      ready: Boolean(detail),
    },
    {
      label: "Package quality",
      detail: packageStatus.detail,
      ready: packageStatus.tone === "ready",
    },
    {
      label: "Blocker decision path",
      detail: warningCount
        ? `${warningCount} warnings across ${warningGroupCount} groups. ${reason ? "Rejection reason is drafted." : "Resolve warnings or draft a rejection reason."}`
        : "No active blocker warnings remain.",
      ready: warningCount === 0 || Boolean(reason),
    },
    {
      label: "Evidence handoff",
      detail: detail?.evidence.length
        ? `${detail.evidence.length} evidence rows are available for final handoff.`
        : "Evidence is missing from the final handoff.",
      ready: Boolean(detail?.evidence.length),
    },
    {
      label: "Next action",
      detail: nextAction,
      ready: true,
    },
  ];
}

function createFinalReviewCloseout(
  detail: CandidateDetail,
  packageQuality: ReviewChecklistItem[],
  packageStatus: ApprovalGuardrail,
  finalChecklist: ReviewChecklistItem[],
  finalStatus: ApprovalGuardrail,
  nextAction: string,
) {
  const packageReadyCount = packageQuality.filter((item) => item.ready).length;
  const finalReadyCount = finalChecklist.filter((item) => item.ready).length;
  return [
    "# Knowledge final review closeout",
    `- Candidate: ${detail.title} (${detail.id})`,
    `- Task: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- Project: ${detail.projectName}`,
    `- Package quality: ${packageStatus.label} (${packageReadyCount}/${packageQuality.length})`,
    `- Final closeout: ${finalStatus.label} (${finalReadyCount}/${finalChecklist.length})`,
    `- Next action: ${nextAction}`,
    "",
    "## Package quality checks",
    ...packageQuality.map((item) => `- ${item.ready ? "Ready" : "Review"}: ${item.label} - ${item.detail}`),
    "",
    "## Final checklist",
    ...finalChecklist.map((item) => `- ${item.ready ? "Ready" : "Review"}: ${item.label} - ${item.detail}`),
  ].join("\n");
}

function buildApprovedItemQuality(item: ApprovedKnowledgeItem): ReviewChecklistItem[] {
  return [
    {
      label: "Metadata",
      detail: item.title && item.summary
        ? "Title and summary are available for readback."
        : "Title or summary is missing from the approved item.",
      ready: Boolean(item.title && item.summary),
    },
    {
      label: "Markdown body",
      detail: item.bodyMarkdown.trim()
        ? `${item.bodyMarkdown.trim().length} Markdown characters are available.`
        : "Approved Markdown body is empty.",
      ready: Boolean(item.bodyMarkdown.trim()),
    },
    {
      label: "Tags",
      detail: item.tags.length
        ? `${item.tags.length} tags are available for search and retrieval grouping.`
        : "No tags are available for this approved item.",
      ready: item.tags.length > 0,
    },
    {
      label: "Publication scope",
      detail: `Approved publication scope is ${scopeLabels[item.scope]}.`,
      ready: Boolean(item.scope),
    },
    {
      label: "Source lineage",
      detail: item.sourceRecordId && item.sourceTaskId
        ? `Source record ${item.sourceRecordId} and task ${item.sourceTaskId} are linked.`
        : "Source record or source task id is missing.",
      ready: Boolean(item.sourceRecordId && item.sourceTaskId),
    },
    {
      label: "Source references",
      detail: item.sourceReferences.length
        ? `${item.sourceReferences.length} source reference rows are attached.`
        : "No source references are attached; retrieval handoff should flag this item.",
      ready: item.sourceReferences.length > 0,
    },
  ];
}

function createApprovedItemHandoff(item: ApprovedKnowledgeItem, quality: ReviewChecklistItem[]) {
  const readyCount = quality.filter((check) => check.ready).length;
  return [
    "# Approved WIKI item handoff",
    `- Item: ${item.title} (${item.id})`,
    `- Scope: ${scopeLabels[item.scope]}`,
    `- Approved: ${item.approvedAt} by ${item.approvedBy}`,
    `- Source record: ${item.sourceRecordId}`,
    `- Source task: ${item.sourceTaskId}`,
    `- Source project: ${item.sourceProjectId}`,
    `- Tags: ${item.tags.join(", ") || "none"}`,
    `- Source references: ${item.sourceReferences.length}`,
    `- Quality: ${readyCount}/${quality.length}`,
    "",
    "## Summary",
    item.summary || "No summary.",
    "",
    "## Quality checks",
    ...quality.map((check) => `- ${check.ready ? "Ready" : "Review"}: ${check.label} - ${check.detail}`),
    "",
    "## Markdown",
    item.bodyMarkdown.trim() || "No approved Markdown body.",
  ].join("\n");
}

function createApprovedSearchHandoff(
  items: ApprovedKnowledgeItem[],
  filterChips: string[],
  sourceCoverage: { sourced: number; unsourced: number; total: number },
) {
  return [
    "# Approved WIKI search handoff",
    `- Visible items: ${items.length}`,
    `- Source coverage: ${sourceCoverage.sourced}/${sourceCoverage.total} sourced, ${sourceCoverage.unsourced} unsourced`,
    "",
    "## Filters",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## Visible items",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id}) / scope ${item.scope} / tags ${item.tags.join(", ") || "none"}`)
      : ["- No approved WIKI items in the current filter scope."]),
  ].join("\n");
}

function createApprovedSourcePackage(item: ApprovedKnowledgeItem) {
  return [
    "# Approved WIKI source package",
    `- Item: ${item.title} (${item.id})`,
    `- Source record: ${item.sourceRecordId}`,
    `- Source task: ${item.sourceTaskId}`,
    `- Source project: ${item.sourceProjectId}`,
    `- References: ${item.sourceReferences.length}`,
    "",
    ...(item.sourceReferences.length
      ? item.sourceReferences.map((reference) => [
        `## ${reference.title}`,
        `- Kind: ${reference.kind}`,
        `- Priority: ${reference.priority}`,
        `- Source URL: ${reference.sourceUrl ?? "none"}`,
        `- Excerpt: ${reference.excerpt || "none"}`,
        "",
      ].join("\n"))
      : ["- No source references attached."]),
  ].join("\n");
}

function createApprovedIndexPackage(items: ApprovedKnowledgeItem[], filterChips: string[]) {
  return [
    "# Approved WIKI index package",
    `- Items: ${items.length}`,
    "",
    "## Filter scope",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## Index",
    ...(items.length
      ? items.map((item) => [
        `- ${item.title} (${item.id})`,
        `  - Scope: ${item.scope}`,
        `  - Approved: ${item.approvedAt}`,
        `  - Tags: ${item.tags.join(", ") || "none"}`,
        `  - Source refs: ${item.sourceReferences.length}`,
      ].join("\n"))
      : ["- No approved WIKI items in the current filter scope."]),
  ].join("\n");
}

function readApprovedExportStats(items: ApprovedKnowledgeItem[]) {
  const tags = new Set<string>();
  let sourced = 0;
  let bodyChars = 0;
  let sourceReferences = 0;
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

function buildApprovedExportReadiness(
  items: ApprovedKnowledgeItem[],
  format: ApprovedExportFormat,
  target: ApprovedSyncTarget,
  filterChips: string[],
): ReviewChecklistItem[] {
  const stats = readApprovedExportStats(items);
  return [
    {
      label: "Export scope",
      detail: items.length
        ? `${items.length} approved WIKI item(s) are included in the ${approvedExportFormatLabels[format]}.`
        : "No approved WIKI items are included in the current export scope.",
      ready: items.length > 0,
    },
    {
      label: "Filter manifest",
      detail: `${filterChips.length} active filter chip(s) will be included so the export can be reproduced.`,
      ready: filterChips.length > 0,
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
      detail: readApprovedSyncTargetGuidance(target, format),
      ready: true,
    },
  ];
}

function createApprovedExportPayload(
  items: ApprovedKnowledgeItem[],
  filterChips: string[],
  target: ApprovedSyncTarget,
  stats: ReturnType<typeof readApprovedExportStats>,
) {
  return {
    packageType: "approved_wiki_export",
    generatedAt: new Date().toISOString(),
    syncTarget: target,
    filterScope: filterChips,
    stats,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      bodyMarkdown: item.bodyMarkdown,
      tags: item.tags,
      scope: item.scope,
      approvedBy: item.approvedBy,
      approvedAt: item.approvedAt,
      sourceRecordId: item.sourceRecordId,
      sourceTaskId: item.sourceTaskId,
      sourceProjectId: item.sourceProjectId,
      sourceReferences: item.sourceReferences,
    })),
  };
}

function createApprovedExportMarkdown(
  items: ApprovedKnowledgeItem[],
  filterChips: string[],
  target: ApprovedSyncTarget,
  stats: ReturnType<typeof readApprovedExportStats>,
) {
  return [
    "# Approved WIKI export",
    `- Generated: ${new Date().toISOString()}`,
    `- Sync target: ${approvedSyncTargetLabels[target]}`,
    `- Items: ${stats.items}`,
    `- Source references: ${stats.sourceReferences}`,
    `- Unique tags: ${stats.tags}`,
    `- Body characters: ${stats.bodyChars}`,
    "",
    "## Filter scope",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    ...items.flatMap((item) => [
      `## ${item.title}`,
      `- ID: ${item.id}`,
      `- Scope: ${item.scope}`,
      `- Approved: ${item.approvedAt} by ${item.approvedBy}`,
      `- Source record: ${item.sourceRecordId}`,
      `- Source task: ${item.sourceTaskId}`,
      `- Source project: ${item.sourceProjectId}`,
      `- Tags: ${item.tags.join(", ") || "none"}`,
      `- Source references: ${item.sourceReferences.length}`,
      "",
      item.summary || "No summary.",
      "",
      item.bodyMarkdown.trim() || "No approved Markdown body.",
      "",
      "### Sources",
      ...(item.sourceReferences.length
        ? item.sourceReferences.map((reference) => `- ${reference.kind} / priority ${reference.priority}: ${reference.title}${reference.sourceUrl ? ` (${reference.sourceUrl})` : ""}`)
        : ["- No source references attached."]),
      "",
    ]),
  ].join("\n");
}

function createApprovedSyncManifest(
  items: ApprovedKnowledgeItem[],
  filterChips: string[],
  readiness: ReviewChecklistItem[],
  target: ApprovedSyncTarget,
  format: ApprovedExportFormat,
) {
  const readyCount = readiness.filter((item) => item.ready).length;
  return [
    "# Approved WIKI sync manifest",
    `- Target: ${approvedSyncTargetLabels[target]}`,
    `- Format: ${approvedExportFormatLabels[format]}`,
    `- Items: ${items.length}`,
    `- Readiness: ${readyCount}/${readiness.length}`,
    "",
    "## Filter scope",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## Readiness",
    ...readiness.map((item) => `- ${item.ready ? "Ready" : "Review"}: ${item.label} - ${item.detail}`),
    "",
    "## Item manifest",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id}) / ${item.scope} / ${item.tags.join(", ") || "no tags"}`)
      : ["- No approved WIKI items selected for sync."]),
  ].join("\n");
}

function createApprovedExportChecklist(
  items: ApprovedKnowledgeItem[],
  readiness: ReviewChecklistItem[],
  stats: ReturnType<typeof readApprovedExportStats>,
  target: ApprovedSyncTarget,
  format: ApprovedExportFormat,
) {
  return [
    "# Approved WIKI export checklist",
    `- Target: ${approvedSyncTargetLabels[target]}`,
    `- Format: ${approvedExportFormatLabels[format]}`,
    `- Items: ${stats.items}`,
    `- Source references: ${stats.sourceReferences}`,
    `- Unique tags: ${stats.tags}`,
    "",
    "## Checks",
    ...readiness.map((item) => `- ${item.ready ? "Ready" : "Review"}: ${item.label} - ${item.detail}`),
    "",
    "## Included items",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id})`)
      : ["- No items included"]),
  ].join("\n");
}

function buildApprovedSyncDryRunWarnings(
  items: ApprovedKnowledgeItem[],
  readiness: ReviewChecklistItem[],
  target: ApprovedSyncTarget,
  format: ApprovedExportFormat,
) {
  const warnings: string[] = [];
  const notReady = readiness.filter((item) => !item.ready);
  if (!items.length) {
    warnings.push("No approved WIKI items are selected for sync.");
  }
  for (const item of notReady) {
    warnings.push(`${item.label}: ${item.detail}`);
  }
  if (target !== "portable_archive") {
    warnings.push("External provider execution is not connected yet; this records a guarded local simulation only.");
  }
  if (target === "obsidian" && format === "json") {
    warnings.push("Obsidian target usually expects Markdown files; JSON keeps metadata for a later conversion step.");
  }
  return warnings;
}

function createApprovedSyncPackageName(
  target: ApprovedSyncTarget,
  scope: ApprovedExportScope,
  itemCount: number,
  format: ApprovedExportFormat,
) {
  const extension = format === "json" ? "json" : "md";
  return `approved-wiki-${target}-${scope}-${itemCount}.${extension}`;
}

function createApprovedSyncRun({
  status,
  target,
  format,
  scope,
  items,
  stats,
  readiness,
  confirmation,
  packageName,
  dryRunWarnings,
}: {
  status: ApprovedSyncRunStatus;
  target: ApprovedSyncTarget;
  format: ApprovedExportFormat;
  scope: ApprovedExportScope;
  items: ApprovedKnowledgeItem[];
  stats: ReturnType<typeof readApprovedExportStats>;
  readiness: ReviewChecklistItem[];
  confirmation: string;
  packageName: string;
  dryRunWarnings: string[];
}): ApprovedSyncRun {
  return {
    id: `approved-sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    status,
    target,
    format,
    scope,
    itemCount: items.length,
    readyCount: readiness.filter((item) => item.ready).length,
    readinessCount: readiness.length,
    sourceReferences: stats.sourceReferences,
    unsourced: stats.unsourced,
    confirmation: confirmation.trim() === approvedSyncConfirmationText ? "matched" : "missing_or_mismatch",
    packageName,
    dryRunWarnings,
  };
}

function createApprovedSyncAuditPayload(
  action: ApprovedSyncAction,
  target: ApprovedSyncTarget,
  format: ApprovedExportFormat,
  scope: ApprovedExportScope,
  items: ApprovedKnowledgeItem[],
  packageName: string,
  confirmation: string,
  dryRunWarnings: string[],
) {
  return {
    action,
    target,
    format,
    scope,
    itemIds: items.map((item) => item.id),
    packageName,
    confirmation,
    dryRunWarnings,
  };
}

function createApprovedSyncHistoryReport(history: ApprovedSyncRun[]) {
  return [
    "# Approved WIKI guarded sync history",
    `- Generated: ${new Date().toISOString()}`,
    `- Runs: ${history.length}`,
    "",
    ...(history.length
      ? history.map((run) => [
        `## ${run.createdAt}`,
        `- Status: ${run.status}`,
        `- Target: ${approvedSyncTargetLabels[run.target]}`,
        `- Format: ${approvedExportFormatLabels[run.format]}`,
        `- Scope: ${approvedExportScopeLabels[run.scope]}`,
        `- Package: ${run.packageName}`,
        `- Items: ${run.itemCount}`,
        `- Readiness: ${run.readyCount}/${run.readinessCount}`,
        `- Source references: ${run.sourceReferences}`,
        `- Unsourced: ${run.unsourced}`,
        `- Confirmation: ${run.confirmation}`,
        `- Provider configured: ${run.providerConfigured ? "yes" : "no"}`,
        `- Provider execution enabled: ${run.providerExecutionEnabled ? "yes" : "no"}`,
        "",
        "### Dry-run warnings",
        ...(run.dryRunWarnings.length ? run.dryRunWarnings.map((warning) => `- ${warning}`) : ["- none"]),
      ].join("\n"))
      : ["- No guarded sync history has been recorded locally."]),
  ].join("\n");
}

function createRegulationGovernanceReport(report: RegulationGovernanceReport) {
  return [
    "# Regulation legal-source governance report",
    `- Package: ${report.packageId}`,
    `- Package digest: ${report.packageDigest}`,
    `- Generated at: ${new Date().toISOString()}`,
    `- As of: ${report.asOf}`,
    `- Valid: ${report.valid ? "yes" : "no"}`,
    `- Production import: ${report.productionImport.enabled ? "enabled" : "blocked"}`,
    `- Required review: ${report.productionImport.requiredReview}`,
    `- Blocked reason: ${report.productionImport.blockedReason ?? "-"}`,
    `- Production preflight: ${report.productionImportPreflight.status}`,
    `- Preflight can import: ${report.productionImportPreflight.canImport ? "yes" : "no"}`,
    `- Refresh cadence: ${report.refreshPolicy.cadenceDays} day(s)`,
    `- Stale after: ${report.refreshPolicy.staleAfterDays} day(s)`,
    `- Sources: ${report.sourceCount}`,
    `- Documents: ${report.documentCount}`,
    "",
    "## Refresh summary",
    `- Scheduled: ${report.statusCounts.scheduled}`,
    `- Due soon: ${report.statusCounts.due}`,
    `- Overdue: ${report.statusCounts.overdue}`,
    "",
    "## Source reviews",
    `- Review records: ${report.sourceReviewSummary.count}`,
    `- Reviewed sources: ${report.sourceReviewSummary.reviewedSourceCount}/${report.sourceCount}`,
    `- Unreviewed sources: ${report.sourceReviewSummary.unreviewedSourceCount}`,
    `- Needs follow-up: ${report.sourceReviewSummary.followUpSourceCount}`,
    `- Blocked: ${report.sourceReviewSummary.blockedSourceCount}`,
    `- Latest: ${report.sourceReviewSummary.latestReviewedAt ?? "-"}`,
    `- Latest reviewer: ${report.sourceReviewSummary.latestReviewerId ?? "-"}`,
    "",
    "## Production import preflight",
    `- Acknowledgements: ${report.productionImportPreflight.acknowledgementCount}`,
    `- Source coverage: ${report.productionImportPreflight.sourceReviewCoverage.reviewedSourceCount}/${report.productionImportPreflight.sourceReviewCoverage.requiredSourceCount}`,
    `- Blocked source reviews: ${report.productionImportPreflight.sourceReviewCoverage.blockedSourceCount}`,
    `- Follow-up source reviews: ${report.productionImportPreflight.sourceReviewCoverage.followUpSourceCount}`,
    ...(report.productionImportPreflight.blockers.length
      ? report.productionImportPreflight.blockers.map((blocker) => `- Blocker: ${blocker}`)
      : ["- Blocker: none"]),
    ...(report.productionImportPreflight.warnings.length
      ? report.productionImportPreflight.warnings.map((warning) => `- Warning: ${warning}`)
      : ["- Warning: none"]),
    "",
    "## Acknowledgements",
    `- Count: ${report.acknowledgementSummary.count}`,
    `- Latest: ${report.acknowledgementSummary.latestAcknowledgedAt ?? "-"}`,
    `- Latest reviewer: ${report.acknowledgementSummary.latestReviewerId ?? "-"}`,
    ...(report.acknowledgements.length
      ? report.acknowledgements.map((acknowledgement) => `- ${acknowledgement.createdAt} / ${acknowledgement.reviewerId ?? "unknown"} / ${acknowledgement.note}`)
      : ["- none"]),
    "",
    "## Errors",
    ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- none"]),
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Sources",
    ...report.sources.flatMap((source) => [
      `### ${source.sourceName}`,
      `- Source id: ${source.sourceId}`,
      `- Publisher: ${source.publisher}`,
      `- Official URL: ${source.officialUrl}`,
      `- Refresh: ${regulationGovernanceStatusLabels[source.refreshStatus]} / ${source.refreshDueAt || "missing"}`,
      `- Days until due: ${source.daysUntilDue ?? "invalid"}`,
      `- Documents: ${source.documentCount}`,
      `- Admin review required: ${source.adminReviewRequiredCount}`,
      `- Approved documents: ${source.approvedDocumentCount}`,
      `- Source review count: ${source.reviewSummary.count}`,
      `- Latest source review: ${source.reviewSummary.latestReviewedAt ?? "-"}`,
      `- Latest source review state: ${source.reviewSummary.latestReviewState ? regulationGovernanceSourceReviewStateLabels[source.reviewSummary.latestReviewState] : "-"}`,
      "- Verification checklist:",
      ...(source.verificationChecklist.length
        ? source.verificationChecklist.map((item) => `  - ${item}`)
        : ["  - missing"]),
      "- Source review records:",
      ...(source.reviews.length
        ? source.reviews.map((review) => `  - ${review.createdAt} / ${regulationGovernanceSourceReviewStateLabels[review.reviewState]} / ${review.reviewerId ?? "unknown"} / ${review.note}`)
        : ["  - none"]),
      "",
    ]),
  ].join("\n");
}

function ProviderReconciliationPackageView({ packageData }: { packageData: ApprovedProviderReconciliationPackage }) {
  return (
    <section aria-label="Approved WIKI provider reconciliation package">
      <strong>{packageData.packageName}</strong>
      <div>
        <span>{packageData.summary.total} path(s)</span>
        <span>Create {packageData.summary.create}</span>
        <span>Update {packageData.summary.update}</span>
        <span>Delete {packageData.summary.delete}</span>
        <span>Noop {packageData.summary.noop}</span>
      </div>
      <div>
        {packageData.operations.slice(0, 8).map((operation) => (
          <span key={`${operation.intent}:${operation.path}`}>
            {operation.intent} {operation.path} / {operation.itemId.slice(0, 8)}
          </span>
        ))}
      </div>
      <div>
        {packageData.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </div>
    </section>
  );
}

function ProviderLiveWritePreflightView({ preflight }: { preflight: ApprovedProviderLiveWritePreflight }) {
  return (
    <section aria-label="Approved WIKI Obsidian live-write preflight">
      <strong>Obsidian live-write preflight</strong>
      <div>
        <span>{preflight.featureFlag} {preflight.featureFlagEnabled ? "enabled" : "disabled"}</span>
        <span>{preflight.mutationReady ? "Mutation ready" : "Mutation blocked"}</span>
        <span>{preflight.operationCount} mutation(s)</span>
        <span>Create {preflight.summary.create}</span>
        <span>Update {preflight.summary.update}</span>
        <span>Delete {preflight.summary.delete}</span>
      </div>
      <div>
        <span>Rollback {preflight.rollbackPlanRef ?? "missing"}</span>
        <span>Reconciliation {preflight.reconciliationPlanRef ?? "missing"}</span>
      </div>
      <div>
        {preflight.operations.slice(0, 8).map((operation) => (
          <span key={`${operation.intent}:${operation.path}`}>
            {operation.intent} {operation.path} / {operation.itemId.slice(0, 8)}
          </span>
        ))}
      </div>
      <div>
        {preflight.blockers.length ? preflight.blockers.map((blocker) => (
          <span key={blocker}>{blocker}</span>
        )) : <span>No preflight blockers.</span>}
      </div>
      <div>
        {preflight.warnings.map((warning) => (
          <span key={warning}>{warning}</span>
        ))}
      </div>
    </section>
  );
}

function createApprovedProviderPreviewReport(preview: ApprovedProviderPreview) {
  return [
    "# Approved WIKI provider preview",
    `- Preview id: ${preview.id}`,
    `- Export audit id: ${preview.auditId}`,
    `- Target: ${approvedSyncTargetLabels[preview.target]}`,
    `- Destination: ${preview.destination}`,
    `- Status: ${preview.status}`,
    `- Package: ${preview.packageName}`,
    `- Created: ${preview.createdAt}`,
    `- Created by: ${preview.createdBy ?? "unknown"}`,
    "",
    "## Operations",
    ...preview.operations.map((operation) => `- ${operation}`),
    "",
    "## Warnings",
    ...(preview.warnings.length ? preview.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    ...formatApprovedProviderReconciliationPackage(preview.reconciliationPackage),
  ].join("\n");
}

function createApprovedProviderExecutionReport(execution: ApprovedProviderExecution) {
  return [
    "# Approved WIKI provider execution",
    `- Execution id: ${execution.id}`,
    `- Preview id: ${execution.previewId}`,
    `- Export audit id: ${execution.auditId}`,
    `- Target: ${approvedSyncTargetLabels[execution.target]}`,
    `- Destination: ${execution.destination}`,
    `- Status: ${execution.status}`,
    `- Package: ${execution.packageName}`,
    `- Artifact: ${execution.artifactName}`,
    `- Artifact type: ${execution.artifactType}`,
    `- Items: ${execution.itemCount}`,
    `- Digest: ${execution.contentDigest}`,
    `- Created: ${execution.createdAt}`,
    `- Created by: ${execution.createdBy ?? "unknown"}`,
    "",
    "## Warnings",
    ...(execution.warnings.length ? execution.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    ...formatApprovedProviderReconciliationPackage(execution.reconciliationPackage),
    "",
    ...formatApprovedProviderLiveWritePreflight(execution.liveWritePreflight),
  ].join("\n");
}

function createProviderExecutionPackageReviewHandoff(report: ProviderExecutionPackageReviewNoteReport | null) {
  if (!report) {
    return "Provider execution package review report is not loaded.";
  }
  return [
    "# Provider execution package review handoff",
    `- Generated: ${report.generatedAt}`,
    `- Coverage preset: ${report.filters.coveragePreset}`,
    `- Stale days: ${report.filters.staleDays}`,
    `- Category: ${report.filters.category}`,
    `- Reviewer: ${report.filters.reviewerId ?? "all"}`,
    `- Package digest: ${report.filters.packageDigest ?? "all"}`,
    `- Execution id: ${report.filters.executionId ?? "all"}`,
    `- Packages: ${report.summary.packageCount}`,
    `- Reviewed: ${report.summary.reviewedCount}`,
    `- Unreviewed: ${report.summary.unreviewedCount}`,
    `- Stale unreviewed: ${report.summary.staleUnreviewedCount}`,
    `- Notes: ${report.summary.noteCount}`,
    "",
    "## Reviewer counts",
    ...(report.summary.reviewerCounts.length
      ? report.summary.reviewerCounts.map((item) => `- ${item.reviewerId ?? "unknown"}: ${item.count}`)
      : ["- none"]),
    "",
    "## Note category counts",
    ...(report.summary.categoryCounts.length
      ? report.summary.categoryCounts.map((item) => `- ${getProviderExecutionPackageReviewNoteCategoryLabel(item.category)}: ${item.count}`)
      : ["- none"]),
    "",
    "## Coverage",
    ...(report.coverage.slice(0, 10).map((item) => `- ${item.coverageStatus}: ${item.executionId} (${item.noteCount} note(s), ${item.packageDigest.slice(0, 16)} digest)`)),
  ].join("\n");
}

function getProviderExecutionPackageReviewNoteCategoryLabel(category: ProviderExecutionPackageReviewNoteCategory) {
  return providerExecutionPackageReviewNoteCategories.find((option) => option.value === category)?.label ?? category;
}

function formatApprovedProviderReconciliationPackage(packageData: ApprovedProviderReconciliationPackage | null) {
  if (!packageData) {
    return ["## Reconciliation package", "- none"];
  }
  return [
    "## Reconciliation package",
    `- Package: ${packageData.packageName}`,
    `- Generated: ${packageData.generatedAt}`,
    `- Target: ${approvedSyncTargetLabels[packageData.target]}`,
    `- Total: ${packageData.summary.total}`,
    `- Create: ${packageData.summary.create}`,
    `- Update: ${packageData.summary.update}`,
    `- Delete: ${packageData.summary.delete}`,
    `- Noop: ${packageData.summary.noop}`,
    "",
    "### Operations",
    ...(packageData.operations.length
      ? packageData.operations.map((operation) => `- ${operation.intent} ${operation.path} (${operation.itemId}, task ${operation.sourceTaskId}, digest ${operation.contentDigest.slice(0, 16)})`)
      : ["- none"]),
    "",
    "### Reconciliation warnings",
    ...(packageData.warnings.length ? packageData.warnings.map((warning) => `- ${warning}`) : ["- none"]),
  ];
}

function formatApprovedProviderLiveWritePreflight(preflight: ApprovedProviderLiveWritePreflight | null) {
  if (!preflight) {
    return ["## Obsidian live-write preflight", "- none"];
  }
  return [
    "## Obsidian live-write preflight",
    `- Generated: ${preflight.generatedAt}`,
    `- Feature flag: ${preflight.featureFlag}`,
    `- Feature flag enabled: ${preflight.featureFlagEnabled ? "yes" : "no"}`,
    `- Mutation ready: ${preflight.mutationReady ? "yes" : "no"}`,
    `- Rollback plan: ${preflight.rollbackPlanRef ?? "missing"}`,
    `- Reconciliation plan: ${preflight.reconciliationPlanRef ?? "missing"}`,
    `- Mutations: ${preflight.operationCount}`,
    `- Create: ${preflight.summary.create}`,
    `- Update: ${preflight.summary.update}`,
    `- Delete: ${preflight.summary.delete}`,
    "",
    "### Mutation operations",
    ...(preflight.operations.length
      ? preflight.operations.map((operation) => `- ${operation.intent} ${operation.path} (${operation.itemId}, task ${operation.sourceTaskId})`)
      : ["- none"]),
    "",
    "### Preflight blockers",
    ...(preflight.blockers.length ? preflight.blockers.map((blocker) => `- ${blocker}`) : ["- none"]),
    "",
    "### Preflight warnings",
    ...(preflight.warnings.length ? preflight.warnings.map((warning) => `- ${warning}`) : ["- none"]),
  ];
}

function readApprovedSyncHistory(): ApprovedSyncRun[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(approvedSyncHistoryStorageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isApprovedSyncRun).slice(0, 20);
  } catch {
    return [];
  }
}

function writeApprovedSyncHistory(history: ApprovedSyncRun[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(approvedSyncHistoryStorageKey, JSON.stringify(history.slice(0, 20)));
  } catch {
    // Local history is advisory; keep the admin workflow usable if storage is unavailable.
  }
}

function isApprovedSyncRun(value: unknown): value is ApprovedSyncRun {
  if (!value || typeof value !== "object") {
    return false;
  }
  const run = value as Partial<ApprovedSyncRun>;
  return typeof run.id === "string" &&
    typeof run.createdAt === "string" &&
    (run.status === "dry_run" ||
      run.status === "blocked" ||
      run.status === "simulated" ||
      run.status === "provider_blocked" ||
      run.status === "provider_ready") &&
    (run.target === "portable_archive" || run.target === "obsidian" || run.target === "notion" || run.target === "assistant_retrieval") &&
    (run.format === "json" || run.format === "markdown") &&
    (run.scope === "visible" || run.scope === "selected") &&
    typeof run.itemCount === "number" &&
    typeof run.readyCount === "number" &&
    typeof run.readinessCount === "number" &&
    typeof run.sourceReferences === "number" &&
    typeof run.unsourced === "number" &&
    typeof run.confirmation === "string" &&
    typeof run.packageName === "string" &&
    Array.isArray(run.dryRunWarnings);
}

function readApprovedSyncTargetGuidance(target: ApprovedSyncTarget, format: ApprovedExportFormat) {
  if (target === "obsidian") {
    return format === "markdown"
      ? "Markdown package is ready for Obsidian-style vault import."
      : "JSON package preserves metadata; convert bodyMarkdown to files before Obsidian import.";
  }
  if (target === "notion") {
    return "Package includes title, summary, tags, scope, Markdown body, and lineage for Notion import mapping.";
  }
  if (target === "assistant_retrieval") {
    return "Package preserves tags, scope, source lineage, and source references for retrieval indexing.";
  }
  return "Portable archive keeps a stable metadata and Markdown package for later sync tooling.";
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createProviderExecutionPackageCoverageSummaryFilename(generatedAt: string) {
  return `provider-execution-package-coverage-summary-${generatedAt.slice(0, 10)}.md`;
}

function readChecklistStatus(
  readyCount: number,
  totalCount: number,
  readyLabel: string,
  warningLabel: string,
): ApprovalGuardrail {
  if (totalCount > 0 && readyCount === totalCount) {
    return {
      label: readyLabel,
      detail: `${readyCount}/${totalCount} checks are ready.`,
      tone: "ready",
    };
  }

  return {
    label: warningLabel,
    detail: `${readyCount}/${totalCount} checks are ready; review ${Math.max(totalCount - readyCount, 0)} item(s).`,
    tone: "warning",
  };
}

function readFinalReviewNextAction(
  packageStatus: ApprovalGuardrail,
  warningCount: number,
  rejectionReason: string,
) {
  if (packageStatus.tone === "warning") {
    return "Review package quality before final action";
  }
  if (warningCount > 0 && !rejectionReason.trim()) {
    return "Resolve blockers or draft rejection reason";
  }
  if (warningCount > 0) {
    return "Reject or resolve blockers before approval";
  }
  return "Ready for WIKI approval";
}

function readApprovalRiskGroups(guardrails: ApprovalGuardrail[]): ApprovalRiskGroup[] {
  const groups: ApprovalRiskGroup[] = [
    { key: "scope", label: "Scope", readyCount: 0, warningCount: 0, items: [] },
    { key: "metadata", label: "Metadata", readyCount: 0, warningCount: 0, items: [] },
    { key: "structure", label: "Structure", readyCount: 0, warningCount: 0, items: [] },
    { key: "evidence", label: "Evidence", readyCount: 0, warningCount: 0, items: [] },
    { key: "state", label: "State", readyCount: 0, warningCount: 0, items: [] },
  ];
  const groupByKey = new Map(groups.map((group) => [group.key, group]));
  for (const guardrail of guardrails) {
    const group = groupByKey.get(readApprovalRiskGroupKey(guardrail.label)) ?? groups[1];
    group.items.push(guardrail);
    if (guardrail.tone === "warning") {
      group.warningCount += 1;
    } else {
      group.readyCount += 1;
    }
  }
  return groups;
}

function readApprovalRiskGroupKey(label: string): ApprovalRiskGroup["key"] {
  if (label.includes("scope") || label.includes("Scope")) {
    return "scope";
  }
  if (label.includes("Markdown")) {
    return "structure";
  }
  if (label.includes("evidence") || label.includes("Evidence") || label.includes("priority")) {
    return "evidence";
  }
  if (label.includes("confidence") || label.includes("Confidence") || label.includes("State")) {
    return "state";
  }
  return "metadata";
}

function buildApprovalGuardrails(
  readiness: Array<{ label: string; ready: boolean }>,
  detail: CandidateDetail | null,
  draftDirtyStates: Array<{ label: string; dirty: boolean }>,
  markdownOutline: MarkdownHeading[],
  markdownStructureSummary: MarkdownStructureSummary,
  markdownWikiLinks: MarkdownWikiLink[],
  draftTags: string[],
  duplicateDraftTags: string[],
  draftScope: Scope,
  originalScope: Scope | null,
  bodyMarkdown: string,
): ApprovalGuardrail[] {
  const guardrails: ApprovalGuardrail[] = [];
  const missing = readiness.filter((item) => !item.ready).map((item) => item.label);

  if (missing.length) {
    guardrails.push({
      label: "Missing readiness",
      detail: `Review ${missing.join(", ")} before approval.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Draft fields ready",
      detail: "Required draft fields and evidence are present.",
      tone: "ready",
    });
  }

  if (!detail) {
    return guardrails;
  }

  if (draftScope === "organization") {
    guardrails.push({
      label: "Organization scope review",
      detail: "Publication scope is organization-wide. Confirm this knowledge should be shared across the organization.",
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Restricted scope selected",
      detail: `Publication scope is ${scopeLabels[draftScope]}.`,
      tone: "ready",
    });
  }

  if (originalScope && originalScope !== draftScope) {
    guardrails.push({
      label: "Publication scope changed",
      detail: `Scope changed from ${scopeLabels[originalScope]} to ${scopeLabels[draftScope]}. Confirm the new audience before approval.`,
      tone: "warning",
    });
  } else if (originalScope) {
    guardrails.push({
      label: "Publication scope unchanged",
      detail: `Scope remains ${scopeLabels[draftScope]}.`,
      tone: "ready",
    });
  }

  if (draftTags.length >= 2) {
    guardrails.push({
      label: "Tag coverage ready",
      detail: `${draftTags.length} draft tags are present for retrieval and WIKI grouping.`,
      tone: "ready",
    });
  } else {
    guardrails.push({
      label: "Tag coverage limited",
      detail: `${draftTags.length}/2 recommended draft tags are present. Add tags before approval when possible.`,
      tone: "warning",
    });
  }

  if (duplicateDraftTags.length) {
    guardrails.push({
      label: "Duplicate draft tags",
      detail: `Remove duplicate tag values before approval: ${duplicateDraftTags.join(", ")}.`,
      tone: "warning",
    });
  } else if (draftTags.length) {
    guardrails.push({
      label: "Draft tags unique",
      detail: "Draft tags do not contain duplicates.",
      tone: "ready",
    });
  }

  if (bodyMarkdown.trim()) {
    if (markdownOutline.length) {
      guardrails.push({
        label: "Markdown outline present",
        detail: `${markdownOutline.length} Markdown headings are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown headings missing",
        detail: "Draft body has Markdown content but no headings. Confirm structure before approval.",
        tone: "warning",
      });
    }

    if (markdownStructureSummary.listItems) {
      guardrails.push({
        label: "Markdown list structure present",
        detail: `${markdownStructureSummary.listItems} Markdown list items are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown list structure missing",
        detail: "Draft body has no Markdown list items. Confirm action or context extraction before approval.",
        tone: "warning",
      });
    }

    if (markdownWikiLinks.length) {
      guardrails.push({
        label: "Markdown WIKI links present",
        detail: `${markdownWikiLinks.length} Markdown WIKI links are present.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown WIKI links missing",
        detail: "Draft body has no [[WIKI links]]. Confirm whether this item should connect to existing knowledge.",
        tone: "warning",
      });
    }
  }

  const changedDraftFields = draftDirtyStates.filter((item) => item.dirty).map((item) => item.label);
  if (changedDraftFields.length) {
    guardrails.push({
      label: "Edited draft fields",
      detail: `Approval will use edited draft fields: ${changedDraftFields.join(", ")}.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Draft unchanged",
      detail: "Draft fields match the selected candidate draft.",
      tone: "ready",
    });
  }

  if (detail.confidenceScore < 60) {
    guardrails.push({
      label: "Low confidence",
      detail: `Confidence is ${detail.confidenceScore}%. Confirm evidence before approval.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "Confidence acceptable",
      detail: `Confidence is ${detail.confidenceScore}%.`,
      tone: "ready",
    });
  }

  if (detail.state !== "candidate" && detail.state !== "pending_review") {
    guardrails.push({
      label: "State review",
      detail: `Candidate is currently ${detail.state}. Confirm this item should be edited again.`,
      tone: "warning",
    });
  }

  if (detail.evidence.length) {
    const unsourcedCount = detail.evidence.filter((item) => !item.sourceUrl).length;
    const highPriorityCount = detail.evidence.filter((item) => item.priority <= 3).length;
    if (unsourcedCount) {
      guardrails.push({
        label: "Unsourced evidence",
        detail: `${unsourcedCount}/${detail.evidence.length} evidence rows do not include source URLs.`,
        tone: "warning",
      });
    } else {
      guardrails.push({
        label: "Evidence sources present",
        detail: "Every evidence row includes a source URL.",
        tone: "ready",
      });
    }
    if (highPriorityCount) {
      guardrails.push({
        label: "High-priority evidence present",
        detail: `${highPriorityCount}/${detail.evidence.length} evidence rows are high priority.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "No high-priority evidence",
        detail: "Evidence is present, but none is high priority. Confirm support before approval.",
        tone: "warning",
      });
    }
  }

  return guardrails;
}

function readConfidenceBand(score: number) {
  if (score >= 80) {
    return "high";
  }
  if (score >= 60) {
    return "medium";
  }
  return "low";
}

function readEvidencePriorityTier(priority: number) {
  if (priority <= 3) {
    return "High priority";
  }
  if (priority <= 5) {
    return "Normal priority";
  }
  return "Low priority";
}

function readEvidencePriorityFilter(priority: number): EvidencePriorityFilter {
  if (priority <= 3) {
    return "high";
  }
  if (priority <= 5) {
    return "normal";
  }
  return "low";
}

function readReviewStatus(warnings: number, readyCount: number, totalCount: number): ApprovalGuardrail {
  if (readyCount < totalCount) {
    return {
      label: "Review incomplete",
      detail: `${readyCount}/${totalCount} readiness items are complete. Resolve missing draft inputs before approval.`,
      tone: "warning",
    };
  }

  if (warnings > 0) {
    return {
      label: "Review with caution",
      detail: `${warnings} guardrail warning${warnings === 1 ? "" : "s"} need review before approval.`,
      tone: "warning",
    };
  }

  return {
    label: "Ready for approval review",
    detail: "Readiness fields are complete and no guardrail warnings are active.",
    tone: "ready",
  };
}

function readApprovalDecisionMode(warnings: number, warningGroups: number): ApprovalGuardrail {
  if (warnings > 0) {
    return {
      label: "Decision note: blocker review",
      detail: `${warnings} warnings across ${warningGroups} risk groups`,
      tone: "warning",
    };
  }

  return {
    label: "Decision note: approve-ready",
    detail: "No active guardrail warnings",
    tone: "ready",
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
