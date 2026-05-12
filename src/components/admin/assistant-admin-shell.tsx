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
  { value: "regulation", label: "법규/기준" },
  { value: "task", label: "Task 기록" },
  { value: "project_document", label: "프로젝트 문서" },
  { value: "web_or_skill", label: "외부 웹/스킬" },
];

const actionAuditOptions: Array<{ value: AssistantActionAuditAction | "all"; label: string }> = [
  { value: "all", label: "All actions" },
  { value: "task_update_applied", label: "Task update applied" },
  { value: "follow_up_task_created", label: "Follow-up task created" },
];

const governanceNoteOptions: Array<{ value: GovernanceNoteCategory; label: string }> = [
  { value: "review_note", label: "Review note" },
  { value: "risk", label: "Risk" },
  { value: "follow_up", label: "Follow-up" },
  { value: "approval_context", label: "Approval context" },
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
  const [status, setStatus] = useState("Assistant 운영 데이터를 불러오는 중입니다.");
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
  }, [cleanupReviewNoteCleanupId, cleanupReviewNoteFilterCategory, cleanupReviewNoteReviewer, cleanupReviewNoteToken, month]);
  const cleanupReviewNoteExportUrl = `/api/admin/assistant/cleanup-review-notes/export?${cleanupReviewNoteReportQuery}`;
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
        setStatus("Assistant 운영 데이터를 불러왔습니다.");
      })
      .catch((error) => {
        if (active) {
          setStatus(error instanceof Error ? error.message : "Assistant 운영 데이터를 불러오지 못했습니다.");
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

    readJson<CleanupReviewNoteReportResponse>(`/api/admin/assistant/cleanup-review-notes?${cleanupReviewNoteReportQuery}`)
      .then((data) => {
        if (active) {
          setCleanupReviewNoteReport(data.notes);
        }
      })
      .catch(() => {
        if (active) {
          setCleanupReviewNoteReport([]);
        }
      })
      .finally(() => {
        if (active) {
          setCleanupReviewNoteReportLoading(false);
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
      setStatus("Assistant 실행 정책을 저장했습니다.");
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
      setStatus(error instanceof Error ? error.message : "Assistant action audit 상세를 불러오지 못했습니다.");
    } finally {
      setActionAuditDetailLoading(false);
    }
  }

  async function saveGovernanceNote() {
    if (!selectedActionAuditId || !governanceNoteText.trim()) {
      setStatus("Governance note text is required.");
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
      setStatus("Governance note saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Governance note 저장에 실패했습니다.");
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
      setStatus(error instanceof Error ? error.message : "Assistant action audit ?곸꽭瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??");
    } finally {
      setGovernanceReportDetailLoading(false);
    }
  }

  async function runAuditRetentionCleanup() {
    if (!auditRetentionPreview) {
      setStatus("Audit retention preview is required before cleanup.");
      return;
    }
    if (retentionCleanupConfirmation !== "DELETE_ASSISTANT_AUDIT_EVENTS") {
      setStatus("Type DELETE_ASSISTANT_AUDIT_EVENTS to confirm cleanup.");
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
      setStatus(`Assistant audit cleanup completed: ${result.deletedCount} deleted, ${result.skippedCount} skipped.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Assistant audit cleanup failed.");
    } finally {
      setAuditRetentionCleaning(false);
    }
  }

  async function runAuditCleanupComparison() {
    if (!cleanupComparisonToken.trim()) {
      setStatus("Cleanup preview token is required for comparison.");
      return;
    }

    setAuditCleanupComparisonLoading(true);
    try {
      const comparison = await readJson<AuditCleanupComparison>(
        `/api/admin/assistant/audit-cleanups/compare?${auditCleanupComparisonQuery}`,
      );
      setAuditCleanupComparison(comparison);
      setStatus("Assistant audit cleanup comparison loaded.");
    } catch (error) {
      setAuditCleanupComparison(null);
      setStatus(error instanceof Error ? error.message : "Assistant audit cleanup comparison failed.");
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
      setStatus(error instanceof Error ? error.message : "Assistant audit cleanup detail failed.");
    } finally {
      setAuditCleanupDetailLoading(false);
    }
  }

  async function saveCleanupReviewNote() {
    if (!selectedCleanupId) {
      setStatus("Select a cleanup before adding a review note.");
      return;
    }
    if (!cleanupReviewNoteText.trim()) {
      setStatus("Cleanup review note text is required.");
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
      setStatus("Cleanup review note saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cleanup review note 저장에 실패했습니다.");
    } finally {
      setCleanupReviewNoteSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <p>Assistant Operations</p>
          <h1>SaaS API Mode</h1>
          <span>{selectedProject?.name ?? "현재 프로젝트"} 기준 정책과 사용량을 관리합니다.</span>
        </div>
        <nav className={styles.headerActions} aria-label="관리 이동">
          <a href="/daily">Daily</a>
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
              <h2>실행 정책</h2>
              <p>서버에서 provider 호출 전에 적용되는 project scope 정책입니다.</p>
            </div>
            <span className={policy.enabled ? styles.badgeOn : styles.badgeOff}>{policy.enabled ? "enabled" : "disabled"}</span>
          </div>

          <div className={styles.formGrid}>
            <label className={styles.toggleField}>
              <span>SaaS API Mode</span>
              <input
                checked={policy.enabled}
                onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))}
                type="checkbox"
              />
            </label>
            <label className={styles.field}>
              <span>Provider</span>
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
              <span>Model</span>
              <input value={policy.model} onChange={(event) => setPolicy((current) => ({ ...current, model: event.target.value }))} />
            </label>
            <label className={styles.field}>
              <span>월 예산 cents</span>
              <input
                inputMode="numeric"
                value={policy.monthlyBudgetCents}
                onChange={(event) =>
                  setPolicy((current) => ({ ...current, monthlyBudgetCents: Number(event.target.value || 0) }))
                }
              />
            </label>
            <label className={styles.field}>
              <span>입력 token 제한</span>
              <input
                inputMode="numeric"
                value={policy.maxInputTokens}
                onChange={(event) => setPolicy((current) => ({ ...current, maxInputTokens: Number(event.target.value || 0) }))}
              />
            </label>
            <label className={styles.field}>
              <span>출력 token 제한</span>
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
              {saving ? "저장 중..." : "정책 저장"}
            </button>
          </div>
        </section>

        <section className={styles.reportPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>월별 리포트</h2>
              <p>성공, 차단, 실패 요청과 token/cost 추정치를 확인합니다.</p>
            </div>
            <label className={styles.monthPicker}>
              <span>월</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth())} />
            </label>
          </div>

          <div className={styles.metricGrid}>
            <Metric label="요청" value={usage?.requestCount ?? 0} />
            <Metric label="성공" value={usage?.successCount ?? 0} />
            <Metric label="차단" value={usage?.blockedCount ?? 0} />
            <Metric label="실패" value={usage?.failedCount ?? 0} />
            <Metric label="Input tokens" value={usage?.inputTokens ?? 0} />
            <Metric label="Output tokens" value={usage?.outputTokens ?? 0} />
            <Metric label="예상 비용" value={`${usage?.estimatedCostCents ?? 0}c`} />
            <Metric label="예산 사용" value={`${budgetRatio}%`} />
          </div>

          <div className={styles.tableBlock}>
            <h3>최근 usage events</h3>
            <div className={styles.tableScroller}>
              <table>
                <thead>
                  <tr>
                    <th>시간</th>
                    <th>상태</th>
                    <th>Provider</th>
                    <th>Tokens</th>
                    <th>Decision</th>
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
                      <td colSpan={6}>선택한 월의 usage event가 없습니다.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>Assistant action audits</h3>
                <p>Approved assistant task changes with task, assistant record, actor, and daily task links.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{actionAuditLoading ? "Loading" : `${actionAudits.length} records`}</span>
                <a download href={actionAuditExportUrl}>
                  Export CSV
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>Action</span>
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
                <span>Task ID or title</span>
                <input
                  placeholder="001, task id, or title"
                  value={actionAuditTask}
                  onChange={(event) => setActionAuditTask(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Assistant record</span>
                <input
                  placeholder="assistant record id"
                  value={actionAuditRecordId}
                  onChange={(event) => setActionAuditRecordId(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Actor</span>
                <input
                  placeholder="profile id"
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
                      <span>{formatDate(event.createdAt)} / actor {event.createdBy ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openActionAuditDetail(event.id)} type="button">
                        {selectedActionAuditId === event.id ? "Hide details" : "Review details"}
                      </button>
                      <a href={event.dailyTaskUrl}>Open task</a>
                    </div>
                  </header>
                  <p>{formatActionAuditSummary(event)}</p>
                  <dl>
                    <div>
                      <dt>Source task</dt>
                      <dd>{formatTaskReference(event.sourceTaskLabel, event.sourceTaskId, event.sourceTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>Target task</dt>
                      <dd>{formatTaskReference(event.targetTaskLabel, event.targetTaskId, event.targetTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>Created task</dt>
                      <dd>
                        {event.createdTaskId
                          ? formatTaskReference(event.createdTaskLabel, event.createdTaskId, event.createdTaskTitle)
                          : "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>Assistant record</dt>
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
                  {actionAuditLoading ? "Loading assistant action audits..." : "No assistant action audits match the current filters."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>Governance note report</h3>
                <p>Append-only review notes across assistant action audits, filtered for operational review.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{governanceNoteReportLoading ? "Loading" : `${governanceNoteReport.length} notes`}</span>
                <a download href={governanceNoteExportUrl}>
                  Export notes CSV
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>Category</span>
                <select
                  value={governanceNoteFilterCategory}
                  onChange={(event) => setGovernanceNoteFilterCategory(event.target.value as GovernanceNoteCategory | "all")}
                >
                  <option value="all">All categories</option>
                  {governanceNoteOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Reviewer</span>
                <input
                  placeholder="reviewer id"
                  value={governanceNoteReviewer}
                  onChange={(event) => setGovernanceNoteReviewer(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Task ID or title</span>
                <input
                  placeholder="001, task id, or title"
                  value={governanceNoteTask}
                  onChange={(event) => setGovernanceNoteTask(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Assistant record</span>
                <input
                  placeholder="assistant record id"
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
                      <span>{formatDate(note.createdAt)} / reviewer {note.reviewerId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openGovernanceReportDetail(note.sourceAuditId)} type="button">
                        {selectedGovernanceReportAuditId === note.sourceAuditId ? "Hide audit" : "Review audit"}
                      </button>
                      <a href={note.dailyTaskUrl}>Open daily detail</a>
                    </div>
                  </header>
                  <p>{note.note}</p>
                  <dl>
                    <div>
                      <dt>Source audit</dt>
                      <dd>{note.sourceAction} / {note.sourceAuditId}</dd>
                    </div>
                    <div>
                      <dt>Assistant record</dt>
                      <dd>{note.sourceAssistantRecordId}</dd>
                    </div>
                    <div>
                      <dt>Source task</dt>
                      <dd>{formatTaskReference(note.sourceTaskLabel, note.sourceTaskId, note.sourceTaskTitle)}</dd>
                    </div>
                    <div>
                      <dt>Target task</dt>
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
                  {governanceNoteReportLoading ? "Loading governance notes..." : "No governance notes match the current filters."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>Audit retention preview</h3>
                <p>Read-only archive preview for assistant action audits and governance notes before cleanup is allowed.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{auditRetentionLoading ? "Loading" : `${auditRetentionPreview?.eligibleCount ?? 0} eligible`}</span>
                <a download href={auditRetentionExportUrl}>
                  Export archive preview
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>Preview retention days</span>
                <input
                  inputMode="numeric"
                  min={0}
                  max={3650}
                  type="number"
                  value={retentionPreviewDays}
                  onChange={(event) => setRetentionPreviewDays(Math.max(0, Math.min(3650, Number(event.target.value || 0))))}
                />
              </label>
              <DetailBlock title="Policy retention">
                <p>{auditRetentionPreview?.policyRetentionDays ?? policy.retentionDays} days</p>
              </DetailBlock>
              <DetailBlock title="Cutoff">
                <p>{auditRetentionPreview ? formatDate(auditRetentionPreview.cutoffAt) : "-"}</p>
              </DetailBlock>
              <DetailBlock title="Relevant events">
                <p>{auditRetentionPreview?.totalRelevantEvents ?? 0} total / {auditRetentionPreview?.protectedCount ?? 0} protected</p>
              </DetailBlock>
              <DetailBlock title="Preview token">
                <p>{auditRetentionPreview?.archivePreviewToken ?? "-"}</p>
              </DetailBlock>
            </div>

            <div className={styles.cleanupPanel}>
              <div>
                <h4>Guarded cleanup</h4>
                <p>Requires this preview token and exact confirmation before deleting eligible assistant audit records.</p>
              </div>
              <label className={styles.field}>
                <span>Confirmation</span>
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
                {auditRetentionCleaning ? "Cleaning" : "Run cleanup"}
              </button>
              {auditRetentionCleanupResult ? (
                <p>
                  Cleanup audit {auditRetentionCleanupResult.cleanupAuditId}: {auditRetentionCleanupResult.deletedCount} deleted /{" "}
                  {auditRetentionCleanupResult.skippedCount} skipped.
                </p>
              ) : null}
            </div>

            <div className={styles.tableScroller}>
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Total</th>
                    <th>Eligible</th>
                    <th>Action audits</th>
                    <th>Governance notes</th>
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
                      <td colSpan={5}>No assistant audit retention records are available.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>Cleanup history</h3>
                <p>Executed assistant audit cleanup runs with preview token, cutoff, and deleted/skipped ids.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{auditCleanupHistoryLoading ? "Loading" : `${auditCleanupHistory.length} runs`}</span>
                <a download href={auditCleanupHistoryExportUrl}>
                  Export cleanup CSV
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>Actor</span>
                <input
                  placeholder="actor id"
                  value={cleanupHistoryActorId}
                  onChange={(event) => setCleanupHistoryActorId(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Cutoff</span>
                <input
                  placeholder="2025-05-12"
                  value={cleanupHistoryCutoffAt}
                  onChange={(event) => setCleanupHistoryCutoffAt(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Preview token</span>
                <input
                  placeholder="archive preview token"
                  value={cleanupHistoryToken}
                  onChange={(event) => setCleanupHistoryToken(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.cleanupPanel}>
              <div>
                <h4>Dry-run comparison</h4>
                <p>Compare a previous cleanup token with the current retention preview before another cleanup run.</p>
              </div>
              <label className={styles.field}>
                <span>Cleanup token</span>
                <input
                  value={cleanupComparisonToken}
                  placeholder="previous cleanup token"
                  onChange={(event) => setCleanupComparisonToken(event.target.value)}
                />
              </label>
              <button
                type="button"
                disabled={auditCleanupComparisonLoading || !cleanupComparisonToken.trim()}
                onClick={() => void runAuditCleanupComparison()}
              >
                {auditCleanupComparisonLoading ? "Comparing" : "Compare"}
              </button>
              {auditCleanupComparison ? (
                <a download href={auditCleanupComparisonExportUrl}>
                  Export comparison JSON
                </a>
              ) : null}
            </div>

            {auditCleanupComparison ? (
              <div className={styles.filterGrid}>
                <DetailBlock title="Current token">
                  <p>{auditCleanupComparison.currentPreview.archivePreviewToken}</p>
                </DetailBlock>
                <DetailBlock title="Newly eligible">
                  <p>{auditCleanupComparison.newlyEligibleIds.length}</p>
                </DetailBlock>
                <DetailBlock title="Previously deleted/skipped">
                  <p>{auditCleanupComparison.previouslyDeletedEligibleIds.length} / {auditCleanupComparison.previouslySkippedEligibleIds.length}</p>
                </DetailBlock>
                <DetailBlock title="Still protected">
                  <p>{auditCleanupComparison.stillProtectedCount}</p>
                </DetailBlock>
              </div>
            ) : null}

            <div className={styles.actionAuditList}>
              {auditCleanupHistory.map((cleanup) => (
                <article className={styles.actionAuditCard} key={cleanup.id}>
                  <header>
                    <div>
                      <strong>{cleanup.deletedCount} deleted / {cleanup.skippedCount} skipped</strong>
                      <span>{formatDate(cleanup.createdAt)} / actor {cleanup.actorId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openAuditCleanupDetail(cleanup.id)} type="button">
                        {selectedCleanupId === cleanup.id ? "Hide cleanup" : "Review cleanup"}
                      </button>
                      <a download href={`/api/admin/assistant/audit-cleanups/${encodeURIComponent(cleanup.id)}/package?month=${encodeURIComponent(month)}`}>
                        Export package
                      </a>
                    </div>
                  </header>
                  <p>Token {cleanup.archivePreviewToken} / cutoff {formatDate(cleanup.cutoffAt)} / retention {cleanup.previewRetentionDays} days</p>
                  <dl>
                    <div>
                      <dt>Cleanup audit</dt>
                      <dd>{cleanup.id}</dd>
                    </div>
                    <div>
                      <dt>Requested eligible</dt>
                      <dd>{cleanup.requestedEligibleCount}</dd>
                    </div>
                    <div>
                      <dt>Deleted ids</dt>
                      <dd>{cleanup.deletedIds.length ? cleanup.deletedIds.join(", ") : "-"}</dd>
                    </div>
                    <div>
                      <dt>Skipped ids</dt>
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
                  {auditCleanupHistoryLoading ? "Loading cleanup history..." : "No cleanup history matches the current filters."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <div className={styles.actionAuditHeader}>
              <div>
                <h3>Cleanup review-note report</h3>
                <p>Append-only review notes across cleanup runs, filtered for cleanup governance review.</p>
              </div>
              <div className={styles.actionAuditTools}>
                <span>{cleanupReviewNoteReportLoading ? "Loading" : `${cleanupReviewNoteReport.length} notes`}</span>
                <a download href={cleanupReviewNoteExportUrl}>
                  Export cleanup notes CSV
                </a>
              </div>
            </div>

            <div className={styles.filterGrid}>
              <label className={styles.field}>
                <span>Category</span>
                <select
                  value={cleanupReviewNoteFilterCategory}
                  onChange={(event) => setCleanupReviewNoteFilterCategory(event.target.value as GovernanceNoteCategory | "all")}
                >
                  <option value="all">All categories</option>
                  {governanceNoteOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Reviewer</span>
                <input
                  placeholder="reviewer id"
                  value={cleanupReviewNoteReviewer}
                  onChange={(event) => setCleanupReviewNoteReviewer(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Preview token</span>
                <input
                  placeholder="archive preview token"
                  value={cleanupReviewNoteToken}
                  onChange={(event) => setCleanupReviewNoteToken(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>Cleanup id</span>
                <input
                  placeholder="cleanup audit id"
                  value={cleanupReviewNoteCleanupId}
                  onChange={(event) => setCleanupReviewNoteCleanupId(event.target.value)}
                />
              </label>
            </div>

            <div className={styles.actionAuditList}>
              {cleanupReviewNoteReport.map((note) => (
                <article className={styles.actionAuditCard} key={note.id}>
                  <header>
                    <div>
                      <strong>{governanceNoteLabel(note.category)}</strong>
                      <span>{formatDate(note.createdAt)} / reviewer {note.reviewerId ?? "-"}</span>
                    </div>
                    <div className={styles.actionAuditCardActions}>
                      <button onClick={() => void openAuditCleanupDetail(note.sourceCleanupId)} type="button">
                        {selectedCleanupId === note.sourceCleanupId ? "Hide cleanup" : "Review cleanup"}
                      </button>
                      <a download href={`/api/admin/assistant/audit-cleanups/${encodeURIComponent(note.sourceCleanupId)}/package?month=${encodeURIComponent(month)}`}>
                        Export package
                      </a>
                    </div>
                  </header>
                  <p>{note.note}</p>
                  <dl>
                    <div>
                      <dt>Cleanup audit</dt>
                      <dd>{note.sourceCleanupId}</dd>
                    </div>
                    <div>
                      <dt>Preview token</dt>
                      <dd>{note.sourceArchivePreviewToken}</dd>
                    </div>
                    <div>
                      <dt>Cleanup counts</dt>
                      <dd>{note.cleanupDeletedCount} deleted / {note.cleanupSkippedCount} skipped</dd>
                    </div>
                    <div>
                      <dt>Cutoff</dt>
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
                  {cleanupReviewNoteReportLoading ? "Loading cleanup review notes..." : "No cleanup review notes match the current filters."}
                </p>
              ) : null}
            </div>
          </div>

          <div className={styles.tableBlock}>
            <h3>Audit timeline</h3>
            <div className={styles.timeline}>
              {audit.map((event) => (
                <article key={event.id}>
                  <strong>{event.eventType}</strong>
                  <span>{formatDate(event.createdAt)} / {event.targetType}{event.targetId ? `:${event.targetId}` : ""}</span>
                  <code>{formatMetadata(event.metadata)}</code>
                </article>
              ))}
              {audit.length === 0 ? <p className={styles.empty}>선택한 월의 audit event가 없습니다.</p> : null}
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
    return <p className={styles.detailLoading}>Loading governance detail...</p>;
  }

  if (!detail) {
    return <p className={styles.detailLoading}>Governance detail is not available.</p>;
  }

  const summary = detail.workSummaryDraft ?? detail.assistantRecord?.draftSummary ?? null;
  const packageUrl = `/api/admin/assistant/action-audits/${encodeURIComponent(detail.audit.id)}/package?month=${encodeURIComponent(month)}`;

  return (
    <section className={styles.governanceDetail} aria-label="Assistant action governance detail">
      <div className={styles.governanceHeader}>
        <div>
          <h4>Governance detail</h4>
          <p>{detail.rawAuditEvent.eventType} / {detail.rawAuditEvent.targetType}:{detail.rawAuditEvent.targetId ?? "-"}</p>
        </div>
        <div className={styles.governanceHeaderActions}>
          <a download href={packageUrl}>Export package</a>
          <a href={detail.governance.dailyTaskUrl}>Open daily detail</a>
        </div>
      </div>

      <div className={styles.governanceGrid}>
        <DetailBlock title="Audit">
          <p>Action: {actionAuditLabel(detail.audit.action)}</p>
          <p>Actor: {detail.audit.createdBy ?? "-"}</p>
          <p>Status: {detail.governance.statusTransition ?? "-"}</p>
          <p>Marker: {detail.governance.decisionMarker ?? "-"}</p>
        </DetailBlock>
        <DetailBlock title="Assistant record">
          <p>ID: {detail.assistantRecord?.id ?? detail.audit.assistantRecordId}</p>
          <p>Mode: {detail.assistantRecord ? `${detail.assistantRecord.executionMode} / ${detail.assistantRecord.runtimeMode}` : "-"}</p>
          <p>Confidence: {detail.assistantRecord ? `${detail.assistantRecord.confidenceScore}%` : "-"}</p>
          <p>Evidence: {detail.assistantRecord?.evidence.length ?? 0}</p>
        </DetailBlock>
        <DetailBlock title="Closure fields">
          <p>State: {detail.governance.closureState}</p>
          <p>Conclusion: {summary?.conclusion || "-"}</p>
          <p>Scope: {summary?.scope || "-"}</p>
          <p>Follow-up: {summary?.followUpAction || "-"}</p>
          <p>Tags: {summary?.tags?.join(", ") || "-"}</p>
        </DetailBlock>
        <DetailBlock title="Task snapshots">
          <TaskSnapshot label="Source" task={detail.tasks.source} />
          <TaskSnapshot label="Target" task={detail.tasks.target} />
          <TaskSnapshot label="Created" task={detail.tasks.created} />
        </DetailBlock>
      </div>

      <div className={styles.governanceNarrative}>
        <div>
          <span>Task history</span>
          <p>{detail.governance.taskHistory || "No status history was captured for the linked task snapshot."}</p>
        </div>
        <div>
          <span>Provenance</span>
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
              <span>Note category</span>
              <select value={noteCategory} onChange={(event) => onNoteCategoryChange(event.target.value as GovernanceNoteCategory)}>
                {governanceNoteOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Governance note</span>
              <textarea
                maxLength={1200}
                onChange={(event) => onNoteTextChange(event.target.value)}
                placeholder="Append a governance review note"
                rows={3}
                value={noteText}
              />
            </label>
            <button disabled={noteSaving || !noteText.trim()} onClick={onSaveNote} type="button">
              {noteSaving ? "Saving..." : "Add note"}
            </button>
          </div>
        ) : null}

        <div className={styles.governanceNoteList}>
          <span>Governance notes</span>
          {detail.governanceNotes.length ? (
            detail.governanceNotes.map((note) => (
              <article key={note.id}>
                <strong>{governanceNoteLabel(note.category)}</strong>
                <small>{formatDate(note.createdAt)} / reviewer {note.reviewerId ?? "-"}</small>
                <p>{note.note}</p>
              </article>
            ))
          ) : (
            <p>No governance notes have been added.</p>
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
    return <p>Loading cleanup detail...</p>;
  }

  if (!detail) {
    return <p>Cleanup detail is not available.</p>;
  }

  return (
    <section className={styles.governanceDetail}>
      <div className={styles.governanceHeader}>
        <div>
          <h4>Cleanup detail</h4>
          <p>{detail.rawAuditEvent.eventType} / {detail.rawAuditEvent.targetType}:{detail.rawAuditEvent.targetId ?? "-"}</p>
        </div>
      </div>
      <div className={styles.governanceGrid}>
        <DetailBlock title="Preview token">
          <p>{detail.retentionContext.archivePreviewToken}</p>
        </DetailBlock>
        <DetailBlock title="Cutoff">
          <p>{formatDate(detail.retentionContext.cutoffAt)}</p>
        </DetailBlock>
        <DetailBlock title="Requested eligible">
          <p>{detail.retentionContext.requestedEligibleCount}</p>
        </DetailBlock>
        <DetailBlock title="Counts">
          <p>{detail.cleanup.deletedCount} deleted / {detail.cleanup.skippedCount} skipped</p>
        </DetailBlock>
      </div>
      <DetailBlock title="Deleted ids">
        <p>{detail.cleanup.deletedIds.length ? detail.cleanup.deletedIds.join(", ") : "-"}</p>
      </DetailBlock>
      <DetailBlock title="Skipped ids">
        <p>{detail.cleanup.skippedIds.length ? detail.cleanup.skippedIds.join(", ") : "-"}</p>
      </DetailBlock>
      <div className={styles.governanceNotes}>
        <div className={styles.governanceNoteForm}>
          <label className={styles.field}>
            <span>Note category</span>
            <select value={noteCategory} onChange={(event) => onNoteCategoryChange(event.target.value as GovernanceNoteCategory)}>
              {governanceNoteOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Cleanup review note</span>
            <textarea
              maxLength={1200}
              onChange={(event) => onNoteTextChange(event.target.value)}
              placeholder="Append a cleanup review note"
              rows={3}
              value={noteText}
            />
          </label>
          <button disabled={noteSaving || !noteText.trim()} onClick={onSaveNote} type="button">
            {noteSaving ? "Saving..." : "Add cleanup note"}
          </button>
        </div>
        <div className={styles.governanceNoteList}>
          <span>Cleanup review notes</span>
          {detail.reviewNotes.length ? (
            detail.reviewNotes.map((note) => (
              <article key={note.id}>
                <strong>{governanceNoteLabel(note.category)}</strong>
                <small>{formatDate(note.createdAt)} / reviewer {note.reviewerId ?? "-"}</small>
                <p>{note.note}</p>
              </article>
            ))
          ) : (
            <p>No cleanup review notes have been added.</p>
          )}
        </div>
      </div>
      <DetailBlock title="Raw metadata">
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
  return action === "follow_up_task_created" ? "Follow-up task created" : "Task update applied";
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
    return `Status ${event.statusFrom ?? "-"} -> ${event.statusTo ?? "-"}`;
  }
  return event.decisionMarker ?? "Assistant-approved task action";
}

async function readJson<T>(input: RequestInfo) {
  const response = await fetch(input, { cache: "no-store" });
  const json = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok || !json.data) {
    throw new Error(json.error?.message || "Request failed");
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
    throw new Error(json.error?.message || "Request failed");
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
