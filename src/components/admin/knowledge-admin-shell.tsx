"use client";

import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LegalBatchAuditStatusPanel } from "@/components/admin/legal-batch-audit-status-panel";
import { LegalChangeMonitorPanel } from "@/components/admin/legal-change-monitor-panel";
import { KnowledgeGenerationProfilePanel } from "@/components/admin/knowledge-generation-profile-panel";
import { KnowledgeLocalImportPlaceholderPanel } from "@/components/admin/knowledge-local-import-placeholder-panel";
import {
  KnowledgeStructuredDraftPanel,
  type StructuredDraftGenerationMetadata,
} from "@/components/admin/knowledge-structured-draft-panel";
import type { KnowledgeSourceBucketView } from "@/components/admin/knowledge-source-bucket-panel";
import {
  type KnowledgeAdminNavigation,
  type KnowledgeCandidateTab,
  type KnowledgeDraftSubview,
  type KnowledgeWorkTab,
  defaultKnowledgeAdminNavigation,
  knowledgeCandidatePanelDomId,
  knowledgeCandidateTabDescriptions,
  knowledgeCandidateTabDomId,
  knowledgeCandidateTabLabels,
  knowledgeCandidateTabs,
  knowledgeWorkPanelDomId,
  knowledgeWorkTabDescriptions,
  knowledgeWorkTabDomId,
  knowledgeWorkTabLabels,
  knowledgeWorkTabs,
  parseKnowledgeAdminNavigation,
} from "@/components/admin/knowledge-admin-tabs";
import type { KnowledgeGenerationProfile, StructuredKnowledgeDraft } from "@/domains/knowledge/structured-knowledge";
import styles from "@/components/admin/knowledge-admin-shell.module.css";
import { createKnowledgeAdminNavigationHref } from "@/components/admin/use-knowledge-admin-navigation";
import { useProjectMeta } from "@/providers/project-provider";

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
  projectId: string;
  projectName: string;
  taskId: string;
  taskIssueId: string;
  taskTitle: string;
  confidenceScore: number;
  cleanupState: "draft" | "approved" | "deferred";
  reviewedAt: string | null;
  sourceProjectWiki: {
    itemId: string | null;
    sourceProjectWikiItemId: string | null;
    sourceTaskId: string | null;
    sourceReviewRecordId: string | null;
    sourceWorkSummaryDraftId: string | null;
    status: "active" | "disabled";
    supplementalNote: string;
    aiSuitabilityState: "recommended" | "caution" | "not_recommended" | null;
    aiSuitabilityReason: string;
    commonizationCaution: string;
    projectSpecificContext: boolean;
  } | null;
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

type GenerateStructuredKnowledgeDraftResult = StructuredDraftGenerationMetadata & {
  draft: StructuredKnowledgeDraft;
};

type KnowledgeAdminShellProps = {
  initialCandidates: CandidateListItem[];
  initialNavigation?: KnowledgeAdminNavigation;
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

type DiscoveryRequestView = {
  id: string;
  taskId: string;
  scanId: string;
  state: string;
  recommendationScore: number;
  recommendationReason: string;
  promotedCandidateId: string | null;
  createdAt: string;
};

type ImportPreviewView = {
  id: string;
  defaultTaskId: string | null;
  rubricId: string;
  rubricVersion: number;
  state: string;
  workspaceFingerprint: string;
  includedItems: unknown;
  excludedItems: unknown;
  confirmedAt: string | null;
  createdAt: string;
};

type ImportRubricView = {
  id: string;
  name: string;
  version: number;
  state: string;
};

const stateLabels: Record<CandidateState, string> = {
  candidate: "검토 대기",
  pending_review: "SaaS 검토 대기",
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

const cleanupStateLabels: Record<CandidateListItem["cleanupState"], string> = {
  draft: "정리 초안",
  approved: "정리 승인됨",
  deferred: "정리 보류",
};

const projectWikiSuitabilityLabels: Record<"recommended" | "caution" | "not_recommended", string> = {
  recommended: "AI 추천",
  caution: "AI 주의",
  not_recommended: "AI 비추천",
};

const candidateRiskFilterLabels: Record<CandidateRiskFilter, string> = {
  all: "전체 위험",
  low_confidence: "낮은 신뢰도",
  unreviewed: "미검토",
  cleanup_approved: "정리 승인됨",
};

const candidateSortLabels: Record<CandidateSort, string> = {
  newest: "최신순",
  low_confidence: "낮은 신뢰도 우선",
};

const evidenceSourceFilterLabels: Record<EvidenceSourceFilter, string> = {
  all: "전체 근거",
  sourced: "출처 있음",
  unsourced: "출처 없음",
};

const evidencePriorityFilterLabels: Record<EvidencePriorityFilter, string> = {
  all: "전체 우선순위",
  high: "높은 우선순위",
  normal: "보통 우선순위",
  low: "낮은 우선순위",
};

const approvedSourceFilterLabels: Record<ApprovedSourceFilter, string> = {
  all: "전체 출처 상태",
  sourced: "출처 참조 있음",
  unsourced: "출처 참조 없음",
};

const approvedSortLabels: Record<ApprovedSort, string> = {
  newest: "최근 승인순",
  title: "제목 가나다순",
  source_count: "출처 참조 많은순",
};

const approvedExportFormatLabels: Record<ApprovedExportFormat, string> = {
  json: "JSON 패키지",
  markdown: "Markdown 패키지",
};

const approvedExportScopeLabels: Record<ApprovedExportScope, string> = {
  visible: "현재 보이는 항목",
  selected: "선택한 항목",
};

const approvedSyncTargetLabels: Record<ApprovedSyncTarget, string> = {
  portable_archive: "휴대용 아카이브",
  obsidian: "Obsidian 저장소",
  notion: "Notion 가져오기",
  assistant_retrieval: "AI 어시스턴트 검색 색인",
};

const approvedSyncRunStatusLabels: Record<ApprovedSyncRunStatus, string> = {
  dry_run: "사전 실행",
  blocked: "차단됨",
  simulated: "시뮬레이션 완료",
  provider_blocked: "제공자 실행 차단",
  provider_ready: "제공자 실행 준비됨",
};

const approvedProviderExecutionStatusLabels: Record<ApprovedProviderExecution["status"], string> = {
  executed: "실행됨",
  preflight_recorded: "사전 점검 기록됨",
};

const approvedProviderArtifactTypeLabels: Record<ApprovedProviderExecution["artifactType"], string> = {
  portable_archive_manifest: "휴대용 아카이브 명세",
  obsidian_markdown_manifest: "Obsidian Markdown 명세",
  obsidian_live_write_preflight: "Obsidian 실시간 쓰기 사전 점검",
};

const approvedProviderAdapterLabels: Record<ApprovedSyncTargetConfig["adapter"], string> = {
  portable_archive: "휴대용 아카이브",
  markdown_files: "Markdown 파일",
  notion_blocks: "Notion 블록",
  retrieval_index: "검색 색인",
};

const approvedProviderCredentialStatusLabels: Record<ApprovedSyncTargetConfig["credentialStatus"], string> = {
  not_required: "필요 없음",
  missing: "누락",
  configured: "설정됨",
};

const approvedProviderCredentialSourceLabels: Record<ApprovedSyncTargetConfig["credentialSource"], string> = {
  not_required: "필요 없음",
  target_config: "대상 설정",
  server_env: "서버 환경변수",
  secret_manager: "시크릿 관리자",
  missing: "누락",
};

const approvedProviderCredentialStoreLabels: Record<ApprovedSyncTargetConfig["credentialStore"], string> = {
  none: "없음",
  target_config: "대상 설정",
  server_env: "서버 환경변수",
  secret_manager: "시크릿 관리자",
  missing: "누락",
};

const approvedProviderPlanStatusLabels: Record<ApprovedSyncTargetConfig["rollbackPlanStatus"], string> = {
  not_required: "필요 없음",
  configured: "설정됨",
  missing: "누락",
};

const approvedProviderReconciliationIntentLabels: Record<ApprovedProviderReconciliationOperation["intent"], string> = {
  create: "생성",
  update: "수정",
  delete: "삭제",
  noop: "변경 없음",
};

const approvedSyncConfirmationText = "SYNC_APPROVED_WIKI";
const approvedProviderPreviewConfirmationText = "PREVIEW_APPROVED_WIKI_SYNC";
const approvedProviderExecutionConfirmationText = "EXECUTE_APPROVED_WIKI_SYNC";
const approvedSyncHistoryStorageKey = "architect.approvedWikiSyncHistory.v1";
const providerExecutionPackageReviewNoteCategories: { value: ProviderExecutionPackageReviewNoteCategory; label: string }[] = [
  { value: "review_note", label: "검토 메모" },
  { value: "risk", label: "위험" },
  { value: "follow_up", label: "후속 조치" },
  { value: "approval_context", label: "승인 맥락" },
];
const providerExecutionPackageReviewCoverageStatusLabels: Record<ProviderExecutionPackageReviewCoverageStatus, string> = {
  reviewed: "검토됨",
  unreviewed: "미검토",
  stale_unreviewed: "오래된 미검토",
};

const regulationGovernanceStatusLabels: Record<RegulationGovernanceRefreshStatus, string> = {
  scheduled: "예정됨",
  due: "곧 갱신 필요",
  overdue: "기한 초과",
};
const regulationGovernanceSourceReviewStateOptions: { value: RegulationGovernanceSourceReviewState; label: string }[] = [
  { value: "reviewed", label: "검토됨" },
  { value: "needs_follow_up", label: "후속 조치 필요" },
  { value: "blocked", label: "차단됨" },
];
const regulationGovernanceSourceReviewStateLabels: Record<RegulationGovernanceSourceReviewState, string> = {
  reviewed: "검토됨",
  needs_follow_up: "후속 조치 필요",
  blocked: "차단됨",
};
const regulationSourceReviewCoverageLabels: Record<RegulationSourceReviewCoveragePreset, string> = {
  all: "전체 출처 검토",
  reviewed: "검토됨",
  unreviewed: "미검토",
  stale: "오래됨",
};

function KnowledgeWorkTabPanel({
  activeTab,
  children,
  tab,
}: {
  activeTab: KnowledgeWorkTab;
  children: ReactNode;
  tab: KnowledgeWorkTab;
}) {
  const isActive = activeTab === tab;
  return (
    <section
      aria-labelledby={knowledgeWorkTabDomId(tab)}
      className={styles.tabPanel}
      hidden={!isActive}
      id={knowledgeWorkPanelDomId(tab)}
      role="tabpanel"
      tabIndex={isActive ? 0 : -1}
    >
      {children}
    </section>
  );
}

function KnowledgeCandidateTabPanel({
  activeTab,
  children,
  tab,
}: {
  activeTab: KnowledgeCandidateTab;
  children: ReactNode;
  tab: KnowledgeCandidateTab;
}) {
  const isActive = activeTab === tab;
  return (
    <section
      aria-labelledby={knowledgeCandidateTabDomId(tab)}
      className={styles.tabPanel}
      hidden={!isActive}
      id={knowledgeCandidatePanelDomId(tab)}
      role="tabpanel"
      tabIndex={isActive ? 0 : -1}
    >
      {children}
    </section>
  );
}

function readNextTabFromKeyboard<T extends string>(
  tabs: readonly T[],
  activeTab: T,
  event: KeyboardEvent<HTMLDivElement>,
) {
  const currentIndex = tabs.indexOf(activeTab);
  if (event.key === "Home") {
    return tabs[0] ?? null;
  }
  if (event.key === "End") {
    return tabs[tabs.length - 1] ?? null;
  }
  if (event.key === "ArrowRight") {
    return tabs[(currentIndex + 1) % tabs.length] ?? null;
  }
  if (event.key === "ArrowLeft") {
    return tabs[(currentIndex - 1 + tabs.length) % tabs.length] ?? null;
  }
  return null;
}

export function KnowledgeAdminShell({
  initialCandidates,
  initialNavigation = defaultKnowledgeAdminNavigation,
}: KnowledgeAdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentProjectId } = useProjectMeta();
  const approvedItemsUrl = useMemo(
    () => currentProjectId ? `/api/admin/knowledge/items?projectId=${encodeURIComponent(currentProjectId)}` : null,
    [currentProjectId],
  );
  const [activeWorkTab, setActiveWorkTab] = useState<KnowledgeWorkTab>(initialNavigation.work);
  const [activeCandidateTab, setActiveCandidateTab] = useState<KnowledgeCandidateTab>(initialNavigation.candidateTab);
  const [activeDraftSubview, setActiveDraftSubview] = useState<KnowledgeDraftSubview>(initialNavigation.draftSubview);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedId, setSelectedId] = useState(
    initialCandidates.some((candidate) => candidate.id === initialNavigation.candidateId)
      ? initialNavigation.candidateId
      : initialCandidates[0]?.id ?? "",
  );
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState("후보를 선택하세요.");
  const [navigationStatus, setNavigationStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [sourceBuckets, setSourceBuckets] = useState<KnowledgeSourceBucketView[]>([]);
  const [sourceBucketsLoading, setSourceBucketsLoading] = useState(false);
  const [sourceBucketsError, setSourceBucketsError] = useState("");
  const [structuredDraftResult, setStructuredDraftResult] = useState<GenerateStructuredKnowledgeDraftResult | null>(null);
  const [structuredDraftGenerating, setStructuredDraftGenerating] = useState(false);
  const [generationProfiles, setGenerationProfiles] = useState<KnowledgeGenerationProfile[]>([]);
  const [generationProfilesLoading, setGenerationProfilesLoading] = useState(false);
  const [generationProfilesError, setGenerationProfilesError] = useState("");
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
  const [selectedApprovedId, setSelectedApprovedId] = useState(initialNavigation.approvedId);
  const [approvedPreviewCompact, setApprovedPreviewCompact] = useState(true);
  const [approvedExportFormat, setApprovedExportFormat] = useState<ApprovedExportFormat>("json");
  const [approvedExportScope, setApprovedExportScope] = useState<ApprovedExportScope>("visible");
  const [approvedSyncTarget, setApprovedSyncTarget] = useState<ApprovedSyncTarget>(initialNavigation.approvedSyncTarget);
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
  const [discoveryRequests, setDiscoveryRequests] = useState<DiscoveryRequestView[]>([]);
  const [importPreviews, setImportPreviews] = useState<ImportPreviewView[]>([]);
  const [importRubrics, setImportRubrics] = useState<ImportRubricView[]>([]);
  const [localImportDefaultTaskId, setLocalImportDefaultTaskId] = useState("");
  const [localImportPreviewId, setLocalImportPreviewId] = useState(initialNavigation.importPreviewId);
  const [selectedRubricId, setSelectedRubricId] = useState(initialNavigation.rubricId);
  const [rubricRollbackReason, setRubricRollbackReason] = useState("");
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
      `상태: ${filter === "all" ? "전체" : stateLabels[filter]}`,
      `리스크: ${candidateRiskFilterLabels[riskFilter]}`,
      `정렬: ${candidateSortLabels[candidateSort]}`,
      search ? `검색: ${search}` : "검색: 없음",
      `표시: ${visibleCandidates.length}/${candidates.length}`,
    ];
  }, [candidateSearch, candidateSort, candidates.length, filter, riskFilter, visibleCandidates.length]);
  const candidateStateCounts = useMemo(
    () => ({
      all: candidates.length,
      candidate: candidates.filter((candidate) => candidate.state === "candidate").length,
      pending_review: candidates.filter((candidate) => candidate.state === "pending_review").length,
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
  const activeImportPreview = useMemo(
    () => importPreviews.find((preview) => preview.id === localImportPreviewId) ?? importPreviews[0] ?? null,
    [importPreviews, localImportPreviewId],
  );
  const activeImportRubric = useMemo(
    () => importRubrics.find((rubric) => rubric.id === (selectedRubricId || activeImportPreview?.rubricId)) ??
      importRubrics.find((rubric) => rubric.state === "active") ??
      importRubrics[0] ??
      null,
    [activeImportPreview?.rubricId, importRubrics, selectedRubricId],
  );
  const localImportIncludedCount = countJsonArrayItems(activeImportPreview?.includedItems);
  const localImportExcludedCount = countJsonArrayItems(activeImportPreview?.excludedItems);
  const localImportRubricLabel = activeImportRubric
    ? `${activeImportRubric.name} v${activeImportRubric.version}`
    : "wiki-import-rubric v1";
  const localImportDefaultTaskValue = localImportDefaultTaskId.trim() || selectedCandidate?.taskId || detail?.taskId || "";
  const structuredGenerationMetadata = useMemo<StructuredDraftGenerationMetadata | null>(
    () => structuredDraftResult
      ? {
          generationRunId: structuredDraftResult.generationRunId,
          profileId: structuredDraftResult.profileId,
          profileVersion: structuredDraftResult.profileVersion,
          sourceBundleDigest: structuredDraftResult.sourceBundleDigest,
          promptDigest: structuredDraftResult.promptDigest,
          warnings: structuredDraftResult.warnings,
        }
      : null,
    [structuredDraftResult],
  );
  const originalDraft = useMemo(() => (detail ? createDraftFromDetail(detail) : null), [detail]);
  const draftTags = useMemo(() => splitTags(draft.tagsText), [draft.tagsText]);
  const duplicateDraftTags = useMemo(() => readDuplicateTags(draftTags), [draftTags]);
  const scopeReview = useMemo(
    () => readScopeReview(draft.scope, originalDraft?.scope ?? null),
    [draft.scope, originalDraft?.scope],
  );
  const draftReadiness = useMemo(
    () => [
      { label: "제목", ready: Boolean(draft.title.trim()) },
      { label: "요약", ready: Boolean(draft.summary.trim()) },
      { label: "본문", ready: Boolean(draft.bodyMarkdown.trim()) },
      { label: "태그", ready: draftTags.length > 0 },
      { label: "근거", ready: Boolean(detail?.evidence.length) },
    ],
    [detail?.evidence.length, draft.bodyMarkdown, draft.summary, draft.title, draftTags.length],
  );
  const draftDirtyStates = useMemo(() => {
    if (!originalDraft) {
      return [];
    }

    return [
      { label: "제목", dirty: draft.title !== originalDraft.title },
      { label: "요약", dirty: draft.summary !== originalDraft.summary },
      { label: "본문", dirty: draft.bodyMarkdown !== originalDraft.bodyMarkdown },
      { label: "태그", dirty: draftTags.join("|") !== splitTags(originalDraft.tagsText).join("|") },
      { label: "범위", dirty: draft.scope !== originalDraft.scope },
      { label: "반려 사유", dirty: draft.rejectionReason.trim() !== originalDraft.rejectionReason.trim() },
    ];
  }, [draft.bodyMarkdown, draft.rejectionReason, draft.scope, draft.summary, draft.title, draftTags, originalDraft]);
  const dirtyDraftCount = draftDirtyStates.filter((item) => item.dirty).length;
  const structuredDraftApprovalIssue = useMemo(
    () => readStructuredDraftApprovalIssue(structuredDraftResult?.draft ?? null, draft, draftTags),
    [draft, draftTags, structuredDraftResult?.draft],
  );
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
  const hasCustomEvidenceFilters = evidenceSourceFilter !== "all" || evidencePriorityFilter !== "all";
  const evidenceResultChips = useMemo(
    () => [
      `결과 ${visibleEvidence.length}/${detail?.evidence.length ?? 0}`,
      visibleEvidenceSummary.unsourced ? `출처 없음 ${visibleEvidenceSummary.unsourced}` : "",
      visibleEvidenceSummary.high ? `높은 우선순위 ${visibleEvidenceSummary.high}` : "",
      hasCustomEvidenceFilters ? `${evidenceSourceFilterLabels[evidenceSourceFilter]} / ${evidencePriorityFilterLabels[evidencePriorityFilter]}` : "",
    ].filter(Boolean),
    [
      detail?.evidence.length,
      evidencePriorityFilter,
      evidenceSourceFilter,
      hasCustomEvidenceFilters,
      visibleEvidence.length,
      visibleEvidenceSummary.high,
      visibleEvidenceSummary.unsourced,
    ],
  );
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
  const approvalPackageQualityStatus = useMemo(
    () => readChecklistStatus(
      approvalPackageQualityReadyCount,
      approvalPackageQuality.length,
      "패키지 품질 완료",
      "패키지 품질 검토 필요",
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
      "최종 검토 마감 준비됨",
      "최종 검토 마감 검토 필요",
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
      `범위: ${approvedScopeFilter === "all" ? "전체 범위" : scopeLabels[approvedScopeFilter]}`,
      `태그: ${approvedTagFilter === "all" ? "전체" : approvedTagFilter}`,
      `출처: ${approvedSourceFilterLabels[approvedSourceFilter]}`,
      `정렬: ${approvedSortLabels[approvedSort]}`,
      search ? `검색: ${search}` : "검색: 없음",
      `표시: ${visibleApprovedItems.length}/${approvedItems.length}`,
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
        label: "명세 검증",
        detail: regulationGovernance.valid
          ? "시드 패키지와 거버넌스 명세가 오프라인 검증을 통과했습니다."
          : `차단 이슈 ${regulationGovernance.errors.length}개를 검토해야 합니다.`,
        ready: regulationGovernance.valid,
      },
      {
        label: "프로덕션 가져오기 게이트",
        detail: regulationGovernance.productionImport.enabled
          ? "이 패키지는 프로덕션 가져오기가 활성화되어 있습니다."
          : regulationGovernance.productionImport.blockedReason ?? "검토 맥락이 기록될 때까지 프로덕션 가져오기가 차단됩니다.",
        ready: !regulationGovernance.productionImport.enabled && Boolean(regulationGovernance.productionImport.blockedReason),
      },
      {
        label: "갱신 일정",
        detail: `기한 초과 ${regulationGovernance.statusCounts.overdue}개 / 곧 갱신 필요 ${regulationGovernance.statusCounts.due}개 / 예정된 출처 ${regulationGovernance.statusCounts.scheduled}개.`,
        ready: regulationGovernance.statusCounts.overdue === 0,
      },
      {
        label: "검증 체크리스트",
        detail: `공식 출처 ${regulationGovernance.sourceCount}개에 체크리스트 ${checklistCount}개가 연결되어 있습니다.`,
        ready: checklistCount >= regulationGovernance.sourceCount,
      },
      {
        label: "출처 검토 커버리지",
        detail: `출처 ${regulationGovernance.sourceReviewSummary.reviewedSourceCount}/${regulationGovernance.sourceCount}개 검토됨; 후속 조치 ${regulationGovernance.sourceReviewSummary.followUpSourceCount}개, 차단 ${regulationGovernance.sourceReviewSummary.blockedSourceCount}개.`,
        ready: regulationGovernance.sourceReviewSummary.reviewedSourceCount === regulationGovernance.sourceCount &&
          regulationGovernance.sourceReviewSummary.blockedSourceCount === 0,
      },
      {
        label: "검토자 확인",
        detail: regulationGovernance.acknowledgementSummary.latestAcknowledgedAt
          ? `최신 확인: ${formatDate(regulationGovernance.acknowledgementSummary.latestAcknowledgedAt)} / ${regulationGovernance.acknowledgementSummary.latestReviewerId ?? "알 수 없는 검토자"}.`
          : "이 패키지에 저장된 거버넌스 확인이 없습니다.",
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
        title: "오래된 검토 큐",
        description: "현재 오래됨 기준을 넘긴 미검토 패키지입니다.",
        rows: coverage.filter((item) => item.coverageStatus === "stale_unreviewed"),
      },
      {
        key: "unreviewed",
        title: "미검토 큐",
        description: "아직 연결된 검토 메모가 필요한 패키지입니다.",
        rows: coverage.filter((item) => item.coverageStatus === "unreviewed"),
      },
      {
        key: "reviewed",
        title: "검토 완료 큐",
        description: "현재 범위에 보존된 검토 메모가 있는 패키지입니다.",
        rows: coverage.filter((item) => item.coverageStatus === "reviewed"),
      },
    ];
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageDominantQueueChip = useMemo(() => {
    const [dominantGroup] = [...providerExecutionPackageReviewCoverageGroups].sort((first, second) => second.rows.length - first.rows.length);
    if (!dominantGroup || dominantGroup.rows.length === 0) {
      return "주요 큐 없음";
    }
    return `주요 큐 ${dominantGroup.title} (${dominantGroup.rows.length})`;
  }, [providerExecutionPackageReviewCoverageGroups]);
  const providerExecutionPackageCoverageEmptyQueueChip = useMemo(() => {
    const emptyQueueCount = providerExecutionPackageReviewCoverageGroups.filter((group) => group.rows.length === 0).length;
    return `빈 큐 ${emptyQueueCount}/${providerExecutionPackageReviewCoverageGroups.length}`;
  }, [providerExecutionPackageReviewCoverageGroups]);
  const providerExecutionPackageCoverageReviewNeededChip = useMemo(() => {
    const totals = approvedProviderExecutionReviewReport?.summary.coverageGroupTotals;
    if (!totals) {
      return "검토 필요 정보 없음";
    }
    return `검토 필요 ${totals.unreviewedCount}`;
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageStalePriorityChip = useMemo(() => {
    const report = approvedProviderExecutionReviewReport;
    if (!report) {
      return "오래됨 우선순위 정보 없음";
    }
    const staleCount = report.summary.coverageGroupTotals.staleUnreviewedCount;
    return staleCount > 0
      ? `오래됨 우선 ${staleCount}개 / ${report.filters.staleDays}일 초과`
      : `${report.filters.staleDays}일 초과 오래된 패키지 없음`;
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageReviewActiveFilterLabels = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return [];
    }
    const { filters } = approvedProviderExecutionReviewReport;
    return [
      `검토 ${providerExecutionPackageReviewCoverageStatusLabels[filters.coveragePreset as ProviderExecutionPackageReviewCoverageStatus] ?? "모두"}`,
      filters.packageDigest ? `패키지 해시 ${filters.packageDigest.slice(0, 12)}` : null,
      filters.reviewerId ? `검토자 ${filters.reviewerId}` : null,
      filters.category !== "all" ? `메모 유형 ${getProviderExecutionPackageReviewNoteCategoryLabel(filters.category)}` : null,
      filters.executionId ? `실행 ${filters.executionId}` : null,
      `오래됨 기준 ${filters.staleDays}일`,
    ].filter((label): label is string => Boolean(label));
  }, [approvedProviderExecutionReviewReport]);
  const providerExecutionPackageCoverageGroupSummary = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return "제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.";
    }
    const totals = approvedProviderExecutionReviewReport.summary.coverageGroupTotals;
    return [
      "# 제공자 실행 패키지 검토 범위 그룹 요약",
      `- 필터: ${providerExecutionPackageReviewActiveFilterLabels.join(", ")}`,
      `- 표시 패키지: ${totals.totalCount}`,
      `- 검토 완료 패키지: ${totals.reviewedCount}`,
      `- 미검토 패키지: ${totals.unreviewedCount}`,
      `- 오래된 미검토 패키지: ${totals.staleUnreviewedCount}`,
      `- 표시 검토 메모: ${totals.noteCount}`,
      "",
      "## 그룹",
      ...providerExecutionPackageReviewCoverageGroups.map((group) => `- ${group.title}: ${group.rows.length}개 패키지`),
    ].join("\n");
  }, [
    approvedProviderExecutionReviewReport,
    providerExecutionPackageReviewActiveFilterLabels,
    providerExecutionPackageReviewCoverageGroups,
  ]);
  const providerExecutionPackageCoverageGroupSummarySizeChips = useMemo(
    () => [
      `요약 줄 ${providerExecutionPackageCoverageGroupSummary.split("\n").length}`,
      `요약 글자 ${providerExecutionPackageCoverageGroupSummary.length}`,
    ],
    [providerExecutionPackageCoverageGroupSummary],
  );
  const providerExecutionPackageCoverageGroupSummaryNextDownloadFilename = useMemo(
    () => approvedProviderExecutionReviewReport
      ? createProviderExecutionPackageCoverageSummaryFilename(approvedProviderExecutionReviewReport.generatedAt)
      : "다음 파일명 없음",
    [approvedProviderExecutionReviewReport],
  );
  const providerExecutionPackageCoverageGroupSummaryResetConfirmation = approvedProviderExecutionCoverageSummaryResetAt
    ? `마지막 로컬 초기화 ${approvedProviderExecutionCoverageSummaryResetAt}`
    : "로컬 초기화 전";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationTitle = approvedProviderExecutionCoverageSummaryResetAt
    ? `마지막 로컬 초기화가 ${approvedProviderExecutionCoverageSummaryResetAt}에 기록됐습니다. 요약 상태 초기화는 이 브라우저 전용 시각을 갱신합니다.`
    : "이 브라우저 세션에서는 아직 로컬 초기화를 실행하지 않았습니다.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopiedAtTitle =
    approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
      ? `초기화 확인 문구가 ${approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt}에 로컬로 복사됐습니다. 요약 상태 초기화는 이 브라우저 전용 복사 시각을 지웁니다.`
      : "초기화 확인 문구 복사가 로컬에서 성공할 때까지 복사 시각은 대기 상태입니다.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyStatusTitle =
    approvedProviderExecutionCoverageSummaryCopiedResetConfirmation
      ? "초기화 확인 문구가 전달 자료용으로 로컬 복사됐습니다. 요약 상태 초기화는 이 브라우저 전용 복사 상태를 지웁니다."
      : "초기화 확인 문구 복사가 로컬에서 성공할 때까지 복사 상태는 대기 중입니다.";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyFreshness =
    !approvedProviderExecutionCoverageSummaryResetAt
      ? "초기화 확인 문구 복사 최신성 대기"
      : approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
        ? "초기화 확인 문구 복사 최신"
        : "초기화 확인 문구 다시 복사 필요";
  const providerExecutionPackageCoverageGroupSummaryResetConfirmationFreshnessTitle =
    "초기화 전에는 대기 상태입니다. 초기화 후 최신 확인 문구를 복사해야 최신 상태가 됩니다.";
  const providerExecutionPackageCoverageSummaryCountChips = useMemo(() => {
    if (!approvedProviderExecutionReviewReport) {
      return [];
    }
    const totals = approvedProviderExecutionReviewReport.summary.coverageGroupTotals;
    return [
      `표시 ${totals.totalCount}`,
      `검토됨 ${totals.reviewedCount}`,
      `미검토 ${totals.unreviewedCount}`,
      `오래됨 ${totals.staleUnreviewedCount}`,
      `메모 ${totals.noteCount}`,
    ];
  }, [approvedProviderExecutionReviewReport]);
  const hasCustomCandidateFilters =
    filter !== "candidate" || riskFilter !== "all" || Boolean(candidateSearch.trim());
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

  const sortedApprovalGuardrails = useMemo(
    () => [...approvalGuardrails].sort((left, right) => {
      if (left.tone === right.tone) {
        return 0;
      }
      return left.tone === "warning" ? -1 : 1;
    }),
    [approvalGuardrails],
  );
  const sortedApprovalRiskGroups = useMemo(
    () => [...visibleApprovalRiskGroups].sort((left, right) => {
      if (left.warningCount === right.warningCount) {
        return 0;
      }
      return right.warningCount - left.warningCount;
    }),
    [visibleApprovalRiskGroups],
  );
  const sortedDraftReadiness = useMemo(
    () => [...draftReadiness].sort((left, right) => Number(left.ready) - Number(right.ready)),
    [draftReadiness],
  );
  const sortedApprovalPackageQuality = useMemo(
    () => [...approvalPackageQuality].sort((left, right) => Number(left.ready) - Number(right.ready)),
    [approvalPackageQuality],
  );
  const sortedFinalReviewChecklist = useMemo(
    () => [...finalReviewChecklist].sort((left, right) => Number(left.ready) - Number(right.ready)),
    [finalReviewChecklist],
  );
  const approvalReviewItems = useMemo(
    () => [
      structuredDraftApprovalIssue,
      ...draftReadiness.filter((item) => !item.ready).map((item) => `${item.label} 누락`),
      detail && detail.state !== "candidate" && detail.state !== "pending_review"
        ? `현재 상태 ${stateLabels[detail.state]}`
        : "",
    ].filter((item): item is string => Boolean(item)),
    [detail, draftReadiness, structuredDraftApprovalIssue],
  );

  const updateNavigationQuery = useCallback(
    (next: Partial<KnowledgeAdminNavigation>, mode: "push" | "replace" = "push") => {
      const url = createKnowledgeAdminNavigationHref(pathname, new URLSearchParams(searchParams.toString()), next);
      if (mode === "replace") {
        router.replace(url, { scroll: false });
        return;
      }
      router.push(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const syncNavigationFromSearchParams = useCallback(() => {
    const navigation = parseKnowledgeAdminNavigation(new URLSearchParams(searchParams.toString()));
    setActiveWorkTab((current) => current === navigation.work ? current : navigation.work);
    setActiveCandidateTab((current) => current === navigation.candidateTab ? current : navigation.candidateTab);
    setActiveDraftSubview((current) => current === navigation.draftSubview ? current : navigation.draftSubview);
    setApprovedSyncTarget((current) => current === navigation.approvedSyncTarget ? current : navigation.approvedSyncTarget);
    setLocalImportPreviewId((current) => current === navigation.importPreviewId ? current : navigation.importPreviewId);
    setSelectedRubricId((current) => current === navigation.rubricId ? current : navigation.rubricId);
  }, [searchParams]);

  const setWorkTab = useCallback(
    (nextTab: KnowledgeWorkTab) => {
      setNavigationStatus("");
      setActiveWorkTab(nextTab);
      updateNavigationQuery({ work: nextTab });
    },
    [updateNavigationQuery],
  );

  const setCandidateTab = useCallback(
    (nextTab: KnowledgeCandidateTab) => {
      setNavigationStatus("");
      setActiveCandidateTab(nextTab);
      updateNavigationQuery({ work: "candidates", candidateTab: nextTab });
    },
    [updateNavigationQuery],
  );

  const setDraftSubview = useCallback(
    (nextSubview: KnowledgeDraftSubview) => {
      setNavigationStatus("");
      setActiveWorkTab("candidates");
      setActiveCandidateTab("draft");
      setActiveDraftSubview(nextSubview);
      updateNavigationQuery({ work: "candidates", candidateTab: "draft", draftSubview: nextSubview });
    },
    [updateNavigationQuery],
  );

  const setApprovedSyncTargetWithQuery = useCallback(
    (nextTarget: ApprovedSyncTarget) => {
      setNavigationStatus("");
      setApprovedSyncTarget(nextTarget);
      updateNavigationQuery({ work: "approved", approvedFocus: "export_sync", approvedSyncTarget: nextTarget });
    },
    [updateNavigationQuery],
  );

  const confirmDirtyDraftNavigation = useCallback(
    (nextCandidateId: string) => {
      if (!dirtyDraftCount || nextCandidateId === selectedId) {
        return true;
      }
      return window.confirm("초안에 저장되지 않은 수정이 있습니다. 다른 후보로 이동할까요?");
    },
    [dirtyDraftCount, selectedId],
  );

  const selectCandidate = useCallback(
    (nextCandidateId: string) => {
      if (!confirmDirtyDraftNavigation(nextCandidateId)) {
        return;
      }
      setNavigationStatus("");
      setActiveWorkTab("candidates");
      setSelectedId(nextCandidateId);
      updateNavigationQuery({ work: "candidates", candidateId: nextCandidateId });
    },
    [confirmDirtyDraftNavigation, updateNavigationQuery],
  );

  const selectApprovedItem = useCallback(
    (nextApprovedId: string) => {
      setNavigationStatus("");
      setSelectedApprovedId(nextApprovedId);
      updateNavigationQuery({
        work: "approved",
        approvedId: nextApprovedId,
        approvedFocus: activeWorkTab === "approved" ? parseKnowledgeAdminNavigation(new URLSearchParams(searchParams.toString())).approvedFocus : "readback",
      });
    },
    [activeWorkTab, searchParams, updateNavigationQuery],
  );

  const handleWorkTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const nextTab = readNextTabFromKeyboard(knowledgeWorkTabs, activeWorkTab, event);
      if (!nextTab) {
        return;
      }
      event.preventDefault();
      setWorkTab(nextTab);
      window.requestAnimationFrame(() => document.getElementById(knowledgeWorkTabDomId(nextTab))?.focus());
    },
    [activeWorkTab, setWorkTab],
  );

  const handleCandidateTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const nextTab = readNextTabFromKeyboard(knowledgeCandidateTabs, activeCandidateTab, event);
      if (!nextTab) {
        return;
      }
      event.preventDefault();
      setCandidateTab(nextTab);
      window.requestAnimationFrame(() => document.getElementById(knowledgeCandidateTabDomId(nextTab))?.focus());
    },
    [activeCandidateTab, setCandidateTab],
  );

  const reconcileCandidateNavigation = useCallback(() => {
    const queryCandidateId = searchParams.get("candidateId")?.trim() ?? "";
    if (queryCandidateId) {
      if (candidates.some((candidate) => candidate.id === queryCandidateId)) {
        if (selectedId !== queryCandidateId) {
          if (!confirmDirtyDraftNavigation(queryCandidateId)) {
            setActiveWorkTab("candidates");
            updateNavigationQuery({ work: "candidates", candidateId: selectedId }, "replace");
            return;
          }
          setSelectedId(queryCandidateId);
        }
        return;
      }
      const fallbackId = candidates[0]?.id ?? "";
      if (selectedId !== fallbackId) {
        setSelectedId(fallbackId);
      }
      setNavigationStatus("URL의 후보 ID를 찾지 못해 기본 후보로 이동했습니다.");
      updateNavigationQuery({ candidateId: "" }, "replace");
      return;
    }

    if (!selectedId && candidates[0]) {
      setSelectedId(candidates[0].id);
    }
  }, [candidates, confirmDirtyDraftNavigation, searchParams, selectedId, updateNavigationQuery]);

  const reconcileApprovedNavigation = useCallback(() => {
    if (!approvedItemsLoaded) {
      return;
    }
    const queryApprovedId = searchParams.get("approvedId")?.trim() ?? "";
    if (queryApprovedId) {
      if (approvedItems.some((item) => item.id === queryApprovedId)) {
        if (selectedApprovedId !== queryApprovedId) {
          setSelectedApprovedId(queryApprovedId);
        }
        return;
      }
      const fallbackId = approvedItems[0]?.id ?? "";
      if (selectedApprovedId !== fallbackId) {
        setSelectedApprovedId(fallbackId);
      }
      setNavigationStatus("URL의 승인 WIKI ID를 찾지 못해 기본 승인 항목으로 이동했습니다.");
      updateNavigationQuery({ approvedId: "" }, "replace");
      return;
    }

    if (!selectedApprovedId && approvedItems[0]) {
      setSelectedApprovedId(approvedItems[0].id);
    }
  }, [approvedItems, approvedItemsLoaded, searchParams, selectedApprovedId, updateNavigationQuery]);

  const reconcileAuxiliaryNavigation = useCallback(() => {
    const queryDiscoveryId = searchParams.get("discoveryId")?.trim() ?? "";
    if (queryDiscoveryId && discoveryRequests.length && !discoveryRequests.some((request) => request.id === queryDiscoveryId)) {
      updateNavigationQuery({ discoveryId: "" }, "replace");
      setNavigationStatus("URL의 자동 발굴 요청 ID를 찾지 못해 힌트를 지웠습니다.");
    }

    const queryImportPreviewId = searchParams.get("importPreviewId")?.trim() ?? "";
    if (queryImportPreviewId && importPreviews.length && !importPreviews.some((preview) => preview.id === queryImportPreviewId)) {
      setLocalImportPreviewId(importPreviews[0]?.id ?? "");
      updateNavigationQuery({ importPreviewId: importPreviews[0]?.id ?? "" }, "replace");
      setNavigationStatus("URL의 로컬 WIKI 미리보기 ID를 찾지 못해 기본 미리보기로 이동했습니다.");
    }

    const queryRubricId = searchParams.get("rubricId")?.trim() ?? "";
    if (queryRubricId && importRubrics.length && !importRubrics.some((rubric) => rubric.id === queryRubricId)) {
      const fallbackRubricId = importRubrics.find((rubric) => rubric.state === "active")?.id ?? importRubrics[0]?.id ?? "";
      setSelectedRubricId(fallbackRubricId);
      updateNavigationQuery({ rubricId: fallbackRubricId }, "replace");
      setNavigationStatus("URL의 기준 ID를 찾지 못해 활성 기준으로 이동했습니다.");
    }
  }, [discoveryRequests, importPreviews, importRubrics, searchParams, updateNavigationQuery]);

  useEffect(() => {
    syncNavigationFromSearchParams();
  }, [syncNavigationFromSearchParams]);

  useEffect(() => {
    reconcileCandidateNavigation();
  }, [reconcileCandidateNavigation]);

  useEffect(() => {
    reconcileApprovedNavigation();
  }, [reconcileApprovedNavigation]);

  useEffect(() => {
    reconcileAuxiliaryNavigation();
  }, [reconcileAuxiliaryNavigation]);

  useEffect(() => {
    const navigation = parseKnowledgeAdminNavigation(new URLSearchParams(searchParams.toString()));
    if (activeWorkTab !== "approved" || navigation.approvedFocus !== "export_sync") {
      return;
    }
    window.requestAnimationFrame(() => {
      const target = document.getElementById("approved-wiki-export-sync");
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      target?.focus();
    });
  }, [activeWorkTab, searchParams]);

  useEffect(() => {
    if (!dirtyDraftCount) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyDraftCount]);

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
        setStatus(error instanceof Error ? error.message : "승인된 WIKI 동기화 이력을 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshDiscoveryRequests = useCallback(async () => {
    const data = await readJson<DiscoveryRequestView[]>("/api/admin/knowledge/discovery-requests");
    setDiscoveryRequests(data);
    return data;
  }, []);

  const refreshImportPreviews = useCallback(async () => {
    const data = await readJson<ImportPreviewView[]>("/api/admin/knowledge/import-previews");
    setImportPreviews(data);
    if (!localImportPreviewId && data[0]) {
      setLocalImportPreviewId(data[0].id);
    }
    return data;
  }, [localImportPreviewId]);

  const refreshImportRubrics = useCallback(async () => {
    const data = await readJson<ImportRubricView[]>("/api/admin/knowledge/rubrics");
    setImportRubrics(data);
    return data;
  }, []);

  const refreshGenerationProfiles = useCallback(async () => {
    setGenerationProfilesLoading(true);
    setGenerationProfilesError("");
    try {
      const data = await readJson<KnowledgeGenerationProfile[]>("/api/admin/knowledge/generation-profiles");
      setGenerationProfiles(data);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation profiles could not be loaded.";
      setGenerationProfilesError(message);
      throw error;
    } finally {
      setGenerationProfilesLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshDiscoveryRequests().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "자동 발굴 요청을 불러오지 못했습니다.");
    });
  }, [refreshDiscoveryRequests]);

  useEffect(() => {
    refreshImportPreviews().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 가져오기 미리보기를 불러오지 못했습니다.");
    });
    refreshImportRubrics().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 가져오기 기준을 불러오지 못했습니다.");
    });
  }, [refreshImportPreviews, refreshImportRubrics]);

  useEffect(() => {
    refreshGenerationProfiles().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "생성 프로필을 불러오지 못했습니다.");
    });
  }, [refreshGenerationProfiles]);

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
        setStatus(error instanceof Error ? error.message : "승인된 WIKI 동기화 대상 설정을 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "규정 거버넌스 리포트를 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "규정 출처 검토 범위를 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "파일 분석 청크 디버그 리포트를 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "지식 운영 리포트를 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "제공자 실행 패키지 이력을 불러오지 못했습니다.");
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
        setStatus(error instanceof Error ? error.message : "제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.");
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
    if (!approvedItemsUrl) {
      setApprovedItems([]);
      setApprovedItemsLoaded(true);
      return;
    }
    let active = true;
    setApprovedItems([]);
    setApprovedItemsLoaded(false);
    readJson<ApprovedKnowledgeItem[]>(approvedItemsUrl)
      .then((data) => {
        if (!active) {
          return;
        }
        setApprovedItems(data);
        setApprovedItemsLoaded(true);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setApprovedItemsLoaded(true);
        setStatus(error instanceof Error ? error.message : "승인된 WIKI 항목을 불러오지 못했습니다.");
      });

    return () => {
      active = false;
    };
  }, [approvedItemsUrl]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setSourceBuckets([]);
      setStructuredDraftResult(null);
      return;
    }

    let active = true;
    setBusy(true);
    setStatus("후보 상세를 불러오는 중입니다.");
    setStructuredDraftResult(null);
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

  useEffect(() => {
    if (!detail) {
      setSourceBuckets([]);
      setSourceBucketsError("");
      setSourceBucketsLoading(false);
      return;
    }

    let active = true;
    setSourceBucketsLoading(true);
    setSourceBucketsError("");
    readJson<KnowledgeSourceBucketView[]>(`/api/admin/knowledge/candidates/${detail.id}/source-buckets`)
      .then((data) => {
        if (!active) {
          return;
        }
        setSourceBuckets(data);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }
        setSourceBuckets([]);
        setSourceBucketsError(error instanceof Error ? error.message : "출처 버킷을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) {
          setSourceBucketsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [detail]);

  async function refreshCandidates(nextSelectedId = selectedId) {
    const data = await readJson<CandidateListItem[]>("/api/admin/knowledge/candidates");
    setCandidates(data);
    setSelectedId(nextSelectedId);
  }

  async function refreshApprovedItems() {
    if (!approvedItemsUrl) {
      setApprovedItems([]);
      setApprovedItemsLoaded(true);
      setStatus("현재 프로젝트가 선택되지 않아 승인된 WIKI 항목을 불러오지 않았습니다.");
      return;
    }
    try {
      const data = await readJson<ApprovedKnowledgeItem[]>(approvedItemsUrl);
      setApprovedItems(data);
      setApprovedItemsLoaded(true);
      if (!selectedApprovedId && data[0]) {
        setSelectedApprovedId(data[0].id);
      }
    } catch (error) {
      setApprovedItemsLoaded(true);
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 항목을 불러오지 못했습니다.");
    }
  }

  async function refreshRegulationGovernance() {
    setRegulationGovernanceLoading(true);
    try {
      const data = await readJson<RegulationGovernanceReport>("/api/admin/knowledge/regulation-governance");
      setRegulationGovernance(data);
      await refreshRegulationSourceReviewCoverage();
      setStatus(`규정 거버넌스를 불러왔습니다: 출처 ${data.sourceCount}개, 기한 초과 ${data.statusCounts.overdue}개.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "규정 거버넌스 리포트를 불러오지 못했습니다.");
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
      setStatus(`파일 분석 청크를 불러왔습니다: 청크 ${data.database.totalChunks}개, 임베딩 누락 ${data.database.missingEmbeddings}개.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "파일 분석 청크 디버그 리포트를 불러오지 못했습니다.");
    }
  }

  async function refreshKnowledgeSyncWorker() {
    try {
      const data = await readJson<KnowledgeExternalSyncWorkerReport>("/api/admin/knowledge/sync-worker");
      setKnowledgeSyncWorker(data);
      setStatus(`지식 동기화 worker를 불러왔습니다: 제공자 실행 가능 audit ${data.queue.pendingProviderReadyAudits}개 대기 중.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "지식 동기화 worker 리포트를 불러오지 못했습니다.");
    }
  }

  async function copyRegulationGovernanceReport() {
    if (!regulationGovernance) {
      setStatus("규정 거버넌스 리포트를 아직 불러오지 못했습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(createRegulationGovernanceReport(regulationGovernance));
      setStatus("규정 거버넌스 리포트를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 규정 거버넌스 패널을 직접 확인하세요.");
    }
  }

  async function saveRegulationGovernanceAcknowledgement() {
    if (!regulationGovernance) {
      setStatus("규정 거버넌스 리포트를 아직 불러오지 못했습니다.");
      return;
    }
    if (!regulationGovernanceAcknowledgementNote.trim()) {
      setStatus("규정 거버넌스 확인 메모가 필요합니다.");
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
      setStatus(`${data.packageId} 규정 거버넌스 확인 메모를 저장했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "규정 거버넌스 확인 메모를 저장하지 못했습니다.");
    } finally {
      setRegulationGovernanceAcknowledgementSaving(false);
    }
  }

  async function saveRegulationGovernanceSourceReview(sourceId: string) {
    if (!regulationGovernance) {
      setStatus("규정 거버넌스 리포트를 아직 불러오지 못했습니다.");
      return;
    }
    const note = regulationGovernanceSourceReviewNotes[sourceId]?.trim() ?? "";
    if (!note) {
      setStatus("규정 거버넌스 출처 검토 메모가 필요합니다.");
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
      setStatus(`${sourceId} 출처 검토를 저장했습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "규정 거버넌스 출처 검토를 저장하지 못했습니다.");
    } finally {
      setRegulationGovernanceSourceReviewSaving("");
    }
  }

  function resetDraft() {
    if (!detail) {
      return;
    }

    setDraft(createDraftFromDetail(detail));
    setStatus("선택한 후보에서 초안을 복원했습니다.");
  }

  async function generateStructuredDraft() {
    if (!detail) {
      setStatus("구조화 초안을 만들 후보가 없습니다.");
      return;
    }

    setStructuredDraftGenerating(true);
    setStatus("구조화 WIKI 초안을 생성하는 중입니다.");
    try {
      const data = await writeJson<GenerateStructuredKnowledgeDraftResult>(
        `/api/admin/knowledge/candidates/${detail.id}/structured-draft`,
        {},
      );
      setStructuredDraftResult(data);
      applyStructuredDraftToLegacy(data.draft);
      setDraftSubview("sources");
      setStatus(
        data.draft.approvalReadiness.status === "blocked"
          ? "구조화 초안을 생성했지만 차단 항목이 있습니다. 출처 버킷과 TOC를 먼저 확인하세요."
          : "구조화 초안을 생성하고 현재 승인 초안에 반영했습니다.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "구조화 초안 생성에 실패했습니다.");
    } finally {
      setStructuredDraftGenerating(false);
    }
  }

  function updateStructuredDraft(nextDraft: StructuredKnowledgeDraft) {
    setStructuredDraftResult((current) => current ? { ...current, draft: nextDraft } : current);
    applyStructuredDraftToLegacy(nextDraft);
  }

  function applyCurrentStructuredDraft() {
    if (!structuredDraftResult) {
      setStatus("반영할 구조화 초안이 없습니다.");
      return;
    }
    applyStructuredDraftToLegacy(structuredDraftResult.draft);
    setStatus("구조화 초안을 현재 Markdown 본문과 기본 필드에 반영했습니다.");
  }

  function applyStructuredDraftToLegacy(nextDraft: StructuredKnowledgeDraft) {
    setDraft((current) => ({
      ...current,
      title: nextDraft.title || current.title,
      summary: nextDraft.summary || current.summary,
      bodyMarkdown: nextDraft.markdown || current.bodyMarkdown,
      tagsText: nextDraft.tags.join(", "),
      scope: nextDraft.ontology.scope as Scope,
    }));
  }

  function applyRejectionReasonPreset(preset: RejectionReasonPreset) {
    setDraft((current) => ({
      ...current,
      rejectionReason: preset.reason,
    }));
    setStatus(`반려 사유 프리셋을 적용했습니다: ${preset.label}`);
  }

  async function copyDraftMarkdown() {
    if (!draft.bodyMarkdown.trim()) {
      setStatus("복사할 Markdown 본문이 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draft.bodyMarkdown);
      setStatus("Markdown 초안을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. Markdown 본문을 직접 선택하세요.");
    }
  }

  async function copySourceHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createSourceHandoff(detail, draft, evidenceKindCounts));
      setStatus("출처 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 출처 칩을 보고 전달 자료를 직접 구성하세요.");
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
      setStatus("승인 체크리스트를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. guardrail을 직접 확인하세요.");
    }
  }

  async function copyApprovalRiskSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 승인 리스크 요약",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 경고 그룹: ${approvalRiskWarningGroupCount}/${approvalRiskGroups.length}`,
          `- 경고: ${guardrailWarningCount}`,
          "",
          ...approvalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- 경고: ${group.warningCount}`,
            `- 준비됨: ${group.readyCount}`,
            ...group.items
              .filter((item) => item.tone === "warning")
              .map((item) => `- ${item.label}: ${item.detail}`),
            group.warningCount ? "" : "- 경고 없음",
            "",
          ]),
        ].join("\n"),
      );
      setStatus("승인 리스크 요약을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인 리스크 요약을 직접 확인하세요.");
    }
  }

  async function copyApprovalRiskFilterHandoff() {
    if (!detail) {
      return;
    }

    const activeLabel = approvalRiskFilter === "all"
      ? "전체 리스크 그룹"
      : approvalRiskGroups.find((group) => group.key === approvalRiskFilter)?.label ?? approvalRiskFilter;
    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 승인 리스크 필터 전달 자료",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 활성 리스크 그룹: ${activeLabel}`,
          `- 표시: ${visibleApprovalRiskGroups.length}/${approvalRiskGroups.length}`,
          "",
          ...visibleApprovalRiskGroups.flatMap((group) => [
            `## ${group.label}`,
            `- 경고: ${group.warningCount}`,
            `- 준비됨: ${group.readyCount}`,
            ...(
              group.warningCount
                ? group.items
                  .filter((item) => item.tone === "warning")
                  .map((item) => `- 경고: ${item.label} - ${item.detail}`)
                : [`- 현재 초안에는 ${group.label} 경고가 없습니다.`]
            ),
            ...group.items
              .filter((item) => item.tone === "ready")
              .slice(0, 4)
              .map((item) => `- 준비됨: ${item.label}`),
            "",
          ]),
        ].join("\n"),
      );
      setStatus("승인 리스크 필터 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 활성 리스크 필터 칩을 직접 확인하세요.");
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
      setStatus("승인 결정 메모를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인 결정 맥락을 직접 확인하세요.");
    }
  }

  async function copyRejectionReason() {
    if (!detail) {
      return;
    }

    const reason = draft.rejectionReason.trim();
    if (!reason) {
      setStatus("복사할 반려 사유가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 반려 사유",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 검토 상태: ${reviewStatus.label}`,
          "",
          reason,
        ].join("\n"),
      );
      setStatus("반려 사유를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 반려 사유를 직접 확인하세요.");
    }
  }

  async function copyApprovalBlockers() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovalBlockerHandoff(detail, approvalGuardrails, approvalRiskGroups));
      setStatus("승인 차단 조건을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인 제출 guardrail을 직접 확인하세요.");
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
      setStatus("승인 패키지를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인 패키지 맥락을 직접 확인하세요.");
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
      setStatus("승인 패키지 품질을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 패키지 품질 점검을 직접 확인하세요.");
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
      setStatus("최종 검토 마감을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 최종 검토 마감 점검을 직접 확인하세요.");
    }
  }

  async function copyCandidateFilterHandoff() {
    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 후보 큐 전달 자료",
          `- 상태: ${filter === "all" ? "전체" : stateLabels[filter]}`,
          `- 리스크: ${candidateRiskFilterLabels[riskFilter]}`,
          `- 정렬: ${candidateSortLabels[candidateSort]}`,
          `- 검색: ${candidateSearch.trim() || "없음"}`,
          `- 표시: ${visibleCandidates.length}/${candidates.length}`,
          `- 선택: ${selectedCandidate ? `${selectedCandidate.title} (${selectedCandidate.id})` : "없음"}`,
        ].join("\n"),
      );
      setStatus("후보 필터 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 활성 필터 칩을 직접 확인하세요.");
    }
  }

  async function copyEvidenceFilterHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 근거 필터 전달 자료",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 출처 필터: ${evidenceSourceFilterLabels[evidenceSourceFilter]}`,
          `- 우선순위 필터: ${evidencePriorityFilterLabels[evidencePriorityFilter]}`,
          `- 표시된 근거: ${visibleEvidence.length}/${detail.evidence.length}`,
          "",
          "표시된 근거",
          ...visibleEvidence.map((item) => `- ${item.title} (${item.kind}, ${readEvidencePriorityTier(item.priority)}, 우선순위 ${item.priority})`),
        ].join("\n"),
      );
      setStatus("근거 필터 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 근거 필터 칩을 직접 확인하세요.");
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
          "# 지식 초안 변경 요약",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 변경된 필드: ${changedFields.length}/${draftDirtyStates.length}`,
          `- 필드: ${changedFields.join(", ") || "없음"}`,
          `- 범위: ${scopeLabels[draft.scope]}`,
          `- 태그: ${draftTags.join(", ") || "없음"}`,
        ].join("\n"),
      );
      setStatus("초안 변경 요약을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 변경 상태 표시를 직접 확인하세요.");
    }
  }

  async function copyMarkdownOutline() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 Markdown 개요",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 제목: ${markdownOutline.length}`,
          "",
          ...(
            markdownOutline.length
              ? markdownOutline.map((heading) => `- H${heading.level} L${heading.line}: ${heading.text}`)
              : ["- Markdown 제목 없음"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown 개요를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. Markdown 개요를 직접 확인하세요.");
    }
  }

  async function copyMarkdownStructureSummary() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 Markdown 구조 요약",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 제목: ${markdownStructureSummary.headings}`,
          `- 문단: ${markdownStructureSummary.paragraphs}`,
          `- 목록 항목: ${markdownStructureSummary.listItems}`,
          `- 비어 있지 않은 줄: ${markdownStructureSummary.lines}`,
        ].join("\n"),
      );
      setStatus("Markdown 구조 요약을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. Markdown 구조 요약을 직접 확인하세요.");
    }
  }

  async function copyMarkdownWikiLinks() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 Markdown WIKI 링크",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- WIKI 링크: ${markdownWikiLinks.length}`,
          "",
          ...(
            markdownWikiLinks.length
              ? markdownWikiLinks.map((link) => `- L${link.line}: [[${link.target}]]${link.label !== link.target ? ` 표시명 ${link.label}` : ""}`)
              : ["- Markdown WIKI 링크 없음"]
          ),
        ].join("\n"),
      );
      setStatus("Markdown WIKI 링크를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. Markdown WIKI 링크 미리보기를 직접 확인하세요.");
    }
  }

  async function copyDraftTagHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 초안 태그 전달 자료",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 태그: ${draftTags.length}`,
          `- 중복 태그: ${duplicateDraftTags.join(", ") || "없음"}`,
          "",
          ...(
            draftTags.length
              ? draftTags.map((tag) => `- ${tag}`)
              : ["- 초안 태그 없음"]
          ),
        ].join("\n"),
      );
      setStatus("초안 태그 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 초안 태그 미리보기를 직접 확인하세요.");
    }
  }

  async function copyScopeHandoff() {
    if (!detail) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        [
          "# 지식 공개 범위 전달 자료",
          `- 후보: ${detail.title} (${detail.id})`,
          `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
          `- 현재 범위: ${scopeLabels[draft.scope]}`,
          `- 원래 범위: ${originalDraft ? scopeLabels[originalDraft.scope] : "알 수 없음"}`,
          `- 범위 변경: ${scopeReview.changed ? "예" : "아니오"}`,
          `- 범위 검토: ${scopeReview.label}`,
          `- 검토 메모: ${scopeReview.detail}`,
        ].join("\n"),
      );
      setStatus("공개 범위 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 공개 범위 미리보기를 직접 확인하세요.");
    }
  }

  async function approveCandidate() {
    if (!detail) {
      return;
    }
    if (structuredDraftApprovalIssue) {
      setStatus(structuredDraftApprovalIssue);
      setDraftSubview("sources");
      return;
    }
    if (!structuredDraftResult) {
      setStatus("구조화 WIKI 초안을 먼저 생성해야 승인할 수 있습니다.");
      setDraftSubview("sources");
      return;
    }

    setBusy(true);
    setStatus("WIKI 지식으로 승인하는 중입니다.");
    try {
      const data = await writeJson<CandidateDetail>(`/api/admin/knowledge/candidates/${detail.id}/approve`, {
        structuredDraft: structuredDraftResult.draft,
        generationRunId: structuredDraftResult.generationRunId,
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

  async function runDiscoveryScan() {
    setBusy(true);
    setStatus("완료된 task에서 자동 발굴 요청을 선별하는 중입니다.");
    try {
      const result = await writeJson<{ scanId: string; scannedTaskCount: number; createdRequestCount: number }>(
        "/api/admin/knowledge/discovery-requests/scan",
        {},
      );
      const requests = await refreshDiscoveryRequests();
      const createdRequestId = requests.find((request) => request.scanId === result.scanId)?.id ?? "";
      setActiveWorkTab("candidates");
      updateNavigationQuery({ work: "candidates", discoveryId: createdRequestId });
      setStatus(`자동 발굴 요청을 갱신했습니다. task ${result.scannedTaskCount}개 중 요청 ${result.createdRequestCount}개를 만들었습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "자동 발굴 요청 갱신에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function promoteDiscoveryRequest(requestId: string) {
    setBusy(true);
    setStatus("자동 발굴 요청을 WIKI 후보로 승격하는 중입니다.");
    try {
      const record = await writeJson<{ id: string }>(
        `/api/admin/knowledge/discovery-requests/${requestId}/promote`,
        {},
      );
      await refreshDiscoveryRequests();
      await refreshCandidates(record.id);
      setActiveWorkTab("candidates");
      setActiveCandidateTab("evidence");
      setSelectedId(record.id);
      updateNavigationQuery({
        work: "candidates",
        candidateTab: "evidence",
        candidateId: record.id,
        discoveryId: requestId,
      });
      setStatus("자동 발굴 요청을 SaaS 검토 대기 후보로 승격했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "자동 발굴 요청 승격에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function dismissDiscoveryRequest(requestId: string) {
    setBusy(true);
    setStatus("자동 발굴 요청을 제외하는 중입니다.");
    try {
      await writeJson<DiscoveryRequestView>(
        `/api/admin/knowledge/discovery-requests/${requestId}/dismiss`,
        {},
      );
      await refreshDiscoveryRequests();
      updateNavigationQuery({ work: "candidates", discoveryId: requestId });
      setStatus("자동 발굴 요청을 제외했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "자동 발굴 요청 제외에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function createLocalImportPreview() {
    const defaultTaskId = localImportDefaultTaskValue;
    if (!defaultTaskId) {
      setStatus("로컬 WIKI 가져오기 미리보기를 만들려면 후보를 선택하거나 기본 task ID를 입력하세요.");
      return;
    }

    setBusy(true);
    setStatus("차단 규칙을 적용해 로컬 WIKI 가져오기 미리보기를 만드는 중입니다.");
    try {
      const preview = await writeJson<ImportPreviewView>("/api/admin/knowledge/import-previews", {
        defaultTaskId,
        workspaceFingerprint: `knowledge-admin-ui:${defaultTaskId}:${new Date().toISOString()}`,
        items: createLocalImportPreviewItems({ defaultTaskId, detail, draft, selectedCandidate }),
      });
      setLocalImportDefaultTaskId(defaultTaskId);
      setLocalImportPreviewId(preview.id);
      setSelectedRubricId(preview.rubricId);
      await refreshImportPreviews();
      await refreshImportRubrics();
      setActiveWorkTab("local_import");
      updateNavigationQuery({
        work: "local_import",
        importPreviewId: preview.id,
        rubricId: preview.rubricId,
      });
      setStatus(`균형 선별 미리보기를 만들었습니다. 포함 ${countJsonArrayItems(preview.includedItems)}개, 제외 ${countJsonArrayItems(preview.excludedItems)}개.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 가져오기 미리보기 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmLocalImportPreview() {
    if (!activeImportPreview) {
      setStatus("확정할 로컬 WIKI 가져오기 미리보기가 없습니다.");
      return;
    }
    setBusy(true);
    setStatus("로컬 WIKI 가져오기 미리보기를 확정하는 중입니다.");
    try {
      const preview = await writeJson<ImportPreviewView>(
        `/api/admin/knowledge/import-previews/${activeImportPreview.id}/confirm`,
        {},
      );
      setLocalImportPreviewId(preview.id);
      setSelectedRubricId(preview.rubricId);
      await refreshImportPreviews();
      updateNavigationQuery({
        work: "local_import",
        importPreviewId: preview.id,
        rubricId: preview.rubricId,
      });
      setStatus("미리보기를 확정했습니다. 아직 후보는 생성하지 않았습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 가져오기 미리보기 확정에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function importLocalImportPreview() {
    if (!activeImportPreview) {
      setStatus("후보로 가져올 로컬 WIKI 가져오기 미리보기가 없습니다.");
      return;
    }
    setBusy(true);
    setStatus("확정된 로컬 WIKI 미리보기를 후보로 가져오는 중입니다.");
    try {
      const records = await writeJson<Array<{ id: string }>>(
        `/api/admin/knowledge/import-previews/${activeImportPreview.id}/import`,
        {},
      );
      const nextCandidateId = records[0]?.id ?? selectedId;
      await refreshImportPreviews();
      await refreshCandidates(nextCandidateId);
      if (nextCandidateId) {
        setSelectedId(nextCandidateId);
      }
      setActiveWorkTab("candidates");
      setActiveCandidateTab("evidence");
      updateNavigationQuery({
        work: "candidates",
        candidateTab: "evidence",
        candidateId: nextCandidateId,
        importPreviewId: activeImportPreview.id,
        rubricId: activeImportPreview.rubricId,
      });
      setStatus(`확정된 미리보기에서 WIKI 후보 ${records.length}개를 만들었습니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 미리보기 후보 가져오기에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function rollbackActiveRubric() {
    const archivedRubric = importRubrics.find((rubric) => rubric.state === "archived");
    if (!archivedRubric) {
      setStatus("롤백할 보관된 기준 버전이 없습니다.");
      return;
    }
    if (!rubricRollbackReason.trim()) {
      setStatus("기준 롤백 사유를 입력하세요.");
      return;
    }
    setBusy(true);
    setStatus("로컬 WIKI 가져오기 기준을 롤백하는 중입니다.");
    try {
      const rubric = await writeJson<ImportRubricView>(
        `/api/admin/knowledge/rubrics/${archivedRubric.id}/rollback`,
        { reason: rubricRollbackReason.trim() },
      );
      setSelectedRubricId(rubric.id);
      await refreshImportRubrics();
      updateNavigationQuery({ work: "local_import", rubricId: rubric.id });
      setStatus(`${rubric.name} v${rubric.version} 기준으로 롤백했습니다. audit 이벤트가 보존됩니다.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "로컬 WIKI 가져오기 기준 롤백에 실패했습니다.");
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
    if (
      selectedCandidate.state === "candidate" ||
      selectedCandidate.state === "pending_review" ||
      selectedCandidate.state === "approved" ||
      selectedCandidate.state === "rejected"
    ) {
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
      setStatus("승인된 WIKI Markdown을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인된 Markdown 미리보기를 직접 확인하세요.");
    }
  }

  async function copyApprovedItemHandoff() {
    if (!selectedApprovedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovedItemHandoff(selectedApprovedItem, approvedQualityChecks));
      setStatus("승인된 WIKI 항목 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인된 WIKI 상세를 직접 확인하세요.");
    }
  }

  async function copyApprovedSearchHandoff() {
    try {
      await navigator.clipboard.writeText(
        createApprovedSearchHandoff(visibleApprovedItems, activeApprovedFilterChips, approvedSourceCoverage),
      );
      setStatus("승인된 WIKI 검색 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인된 WIKI 필터를 직접 확인하세요.");
    }
  }

  async function copyApprovedSourcePackage() {
    if (!selectedApprovedItem) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createApprovedSourcePackage(selectedApprovedItem));
      setStatus("승인된 WIKI 출처 패키지를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 출처 참조를 직접 확인하세요.");
    }
  }

  async function copyApprovedIndexPackage() {
    try {
      await navigator.clipboard.writeText(createApprovedIndexPackage(visibleApprovedItems, activeApprovedFilterChips));
      setStatus("승인된 WIKI 색인 패키지를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인된 WIKI 목록을 직접 확인하세요.");
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
      setStatus("승인된 WIKI 동기화 명세를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 내보내기 준비 패널을 직접 확인하세요.");
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
      setStatus("승인된 WIKI 내보내기 체크리스트를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 내보내기 체크리스트를 직접 확인하세요.");
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
    setStatus(`승인된 WIKI ${approvedExportFormatLabels[approvedExportFormat]}를 다운로드했습니다.`);
  }

  async function recordApprovedSyncDryRun() {
    if (!currentProjectId) {
      setStatus("현재 프로젝트가 선택되지 않아 승인된 WIKI 동기화 사전 실행을 저장하지 않았습니다.");
      return;
    }
    try {
      const run = await writeJson<ApprovedSyncRun>(
        "/api/admin/knowledge/export-audits",
        createApprovedSyncAuditPayload(
          currentProjectId,
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
      setStatus("승인된 WIKI 동기화 사전 실행을 서버 감사 이력에 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 동기화 사전 실행을 저장하지 못했습니다.");
    }
  }

  async function runGuardedApprovedSync() {
    if (!currentProjectId) {
      setStatus("현재 프로젝트가 선택되지 않아 승인된 WIKI 보호 동기화를 저장하지 않았습니다.");
      return;
    }
    try {
      const run = await writeJson<ApprovedSyncRun>(
        "/api/admin/knowledge/export-audits",
        createApprovedSyncAuditPayload(
          currentProjectId,
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
        setStatus("승인된 WIKI 제공자 동기화가 서버 보호 조건을 통과했고 설정된 제공자 실행 준비가 끝났습니다.");
        return;
      }
      if (run.status === "provider_blocked") {
        setStatus("승인된 WIKI 동기화 감사를 저장했습니다. 대상 설정이 켜질 때까지 제공자 실행은 차단됩니다.");
        return;
      }
      setStatus(
        run.status === "blocked"
          ? "승인된 WIKI 보호 동기화가 차단되었고 서버 감사 이력에 저장됐습니다."
          : "승인된 WIKI 보호 동기화 감사를 저장했습니다.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 보호 동기화를 저장하지 못했습니다.");
    }
  }

  async function copyApprovedSyncHistoryReport() {
    try {
      await navigator.clipboard.writeText(createApprovedSyncHistoryReport(approvedSyncHistory));
      setStatus("승인된 WIKI 동기화 이력 리포트를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 동기화 이력을 직접 확인하세요.");
    }
  }

  function clearApprovedSyncHistory() {
    setApprovedSyncHistory([]);
    setStatus("로컬 화면의 승인된 WIKI 동기화 이력을 지웠습니다. 서버 audit 이력은 추가 전용으로 유지됩니다.");
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
      setStatus(`승인된 WIKI 동기화 대상 설정을 저장했습니다: ${config.label}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 동기화 대상 설정을 저장하지 못했습니다.");
    }
  }

  async function createApprovedProviderPreview() {
    if (!providerPreviewAudit) {
      setStatus("제공자 미리보기를 요청하기 전에 제공자 실행 가능 동기화 audit을 먼저 만드세요.");
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
      setStatus("승인된 WIKI 제공자 사전 실행 미리보기를 만들었습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 제공자 미리보기를 만들지 못했습니다.");
    }
  }

  async function copyApprovedProviderPreview() {
    if (!approvedProviderPreview) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createApprovedProviderPreviewReport(approvedProviderPreview));
      setStatus("승인된 WIKI 제공자 미리보기를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 제공자 미리보기를 직접 확인하세요.");
    }
  }

  async function executeApprovedProviderAdapter() {
    if (!approvedProviderPreview) {
      setStatus("보호 실행 전에 최신 제공자 미리보기를 먼저 만드세요.");
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
      setStatus("승인된 WIKI 제공자 어댑터 실행을 서버 감사 이력에 기록했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "승인된 WIKI 제공자 실행을 기록하지 못했습니다.");
    }
  }

  async function copyApprovedProviderExecution() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      await navigator.clipboard.writeText(createApprovedProviderExecutionReport(approvedProviderExecution));
      setStatus("승인된 WIKI 제공자 실행 리포트를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 제공자 실행 결과를 직접 확인하세요.");
    }
  }

  async function copyApprovedProviderExecutionPackage() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      const attachment = await readTextAttachment(`/api/admin/knowledge/provider-executions/${encodeURIComponent(approvedProviderExecution.id)}/package`);
      await navigator.clipboard.writeText(attachment.text);
      setStatus(`승인된 WIKI 제공자 실행 패키지를 복사했습니다 (${attachment.digest.slice(0, 12)} 해시).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "제공자 실행 패키지를 복사하지 못했습니다.");
    }
  }

  async function downloadApprovedProviderExecutionPackage() {
    if (!approvedProviderExecution) {
      return;
    }
    try {
      const attachment = await readTextAttachment(`/api/admin/knowledge/provider-executions/${encodeURIComponent(approvedProviderExecution.id)}/package`);
      downloadTextFile(attachment.filename, attachment.text, "application/json");
      setStatus(`승인된 WIKI 제공자 실행 패키지를 다운로드했습니다 (${attachment.digest.slice(0, 12)} 해시).`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "제공자 실행 패키지를 다운로드하지 못했습니다.");
    }
  }

  async function saveApprovedProviderExecutionPackageReviewNote() {
    if (!approvedProviderExecution) {
      setStatus("검토 메모를 추가하기 전에 제공자 실행 패키지를 선택하세요.");
      return;
    }
    if (!approvedProviderExecutionReviewNoteText.trim()) {
      setStatus("제공자 실행 패키지 검토 메모 내용을 입력해야 합니다.");
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
      setStatus("제공자 실행 패키지 검토 메모를 저장했습니다.");
      readJson<ProviderExecutionPackageReviewNoteReport>(
        `/api/admin/knowledge/provider-execution-package-review-notes?${providerExecutionPackageReviewReportQuery}`,
      )
        .then(setApprovedProviderExecutionReviewReport)
        .catch(() => undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "제공자 실행 패키지 검토 메모를 저장하지 못했습니다.");
    } finally {
      setApprovedProviderExecutionReviewNoteSaving(false);
    }
  }

  function downloadApprovedProviderExecutionPackageReviewNotesCsv() {
    const url = `/api/admin/knowledge/provider-execution-package-review-notes/export?${providerExecutionPackageReviewReportQuery}`;
    window.location.href = url;
    setStatus("제공자 실행 패키지 검토 메모 CSV 내보내기를 시작했습니다.");
  }

  async function copyApprovedProviderExecutionPackageReviewHandoff() {
    try {
      await navigator.clipboard.writeText(createProviderExecutionPackageReviewHandoff(approvedProviderExecutionReviewReport));
      setStatus("제공자 실행 패키지 검토 전달 자료를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 패키지 필터를 직접 확인하세요.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummary() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummary);
      setApprovedProviderExecutionCoverageSummaryCopied(true);
      setStatus("제공자 실행 패키지 검토 범위 그룹 요약을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 검토 범위 그룹 요약을 직접 확인하세요.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummaryFilename() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummaryNextDownloadFilename);
      setApprovedProviderExecutionCoverageSummaryCopiedFilename(providerExecutionPackageCoverageGroupSummaryNextDownloadFilename);
      setStatus("제공자 실행 패키지 검토 범위 그룹 요약 파일명을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 검토 범위 그룹 요약 파일명을 직접 확인하세요.");
    }
  }

  async function copyApprovedProviderExecutionPackageCoverageGroupSummaryResetConfirmation() {
    try {
      await navigator.clipboard.writeText(providerExecutionPackageCoverageGroupSummaryResetConfirmation);
      setApprovedProviderExecutionCoverageSummaryCopiedResetConfirmation(
        providerExecutionPackageCoverageGroupSummaryResetConfirmation,
      );
      setApprovedProviderExecutionCoverageSummaryResetConfirmationCopiedAt(new Date().toISOString());
      setStatus("제공자 실행 패키지 검토 범위 그룹 요약 초기화 확인 문구를 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 검토 범위 그룹 요약 초기화 확인 문구를 직접 확인하세요.");
    }
  }

  function downloadApprovedProviderExecutionPackageCoverageGroupSummary() {
    if (!approvedProviderExecutionReviewReport) {
      setStatus("제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.");
      return;
    }
    const filename = providerExecutionPackageCoverageGroupSummaryNextDownloadFilename;
    downloadTextFile(filename, providerExecutionPackageCoverageGroupSummary, "text/markdown");
    setApprovedProviderExecutionCoverageSummaryDownloadFilename(filename);
    setStatus("제공자 실행 패키지 검토 범위 그룹 요약을 다운로드했습니다.");
  }

  function resetApprovedProviderExecutionPackageCoverageGroupSummaryStatus() {
    setApprovedProviderExecutionCoverageSummaryDownloadFilename("");
    setApprovedProviderExecutionCoverageSummaryCopied(false);
    setApprovedProviderExecutionCoverageSummaryCopiedFilename("");
    setApprovedProviderExecutionCoverageSummaryCopiedResetConfirmation("");
    setApprovedProviderExecutionCoverageSummaryResetConfirmationCopiedAt("");
    setApprovedProviderExecutionCoverageSummaryResetAt(new Date().toISOString());
    setStatus("제공자 실행 패키지 검토 범위 그룹 요약의 로컬 상태를 초기화했습니다.");
  }

  function clearApprovedProviderExecutionReviewShortcutFilters() {
    setApprovedProviderExecutionDigestFilter("");
    setApprovedProviderExecutionReviewCategoryFilter("all");
    setApprovedProviderExecutionReviewReviewerFilter("");
    setStatus("제공자 실행 패키지 검토 바로가기 필터를 지웠습니다.");
  }

  function showApprovedProviderExecutionReviewCoverageGroup(preset: ProviderExecutionPackageReviewCoveragePreset) {
    setApprovedProviderExecutionReviewCoveragePreset(preset);
    setStatus(`제공자 실행 패키지 검토 범위 필터를 ${providerExecutionPackageReviewCoverageStatusLabels[preset as ProviderExecutionPackageReviewCoverageStatus] ?? "전체"}로 설정했습니다.`);
  }

  async function copyCurrentApprovedKnowledgeMarkdown() {
    const item = detail?.approvedKnowledgeItem;
    if (!item) {
      setStatus("복사할 승인 WIKI 항목이 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(item.bodyMarkdown);
      setStatus("승인된 WIKI Markdown을 복사했습니다.");
    } catch {
      setStatus("클립보드 복사에 실패했습니다. 승인 WIKI에서 항목을 다시 확인하세요.");
    }
  }

  function openCurrentApprovedKnowledge(focus: "readback" | "export_sync") {
    const item = detail?.approvedKnowledgeItem;
    if (!item) {
      setStatus("이 후보에는 승인 WIKI 항목이 아직 없습니다.");
      return;
    }
    setSelectedApprovedId(item.id);
    updateNavigationQuery({
      work: "approved",
      approvedId: item.id,
      approvedFocus: focus,
    });
  }

  const activeCandidateStepIndex = Math.max(0, knowledgeCandidateTabs.indexOf(activeCandidateTab));
  const activeCandidateStepNumber = activeCandidateStepIndex + 1;
  const nextCandidateTab =
    activeCandidateTab === "evidence" ? "draft" :
    activeCandidateTab === "draft" ? "decision" :
    null;
  const candidateNextActionLabel = nextCandidateTab
    ? nextCandidateTab === "decision"
      ? "승인 결정으로 이동"
      : `${knowledgeCandidateTabLabels[nextCandidateTab]}로 이동`
    : detail?.approvedKnowledgeItem
      ? "승인 WIKI에서 보기"
      : "WIKI 지식 승인";
  const candidateNextActionDetail = nextCandidateTab
    ? `${knowledgeCandidateTabLabels[activeCandidateTab]} 확인 후 다음 단계로 진행합니다.`
    : detail?.approvedKnowledgeItem
      ? "승인된 항목을 WIKI 읽기 화면에서 확인합니다."
      : guardrailWarningCount
        ? `경고 ${guardrailWarningCount}개가 남아 있지만 기존 정책대로 승인할 수 있습니다.`
        : "경고 없이 승인할 수 있습니다.";
  const missingDraftReadiness = draftReadiness.filter((item) => !item.ready);
  const passingDraftReadiness = draftReadiness.filter((item) => item.ready);
  const markdownIssueChips = [
    markdownOutline.length ? "" : "Markdown 제목 없음",
    markdownStructureSummary.listItems ? "" : "목록 구조 없음",
    markdownWikiLinks.length ? "" : "WIKI 링크 없음",
  ].filter(Boolean);
  const warningApprovalRiskGroups = sortedApprovalRiskGroups.filter((group) => group.warningCount > 0);
  const passingApprovalRiskGroups = sortedApprovalRiskGroups.filter((group) => group.warningCount === 0);
  const warningApprovalGuardrails = sortedApprovalGuardrails.filter((item) => item.tone === "warning");
  const passingApprovalGuardrails = sortedApprovalGuardrails.filter((item) => item.tone === "ready");
  const missingApprovalPackageQuality = sortedApprovalPackageQuality.filter((item) => !item.ready);
  const passingApprovalPackageQuality = sortedApprovalPackageQuality.filter((item) => item.ready);
  const missingFinalReviewChecklist = sortedFinalReviewChecklist.filter((item) => !item.ready);
  const passingFinalReviewChecklist = sortedFinalReviewChecklist.filter((item) => item.ready);

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>지식 관리</p>
          <h1>WIKI 후보 검토</h1>
        </div>
        <a className={styles.secondaryLink} href="/admin">관리 설정</a>
      </header>

      <nav aria-label="지식 관리 업무" className={styles.workTabShell}>
        <div className={styles.workTabList} onKeyDown={handleWorkTabKeyDown} role="tablist">
          {knowledgeWorkTabs.map((tab) => {
            const isActive = tab === activeWorkTab;
            return (
              <button
                aria-controls={knowledgeWorkPanelDomId(tab)}
                aria-label={`${knowledgeWorkTabLabels[tab]}: ${knowledgeWorkTabDescriptions[tab]}`}
                aria-selected={isActive}
                className={isActive ? styles.workTabActive : styles.workTab}
                id={knowledgeWorkTabDomId(tab)}
                key={tab}
                onClick={() => setWorkTab(tab)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                title={knowledgeWorkTabDescriptions[tab]}
                type="button"
              >
                {knowledgeWorkTabLabels[tab]}
              </button>
            );
          })}
        </div>
      </nav>

      <KnowledgeWorkTabPanel activeTab={activeWorkTab} tab="candidates">
        <section className={styles.discoveryRequestPanel} aria-label="자동 발굴 요청">
          <div className={styles.exportHeader}>
            <div>
              <p>자동 발굴 요청</p>
              <h2>완료 task 기반 후보 발굴 대기열</h2>
            </div>
            <div className={styles.exportActions}>
              <button disabled={busy} onClick={runDiscoveryScan} type="button">
                자동 발굴 요청 갱신
              </button>
            </div>
          </div>
          <div className={styles.sourceChips}>
            <span>요청 {discoveryRequests.length}개</span>
            <span>승격 {discoveryRequests.filter((request) => request.state === "promoted").length}개</span>
            <span>차단 규칙 통과 후 LLM 균형 선별</span>
            <span>승인 WIKI 직접 반영 없음</span>
          </div>
          <p className={styles.empty}>
            LLM은 완료 상태, 완료일, 결정/결론 메모, 업무 상세 메모를 기준으로 재사용 가능성을 점수화합니다. 승격 버튼을 누르기 전까지 WIKI 후보는 생성되지 않습니다.
          </p>
          <div className={styles.syncHistory} aria-label="자동 발굴 요청 행">
            {discoveryRequests.length ? discoveryRequests.slice(0, 6).map((request) => (
              <article key={request.id}>
                <strong>점수 {request.recommendationScore} / {request.state}</strong>
                <p>{request.recommendationReason || "추천 사유 없음"}</p>
                <span>task {request.taskId.slice(0, 8)}</span>
                <span>scan {request.scanId.slice(0, 8)}</span>
                <span>{formatDate(request.createdAt)}</span>
                {request.promotedCandidateId ? <span>후보 {request.promotedCandidateId.slice(0, 8)}</span> : null}
                <button
                  disabled={busy || request.state === "promoted" || request.state === "dismissed"}
                  onClick={() => promoteDiscoveryRequest(request.id)}
                  type="button"
                >
                  후보로 승격
                </button>
                <button
                  disabled={busy || request.state === "promoted" || request.state === "dismissed"}
                  onClick={() => dismissDiscoveryRequest(request.id)}
                  type="button"
                >
                  제외
                </button>
              </article>
            )) : <p className={styles.empty}>아직 자동 발굴 요청이 없습니다. 갱신 버튼으로 완료 task를 선별하세요.</p>}
          </div>
        </section>
        <div className={styles.layout}>
        <aside className={styles.queue} aria-label="지식 후보 목록">
          <div className={styles.queueHeader}>
            <h2>후보 목록</h2>
            <select
              aria-label="후보 상태 필터"
              value={filter}
              onChange={(event) => setFilter(event.target.value as CandidateState | "all")}
            >
              <option value="candidate">검토 대기</option>
              <option value="pending_review">SaaS 검토 대기</option>
              <option value="approved">승인됨</option>
              <option value="rejected">반려됨</option>
              <option value="all">전체</option>
            </select>
          </div>
          <div className={styles.queueCounts} aria-label="지식 후보 상태별 개수">
            <span>후보 {candidateStateCounts.candidate}</span>
            <span>SaaS 검토 대기 {candidateStateCounts.pending_review}</span>
            <span>승인됨 {candidateStateCounts.approved}</span>
            <span>반려됨 {candidateStateCounts.rejected}</span>
            <span>전체 {candidateStateCounts.all}</span>
          </div>
          <div className={styles.queueCounts} aria-label="지식 후보 리스크 합계">
            <span>낮은 신뢰도 {candidateRiskCounts.lowConfidence}</span>
            <span>미검토 {candidateRiskCounts.unreviewed}</span>
            <span>정리 승인됨 {candidateRiskCounts.cleanupApproved}</span>
            <span>위험 그룹 3</span>
          </div>
          <div className={styles.queueCounts} aria-label="현재 표시된 지식 후보 리스크 합계">
            <span>현재 낮은 신뢰도 {visibleCandidateRiskCounts.lowConfidence}</span>
            <span>현재 미검토 {visibleCandidateRiskCounts.unreviewed}</span>
            <span>현재 정리 승인 {visibleCandidateRiskCounts.cleanupApproved}</span>
            <span>현재 표시 {visibleCandidates.length}</span>
          </div>
          <div className={styles.queueQuickFilters} aria-label="지식 후보 빠른 필터">
            {(["candidate", "pending_review", "approved", "rejected", "all"] as Array<CandidateState | "all">).map((value) => (
              <button
                className={filter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {value === "all" ? "모두" : stateLabels[value]}
              </button>
            ))}
          </div>
          <div className={styles.queueQuickFilters} aria-label="지식 후보 리스크 빠른 필터">
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
              후보 필터 지우기
            </button>
            <button onClick={copyCandidateFilterHandoff} type="button">필터 전달 자료 복사</button>
          </div>
          <label className={styles.queueSort}>
            후보 정렬
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
                <span>{selectedCandidateIndex >= 0 ? `선택됨 ${selectedCandidateIndex + 1}/${visibleCandidates.length}` : "필터 밖 항목 선택됨"}</span>
                <strong>{selectedCandidate.title}</strong>
                {selectedCandidateIndex < 0 ? (
                  <button onClick={revealSelectedCandidate} type="button">선택 후보 보기</button>
                ) : null}
              </>
            ) : (
              <span>선택한 후보 없음</span>
            )}
          </div>
          <div className={styles.queueDensity} aria-label="Knowledge candidate queue density controls">
            <button
              className={candidateQueueCompact ? styles.queueQuickFilter : styles.queueQuickFilterActive}
              onClick={() => setCandidateQueueCompact(false)}
              type="button"
            >
              자세한 큐
            </button>
            <button
              className={candidateQueueCompact ? styles.queueQuickFilterActive : styles.queueQuickFilter}
              onClick={() => setCandidateQueueCompact(true)}
              type="button"
            >
              압축 큐
            </button>
          </div>
          <label className={styles.queueSearch}>
            후보 검색
            <div>
              <input
                onChange={(event) => setCandidateSearch(event.target.value)}
                placeholder="제목, 작업, 프로젝트, 태그"
                value={candidateSearch}
              />
              <button disabled={!candidateSearch.trim()} onClick={() => setCandidateSearch("")} type="button">
                지우기
              </button>
            </div>
          </label>

          <div className={styles.candidateList}>
            {visibleCandidates.length ? visibleCandidates.map((candidate) => (
              <button
                className={candidate.id === selectedId ? styles.candidateActive : styles.candidate}
                key={candidate.id}
                onClick={() => selectCandidate(candidate.id)}
                type="button"
              >
                <span>{stateLabels[candidate.state]}</span>
                <strong>{candidate.title}</strong>
                {candidate.sourceProjectWiki?.status === "disabled" ? (
                  <span className={styles.sourceDisabledBadge}>원본 비활성화됨</span>
                ) : null}
                {candidateQueueCompact ? null : <small>{candidate.projectName} / {candidate.taskIssueId}</small>}
                <span className={styles.candidateRiskChips}>
                  <span>신뢰도 {readConfidenceBand(candidate.confidenceScore)}</span>
                  <span>{candidate.reviewedAt ? "검토됨" : "미검토"}</span>
                  <span>정리 상태 {cleanupStateLabels[candidate.cleanupState]}</span>
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
                <div className={styles.reviewProgress}>
                  <div>
                    <p>{detail.projectName} / {detail.taskIssueId}</p>
                    <h2>{detail.taskTitle}</h2>
                  </div>
                  <div className={styles.reviewProgressSteps} aria-label="후보 검토 진행 단계">
                    {knowledgeCandidateTabs.map((tab, index) => {
                      const isCurrent = tab === activeCandidateTab;
                      const isDone = index < activeCandidateStepIndex;
                      return (
                        <button
                          className={[
                            styles.reviewStep,
                            isCurrent ? styles.reviewStepActive : "",
                            isDone ? styles.reviewStepDone : "",
                          ].filter(Boolean).join(" ")}
                          key={tab}
                          onClick={() => setCandidateTab(tab)}
                          type="button"
                        >
                          <span>{index + 1}</span>
                          {knowledgeCandidateTabLabels[tab]}
                        </button>
                      );
                    })}
                  </div>
                  <div className={styles.sourceChips} aria-label="후보 개요 고정 요약">
                    <span>출처 사용자 AI 검토</span>
                    <span>상태 {stateLabels[detail.state]}</span>
                    <span>현재 단계 {activeCandidateStepNumber}/{knowledgeCandidateTabs.length}</span>
                    <span>경고 {guardrailWarningCount}</span>
                    <span>{approvalReviewItems.length ? `검토 항목 ${approvalReviewItems.length}개` : "필수 검토 항목 없음"}</span>
                    {detail.sourceProjectWiki?.status === "disabled" ? (
                      <span className={styles.sourceDisabledBadge}>원본 비활성화됨</span>
                    ) : null}
                    {detail.sourceProjectWiki?.projectSpecificContext ? <span>프로젝트 WIKI 출처</span> : null}
                    {detail.sourceProjectWiki?.aiSuitabilityState ? (
                      <span>{projectWikiSuitabilityLabels[detail.sourceProjectWiki.aiSuitabilityState]}</span>
                    ) : null}
                  </div>
                </div>
                <aside className={styles.reviewNextAction} aria-label="다음 검토 행동">
                  <span className={styles.candidateConfidence}>신뢰도 {detail.confidenceScore}%</span>
                  <strong>{candidateNextActionLabel}</strong>
                  <p>{candidateNextActionDetail}</p>
                  {nextCandidateTab ? (
                    <button onClick={() => setCandidateTab(nextCandidateTab)} type="button">
                      {candidateNextActionLabel}
                    </button>
                  ) : detail.approvedKnowledgeItem ? (
                    <button onClick={() => openCurrentApprovedKnowledge("readback")} type="button">
                      승인 WIKI에서 보기
                    </button>
                  ) : (
                    <button disabled={busy || Boolean(structuredDraftApprovalIssue)} onClick={approveCandidate} type="button">
                      WIKI 지식 승인
                    </button>
                  )}
                </aside>
              </section>

              <nav aria-label="후보 상세 검토 단계" className={styles.candidateDetailTabShell}>
                <div className={styles.candidateDetailTabList} onKeyDown={handleCandidateTabKeyDown} role="tablist">
                  {knowledgeCandidateTabs.map((tab) => {
                    const isActive = tab === activeCandidateTab;
                    return (
                      <button
                        aria-controls={knowledgeCandidatePanelDomId(tab)}
                        aria-label={`${knowledgeCandidateTabLabels[tab]}: ${knowledgeCandidateTabDescriptions[tab]}`}
                        aria-selected={isActive}
                        className={isActive ? styles.candidateDetailTabActive : styles.candidateDetailTab}
                        id={knowledgeCandidateTabDomId(tab)}
                        key={tab}
                        onClick={() => setCandidateTab(tab)}
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        title={knowledgeCandidateTabDescriptions[tab]}
                        type="button"
                      >
                        {knowledgeCandidateTabLabels[tab]}
                      </button>
                    );
                  })}
                </div>
              </nav>

              <KnowledgeCandidateTabPanel activeTab={activeCandidateTab} tab="evidence">
              <section className={styles.gridSingle}>
                <div className={styles.panel}>
                  <h3>근거 확인</h3>
                  <dl className={styles.meta}>
                    <div>
                      <dt>상태</dt>
                      <dd>{stateLabels[detail.state]}</dd>
                    </div>
                    <div>
                      <dt>정리 상태</dt>
                      <dd>{cleanupStateLabels[detail.cleanupState]}</dd>
                    </div>
                    <div>
                      <dt>신뢰도 이유</dt>
                      <dd>{detail.confidenceReason}</dd>
                    </div>
                    {detail.sourceProjectWiki ? (
                      <>
                        <div>
                          <dt>프로젝트 WIKI 출처 상태</dt>
                          <dd>{detail.sourceProjectWiki.status === "disabled" ? "원본 비활성" : "원본 활성"}</dd>
                        </div>
                        <div>
                          <dt>원본 프로젝트 WIKI</dt>
                          <dd>
                            {detail.sourceProjectWiki.sourceProjectWikiItemId ? (
                              <a href={createProjectWikiSourceHref(detail.sourceProjectWiki.sourceProjectWikiItemId)}>
                                원본 프로젝트 WIKI
                              </a>
                            ) : (
                              "프로젝트 WIKI 항목 링크 없음"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>원본 임시 검토 기록</dt>
                          <dd>
                            {detail.sourceProjectWiki.sourceTaskId && detail.sourceProjectWiki.sourceReviewRecordId ? (
                              <a
                                href={createAssistantReviewSourceHref({
                                  taskId: detail.sourceProjectWiki.sourceTaskId,
                                  assistantReviewSessionId: detail.sourceProjectWiki.sourceReviewRecordId,
                                })}
                              >
                                원본 임시 검토 기록
                              </a>
                            ) : (
                              "임시 검토 기록 링크 없음"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>승인 작업 기록</dt>
                          <dd>
                            {detail.sourceProjectWiki.sourceTaskId &&
                            detail.sourceProjectWiki.sourceReviewRecordId &&
                            detail.sourceProjectWiki.sourceWorkSummaryDraftId ? (
                              <a
                                href={createAssistantReviewSourceHref({
                                  taskId: detail.sourceProjectWiki.sourceTaskId,
                                  assistantReviewSessionId: detail.sourceProjectWiki.sourceReviewRecordId,
                                  workSummaryDraftId: detail.sourceProjectWiki.sourceWorkSummaryDraftId,
                                })}
                              >
                                승인 작업 기록
                              </a>
                            ) : (
                              "승인 작업 기록 링크 없음"
                            )}
                          </dd>
                        </div>
                        <div>
                          <dt>프로젝트 WIKI AI 적합성</dt>
                          <dd>
                            {detail.sourceProjectWiki.aiSuitabilityState
                              ? projectWikiSuitabilityLabels[detail.sourceProjectWiki.aiSuitabilityState]
                              : "적합성 정보 없음"}
                            {detail.sourceProjectWiki.aiSuitabilityReason ? ` / ${detail.sourceProjectWiki.aiSuitabilityReason}` : ""}
                          </dd>
                        </div>
                        <div>
                          <dt>보완 메모</dt>
                          <dd>{detail.sourceProjectWiki.supplementalNote || "보완 메모 없음"}</dd>
                        </div>
                        <div>
                          <dt>공용화 주의사항</dt>
                          <dd>{detail.sourceProjectWiki.commonizationCaution || "공용화 주의사항 없음"}</dd>
                        </div>
                      </>
                    ) : null}
                  </dl>
                  <h4>질문</h4>
                  <p>{detail.question}</p>
                  <h4>답변</h4>
                  <p className={styles.answer}>{detail.answer}</p>
                  <section className={styles.evidenceFilterPanel} aria-label="근거 필터">
                    <div className={styles.evidenceFilterGroup}>
                      <span className={styles.evidenceFilterLabel}>출처</span>
                      <div className={styles.evidenceSegmentedControl} aria-label="Knowledge evidence source filters">
                        {(["all", "sourced", "unsourced"] as EvidenceSourceFilter[]).map((value) => (
                          <button
                            aria-pressed={evidenceSourceFilter === value}
                            className={evidenceSourceFilter === value ? styles.evidenceSegmentActive : styles.evidenceSegment}
                            key={value}
                            onClick={() => setEvidenceSourceFilter(value)}
                            type="button"
                          >
                            {evidenceSourceFilterLabels[value]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.evidenceFilterGroup}>
                      <span className={styles.evidenceFilterLabel}>우선순위</span>
                      <div className={styles.evidenceSegmentedControl} aria-label="Knowledge evidence priority filters">
                        {(["all", "high", "normal", "low"] as EvidencePriorityFilter[]).map((value) => (
                          <button
                            aria-pressed={evidencePriorityFilter === value}
                            className={evidencePriorityFilter === value ? styles.evidenceSegmentActive : styles.evidenceSegment}
                            key={value}
                            onClick={() => setEvidencePriorityFilter(value)}
                            type="button"
                          >
                            {evidencePriorityFilterLabels[value]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.evidenceResultSummary} aria-label="Knowledge visible evidence summary">
                      {evidenceResultChips.map((chip) => (
                        <span
                          className={chip.startsWith("출처 없음") ? styles.issueChipWarning : styles.issueChipNeutral}
                          key={chip}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                    <div className={styles.evidenceFilterActions}>
                      {hasCustomEvidenceFilters ? (
                        <button onClick={clearEvidenceFilters} type="button">
                          필터 지우기
                        </button>
                      ) : null}
                      <details className={styles.evidenceAuxiliaryActions}>
                        <summary>보조 작업</summary>
                        <div>
                          <button onClick={copyEvidenceFilterHandoff} type="button">
                            근거 필터 전달 자료 복사
                          </button>
                        </div>
                      </details>
                    </div>
                  </section>
                  <div className={styles.evidenceList}>
                    {visibleEvidence.length ? visibleEvidence.map((evidence) => (
                      <article className={styles.evidence} key={evidence.id}>
                        <span>{evidence.kind}</span>
                        <span>{readEvidencePriorityTier(evidence.priority)} / 우선순위 {evidence.priority}</span>
                        <strong>{evidence.title}</strong>
                        <p>{evidence.excerpt}</p>
                        {evidence.sourceUrl ? (
                          <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
                            출처
                          </a>
                        ) : null}
                      </article>
                    )) : (
                      <p className={styles.empty}>
                        {evidenceSourceFilterLabels[evidenceSourceFilter]} 및 {evidencePriorityFilterLabels[evidencePriorityFilter]} 조건과 일치하는 근거가 없습니다. 행을 다시 보려면 근거 필터를 지우세요.
                      </p>
                    )}
                  </div>
                </div>
              </section>
              </KnowledgeCandidateTabPanel>

              <KnowledgeCandidateTabPanel activeTab={activeCandidateTab} tab="draft">
              <section className={styles.editor}>
                <div className={styles.editorHeader}>
                  <div>
                    <p>WIKI 초안</p>
                    <h3>구조화 초안 검토</h3>
                  </div>
                  <div className={styles.editorTools}>
                    <button onClick={resetDraft} type="button">초안 초기화</button>
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
                <details className={styles.auxiliaryActions}>
                  <summary>보조 작업</summary>
                  <div className={styles.auxiliaryActionGrid}>
                    <button disabled={!draft.bodyMarkdown.trim()} onClick={copyDraftMarkdown} type="button">
                      Markdown 복사
                    </button>
                    <button onClick={copyMarkdownOutline} type="button">Markdown 개요 복사</button>
                    <button onClick={copyMarkdownStructureSummary} type="button">Markdown 구조 복사</button>
                    <button onClick={copyMarkdownWikiLinks} type="button">WIKI 링크 복사</button>
                    <button onClick={copyDraftTagHandoff} type="button">초안 태그 복사</button>
                    <button onClick={copyScopeHandoff} type="button">범위 전달 자료 복사</button>
                    <button onClick={copySourceHandoff} type="button">출처 전달 자료 복사</button>
                    <button onClick={copyApprovalChecklist} type="button">승인 체크리스트 복사</button>
                    <button onClick={copyApprovalRiskSummary} type="button">리스크 요약 복사</button>
                    <button onClick={copyApprovalDecisionNote} type="button">결정 메모 복사</button>
                    <button onClick={copyDirtyDraftSummary} type="button">초안 변경 요약 복사</button>
                  </div>
                </details>
                {dirtyDraftCount ? (
                  <section className={styles.reviewBannerWarning} aria-label="Knowledge dirty draft reset warning">
                    <strong>초안에 저장되지 않은 수정이 있습니다</strong>
                    <p>초안을 초기화하면 변경된 필드 {dirtyDraftCount}개가 원래 값으로 돌아갑니다.</p>
                  </section>
                ) : null}
                {reviewStatus.tone === "warning" ? (
                  <section className={styles.reviewBannerWarning} aria-label="Knowledge review status banner">
                    <strong>{reviewStatus.label}</strong>
                    <p>{reviewStatus.detail}</p>
                  </section>
                ) : null}
                <KnowledgeStructuredDraftPanel
                  sourceBuckets={sourceBuckets}
                  sourceBucketsLoading={sourceBucketsLoading}
                  sourceBucketsError={sourceBucketsError}
                  structuredDraft={structuredDraftResult?.draft ?? null}
                  generationMetadata={structuredGenerationMetadata}
                  generating={structuredDraftGenerating}
                  selectedSubview={activeDraftSubview}
                  onSubviewChange={setDraftSubview}
                  onGenerate={generateStructuredDraft}
                  onApplyDraft={applyCurrentStructuredDraft}
                  onDraftChange={updateStructuredDraft}
                  legacyMarkdown={draft.bodyMarkdown}
                  previewCompact={previewCompact}
                  onPreviewCompactChange={() => setPreviewCompact((current) => !current)}
                  disabled={busy}
                />
                <section className={styles.structuredPanel} aria-label="기본 승인 필드">
                  <div className={styles.structuredPanelHeader}>
                    <div>
                      <p>Approval fields</p>
                      <h4>기본 승인 필드</h4>
                    </div>
                    <span>본문 {draft.bodyMarkdown.trim().length}자</span>
                  </div>
                  <div className={styles.contextChips} aria-label="지식 초안 출처 참조">
                    <span>작업 {detail.taskIssueId}</span>
                    <span>기록 {detail.id.slice(0, 8)}</span>
                    <span>근거 {detail.evidence.length}개</span>
                    <span>범위 {scopeLabels[draft.scope]}</span>
                  </div>
                  <div className={missingDraftReadiness.length ? styles.issueSummaryWarning : styles.issueSummaryReady} aria-label="초안 필수 입력 요약">
                    <strong>초안 준비 {readyReadinessCount}/{draftReadiness.length}</strong>
                    {missingDraftReadiness.length ? (
                      <div className={styles.issueChips}>
                        {missingDraftReadiness.map((item) => (
                          <span className={styles.issueChipWarning} key={item.label}>누락 {item.label}</span>
                        ))}
                      </div>
                    ) : (
                      <span>필수 입력과 근거가 준비됐습니다.</span>
                    )}
                  </div>
                  <label className={[styles.fieldBlock, !draft.title.trim() ? styles.fieldBlockWarning : styles.fieldBlockRequired].join(" ")}>
                    <span className={styles.fieldLabel}>
                      제목
                      <span className={styles.requiredBadge}>필수</span>
                      {!draft.title.trim() ? <span className={styles.missingBadge}>누락</span> : null}
                    </span>
                    <input
                      value={draft.title}
                      onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    />
                  </label>
                  <label className={[styles.fieldBlock, !draft.summary.trim() ? styles.fieldBlockWarning : styles.fieldBlockRequired].join(" ")}>
                    <span className={styles.fieldLabel}>
                      요약
                      <span className={styles.requiredBadge}>필수</span>
                      {!draft.summary.trim() ? <span className={styles.missingBadge}>누락</span> : null}
                    </span>
                    <textarea
                      rows={3}
                      value={draft.summary}
                      onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
                    />
                  </label>
                  <label className={[styles.fieldBlock, !draftTags.length ? styles.fieldBlockWarning : styles.fieldBlockRequired].join(" ")}>
                    <span className={styles.fieldLabel}>
                      태그
                      <span className={styles.requiredBadge}>필수</span>
                      {!draftTags.length ? <span className={styles.missingBadge}>누락</span> : null}
                    </span>
                    <input
                      value={draft.tagsText}
                      onChange={(event) => setDraft((current) => ({ ...current, tagsText: event.target.value }))}
                    />
                  </label>
                  {markdownIssueChips.length ? (
                    <div className={styles.issueSummaryWarning} aria-label="Markdown 검토 필요 항목">
                      <strong>Markdown 검토 필요</strong>
                      <div className={styles.issueChips}>
                        {markdownIssueChips.map((chip) => (
                          <span className={styles.issueChipWarning} key={chip}>{chip}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <details className={styles.compactMetadata}>
                    <summary>Markdown 진단</summary>
                    <div className={styles.contextChips} aria-label="Knowledge Markdown structure summary">
                      <span>제목 {markdownStructureSummary.headings}</span>
                      <span>문단 {markdownStructureSummary.paragraphs}</span>
                      <span>목록 항목 {markdownStructureSummary.listItems}</span>
                      <span>줄 {markdownStructureSummary.lines}</span>
                      <span>WIKI 링크 {markdownWikiLinks.length}</span>
                    </div>
                    {markdownOutline.length ? (
                      <div className={styles.contextChips} aria-label="Knowledge Markdown outline preview">
                        {markdownOutline.map((heading) => (
                          <span key={`${heading.line}-${heading.text}`}>
                            H{heading.level} L{heading.line}: {heading.text}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {markdownWikiLinks.length ? (
                      <div className={styles.contextChips} aria-label="Knowledge Markdown WIKI link preview">
                        {markdownWikiLinks.map((link) => (
                          <span key={`${link.line}-${link.target}-${link.label}`}>
                            L{link.line}: [[{link.target}]]
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </details>
                  <details className={styles.compactMetadata}>
                    <summary>초안 보조 메타데이터</summary>
                    <div className={styles.sourceChips} aria-label="지식 초안 보조 메타데이터">
                      <span>생성 {formatDate(detail.createdAt)}</span>
                      <span>수정 {formatDate(detail.updatedAt)}</span>
                      <span>검토 {detail.reviewedAt ? formatDate(detail.reviewedAt) : "-"}</span>
                      <span>상태 {stateLabels[detail.state]}</span>
                      <span>정리 {cleanupStateLabels[detail.cleanupState]}</span>
                      <span>{scopeReview.label}</span>
                      <span>출처 있음 {evidenceSourceCoverage.sourced}</span>
                      <span>출처 없음 {evidenceSourceCoverage.unsourced}</span>
                      <span>제목 {draft.title.trim().length}자</span>
                      <span>요약 {draft.summary.trim().length}자</span>
                      <span>태그 {draftTags.length}</span>
                      <span>변경 {dirtyDraftCount}/{draftDirtyStates.length}</span>
                    </div>
                  </details>
                </section>
              </section>
              </KnowledgeCandidateTabPanel>

              <KnowledgeCandidateTabPanel activeTab={activeCandidateTab} tab="decision">
              <section className={styles.editor} aria-label="후보 품질 점검">
                <div className={styles.editorHeader}>
                  <div>
                    <p>품질 점검</p>
                    <h3>경고와 누락 우선 검토</h3>
                  </div>
                </div>
                <details className={styles.auxiliaryActions}>
                  <summary>보조 작업</summary>
                  <div className={styles.auxiliaryActionGrid}>
                    <button onClick={copyApprovalChecklist} type="button">승인 체크리스트 복사</button>
                    <button onClick={copyApprovalRiskSummary} type="button">리스크 요약 복사</button>
                    <button onClick={copyApprovalRiskFilterHandoff} type="button">리스크 필터 복사</button>
                    <button onClick={copyApprovalPackageQuality} type="button">패키지 품질 복사</button>
                    <button onClick={copyFinalReviewCloseout} type="button">최종 검토 마감 복사</button>
                  </div>
                </details>
                <div
                  className={guardrailWarningCount || missingDraftReadiness.length ? styles.issueSummaryWarning : styles.issueSummaryReady}
                  aria-label="지식 승인 필수 검토 요약"
                >
                  <strong>{guardrailWarningCount || missingDraftReadiness.length ? "필수 검토 필요" : "필수 검토 완료"}</strong>
                  <div className={styles.issueChips}>
                    <span className={guardrailWarningCount ? styles.issueChipWarning : styles.issueChipNeutral}>
                      경고 {guardrailWarningCount}
                    </span>
                    <span className={missingDraftReadiness.length ? styles.issueChipWarning : styles.issueChipNeutral}>
                      누락 {missingDraftReadiness.length}
                    </span>
                    <span className={approvalRiskWarningGroupCount ? styles.issueChipWarning : styles.issueChipNeutral}>
                      경고 그룹 {approvalRiskWarningGroupCount}/{approvalRiskGroups.length}
                    </span>
                    <span className={styles.issueChipNeutral}>신뢰도 {readConfidenceBand(detail.confidenceScore)}</span>
                  </div>
                </div>
                <div className={styles.queueQuickFilters} aria-label="지식 승인 리스크 필터 바로가기">
                  {(["all", "scope", "metadata", "structure", "evidence", "state"] as ApprovalRiskFilter[]).map((value) => (
                    <button
                      className={approvalRiskFilter === value ? styles.queueQuickFilterActive : styles.queueQuickFilter}
                      key={value}
                      onClick={() => setApprovalRiskFilter(value)}
                      type="button"
                    >
                      {value === "all" ? "전체 리스크 그룹" : approvalRiskGroups.find((group) => group.key === value)?.label ?? value}
                    </button>
                  ))}
                  <button
                    className={styles.queueQuickFilter}
                    disabled={approvalRiskFilter === "all"}
                    onClick={clearApprovalRiskFilter}
                    type="button"
                  >
                    리스크 그룹 지우기
                  </button>
                </div>
                <section className={styles.guardrails} aria-label="Knowledge draft readiness">
                  <h4>초안 준비 상태</h4>
                  {missingDraftReadiness.length ? (
                    <div>
                    {missingDraftReadiness.map((item) => (
                      <article
                        className={styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>누락 {item.label}</strong>
                        <p>승인 전 이 필드를 확인해야 합니다.</p>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <p className={styles.readyNote}>필수 초안 입력과 근거가 모두 준비됐습니다.</p>
                  )}
                  {passingDraftReadiness.length ? (
                    <details className={styles.passingChecks}>
                      <summary>통과한 초안 점검 {passingDraftReadiness.length}개</summary>
                      <div>
                        {passingDraftReadiness.map((item) => (
                          <span key={item.label}>{item.label}</span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
                <section className={styles.guardrails} aria-label="지식 승인 리스크 그룹">
                  <h4>승인 리스크 그룹</h4>
                  {warningApprovalRiskGroups.length ? (
                    <div>
                    {warningApprovalRiskGroups.map((group) => (
                      <article
                        className={styles.guardrailWarning}
                        key={group.key}
                      >
                        <strong>{group.label}</strong>
                        <p>경고 {group.warningCount}개</p>
                        <ul>
                          {group.items.filter((item) => item.tone === "warning").map((item) => (
                            <li key={item.label}>{item.label}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <p className={styles.readyNote}>활성 리스크 그룹 경고가 없습니다.</p>
                  )}
                  {passingApprovalRiskGroups.length ? (
                    <details className={styles.passingChecks}>
                      <summary>통과한 리스크 그룹 {passingApprovalRiskGroups.length}개</summary>
                      <div>
                        {passingApprovalRiskGroups.map((group) => (
                          <span key={group.key}>{group.label}</span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
                <section className={styles.guardrails} aria-label="지식 승인 가드레일 메모">
                  <h4>승인 가드레일</h4>
                  {warningApprovalGuardrails.length ? (
                    <div>
                    {warningApprovalGuardrails.map((item) => (
                      <article
                        className={styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <p className={styles.readyNote}>활성 가드레일 경고가 없습니다.</p>
                  )}
                  {passingApprovalGuardrails.length ? (
                    <details className={styles.passingChecks}>
                      <summary>통과한 가드레일 {passingApprovalGuardrails.length}개</summary>
                      <div>
                        {passingApprovalGuardrails.map((item) => (
                          <span key={item.label}>{item.label}</span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
                <section className={styles.guardrails} aria-label="지식 승인 패키지 품질 점검">
                  <h4>승인 패키지 품질</h4>
                  {missingApprovalPackageQuality.length ? (
                    <div>
                    {missingApprovalPackageQuality.map((item) => (
                      <article
                        className={styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <p className={styles.readyNote}>승인 패키지 품질 점검이 통과했습니다.</p>
                  )}
                  {passingApprovalPackageQuality.length ? (
                    <details className={styles.passingChecks}>
                      <summary>통과한 패키지 점검 {passingApprovalPackageQuality.length}개</summary>
                      <div>
                        {passingApprovalPackageQuality.map((item) => (
                          <span key={item.label}>{item.label}</span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
                <section className={styles.guardrails} aria-label="Knowledge final review closeout checklist">
                  <h4>최종 검토 마감</h4>
                  {missingFinalReviewChecklist.length ? (
                    <div>
                    {missingFinalReviewChecklist.map((item) => (
                      <article
                        className={styles.guardrailWarning}
                        key={item.label}
                      >
                        <strong>{item.label}</strong>
                        <p>{item.detail}</p>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <p className={styles.readyNote}>최종 검토 마감 조건이 준비됐습니다.</p>
                  )}
                  {passingFinalReviewChecklist.length ? (
                    <details className={styles.passingChecks}>
                      <summary>통과한 마감 점검 {passingFinalReviewChecklist.length}개</summary>
                      <div>
                        {passingFinalReviewChecklist.map((item) => (
                          <span key={item.label}>{item.label}</span>
                        ))}
                      </div>
                    </details>
                  ) : null}
                </section>
                <details className={styles.compactMetadata}>
                  <summary>Markdown 구조 요약</summary>
                  <div className={styles.contextChips} aria-label="Knowledge Markdown structure summary">
                    <span>제목 {markdownStructureSummary.headings}</span>
                    <span>문단 {markdownStructureSummary.paragraphs}</span>
                    <span>목록 항목 {markdownStructureSummary.listItems}</span>
                    <span>WIKI 링크 {markdownWikiLinks.length}</span>
                  </div>
                </details>
              </section>
              <footer className={styles.footer}>
                <section className={styles.decisionPrimaryPanel} aria-label="승인 결정 요약">
                  <p className={styles.decisionSummary}>
                    {approvalReviewItems.length
                      ? `남은 승인 전 검토 항목 ${approvalReviewItems.length}개`
                      : guardrailWarningCount
                        ? `가드레일 경고 ${guardrailWarningCount}개를 최종 확인하세요.`
                        : "최종 승인 전 필수 검토 항목이 없습니다."}
                  </p>
                  <div className={styles.sourceChips} aria-label="Knowledge approval decision summary">
                    <span>{approvalReviewItems.length ? `검토 항목 ${approvalReviewItems.length}` : "필수 확인 항목 없음"}</span>
                    <span>경고 {guardrailWarningCount}</span>
                    <span>경고 그룹 {approvalRiskWarningGroupCount}/{approvalRiskGroups.length}</span>
                    <span>패키지 품질 {approvalPackageQualityReadyCount}/{approvalPackageQuality.length}</span>
                    <span>최종 검토 {finalReviewReadyCount}/{finalReviewChecklist.length}</span>
                  </div>
                  <p className={styles.decisionCaution}>
                    {guardrailWarningCount
                      ? "경고가 남아 있어도 기존 운영 정책대로 승인할 수 있습니다. 승인 전 반려 사유나 보완 필요 여부를 확인하세요."
                      : "승인 준비 상태입니다. 필요하면 반려 사유를 남기거나 바로 승인하세요."}
                  </p>
                </section>
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
                <label className={[styles.fieldBlock, draft.rejectionReason.trim() ? styles.fieldBlockRequired : styles.fieldBlockOptional].join(" ")}>
                  <span className={styles.fieldLabel}>
                    반려 사유
                    <span className={styles.optionalBadge}>반려 시 필수</span>
                    {draft.rejectionReason.trim() ? <span className={styles.contextBadge}>{draft.rejectionReason.trim().length}자</span> : null}
                  </span>
                  <input
                    value={draft.rejectionReason}
                    onChange={(event) => setDraft((current) => ({ ...current, rejectionReason: event.target.value }))}
                    placeholder="반려할 때 필요한 사유"
                  />
                </label>
                <details className={styles.auxiliaryActions}>
                  <summary>보조 작업</summary>
                  <div className={styles.auxiliaryActionGrid}>
                    {detail.approvedKnowledgeItem ? (
                      <button onClick={copyCurrentApprovedKnowledgeMarkdown} type="button">
                        승인 WIKI Markdown 복사
                      </button>
                    ) : null}
                    <button onClick={copyApprovalPackage} type="button">
                      승인 패키지 복사
                    </button>
                    <button onClick={copyApprovalPackageQuality} type="button">
                      패키지 품질 복사
                    </button>
                    <button onClick={copyFinalReviewCloseout} type="button">
                      최종 검토 마감 복사
                    </button>
                    <button disabled={!guardrailWarningCount} onClick={copyApprovalBlockers} type="button">
                      승인 차단 조건 복사
                    </button>
                    <button disabled={!draft.rejectionReason.trim()} onClick={copyRejectionReason} type="button">
                      반려 사유 복사
                    </button>
                  </div>
                </details>
                <div className={styles.actions}>
                  {detail.approvedKnowledgeItem ? (
                    <>
                      <button onClick={() => openCurrentApprovedKnowledge("readback")} type="button">
                        승인 WIKI에서 보기
                      </button>
                      <button onClick={() => openCurrentApprovedKnowledge("export_sync")} type="button">
                        내보내기
                      </button>
                    </>
                  ) : null}
                  <button disabled={busy} onClick={rejectCandidate} type="button">반려</button>
                  <button
                    disabled={busy || Boolean(structuredDraftApprovalIssue)}
                    onClick={approveCandidate}
                    title={
                      structuredDraftApprovalIssue
                        ? structuredDraftApprovalIssue
                        : approvalReviewItems.length
                        ? `승인 전 검토 항목 ${approvalReviewItems.length}개가 남아 있습니다.`
                        : guardrailWarningCount
                          ? `활성 가드레일 경고 ${guardrailWarningCount}개가 남아 있습니다.`
                          : "활성 가드레일 경고가 없습니다."
                    }
                    type="button"
                  >
                    WIKI 지식 승인
                  </button>
                </div>
              </footer>
              </KnowledgeCandidateTabPanel>
            </>
          ) : (
            <p className={styles.empty}>선택된 후보가 없습니다.</p>
          )}
        </main>
        </div>
      </KnowledgeWorkTabPanel>

      <KnowledgeWorkTabPanel activeTab={activeWorkTab} tab="approved">
          <section className={styles.editor} aria-label="승인된 WIKI 지식 읽기">
            <div className={styles.editorHeader}>
              <div>
                <p>승인된 WIKI</p>
                <h3>승인 항목 확인</h3>
              </div>
              <div className={styles.editorTools}>
                <button onClick={refreshApprovedItems} type="button">승인 항목 새로고침</button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedMarkdown} type="button">
                  승인 Markdown 복사
                </button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedItemHandoff} type="button">
                  항목 전달 자료 복사
                </button>
                <button onClick={copyApprovedSearchHandoff} type="button">검색 전달 자료 복사</button>
                <button disabled={!selectedApprovedItem} onClick={copyApprovedSourcePackage} type="button">
                  출처 패키지 복사
                </button>
                <button onClick={copyApprovedIndexPackage} type="button">색인 패키지 복사</button>
              </div>
            </div>

            <div className={styles.sourceChips} aria-label="Approved WIKI 요약 개수">
              <span>전체 {approvedItems.length}</span>
              <span>표시 {visibleApprovedItems.length}</span>
              <span>출처 있음 {approvedSourceCoverage.sourced}</span>
              <span>출처 없음 {approvedSourceCoverage.unsourced}</span>
              <span>태그 {approvedTagOptions.length}</span>
              <span>{approvedItemsLoaded ? "불러옴" : "불러오는 중"}</span>
            </div>
            <div className={styles.sourceChips} aria-label="Approved WIKI 범위별 개수">
              <span>관리자 전용 {approvedScopeCounts.admin_only}</span>
              <span>조직 {approvedScopeCounts.organization}</span>
              <span>프로젝트 멤버 {approvedScopeCounts.project_members}</span>
              <span>프로젝트 전용 {approvedScopeCounts.project}</span>
            </div>
            <div className={styles.queueFilterSummary} aria-label="Approved WIKI 활성 필터 칩">
              {activeApprovedFilterChips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>

            <div className={styles.approvedToolbar}>
              <label>
                승인 항목 검색
                <input
                  onChange={(event) => setApprovedSearch(event.target.value)}
                  placeholder="제목, 본문, 태그, 출처 ID"
                  value={approvedSearch}
                />
              </label>
              <label>
                범위
                <select
                  aria-label="Approved WIKI 범위 필터"
                  onChange={(event) => setApprovedScopeFilter(event.target.value as Scope | "all")}
                  value={approvedScopeFilter}
                >
                  <option value="all">전체 범위</option>
                  {Object.entries(scopeLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                태그
                <select
                  aria-label="Approved WIKI 태그 필터"
                  onChange={(event) => setApprovedTagFilter(event.target.value)}
                  value={approvedTagFilter}
                >
                  <option value="all">전체 태그</option>
                  {approvedTagOptions.map((tag) => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <label>
                출처
                <select
                  aria-label="Approved WIKI 출처 필터"
                  onChange={(event) => setApprovedSourceFilter(event.target.value as ApprovedSourceFilter)}
                  value={approvedSourceFilter}
                >
                  {(["all", "sourced", "unsourced"] as ApprovedSourceFilter[]).map((value) => (
                    <option key={value} value={value}>{approvedSourceFilterLabels[value]}</option>
                  ))}
                </select>
              </label>
              <label>
                정렬
                <select
                  aria-label="Approved WIKI 정렬"
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
                승인 항목 필터 지우기
              </button>
            </div>

            <div className={styles.approvedGrid}>
              <div className={styles.approvedList} aria-label="Approved WIKI 표시 항목">
                {visibleApprovedItems.length ? visibleApprovedItems.map((item) => (
                  <button
                    className={selectedApprovedItem?.id === item.id ? styles.candidateActive : styles.candidate}
                    key={item.id}
                    onClick={() => selectApprovedItem(item.id)}
                    type="button"
                  >
                    <span>{scopeLabels[item.scope]}</span>
                    <strong>{item.title}</strong>
                    <small>{formatDate(item.approvedAt)} / 출처 참조 {item.sourceReferences.length}개</small>
                    <span className={styles.candidateRiskChips}>
                      <span>태그 {item.tags.length}</span>
                      <span>기록 {item.sourceRecordId.slice(0, 8)}</span>
                      <span>작업 {item.sourceTaskId.slice(0, 8)}</span>
                    </span>
                  </button>
                )) : (
                  <p className={styles.empty}>
                    {approvedItemsLoaded
                      ? "현재 필터와 일치하는 승인된 WIKI 항목이 없습니다."
                      : "승인된 WIKI 항목을 불러오는 중입니다."}
                  </p>
                )}
              </div>

              <div className={styles.approvedDetail}>
                {selectedApprovedItem ? (
                  <>
                    <div>
                      <p>선택한 승인 항목</p>
                      <h4>{selectedApprovedItem.title}</h4>
                    </div>
                    <p>{selectedApprovedItem.summary}</p>
                    <dl className={styles.meta}>
                      <div>
                        <dt>범위</dt>
                        <dd>{scopeLabels[selectedApprovedItem.scope]}</dd>
                      </div>
                      <div>
                        <dt>승인</dt>
                        <dd>{formatDate(selectedApprovedItem.approvedAt)} / {selectedApprovedItem.approvedBy}</dd>
                      </div>
                      <div>
                        <dt>출처</dt>
                        <dd>{selectedApprovedItem.sourceRecordId}</dd>
                      </div>
                      <div>
                        <dt>작업</dt>
                        <dd>{selectedApprovedItem.sourceTaskId}</dd>
                      </div>
                    </dl>
                    <div className={styles.sourceChips} aria-label="Approved WIKI selected tags">
                      {selectedApprovedItem.tags.length ? selectedApprovedItem.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                      )) : <span>태그 없음</span>}
                    </div>
                    <section className={styles.guardrails} aria-label="Approved WIKI quality checks">
                      <h4>승인 항목 품질</h4>
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
                      <span>품질 {approvedQualityReadyCount}/{approvedQualityChecks.length}</span>
                      <span>출처 {selectedApprovedItem.sourceReferences.length}</span>
                      <span>본문 {selectedApprovedItem.bodyMarkdown.trim().length}자</span>
                    </div>
                    <section
                      className={[
                        styles.markdownPreview,
                        approvedPreviewCompact ? styles.markdownPreviewCompact : "",
                      ].filter(Boolean).join(" ")}
                      aria-label="Approved WIKI Markdown preview"
                    >
                      <div className={styles.markdownPreviewHeader}>
                        <h4>승인 Markdown</h4>
                        <button onClick={() => setApprovedPreviewCompact((current) => !current)} type="button">
                          {approvedPreviewCompact ? "넓게 보기" : "압축 보기"}
                        </button>
                      </div>
                      <pre>{selectedApprovedItem.bodyMarkdown.trim() || "승인된 Markdown 본문이 없습니다."}</pre>
                    </section>
                    <section className={styles.guardrails} aria-label="Approved WIKI source references">
                      <h4>출처 참조</h4>
                      <div>
                        {selectedApprovedItem.sourceReferences.length ? selectedApprovedItem.sourceReferences.map((reference) => (
                          <article className={styles.guardrailReady} key={reference.id}>
                            <strong>{reference.kind} / 우선순위 {reference.priority}: {reference.title}</strong>
                            <p>{reference.sourceUrl ?? "출처 URL 없음"} - {reference.excerpt}</p>
                          </article>
                        )) : (
                          <article className={styles.guardrailWarning}>
                            <strong>출처 참조 없음</strong>
                            <p>승인 항목은 읽을 수 있지만, 검색 전달 자료에서 누락된 출처 참조를 표시해야 합니다.</p>
                          </article>
                        )}
                      </div>
                    </section>
                  </>
                ) : (
                  <p className={styles.empty}>지식 후보를 승인하면 이 확인 영역에 표시됩니다.</p>
                )}
              </div>
            </div>
          </section>
            <section id="approved-wiki-export-sync" className={styles.approvedAuxiliarySurface} tabIndex={-1}>

            <section className={styles.exportPanel} aria-label="Approved WIKI 내보내기 및 동기화 준비 상태">
              <div className={styles.exportHeader}>
                <div>
                  <p>로컬 패키지</p>
                  <h4>브라우저 다운로드와 전달 자료</h4>
                </div>
                <div className={styles.editorTools}>
                  <button disabled={!approvedExportItems.length} onClick={copyApprovedSyncManifest} type="button">
                    동기화 명세 복사
                  </button>
                  <button disabled={!approvedExportItems.length} onClick={copyApprovedExportChecklist} type="button">
                    내보내기 체크리스트 복사
                  </button>
                  <button disabled={!approvedExportItems.length} onClick={downloadApprovedExport} type="button">
                    패키지 다운로드
                  </button>
                </div>
              </div>
              <div className={styles.approvedToolbar}>
                <label>
                  내보내기 범위
                  <select
                    aria-label="Approved WIKI 내보내기 범위"
                    onChange={(event) => setApprovedExportScope(event.target.value as ApprovedExportScope)}
                    value={approvedExportScope}
                  >
                    {(["visible", "selected"] as ApprovedExportScope[]).map((value) => (
                      <option key={value} value={value}>{approvedExportScopeLabels[value]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  패키지 형식
                  <select
                    aria-label="Approved WIKI 내보내기 형식"
                    onChange={(event) => setApprovedExportFormat(event.target.value as ApprovedExportFormat)}
                    value={approvedExportFormat}
                  >
                    {(["json", "markdown"] as ApprovedExportFormat[]).map((value) => (
                      <option key={value} value={value}>{approvedExportFormatLabels[value]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  동기화 대상
                  <select
                    aria-label="Approved WIKI 동기화 대상"
                    onChange={(event) => setApprovedSyncTargetWithQuery(event.target.value as ApprovedSyncTarget)}
                    value={approvedSyncTarget}
                  >
                    {(["portable_archive", "obsidian", "notion", "assistant_retrieval"] as ApprovedSyncTarget[]).map((value) => (
                      <option key={value} value={value}>{approvedSyncTargetLabels[value]}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.sourceChips} aria-label="Approved WIKI export scope summary">
                <span>내보내기 범위 {approvedExportScopeLabels[approvedExportScope]}</span>
                <span>현재 내보내기 {approvedExportItems.length}개</span>
                <span>선택 항목 {selectedApprovedItem ? selectedApprovedItem.title : "없음"}</span>
              </div>
              <div className={styles.sourceChips} aria-label="Approved WIKI export stats">
                <span>항목 {approvedExportItems.length}</span>
                <span>출처 있음 {approvedExportStats.sourced}</span>
                <span>출처 없음 {approvedExportStats.unsourced}</span>
                <span>태그 {approvedExportStats.tags}</span>
                <span>본문 {approvedExportStats.bodyChars}자</span>
                <span>형식 {approvedExportFormatLabels[approvedExportFormat]}</span>
                <span>대상 {approvedSyncTargetLabels[approvedSyncTarget]}</span>
              </div>
              <section className={styles.guardrails} aria-label="Approved WIKI export readiness checks">
                <h4>내보내기 준비 점검</h4>
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
              <div className={styles.sourceChips} aria-label="Approved WIKI 내보내기 준비 요약">
                <span>준비 상태 {approvedExportReadyCount}/{approvedExportReadiness.length}</span>
                <span>{approvedExportReadyCount === approvedExportReadiness.length ? "내보내기 가능" : "동기화 전 검토 필요"}</span>
                <span>파일 {approvedSyncPackageName}</span>
              </div>
              <section className={styles.syncRunPanel} aria-label="Approved WIKI 보호된 동기화 실행">
                <div className={styles.exportHeader}>
                  <div>
                    <p>서버 감사</p>
                    <h4>보호된 dry-run 및 차단 기록</h4>
                  </div>
                  <div className={styles.editorTools}>
                    <button disabled={!approvedExportItems.length} onClick={recordApprovedSyncDryRun} type="button">
                      보호된 dry-run 기록
                    </button>
                    <button disabled={!approvedExportItems.length} onClick={runGuardedApprovedSync} type="button">
                      차단 조건 검증 후 실행 기록
                    </button>
                    <button disabled={!approvedSyncHistory.length} onClick={copyApprovedSyncHistoryReport} type="button">
                      동기화 이력 복사
                    </button>
                    <button disabled={!approvedSyncHistory.length} onClick={clearApprovedSyncHistory} type="button">
                      로컬 이력 지우기
                    </button>
                  </div>
                </div>
                <div className={styles.sourceChips} aria-label="Approved WIKI 보호된 동기화 요약">
                  <span>확인 문구 {approvedSyncConfirmation.trim() === approvedSyncConfirmationText ? "일치" : "필요"}</span>
                  <span>서버 감사 {approvedSyncHistory.length}</span>
                  <span>최근 {latestApprovedSyncRun ? approvedSyncRunStatusLabels[latestApprovedSyncRun.status] : "없음"}</span>
                  <span>{approvedSyncCanRun ? "보호 조건 열림" : "보호 조건 닫힘"}</span>
                </div>
                <label className={styles.syncConfirmation}>
                  동기화 확인 문구
                  <input
                    aria-label="Approved WIKI 동기화 확인 문구"
                    onChange={(event) => setApprovedSyncConfirmation(event.target.value)}
                    placeholder={approvedSyncConfirmationText}
                    value={approvedSyncConfirmation}
                  />
                </label>
                <div className={styles.syncWarnings} aria-label="Approved WIKI 동기화 사전 실행 경고">
                  {approvedSyncDryRunWarnings.length ? approvedSyncDryRunWarnings.map((warning) => (
                    <span key={warning}>{warning}</span>
                  )) : <span>현재 패키지에 사전 실행 경고가 없습니다.</span>}
                </div>
                <div className={styles.syncHistory} aria-label="Approved WIKI 동기화 이력">
                  {approvedSyncHistory.length ? approvedSyncHistory.slice(0, 5).map((run) => (
                    <article key={run.id}>
                      <strong>{approvedSyncRunStatusLabels[run.status]} / {approvedSyncTargetLabels[run.target]}</strong>
                      <p>{formatDate(run.createdAt)} / {run.packageName}</p>
                      <span>{run.readyCount}/{run.readinessCount} 준비됨</span>
                      <span>항목 {run.itemCount}개</span>
                      <span>출처 참조 {run.sourceReferences}개</span>
                      <span>출처 없음 {run.unsourced}개</span>
                      <span>{run.providerConfigured ? "제공자 설정됨" : "제공자 차단됨"}</span>
                    </article>
                  )) : <p className={styles.empty}>아직 서버 동기화 audit 이력이 없습니다.</p>}
                </div>
                <section className={styles.syncTargetPanel} aria-label="Approved WIKI provider 대상 설정">
                  <div className={styles.exportHeader}>
                    <div>
                    <p>제공자 대상</p>
                    <h4>사전 실행 미리보기와 실행 패키지</h4>
                    </div>
                    <div className={styles.editorTools}>
                      <button onClick={saveApprovedSyncTargetConfig} type="button">
                        대상 설정 저장
                      </button>
                      <button disabled={!providerPreviewAudit} onClick={createApprovedProviderPreview} type="button">
                        제공자 미리보기 생성
                      </button>
                      <button disabled={!approvedProviderPreview} onClick={copyApprovedProviderPreview} type="button">
                        제공자 미리보기 복사
                      </button>
                      <button disabled={!approvedProviderPreview} onClick={executeApprovedProviderAdapter} type="button">
                        어댑터 실행
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={copyApprovedProviderExecution} type="button">
                        실행 결과 복사
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={copyApprovedProviderExecutionPackage} type="button">
                        실행 패키지 복사
                      </button>
                      <button disabled={!approvedProviderExecution} onClick={downloadApprovedProviderExecutionPackage} type="button">
                        실행 패키지 다운로드
                      </button>
                    </div>
                  </div>
                  <div className={styles.sourceChips} aria-label="Approved WIKI 동기화 대상 설정 요약">
                    <span>{selectedApprovedSyncTargetConfig?.label ?? approvedSyncTargetLabels[approvedSyncTarget]}</span>
                    <span>{approvedSyncTargetEnabled ? "대상 사용 중" : "대상 꺼짐"}</span>
                    <span>{approvedSyncTargetDryRunOnly ? "사전 실행 전용" : "실행 허용"}</span>
                    <span>어댑터 {selectedApprovedSyncTargetConfig ? approvedProviderAdapterLabels[selectedApprovedSyncTargetConfig.adapter] : "미저장"}</span>
                    <span>인증 정보 {selectedApprovedSyncTargetConfig ? approvedProviderCredentialStatusLabels[selectedApprovedSyncTargetConfig.credentialStatus] : "미저장"}</span>
                    <span>인증 출처 {selectedApprovedSyncTargetConfig ? approvedProviderCredentialSourceLabels[selectedApprovedSyncTargetConfig.credentialSource] : "미저장"}</span>
                    <span>범위 {selectedApprovedSyncTargetConfig ? approvedSyncTargetLabels[selectedApprovedSyncTargetConfig.credentialScope] : approvedSyncTargetLabels[approvedSyncTarget]}</span>
                    <span>인증 저장소 {selectedApprovedSyncTargetConfig ? approvedProviderCredentialStoreLabels[selectedApprovedSyncTargetConfig.credentialStore] : "미저장"}</span>
                    <span>{selectedApprovedSyncTargetConfig?.remoteWriteReady ? "원격 쓰기 준비됨" : "원격 쓰기 차단됨"}</span>
                    <span>실행 플래그 {selectedApprovedSyncTargetConfig?.liveWriteFeatureFlagEnabled ? "사용 중" : "꺼짐"}</span>
                    <span>롤백 {selectedApprovedSyncTargetConfig ? approvedProviderPlanStatusLabels[selectedApprovedSyncTargetConfig.rollbackPlanStatus] : "미저장"}</span>
                    <span>대조 {selectedApprovedSyncTargetConfig ? approvedProviderPlanStatusLabels[selectedApprovedSyncTargetConfig.reconciliationPlanStatus] : "미저장"}</span>
                    <span>인벤토리 {selectedApprovedSyncTargetConfig?.inventoryEntryCount ?? 0}</span>
                    <span>{providerPreviewAudit ? "제공자 실행 가능 감사 있음" : "제공자 실행 가능 감사 없음"}</span>
                  </div>
                  <div className={styles.syncWarnings} aria-label="Approved WIKI 원격 쓰기 차단 조건">
                    {selectedApprovedSyncTargetConfig?.credentialLastValidatedAt ? (
                      <span>인증 정보 검증 {formatDate(selectedApprovedSyncTargetConfig.credentialLastValidatedAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.credentialRotationDueAt ? (
                      <span>교체 예정 {formatDate(selectedApprovedSyncTargetConfig.credentialRotationDueAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.rollbackPlanRef ? (
                      <span>롤백 {selectedApprovedSyncTargetConfig.rollbackPlanRef}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.reconciliationPlanRef ? (
                      <span>대조 {selectedApprovedSyncTargetConfig.reconciliationPlanRef}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.liveWriteFeatureFlag ? (
                      <span>{selectedApprovedSyncTargetConfig.liveWriteFeatureFlag} {selectedApprovedSyncTargetConfig.liveWriteFeatureFlagEnabled ? "사용 중" : "꺼짐"}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.inventoryImportedAt ? (
                      <span>인벤토리 가져옴 {formatDate(selectedApprovedSyncTargetConfig.inventoryImportedAt)}</span>
                    ) : null}
                    {selectedApprovedSyncTargetConfig?.inventoryWarnings.map((warning) => (
                      <span key={warning}>{warning}</span>
                    ))}
                    {selectedApprovedSyncTargetConfig?.remoteWriteBlockers.length
                      ? selectedApprovedSyncTargetConfig.remoteWriteBlockers.map((blocker) => (
                        <span key={blocker}>{blocker}</span>
                      ))
                      : <span>원격 쓰기 전제 조건은 준비됐지만 실제 제공자 쓰기는 아직 꺼져 있습니다.</span>}
                  </div>
                  <div className={styles.syncTargetControls}>
                    <label>
                      <input
                        checked={approvedSyncTargetEnabled}
                        onChange={(event) => setApprovedSyncTargetEnabled(event.target.checked)}
                        type="checkbox"
                      />
                      대상 사용
                    </label>
                    <label>
                      <input
                        checked={approvedSyncTargetDryRunOnly}
                        onChange={(event) => setApprovedSyncTargetDryRunOnly(event.target.checked)}
                        type="checkbox"
                      />
                      사전 실행 전용
                    </label>
                    <label>
                      인증 정보 참조
                      <input
                        aria-label="Approved WIKI sync target credential reference"
                        onChange={(event) => setApprovedSyncTargetCredentialRef(event.target.value)}
                        placeholder="서버 secret 참조만 입력"
                        value={approvedSyncTargetCredentialRef}
                      />
                    </label>
                    <label>
                      제공자 미리보기 확인 문구
                      <input
                        aria-label="Approved WIKI provider preview confirmation"
                        onChange={(event) => setApprovedProviderPreviewConfirmation(event.target.value)}
                        placeholder={approvedProviderPreviewConfirmationText}
                        value={approvedProviderPreviewConfirmation}
                      />
                    </label>
                    <label>
                      제공자 실행 확인 문구
                      <input
                        aria-label="Approved WIKI provider execution confirmation"
                        onChange={(event) => setApprovedProviderExecutionConfirmation(event.target.value)}
                        placeholder={approvedProviderExecutionConfirmationText}
                        value={approvedProviderExecutionConfirmation}
                      />
                    </label>
                    <label>
                      대상 메모
                      <input
                        aria-label="Approved WIKI sync target notes"
                        onChange={(event) => setApprovedSyncTargetNotes(event.target.value)}
                        placeholder="선택 사항 제공자 대상 메모"
                        value={approvedSyncTargetNotes}
                      />
                    </label>
                    <label>
                      Obsidian 인벤토리 명세
                      <textarea
                        aria-label="Approved WIKI Obsidian inventory manifest"
                        onChange={(event) => setApprovedSyncTargetInventoryManifest(event.target.value)}
                        placeholder='{"entries":[{"path":"approved-wiki/example.md","contentDigest":"...","managedBy":"approved_wiki"}]}'
                        value={approvedSyncTargetInventoryManifest}
                      />
                    </label>
                  </div>
                  {approvedProviderPreview ? (
                    <div className={styles.providerPreview} aria-label="Approved WIKI provider 미리보기">
                      <strong>{approvedProviderPreview.destination} / 사전 실행 미리보기</strong>
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
                    <div className={styles.providerPreview} aria-label="Approved WIKI provider 실행">
                      <strong>{approvedProviderExecution.destination} / {approvedProviderExecutionStatusLabels[approvedProviderExecution.status]}</strong>
                      <p>{approvedProviderExecution.artifactName}</p>
                      <div>
                        <span>항목 {approvedProviderExecution.itemCount}개</span>
                        <span>{approvedProviderArtifactTypeLabels[approvedProviderExecution.artifactType]}</span>
                        <span>{approvedProviderExecution.contentDigest.slice(0, 16)} 해시</span>
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
                      <div className={styles.sourceChips} aria-label="Approved WIKI provider 실행 패키지 검토 메모 요약">
                        <span>검토 메모 {approvedProviderExecution.packageReview.reviewNoteCount}개</span>
                        <span>{approvedProviderExecution.packageReview.latestReviewNoteAt ? `최근 ${formatDate(approvedProviderExecution.packageReview.latestReviewNoteAt)}` : "아직 메모 없음"}</span>
                        <span>{approvedProviderExecution.packageReview.packageDigest.slice(0, 16)} 패키지 해시</span>
                      </div>
                      <div className={styles.reviewNoteForm} aria-label="Approved WIKI provider 실행 패키지 검토 메모 양식">
                        <label>
                          분류
                          <select
                            aria-label="Provider 실행 패키지 검토 메모 분류"
                            onChange={(event) => setApprovedProviderExecutionReviewNoteCategory(event.target.value as ProviderExecutionPackageReviewNoteCategory)}
                            value={approvedProviderExecutionReviewNoteCategory}
                          >
                            {providerExecutionPackageReviewNoteCategories.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          검토 메모
                          <textarea
                            aria-label="Provider 실행 패키지 검토 메모 내용"
                            onChange={(event) => setApprovedProviderExecutionReviewNoteText(event.target.value)}
                            placeholder="변경 불가 패키지 근거는 유지하고 검토 맥락만 추가"
                            value={approvedProviderExecutionReviewNoteText}
                          />
                        </label>
                        <button
                          disabled={approvedProviderExecutionReviewNoteSaving || !approvedProviderExecutionReviewNoteText.trim()}
                          onClick={saveApprovedProviderExecutionPackageReviewNote}
                          type="button"
                        >
                          {approvedProviderExecutionReviewNoteSaving ? "저장하고 있습니다..." : "검토 메모 추가"}
                        </button>
                      </div>
                      <div className={styles.reviewNotes} aria-label="Approved WIKI provider 실행 패키지 검토 메모">
                        {approvedProviderExecution.packageReviewNotes.length ? approvedProviderExecution.packageReviewNotes.map((note) => (
                          <article key={note.id}>
                            <strong>{getProviderExecutionPackageReviewNoteCategoryLabel(note.category)}</strong>
                            <p>{note.note}</p>
                            <span>{formatDate(note.createdAt)} / {note.reviewerId ?? "알 수 없는 검토자"}</span>
                            <span>{note.packageDigest.slice(0, 16)} 패키지 해시</span>
                          </article>
                        )) : <p className={styles.empty}>아직 패키지 검토 메모가 없습니다.</p>}
                      </div>
                    </div>
                  ) : null}
                  <section className={styles.providerPreview} aria-label="Approved WIKI provider 실행 패키지 이력">
                    <strong>실행 패키지 검토 이력</strong>
                    <div className={styles.sourceChips} aria-label="Approved WIKI provider 실행 패키지 이력 요약">
                      <span>패키지 {approvedProviderExecutions.length}개</span>
                      <span>표시 {visibleApprovedProviderExecutions.length}개</span>
                      <span>출처 append-only audit</span>
                      <span>로컬 다운로드는 추적하지 않음</span>
                    </div>
                    <div className={styles.approvedToolbar} aria-label="Approved WIKI provider 실행 패키지 이력 필터">
                      <label>
                        대상
                        <select
                          aria-label="Provider 실행 패키지 대상 필터"
                          onChange={(event) => setApprovedProviderExecutionTargetFilter(event.target.value as ApprovedSyncTarget | "all")}
                          value={approvedProviderExecutionTargetFilter}
                        >
                          <option value="all">전체 대상</option>
                          {(["portable_archive", "obsidian", "notion", "assistant_retrieval"] as ApprovedSyncTarget[]).map((target) => (
                            <option key={target} value={target}>{approvedSyncTargetLabels[target]}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        상태
                        <select
                          aria-label="Provider 실행 패키지 상태 필터"
                          onChange={(event) => setApprovedProviderExecutionStatusFilter(event.target.value as ApprovedProviderExecution["status"] | "all")}
                          value={approvedProviderExecutionStatusFilter}
                        >
                          <option value="all">전체 상태</option>
                          <option value="executed">{approvedProviderExecutionStatusLabels.executed}</option>
                          <option value="preflight_recorded">{approvedProviderExecutionStatusLabels.preflight_recorded}</option>
                        </select>
                      </label>
                      <label>
                        산출물
                        <select
                          aria-label="제공자 실행 패키지 산출물 필터"
                          onChange={(event) => setApprovedProviderExecutionArtifactFilter(event.target.value as ApprovedProviderExecution["artifactType"] | "all")}
                          value={approvedProviderExecutionArtifactFilter}
                        >
                          <option value="all">전체 산출물</option>
                          <option value="portable_archive_manifest">{approvedProviderArtifactTypeLabels.portable_archive_manifest}</option>
                          <option value="obsidian_markdown_manifest">{approvedProviderArtifactTypeLabels.obsidian_markdown_manifest}</option>
                          <option value="obsidian_live_write_preflight">{approvedProviderArtifactTypeLabels.obsidian_live_write_preflight}</option>
                        </select>
                      </label>
                      <label>
                        패키지 해시
                        <input
                          aria-label="제공자 실행 패키지 해시 필터"
                          onChange={(event) => setApprovedProviderExecutionDigestFilter(event.target.value)}
                          placeholder="패키지 해시 접두어"
                          value={approvedProviderExecutionDigestFilter}
                        />
                      </label>
                      <label>
                        검토
                        <select
                          aria-label="제공자 실행 패키지 검토 범위 필터"
                          onChange={(event) => setApprovedProviderExecutionReviewCoveragePreset(event.target.value as ProviderExecutionPackageReviewCoveragePreset)}
                          value={approvedProviderExecutionReviewCoveragePreset}
                        >
                          <option value="all">전체 검토 상태</option>
                          <option value="reviewed">검토됨</option>
                          <option value="unreviewed">미검토</option>
                          <option value="stale_unreviewed">오래된 미검토</option>
                        </select>
                      </label>
                      <label>
                        검토자
                        <input
                          aria-label="제공자 실행 패키지 검토자 필터"
                          onChange={(event) => setApprovedProviderExecutionReviewReviewerFilter(event.target.value)}
                          placeholder="검토자 ID"
                          value={approvedProviderExecutionReviewReviewerFilter}
                        />
                      </label>
                      <label>
                        메모 유형
                        <select
                          aria-label="제공자 실행 패키지 검토 메모 유형 필터"
                          onChange={(event) => setApprovedProviderExecutionReviewCategoryFilter(event.target.value as ProviderExecutionPackageReviewNoteCategory | "all")}
                          value={approvedProviderExecutionReviewCategoryFilter}
                        >
                          <option value="all">전체 메모 유형</option>
                          {providerExecutionPackageReviewNoteCategories.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        오래됨 기준일
                        <input
                          aria-label="제공자 실행 패키지 오래됨 기준일"
                          min={0}
                          max={365}
                          onChange={(event) => setApprovedProviderExecutionReviewStaleDays(Number.parseInt(event.target.value, 10) || 0)}
                          type="number"
                          value={approvedProviderExecutionReviewStaleDays}
                        />
                      </label>
                      <button onClick={downloadApprovedProviderExecutionPackageReviewNotesCsv} type="button">
                        메모 CSV 내보내기
                      </button>
                      <button onClick={copyApprovedProviderExecutionPackageReviewHandoff} type="button">
                        검토 전달 자료 복사
                      </button>
                    </div>
                    <div className={styles.sourceChips} aria-label="Provider execution package review shortcut reset chips">
                      {approvedProviderExecutionDigestFilter.trim() ? (
                        <button onClick={() => setApprovedProviderExecutionDigestFilter("")} type="button">
                          패키지 해시 지우기 {approvedProviderExecutionDigestFilter.trim().slice(0, 12)}
                        </button>
                      ) : null}
                      {approvedProviderExecutionReviewCategoryFilter !== "all" ? (
                        <button onClick={() => setApprovedProviderExecutionReviewCategoryFilter("all")} type="button">
                          메모 유형 지우기 {getProviderExecutionPackageReviewNoteCategoryLabel(approvedProviderExecutionReviewCategoryFilter)}
                        </button>
                      ) : null}
                      {approvedProviderExecutionReviewReviewerFilter.trim() ? (
                        <button onClick={() => setApprovedProviderExecutionReviewReviewerFilter("")} type="button">
                          검토자 지우기 {approvedProviderExecutionReviewReviewerFilter.trim()}
                        </button>
                      ) : null}
                      {hasProviderExecutionReviewShortcutFilters ? (
                        <button onClick={clearApprovedProviderExecutionReviewShortcutFilters} type="button">
                          검토 바로가기 지우기
                        </button>
                      ) : (
                        <span>활성화된 바로가기 필터 없음</span>
                      )}
                    </div>
                    <div className={styles.handoffPreview} aria-label="Provider 실행 패키지 검토 전달 자료 미리보기">
                      <div className={styles.handoffPreviewHeader}>
                        <strong>활성 검토 전달 자료 미리보기</strong>
                        <span>복사 전 읽기 전용 미리보기</span>
                      </div>
                      {approvedProviderExecutionReviewReport ? (
                        <>
                          <div className={styles.sourceChips} aria-label="Provider 실행 패키지 검토 전달 자료 활성 필터">
                            <span>검토 범위 {approvedProviderExecutionReviewReport.filters.coveragePreset}</span>
                            <span>오래됨 기준일 {approvedProviderExecutionReviewReport.filters.staleDays}</span>
                            <span>
                              메모 유형{" "}
                              {approvedProviderExecutionReviewReport.filters.category === "all"
                                ? "모두"
                                : getProviderExecutionPackageReviewNoteCategoryLabel(approvedProviderExecutionReviewReport.filters.category)}
                            </span>
                            <span>검토자 {approvedProviderExecutionReviewReport.filters.reviewerId ?? "모두"}</span>
                            <span>패키지 해시 {approvedProviderExecutionReviewReport.filters.packageDigest?.slice(0, 16) ?? "모두"}</span>
                          </div>
                          <div className={styles.sourceChips} aria-label="Provider 실행 패키지 검토 전달 자료 요약 개수">
                            <span>패키지 {approvedProviderExecutionReviewReport.summary.packageCount}</span>
                            <span>검토됨 {approvedProviderExecutionReviewReport.summary.reviewedCount}</span>
                            <span>미검토 {approvedProviderExecutionReviewReport.summary.unreviewedCount}</span>
                            <span>오래됨 {approvedProviderExecutionReviewReport.summary.staleUnreviewedCount}</span>
                            <span>메모 {approvedProviderExecutionReviewReport.summary.noteCount}</span>
                          </div>
                          <div className={styles.handoffPreviewGrid}>
                            <div aria-label="Provider 실행 패키지 검토 전달 자료 검토자별 개수">
                              <strong>검토자별 수</strong>
                              {approvedProviderExecutionReviewReport.summary.reviewerCounts.length ? (
                                approvedProviderExecutionReviewReport.summary.reviewerCounts.slice(0, 4).map((item) => (
                                  <span key={item.reviewerId ?? "unknown"}>{item.reviewerId ?? "확인 불가"}: {item.count}</span>
                                ))
                              ) : (
                                <span>없음</span>
                              )}
                            </div>
                            <div aria-label="Provider 실행 패키지 검토 전달 자료 유형별 개수">
                              <strong>메모 유형별 수</strong>
                              {approvedProviderExecutionReviewReport.summary.categoryCounts.length ? (
                                approvedProviderExecutionReviewReport.summary.categoryCounts.map((item) => (
                                  <span key={item.category}>{getProviderExecutionPackageReviewNoteCategoryLabel(item.category)}: {item.count}</span>
                                ))
                              ) : (
                                <span>없음</span>
                              )}
                            </div>
                          </div>
                          <div className={styles.reviewNotes} aria-label="Provider 실행 패키지 검토 전달 자료 검토 범위 미리보기">
                            {approvedProviderExecutionReviewReport.coverage.slice(0, 4).map((item) => (
                              <article key={item.executionId}>
                                <strong>{providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]} / {approvedSyncTargetLabels[item.target]}</strong>
                                <p>{item.packageFilename}</p>
                                <span>메모 {item.noteCount}개</span>
                                <span>{item.packageDigest.slice(0, 16)} 해시</span>
                              </article>
                            ))}
                          </div>
                          <pre aria-label="Provider 실행 패키지 검토 전달 자료 Markdown 미리보기">
                            {providerExecutionPackageReviewHandoffPreview}
                          </pre>
                        </>
                      ) : (
                        <p>제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.</p>
                      )}
                    </div>
                    {approvedProviderExecutionReviewReport ? (
                      <div className={styles.providerReviewReport} aria-label="Approved WIKI provider 실행 패키지 검토 리포트">
                        <div className={styles.sourceChips}>
                          <span>검토됨 {approvedProviderExecutionReviewReport.summary.reviewedCount}</span>
                          <span>미검토 {approvedProviderExecutionReviewReport.summary.unreviewedCount}</span>
                          <span>오래됨 {approvedProviderExecutionReviewReport.summary.staleUnreviewedCount}</span>
                          <span>메모 {approvedProviderExecutionReviewReport.summary.noteCount}</span>
                        </div>
                        <div className={styles.sourceChips} aria-label="Provider 실행 패키지 검토자 빠른 필터">
                          {approvedProviderExecutionReviewReport.summary.reviewerCounts.length ? approvedProviderExecutionReviewReport.summary.reviewerCounts.slice(0, 4).map((item) => (
                            <button
                              key={item.reviewerId ?? "unknown"}
                              onClick={() => setApprovedProviderExecutionReviewReviewerFilter(item.reviewerId ?? "")}
                              type="button"
                            >
                              {item.reviewerId ?? "확인 불가"} ({item.count})
                            </button>
                          )) : <span>아직 검토자 없음</span>}
                        </div>
                        <div className={styles.sourceChips} aria-label="Provider 실행 패키지 메모 유형 빠른 필터">
                          <button onClick={() => setApprovedProviderExecutionReviewCategoryFilter("all")} type="button">
                            전체 메모 유형
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
                        <div className={styles.coverageGroupTotals} aria-label="Provider 실행 패키지 검토 범위 큐 그룹 합계">
                          <article>
                            <strong>현재 표시 전체</strong>
                            <span>패키지 {approvedProviderExecutionReviewReport.summary.coverageGroupTotals.totalCount}개</span>
                            <span>메모 {approvedProviderExecutionReviewReport.summary.coverageGroupTotals.noteCount}개</span>
                          </article>
                          <article>
                            <strong>검토됨</strong>
                            <span>패키지 {approvedProviderExecutionReviewReport.summary.coverageGroupTotals.reviewedCount}개</span>
                            <span>패키지 검토 메모 있음</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("reviewed")} type="button">
                              검토됨 보기
                            </button>
                          </article>
                          <article>
                            <strong>미검토</strong>
                            <span>패키지 {approvedProviderExecutionReviewReport.summary.coverageGroupTotals.unreviewedCount}개</span>
                            <span>일치하는 검토 메모 없음</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("unreviewed")} type="button">
                              미검토 보기
                            </button>
                          </article>
                          <article>
                            <strong>오래됨</strong>
                            <span>패키지 {approvedProviderExecutionReviewReport.summary.coverageGroupTotals.staleUnreviewedCount}개</span>
                            <span>{approvedProviderExecutionReviewReport.filters.staleDays}일 기준</span>
                            <button onClick={() => showApprovedProviderExecutionReviewCoverageGroup("stale_unreviewed")} type="button">
                              오래됨 보기
                            </button>
                          </article>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 큐 밀도 설정"
                          title="큐 밀도 설정은 검토 스캔을 위한 로컬 그룹 큐 간격만 바꿉니다."
                        >
                          {(["comfortable", "compact"] as ProviderExecutionPackageReviewQueueDensity[]).map((density) => (
                            <button
                              key={density}
                              aria-pressed={approvedProviderExecutionReviewQueueDensity === density}
                              onClick={() => setApprovedProviderExecutionReviewQueueDensity(density)}
                              type="button"
                            >
                              {density === "comfortable" ? "넓은 큐" : "압축 큐"}
                            </button>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 로컬 인수인계 작업"
                          title="로컬 전달 작업은 브라우저 전용 provider 실행 패키지 검토 범위 요약 상태를 복사, 다운로드, 초기화합니다."
                        >
                          <button onClick={copyApprovedProviderExecutionPackageCoverageGroupSummary} type="button">
                            그룹 요약 복사
                          </button>
                          <button onClick={downloadApprovedProviderExecutionPackageCoverageGroupSummary} type="button">
                            그룹 요약 다운로드
                          </button>
                          <button onClick={copyApprovedProviderExecutionPackageCoverageGroupSummaryFilename} type="button">
                            파일명 복사
                          </button>
                          <button
                            onClick={copyApprovedProviderExecutionPackageCoverageGroupSummaryResetConfirmation}
                            type="button"
                          >
                            초기화 확인 문구 복사
                          </button>
                          <button onClick={resetApprovedProviderExecutionPackageCoverageGroupSummaryStatus} type="button">
                            요약 상태 초기화
                          </button>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 필터 칩"
                          title="요약 필터 칩은 미리보기와 로컬 전달 작업에 쓰이는 활성 provider 실행 패키지 검토 범위를 표시합니다."
                        >
                          {providerExecutionPackageReviewActiveFilterLabels.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 개수 칩"
                          title="요약 개수 칩은 복사되는 Markdown 요약에 쓰이는 표시, 검토됨, 미검토, 오래됨, 메모 합계를 표시합니다."
                        >
                          {providerExecutionPackageCoverageSummaryCountChips.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 다운로드 상태 칩"
                          title="다운로드 상태는 브라우저 전용이며 그룹 요약 다운로드가 로컬 Markdown 파일을 만든 뒤 갱신됩니다."
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryDownloadFilename
                              ? `다운로드됨 ${approvedProviderExecutionCoverageSummaryDownloadFilename}`
                              : "다운로드 대기"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 복사 상태 칩"
                          title="복사 상태는 브라우저 전용이며 그룹 요약 복사가 로컬에서 성공한 뒤 갱신됩니다."
                        >
                          <span>{approvedProviderExecutionCoverageSummaryCopied ? "그룹 요약 복사됨" : "복사 대기"}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 파일명 복사 상태 칩"
                          title="파일명 복사 상태는 브라우저 전용이며 파일명 복사가 로컬에서 성공한 뒤 갱신됩니다."
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryCopiedFilename
                              ? `파일명 복사됨 ${approvedProviderExecutionCoverageSummaryCopiedFilename}`
                              : "파일명 복사 대기"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 초기화 설명 칩"
                          title="상태 초기화는 브라우저 전용 요약 복사, 파일명 복사, 초기화 확인 문구 복사, 복사 시각, 다운로드 표시만 바꿉니다."
                        >
                          <span>
                            초기화는 브라우저 전용 요약 복사, 파일명 복사, 초기화 확인 문구 복사, 복사 시각, 다운로드 상태를 지웁니다.
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 초기화 확인 문구 칩"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationTitle}
                        >
                          <span>{providerExecutionPackageCoverageGroupSummaryResetConfirmation}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 초기화 확인 문구 복사 상태 칩"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyStatusTitle}
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryCopiedResetConfirmation
                              ? `초기화 확인 문구 복사됨 ${approvedProviderExecutionCoverageSummaryCopiedResetConfirmation}`
                              : "초기화 확인 문구 복사 대기"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 초기화 확인 문구 복사 시각 칩"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationCopiedAtTitle}
                        >
                          <span>
                            {approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt
                              ? `초기화 확인 문구 복사 시각 ${approvedProviderExecutionCoverageSummaryResetConfirmationCopiedAt}`
                              : "초기화 확인 문구 복사 시각 대기"}
                          </span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="Provider 실행 패키지 검토 범위 요약 초기화 확인 문구 최신성 칩"
                          title={providerExecutionPackageCoverageGroupSummaryResetConfirmationFreshnessTitle}
                        >
                          <span>{providerExecutionPackageCoverageGroupSummaryResetConfirmationCopyFreshness}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 생성 시각 칩"
                          title="생성 시각은 미리보기와 로컬 전달 작업에 쓰이는 제공자 검토 리포트 시각입니다."
                        >
                          <span>생성 {approvedProviderExecutionReviewReport.generatedAt}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 다음 다운로드 파일명 칩"
                          title="다음 파일은 그룹 요약 다운로드와 파일명 복사 로컬 전달 작업에 쓰이는 Markdown 파일명입니다."
                        >
                          <span>다음 파일 {providerExecutionPackageCoverageGroupSummaryNextDownloadFilename}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 Markdown 크기 칩"
                          title="줄 수와 글자 수는 복사와 다운로드에 쓰이는 Markdown 미리보기 본문 기준입니다."
                        >
                          {providerExecutionPackageCoverageGroupSummarySizeChips.map((label) => (
                            <span key={label}>{label}</span>
                          ))}
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 주요 큐 칩"
                          title="주요 큐는 현재 표시된 제공자 실행 패키지 검토 범위 큐 중 가장 큰 큐입니다."
                        >
                          <span>{providerExecutionPackageCoverageDominantQueueChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 빈 큐 개수 칩"
                          title="빈 큐 수는 활성 필터에서 패키지가 없는 표시 큐 개수입니다."
                        >
                          <span>{providerExecutionPackageCoverageEmptyQueueChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 검토 필요 칩"
                          title="검토 필요 수는 아직 연결된 검토 메모가 없는 표시 패키지 개수입니다."
                        >
                          <span>{providerExecutionPackageCoverageReviewNeededChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 오래됨 우선순위 칩"
                          title="오래됨 우선순위는 표시된 미검토 제공자 실행 패키지가 기준일을 넘었는지 보여줍니다."
                        >
                          <span>{providerExecutionPackageCoverageStalePriorityChip}</span>
                        </div>
                        <div
                          className={styles.sourceChips}
                          aria-label="제공자 실행 패키지 검토 범위 요약 로컬 전용 인수인계 칩"
                          title="로컬 전달 전용은 복사와 다운로드가 서버 아카이브를 만들거나 제공자 검토 상태를 바꾸지 않는다는 뜻입니다."
                        >
                          <span>로컬 전달 전용, 서버 아카이브 없음</span>
                        </div>
                        <pre
                          className={styles.coverageGroupSummaryPreview}
                          aria-label="제공자 실행 패키지 검토 범위 그룹 요약 미리보기"
                        >
                          {providerExecutionPackageCoverageGroupSummary}
                        </pre>
                        <div
                          className={`${styles.coverageGroupQueues} ${
                            approvedProviderExecutionReviewQueueDensity === "compact" ? styles.coverageGroupQueuesCompact : ""
                          }`}
                          aria-label="제공자 실행 패키지 검토 범위 큐 그룹"
                          title="그룹화된 검토 범위 큐는 활성 필터 기준의 제공자 실행 패키지 검토 상태 묶음을 표시합니다."
                        >
                          {approvedProviderExecutionReviewReport.coverage.length === 0 ? (
                            <p
                              className={styles.coverageQueueEmptyState}
                              title="활성 검토 범위 필터와 일치하는 제공자 실행 패키지가 없을 때 표시됩니다."
                            >
                              활성 검토 범위 필터와 일치하는 제공자 실행 패키지가 없습니다: {providerExecutionPackageReviewActiveFilterLabels.join(", ")}.
                            </p>
                          ) : null}
                          {providerExecutionPackageReviewCoverageGroups.map((group) => (
                            <section
                              key={group.key}
                              className={styles.coverageGroupQueue}
                              title={`${group.title} 큐는 이 검토 상태 묶음의 표시 패키지 ${group.rows.length}개를 보여줍니다.`}
                            >
                              <header>
                                <strong>{group.title}</strong>
                                <span
                                  title={`${group.title} 수는 활성 필터 아래 표시되는 제공자 실행 패키지 ${group.rows.length}개입니다.`}
                                >
                                  {group.rows.length}개 패키지
                                </span>
                                <p>{group.description}</p>
                              </header>
                              <div
                                className={styles.reviewNotes}
                                aria-label={`${group.title} rows`}
                                title={`${group.title} 행은 이 검토 상태 묶음의 첫 표시 제공자 실행 패키지를 보여줍니다.`}
                              >
                                {group.rows.length ? group.rows.slice(0, 4).map((item) => (
                                  <article
                                    key={item.executionId}
                                    title={`${item.packageFilename}은 ${approvedSyncTargetLabels[item.target]} 대상의 ${providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]} 큐에 있습니다.`}
                                  >
                                    <strong title="큐 행 상태는 검토 범위 상태와 제공자 동기화 대상을 함께 표시합니다.">
                                      {providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]} / {approvedSyncTargetLabels[item.target]}
                                    </strong>
                                    <p title="패키지 파일명은 이 큐 행의 로컬 제공자 실행 패키지 근거 파일을 식별합니다.">
                                      {item.packageFilename}
                                    </p>
                                    <div
                                      className={styles.sourceChips}
                                      aria-label="제공자 실행 패키지 검토 범위 행 칩"
                                      title="Coverage 행 칩은 상태, 검토 메모 수, 대상, 최근 검토 또는 오래됨 기준 정보를 요약합니다."
                                    >
                                      <span>상태 {providerExecutionPackageReviewCoverageStatusLabels[item.coverageStatus]}</span>
                                      <span>메모 {item.noteCount}개</span>
                                      <span>대상 {approvedSyncTargetLabels[item.target]}</span>
                                      <span
                                        title={
                                          item.latestReviewNoteAt
                                            ? "최근 검토 칩은 이 제공자 실행 패키지의 최신 검토 메모 날짜를 표시합니다."
                                            : "오래됨 기준 칩은 미검토 제공자 실행 패키지의 활성 기준일을 표시합니다."
                                        }
                                      >
                                        {item.latestReviewNoteAt ? `최근 ${formatDate(item.latestReviewNoteAt)}` : `오래됨 기준 ${item.staleDays}일`}
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => setApprovedProviderExecutionDigestFilter(item.packageDigest)}
                                      title="이 패키지 해시로 제공자 실행 패키지 검토 화면을 필터링합니다. 검토 상태는 변경하지 않습니다."
                                      type="button"
                                    >
                                      패키지 해시 보기 {item.packageDigest.slice(0, 12)}
                                    </button>
                                  </article>
                                )) : (
                                  <p>{providerExecutionPackageReviewActiveFilterLabels.join(", ")} 조건에서 이 검토 그룹과 일치하는 제공자 실행 패키지가 없습니다.</p>
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
                          <strong>{approvedProviderExecutionStatusLabels[execution.status]} / {approvedSyncTargetLabels[execution.target]}</strong>
                          <p>{formatDate(execution.createdAt)} / {execution.packageReview.filename}</p>
                          <span>{approvedProviderArtifactTypeLabels[execution.artifactType]}</span>
                          <span>{execution.packageReview.packageDigest.slice(0, 16)} 패키지 해시</span>
                          <span>{execution.packageReview.available ? "패키지 사용 가능" : "패키지 사용 불가"}</span>
                          <span>서버 audit 보존</span>
                          <span>{execution.packageReview.immutable ? "변경 불가 근거" : "변경 가능 근거"}</span>
                          <span>{execution.packageReview.localDownloadTracked ? "로컬 다운로드 추적됨" : "로컬 다운로드 별도"}</span>
                          <span>검토 메모 {execution.packageReview.reviewNoteCount}개</span>
                          <span>{execution.packageReview.latestReviewNoteAt ? `최근 ${formatDate(execution.packageReview.latestReviewNoteAt)}` : "미검토 패키지"}</span>
                          <button onClick={() => setApprovedProviderExecutionDigestFilter(execution.packageReview.packageDigest)} type="button">
                            패키지 해시 보기
                          </button>
                          <button onClick={() => setApprovedProviderExecution(execution)} type="button">
                            패키지 검토
                          </button>
                        </article>
                      )) : <p className={styles.empty}>현재 필터와 일치하는 제공자 실행 패키지가 없습니다.</p>}
                    </div>
                  </section>
                </section>
              </section>
            </section>
            </section>
      </KnowledgeWorkTabPanel>

      <KnowledgeWorkTabPanel activeTab={activeWorkTab} tab="local_import">
        <section className={styles.editor} aria-label="로컬 WIKI 가져오기">
          <div className={styles.editorHeader}>
            <div>
              <p>로컬 WIKI 가져오기</p>
              <h3>균형 선별 미리보기</h3>
            </div>
            <div className={styles.editorTools}>
              <button disabled={busy || !localImportDefaultTaskValue} onClick={createLocalImportPreview} type="button">
                가져오기 미리보기 생성
              </button>
              <button disabled={busy || !activeImportPreview || activeImportPreview.state !== "ready"} onClick={confirmLocalImportPreview} type="button">
                미리보기 확정
              </button>
              <button disabled={busy || !activeImportPreview || activeImportPreview.state !== "confirmed" || localImportIncludedCount === 0} onClick={importLocalImportPreview} type="button">
                후보로 가져오기
              </button>
            </div>
          </div>
          <section className={styles.reviewBannerReady} aria-label="로컬 WIKI 가져오기 안전 경계">
            <strong>raw 파일 본문과 로컬 경로는 화면에 노출하지 않습니다.</strong>
            <p>가져오기 버튼은 차단 규칙을 먼저 적용하고, 사용자가 미리보기를 확정한 뒤에만 SaaS 검토 대기 후보를 생성합니다.</p>
          </section>
          <div className={styles.sourceChips} aria-label="로컬 WIKI 가져오기 현재 상태">
            <span>활성 기준 {localImportRubricLabel}</span>
            <span>미리보기 {activeImportPreview?.state ?? "없음"}</span>
            <span>포함 {localImportIncludedCount}개</span>
            <span>제외 {localImportExcludedCount}개</span>
            <span>기본 task {localImportDefaultTaskValue ? localImportDefaultTaskValue.slice(0, 8) : "없음"}</span>
          </div>
          <div className={styles.reviewNoteForm} aria-label="로컬 WIKI 가져오기 미리보기 생성">
            <label>
              기본 task ID
              <input
                onChange={(event) => setLocalImportDefaultTaskId(event.target.value)}
                placeholder={selectedCandidate?.taskId ?? "후보를 선택하거나 task ID 입력"}
                value={localImportDefaultTaskId}
              />
            </label>
            <p className={styles.empty}>
              비워두면 현재 선택된 후보의 task를 기본 연결 대상으로 사용합니다. 선택 후보가 없으면 task ID를 직접 입력해야 합니다.
            </p>
          </div>
          <section className={styles.guardrails} aria-label="로컬 WIKI 균형 선별 기준">
            <h4>LLM 균형 선별 기준</h4>
            <div>
              {["재사용 가치", "근거 강도", "업무 연결성", "최신성", "WIKI 공백 보완성", "초안 작성 가능성", "위험도"].map((label) => (
                <article className={styles.guardrailReady} key={label}>
                  <strong>{label}</strong>
                  <p>차단 규칙을 통과한 항목만 이 기준으로 점수화하며 기준 버전은 API에서 교체할 수 있습니다.</p>
                </article>
              ))}
            </div>
          </section>
          <div className={styles.syncHistory} aria-label="로컬 WIKI 가져오기 미리보기 행">
            {importPreviews.length ? importPreviews.slice(0, 6).map((preview) => (
              <article key={preview.id}>
                <strong>{preview.state} / rubric v{preview.rubricVersion}</strong>
                <p>{preview.workspaceFingerprint}</p>
                <span>포함 {countJsonArrayItems(preview.includedItems)}개</span>
                <span>제외 {countJsonArrayItems(preview.excludedItems)}개</span>
                <span>기본 task {preview.defaultTaskId ? preview.defaultTaskId.slice(0, 8) : "없음"}</span>
                <span>{preview.confirmedAt ? `확정 ${formatDate(preview.confirmedAt)}` : `생성 ${formatDate(preview.createdAt)}`}</span>
                <button
                  onClick={() => {
                    setLocalImportPreviewId(preview.id);
                    setSelectedRubricId(preview.rubricId);
                    updateNavigationQuery({ work: "local_import", importPreviewId: preview.id, rubricId: preview.rubricId });
                  }}
                  type="button"
                >
                  미리보기 선택
                </button>
              </article>
            )) : <p className={styles.empty}>아직 로컬 WIKI 가져오기 미리보기가 없습니다.</p>}
          </div>
          <section className={styles.guardrails} aria-label="로컬 WIKI 가져오기 기준 관리">
            <h4>기준 관리</h4>
            <div>
              <article className={styles.guardrailReady}>
                <strong>{localImportRubricLabel}</strong>
                <p>기준 CRUD, 활성화, 롤백은 서버 API와 append-only audit으로 기록됩니다.</p>
              </article>
              <article className={importRubrics.some((rubric) => rubric.state === "archived") ? styles.guardrailWarning : styles.guardrailReady}>
                <strong>롤백</strong>
                <p>{importRubrics.some((rubric) => rubric.state === "archived") ? "보관된 기준으로 롤백할 수 있습니다." : "보관된 기준이 없어 롤백 대상이 없습니다."}</p>
              </article>
            </div>
            <div className={styles.reviewNoteForm} aria-label="로컬 WIKI 가져오기 기준 롤백">
              <label>
                롤백 사유
                <input
                  onChange={(event) => setRubricRollbackReason(event.target.value)}
                  placeholder="예: 새 기준의 차단 조건이 과도함"
                  value={rubricRollbackReason}
                />
              </label>
              <button
                disabled={busy || !rubricRollbackReason.trim() || !importRubrics.some((rubric) => rubric.state === "archived")}
                onClick={rollbackActiveRubric}
                type="button"
              >
                기준 롤백
              </button>
            </div>
          </section>
        </section>
        <details className={styles.compactMetadata}>
          <summary>Phase 1 경계 기록</summary>
          <KnowledgeLocalImportPlaceholderPanel activeRubricLabel={localImportRubricLabel} />
        </details>
      </KnowledgeWorkTabPanel>

      <KnowledgeWorkTabPanel activeTab={activeWorkTab} tab="operations">
            <section className={styles.summaryBand} aria-label="Knowledge 운영 점검 요약">
              <div>
                <p>운영 점검</p>
                <h2>검증, worker, 법규 출처 상태</h2>
              </div>
              <span>{regulationGovernance?.sourceCount ?? 0} 출처</span>
            </section>
            <KnowledgeGenerationProfilePanel
              profiles={generationProfiles}
              loading={generationProfilesLoading}
              error={generationProfilesError}
              selectedCandidateId={detail?.id ?? selectedCandidate?.id ?? ""}
              selectedCandidateTitle={detail?.title ?? selectedCandidate?.title ?? ""}
              onRefresh={refreshGenerationProfiles}
            />
            <LegalBatchAuditStatusPanel />
            <LegalChangeMonitorPanel />
            <section className={styles.exportPanel} aria-label="Knowledge 운영 검증">
              <div className={styles.exportHeader}>
                <div>
                  <p>운영 검증</p>
                  <h4>청크, 동기화 worker, 권한</h4>
                </div>
                <div className={styles.exportActions}>
                  <button onClick={refreshFileChunkDebug} type="button">
                    청크 새로고침
                  </button>
                  <button onClick={refreshKnowledgeSyncWorker} type="button">
                    동기화 worker 새로고침
                  </button>
                </div>
              </div>
              <div className={styles.reviewNoteForm} aria-label="File-analysis chunk retrieval debug query">
                <input
                  aria-label="Chunk debug query"
                  onChange={(event) => setFileChunkDebugQuery(event.target.value)}
                  placeholder="청크 검색 디버그용 FTS 질의"
                  value={fileChunkDebugQuery}
                />
                <button onClick={refreshFileChunkDebug} type="button">
                  질의 실행
                </button>
              </div>
              <div className={styles.sourceChips} aria-label="Knowledge capability migration state">
                <span>{knowledgeCapabilityReport?.allowed ? "지식 관리자 허용됨" : "지식 관리자 차단됨"}</span>
                <span>매핑 {knowledgeCapabilityReport?.mapping ?? "알 수 없음"}</span>
                <span>권한 {knowledgeCapabilityReport?.capabilities.length ?? 0}</span>
                <span>
                  권한 테이블 {knowledgeCapabilityReport?.migration.profileCapabilityTableReady ? "준비됨" : "대기 중"}
                </span>
              </div>
              <div className={styles.sourceChips} aria-label="파일 분석 청크 검토 범위 요약">
                <span>{fileChunkDebug?.database.available ? "청크 DB 사용 가능" : "청크 DB 사용 불가"}</span>
                <span>전체 {fileChunkDebug?.database.totalChunks ?? 0}</span>
                <span>임베딩됨 {fileChunkDebug?.database.embeddedChunks ?? 0}</span>
                <span>누락 {fileChunkDebug?.database.missingEmbeddings ?? 0}</span>
                <span>검색 결과 {fileChunkDebug?.retrieval.length ?? 0}</span>
              </div>
              {fileChunkDebug?.blockers.length ? (
                <div className={styles.syncWarnings} aria-label="파일 분석 청크 디버그 차단 항목">
                  {fileChunkDebug.blockers.map((blocker) => (
                    <span key={blocker}>{blocker}</span>
                  ))}
                </div>
              ) : null}
              <div className={styles.syncHistory} aria-label="파일 분석 청크 검토 범위 행">
                {fileChunkDebug?.coverage.length ? fileChunkDebug.coverage.map((group) => (
                  <article key={`${group.sourceType}:${group.verificationState}`}>
                    <strong>{group.sourceType} / {group.verificationState}</strong>
                    <span>전체 {group.totalChunks}</span>
                    <span>임베딩됨 {group.embeddedChunks}</span>
                    <span>누락 {group.missingEmbeddings}</span>
                  </article>
                )) : <p className={styles.empty}>사용 가능한 청크 검토 범위 행이 없습니다.</p>}
              </div>
              <div className={styles.syncHistory} aria-label="파일 분석 검색 디버그 결과">
                {fileChunkDebug?.retrieval.length ? fileChunkDebug.retrieval.slice(0, 5).map((hit) => (
                  <article key={hit.id}>
                    <strong>{hit.fileName} / 청크 {hit.chunkIndex}</strong>
                    <span>FTS {hit.ftsRank.toFixed(4)}</span>
                    <span>{hit.vectorReady ? "벡터 준비됨" : "임베딩 없음"}</span>
                    <p>{hit.preview}</p>
                  </article>
                )) : <p className={styles.empty}>현재 질의의 검색 디버그 결과가 없습니다.</p>}
              </div>
              <div className={styles.sourceChips} aria-label="Approved WIKI sync worker summary">
                <span>대기 {knowledgeSyncWorker?.queue.pendingProviderReadyAudits ?? 0}</span>
                <span>미리보기 {knowledgeSyncWorker?.queue.pendingPreviewCount ?? 0}</span>
                <span>실행 {knowledgeSyncWorker?.queue.executionCount ?? 0}</span>
                <span>{knowledgeSyncWorker?.dryRun ? "사전 실행/사전 점검 전용" : "실행 활성화"}</span>
              </div>
              <div className={styles.syncHistory} aria-label="Approved WIKI sync worker next actions">
                {knowledgeSyncWorker?.nextActions.length ? knowledgeSyncWorker.nextActions.slice(0, 5).map((action) => (
                  <article key={action.auditId}>
                    <strong>{action.action} / {approvedSyncTargetLabels[action.target]}</strong>
                    <p>{action.packageName}</p>
                    <span>차단 조건 {action.blockers.length}개</span>
                  </article>
                )) : <p className={styles.empty}>대기 중인 제공자 실행 가능 동기화 audit이 없습니다.</p>}
              </div>
            </section>

            <section className={styles.exportPanel} aria-label="규정 공식 출처 거버넌스 갱신">
              <div className={styles.exportHeader}>
                <div>
                  <p>법규 출처 거버넌스</p>
                  <h4>오프라인 갱신 검토</h4>
                </div>
                <div className={styles.editorTools}>
                  <button disabled={regulationGovernanceLoading} onClick={refreshRegulationGovernance} type="button">
                    거버넌스 새로고침
                  </button>
                  <button disabled={!regulationGovernance} onClick={copyRegulationGovernanceReport} type="button">
                    거버넌스 리포트 복사
                  </button>
                </div>
              </div>
              {regulationGovernance ? (
                <>
                  <div className={styles.sourceChips} aria-label="규정 거버넌스 요약">
                    <span>패키지 {regulationGovernance.packageId}</span>
                    <span>기준일 {regulationGovernance.asOf}</span>
                    <span>출처 {regulationGovernance.sourceCount}</span>
                    <span>문서 {regulationGovernance.documentCount}</span>
                    <span>{regulationGovernance.packageDigest.slice(0, 16)} 패키지 해시</span>
                    <span>준비 {regulationGovernanceReadyCount}/{regulationGovernanceChecks.length}</span>
                    <span>출처 검토 {regulationGovernance.sourceReviewSummary.count}</span>
                    <span>{regulationGovernance.sourceReviewSummary.reviewedSourceCount}/{regulationGovernance.sourceCount}개 출처 검토됨</span>
                    <span>{regulationGovernance.sourceReviewSummary.latestReviewedAt ? `최신 출처 검토 ${formatDate(regulationGovernance.sourceReviewSummary.latestReviewedAt)}` : "출처 검토 없음"}</span>
                    <span>확인 기록 {regulationGovernance.acknowledgementSummary.count}</span>
                    <span>{regulationGovernance.acknowledgementSummary.latestAcknowledgedAt ? `최신 확인 ${formatDate(regulationGovernance.acknowledgementSummary.latestAcknowledgedAt)}` : "확인 기록 없음"}</span>
                    <span>{regulationGovernance.productionImport.enabled ? "프로덕션 가져오기 활성화" : "프로덕션 가져오기 차단됨"}</span>
                    <span>{regulationGovernance.productionImportPreflight.status === "ready" ? "프로덕션 사전 점검 준비됨" : "프로덕션 사전 점검 차단됨"}</span>
                  </div>
                  <div className={styles.syncWarnings} aria-label="규정 프로덕션 가져오기 사전 점검">
                    {regulationGovernance.productionImportPreflight.blockers.length ? regulationGovernance.productionImportPreflight.blockers.map((blocker) => (
                      <span key={blocker}>사전 점검 차단: {blocker}</span>
                    )) : <span>프로덕션 가져오기 사전 점검에 차단 항목이 없습니다.</span>}
                    {regulationGovernance.productionImportPreflight.warnings.map((warning) => (
                      <span key={warning}>사전 점검 경고: {warning}</span>
                    ))}
                  </div>
                  <div className={styles.reviewNoteForm} aria-label="규정 출처 검토 범위 필터">
                    <label>
                      출처 검토 범위
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
                      오래됨 기준일
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
                      출처 검토 CSV 다운로드
                    </a>
                  </div>
                  <div className={styles.sourceChips} aria-label="규정 출처 검토 범위 요약">
                    <span>검토됨 {regulationSourceReviewCoverage?.summary.reviewedSourceCount ?? 0}</span>
                    <span>미검토 {regulationSourceReviewCoverage?.summary.unreviewedSourceCount ?? 0}</span>
                    <span>오래됨 {regulationSourceReviewCoverage?.summary.staleSourceCount ?? 0}</span>
                    <span>차단됨 {regulationSourceReviewCoverage?.summary.blockedSourceCount ?? 0}</span>
                    <span>후속 조치 {regulationSourceReviewCoverage?.summary.followUpSourceCount ?? 0}</span>
                    <span>{regulationSourceReviewCoverage?.packageDigest.slice(0, 16) ?? "없음"} 검토 범위 해시</span>
                  </div>
                  <section className={styles.guardrails} aria-label="규정 거버넌스 점검">
                    <h4>거버넌스 점검</h4>
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
                    <div className={styles.syncWarnings} aria-label="규정 거버넌스 경고">
                      {regulationGovernance.errors.map((error) => (
                        <span key={`error-${error}`}>오류: {error}</span>
                      ))}
                      {regulationGovernance.warnings.map((warning) => (
                        <span key={`warning-${warning}`}>경고: {warning}</span>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.syncWarnings} aria-label="규정 거버넌스 경고">
                      <span>오프라인 명세에 차단 수준의 거버넌스 오류가 없습니다.</span>
                    </div>
                  )}
                  <div className={styles.reviewNoteForm} aria-label="규정 거버넌스 확인 기록 양식">
                    <label>
                          검토자 확인
                      <textarea
                        aria-label="규정 거버넌스 확인 메모"
                        onChange={(event) => setRegulationGovernanceAcknowledgementNote(event.target.value)}
                        placeholder="이 거버넌스 패키지와 현재 검증 스냅샷에 대한 검토자 맥락을 기록하세요"
                        value={regulationGovernanceAcknowledgementNote}
                      />
                    </label>
                    <button
                      disabled={regulationGovernanceAcknowledgementSaving || !regulationGovernanceAcknowledgementNote.trim()}
                      onClick={saveRegulationGovernanceAcknowledgement}
                      type="button"
                    >
                      {regulationGovernanceAcknowledgementSaving ? "저장하고 있습니다..." : "확인 기록"}
                    </button>
                  </div>
                  <div className={styles.reviewNotes} aria-label="규정 거버넌스 확인 기록">
                    {regulationGovernance.acknowledgements.length ? regulationGovernance.acknowledgements.map((acknowledgement) => (
                      <article key={acknowledgement.id}>
                        <strong>{formatDate(acknowledgement.createdAt)} / {acknowledgement.reviewerId ?? "알 수 없는 검토자"}</strong>
                        <p>{acknowledgement.note}</p>
                        <span>{acknowledgement.packageDigest.slice(0, 16)} 패키지 해시</span>
                        <span>기준일 {acknowledgement.asOf}</span>
                        <span>출처 {acknowledgement.sourceCount}개</span>
                        <span>문서 {acknowledgement.documentCount}개</span>
                        <span>기한 초과 {acknowledgement.statusCounts.overdue}개</span>
                        <span>{acknowledgement.productionImportEnabled ? "프로덕션 가져오기 활성화" : "프로덕션 가져오기 차단됨"}</span>
                      </article>
                    )) : <p className={styles.empty}>기록된 거버넌스 확인이 없습니다.</p>}
                  </div>
                  <div className={styles.syncHistory} aria-label="규정 출처 검토 범위 행">
                    {regulationSourceReviewCoverage?.sources.length ? regulationSourceReviewCoverage.sources.map((source) => (
                      <article key={source.sourceId}>
                        <strong>{source.sourceName}</strong>
                        <p>{source.officialUrl}</p>
                        <span>{regulationSourceReviewCoverageLabels[source.coverageStatus]}</span>
                        <span>검토 {source.reviewCount}개</span>
                        <span>{source.latestReviewerId ?? "검토자 없음"}</span>
                        <span>{source.latestReviewedAt ? `최신 ${formatDate(source.latestReviewedAt)}` : "최신 검토 없음"}</span>
                        <span>{source.packageDigest.slice(0, 16)} 패키지 해시</span>
                      </article>
                    )) : <p className={styles.empty}>현재 필터와 일치하는 출처 검토 커버리지 행이 없습니다.</p>}
                  </div>
                  <div className={styles.syncHistory} aria-label="규정 거버넌스 출처 갱신 행">
                    {regulationGovernance.sources.map((source) => (
                      <article key={source.sourceId}>
                        <strong>{source.sourceName}</strong>
                        <p>{source.publisher} / {source.sourceId}</p>
                        <span>{regulationGovernanceStatusLabels[source.refreshStatus]}</span>
                        <span>갱신 기한 {source.refreshDueAt || "없음"}</span>
                        <span>{source.daysUntilDue === null ? "기한 날짜가 올바르지 않음" : `${source.daysUntilDue}일 남음`}</span>
                        <span>문서 {source.documentCount}개</span>
                        <span>관리자 검토 필요 {source.adminReviewRequiredCount}개</span>
                        <span>체크리스트 {source.verificationChecklist.length}개</span>
                        <span>출처 검토 {source.reviewSummary.count}개</span>
                        <span>{source.reviewSummary.latestReviewState ? regulationGovernanceSourceReviewStateLabels[source.reviewSummary.latestReviewState] : "미검토"}</span>
                        <div className={styles.sourceReviewForm}>
                          <label>
                            검토 상태
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
                            출처 검토 메모
                            <textarea
                              onChange={(event) => {
                                setRegulationGovernanceSourceReviewNotes((current) => ({
                                  ...current,
                                  [source.sourceId]: event.target.value,
                                }));
                              }}
                              placeholder="출처별 공식 URL, 갱신, 체크리스트 또는 후속 검토 맥락을 기록하세요"
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
                            {regulationGovernanceSourceReviewSaving === source.sourceId ? "저장하고 있습니다..." : "출처 검토 기록"}
                          </button>
                        </div>
                        <div className={styles.sourceReviewNotes} aria-label={`${source.sourceName} source review records`}>
                          {source.reviews.length ? source.reviews.slice(0, 2).map((review) => (
                            <article key={review.id}>
                              <strong>
                                {regulationGovernanceSourceReviewStateLabels[review.reviewState]} / {formatDate(review.createdAt)} / {review.reviewerId ?? "알 수 없는 검토자"}
                              </strong>
                              <p>{review.note}</p>
                            </article>
                          )) : <p className={styles.empty}>기록된 출처별 검토가 없습니다.</p>}
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <p className={styles.empty}>
                  {regulationGovernanceLoading ? "규정 거버넌스를 불러오는 중입니다..." : "규정 거버넌스 리포트를 아직 불러오지 못했습니다."}
                </p>
              )}
            </section>
      </KnowledgeWorkTabPanel>
      <p className={styles.status} role="status" aria-live="polite">{navigationStatus || status}</p>
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

function countJsonArrayItems(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function createLocalImportPreviewItems(input: {
  defaultTaskId: string;
  detail: CandidateDetail | null;
  draft: ReturnType<typeof createDraftFromDetail>;
  selectedCandidate: CandidateListItem | null;
}) {
  const title = input.draft.title.trim() || input.detail?.title || input.selectedCandidate?.title || "로컬 WIKI 가져오기 초안";
  const summary = input.draft.summary.trim() || input.detail?.summary || input.selectedCandidate?.summary || "로컬 WIKI 가져오기 미리보기";
  const bodyMarkdown = input.draft.bodyMarkdown.trim() ||
    input.detail?.answer ||
    [
      `# ${title}`,
      "",
      "## 요약",
      summary,
      "",
      "## 적용 범위",
      "로컬 raw 파일 본문과 경로는 UI에 노출하지 않고 안전한 후보 초안만 미리보기로 전달합니다.",
    ].join("\n");

  return [{
    id: input.detail?.id ?? `local-import-${input.defaultTaskId}`,
    title,
    summary,
    bodyMarkdown,
    tags: splitTags(input.draft.tagsText).length ? splitTags(input.draft.tagsText) : input.selectedCandidate?.tags ?? ["local-wiki"],
    targetTaskId: input.defaultTaskId,
  }];
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
      label: "조직 전체 범위",
      detail: "이 초안은 조직 범위에 표시됩니다. 한 프로젝트를 넘어 재사용 가능한 내용인지 확인하세요.",
      changed,
    };
  }
  if (scope === "admin_only") {
    return {
      label: "관리자 전용 범위",
      detail: "이 초안은 더 넓게 공개할 준비가 될 때까지 관리자에게만 제한됩니다.",
      changed,
    };
  }
  return {
    label: "제한된 범위",
    detail: "이 초안은 프로젝트 또는 프로젝트 멤버 범위로 제한됩니다.",
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

function readStructuredDraftApprovalIssue(
  structuredDraft: StructuredKnowledgeDraft | null,
  draft: {
    title: string;
    summary: string;
    bodyMarkdown: string;
    scope: Scope;
  },
  draftTags: string[],
) {
  if (!structuredDraft) {
    return "구조화 WIKI 초안을 생성해야 승인할 수 있습니다.";
  }
  if (structuredDraft.approvalReadiness.status === "blocked") {
    return "구조화 초안의 차단 항목을 해결해야 승인할 수 있습니다.";
  }
  const mismatches: string[] = [];
  if (normalizeComparableText(draft.title) !== normalizeComparableText(structuredDraft.title)) {
    mismatches.push("제목");
  }
  if (normalizeComparableText(draft.summary) !== normalizeComparableText(structuredDraft.summary)) {
    mismatches.push("요약");
  }
  if (normalizeComparableMarkdown(draft.bodyMarkdown) !== normalizeComparableMarkdown(structuredDraft.markdown)) {
    mismatches.push("본문");
  }
  if (draft.scope !== structuredDraft.ontology.scope) {
    mismatches.push("범위");
  }
  if (draftTags.join("|") !== structuredDraft.tags.join("|")) {
    mismatches.push("태그");
  }
  return mismatches.length
    ? `구조화 초안과 기본 승인 필드가 다릅니다: ${mismatches.join(", ")}. 구조화 초안을 다시 반영하세요.`
    : null;
}

function normalizeComparableText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeComparableMarkdown(value: string) {
  return value.trim().replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "");
}

function createSourceHandoff(
  detail: CandidateDetail,
  draft: ReturnType<typeof createDraftFromDetail>,
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "지식 후보 전달 자료",
    `기록: ${detail.id}`,
    `작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `프로젝트: ${detail.projectName}`,
    `상태: ${stateLabels[detail.state]}`,
    `검토: ${detail.review?.status ?? "대기"}`,
    `범위: ${scopeLabels[draft.scope]}`,
    `신뢰도: ${detail.confidenceScore}%`,
    `근거: ${detail.evidence.length}`,
    `근거 유형: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "없음"}`,
  ].join("\n");
}

function createApprovalChecklist(
  detail: CandidateDetail,
  readiness: Array<{ label: string; ready: boolean }>,
  guardrails: ApprovalGuardrail[],
  evidenceKindCounts: Array<[string, number]>,
) {
  return [
    "지식 승인 체크리스트",
    `기록: ${detail.id}`,
    `작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `상태: ${stateLabels[detail.state]}`,
    `신뢰도: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `근거: ${detail.evidence.length}`,
    `근거 유형: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "없음"}`,
    "",
    "준비 상태",
    ...readiness.map((item) => `- ${item.ready ? "준비됨" : "누락"} ${item.label}`),
    "",
    "가드레일",
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
  const decisionLabel = warnings.length ? "차단 조건 검토" : "승인 준비 검토";
  const decisionGuidance = warnings.length
    ? "최종 승인 전에 경고 항목을 해결하거나 명시적으로 수용하세요."
    : "WIKI 항목을 승인하기 전에 최종 대상과 근거 정책을 확인하세요.";

  return [
    "# 지식 승인 결정 메모",
    `- 후보: ${detail.title} (${detail.id})`,
    `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- 프로젝트: ${detail.projectName}`,
    `- 제안된 결정 맥락: ${decisionLabel}`,
    `- 현재 후보 상태: ${stateLabels[detail.state]}`,
    `- 검토 상태: ${reviewStatus.label}`,
    `- 공개 범위: ${scopeLabels[draft.scope]}`,
    `- 반려 사유 초안: ${draft.rejectionReason.trim() || "없음"}`,
    `- 신뢰도: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `- 준비 상태: ${readiness.filter((item) => item.ready).length}/${readiness.length}`,
    `- 경고 그룹: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    `- 근거: ${detail.evidence.length}`,
    `- 근거 유형: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "없음"}`,
    "",
    "## 결정 가이드",
    `- ${decisionGuidance}`,
    "",
    "## 차단 경고",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- 차단 경고 없음"]),
    "",
    "## 준비된 점검",
    ...(readyItems.length
      ? readyItems.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- 기록된 준비 점검 없음"]),
    "",
    "## 리스크 그룹",
    ...riskGroups.map((group) => `- ${group.label}: 경고 ${group.warningCount}개, 준비 메모 ${group.readyCount}개`),
  ].join("\n");
}

function buildRejectionReasonPresets(guardrails: ApprovalGuardrail[]): RejectionReasonPreset[] {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  if (!warnings.length) {
    return [
      {
        label: "수동 검토 사유",
        reason: "활성 승인 가드레일 차단 조건이 없습니다. 반려하려면 수동 반려 사유를 추가하세요.",
      },
    ];
  }

  return warnings.slice(0, 5).map((item) => ({
    label: item.label,
    reason: `해결 전까지 반려: ${item.label}. ${item.detail}`,
  }));
}

function createApprovalBlockerHandoff(
  detail: CandidateDetail,
  guardrails: ApprovalGuardrail[],
  riskGroups: ApprovalRiskGroup[],
) {
  const warnings = guardrails.filter((item) => item.tone === "warning");
  return [
    "# 지식 승인 차단 조건",
    `- 후보: ${detail.title} (${detail.id})`,
    `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- 경고 수: ${warnings.length}`,
    `- 경고 그룹: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    "",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- 활성 승인 차단 조건 없음"]),
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
    "# 지식 승인 패키지",
    `- 후보: ${detail.title} (${detail.id})`,
    `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- 프로젝트: ${detail.projectName}`,
    `- 검토 상태: ${reviewStatus.label}`,
    `- 신뢰도: ${detail.confidenceScore}% (${readConfidenceBand(detail.confidenceScore)})`,
    `- 준비 상태: ${readiness.filter((item) => item.ready).length}/${readiness.length}`,
    `- 경고 그룹: ${riskGroups.filter((group) => group.warningCount > 0).length}/${riskGroups.length}`,
    `- 근거 유형: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "없음"}`,
    "",
    "## 초안",
    `- 제목: ${draft.title}`,
    `- 요약: ${draft.summary}`,
    `- 범위: ${scopeLabels[draft.scope]}`,
    `- 태그: ${draft.tagsText || "없음"}`,
    "",
    draft.bodyMarkdown.trim() || "Markdown 본문 없음.",
    "",
    "## 결정",
    warnings.length
      ? "- 결정 맥락: 차단 조건 검토"
      : "- 결정 맥락: 승인 준비 검토",
    `- 반려 사유 초안: ${draft.rejectionReason.trim() || "없음"}`,
    "",
    "## 차단 조건",
    ...(warnings.length
      ? warnings.map((item) => `- ${item.label}: ${item.detail}`)
      : ["- 활성 승인 차단 조건 없음"]),
    "",
    "## 근거",
    ...(detail.evidence.length
      ? detail.evidence.map((item) => `- ${item.kind} / 우선순위 ${item.priority}: ${item.title}${item.sourceUrl ? ` (${item.sourceUrl})` : ""}`)
      : ["- 근거 행 없음"]),
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
        label: "후보 불러옴",
        detail: "승인 패키지를 만들기 전에 후보를 선택하세요.",
        ready: false,
      },
    ];
  }

  const draftFieldReadiness = readiness.filter((item) => item.label !== "근거");
  const missingDraftFields = draftFieldReadiness.filter((item) => !item.ready).map((item) => item.label);
  const warningCount = guardrails.filter((item) => item.tone === "warning").length;

  return [
    {
      label: "초안 섹션",
      detail: missingDraftFields.length
        ? `전달 자료 작성 전 누락된 초안 필드: ${missingDraftFields.join(", ")}.`
        : `초안 섹션에 제목, 요약, 본문, 범위, 태그가 포함됩니다 (${draft.tagsText || "없음"}).`,
      ready: !missingDraftFields.length,
    },
    {
      label: "결정 섹션",
      detail: reviewStatus.tone === "ready"
        ? `${reviewStatus.label}: ${reviewStatus.detail}`
        : `${reviewStatus.label}: ${reviewStatus.detail} 최종 승인 전 결정 경로를 기록하세요.`,
      ready: reviewStatus.tone === "ready",
    },
    {
      label: "차단 조건 섹션",
      detail: warningCount
        ? `검토자가 명시적으로 처리할 차단 조건 경고 ${warningCount}개가 포함됩니다.`
        : "활성 차단 조건이 없으며, 패키지에 명확한 차단 상태가 기록됩니다.",
      ready: Boolean(guardrails.length && riskGroups.length),
    },
    {
      label: "근거 섹션",
      detail: detail.evidence.length
        ? `근거 ${detail.evidence.length}개 포함; 유형: ${evidenceKindCounts.map(([kind, count]) => `${kind} ${count}`).join(", ") || "없음"}.`
        : "이 패키지에 사용할 근거 행이 없습니다.",
      ready: detail.evidence.length > 0,
    },
    {
      label: "출처 검토 범위",
      detail: evidenceSourceCoverage.unsourced
        ? `${evidenceSourceCoverage.total}개 근거 중 ${evidenceSourceCoverage.unsourced}개에 출처 URL이 없습니다. 발췌만으로 충분한지 확인하세요.`
        : `모든 근거 ${evidenceSourceCoverage.total}개에 출처 URL이 있습니다.`,
      ready: evidenceSourceCoverage.total > 0 && evidenceSourceCoverage.unsourced === 0,
    },
    {
      label: "리스크 그룹 검토 범위",
      detail: `패키지 검토에 승인 리스크 그룹 ${riskGroups.length}개가 반영됩니다.`,
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
    "# 지식 승인 패키지 품질",
    `- 후보: ${detail.title} (${detail.id})`,
    `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- 패키지 상태: ${status.label}`,
    `- 준비된 점검: ${readyCount}/${quality.length}`,
    `- 누락 점검: ${quality.length - readyCount}`,
    "",
    "## 품질 점검",
    ...quality.map((item) => `- ${item.ready ? "준비됨" : "검토 필요"}: ${item.label} - ${item.detail}`),
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
      label: "후보 맥락",
      detail: detail
        ? `${detail.taskIssueId} / ${detail.projectName} 후보를 최종 검토용으로 불러왔습니다.`
        : "불러온 후보가 없습니다.",
      ready: Boolean(detail),
    },
    {
      label: "패키지 품질",
      detail: packageStatus.detail,
      ready: packageStatus.tone === "ready",
    },
    {
      label: "차단 조건 결정 경로",
      detail: warningCount
        ? `${warningGroupCount}개 그룹에 경고 ${warningCount}개가 있습니다. ${reason ? "반려 사유가 작성됐습니다." : "경고를 해결하거나 반려 사유를 작성하세요."}`
        : "활성 차단 조건 경고가 없습니다.",
      ready: warningCount === 0 || Boolean(reason),
    },
    {
      label: "근거 전달 자료",
      detail: detail?.evidence.length
        ? `최종 전달 자료에 사용할 근거 ${detail.evidence.length}개가 있습니다.`
        : "최종 전달 자료에 근거가 없습니다.",
      ready: Boolean(detail?.evidence.length),
    },
    {
      label: "다음 조치",
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
    "# 지식 최종 검토 마감",
    `- 후보: ${detail.title} (${detail.id})`,
    `- 작업: ${detail.taskIssueId} - ${detail.taskTitle}`,
    `- 프로젝트: ${detail.projectName}`,
    `- 패키지 품질: ${packageStatus.label} (${packageReadyCount}/${packageQuality.length})`,
    `- 최종 마감: ${finalStatus.label} (${finalReadyCount}/${finalChecklist.length})`,
    `- 다음 조치: ${nextAction}`,
    "",
    "## 패키지 품질 점검",
    ...packageQuality.map((item) => `- ${item.ready ? "준비됨" : "검토 필요"}: ${item.label} - ${item.detail}`),
    "",
    "## 최종 체크리스트",
    ...finalChecklist.map((item) => `- ${item.ready ? "준비됨" : "검토 필요"}: ${item.label} - ${item.detail}`),
  ].join("\n");
}

function buildApprovedItemQuality(item: ApprovedKnowledgeItem): ReviewChecklistItem[] {
  return [
    {
      label: "메타데이터",
      detail: item.title && item.summary
        ? "확인용 제목과 요약을 사용할 수 있습니다."
        : "승인 항목에 제목 또는 요약이 없습니다.",
      ready: Boolean(item.title && item.summary),
    },
    {
      label: "Markdown 본문",
      detail: item.bodyMarkdown.trim()
        ? `Markdown 본문 ${item.bodyMarkdown.trim().length}자를 사용할 수 있습니다.`
        : "승인된 Markdown 본문이 비어 있습니다.",
      ready: Boolean(item.bodyMarkdown.trim()),
    },
    {
      label: "태그",
      detail: item.tags.length
        ? `검색과 retrieval 그룹핑에 사용할 태그 ${item.tags.length}개가 있습니다.`
        : "이 승인 항목에 사용할 태그가 없습니다.",
      ready: item.tags.length > 0,
    },
    {
      label: "공개 범위",
      detail: `승인된 공개 범위는 ${scopeLabels[item.scope]}입니다.`,
      ready: Boolean(item.scope),
    },
    {
      label: "출처 계보",
      detail: item.sourceRecordId && item.sourceTaskId
        ? `출처 기록 ${item.sourceRecordId}와 작업 ${item.sourceTaskId}가 연결되어 있습니다.`
        : "출처 기록 또는 출처 작업 ID가 누락됐습니다.",
      ready: Boolean(item.sourceRecordId && item.sourceTaskId),
    },
    {
      label: "출처 참조",
      detail: item.sourceReferences.length
        ? `출처 참조 ${item.sourceReferences.length}개가 연결되어 있습니다.`
        : "연결된 출처 참조가 없습니다. retrieval 전달 자료에서 이 항목을 표시해야 합니다.",
      ready: item.sourceReferences.length > 0,
    },
  ];
}

function createApprovedItemHandoff(item: ApprovedKnowledgeItem, quality: ReviewChecklistItem[]) {
  const readyCount = quality.filter((check) => check.ready).length;
  return [
    "# 승인된 WIKI 항목 전달 자료",
    `- 항목: ${item.title} (${item.id})`,
    `- 범위: ${scopeLabels[item.scope]}`,
    `- 승인: ${item.approvedAt} / ${item.approvedBy}`,
    `- 출처 기록: ${item.sourceRecordId}`,
    `- 출처 작업: ${item.sourceTaskId}`,
    `- 출처 프로젝트: ${item.sourceProjectId}`,
    `- 태그: ${item.tags.join(", ") || "없음"}`,
    `- 출처 참조: ${item.sourceReferences.length}`,
    `- 품질: ${readyCount}/${quality.length}`,
    "",
    "## 요약",
    item.summary || "요약 없음.",
    "",
    "## 품질 점검",
    ...quality.map((check) => `- ${check.ready ? "준비됨" : "검토 필요"}: ${check.label} - ${check.detail}`),
    "",
    "## Markdown",
    item.bodyMarkdown.trim() || "승인된 Markdown 본문 없음.",
  ].join("\n");
}

function createApprovedSearchHandoff(
  items: ApprovedKnowledgeItem[],
  filterChips: string[],
  sourceCoverage: { sourced: number; unsourced: number; total: number },
) {
  return [
    "# 승인된 WIKI 검색 전달 자료",
    `- 표시 항목: ${items.length}`,
    `- 출처 검토 범위: 출처 있음 ${sourceCoverage.sourced}/${sourceCoverage.total}, 출처 없음 ${sourceCoverage.unsourced}`,
    "",
    "## 필터",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## 표시 항목",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id}) / 범위 ${scopeLabels[item.scope]} / 태그 ${item.tags.join(", ") || "없음"}`)
      : ["- 현재 필터 범위에 승인된 WIKI 항목이 없습니다."]),
  ].join("\n");
}

function createApprovedSourcePackage(item: ApprovedKnowledgeItem) {
  return [
    "# 승인된 WIKI 출처 패키지",
    `- 항목: ${item.title} (${item.id})`,
    `- 출처 기록: ${item.sourceRecordId}`,
    `- 출처 작업: ${item.sourceTaskId}`,
    `- 출처 프로젝트: ${item.sourceProjectId}`,
    `- 참조: ${item.sourceReferences.length}`,
    "",
    ...(item.sourceReferences.length
      ? item.sourceReferences.map((reference) => [
        `## ${reference.title}`,
        `- 유형: ${reference.kind}`,
        `- 우선순위: ${reference.priority}`,
        `- 출처 URL: ${reference.sourceUrl ?? "없음"}`,
        `- 발췌: ${reference.excerpt || "없음"}`,
        "",
      ].join("\n"))
      : ["- 연결된 출처 참조가 없습니다."]),
  ].join("\n");
}

function createApprovedIndexPackage(items: ApprovedKnowledgeItem[], filterChips: string[]) {
  return [
    "# 승인된 WIKI 색인 패키지",
    `- 항목: ${items.length}`,
    "",
    "## 필터 범위",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## 색인",
    ...(items.length
      ? items.map((item) => [
        `- ${item.title} (${item.id})`,
        `  - 범위: ${scopeLabels[item.scope]}`,
        `  - 승인: ${item.approvedAt}`,
        `  - 태그: ${item.tags.join(", ") || "없음"}`,
        `  - 출처 참조: ${item.sourceReferences.length}`,
      ].join("\n"))
      : ["- 현재 필터 범위에 승인된 WIKI 항목이 없습니다."]),
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
      label: "내보내기 범위",
      detail: items.length
        ? `승인된 WIKI 항목 ${items.length}개가 ${approvedExportFormatLabels[format]}에 포함됩니다.`
        : "현재 내보내기 범위에 승인된 WIKI 항목이 없습니다.",
      ready: items.length > 0,
    },
    {
      label: "필터 명세",
      detail: `내보내기 재현을 위해 활성 필터 칩 ${filterChips.length}개가 포함됩니다.`,
      ready: filterChips.length > 0,
    },
    {
      label: "출처 계보",
      detail: stats.unsourced
        ? `${stats.items}개 중 ${stats.unsourced}개 항목에 출처 참조가 없습니다.`
        : `${stats.items}개 중 ${stats.sourced}개 항목이 출처 참조를 포함합니다.`,
      ready: stats.items > 0 && stats.unsourced === 0,
    },
    {
      label: "태그 검토 범위",
      detail: stats.tags
        ? `동기화 그룹핑에 사용할 고유 태그 ${stats.tags}개가 있습니다.`
        : "동기화 그룹핑에 사용할 태그가 없습니다.",
      ready: stats.tags > 0,
    },
    {
      label: "본문 내용",
      detail: stats.bodyChars
        ? `Markdown 본문 총 ${stats.bodyChars}자를 사용할 수 있습니다.`
        : "내보내기 범위에 Markdown 본문 내용이 없습니다.",
      ready: stats.bodyChars > 0,
    },
    {
      label: "대상 프로필",
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
    "# 승인된 WIKI 내보내기",
    `- 생성 시각: ${new Date().toISOString()}`,
    `- 동기화 대상: ${approvedSyncTargetLabels[target]}`,
    `- 항목: ${stats.items}`,
    `- 출처 참조: ${stats.sourceReferences}`,
    `- 고유 태그: ${stats.tags}`,
    `- 본문 글자 수: ${stats.bodyChars}`,
    "",
    "## 필터 범위",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    ...items.flatMap((item) => [
      `## ${item.title}`,
      `- ID: ${item.id}`,
      `- 범위: ${scopeLabels[item.scope]}`,
      `- 승인: ${item.approvedAt} / ${item.approvedBy}`,
      `- 출처 기록: ${item.sourceRecordId}`,
      `- 출처 작업: ${item.sourceTaskId}`,
      `- 출처 프로젝트: ${item.sourceProjectId}`,
      `- 태그: ${item.tags.join(", ") || "없음"}`,
      `- 출처 참조: ${item.sourceReferences.length}`,
      "",
      item.summary || "요약 없음.",
      "",
      item.bodyMarkdown.trim() || "승인된 Markdown 본문 없음.",
      "",
      "### 출처",
      ...(item.sourceReferences.length
        ? item.sourceReferences.map((reference) => `- ${reference.kind} / 우선순위 ${reference.priority}: ${reference.title}${reference.sourceUrl ? ` (${reference.sourceUrl})` : ""}`)
        : ["- 연결된 출처 참조가 없습니다."]),
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
    "# 승인된 WIKI 동기화 명세",
    `- 대상: ${approvedSyncTargetLabels[target]}`,
    `- 형식: ${approvedExportFormatLabels[format]}`,
    `- 항목: ${items.length}`,
    `- 준비 상태: ${readyCount}/${readiness.length}`,
    "",
    "## 필터 범위",
    ...filterChips.map((chip) => `- ${chip}`),
    "",
    "## 준비 상태",
    ...readiness.map((item) => `- ${item.ready ? "준비됨" : "검토 필요"}: ${item.label} - ${item.detail}`),
    "",
    "## 항목 명세",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id}) / ${scopeLabels[item.scope]} / ${item.tags.join(", ") || "태그 없음"}`)
      : ["- 동기화 대상으로 선택된 승인 WIKI 항목이 없습니다."]),
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
    "# 승인된 WIKI 내보내기 체크리스트",
    `- 대상: ${approvedSyncTargetLabels[target]}`,
    `- 형식: ${approvedExportFormatLabels[format]}`,
    `- 항목: ${stats.items}`,
    `- 출처 참조: ${stats.sourceReferences}`,
    `- 고유 태그: ${stats.tags}`,
    "",
    "## 점검",
    ...readiness.map((item) => `- ${item.ready ? "준비됨" : "검토 필요"}: ${item.label} - ${item.detail}`),
    "",
    "## 포함 항목",
    ...(items.length
      ? items.map((item) => `- ${item.title} (${item.id})`)
      : ["- 포함된 항목 없음"]),
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
    warnings.push("동기화 대상으로 선택된 승인 WIKI 항목이 없습니다.");
  }
  for (const item of notReady) {
    warnings.push(`${item.label}: ${item.detail}`);
  }
  if (target !== "portable_archive") {
    warnings.push("외부 제공자 실행은 아직 연결되지 않았습니다. 현재는 보호된 로컬 시뮬레이션만 기록합니다.");
  }
  if (target === "obsidian" && format === "json") {
    warnings.push("Obsidian 대상은 보통 Markdown 파일을 기대합니다. JSON은 후속 변환을 위한 메타데이터 보존용입니다.");
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
    confirmation: confirmation.trim() === approvedSyncConfirmationText ? "일치" : "누락 또는 불일치",
    packageName,
    dryRunWarnings,
  };
}

function createApprovedSyncAuditPayload(
  projectId: string,
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
    projectId,
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
    "# 승인된 WIKI 보호 동기화 이력",
    `- 생성 시각: ${new Date().toISOString()}`,
    `- 실행: ${history.length}`,
    "",
    ...(history.length
      ? history.map((run) => [
        `## ${run.createdAt}`,
        `- 상태: ${approvedSyncRunStatusLabels[run.status]}`,
        `- 대상: ${approvedSyncTargetLabels[run.target]}`,
        `- 형식: ${approvedExportFormatLabels[run.format]}`,
        `- 범위: ${approvedExportScopeLabels[run.scope]}`,
        `- 패키지: ${run.packageName}`,
        `- 항목: ${run.itemCount}`,
        `- 준비 상태: ${run.readyCount}/${run.readinessCount}`,
        `- 출처 참조: ${run.sourceReferences}`,
        `- 출처 없음: ${run.unsourced}`,
        `- 확인 문구: ${run.confirmation}`,
        `- 제공자 설정됨: ${run.providerConfigured ? "예" : "아니오"}`,
        `- 제공자 실행 활성화: ${run.providerExecutionEnabled ? "예" : "아니오"}`,
        "",
        "### 사전 실행 경고",
        ...(run.dryRunWarnings.length ? run.dryRunWarnings.map((warning) => `- ${warning}`) : ["- 없음"]),
      ].join("\n"))
      : ["- 로컬에 기록된 보호 동기화 이력이 없습니다."]),
  ].join("\n");
}

function createRegulationGovernanceReport(report: RegulationGovernanceReport) {
  return [
    "# 규정 공식 출처 거버넌스 리포트",
    `- 패키지: ${report.packageId}`,
    `- 패키지 해시: ${report.packageDigest}`,
    `- 생성 시각: ${new Date().toISOString()}`,
    `- 기준 시각: ${report.asOf}`,
    `- 유효 여부: ${report.valid ? "예" : "아니오"}`,
    `- 프로덕션 가져오기: ${report.productionImport.enabled ? "활성화" : "차단"}`,
    `- 필수 검토: ${report.productionImport.requiredReview}`,
    `- 차단 사유: ${report.productionImport.blockedReason ?? "-"}`,
    `- 프로덕션 사전 점검: ${report.productionImportPreflight.status}`,
    `- 사전 점검 가져오기 가능: ${report.productionImportPreflight.canImport ? "예" : "아니오"}`,
    `- 갱신 주기: ${report.refreshPolicy.cadenceDays}일`,
    `- 오래됨 기준: ${report.refreshPolicy.staleAfterDays}일`,
    `- 출처: ${report.sourceCount}`,
    `- 문서: ${report.documentCount}`,
    "",
    "## 갱신 요약",
    `- 예정됨: ${report.statusCounts.scheduled}`,
    `- 기한 임박: ${report.statusCounts.due}`,
    `- 기한 초과: ${report.statusCounts.overdue}`,
    "",
    "## 출처 검토",
    `- 검토 기록: ${report.sourceReviewSummary.count}`,
    `- 검토된 출처: ${report.sourceReviewSummary.reviewedSourceCount}/${report.sourceCount}`,
    `- 미검토 출처: ${report.sourceReviewSummary.unreviewedSourceCount}`,
    `- 후속 조치 필요: ${report.sourceReviewSummary.followUpSourceCount}`,
    `- 차단됨: ${report.sourceReviewSummary.blockedSourceCount}`,
    `- 최신 검토: ${report.sourceReviewSummary.latestReviewedAt ?? "-"}`,
    `- 최신 검토자: ${report.sourceReviewSummary.latestReviewerId ?? "-"}`,
    "",
    "## 프로덕션 가져오기 사전 점검",
    `- 확인 기록: ${report.productionImportPreflight.acknowledgementCount}`,
    `- 출처 검토 범위: ${report.productionImportPreflight.sourceReviewCoverage.reviewedSourceCount}/${report.productionImportPreflight.sourceReviewCoverage.requiredSourceCount}`,
    `- 차단된 출처 검토: ${report.productionImportPreflight.sourceReviewCoverage.blockedSourceCount}`,
    `- 후속 출처 검토: ${report.productionImportPreflight.sourceReviewCoverage.followUpSourceCount}`,
    ...(report.productionImportPreflight.blockers.length
      ? report.productionImportPreflight.blockers.map((blocker) => `- 차단 조건: ${blocker}`)
      : ["- 차단 조건: 없음"]),
    ...(report.productionImportPreflight.warnings.length
      ? report.productionImportPreflight.warnings.map((warning) => `- 경고: ${warning}`)
      : ["- 경고: 없음"]),
    "",
    "## 확인 기록",
    `- 개수: ${report.acknowledgementSummary.count}`,
    `- 최신 확인: ${report.acknowledgementSummary.latestAcknowledgedAt ?? "-"}`,
    `- 최신 검토자: ${report.acknowledgementSummary.latestReviewerId ?? "-"}`,
    ...(report.acknowledgements.length
      ? report.acknowledgements.map((acknowledgement) => `- ${acknowledgement.createdAt} / ${acknowledgement.reviewerId ?? "알 수 없음"} / ${acknowledgement.note}`)
      : ["- 없음"]),
    "",
    "## 오류",
    ...(report.errors.length ? report.errors.map((error) => `- ${error}`) : ["- 없음"]),
    "",
    "## 경고",
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- 없음"]),
    "",
    "## 출처",
    ...report.sources.flatMap((source) => [
      `### ${source.sourceName}`,
      `- 출처 ID: ${source.sourceId}`,
      `- 발행처: ${source.publisher}`,
      `- 공식 URL: ${source.officialUrl}`,
      `- 갱신: ${regulationGovernanceStatusLabels[source.refreshStatus]} / ${source.refreshDueAt || "누락"}`,
      `- 남은 일수: ${source.daysUntilDue ?? "잘못된 날짜"}`,
      `- 문서: ${source.documentCount}`,
      `- 관리자 검토 필요: ${source.adminReviewRequiredCount}`,
      `- 승인 문서: ${source.approvedDocumentCount}`,
      `- 출처 검토 수: ${source.reviewSummary.count}`,
      `- 최신 출처 검토: ${source.reviewSummary.latestReviewedAt ?? "-"}`,
      `- 최신 출처 검토 상태: ${source.reviewSummary.latestReviewState ? regulationGovernanceSourceReviewStateLabels[source.reviewSummary.latestReviewState] : "-"}`,
      "- 검증 체크리스트:",
      ...(source.verificationChecklist.length
        ? source.verificationChecklist.map((item) => `  - ${item}`)
        : ["  - 누락"]),
      "- 출처 검토 기록:",
      ...(source.reviews.length
        ? source.reviews.map((review) => `  - ${review.createdAt} / ${regulationGovernanceSourceReviewStateLabels[review.reviewState]} / ${review.reviewerId ?? "알 수 없음"} / ${review.note}`)
        : ["  - 없음"]),
      "",
    ]),
  ].join("\n");
}

function ProviderReconciliationPackageView({ packageData }: { packageData: ApprovedProviderReconciliationPackage }) {
  return (
    <section aria-label="Approved WIKI provider reconciliation package">
      <strong>{packageData.packageName}</strong>
      <div>
        <span>경로 {packageData.summary.total}개</span>
        <span>생성 {packageData.summary.create}</span>
        <span>수정 {packageData.summary.update}</span>
        <span>삭제 {packageData.summary.delete}</span>
        <span>변경 없음 {packageData.summary.noop}</span>
      </div>
      <div>
        {packageData.operations.slice(0, 8).map((operation) => (
          <span key={`${operation.intent}:${operation.path}`}>
            {approvedProviderReconciliationIntentLabels[operation.intent]} {operation.path} / {operation.itemId.slice(0, 8)}
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
      <strong>Obsidian live-write 사전 점검</strong>
      <div>
        <span>{preflight.featureFlag} {preflight.featureFlagEnabled ? "사용 중" : "꺼짐"}</span>
        <span>{preflight.mutationReady ? "변경 준비됨" : "변경 차단됨"}</span>
        <span>변경 작업 {preflight.operationCount}개</span>
        <span>생성 {preflight.summary.create}</span>
        <span>수정 {preflight.summary.update}</span>
        <span>삭제 {preflight.summary.delete}</span>
      </div>
      <div>
        <span>롤백 {preflight.rollbackPlanRef ?? "누락"}</span>
        <span>대조 {preflight.reconciliationPlanRef ?? "누락"}</span>
      </div>
      <div>
        {preflight.operations.slice(0, 8).map((operation) => (
          <span key={`${operation.intent}:${operation.path}`}>
            {approvedProviderReconciliationIntentLabels[operation.intent]} {operation.path} / {operation.itemId.slice(0, 8)}
          </span>
        ))}
      </div>
      <div>
        {preflight.blockers.length ? preflight.blockers.map((blocker) => (
          <span key={blocker}>{blocker}</span>
        )) : <span>사전 점검 차단 조건이 없습니다.</span>}
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
    "# 승인된 WIKI 제공자 미리보기",
    `- 미리보기 ID: ${preview.id}`,
    `- 내보내기 감사 ID: ${preview.auditId}`,
    `- 대상: ${approvedSyncTargetLabels[preview.target]}`,
    `- 목적지: ${preview.destination}`,
    `- 상태: ${preview.status}`,
    `- 패키지: ${preview.packageName}`,
    `- 생성: ${preview.createdAt}`,
    `- 생성자: ${preview.createdBy ?? "알 수 없음"}`,
    "",
    "## 작업",
    ...preview.operations.map((operation) => `- ${operation}`),
    "",
    "## 경고",
    ...(preview.warnings.length ? preview.warnings.map((warning) => `- ${warning}`) : ["- 없음"]),
    "",
    ...formatApprovedProviderReconciliationPackage(preview.reconciliationPackage),
  ].join("\n");
}

function createApprovedProviderExecutionReport(execution: ApprovedProviderExecution) {
  return [
    "# 승인된 WIKI 제공자 실행",
    `- 실행 ID: ${execution.id}`,
    `- 미리보기 ID: ${execution.previewId}`,
    `- 내보내기 감사 ID: ${execution.auditId}`,
    `- 대상: ${approvedSyncTargetLabels[execution.target]}`,
    `- 목적지: ${execution.destination}`,
    `- 상태: ${approvedProviderExecutionStatusLabels[execution.status]}`,
    `- 패키지: ${execution.packageName}`,
    `- 산출물: ${execution.artifactName}`,
    `- 산출물 유형: ${approvedProviderArtifactTypeLabels[execution.artifactType]}`,
    `- 항목: ${execution.itemCount}`,
    `- 해시: ${execution.contentDigest}`,
    `- 생성: ${execution.createdAt}`,
    `- 생성자: ${execution.createdBy ?? "알 수 없음"}`,
    "",
    "## 경고",
    ...(execution.warnings.length ? execution.warnings.map((warning) => `- ${warning}`) : ["- 없음"]),
    "",
    ...formatApprovedProviderReconciliationPackage(execution.reconciliationPackage),
    "",
    ...formatApprovedProviderLiveWritePreflight(execution.liveWritePreflight),
  ].join("\n");
}

function createProviderExecutionPackageReviewHandoff(report: ProviderExecutionPackageReviewNoteReport | null) {
  if (!report) {
    return "제공자 실행 패키지 검토 리포트를 불러오지 못했습니다.";
  }
  return [
    "# 제공자 실행 패키지 검토 전달 자료",
    `- 생성 시각: ${report.generatedAt}`,
    `- 검토 범위 프리셋: ${report.filters.coveragePreset}`,
    `- 오래됨 기준일: ${report.filters.staleDays}`,
    `- 분류: ${report.filters.category}`,
    `- 검토자: ${report.filters.reviewerId ?? "전체"}`,
    `- 패키지 해시: ${report.filters.packageDigest ?? "전체"}`,
    `- 실행 ID: ${report.filters.executionId ?? "전체"}`,
    `- 패키지: ${report.summary.packageCount}`,
    `- 검토됨: ${report.summary.reviewedCount}`,
    `- 미검토: ${report.summary.unreviewedCount}`,
    `- 오래된 미검토: ${report.summary.staleUnreviewedCount}`,
    `- 메모: ${report.summary.noteCount}`,
    "",
    "## 검토자별 수",
    ...(report.summary.reviewerCounts.length
      ? report.summary.reviewerCounts.map((item) => `- ${item.reviewerId ?? "알 수 없음"}: ${item.count}`)
      : ["- 없음"]),
    "",
    "## 메모 유형별 수",
    ...(report.summary.categoryCounts.length
      ? report.summary.categoryCounts.map((item) => `- ${getProviderExecutionPackageReviewNoteCategoryLabel(item.category)}: ${item.count}`)
      : ["- 없음"]),
    "",
    "## 검토 범위",
    ...(report.coverage.slice(0, 10).map((item) => `- ${item.coverageStatus}: ${item.executionId} (메모 ${item.noteCount}개, ${item.packageDigest.slice(0, 16)} 해시)`)),
  ].join("\n");
}

function getProviderExecutionPackageReviewNoteCategoryLabel(category: ProviderExecutionPackageReviewNoteCategory) {
  return providerExecutionPackageReviewNoteCategories.find((option) => option.value === category)?.label ?? category;
}

function formatApprovedProviderReconciliationPackage(packageData: ApprovedProviderReconciliationPackage | null) {
  if (!packageData) {
    return ["## 대조 패키지", "- 없음"];
  }
  return [
    "## 대조 패키지",
    `- 패키지: ${packageData.packageName}`,
    `- 생성: ${packageData.generatedAt}`,
    `- 대상: ${approvedSyncTargetLabels[packageData.target]}`,
    `- 전체: ${packageData.summary.total}`,
    `- 생성: ${packageData.summary.create}`,
    `- 수정: ${packageData.summary.update}`,
    `- 삭제: ${packageData.summary.delete}`,
    `- 변경 없음: ${packageData.summary.noop}`,
    "",
    "### 작업",
    ...(packageData.operations.length
      ? packageData.operations.map((operation) => `- ${approvedProviderReconciliationIntentLabels[operation.intent]} ${operation.path} (${operation.itemId}, 작업 ${operation.sourceTaskId}, 해시 ${operation.contentDigest.slice(0, 16)})`)
      : ["- 없음"]),
    "",
    "### 대조 경고",
    ...(packageData.warnings.length ? packageData.warnings.map((warning) => `- ${warning}`) : ["- 없음"]),
  ];
}

function formatApprovedProviderLiveWritePreflight(preflight: ApprovedProviderLiveWritePreflight | null) {
  if (!preflight) {
    return ["## Obsidian 실시간 쓰기 사전 점검", "- 없음"];
  }
  return [
    "## Obsidian 실시간 쓰기 사전 점검",
    `- 생성: ${preflight.generatedAt}`,
    `- 기능 플래그: ${preflight.featureFlag}`,
    `- 기능 플래그 활성화: ${preflight.featureFlagEnabled ? "예" : "아니오"}`,
    `- 변경 준비됨: ${preflight.mutationReady ? "예" : "아니오"}`,
    `- 롤백 계획: ${preflight.rollbackPlanRef ?? "누락"}`,
    `- 대조 계획: ${preflight.reconciliationPlanRef ?? "누락"}`,
    `- 변경 작업: ${preflight.operationCount}`,
    `- 생성: ${preflight.summary.create}`,
    `- 수정: ${preflight.summary.update}`,
    `- 삭제: ${preflight.summary.delete}`,
    "",
    "### 변경 작업",
    ...(preflight.operations.length
      ? preflight.operations.map((operation) => `- ${approvedProviderReconciliationIntentLabels[operation.intent]} ${operation.path} (${operation.itemId}, 작업 ${operation.sourceTaskId})`)
      : ["- 없음"]),
    "",
    "### 사전 점검 차단 조건",
    ...(preflight.blockers.length ? preflight.blockers.map((blocker) => `- ${blocker}`) : ["- 없음"]),
    "",
    "### 사전 점검 경고",
    ...(preflight.warnings.length ? preflight.warnings.map((warning) => `- ${warning}`) : ["- 없음"]),
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
      ? "Markdown 패키지는 Obsidian vault 가져오기에 바로 사용할 수 있습니다."
      : "JSON 패키지는 메타데이터를 보존합니다. Obsidian으로 가져오기 전 bodyMarkdown을 파일로 변환하세요.";
  }
  if (target === "notion") {
    return "Notion 가져오기 매핑에 필요한 제목, 요약, 태그, 범위, Markdown 본문, 출처 계보를 포함합니다.";
  }
  if (target === "assistant_retrieval") {
    return "검색 색인화를 위해 태그, 범위, 출처 계보, 출처 참조를 보존합니다.";
  }
  return "휴대용 아카이브는 후속 동기화 도구를 위해 안정적인 메타데이터와 Markdown 패키지를 유지합니다.";
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
      detail: `${readyCount}/${totalCount}개 점검이 준비됐습니다.`,
      tone: "ready",
    };
  }

  return {
    label: warningLabel,
    detail: `${readyCount}/${totalCount}개 점검이 준비됐습니다. ${Math.max(totalCount - readyCount, 0)}개 항목을 검토하세요.`,
    tone: "warning",
  };
}

function readFinalReviewNextAction(
  packageStatus: ApprovalGuardrail,
  warningCount: number,
  rejectionReason: string,
) {
  if (packageStatus.tone === "warning") {
    return "최종 처리 전 패키지 품질을 검토하세요";
  }
  if (warningCount > 0 && !rejectionReason.trim()) {
    return "차단 조건을 해결하거나 반려 사유를 작성하세요";
  }
  if (warningCount > 0) {
    return "승인 전 반려하거나 차단 조건을 해결하세요";
  }
  return "WIKI 승인 준비됨";
}

function readApprovalRiskGroups(guardrails: ApprovalGuardrail[]): ApprovalRiskGroup[] {
  const groups: ApprovalRiskGroup[] = [
    { key: "scope", label: "범위", readyCount: 0, warningCount: 0, items: [] },
    { key: "metadata", label: "메타데이터", readyCount: 0, warningCount: 0, items: [] },
    { key: "structure", label: "구조", readyCount: 0, warningCount: 0, items: [] },
    { key: "evidence", label: "근거", readyCount: 0, warningCount: 0, items: [] },
    { key: "state", label: "상태", readyCount: 0, warningCount: 0, items: [] },
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
  if (label.includes("scope") || label.includes("Scope") || label.includes("범위")) {
    return "scope";
  }
  if (label.includes("Markdown") || label.includes("구조")) {
    return "structure";
  }
  if (label.includes("evidence") || label.includes("Evidence") || label.includes("priority") || label.includes("근거") || label.includes("우선순위")) {
    return "evidence";
  }
  if (label.includes("confidence") || label.includes("Confidence") || label.includes("State") || label.includes("신뢰도") || label.includes("상태")) {
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
      label: "준비 항목 누락",
      detail: `승인 전 ${missing.join(", ")} 항목을 검토하세요.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "초안 필드 준비됨",
      detail: "필수 초안 필드와 근거가 있습니다.",
      tone: "ready",
    });
  }

  if (!detail) {
    return guardrails;
  }

  if (draftScope === "organization") {
    guardrails.push({
      label: "조직 범위 검토",
      detail: "공개 범위가 조직 전체입니다. 이 지식이 조직 전체에 공유되어야 하는지 확인하세요.",
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "제한 범위 선택됨",
      detail: `공개 범위는 ${scopeLabels[draftScope]}입니다.`,
      tone: "ready",
    });
  }

  if (originalScope && originalScope !== draftScope) {
    guardrails.push({
      label: "공개 범위 변경됨",
      detail: `범위가 ${scopeLabels[originalScope]}에서 ${scopeLabels[draftScope]}로 변경됐습니다. 승인 전 새 대상을 확인하세요.`,
      tone: "warning",
    });
  } else if (originalScope) {
    guardrails.push({
      label: "공개 범위 변경 없음",
      detail: `범위가 ${scopeLabels[draftScope]}로 유지됩니다.`,
      tone: "ready",
    });
  }

  if (draftTags.length >= 2) {
    guardrails.push({
      label: "태그 검토 범위 준비됨",
      detail: `검색과 WIKI 그룹핑에 사용할 초안 태그 ${draftTags.length}개가 있습니다.`,
      tone: "ready",
    });
  } else {
    guardrails.push({
      label: "태그 검토 범위 제한됨",
      detail: `권장 초안 태그 2개 중 ${draftTags.length}개가 있습니다. 가능하면 승인 전 태그를 추가하세요.`,
      tone: "warning",
    });
  }

  if (duplicateDraftTags.length) {
    guardrails.push({
      label: "중복 초안 태그",
      detail: `승인 전 중복 태그 값을 제거하세요: ${duplicateDraftTags.join(", ")}.`,
      tone: "warning",
    });
  } else if (draftTags.length) {
    guardrails.push({
      label: "초안 태그 중복 없음",
      detail: "초안 태그에 중복이 없습니다.",
      tone: "ready",
    });
  }

  if (bodyMarkdown.trim()) {
    if (markdownOutline.length) {
      guardrails.push({
        label: "Markdown 개요 있음",
        detail: `Markdown 제목 ${markdownOutline.length}개가 있습니다.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown 제목 누락",
        detail: "초안 본문에 Markdown 내용은 있지만 제목이 없습니다. 승인 전 구조를 확인하세요.",
        tone: "warning",
      });
    }

    if (markdownStructureSummary.listItems) {
      guardrails.push({
        label: "Markdown 목록 구조 있음",
        detail: `Markdown 목록 항목 ${markdownStructureSummary.listItems}개가 있습니다.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown 목록 구조 누락",
        detail: "초안 본문에 Markdown 목록 항목이 없습니다. 승인 전 작업 또는 맥락 추출을 확인하세요.",
        tone: "warning",
      });
    }

    if (markdownWikiLinks.length) {
      guardrails.push({
        label: "Markdown WIKI 링크 있음",
        detail: `Markdown WIKI 링크 ${markdownWikiLinks.length}개가 있습니다.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "Markdown WIKI 링크 누락",
        detail: "초안 본문에 [[WIKI 링크]]가 없습니다. 기존 지식과 연결해야 하는 항목인지 확인하세요.",
        tone: "warning",
      });
    }
  }

  const changedDraftFields = draftDirtyStates.filter((item) => item.dirty).map((item) => item.label);
  if (changedDraftFields.length) {
    guardrails.push({
      label: "수정된 초안 필드",
      detail: `승인 시 수정된 초안 필드를 사용합니다: ${changedDraftFields.join(", ")}.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "초안 변경 없음",
      detail: "초안 필드가 선택한 후보 초안과 같습니다.",
      tone: "ready",
    });
  }

  if (detail.confidenceScore < 60) {
    guardrails.push({
      label: "낮은 신뢰도",
      detail: `신뢰도는 ${detail.confidenceScore}%입니다. 승인 전 근거를 확인하세요.`,
      tone: "warning",
    });
  } else {
    guardrails.push({
      label: "신뢰도 허용",
      detail: `신뢰도는 ${detail.confidenceScore}%입니다.`,
      tone: "ready",
    });
  }

  if (detail.state !== "candidate" && detail.state !== "pending_review") {
    guardrails.push({
      label: "상태 검토",
      detail: `후보의 현재 상태는 ${stateLabels[detail.state]}입니다. 이 항목을 다시 편집해야 하는지 확인하세요.`,
      tone: "warning",
    });
  }

  if (detail.evidence.length) {
    const unsourcedCount = detail.evidence.filter((item) => !item.sourceUrl).length;
    const highPriorityCount = detail.evidence.filter((item) => item.priority <= 3).length;
    if (unsourcedCount) {
      guardrails.push({
        label: "출처 없는 근거",
        detail: `${detail.evidence.length}개 근거 중 ${unsourcedCount}개에 출처 URL이 없습니다.`,
        tone: "warning",
      });
    } else {
      guardrails.push({
        label: "근거 출처 있음",
        detail: "모든 근거 행에 출처 URL이 있습니다.",
        tone: "ready",
      });
    }
    if (highPriorityCount) {
      guardrails.push({
        label: "높은 우선순위 근거 있음",
        detail: `${detail.evidence.length}개 근거 중 ${highPriorityCount}개가 높은 우선순위입니다.`,
        tone: "ready",
      });
    } else {
      guardrails.push({
        label: "높은 우선순위 근거 없음",
        detail: "근거는 있지만 높은 우선순위 근거가 없습니다. 승인 전 뒷받침이 충분한지 확인하세요.",
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
    return "높은 우선순위";
  }
  if (priority <= 5) {
    return "보통 우선순위";
  }
  return "낮은 우선순위";
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
      label: "검토 미완료",
      detail: `${readyCount}/${totalCount}개 준비 항목이 완료됐습니다. 승인 전 누락된 초안 입력을 해결하세요.`,
      tone: "warning",
    };
  }

  if (warnings > 0) {
    return {
      label: "주의 검토",
      detail: `승인 전 guardrail 경고 ${warnings}개를 검토해야 합니다.`,
      tone: "warning",
    };
  }

  return {
    label: "승인 검토 준비됨",
    detail: "준비 필드가 완료됐고 활성 guardrail 경고가 없습니다.",
    tone: "ready",
  };
}

function readApprovalDecisionMode(warnings: number, warningGroups: number): ApprovalGuardrail {
  if (warnings > 0) {
    return {
      label: "결정 메모: 차단 조건 검토",
      detail: `${warningGroups}개 리스크 그룹에 경고 ${warnings}개`,
      tone: "warning",
    };
  }

  return {
    label: "결정 메모: 승인 준비",
    detail: "활성 guardrail 경고 없음",
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

function createProjectWikiSourceHref(projectWikiItemId: string) {
  const params = new URLSearchParams({
    view: "wiki",
    projectWikiItemId,
  });
  return `/materials?${params.toString()}`;
}

function createAssistantReviewSourceHref(input: {
  taskId: string;
  assistantReviewSessionId: string;
  workSummaryDraftId?: string;
}) {
  const params = new URLSearchParams({
    taskId: input.taskId,
    assistantReviewSessionId: input.assistantReviewSessionId,
  });
  if (input.workSummaryDraftId) {
    params.set("workSummaryDraftId", input.workSummaryDraftId);
  }
  return `/daily?${params.toString()}`;
}
