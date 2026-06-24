"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AssistantActionAuditAction } from "@/domains/assistant/saas-api-mode";
import type { AssistantEvidenceKind } from "@/domains/assistant/types";
import { useProjectMeta } from "@/providers/project-provider";
import styles from "./assistant-admin-shell.module.css";

type AssistantPolicy = {
  id: string;
  projectId: string;
  enabled: boolean;
  provider: "mock" | "openai";
  model: string;
  monthlyBudgetCents: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: AssistantEvidenceKind[];
  retentionDays: number;
  updatedAt: string;
};

type UsageEvent = {
  id: string;
  taskId: string | null;
  runtimeMode: string;
  provider: "mock" | "openai";
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  status: "success" | "blocked" | "failed" | "cancelled";
  policyDecision: string;
  errorCode: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type UsageSummary = {
  projectId: string;
  month: string;
  requestCount: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  events: UsageEvent[];
};

type AuditEvent = {
  id: string;
  eventType: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

type AuditResponse = {
  projectId: string;
  month: string;
  events: AuditEvent[];
};

type AdminActionAuditRecord = {
  id: string;
  action: AssistantActionAuditAction;
  projectId: string;
  sourceTaskId: string;
  targetTaskId: string;
  createdTaskId: string | null;
  assistantRecordId: string;
  summary: {
    conclusion: string;
    scope: string;
    followUpAction: string;
    tags: string[];
  } | null;
  statusFrom: string | null;
  statusTo: string | null;
  decisionMarker: string | null;
  createdBy: string | null;
  createdAt: string;
  sourceTaskLabel: string | null;
  sourceTaskTitle: string | null;
  targetTaskLabel: string | null;
  targetTaskTitle: string | null;
  createdTaskLabel: string | null;
  createdTaskTitle: string | null;
  dailyTaskId: string;
  dailyTaskUrl: string;
};

type ActionAuditResponse = {
  projectId: string;
  month: string;
  filters: {
    action: AssistantActionAuditAction | null;
    task: string;
    assistantRecordId: string;
    actorId: string;
  };
  events: AdminActionAuditRecord[];
};

type GovernanceNoteReportResponse = {
  projectId: string;
  month: string;
  filters: {
    category: GovernanceNoteCategory | null;
    reviewerId: string;
    task: string;
    assistantRecordId: string;
  };
  notes: GovernanceNoteReportItem[];
};

type AdminActionAuditDetail = {
  audit: AdminActionAuditRecord;
  rawAuditEvent: {
    id: string;
    eventType: string;
    targetType: string;
    targetId: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  };
  assistantRecord: {
    id: string;
    taskId: string;
    question: string;
    answer: string;
    evidence: Array<{ id: string; kind: string; title: string; excerpt: string }>;
    confidenceScore: number;
    confidenceReason: string;
    executionMode: string;
    runtimeMode: string;
    draftSummary: {
      conclusion: string;
      tags: string[];
      scope: string;
      followUpAction?: string;
    } | null;
    cleanupState: string;
    candidateState: string;
    createdAt: string;
  } | null;
  workSummaryDraft: {
    id: string;
    conclusion: string;
    tags: string[];
    scope: string;
    followUpAction: string;
    status: string;
    updatedAt: string;
  } | null;
  tasks: {
    source: AdminActionAuditTaskSnapshot | null;
    target: AdminActionAuditTaskSnapshot | null;
    created: AdminActionAuditTaskSnapshot | null;
  };
  governance: {
    dailyTaskUrl: string;
    decisionMarker: string | null;
    statusTransition: string | null;
    closureState: string;
    taskHistory: string;
    provenance: string[];
  };
  governanceNotes: GovernanceNote[];
};

type GovernanceNoteCategory = "review_note" | "risk" | "follow_up" | "approval_context";

type GovernanceNote = {
  id: string;
  sourceAuditId: string;
  sourceAssistantRecordId: string;
  category: GovernanceNoteCategory;
  note: string;
  reviewerId: string | null;
  createdAt: string;
};

type GovernanceNoteReportItem = GovernanceNote & {
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

type AuditRetentionMonthCount = {
  month: string;
  total: number;
  eligible: number;
  actionAuditCount: number;
  governanceNoteCount: number;
};

type AuditRetentionPreview = {
  projectId: string;
  generatedAt: string;
  policyRetentionDays: number;
  previewRetentionDays: number;
  cutoffAt: string;
  archivePreviewToken: string;
  totalRelevantEvents: number;
  eligibleCount: number;
  protectedCount: number;
  countsByMonth: AuditRetentionMonthCount[];
  archiveItems: Array<{ id: string; eventType: string; createdAt: string; month: string }>;
};

type AuditRetentionCleanupResult = {
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

type AuditCleanupHistoryItem = {
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

type AuditCleanupHistoryResponse = {
  projectId: string;
  month: string;
  filters: {
    actorId: string;
    cutoffAt: string;
    archivePreviewToken: string;
  };
  cleanups: AuditCleanupHistoryItem[];
};

type AuditCleanupComparison = {
  projectId: string;
  generatedAt: string;
  previousCleanup: AuditCleanupHistoryItem;
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

type AuditCleanupDetail = {
  cleanup: AuditCleanupHistoryItem;
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
  reviewNotes: AuditCleanupReviewNote[];
};

type AuditCleanupReviewNote = {
  id: string;
  sourceCleanupId: string;
  sourceCleanupMonth: string;
  sourceArchivePreviewToken: string;
  category: GovernanceNoteCategory;
  note: string;
  reviewerId: string | null;
  createdAt: string;
};

type CleanupReviewNoteReportResponse = {
  projectId: string;
  month: string;
  filters: {
    category: GovernanceNoteCategory | null;
    reviewerId: string;
    archivePreviewToken: string;
    cleanupId: string;
  };
  notes: CleanupReviewNoteReportItem[];
};

type CleanupReviewNoteReportItem = AuditCleanupReviewNote & {
  cleanupCreatedAt: string;
  cleanupActorId: string | null;
  cleanupCutoffAt: string;
  cleanupPreviewRetentionDays: number;
  cleanupRequestedEligibleCount: number;
  cleanupDeletedCount: number;
  cleanupSkippedCount: number;
};

type CleanupReviewNoteSummary = {
  projectId: string;
  month: string;
  filters: CleanupReviewNoteReportResponse["filters"] & {
    coveragePreset: CleanupReviewCoveragePreset;
  };
  totalNotes: number;
  totalCleanupRuns: number;
  reviewedCleanupRuns: number;
  unreviewedCleanupRuns: number;
  staleThresholdDays: number;
  staleUnreviewedCleanupRuns: number;
  categoryCounts: Array<{ category: GovernanceNoteCategory; count: number }>;
  reviewerCounts: Array<{ reviewerId: string | null; count: number }>;
};

type CleanupReviewCoverageResponse = {
  projectId: string;
  month: string;
  filters: CleanupReviewNoteSummary["filters"];
  coverage: CleanupReviewCoverageItem[];
};

type CleanupReviewCoveragePreset = "all" | "reviewed" | "stale_unreviewed";

type CleanupReviewCoverageItem = {
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

type AdminActionAuditTaskSnapshot = {
  id: string;
  label: string;
  title: string;
  status: string;
  decision: string;
  statusHistory: string;
  updatedAt: string;
};

const evidenceOptions: Array<{ value: AssistantEvidenceKind; label: string }> = [
  { value: "central_knowledge", label: "중앙 WIKI" },
  { value: "project_wiki", label: "프로젝트 WIKI" },
  { value: "regulation", label: "법규/기준" },
  { value: "task", label: "작업 기록" },
  { value: "project_document", label: "프로젝트 문서" },
  { value: "web_or_skill", label: "외부 웹/스킬" },
];

const cleanupReviewCoveragePresetOptions: Array<{ value: CleanupReviewCoveragePreset; label: string }> = [
  { value: "all", label: "전체 정리 실행" },
  { value: "reviewed", label: "검토 완료 정리" },
  { value: "stale_unreviewed", label: "오래된 미검토 정리" },
];

const actionAuditOptions: Array<{ value: AssistantActionAuditAction | "all"; label: string }> = [
  { value: "all", label: "전체 작업" },
  { value: "task_update_applied", label: "작업 기록 업데이트" },
  { value: "follow_up_task_created", label: "후속 작업 생성" },
];

const governanceNoteOptions: Array<{ value: GovernanceNoteCategory; label: string }> = [
  { value: "review_note", label: "검토 메모" },
  { value: "risk", label: "리스크" },
  { value: "follow_up", label: "후속 조치" },
  { value: "approval_context", label: "승인 맥락" },
];

const defaultPolicy: AssistantPolicy = {
  id: "",
  projectId: "",
  enabled: false,
  provider: "mock",
  model: "deterministic-foundation",
  monthlyBudgetCents: 50000,
  maxInputTokens: 12000,
  maxOutputTokens: 2000,
  externalEvidenceAllowed: true,
  allowedEvidenceKinds: evidenceOptions.map((option) => option.value),
  retentionDays: 365,
  updatedAt: "",
};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function AssistantAdminShell() {
  const { currentProjectId, availableProjects, refreshProjects } = useProjectMeta();
  const [policy, setPolicy] = useState<AssistantPolicy>(defaultPolicy);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [actionAudits, setActionAudits] = useState<AdminActionAuditRecord[]>([]);
  const [governanceNoteReport, setGovernanceNoteReport] = useState<GovernanceNoteReportItem[]>([]);
  const [auditRetentionPreview, setAuditRetentionPreview] = useState<AuditRetentionPreview | null>(null);
  const [auditRetentionCleanupResult, setAuditRetentionCleanupResult] = useState<AuditRetentionCleanupResult | null>(null);
  const [auditCleanupHistory, setAuditCleanupHistory] = useState<AuditCleanupHistoryItem[]>([]);
  const [auditCleanupComparison, setAuditCleanupComparison] = useState<AuditCleanupComparison | null>(null);
  const [auditCleanupDetail, setAuditCleanupDetail] = useState<AuditCleanupDetail | null>(null);
  const [cleanupReviewNoteReport, setCleanupReviewNoteReport] = useState<CleanupReviewNoteReportItem[]>([]);
  const [cleanupReviewNoteSummary, setCleanupReviewNoteSummary] = useState<CleanupReviewNoteSummary | null>(null);
  const [cleanupReviewCoverage, setCleanupReviewCoverage] = useState<CleanupReviewCoverageItem[]>([]);
  const [month, setMonth] = useState(currentMonth);
  const [retentionPreviewDays, setRetentionPreviewDays] = useState(365);
  const [retentionCleanupConfirmation, setRetentionCleanupConfirmation] = useState("");
  const [cleanupHistoryActorId, setCleanupHistoryActorId] = useState("");
  const [cleanupHistoryCutoffAt, setCleanupHistoryCutoffAt] = useState("");
  const [cleanupHistoryToken, setCleanupHistoryToken] = useState("");
  const [cleanupComparisonToken, setCleanupComparisonToken] = useState("");
  const [cleanupReviewNoteFilterCategory, setCleanupReviewNoteFilterCategory] = useState<GovernanceNoteCategory | "all">("all");
  const [cleanupReviewNoteReviewer, setCleanupReviewNoteReviewer] = useState("");
  const [cleanupReviewNoteToken, setCleanupReviewNoteToken] = useState("");
  const [cleanupReviewNoteCleanupId, setCleanupReviewNoteCleanupId] = useState("");
  const [cleanupReviewStaleDays, setCleanupReviewStaleDays] = useState(7);
  const [cleanupReviewCoveragePreset, setCleanupReviewCoveragePreset] = useState<CleanupReviewCoveragePreset>("all");
  const [cleanupReviewQueueDensity, setCleanupReviewQueueDensity] = useState<"detailed" | "compact">("detailed");
  const [actionAuditAction, setActionAuditAction] = useState<AssistantActionAuditAction | "all">("all");
  const [actionAuditTask, setActionAuditTask] = useState("");
  const [actionAuditRecordId, setActionAuditRecordId] = useState("");
  const [actionAuditActorId, setActionAuditActorId] = useState("");
  const [governanceNoteFilterCategory, setGovernanceNoteFilterCategory] = useState<GovernanceNoteCategory | "all">("all");
  const [governanceNoteReviewer, setGovernanceNoteReviewer] = useState("");
  const [governanceNoteTask, setGovernanceNoteTask] = useState("");
  const [governanceNoteRecordId, setGovernanceNoteRecordId] = useState("");
  const [selectedActionAuditId, setSelectedActionAuditId] = useState<string | null>(null);
  const [actionAuditDetail, setActionAuditDetail] = useState<AdminActionAuditDetail | null>(null);
  const [selectedGovernanceReportAuditId, setSelectedGovernanceReportAuditId] = useState<string | null>(null);
  const [selectedCleanupId, setSelectedCleanupId] = useState<string | null>(null);
  const [governanceReportDetail, setGovernanceReportDetail] = useState<AdminActionAuditDetail | null>(null);
  const [governanceNoteCategory, setGovernanceNoteCategory] = useState<GovernanceNoteCategory>("review_note");
  const [governanceNoteText, setGovernanceNoteText] = useState("");
  const [cleanupReviewNoteCategory, setCleanupReviewNoteCategory] = useState<GovernanceNoteCategory>("review_note");
  const [cleanupReviewNoteText, setCleanupReviewNoteText] = useState("");
  const [status, setStatus] = useState("AI 어시스턴트 운영 데이터를 불러오는 중입니다.");
  const [loading, setLoading] = useState(true);
  const [actionAuditLoading, setActionAuditLoading] = useState(false);
  const [actionAuditDetailLoading, setActionAuditDetailLoading] = useState(false);
  const [governanceNoteReportLoading, setGovernanceNoteReportLoading] = useState(false);
  const [governanceReportDetailLoading, setGovernanceReportDetailLoading] = useState(false);
  const [auditRetentionLoading, setAuditRetentionLoading] = useState(false);
  const [auditCleanupHistoryLoading, setAuditCleanupHistoryLoading] = useState(false);
  const [auditCleanupComparisonLoading, setAuditCleanupComparisonLoading] = useState(false);
  const [auditCleanupDetailLoading, setAuditCleanupDetailLoading] = useState(false);
  const [cleanupReviewNoteReportLoading, setCleanupReviewNoteReportLoading] = useState(false);
  const [cleanupReviewNoteSummaryLoading, setCleanupReviewNoteSummaryLoading] = useState(false);
  const [cleanupReviewCoverageLoading, setCleanupReviewCoverageLoading] = useState(false);
  const [auditRetentionCleaning, setAuditRetentionCleaning] = useState(false);
  const [governanceNoteSaving, setGovernanceNoteSaving] = useState(false);
  const [cleanupReviewNoteSaving, setCleanupReviewNoteSaving] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedProject = availableProjects.find((project) => project.id === currentProjectId) ?? null;
  const budgetRatio = useMemo(() => {
    if (!usage || policy.monthlyBudgetCents <= 0) {
      return 0;
    }

    return Math.min(999, Math.round((usage.estimatedCostCents / policy.monthlyBudgetCents) * 100));
  }, [policy.monthlyBudgetCents, usage]);
  const actionAuditQuery = useMemo(() => {
    const params = new URLSearchParams({
      month,
      limit: "250",
    });
    if (actionAuditAction !== "all") {
      params.set("action", actionAuditAction);
    }
    if (actionAuditTask.trim()) {
      params.set("task", actionAuditTask.trim());
    }
    if (actionAuditRecordId.trim()) {
      params.set("assistantRecordId", actionAuditRecordId.trim());
    }
    if (actionAuditActorId.trim()) {
      params.set("actorId", actionAuditActorId.trim());
    }
    return params.toString();
  }, [actionAuditAction, actionAuditActorId, actionAuditRecordId, actionAuditTask, month]);
  const actionAuditExportUrl = `/api/admin/assistant/action-audits/export?${actionAuditQuery}`;
  const governanceNoteReportQuery = useMemo(() => {
    const params = new URLSearchParams({
      month,
      limit: "250",
    });
    if (governanceNoteFilterCategory !== "all") {
      params.set("category", governanceNoteFilterCategory);
    }
    if (governanceNoteReviewer.trim()) {
      params.set("reviewerId", governanceNoteReviewer.trim());
    }
    if (governanceNoteTask.trim()) {
      params.set("task", governanceNoteTask.trim());
    }
    if (governanceNoteRecordId.trim()) {
      params.set("assistantRecordId", governanceNoteRecordId.trim());
    }
    return params.toString();
  }, [governanceNoteFilterCategory, governanceNoteRecordId, governanceNoteReviewer, governanceNoteTask, month]);
  const governanceNoteExportUrl = `/api/admin/assistant/governance-notes/export?${governanceNoteReportQuery}`;
  const auditRetentionQuery = useMemo(() => {
    const params = new URLSearchParams({
      retentionDays: String(retentionPreviewDays),
      limit: "500",
    });
    return params.toString();
  }, [retentionPreviewDays]);
  const auditRetentionExportUrl = `/api/admin/assistant/audit-retention/export?${auditRetentionQuery}`;
  const auditCleanupHistoryQuery = useMemo(() => {
    const params = new URLSearchParams({
      month,
      limit: "500",
    });
    if (cleanupHistoryActorId.trim()) {
      params.set("actorId", cleanupHistoryActorId.trim());
    }
    if (cleanupHistoryCutoffAt.trim()) {
      params.set("cutoffAt", cleanupHistoryCutoffAt.trim());
    }
    if (cleanupHistoryToken.trim()) {
      params.set("archivePreviewToken", cleanupHistoryToken.trim());
    }
    return params.toString();
  }, [cleanupHistoryActorId, cleanupHistoryCutoffAt, cleanupHistoryToken, month]);
  const auditCleanupHistoryExportUrl = `/api/admin/assistant/audit-cleanups/export?${auditCleanupHistoryQuery}`;
  const cleanupReviewNoteReportQuery = useMemo(() => {
    const params = new URLSearchParams({
      month,
      limit: "250",
      staleDays: String(cleanupReviewStaleDays),
      coveragePreset: cleanupReviewCoveragePreset,
    });
    if (cleanupReviewNoteFilterCategory !== "all") {
      params.set("category", cleanupReviewNoteFilterCategory);
    }
    if (cleanupReviewNoteReviewer.trim()) {
      params.set("reviewerId", cleanupReviewNoteReviewer.trim());
    }
    if (cleanupReviewNoteToken.trim()) {
      params.set("archivePreviewToken", cleanupReviewNoteToken.trim());
    }
    if (cleanupReviewNoteCleanupId.trim()) {
      params.set("cleanupId", cleanupReviewNoteCleanupId.trim());
    }
    return params.toString();
  }, [
    cleanupReviewCoveragePreset,
    cleanupReviewNoteCleanupId,
    cleanupReviewNoteFilterCategory,
    cleanupReviewNoteReviewer,
    cleanupReviewNoteToken,
    cleanupReviewStaleDays,
    month,
  ]);
  const cleanupReviewNoteExportUrl = `/api/admin/assistant/cleanup-review-notes/export?${cleanupReviewNoteReportQuery}`;
  const cleanupReviewCoverageExportUrl = `/api/admin/assistant/cleanup-review-notes/coverage/export?${cleanupReviewNoteReportQuery}`;
  const cleanupReviewCoverageJsonUrl = `/api/admin/assistant/cleanup-review-notes/coverage/json?${cleanupReviewNoteReportQuery}`;
  const cleanupReviewCoveragePackageUrl = `/api/admin/assistant/cleanup-review-notes/coverage/package?${cleanupReviewNoteReportQuery}`;
  const cleanupReviewCoverageHandoffText = `정리 검토 범위 필터: ${cleanupReviewNoteReportQuery}`;
  const cleanupReviewActiveFilters = [
    cleanupReviewNoteFilterCategory !== "all" ? `분류 ${governanceNoteLabel(cleanupReviewNoteFilterCategory)}` : null,
    cleanupReviewCoveragePreset !== "all"
      ? `프리셋 ${cleanupReviewCoveragePresetOptions.find((option) => option.value === cleanupReviewCoveragePreset)?.label ?? cleanupReviewCoveragePreset}`
      : null,
    cleanupReviewNoteReviewer.trim() ? `검토자 ${cleanupReviewNoteReviewer.trim()}` : null,
    cleanupReviewNoteToken.trim() ? `토큰 ${cleanupReviewNoteToken.trim()}` : null,
    cleanupReviewNoteCleanupId.trim() ? `정리 ID ${cleanupReviewNoteCleanupId.trim()}` : null,
    cleanupReviewStaleDays !== 7 ? `오래된 기준 ${cleanupReviewStaleDays}일` : null,
  ].filter((item): item is string => Boolean(item));
  const cleanupReviewCoverageGroups = useMemo(
    () => {
      const groups = [
        {
          key: "stale-unreviewed",
          title: "오래된 미검토 큐",
          description: "현재 기준일보다 오래되었지만 검토 메모가 없는 정리 실행입니다.",
          rows: cleanupReviewCoverage.filter((item) => item.coverageStatus === "unreviewed" && item.isStale),
        },
        {
          key: "other-unreviewed",
          title: "그 밖의 미검토 큐",
          description: "아직 오래된 항목은 아니지만 검토 메모가 필요한 정리 실행입니다.",
          rows: cleanupReviewCoverage.filter((item) => item.coverageStatus === "unreviewed" && !item.isStale),
        },
        {
          key: "reviewed",
          title: "검토 완료 큐",
          description: "정리 검토 근거가 이미 남아 있는 실행입니다.",
          rows: cleanupReviewCoverage.filter((item) => item.coverageStatus === "reviewed"),
        },
      ];

      return groups.map((group) => ({
        ...group,
        stats: group.rows.reduce(
          (current, item) => ({
            notes: current.notes + item.noteCount,
            deleted: current.deleted + item.deletedCount,
            skipped: current.skipped + item.skippedCount,
          }),
          { notes: 0, deleted: 0, skipped: 0 },
        ),
      }));
    },
    [cleanupReviewCoverage],
  );
  const auditCleanupComparisonQuery = useMemo(() => {
    const params = new URLSearchParams({
      month,
      retentionDays: String(retentionPreviewDays),
      limit: "500",
    });
    if (cleanupComparisonToken.trim()) {
      params.set("archivePreviewToken", cleanupComparisonToken.trim());
    }
    return params.toString();
  }, [cleanupComparisonToken, month, retentionPreviewDays]);
  const auditCleanupComparisonExportUrl = `/api/admin/assistant/audit-cleanups/compare/export?${auditCleanupComparisonQuery}`;

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      readJson<AssistantPolicy>("/api/admin/assistant/policy"),
      readJson<UsageSummary>(`/api/admin/assistant/usage?month=${encodeURIComponent(month)}`),
      readJson<AuditResponse>(`/api/admin/assistant/audit?month=${encodeURIComponent(month)}&limit=100`),
    ])
      .then(([policyData, usageData, auditData]) => {
        if (!active) {
          return;
        }

        setPolicy(policyData);
        setRetentionPreviewDays(policyData.retentionDays);
        setUsage(usageData);
        setAudit(auditData.events);
        setStatus("AI 어시스턴트 운영 데이터를 불러왔습니다.");
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : "AI 어시스턴트 운영 데이터를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [month]);

  useEffect(() => {
    let active = true;
    setActionAuditLoading(true);

    readJson<ActionAuditResponse>(`/api/admin/assistant/action-audits?${actionAuditQuery}`)
      .then((data) => {
        if (active) {
          setActionAudits(data.events);
        }
      })
      .catch(() => {
        if (active) {
          setActionAudits([]);
        }
      })
      .finally(() => {
        if (active) {
          setActionAuditLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [actionAuditQuery]);

  useEffect(() => {
    setSelectedActionAuditId(null);
    setActionAuditDetail(null);
    setGovernanceNoteText("");
  }, [actionAuditQuery]);

  useEffect(() => {
    let active = true;
    setGovernanceNoteReportLoading(true);

    readJson<GovernanceNoteReportResponse>(`/api/admin/assistant/governance-notes?${governanceNoteReportQuery}`)
      .then((data) => {
        if (active) {
          setGovernanceNoteReport(data.notes);
        }
      })
      .catch(() => {
        if (active) {
          setGovernanceNoteReport([]);
        }
      })
      .finally(() => {
        if (active) {
          setGovernanceNoteReportLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [governanceNoteReportQuery]);

  useEffect(() => {
    setSelectedGovernanceReportAuditId(null);
    setGovernanceReportDetail(null);
  }, [governanceNoteReportQuery]);

  useEffect(() => {
    let active = true;
    setCleanupReviewNoteReportLoading(true);
    setCleanupReviewNoteSummaryLoading(true);
    setCleanupReviewCoverageLoading(true);

    Promise.all([
      readJson<CleanupReviewNoteReportResponse>(`/api/admin/assistant/cleanup-review-notes?${cleanupReviewNoteReportQuery}`),
      readJson<CleanupReviewNoteSummary>(`/api/admin/assistant/cleanup-review-notes/summary?${cleanupReviewNoteReportQuery}`),
      readJson<CleanupReviewCoverageResponse>(`/api/admin/assistant/cleanup-review-notes/coverage?${cleanupReviewNoteReportQuery}`),
    ])
      .then(([reportData, summaryData, coverageData]) => {
        if (active) {
          setCleanupReviewNoteReport(reportData.notes);
          setCleanupReviewNoteSummary(summaryData);
          setCleanupReviewCoverage(coverageData.coverage);
        }
      })
      .catch(() => {
        if (active) {
          setCleanupReviewNoteReport([]);
          setCleanupReviewNoteSummary(null);
          setCleanupReviewCoverage([]);
        }
      })
      .finally(() => {
        if (active) {
          setCleanupReviewNoteReportLoading(false);
          setCleanupReviewNoteSummaryLoading(false);
          setCleanupReviewCoverageLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [cleanupReviewNoteReportQuery]);

  useEffect(() => {
    let active = true;
    setAuditRetentionLoading(true);

    readJson<AuditRetentionPreview>(`/api/admin/assistant/audit-retention?${auditRetentionQuery}`)
      .then((data) => {
        if (active) {
          setAuditRetentionPreview(data);
          setAuditRetentionCleanupResult(null);
        }
      })
      .catch(() => {
        if (active) {
          setAuditRetentionPreview(null);
        }
      })
      .finally(() => {
        if (active) {
          setAuditRetentionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auditRetentionQuery]);

  useEffect(() => {
    let active = true;
    setAuditCleanupHistoryLoading(true);

    readJson<AuditCleanupHistoryResponse>(`/api/admin/assistant/audit-cleanups?${auditCleanupHistoryQuery}`)
      .then((data) => {
        if (active) {
          setAuditCleanupHistory(data.cleanups);
        }
      })
      .catch(() => {
        if (active) {
          setAuditCleanupHistory([]);
        }
      })
      .finally(() => {
        if (active) {
          setAuditCleanupHistoryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [auditCleanupHistoryQuery]);

  async function savePolicy() {
    setSaving(true);
    try {
      const saved = await writeJson<AssistantPolicy>("/api/admin/assistant/policy", {
        enabled: policy.enabled,
        provider: policy.provider,
        model: policy.model,
        monthlyBudgetCents: policy.monthlyBudgetCents,
        maxInputTokens: policy.maxInputTokens,
        maxOutputTokens: policy.maxOutputTokens,
        externalEvidenceAllowed: policy.externalEvidenceAllowed,
        allowedEvidenceKinds: policy.allowedEvidenceKinds,
        retentionDays: policy.retentionDays,
      });
      setPolicy(saved);
      const [usageData, auditData] = await Promise.all([
        readJson<UsageSummary>(`/api/admin/assistant/usage?month=${encodeURIComponent(month)}`),
        readJson<AuditResponse>(`/api/admin/assistant/audit?month=${encodeURIComponent(month)}&limit=100`),
      ]);
      setUsage(usageData);
      setAudit(auditData.events);
      setStatus("AI 어시스턴트 실행 정책을 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "정책 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function setAllowedEvidenceKind(kind: AssistantEvidenceKind, checked: boolean) {
    setPolicy((current) => {
      const nextKinds = checked
        ? [...new Set([...current.allowedEvidenceKinds, kind])]
        : current.allowedEvidenceKinds.filter((item) => item !== kind);

      return {
        ...current,
        allowedEvidenceKinds: nextKinds.length ? nextKinds : current.allowedEvidenceKinds,
      };
    });
  }

  async function openActionAuditDetail(auditId: string) {
    if (selectedActionAuditId === auditId) {
      setSelectedActionAuditId(null);
      setActionAuditDetail(null);
      setGovernanceNoteText("");
      return;
    }

    setSelectedActionAuditId(auditId);
    setActionAuditDetail(null);
    setGovernanceNoteCategory("review_note");
    setGovernanceNoteText("");
    setActionAuditDetailLoading(true);
    try {
      const detail = await readJson<AdminActionAuditDetail>(
        `/api/admin/assistant/action-audits/${encodeURIComponent(auditId)}?month=${encodeURIComponent(month)}`,
      );
      setActionAuditDetail(detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 어시스턴트 작업 감사 상세를 불러오지 못했습니다.");
    } finally {
      setActionAuditDetailLoading(false);
    }
  }

  async function saveGovernanceNote() {
    if (!selectedActionAuditId || !governanceNoteText.trim()) {
      setStatus("거버넌스 메모 내용을 입력하세요.");
      return;
    }

    setGovernanceNoteSaving(true);
    try {
      const note = await writeJson<GovernanceNote>(
        `/api/admin/assistant/action-audits/${encodeURIComponent(selectedActionAuditId)}/notes?month=${encodeURIComponent(month)}`,
        {
          category: governanceNoteCategory,
          note: governanceNoteText.trim(),
        },
        "POST",
      );
      setActionAuditDetail((current) =>
        current
          ? {
              ...current,
              governanceNotes: [note, ...current.governanceNotes],
            }
          : current,
      );
      setGovernanceNoteText("");
      setStatus("거버넌스 메모를 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "거버넌스 메모 저장에 실패했습니다.");
    } finally {
      setGovernanceNoteSaving(false);
    }
  }

  async function openGovernanceReportDetail(auditId: string) {
    if (selectedGovernanceReportAuditId === auditId) {
      setSelectedGovernanceReportAuditId(null);
      setGovernanceReportDetail(null);
      return;
    }

    setSelectedGovernanceReportAuditId(auditId);
    setGovernanceReportDetail(null);
    setGovernanceReportDetailLoading(true);
    try {
      const detail = await readJson<AdminActionAuditDetail>(
        `/api/admin/assistant/action-audits/${encodeURIComponent(auditId)}?month=${encodeURIComponent(month)}`,
      );
      setGovernanceReportDetail(detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 어시스턴트 작업 감사 상세를 불러오지 못했습니다.");
    } finally {
      setGovernanceReportDetailLoading(false);
    }
  }

  async function runAuditRetentionCleanup() {
    if (!auditRetentionPreview) {
      setStatus("정리 실행 전에 감사 보존 미리보기가 필요합니다.");
      return;
    }
    if (retentionCleanupConfirmation !== "DELETE_ASSISTANT_AUDIT_EVENTS") {
      setStatus("정리를 확정하려면 DELETE_ASSISTANT_AUDIT_EVENTS를 입력하세요.");
      return;
    }

    setAuditRetentionCleaning(true);
    try {
      const result = await writeJson<AuditRetentionCleanupResult>(
        "/api/admin/assistant/audit-retention",
        {
          retentionDays: String(retentionPreviewDays),
          cutoffAt: auditRetentionPreview.cutoffAt,
          limit: "500",
          archivePreviewToken: auditRetentionPreview.archivePreviewToken,
          confirmation: retentionCleanupConfirmation,
        },
        "POST",
      );
      const [retentionData, auditData] = await Promise.all([
        readJson<AuditRetentionPreview>(`/api/admin/assistant/audit-retention?${auditRetentionQuery}`),
        readJson<AuditResponse>(`/api/admin/assistant/audit?month=${encodeURIComponent(month)}&limit=100`),
      ]);
      const cleanupHistoryData = await readJson<AuditCleanupHistoryResponse>(`/api/admin/assistant/audit-cleanups?${auditCleanupHistoryQuery}`);
      setAuditRetentionCleanupResult(result);
      setAuditRetentionPreview(retentionData);
      setAudit(auditData.events);
      setAuditCleanupHistory(cleanupHistoryData.cleanups);
      setRetentionCleanupConfirmation("");
      setStatus(`AI 어시스턴트 감사 정리 완료: ${result.deletedCount}개 삭제, ${result.skippedCount}개 건너뜀.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 어시스턴트 감사 정리에 실패했습니다.");
    } finally {
      setAuditRetentionCleaning(false);
    }
  }

  async function runAuditCleanupComparison() {
    if (!cleanupComparisonToken.trim()) {
      setStatus("비교할 정리 미리보기 토큰을 입력하세요.");
      return;
    }

    setAuditCleanupComparisonLoading(true);
    try {
      const comparison = await readJson<AuditCleanupComparison>(
        `/api/admin/assistant/audit-cleanups/compare?${auditCleanupComparisonQuery}`,
      );
      setAuditCleanupComparison(comparison);
      setStatus("AI 어시스턴트 감사 정리 비교 결과를 불러왔습니다.");
    } catch (error) {
      setAuditCleanupComparison(null);
      setStatus(error instanceof Error ? error.message : "AI 어시스턴트 감사 정리 비교에 실패했습니다.");
    } finally {
      setAuditCleanupComparisonLoading(false);
    }
  }

  async function openAuditCleanupDetail(cleanupId: string) {
    if (selectedCleanupId === cleanupId) {
      setSelectedCleanupId(null);
      setAuditCleanupDetail(null);
      setCleanupReviewNoteText("");
      return;
    }

    setSelectedCleanupId(cleanupId);
    setAuditCleanupDetail(null);
    setCleanupReviewNoteCategory("review_note");
    setCleanupReviewNoteText("");
    setAuditCleanupDetailLoading(true);
    try {
      const detail = await readJson<AuditCleanupDetail>(
        `/api/admin/assistant/audit-cleanups/${encodeURIComponent(cleanupId)}?month=${encodeURIComponent(month)}`,
      );
      setAuditCleanupDetail(detail);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 어시스턴트 감사 정리 상세를 불러오지 못했습니다.");
    } finally {
      setAuditCleanupDetailLoading(false);
    }
  }

  async function saveCleanupReviewNote() {
    if (!selectedCleanupId) {
      setStatus("검토 메모를 추가할 정리를 먼저 선택하세요.");
      return;
    }
    if (!cleanupReviewNoteText.trim()) {
      setStatus("정리 검토 메모 내용을 입력하세요.");
      return;
    }

    setCleanupReviewNoteSaving(true);
    try {
      const note = await writeJson<AuditCleanupReviewNote>(
        `/api/admin/assistant/audit-cleanups/${encodeURIComponent(selectedCleanupId)}/notes?month=${encodeURIComponent(month)}`,
        {
          category: cleanupReviewNoteCategory,
          note: cleanupReviewNoteText.trim(),
        },
        "POST",
      );
      setAuditCleanupDetail((current) =>
        current && current.cleanup.id === selectedCleanupId
          ? {
              ...current,
              reviewNotes: [note, ...current.reviewNotes],
            }
          : current,
      );
      setCleanupReviewNoteText("");
      setStatus("정리 검토 메모를 저장했습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "정리 검토 메모 저장에 실패했습니다.");
    } finally {
      setCleanupReviewNoteSaving(false);
    }
  }

  async function copyCleanupReviewCoverageHandoff() {
    try {
      await navigator.clipboard.writeText(cleanupReviewCoverageHandoffText);
      setStatus("정리 검토 범위 필터 인수인계를 복사했습니다.");
    } catch {
      setStatus(cleanupReviewCoverageHandoffText);
    }
  }

  function resetCleanupReviewFilters() {
    setCleanupReviewNoteFilterCategory("all");
    setCleanupReviewCoveragePreset("all");
    setCleanupReviewNoteReviewer("");
    setCleanupReviewNoteToken("");
    setCleanupReviewNoteCleanupId("");
    setCleanupReviewStaleDays(7);
  }

  function showStaleUnreviewedCleanupCoverage() {
    setCleanupReviewCoveragePreset("stale_unreviewed");
    setCleanupReviewStaleDays(0);
  }

  function showReviewedCleanupCoverage() {
    setCleanupReviewCoveragePreset("reviewed");
  }

  function showAllCleanupCoverage() {
    setCleanupReviewCoveragePreset("all");
    setCleanupReviewStaleDays(7);
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>AI 어시스턴트 운영</p>
          <h1>AI 실행 정책</h1>
          <span>
            기본 실행은 로컬 Codex 로그인입니다. 이 화면에서는 {selectedProject?.name ?? "현재 프로젝트"} 기준 SaaS API 정책과
            사용량을 관리합니다.
          </span>
        </div>
        <nav className={styles.headerActions} aria-label="관리 이동">
          <a href="/daily">일일 목록</a>
          <a href="/admin">관리 설정</a>
        </nav>
      </header>

      <p className={styles.status} role="status" aria-live="polite">
        {loading ? "로딩 중..." : status}
      </p>

      <div className={styles.layout}>
        <section className={styles.policyPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>SaaS API 정책</h2>
              <p>로컬 Codex 로그인 대신 서버에서 공급자(provider)를 호출할 때 적용되는 프로젝트 범위 정책입니다.</p>
            </div>
            <span className={policy.enabled ? styles.badgeOn : styles.badgeOff}>{policy.enabled ? "사용 중" : "꺼짐"}</span>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.toggleField}>
              <span>SaaS API 모드 사용</span>
              <input
                checked={policy.enabled}
                onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
            </label>
            <label className={styles.field}>
              <span>공급자</span>
              <select
                value={policy.provider}
                onChange={(event) =>
                  setPolicy((current) => ({
                    ...current,
                    provider: event.target.value as AssistantPolicy["provider"],
                    model: event.target.value === "openai" && current.model === "deterministic-foundation" ? "gpt-4.1-mini" : current.model,
                  }))
                }
              >
                <option value="mock">Mock</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>모델</span>
              <input value={policy.model} onChange={(event) => setPolicy((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <label className={styles.field}>
              <span>월 예산(센트)</span>
              <input
                inputMode="numeric"
                value={policy.monthlyBudgetCents}
                onChange={(event) =>
                  setPolicy((current) => ({ ...current, monthlyBudgetCents: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>입력 토큰 제한</span>
              <input
                inputMode="numeric"
                value={policy.maxInputTokens}
                onChange={(event) => setPolicy((current) => ({ ...current, maxInputTokens: Number(event.target.value || 0) }))}
              />
            </label>
            <label className={styles.field}>
              <span>출력 토큰 제한</span>
              <input
                inputMode="numeric"
                value={policy.maxOutputTokens}
                onChange={(event) => setPolicy((current) => ({ ...current, maxOutputTokens: Number(event.target.value || 0) }))}
              />
            </label>
            <label className={styles.field}>
              <span>보존 일수</span>
              <input
                inputMode="numeric"
                value={policy.retentionDays}
                onChange={(event) => setPolicy((current) => ({ ...current, retentionDays: Number(event.target.value || 0) }))}
              />
            </label>
          </div>

          <div className={styles.evidenceBlock}>
            <label className={styles.toggleField}>
              <span>외부 웹/스킬 근거 허용</span>
              <input
                checked={policy.externalEvidenceAllowed}
                onChange={(event) => setPolicy((current) => ({ ...current, externalEvidenceAllowed: event.target.checked }))}
                type="checkbox"
              />
            </label>
            <div className={styles.checkGrid}>
              {evidenceOptions.map((option) => (
                <label className={styles.checkItem} key={option.value}>
                  <input
                    checked={policy.allowedEvidenceKinds.includes(option.value)}
                    onChange={(event) => setAllowedEvidenceKind(option.value, event.target.checked)}
                    type="checkbox"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button disabled={saving} onClick={() => void savePolicy()} type="button">
              {saving ? "저장하고 있습니다..." : "정책 저장"}
            </button>
          </div>
        </section>

        <section className={styles.reportPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>월별 리포트</h2>
              <p>성공, 차단, 실패 요청과 토큰/비용 추정치를 확인합니다.</p>
            </div>
            <label className={styles.monthPicker}>
              <span>월</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} />
            </label>
          </div>

          <section className={styles.reportSection} aria-labelledby="assistant-report-summary-title">
            <h3 id="assistant-report-summary-title">요약 지표</h3>
            <div className={styles.metricGrid}>
              <Metric label="요청" value={usage?.requestCount ?? 0} />
              <Metric label="성공" value={usage?.successCount ?? 0} />
              <Metric label="차단" value={usage?.blockedCount ?? 0} />
              <Metric label="실패" value={usage?.failedCount ?? 0} />
              <Metric label="입력 토큰" value={usage?.inputTokens ?? 0} />
              <Metric label="출력 토큰" value={usage?.outputTokens ?? 0} />
              <Metric label="예상 비용" value={`${usage?.estimatedCostCents ?? 0}c`} />
              <Metric label="예산 사용" value={`${budgetRatio}%`} />
            </div>
          </section>

          <div className={styles.tableBlock}>
            <h3>최근 사용 이벤트</h3>
            <div className={styles.tableScroller}>
              <table>
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>상태</th>
                    <th>공급자</th>
                    <th>토큰</th>
                    <th>정책 판단</th>
                    <th>오류</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage?.events ?? []).slice(0, 20).map((event) => (
                    <tr key={event.id}>
                      <td>{formatDate(event.createdAt)}</td>
                      <td>{event.status}</td>
                      <td>{event.provider} / {event.model}</td>
                      <td>{event.inputTokens} / {event.outputTokens}</td>
                      <td>{event.policyDecision}</td>
                      <td>{event.errorCode ?? "-"}</td>
                    </tr>
                  ))}
                  {usage?.events.length === 0 ? (
                    <tr>
                      <td colSpan={6}>선택한 월의 사용 이벤트가 없습니다.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>AI 어시스턴트 작업 감사</h3>
                <p>승인된 AI 어시스턴트 작업 변경을 작업 기록, 어시스턴트 기록, 실행자, 일일 목록 링크와 함께 확인합니다.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{actionAuditLoading ? "불러오는 중" : `${actionAudits.length}개 기록`}</span>
                <a download href={actionAuditExportUrl}>
                  CSV 내보내기
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>작업</span>
                <select
                  value={actionAuditAction}
                  onChange={(event) => setActionAuditAction(event.target.value as AssistantActionAuditAction | "all")}
                >
                  {actionAuditOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>작업 ID 또는 제목</span>
                <input
                  placeholder="001, 작업 ID 또는 제목"
                  value={actionAuditTask}
                  onChange={(event) => setActionAuditTask(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>어시스턴트 기록</span>
                <input
                  placeholder="어시스턴트 기록 ID"
                  value={actionAuditRecordId}
                  onChange={(event) => setActionAuditRecordId(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>실행자</span>
                <input
                  placeholder="프로필 ID"
                  value={actionAuditActorId}
                  onChange={(event) => setActionAuditActorId(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.actionAuditList}>
              {actionAudits.map((event) => (
                <article className={styles.actionAuditCard} key={event.id}>
                  <header>
                    <div>
                      <strong>{actionAuditLabel(event.action)}</strong>
                      <span>{formatDate(event.createdAt)} / 실행자 {event.createdBy ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openActionAuditDetail(event.id)} type="button">
                        {selectedActionAuditId === event.id ? "상세 닫기" : "상세 검토"}
                      </button>
                      <a href={event.dailyTaskUrl}>작업 열기</a>
                    </div>
                  </header>
                  <p>{formatActionAuditSummary(event)}</p>
                  <dl>
                    <div>
                      <dt>원본 작업</dt>
                      <dd>{formatTaskReference(event.sourceTaskLabel, event.sourceTaskId, event.sourceTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>대상 작업</dt>
                      <dd>{formatTaskReference(event.targetTaskLabel, event.targetTaskId, event.targetTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>생성 작업</dt>
                      <dd>
                        {event.createdTaskId
                          ? formatTaskReference(event.createdTaskLabel, event.createdTaskId, event.createdTaskTitle)
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>어시스턴트 기록</dt>
                      <dd>{event.assistantRecordId}</dd>
                    </div>
                  </dl>
                  {selectedActionAuditId === event.id ? (
                    <ActionAuditGovernanceDetail
                      detail={actionAuditDetail}
                      loading={actionAuditDetailLoading}
                      month={month}
                      noteCategory={governanceNoteCategory}
                      noteSaving={governanceNoteSaving}
                      noteText={governanceNoteText}
                      onNoteCategoryChange={setGovernanceNoteCategory}
                      onNoteTextChange={setGovernanceNoteText}
                      onSaveNote={() => void saveGovernanceNote()}
                    />
                  ) : null}
                </article>
              ))}
              {actionAudits.length === 0 ? (
                <p className={styles.empty}>
                  {actionAuditLoading ? "AI 어시스턴트 작업 감사를 불러오는 중입니다." : "현재 필터와 일치하는 AI 어시스턴트 작업 감사가 없습니다."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>거버넌스 메모 리포트</h3>
                <p>AI 어시스턴트 작업 감사에 남긴 추가 전용 검토 메모를 운영 검토용으로 필터링합니다.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{governanceNoteReportLoading ? "불러오는 중" : `${governanceNoteReport.length}개 메모`}</span>
                <a download href={governanceNoteExportUrl}>
                  메모 CSV 내보내기
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>분류</span>
                <select
                  value={governanceNoteFilterCategory}
                  onChange={(event) => setGovernanceNoteFilterCategory(event.target.value as GovernanceNoteCategory | "all")}
                >
                  <option value="all">전체 분류</option>
                  {governanceNoteOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>검토자</span>
                <input
                  placeholder="검토자 ID"
                  value={governanceNoteReviewer}
                  onChange={(event) => setGovernanceNoteReviewer(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>작업 ID 또는 제목</span>
                <input
                  placeholder="001, 작업 ID 또는 제목"
                  value={governanceNoteTask}
                  onChange={(event) => setGovernanceNoteTask(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>어시스턴트 기록</span>
                <input
                  placeholder="어시스턴트 기록 ID"
                  value={governanceNoteRecordId}
                  onChange={(event) => setGovernanceNoteRecordId(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.actionAuditList}>
              {governanceNoteReport.map((note) => (
                <article className={styles.actionAuditCard} key={note.id}>
                  <header>
                    <div>
                      <strong>{governanceNoteLabel(note.category)}</strong>
                      <span>{formatDate(note.createdAt)} / 검토자 {note.reviewerId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openGovernanceReportDetail(note.sourceAuditId)} type="button">
                        {selectedGovernanceReportAuditId === note.sourceAuditId ? "감사 닫기" : "감사 검토"}
                      </button>
                      <a href={note.dailyTaskUrl}>일일 상세 열기</a>
                    </div>
                  </header>
                  <p>{note.note}</p>
                  <dl>
                    <div>
                      <dt>원본 감사</dt>
                      <dd>{note.sourceAction} / {note.sourceAuditId}</dd>
                    </div>
                    <div>
                      <dt>어시스턴트 기록</dt>
                      <dd>{note.sourceAssistantRecordId}</dd>
                    </div>
                    <div>
                      <dt>원본 작업</dt>
                      <dd>{formatTaskReference(note.sourceTaskLabel, note.sourceTaskId, note.sourceTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>대상 작업</dt>
                      <dd>{formatTaskReference(note.targetTaskLabel, note.targetTaskId, note.targetTaskTitle)}</dd>
                    </div>
                  </dl>
                  {selectedGovernanceReportAuditId === note.sourceAuditId ? (
                    <ActionAuditGovernanceDetail
                      detail={governanceReportDetail}
                      loading={governanceReportDetailLoading}
                      month={month}
                      noteCategory={governanceNoteCategory}
                      noteSaving={false}
                      noteText=""
                      onNoteCategoryChange={setGovernanceNoteCategory}
                      onNoteTextChange={() => undefined}
                      onSaveNote={() => undefined}
                      showNoteForm={false}
                    />
                  ) : null}
                </article>
              ))}
              {governanceNoteReport.length === 0 ? (
                <p className={styles.empty}>
                  {governanceNoteReportLoading ? "거버넌스 메모를 불러오는 중입니다." : "현재 필터와 일치하는 거버넌스 메모가 없습니다."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>감사 보존 미리보기</h3>
                <p>정리 허용 전에 AI 어시스턴트 작업 감사와 거버넌스 메모의 보관 대상을 읽기 전용으로 확인합니다.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{auditRetentionLoading ? "불러오는 중" : `${auditRetentionPreview?.eligibleCount ?? 0}개 대상`}</span>
                <a download href={auditRetentionExportUrl}>
                  보관 미리보기 내보내기
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>미리보기 보존 일수</span>
                <input
                  inputMode="numeric"
                  min={0}
                  max={3650}
                  type="number"
                  value={retentionPreviewDays}
                  onChange={(event) => setRetentionPreviewDays(Math.max(0, Math.min(3650, Number(event.target.value || 0))))}
                />
              </label>
              <DetailBlock title="정책 보존 기간">
                <p>{auditRetentionPreview?.policyRetentionDays ?? policy.retentionDays}일</p>
              </DetailBlock>
              <DetailBlock title="기준 시각">
                <p>{auditRetentionPreview ? formatDate(auditRetentionPreview.cutoffAt) : "-"}</p>
              </DetailBlock>
              <DetailBlock title="관련 이벤트">
                <p>{auditRetentionPreview?.totalRelevantEvents ?? 0}개 전체 / {auditRetentionPreview?.protectedCount ?? 0}개 보호</p>
              </DetailBlock>
              <DetailBlock title="미리보기 토큰">
                <p>{auditRetentionPreview?.archivePreviewToken ?? "-"}</p>
              </DetailBlock>
            </div>

            <div className={styles.cleanupPanel}>
              <div>
                <h4>보호된 정리 실행</h4>
                <p>대상 AI 어시스턴트 감사 기록을 삭제하려면 이 미리보기 토큰과 정확한 확인 문구가 필요합니다.</p>
              </div>
              <label className={styles.field}>
                <span>확인 문구</span>
                <input
                  value={retentionCleanupConfirmation}
                  placeholder="DELETE_ASSISTANT_AUDIT_EVENTS"
                  onChange={(event) => setRetentionCleanupConfirmation(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={
                  auditRetentionCleaning ||
                  !auditRetentionPreview ||
                  auditRetentionPreview.eligibleCount === 0 ||
                  retentionCleanupConfirmation !== "DELETE_ASSISTANT_AUDIT_EVENTS"
                }
                onClick={() => void runAuditRetentionCleanup()}
              >
                {auditRetentionCleaning ? "정리 중" : "정리 실행"}
              </button>
              {auditRetentionCleanupResult ? (
                <p>
                  정리 감사 {auditRetentionCleanupResult.cleanupAuditId}: {auditRetentionCleanupResult.deletedCount}개 삭제 /{" "}
                  {auditRetentionCleanupResult.skippedCount}개 건너뜀.
                </p>
              ) : null}
            </div>

            <div className={styles.tableScroller}>
              <table>
                <thead>
                  <tr>
                    <th>월</th>
                    <th>전체</th>
                    <th>대상</th>
                    <th>작업 감사</th>
                      <th>거버넌스 메모</th>
                  </tr>
                </thead>
                <tbody>
                  {(auditRetentionPreview?.countsByMonth ?? []).map((count) => (
                    <tr key={count.month}>
                      <td>{count.month}</td>
                      <td>{count.total}</td>
                      <td>{count.eligible}</td>
                      <td>{count.actionAuditCount}</td>
                      <td>{count.governanceNoteCount}</td>
                    </tr>
                  ))}
                  {auditRetentionPreview?.countsByMonth.length === 0 ? (
                    <tr>
                      <td colSpan={5}>AI 어시스턴트 감사 보존 기록이 없습니다.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>정리 실행 이력</h3>
                <p>실행된 AI 어시스턴트 감사 정리를 미리보기 토큰, 기준 시각, 삭제/건너뜀 ID와 함께 확인합니다.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{auditCleanupHistoryLoading ? "불러오는 중" : `${auditCleanupHistory.length}회 실행`}</span>
                <a download href={auditCleanupHistoryExportUrl}>
                  정리 CSV 내보내기
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>실행자</span>
                <input
                  placeholder="실행자 ID"
                  value={cleanupHistoryActorId}
                  onChange={(event) => setCleanupHistoryActorId(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>기준일</span>
                <input
                  placeholder="2025-05-12"
                  value={cleanupHistoryCutoffAt}
                  onChange={(event) => setCleanupHistoryCutoffAt(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>미리보기 토큰</span>
                <input
                  placeholder="보관 미리보기 토큰"
                  value={cleanupHistoryToken}
                  onChange={(event) => setCleanupHistoryToken(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.cleanupPanel}>
              <div>
                <h4>모의 실행 비교</h4>
                <p>다음 정리 실행 전에 이전 정리 토큰과 현재 보존 미리보기를 비교합니다.</p>
              </div>
              <label className={styles.field}>
                <span>정리 토큰</span>
                <input
                  value={cleanupComparisonToken}
                  placeholder="이전 정리 토큰"
                  onChange={(event) => setCleanupComparisonToken(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={auditCleanupComparisonLoading || !cleanupComparisonToken.trim()}
                onClick={() => void runAuditCleanupComparison()}
              >
                {auditCleanupComparisonLoading ? "비교 중" : "비교"}
              </button>
              {auditCleanupComparison ? (
                <a download href={auditCleanupComparisonExportUrl}>
                  비교 JSON 내보내기
                </a>
              ) : null}
            </div>

            {auditCleanupComparison ? (
              <div className={styles.filterGrid}>
                <DetailBlock title="현재 토큰">
                  <p>{auditCleanupComparison.currentPreview.archivePreviewToken}</p>
                </DetailBlock>
                <DetailBlock title="새 대상">
                  <p>{auditCleanupComparison.newlyEligibleIds.length}</p>
                </DetailBlock>
                <DetailBlock title="이전 삭제/건너뜀">
                  <p>{auditCleanupComparison.previouslyDeletedEligibleIds.length} / {auditCleanupComparison.previouslySkippedEligibleIds.length}</p>
                </DetailBlock>
                <DetailBlock title="계속 보호됨">
                  <p>{auditCleanupComparison.stillProtectedCount}</p>
                </DetailBlock>
              </div>
            ) : null}

            <div className={styles.actionAuditList}>
              {auditCleanupHistory.map((cleanup) => (
                <article className={styles.actionAuditCard} key={cleanup.id}>
                  <header>
                    <div>
                      <strong>{cleanup.deletedCount}개 삭제 / {cleanup.skippedCount}개 건너뜀</strong>
                      <span>{formatDate(cleanup.createdAt)} / 실행자 {cleanup.actorId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openAuditCleanupDetail(cleanup.id)} type="button">
                        {selectedCleanupId === cleanup.id ? "정리 닫기" : "정리 검토"}
                      </button>
                      <a download href={`/api/admin/assistant/audit-cleanups/${encodeURIComponent(cleanup.id)}/package?month=${encodeURIComponent(month)}`}>
                        패키지 내보내기
                      </a>
                    </div>
                  </header>
                  <p>토큰 {cleanup.archivePreviewToken} / 기준 {formatDate(cleanup.cutoffAt)} / 보존 {cleanup.previewRetentionDays}일</p>
                  <dl>
                    <div>
                      <dt>정리 감사</dt>
                      <dd>{cleanup.id}</dd>
                    </div>
                    <div>
                      <dt>요청 대상</dt>
                      <dd>{cleanup.requestedEligibleCount}</dd>
                    </div>
                    <div>
                      <dt>삭제된 ID</dt>
                      <dd>{cleanup.deletedIds.length ? cleanup.deletedIds.join(", ") : "-"}</dd>
                    </div>
                    <div>
                      <dt>건너뛴 ID</dt>
                      <dd>{cleanup.skippedIds.length ? cleanup.skippedIds.join(", ") : "-"}</dd>
                    </div>
                  </dl>
                  {selectedCleanupId === cleanup.id ? (
                    <AuditCleanupDetailPanel
                      detail={auditCleanupDetail}
                      loading={auditCleanupDetailLoading}
                      noteCategory={cleanupReviewNoteCategory}
                      noteSaving={cleanupReviewNoteSaving}
                      noteText={cleanupReviewNoteText}
                      onNoteCategoryChange={setCleanupReviewNoteCategory}
                      onNoteTextChange={setCleanupReviewNoteText}
                      onSaveNote={() => void saveCleanupReviewNote()}
                    />
                  ) : null}
                </article>
              ))}
              {auditCleanupHistory.length === 0 ? (
                <p className={styles.empty}>
                  {auditCleanupHistoryLoading ? "정리 이력을 불러오는 중입니다." : "현재 필터와 일치하는 정리 이력이 없습니다."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>정리 검토 메모 리포트</h3>
                <p>정리 실행에 남긴 추가 전용 검토 메모를 정리 거버넌스 검토용으로 필터링합니다.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{cleanupReviewNoteReportLoading ? "불러오는 중" : `${cleanupReviewNoteReport.length}개 메모`}</span>
                <a download href={cleanupReviewNoteExportUrl}>
                  정리 메모 CSV 내보내기
                </a>
                <a download href={cleanupReviewCoverageExportUrl}>
                  검토 범위 CSV 내보내기
                </a>
                <a download href={cleanupReviewCoverageJsonUrl}>
                  검토 범위 JSON 내보내기
                </a>
                <a download href={cleanupReviewCoveragePackageUrl}>
                  묶음 패키지 내보내기
                </a>
                <button onClick={() => void copyCleanupReviewCoverageHandoff()} type="button">
                  필터 인수인계 복사
                </button>
                <button onClick={resetCleanupReviewFilters} type="button">
                  정리 필터 초기화
                </button>
                <button onClick={showStaleUnreviewedCleanupCoverage} type="button">
                  오래된 미검토 보기
                </button>
                <button onClick={showReviewedCleanupCoverage} type="button">
                  검토 완료 보기
                </button>
                <button
                  onClick={() => setCleanupReviewQueueDensity((current) => (current === "detailed" ? "compact" : "detailed"))}
                  type="button"
                >
                  {cleanupReviewQueueDensity === "detailed" ? "간단히 보기" : "자세히 보기"}
                </button>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>분류</span>
                <select
                  value={cleanupReviewNoteFilterCategory}
                  onChange={(event) => setCleanupReviewNoteFilterCategory(event.target.value as GovernanceNoteCategory | "all")}
                >
                  <option value="all">전체 분류</option>
                  {governanceNoteOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>검토 범위 프리셋</span>
                <select
                  value={cleanupReviewCoveragePreset}
                  onChange={(event) => setCleanupReviewCoveragePreset(event.target.value as CleanupReviewCoveragePreset)}
                >
                  {cleanupReviewCoveragePresetOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>검토자</span>
                <input
                  placeholder="검토자 ID"
                  value={cleanupReviewNoteReviewer}
                  onChange={(event) => setCleanupReviewNoteReviewer(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>미리보기 토큰</span>
                <input
                  placeholder="보관 미리보기 토큰"
                  value={cleanupReviewNoteToken}
                  onChange={(event) => setCleanupReviewNoteToken(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>정리 ID</span>
                <input
                  placeholder="정리 감사 ID"
                  value={cleanupReviewNoteCleanupId}
                  onChange={(event) => setCleanupReviewNoteCleanupId(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>오래된 기준일</span>
                <input
                  min={0}
                  max={3650}
                  type="number"
                  value={cleanupReviewStaleDays}
                  onChange={(event) => setCleanupReviewStaleDays(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>
            </div>
            <div className={styles.quickFilterList}>
              {[0, 7, 30].map((days) => (
                <button key={days} onClick={() => setCleanupReviewStaleDays(days)} type="button">
                  {days}일 기준
                </button>
              ))}
            </div>
            <div className={styles.filterChipList}>
              {cleanupReviewActiveFilters.length ? (
                cleanupReviewActiveFilters.map((filter) => <span key={filter}>{filter}</span>)
              ) : (
                <span>기본 정리 검토 범위</span>
              )}
            </div>

            <div className={styles.filterGrid}>
              <Metric label="정리 메모" value={cleanupReviewNoteSummaryLoading ? "불러오는 중" : cleanupReviewNoteSummary?.totalNotes ?? 0} />
              <Metric label="검토 완료 실행" value={cleanupReviewNoteSummary?.reviewedCleanupRuns ?? 0} />
              <Metric label="미검토 실행" value={cleanupReviewNoteSummary?.unreviewedCleanupRuns ?? 0} />
              <Metric label="오래된 미검토" value={cleanupReviewNoteSummary?.staleUnreviewedCleanupRuns ?? 0} />
              <Metric label="전체 정리 실행" value={cleanupReviewNoteSummary?.totalCleanupRuns ?? 0} />
              <Metric
                label="검토 범위 프리셋"
                value={cleanupReviewCoveragePresetOptions.find((option) => option.value === cleanupReviewCoveragePreset)?.label ?? "전체 정리 실행"}
              />
            </div>

            {cleanupReviewNoteSummary ? (
              <div className={styles.filterGrid}>
                <DetailBlock title="분류별 수">
                  <p>{cleanupReviewNoteSummary.categoryCounts.length ? cleanupReviewNoteSummary.categoryCounts.map((item) => `${governanceNoteLabel(item.category)} ${item.count}`).join(" / ") : "-"}</p>
                </DetailBlock>
                <DetailBlock title="검토자별 수">
                  {cleanupReviewNoteSummary.reviewerCounts.length ? (
                    <div className={styles.quickFilterList}>
                      {cleanupReviewNoteSummary.reviewerCounts.map((item) => (
                        <button
                          key={item.reviewerId ?? "unknown-reviewer"}
                          onClick={() => setCleanupReviewNoteReviewer(item.reviewerId ?? "")}
                          type="button"
                        >
                          {item.reviewerId ?? "-"} {item.count}
                        </button>
                      ))}
                      <button onClick={() => setCleanupReviewNoteReviewer("")} type="button">
                        전체 검토자
                      </button>
                    </div>
                  ) : (
                    <p>-</p>
                  )}
                </DetailBlock>
                <DetailBlock title="필터 인수인계">
                  <p>{cleanupReviewCoverageHandoffText}</p>
                </DetailBlock>
              </div>
            ) : null}

            <div className={styles.cleanupQueueList}>
              {cleanupReviewCoverageGroups.map((group) => (
                <section className={styles.cleanupQueueGroup} key={group.key}>
                  <header>
                    <div>
                      <h4>{group.title}</h4>
                      <p>{group.description}</p>
                    </div>
                    <div className={styles.cleanupQueueHeaderTools}>
                      <dl className={styles.cleanupQueueStats}>
                        <div>
                          <dt>실행</dt>
                          <dd>{group.rows.length}</dd>
                        </div>
                        <div>
                          <dt>메모</dt>
                          <dd>{group.stats.notes}</dd>
                        </div>
                        <div>
                          <dt>삭제</dt>
                          <dd>{group.stats.deleted}</dd>
                        </div>
                        <div>
                          <dt>건너뜀</dt>
                          <dd>{group.stats.skipped}</dd>
                        </div>
                      </dl>
                      <div className={styles.cleanupQueueActions}>
                        {group.key === "stale-unreviewed" ? (
                          <button onClick={showStaleUnreviewedCleanupCoverage} type="button">
                            오래된 항목 보기
                          </button>
                        ) : null}
                        {group.key === "reviewed" ? (
                          <button onClick={showReviewedCleanupCoverage} type="button">
                            검토 완료 보기
                          </button>
                        ) : null}
                        {group.key === "other-unreviewed" ? (
                          <button onClick={showAllCleanupCoverage} type="button">
                            전체 검토 범위 보기
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </header>
                  <div className={styles.actionAuditList}>
                    {group.rows.length ? group.rows.map((item) => (
                      <article className={styles.actionAuditCard} key={item.cleanupId}>
                        <header>
                          <div>
                            <strong>{item.coverageStatus === "reviewed" ? "검토 완료 정리" : "미검토 정리"}</strong>
                            <span>{formatDate(item.cleanupCreatedAt)} / 실행자 {item.cleanupActorId ?? "-"}{item.isStale ? " / 오래된 검토 알림" : ""}</span>
                          </div>
                          <div className={styles.actionAuditCardActions}>
                            <button onClick={() => void openAuditCleanupDetail(item.cleanupId)} type="button">
                              {selectedCleanupId === item.cleanupId ? "정리 닫기" : "정리 검토"}
                            </button>
                            <button onClick={() => setCleanupReviewNoteToken(item.archivePreviewToken)} type="button">
                              토큰 필터
                            </button>
                            <button onClick={() => setCleanupReviewNoteCleanupId(item.cleanupId)} type="button">
                              정리 필터
                            </button>
                            <a download href={`/api/admin/assistant/audit-cleanups/${encodeURIComponent(item.cleanupId)}/package?month=${encodeURIComponent(month)}`}>
                              패키지 내보내기
                            </a>
                          </div>
                        </header>
                        <p>토큰 {item.archivePreviewToken} / 메모 {item.noteCount}개 / 최근 {item.latestNoteCreatedAt ? formatDate(item.latestNoteCreatedAt) : "-"}</p>
                        <div className={styles.cleanupRowChips}>
                          <span>{item.coverageStatus === "reviewed" ? "검토 완료" : "미검토"}</span>
                          <span>{item.isStale ? "오래됨" : "기준 이내"}</span>
                          <span>메모 {item.noteCount}개</span>
                          <span>검토자 {item.reviewerIds.length}명</span>
                          <span>{item.staleThresholdDays}일 기준</span>
                        </div>
                        {cleanupReviewQueueDensity === "detailed" ? (
                          <dl>
                            <div>
                              <dt>정리 감사</dt>
                              <dd>{item.cleanupId}</dd>
                            </div>
                            <div>
                              <dt>검토자</dt>
                              <dd>{item.reviewerIds.length ? item.reviewerIds.join(", ") : "-"}</dd>
                            </div>
                            <div>
                              <dt>정리 수</dt>
                              <dd>{item.deletedCount}개 삭제 / {item.skippedCount}개 건너뜀</dd>
                            </div>
                            <div>
                              <dt>기준 시각</dt>
                              <dd>{formatDate(item.cutoffAt)}</dd>
                            </div>
                          </dl>
                        ) : null}
                        {selectedCleanupId === item.cleanupId ? (
                          <AuditCleanupDetailPanel
                            detail={auditCleanupDetail}
                            loading={auditCleanupDetailLoading}
                            noteCategory={cleanupReviewNoteCategory}
                            noteSaving={cleanupReviewNoteSaving}
                            noteText={cleanupReviewNoteText}
                            onNoteCategoryChange={setCleanupReviewNoteCategory}
                            onNoteTextChange={setCleanupReviewNoteText}
                            onSaveNote={() => void saveCleanupReviewNote()}
                          />
                        ) : null}
                      </article>
                    )) : (
                      <p className={styles.empty}>이 큐에는 정리 실행이 없습니다.</p>
                    )}
                  </div>
                </section>
              ))}
              {cleanupReviewCoverage.length === 0 ? (
                <p className={styles.empty}>
                  {cleanupReviewCoverageLoading ? "정리 검토 범위를 불러오는 중입니다." : "현재 필터와 일치하는 정리 검토 범위 행이 없습니다."}
                </p>
              ) : null}
            </div>

            <div className={styles.actionAuditList}>
              {cleanupReviewNoteReport.map((note) => (
                <article className={styles.actionAuditCard} key={note.id}>
                  <header>
                    <div>
                      <strong>{governanceNoteLabel(note.category)}</strong>
                      <span>{formatDate(note.createdAt)} / 검토자 {note.reviewerId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openAuditCleanupDetail(note.sourceCleanupId)} type="button">
                        {selectedCleanupId === note.sourceCleanupId ? "정리 닫기" : "정리 검토"}
                      </button>
                      <a download href={`/api/admin/assistant/audit-cleanups/${encodeURIComponent(note.sourceCleanupId)}/package?month=${encodeURIComponent(month)}`}>
                        패키지 내보내기
                      </a>
                    </div>
                  </header>
                  <p>{note.note}</p>
                  <dl>
                    <div>
                      <dt>정리 감사</dt>
                      <dd>{note.sourceCleanupId}</dd>
                    </div>
                    <div>
                      <dt>미리보기 토큰</dt>
                      <dd>{note.sourceArchivePreviewToken}</dd>
                    </div>
                    <div>
                      <dt>정리 수</dt>
                      <dd>{note.cleanupDeletedCount}개 삭제 / {note.cleanupSkippedCount}개 건너뜀</dd>
                    </div>
                    <div>
                      <dt>기준 시각</dt>
                      <dd>{formatDate(note.cleanupCutoffAt)}</dd>
                    </div>
                  </dl>
                  {selectedCleanupId === note.sourceCleanupId ? (
                    <AuditCleanupDetailPanel
                      detail={auditCleanupDetail}
                      loading={auditCleanupDetailLoading}
                      noteCategory={cleanupReviewNoteCategory}
                      noteSaving={cleanupReviewNoteSaving}
                      noteText={cleanupReviewNoteText}
                      onNoteCategoryChange={setCleanupReviewNoteCategory}
                      onNoteTextChange={setCleanupReviewNoteText}
                      onSaveNote={() => void saveCleanupReviewNote()}
                    />
                  ) : null}
                </article>
              ))}
              {cleanupReviewNoteReport.length === 0 ? (
                <p className={styles.empty}>
                  {cleanupReviewNoteReportLoading ? "정리 검토 메모를 불러오는 중입니다." : "현재 필터와 일치하는 정리 검토 메모가 없습니다."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <h3>감사 타임라인</h3>
            <div className={styles.timeline}>
              {audit.map((event) => (
                <article key={event.id}>
                  <strong>{event.eventType}</strong>
                  <span>{formatDate(event.createdAt)} / {event.targetType}{event.targetId ? `:${event.targetId}` : ""}</span>
                  <code>{formatMetadata(event.metadata)}</code>
                </article>
              ))}
              {audit.length === 0 ? <p className={styles.empty}>선택한 월의 감사 이벤트가 없습니다.</p> : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

function ActionAuditGovernanceDetail({
  detail,
  loading,
  month,
  noteCategory,
  noteSaving,
  noteText,
  onNoteCategoryChange,
  onNoteTextChange,
  onSaveNote,
  showNoteForm = true,
}: {
  detail: AdminActionAuditDetail | null;
  loading: boolean;
  month: string;
  noteCategory: GovernanceNoteCategory;
  noteSaving: boolean;
  noteText: string;
  onNoteCategoryChange: (category: GovernanceNoteCategory) => void;
  onNoteTextChange: (text: string) => void;
  onSaveNote: () => void;
  showNoteForm?: boolean;
}) {
  if (loading) {
    return <p className={styles.detailLoading}>거버넌스 상세를 불러오는 중입니다...</p>;
  }

  if (!detail) {
    return <p className={styles.detailLoading}>거버넌스 상세를 사용할 수 없습니다.</p>;
  }

  const summary = detail.workSummaryDraft ?? detail.assistantRecord?.draftSummary ?? null;
  const packageUrl = `/api/admin/assistant/action-audits/${encodeURIComponent(detail.audit.id)}/package?month=${encodeURIComponent(month)}`;

  return (
    <section className={styles.governanceDetail} aria-label="AI 어시스턴트 작업 거버넌스 상세">
      <div className={styles.governanceHeader}>
        <div>
          <h4>거버넌스 상세</h4>
          <p>{detail.rawAuditEvent.eventType} / {detail.rawAuditEvent.targetType}:{detail.rawAuditEvent.targetId ?? "-"}</p>
        </div>
        <div className={styles.governanceHeaderActions}>
          <a download href={packageUrl}>패키지 내보내기</a>
          <a href={detail.governance.dailyTaskUrl}>일일 상세 열기</a>
        </div>
      </div>

      <div className={styles.governanceGrid}>
        <DetailBlock title="감사">
          <p>작업: {actionAuditLabel(detail.audit.action)}</p>
          <p>실행자: {detail.audit.createdBy ?? "-"}</p>
          <p>상태: {detail.governance.statusTransition ?? "-"}</p>
          <p>마커: {detail.governance.decisionMarker ?? "-"}</p>
        </DetailBlock>
        <DetailBlock title="어시스턴트 기록">
          <p>ID: {detail.assistantRecord?.id ?? detail.audit.assistantRecordId}</p>
          <p>모드: {detail.assistantRecord ? `${detail.assistantRecord.executionMode} / ${detail.assistantRecord.runtimeMode}` : "-"}</p>
          <p>신뢰도: {detail.assistantRecord ? `${detail.assistantRecord.confidenceScore}%` : "-"}</p>
          <p>근거: {detail.assistantRecord?.evidence.length ?? 0}</p>
        </DetailBlock>
        <DetailBlock title="종료 검토 필드">
          <p>상태: {detail.governance.closureState}</p>
          <p>결론: {summary?.conclusion || "-"}</p>
          <p>적용 범위: {summary?.scope || "-"}</p>
          <p>후속 조치: {summary?.followUpAction || "-"}</p>
          <p>태그: {summary?.tags?.join(", ") || "-"}</p>
        </DetailBlock>
        <DetailBlock title="작업 스냅샷">
          <TaskSnapshot label="원본" task={detail.tasks.source} />
          <TaskSnapshot label="대상" task={detail.tasks.target} />
          <TaskSnapshot label="생성" task={detail.tasks.created} />
        </DetailBlock>
      </div>

      <div className={styles.governanceNarrative}>
        <div>
          <span>작업 이력</span>
          <p>{detail.governance.taskHistory || "연결된 작업 스냅샷에 상태 이력이 저장되지 않았습니다."}</p>
        </div>
        <div>
          <span>출처</span>
          <ul>
            {detail.governance.provenance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.governanceNotes}>
        {showNoteForm ? (
          <div className={styles.governanceNoteForm}>
            <label className={styles.field}>
              <span>메모 분류</span>
              <select value={noteCategory} onChange={(event) => onNoteCategoryChange(event.target.value as GovernanceNoteCategory)}>
                {governanceNoteOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>거버넌스 메모</span>
              <textarea
                maxLength={1200}
                onChange={(event) => onNoteTextChange(event.target.value)}
                placeholder="거버넌스 검토 메모 추가"
                rows={3}
                value={noteText}
              />
            </label>
            <button disabled={noteSaving || !noteText.trim()} onClick={onSaveNote} type="button">
              {noteSaving ? "저장하고 있습니다..." : "메모 추가"}
            </button>
          </div>
        ) : null}

        <div className={styles.governanceNoteList}>
          <span>거버넌스 메모</span>
          {detail.governanceNotes.length ? (
            detail.governanceNotes.map((note) => (
              <article key={note.id}>
                <strong>{governanceNoteLabel(note.category)}</strong>
                <small>{formatDate(note.createdAt)} / 검토자 {note.reviewerId ?? "-"}</small>
                <p>{note.note}</p>
              </article>
            ))
          ) : (
            <p>추가된 거버넌스 메모가 없습니다.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function AuditCleanupDetailPanel({
  detail,
  loading,
  noteCategory,
  noteSaving,
  noteText,
  onNoteCategoryChange,
  onNoteTextChange,
  onSaveNote,
}: {
  detail: AuditCleanupDetail | null;
  loading: boolean;
  noteCategory: GovernanceNoteCategory;
  noteSaving: boolean;
  noteText: string;
  onNoteCategoryChange: (category: GovernanceNoteCategory) => void;
  onNoteTextChange: (text: string) => void;
  onSaveNote: () => void;
}) {
  if (loading) {
    return <p>정리 상세를 불러오는 중입니다...</p>;
  }

  if (!detail) {
    return <p>정리 상세를 사용할 수 없습니다.</p>;
  }

  return (
    <section className={styles.governanceDetail}>
      <div className={styles.governanceHeader}>
        <div>
          <h4>정리 상세</h4>
          <p>{detail.rawAuditEvent.eventType} / {detail.rawAuditEvent.targetType}:{detail.rawAuditEvent.targetId ?? "-"}</p>
        </div>
      </div>
      <div className={styles.governanceGrid}>
        <DetailBlock title="미리보기 토큰">
          <p>{detail.retentionContext.archivePreviewToken}</p>
        </DetailBlock>
        <DetailBlock title="기준 시각">
          <p>{formatDate(detail.retentionContext.cutoffAt)}</p>
        </DetailBlock>
        <DetailBlock title="요청 대상">
          <p>{detail.retentionContext.requestedEligibleCount}</p>
        </DetailBlock>
        <DetailBlock title="수량">
          <p>{detail.cleanup.deletedCount}개 삭제 / {detail.cleanup.skippedCount}개 건너뜀</p>
        </DetailBlock>
      </div>
      <DetailBlock title="삭제된 ID">
        <p>{detail.cleanup.deletedIds.length ? detail.cleanup.deletedIds.join(", ") : "-"}</p>
      </DetailBlock>
      <DetailBlock title="건너뛴 ID">
        <p>{detail.cleanup.skippedIds.length ? detail.cleanup.skippedIds.join(", ") : "-"}</p>
      </DetailBlock>
      <div className={styles.governanceNotes}>
        <div className={styles.governanceNoteForm}>
          <label className={styles.field}>
            <span>메모 분류</span>
            <select value={noteCategory} onChange={(event) => onNoteCategoryChange(event.target.value as GovernanceNoteCategory)}>
              {governanceNoteOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>정리 검토 메모</span>
            <textarea
              maxLength={1200}
              onChange={(event) => onNoteTextChange(event.target.value)}
              placeholder="정리 검토 메모 추가"
              rows={3}
              value={noteText}
            />
          </label>
          <button disabled={noteSaving || !noteText.trim()} onClick={onSaveNote} type="button">
            {noteSaving ? "저장하고 있습니다..." : "정리 메모 추가"}
          </button>
        </div>
        <div className={styles.governanceNoteList}>
          <span>정리 검토 메모</span>
          {detail.reviewNotes.length ? (
            detail.reviewNotes.map((note) => (
              <article key={note.id}>
                <strong>{governanceNoteLabel(note.category)}</strong>
                <small>{formatDate(note.createdAt)} / 검토자 {note.reviewerId ?? "-"}</small>
                <p>{note.note}</p>
              </article>
            ))
          ) : (
            <p>추가된 정리 검토 메모가 없습니다.</p>
          )}
        </div>
      </div>
      <DetailBlock title="원본 메타데이터">
        <pre>{JSON.stringify(detail.rawAuditEvent.metadata, null, 2)}</pre>
      </DetailBlock>
    </section>
  );
}

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.detailBlock}>
      <span>{title}</span>
      {children}
    </div>
  );
}

function TaskSnapshot({ label, task }: { label: string; task: AdminActionAuditTaskSnapshot | null }) {
  if (!task) {
    return <p>{label}: -</p>;
  }

  return <p>{label}: {task.label} / {task.status} / {task.title}</p>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function actionAuditLabel(action: AssistantActionAuditAction) {
  return action === "follow_up_task_created" ? "후속 작업 생성" : "작업 기록 업데이트";
}

function governanceNoteLabel(category: GovernanceNoteCategory) {
  return governanceNoteOptions.find((option) => option.value === category)?.label ?? category;
}

function formatTaskReference(label: string | null, taskId: string, title: string | null) {
  return [label ?? taskId, title].filter(Boolean).join(" / ");
}

function formatActionAuditSummary(event: AdminActionAuditRecord) {
  if (event.summary?.conclusion) {
    return event.summary.conclusion;
  }
  if (event.summary?.followUpAction) {
    return event.summary.followUpAction;
  }
  if (event.statusFrom || event.statusTo) {
    return `상태 ${event.statusFrom ?? "-"} -> ${event.statusTo ?? "-"}`;
  }
  return event.decisionMarker ?? "AI 어시스턴트 승인 작업";
}

async function readJson<T>(input: RequestInfo) {
  const response = await fetch(input, { cache: "no-store" });
  const json = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !json.data) {
    throw new Error("요청에 실패했습니다. 관리자 권한과 네트워크 상태를 확인하세요.");
  }
  return json.data;
}

async function writeJson<T>(input: RequestInfo, body: unknown, method = "PUT") {
  const response = await fetch(input, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !json.data) {
    throw new Error("요청에 실패했습니다. 관리자 권한과 네트워크 상태를 확인하세요.");
  }
  return json.data;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMetadata(value: Record<string, unknown>) {
  const text = JSON.stringify(value);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}
