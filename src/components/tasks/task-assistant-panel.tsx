"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { formatTaskDisplayId } from "@/domains/task/daily-list";
import type { TaskRecord } from "@/domains/task/types";
import type {
  AssistantActionAuditRecord,
  AssistantActionAuditSummary,
  AssistantUsageEvent,
} from "@/domains/assistant/saas-api-mode";
import type { AiSettingsPreference } from "@/domains/preferences/types";
import { DEFAULT_AI_SETTINGS_PREFERENCE, sanitizeAiSettingsPreference } from "@/domains/preferences/types";

type AssistantEvidence = {
  id: string;
  kind: "central_knowledge" | "regulation" | "task" | "project_document" | "web_or_skill";
  priority: number;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  recordId?: string;
  confidenceWeight?: number;
  officialSourceName?: string;
  lawName?: string;
  articleLabel?: string;
  articleNumber?: string;
  effectiveDate?: string;
  checkedAt?: string;
  apiSourceUrl?: string;
  verificationStatus?: "verified" | "needs_review" | "failed";
  legal?: {
    sourceId?: string;
    sourceKind?: string;
    authorityRank?: string;
    effective?: {
      effectiveFrom?: string;
      effectiveTo?: string;
      promulgatedAt?: string;
    };
    locator?: Record<string, unknown>;
    stale?: boolean;
    legalChangeWarnings?: string[];
    confidenceReason?: string;
  };
};

type AssistantFileAnalysis = {
  id: string;
  sourceType: string;
  verificationState: string;
  summary?: string;
  confidenceWeight?: number;
  provider?: string;
  providerStatus?: string;
  region?: {
    pageNumber?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    unit: "percent" | "px";
  };
  artifact?: {
    kind: "image_crop";
    mimeType: string;
    sizeBytes: number;
    sourceUrl?: string;
    sourceTitle?: string;
    capturedAt?: string;
  };
  createdAt?: string;
};

type AssistantFile = {
  id: string;
  originalName: string;
  metadata?: {
    analysis?: AssistantFileAnalysis[];
  };
};

type AssistantTaskContext = {
  taskId: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  issueId: string;
  projectName: string;
};

type DraftSummary = {
  conclusion: string;
  tags: string[];
  scope: string;
  followUpAction?: string;
};

type AssistantOutput = {
  answer: string;
  draftSummary: DraftSummary;
  retrieval?: RetrieveResponse;
  executionMode: "local-chatgpt-codex" | "mock" | "saas-api";
  runtimeMode: string;
  localCodexUsage?: LocalCodexUsageMetadata;
  localCodexBridgeSchemaVersion?: number;
};

type LocalCodexUsageMetadata = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  usageAvailable: boolean;
  model?: string;
  bridgeSchemaVersion?: number;
};

type EvidenceReadinessWarning = { code: string; message: string };
type AssistantRecordConfidenceOverride = { confidenceScore?: number; confidenceReason?: string };
const LEGAL_CHANGE_IMPACT_WARNING =
  "인용된 근거 중 변경 감지된 법령이 있습니다. 적용일자와 최신 조문을 확인하세요.";

type AssistantExecutionMode = "mock" | "saas-api" | "local-codex";
const DEFAULT_ASSISTANT_EXECUTION_MODE: AssistantExecutionMode = "local-codex";
type FileAnalysisSourceMode = "manual_text" | "ocr_text" | "image_region";

type RetrieveResponse = {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  legalEvidence?: AssistantEvidence[];
  projectContextChunks?: ProjectContextChunkForReview[];
  projectContextTrace?: ProjectContextTraceForReview;
  unavailableEvidenceKinds: string[];
  evidenceReadinessWarnings?: EvidenceReadinessWarning[];
  conversationMemory?: string;
};

type ProjectContextChunkForReview = {
  chunkId: string;
  sourceDocumentTitle: string;
  normalizedText: string;
  sourceQuote: string;
  location: unknown;
  contextType: string;
  chunkQualityScore: number;
  injectionRisk: string;
  score: number;
};

type ProjectContextTraceForReview = {
  status: "chunks_found" | "active_corpus_missing" | "no_relevant_chunks" | "search_failed";
  fallbackMode: "none" | "legal_only_after_project_context_error";
  noRelevantChunkReason?: string | null;
  searchErrorCode?: string | null;
};

type SavedAssistantRecord = {
  id: string;
  taskId?: string;
  confidenceScore: number;
  confidenceReason?: string;
  executionMode?: "local-chatgpt-codex" | "mock" | "unavailable" | "saas-api";
  runtimeMode?: string;
  candidateState?: "candidate" | "not_candidate" | "pending_review" | "approved" | "rejected";
  draftSummary?: DraftSummary | null;
  createdAt?: string;
  updatedAt?: string;
};

type AssistantRecordHistoryItem = {
  id: string;
  taskId: string;
  question: string;
  answer: string;
  evidenceCount: number;
  evidenceKinds: AssistantEvidence["kind"][];
  confidenceScore: number;
  confidenceReason: string;
  executionMode: "local-chatgpt-codex" | "mock" | "unavailable" | "saas-api";
  runtimeMode: string;
  draftSummary: DraftSummary | null;
  cleanupState: "draft" | "approved" | "deferred";
  candidateState: "candidate" | "not_candidate" | "pending_review" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

type AssistantReviewSessionItem = {
  id: string;
  taskId: string;
  title: string;
  question: string;
  answerPreview: string;
  verdict: string | null;
  conclusionMayChange: boolean;
  savedAt: string;
  updatedAt: string;
  savedRecord: SavedAssistantRecord;
};

type AssistantReviewSessionDetail = AssistantReviewSessionItem & {
  answer: string;
  savedEvidenceSnapshot: AssistantEvidence[];
  latestEvidenceSnapshot: AssistantEvidence[];
  savedWikiEvidence: AssistantEvidence[];
  latestWikiEvidence: AssistantEvidence[];
  savedHistoryEvidence: AssistantEvidence[];
  latestHistoryEvidence: AssistantEvidence[];
};

type ExternalEvidenceSourceType =
  | "web_page"
  | "skill_output"
  | "external_document"
  | "manufacturer_doc"
  | "public_standard";

type ExternalEvidenceRecord = {
  id: string;
  taskId: string;
  sourceType: ExternalEvidenceSourceType;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  toolName?: string;
  capturedAt: string;
};

type SaveExternalEvidenceResponse = {
  externalEvidence: ExternalEvidenceRecord;
  evidence: AssistantEvidence;
};

type AssistantPolicyResponse = {
  enabled: boolean;
  provider: "mock" | "openai";
  model: string;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: AssistantEvidence["kind"][];
};

type AssistantGenerateResponse = {
  answer: string;
  suggestedDraftSummary: DraftSummary;
  citations: Array<{ sourceType: AssistantEvidence["kind"]; sourceId: string; title: string }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
  executionMode: "saas-api";
  policyDecision: string;
  policy: {
    enabled: boolean;
    provider: "mock" | "openai";
    model: string;
    monthlyBudgetCents: number;
  };
  provider: {
    provider: "mock" | "openai";
    model: string;
    callMode: "mock" | "live";
    requestId: string | null;
  };
  retrieval?: unknown;
};

type TaskReviewResponse = {
  status: "blocked" | "ready_for_generation" | "generated";
  reason: string;
  taskContext: AssistantTaskContext;
  retrievedEvidence: {
    count: number;
    regulationCount: number;
    unavailableEvidenceKinds: string[];
  };
  officialLawVerification: {
    status: "not_required" | "verified" | "failed";
    checkedAt: string;
    failures: string[];
    retry: string[];
  };
  evidence: AssistantEvidence[];
  evidenceReadiness: Array<{
    kind: "central_knowledge" | "project_document" | "web_or_skill";
    status: "available" | "missing";
    action: string;
  }>;
  legalApplicability?: unknown;
  reviewSession?: unknown;
  generated?: AssistantGenerateResponse;
  savedRecord: SavedAssistantRecord | null;
  wiki: {
    candidateCreated: false;
    approvalAttempted: false;
    approvedKnowledgeItemId: null;
    reason?: string;
  };
};

type LocalCodexStatus = {
  available: boolean;
  mode: "local-chatgpt-codex" | "mock";
  reason?: string;
  bridgeSchemaVersion?: number;
  codexCliVersion?: string;
};

type BrowserRegionCapture = {
  dataUrl: string;
  cropDataUrl?: string;
  title: string;
  url: string;
  capturedAt: string;
  region: {
    x: number;
    y: number;
    width: number;
    height: number;
    unit: "percent" | "px";
  };
  pixelRegion: {
    x: number;
    y: number;
    width: number;
    height: number;
    unit: "percent" | "px";
  };
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
};

type LocalCodexBridgeResponse<T> =
  | {
      type: "architect:page-local-runtime-response";
      requestId: string;
      ok: true;
      data: T;
    }
  | {
      type: "architect:page-local-runtime-response";
      requestId: string;
      ok: false;
      error: string;
    };

type SidePanelBridgeResponse =
  | {
      type: "architect:page-side-panel-response";
      requestId: string;
      ok: true;
      data: {
        opened: true;
        taskId: string;
        openedAt: string;
      };
    }
  | {
      type: "architect:page-side-panel-response";
      requestId: string;
      ok: false;
      error: string;
      errorCode?: string;
    };

const SIDE_PANEL_CONTEXT_UPDATED_EVENT = "architect:side-panel-context-updated";
const SIDE_PANEL_CONTEXT_SOURCE = "architect-saas-daily";
const SIDE_PANEL_CONTEXT_QUESTION_DEBOUNCE_MS = 300;

type SidePanelContextUpdateReason =
  | "launch"
  | "selection-change"
  | "question-change"
  | "mode-change";

type SidePanelAssistantMode = "basic" | "advanced";

type SidePanelContextSnapshot = {
  task: {
    taskId: string;
    projectId?: string;
    displayId?: string;
    title?: string;
    status?: string;
  };
  review?: {
    question: string;
    executionMode?: string;
    assistantMode?: SidePanelAssistantMode;
  };
  page: {
    url: string;
    route: string;
  };
  reason: SidePanelContextUpdateReason;
  selectedAt: string;
  source: typeof SIDE_PANEL_CONTEXT_SOURCE;
};

type SidePanelContextSourceState = {
  selectedTask: TaskRecord | null;
  selectedTaskLabel: string;
  question: string;
  executionMode: AssistantExecutionMode;
  assistantMode: SidePanelAssistantMode;
};

type LocalCodexReadyEvent = {
  type: "architect:page-local-runtime-ready";
  bridgeSchemaVersion?: number;
  extensionId?: string;
  origin?: string;
  injectedAt?: string;
};

type LocalCodexBridgeRequestOptions = {
  codexOptions?: {
    model?: string;
    reasoningEffort?: string;
    serviceTier?: string;
    timeoutMs?: number;
    noHistory?: boolean;
  };
};

type LocalCodexHealthStep = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

type LocalCodexLawPreflight = {
  status: "not_required" | "verified" | "failed";
  detail: string;
};

type LocalCodexHealthReport = {
  checkedAt: string;
  summary: string;
  steps: LocalCodexHealthStep[];
};

type ClosureGateItem = {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "fail";
  required: boolean;
};

type SummarySaveStatus = "approved";

type LocalCodexUsageRecordState =
  | { status: "recording"; assistantRecordId: string }
  | {
      status: "recorded";
      assistantRecordId: string;
      eventId: string;
      inputTokens: number;
      outputTokens: number;
      usageAvailable: boolean;
    }
  | {
      status: "failed";
      assistantRecordId: string;
      message: string;
      generated: AssistantOutput;
      savedRecord: SavedAssistantRecord;
      taskId: string;
    };

type TaskUpdateProposal = {
  nextStatus: TaskRecord["status"];
  statusChanged: boolean;
  alreadyRecorded: boolean;
  decisionAppend: string;
  nextDecision: string;
};

type FollowUpTaskProposal = {
  issueTitle: string;
  issueDetailNote: string;
  requestBody: {
    dueDate: string;
    workType: string;
    coordinationScope: string;
    requestedBy: string;
    relatedDisciplines: string;
    assignee: string;
    assigneeProfileId: string | null;
    reviewedAt: string;
    isDaily: boolean;
    locationRef: string;
    calendarLinked: boolean;
    issueTitle: string;
    issueDetailNote: string;
    status: "new";
    decision: string;
    parentTaskId: string;
  };
};

type TaskAssistantPanelProps = {
  selectedTask: TaskRecord | null;
  defaultOpen?: boolean;
  defaultExecutionMode?: AssistantExecutionMode;
};

const defaultInstruction =
  "건축 task 관점에서 근거, 리스크, 확인할 도면/문서, 후속 조치를 분리해서 의견을 작성해줘.";

const externalSourceOptions: Array<{ value: ExternalEvidenceSourceType; label: string }> = [
  { value: "web_page", label: "웹 페이지" },
  { value: "skill_output", label: "스킬 결과" },
  { value: "external_document", label: "외부 문서" },
  { value: "manufacturer_doc", label: "제조사 자료" },
  { value: "public_standard", label: "공개 기준" },
];

export function TaskAssistantPanel({
  selectedTask,
  defaultOpen = false,
  defaultExecutionMode = DEFAULT_ASSISTANT_EXECUTION_MODE,
}: TaskAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [question, setQuestion] = useState("");
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(null);
  const [output, setOutput] = useState<AssistantOutput | null>(null);
  const [record, setRecord] = useState<SavedAssistantRecord | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<DraftSummary | null>(null);
  const [summaryTagsInput, setSummaryTagsInput] = useState("");
  const [summaryEditorExpanded, setSummaryEditorExpanded] = useState(false);
  const [closureAcknowledged, setClosureAcknowledged] = useState(false);
  const [summarySaveState, setSummarySaveState] = useState<SummarySaveStatus | null>(null);
  const [proposalStatus, setProposalStatus] = useState("");
  const [taskUpdateApplied, setTaskUpdateApplied] = useState(false);
  const [followUpTaskCreated, setFollowUpTaskCreated] = useState(false);
  const [recordHistory, setRecordHistory] = useState<AssistantReviewSessionItem[]>([]);
  const [selectedReviewSession, setSelectedReviewSession] = useState<AssistantReviewSessionDetail | null>(null);
  const [pendingTaskReview, setPendingTaskReview] = useState<TaskReviewResponse | null>(null);
  const [reviewSessionSaving, setReviewSessionSaving] = useState(false);
  const [taskFiles, setTaskFiles] = useState<AssistantFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [analysisSourceType, setAnalysisSourceType] = useState<FileAnalysisSourceMode>("manual_text");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [analysisPageNumber, setAnalysisPageNumber] = useState("");
  const [analysisRegionX, setAnalysisRegionX] = useState("");
  const [analysisRegionY, setAnalysisRegionY] = useState("");
  const [analysisRegionWidth, setAnalysisRegionWidth] = useState("");
  const [analysisRegionHeight, setAnalysisRegionHeight] = useState("");
  const [analysisCropDataUrl, setAnalysisCropDataUrl] = useState("");
  const [analysisCropSourceUrl, setAnalysisCropSourceUrl] = useState("");
  const [analysisCropSourceTitle, setAnalysisCropSourceTitle] = useState("");
  const [analysisCropCapturedAt, setAnalysisCropCapturedAt] = useState("");
  const [executionMode, setExecutionMode] = useState<AssistantExecutionMode>(defaultExecutionMode);
  const [assistantPolicy, setAssistantPolicy] = useState<AssistantPolicyResponse | null>(null);
  const [recordHistoryLoading, setRecordHistoryLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);
  const [externalExpanded, setExternalExpanded] = useState(false);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [assistantPanelMode, setAssistantPanelMode] = useState<"basic" | "advanced">("basic");
  const [externalAllowed, setExternalAllowed] = useState(false);
  const [externalEvidence, setExternalEvidence] = useState<ExternalEvidenceRecord[]>([]);
  const [externalSourceType, setExternalSourceType] = useState<ExternalEvidenceSourceType>("web_page");
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalToolName, setExternalToolName] = useState("");
  const [externalExcerpt, setExternalExcerpt] = useState("");
  const [localCodexHealth, setLocalCodexHealth] = useState<LocalCodexHealthReport | null>(null);
  const [usageRecordState, setUsageRecordState] = useState<LocalCodexUsageRecordState | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [sidePanelRequestId, setSidePanelRequestId] = useState(() => makeSidePanelRequestId());
  const [sidePanelOpening, setSidePanelOpening] = useState(false);
  const [status, setStatus] = useState("task를 선택하면 assistant가 해당 task에 반응합니다.");
  const [busy, setBusy] = useState(false);
  const reviewRequestSeqRef = useRef(0);

  const selectedTaskLabel = useMemo(() => (selectedTask ? formatTaskDisplayId(selectedTask) : ""), [selectedTask]);
  const sidePanelSelectionTaskIdRef = useRef<string | null>(null);
  const sidePanelModeKeyRef = useRef(`${executionMode}:${assistantPanelMode}`);
  const sidePanelQuestionTimerRef = useRef<number | null>(null);
  const sidePanelContextRef = useRef<SidePanelContextSourceState>({
    selectedTask,
    selectedTaskLabel,
    question,
    executionMode,
    assistantMode: assistantPanelMode,
  });
  const dispatchSidePanelContextUpdate = useCallback((reason: SidePanelContextUpdateReason) => {
    const context = sidePanelContextRef.current;
    if (!context.selectedTask) {
      return false;
    }

    return dispatchSidePanelContextUpdated(
      buildSidePanelContextSnapshot({
        selectedTask: context.selectedTask,
        selectedTaskLabel: context.selectedTaskLabel,
        question: context.question,
        executionMode: context.executionMode,
        assistantMode: context.assistantMode,
        reason,
      }),
    );
  }, []);
  const clearSidePanelQuestionTimer = useCallback(() => {
    if (sidePanelQuestionTimerRef.current === null) {
      return;
    }

    window.clearTimeout(sidePanelQuestionTimerRef.current);
    sidePanelQuestionTimerRef.current = null;
  }, []);
  const closureGate = useMemo(
    () => buildClosureGate({ record, retrieveResult, summaryDraft }),
    [record, retrieveResult, summaryDraft],
  );
  const visibleClosureGate = useMemo(
    () => closureGate.filter((item) => item.id === "confidence"),
    [closureGate],
  );
  const approvalBlockers = closureGate.filter((item) => item.required && item.status !== "pass");
  const canApproveSummary = Boolean(selectedTask && record && output && summaryDraft && !busy && closureAcknowledged && approvalBlockers.length === 0);
  const canSaveReviewSession = Boolean(selectedTask && output && retrieveResult && !record && !busy && !reviewSessionSaving);
  const summaryTags = useMemo(() => parseSummaryTags(summaryTagsInput), [summaryTagsInput]);
  const taskUpdateProposal = useMemo(
    () =>
      summarySaveState === "approved" && selectedTask && record && summaryDraft
        ? buildTaskUpdateProposal(selectedTask, summaryDraft, summaryTags, record)
        : null,
    [record, selectedTask, summaryDraft, summarySaveState, summaryTags],
  );
  const followUpTaskProposal = useMemo(
    () =>
      summarySaveState === "approved" && selectedTask && record && summaryDraft
        ? buildFollowUpTaskProposal(selectedTask, summaryDraft, summaryTags, record)
        : null,
    [record, selectedTask, summaryDraft, summarySaveState, summaryTags],
  );
  const canApplyTaskUpdate = Boolean(
    taskUpdateProposal && !busy && !taskUpdateApplied && (!taskUpdateProposal.alreadyRecorded || taskUpdateProposal.statusChanged),
  );
  const canCreateFollowUpTask = Boolean(followUpTaskProposal && !busy && !followUpTaskCreated);
  const selectedAssistantFile = useMemo(
    () => taskFiles.find((file) => file.id === selectedFileId) ?? null,
    [selectedFileId, taskFiles],
  );
  const selectedFileAnalyses = useMemo(
    () => selectedAssistantFile?.metadata?.analysis ?? [],
    [selectedAssistantFile],
  );
  const reviewFlowSteps = useMemo(
    () => [
      { label: "질문 입력", complete: Boolean(question.trim()), active: !question.trim() },
      { label: "근거 확인", complete: Boolean(retrieveResult), active: Boolean(question.trim()) && !retrieveResult },
      { label: "검토안 생성", complete: Boolean(output), active: Boolean(retrieveResult) && !output },
      {
        label: "요약 처리",
        complete: summarySaveState === "approved",
        active: Boolean(output) && !summarySaveState,
      },
    ],
    [output, question, retrieveResult, summarySaveState],
  );
  const reviewActionHint = useMemo(() => {
    if (!selectedTask) {
      return "일일목록에서 task를 선택하면 검토 흐름이 시작됩니다.";
    }
    if (!question.trim()) {
      return "검토 질문을 입력하세요.";
    }
    if (!retrieveResult) {
      return "근거 조회와 의견 생성을 한 번에 실행합니다.";
    }
    if (!output) {
      return "근거를 확인했습니다. 검토 의견 생성을 계속 진행하세요.";
    }
    if (!summarySaveState) {
      return "검토 의견을 확인한 뒤 필요할 때 작업 기록을 승인하세요.";
    }
    return "검토 흐름이 처리되었습니다.";
  }, [output, question, retrieveResult, selectedTask, summarySaveState]);
  const showLocalCodexConnectionHelp = Boolean(localCodexHealth?.steps.some((step) => step.status === "fail"));

  useEffect(() => {
    sidePanelContextRef.current = {
      selectedTask,
      selectedTaskLabel,
      question,
      executionMode,
      assistantMode: assistantPanelMode,
    };
  }, [assistantPanelMode, executionMode, question, selectedTask, selectedTaskLabel]);

  useEffect(() => {
    clearSidePanelQuestionTimer();

    const scheduledTaskId = selectedTask?.id ?? null;
    if (!scheduledTaskId || sidePanelSelectionTaskIdRef.current !== scheduledTaskId) {
      return;
    }

    sidePanelQuestionTimerRef.current = window.setTimeout(() => {
      sidePanelQuestionTimerRef.current = null;
      if (sidePanelContextRef.current.selectedTask?.id !== scheduledTaskId) {
        return;
      }
      dispatchSidePanelContextUpdate("question-change");
    }, SIDE_PANEL_CONTEXT_QUESTION_DEBOUNCE_MS);

    return clearSidePanelQuestionTimer;
  }, [clearSidePanelQuestionTimer, dispatchSidePanelContextUpdate, question, selectedTask?.id]);

  useEffect(() => {
    const nextModeKey = `${executionMode}:${assistantPanelMode}`;
    if (sidePanelModeKeyRef.current === nextModeKey) {
      return;
    }

    sidePanelModeKeyRef.current = nextModeKey;
    clearSidePanelQuestionTimer();
    dispatchSidePanelContextUpdate("mode-change");
  }, [assistantPanelMode, clearSidePanelQuestionTimer, dispatchSidePanelContextUpdate, executionMode]);

  useEffect(() => {
    reviewRequestSeqRef.current += 1;
    setRetrieveResult(null);
    setOutput(null);
    setRecord(null);
    setSummaryDraft(null);
    setSummaryTagsInput("");
    setSummaryEditorExpanded(false);
    setClosureAcknowledged(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
    setPendingTaskReview(null);
    setSelectedReviewSession(null);
    setReviewSessionSaving(false);
    setRecordHistory([]);
    setTaskFiles([]);
    setSelectedFileId("");
    setAnalysisSourceType("manual_text");
    setAnalysisText("");
    setAnalysisSummary("");
    setAnalysisPageNumber("");
    setAnalysisRegionX("");
    setAnalysisRegionY("");
    setAnalysisRegionWidth("");
    setAnalysisRegionHeight("");
    setAnalysisCropDataUrl("");
    setAnalysisCropSourceUrl("");
    setAnalysisCropSourceTitle("");
    setAnalysisCropCapturedAt("");
    setExecutionMode(defaultExecutionMode);
    setAssistantPolicy(null);
    setExternalEvidence([]);
    setHistoryExpanded(false);
    setFilesExpanded(false);
    setDiagnosticsExpanded(false);
    setExternalExpanded(false);
    setEvidenceExpanded(false);
    setExternalAllowed(false);
    setExternalTitle("");
    setExternalUrl("");
    setExternalToolName("");
    setExternalExcerpt("");
    setLocalCodexHealth(null);
    setUsageRecordState(null);
    setHealthLoading(false);
    setSidePanelRequestId(makeSidePanelRequestId());
    setSidePanelOpening(false);
    setRecordHistoryLoading(false);
    setBusy(false);

    if (!selectedTask) {
      sidePanelSelectionTaskIdRef.current = null;
      setQuestion("");
      setStatus("task를 선택하면 assistant가 해당 task에 반응합니다.");
      return;
    }

    const nextQuestion = `${selectedTaskLabel} task의 검토 근거와 후속 조치를 정리해줘.`;
    setQuestion(nextQuestion);
    setStatus(`${selectedTaskLabel} task가 선택되었습니다.`);
    if (sidePanelSelectionTaskIdRef.current !== selectedTask.id) {
      sidePanelSelectionTaskIdRef.current = selectedTask.id;
      dispatchSidePanelContextUpdated(
        buildSidePanelContextSnapshot({
          selectedTask,
          selectedTaskLabel,
          question: nextQuestion,
          executionMode: defaultExecutionMode,
          assistantMode: sidePanelContextRef.current.assistantMode,
          reason: "selection-change",
        }),
      );
    }
  }, [defaultExecutionMode, selectedTask, selectedTaskLabel]);

  useEffect(() => {
    if (!isOpen || !selectedTask) {
      return;
    }

    let cancelled = false;
    setRecordHistoryLoading(true);
    setFilesLoading(true);
    setExternalLoading(true);

    getJson<AssistantReviewSessionItem[]>(`/api/assistant/review-sessions?taskId=${encodeURIComponent(selectedTask.id)}`)
      .then((items) => {
        if (!cancelled) {
          setRecordHistory(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRecordHistoryLoading(false);
        }
      });

    getJson<AssistantFile[]>(`/api/files?taskId=${encodeURIComponent(selectedTask.id)}`)
      .then((files) => {
        if (cancelled) {
          return;
        }
        setTaskFiles(files);
        setSelectedFileId((current) => current || files[0]?.id || "");
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setFilesLoading(false);
        }
      });

    getJson<ExternalEvidenceRecord[]>(`/api/assistant/external-evidence?taskId=${encodeURIComponent(selectedTask.id)}`)
      .then((items) => {
        if (!cancelled) {
          setExternalEvidence(items);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setExternalLoading(false);
        }
      });

    getJson<AssistantPolicyResponse>("/api/assistant/policy")
      .then((policy) => {
        if (!cancelled) {
          setAssistantPolicy(policy);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus(errorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedTask]);

  async function runAssistantReview() {
    if (!selectedTask || !question.trim()) {
      setStatus("먼저 일일목록에서 task를 선택하고 질문을 입력하세요.");
      return;
    }

    const reviewRequestId = reviewRequestSeqRef.current + 1;
    reviewRequestSeqRef.current = reviewRequestId;
    const requestedTaskId = selectedTask.id;
    const requestedQuestion = question;
    const requestedInstruction = instruction;
    const requestedExecutionMode = executionMode;
    setBusy(true);
    setOutput(null);
    setRecord(null);
    setPendingTaskReview(null);
    setSelectedReviewSession(null);
    setEvidenceExpanded(false);
    setSummaryEditorExpanded(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
    setUsageRecordState(null);
    setStatus("근거를 조회하고 검토 의견을 생성하는 중입니다.");
    try {
      const localCodexPreflight =
        requestedExecutionMode === "local-codex" ? await assertLocalCodexReadyBeforeRetrieval() : null;
      if (reviewRequestSeqRef.current !== reviewRequestId) {
        return;
      }

      if (requestedExecutionMode === "saas-api") {
        const review = await postTaskReviewJson({
          taskId: requestedTaskId,
          question: requestedQuestion,
          instruction: requestedInstruction,
          mode: "generate",
        });
        if (reviewRequestSeqRef.current !== reviewRequestId) {
          return;
        }
        if (review.taskContext.taskId !== requestedTaskId) {
          throw new Error("Assistant task-review task mismatch. Please rerun the review for the selected task.");
        }

        const reviewRetrieval =
          normalizeGeneratedRetrieval(review.generated?.retrieval) ?? {
            taskContext: review.taskContext,
            evidence: review.evidence,
            unavailableEvidenceKinds: review.retrievedEvidence.unavailableEvidenceKinds,
            evidenceReadinessWarnings: [],
          };
        setRetrieveResult(reviewRetrieval);

        if (review.status !== "generated" || !review.generated) {
          const failures = review.officialLawVerification.failures.join(" / ");
          const readiness = review.evidenceReadiness
            .filter((item) => item.status === "missing")
            .map((item) => `${item.kind}: ${item.action}`)
            .join(" / ");
          throw new Error([failures || review.reason, readiness].filter(Boolean).join(" / "));
        }

        const generatedOutput: AssistantOutput = {
          answer: [
            appendLegalChangeReviewNotice(review.generated.answer, reviewRetrieval),
            "",
            `SaaS API mode: ${review.generated.provider.callMode} ${review.generated.provider.provider}/${review.generated.provider.model}`,
            `Usage: input ${review.generated.usage.inputTokens}, output ${review.generated.usage.outputTokens}, estimated ${review.generated.usage.estimatedCostCents} cents.`,
          ].join("\n"),
          draftSummary: review.generated.suggestedDraftSummary,
          retrieval: reviewRetrieval,
          executionMode: "saas-api",
          runtimeMode: review.generated.provider.callMode === "live" ? "task-review-live-provider" : "task-review-mock-provider",
        };

        setOutput(generatedOutput);
        setSummaryDraft(generatedOutput.draftSummary);
        setSummaryTagsInput(generatedOutput.draftSummary.tags.join(", "));
        setSummaryEditorExpanded(false);
        setClosureAcknowledged(false);
        setPendingTaskReview(review);
        setRecord(null);
        setStatus("공식 법규 검증 경유 SaaS API 검토 의견을 생성했습니다. 검토기록저장을 눌러 최근 기록에 남기세요.");
        return;
      }

      const retrieved = await postJson<RetrieveResponse>("/api/assistant/retrieve", {
        taskId: requestedTaskId,
        question: requestedQuestion,
      });
      if (reviewRequestSeqRef.current !== reviewRequestId) {
        return;
      }
      if (retrieved.taskContext.taskId !== requestedTaskId) {
        throw new Error("Assistant retrieval task mismatch. Please rerun the review for the selected task.");
      }
      setRetrieveResult(retrieved);

      const verifiedRetrieval =
        requestedExecutionMode === "local-codex"
          ? await getVerifiedLocalCodexRetrieval({
              retrieved,
              taskId: requestedTaskId,
              question: requestedQuestion,
              instruction: requestedInstruction,
            })
          : retrieved;
      if (reviewRequestSeqRef.current !== reviewRequestId) {
        return;
      }
      if (requestedExecutionMode === "local-codex") {
        setRetrieveResult(verifiedRetrieval);
      }

      const generated =
        requestedExecutionMode === "local-codex"
          ? await generateLocalCodexReview({
              instruction: requestedInstruction,
              question: requestedQuestion,
              retrieval: verifiedRetrieval,
              bridgeStatus: localCodexPreflight ?? undefined,
            })
          : generateArchitectReview({
              evidence: verifiedRetrieval.evidence,
              evidenceReadinessWarnings: verifiedRetrieval.evidenceReadinessWarnings,
              instruction: requestedInstruction,
              question: requestedQuestion,
              taskContext: verifiedRetrieval.taskContext,
            });
      const retrieveForRecord = generated.retrieval ?? verifiedRetrieval;
      if (retrieveForRecord.taskContext.taskId !== requestedTaskId) {
        throw new Error("Assistant generated retrieval task mismatch. Please rerun the review for the selected task.");
      }
      if (reviewRequestSeqRef.current !== reviewRequestId) {
        return;
      }
      setRetrieveResult(retrieveForRecord);
      setOutput(generated);
      setSummaryDraft(generated.draftSummary);
      setSummaryTagsInput(generated.draftSummary.tags.join(", "));
      setSummaryEditorExpanded(false);
      setClosureAcknowledged(false);
      setRecord(null);
      setStatus("검토 의견을 생성했습니다. 검토기록저장을 눌러 최근 기록에 남기세요.");
    } catch (error) {
      if (reviewRequestSeqRef.current === reviewRequestId) {
        setStatus(errorMessage(error));
      }
    } finally {
      if (reviewRequestSeqRef.current === reviewRequestId) {
        setBusy(false);
      }
    }
  }

  async function saveReviewSession() {
    if (!selectedTask || !output || !retrieveResult) {
      setStatus("저장할 검토 의견이 없습니다.");
      return;
    }

    setReviewSessionSaving(true);
    setStatus("검토기록을 저장하는 중입니다.");
    try {
      const savedSession = await postJson<AssistantReviewSessionItem>("/api/assistant/review-sessions", {
        taskId: retrieveResult.taskContext.taskId,
        question,
        answer: output.answer,
        evidence: retrieveResult.evidence,
        title: `${selectedTaskLabel} 검토`,
        draftSummary: output.draftSummary,
        executionMode: output.executionMode,
        runtimeMode: output.runtimeMode,
        generated: pendingTaskReview?.generated ?? null,
        officialLawVerification: pendingTaskReview?.officialLawVerification ?? null,
        legalApplicability: pendingTaskReview?.legalApplicability ?? null,
        reviewSession: pendingTaskReview?.reviewSession ?? null,
      });
      setRecord(savedSession.savedRecord);
      setRecordHistory((items) => [savedSession, ...items.filter((item) => item.id !== savedSession.id)].slice(0, 12));
      setPendingTaskReview(null);
      setSelectedReviewSession(null);

      if (output.localCodexUsage) {
        setUsageRecordState({ status: "recording", assistantRecordId: savedSession.savedRecord.id });
        try {
          const usageEvent = await recordLocalCodexUsage({
            generated: output,
            savedRecord: savedSession.savedRecord,
            taskId: retrieveResult.taskContext.taskId,
          });
          setUsageRecordState({
            status: "recorded",
            assistantRecordId: savedSession.savedRecord.id,
            eventId: usageEvent.id,
            inputTokens: usageEvent.inputTokens,
            outputTokens: usageEvent.outputTokens,
            usageAvailable: Boolean(output.localCodexUsage.usageAvailable),
          });
        } catch (usageError) {
          setUsageRecordState({
            status: "failed",
            assistantRecordId: savedSession.savedRecord.id,
            message: errorMessage(usageError),
            generated: output,
            savedRecord: savedSession.savedRecord,
            taskId: retrieveResult.taskContext.taskId,
          });
        }
      }

      await refreshAssistantRecords(retrieveResult.taskContext.taskId);
      setStatus(`검토기록저장 완료. 신뢰도 ${savedSession.savedRecord.confidenceScore}%.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setReviewSessionSaving(false);
    }
  }

  async function openReviewSession(session: AssistantReviewSessionItem) {
    setRecordHistoryLoading(true);
    try {
      const detail = await getJson<AssistantReviewSessionDetail>(
        `/api/assistant/review-sessions/${encodeURIComponent(session.id)}`,
      );
      setSelectedReviewSession(detail);
      setRecord(detail.savedRecord);
      setStatus("저장된 검토 세션을 열었습니다. 질문을 수정해 추가 질의를 실행할 수 있습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRecordHistoryLoading(false);
    }
  }

  async function renameReviewSession(session: AssistantReviewSessionItem) {
    const reviewSessionTitle = window.prompt("검토 세션 제목", session.title);
    if (!reviewSessionTitle?.trim()) {
      return;
    }
    setRecordHistoryLoading(true);
    try {
      const renamed = await patchJson<AssistantReviewSessionItem>(
        `/api/assistant/review-sessions/${encodeURIComponent(session.id)}`,
        { title: reviewSessionTitle },
      );
      setRecordHistory((items) => items.map((item) => (item.id === renamed.id ? renamed : item)));
      if (selectedReviewSession?.id === renamed.id) {
        setSelectedReviewSession({ ...selectedReviewSession, title: renamed.title });
      }
      setStatus("검토 세션 제목을 변경했습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRecordHistoryLoading(false);
    }
  }

  async function checkLocalCodexHealth() {
    setHealthLoading(true);
    setLocalCodexHealth(null);

    try {
      const bridgeStatus = await requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000);
      const lawPreflight = bridgeStatus.available ? await checkOfficialLawPreflight() : null;
      const report = buildLocalCodexHealthReport(bridgeStatus, lawPreflight);
      setLocalCodexHealth(report);
      setStatus(report.summary);
    } catch (error) {
      const report = buildLocalCodexMissingBridgeReport(errorMessage(error));
      setLocalCodexHealth(report);
      setStatus(report.summary);
    } finally {
      setHealthLoading(false);
    }
  }

  async function openExtensionSidePanel() {
    if (!selectedTask) {
      setStatus("오른쪽 확장 패널을 열려면 먼저 일일목록에서 task를 선택하세요.");
      return;
    }

    setSidePanelOpening(true);
    dispatchSidePanelContextUpdate("launch");
    try {
      const result = await waitForAssistantSidePanelResponse(sidePanelRequestId);
      setStatus(
        result.taskId === selectedTask.id
          ? "오른쪽 확장 패널을 열었습니다. 현재 SaaS 패널은 그대로 계속 사용할 수 있습니다."
          : "오른쪽 확장 패널을 열었습니다. 선택 task가 다르면 /daily에서 task를 다시 선택하세요.",
      );
    } catch (error) {
      const message = sidePanelOpenErrorMessage(error);
      if (isSidePanelPageRefreshRequiredMessage(message)) {
        const scheduled = scheduleSidePanelPageRefresh();
        setStatus(
          scheduled
            ? `${message} 현재 /daily 탭을 자동 새로고침합니다. 새로고침 뒤 오른쪽 패널을 다시 눌러주세요.`
            : `${message} 자동 새로고침을 이미 시도했습니다. /daily 탭을 직접 새로고침한 뒤 오른쪽 패널을 다시 눌러주세요.`,
        );
      } else {
        setStatus(`${message} 현재 SaaS 패널은 그대로 사용할 수 있습니다.`);
      }
    } finally {
      setSidePanelRequestId(makeSidePanelRequestId());
      setSidePanelOpening(false);
    }
  }

  async function checkOfficialLawPreflight(): Promise<LocalCodexLawPreflight | null> {
    if (!selectedTask || !question.trim()) {
      return null;
    }

    try {
      const review = await postTaskReviewJson({
        taskId: selectedTask.id,
        question,
        instruction,
        mode: "preview",
      });
      const verification = review.officialLawVerification;
      const failed = verification.status === "failed" || review.status === "blocked";
      const failureText = [...verification.failures, ...verification.retry].filter(Boolean).join(" / ");

      if (failed) {
        return {
          status: "failed",
          detail: failureText || review.reason,
        };
      }

      return {
        status: verification.status,
        detail:
          failureText ||
          (verification.status === "verified"
            ? "서버 중앙 verified legal evidence 검증이 통과했습니다."
            : "이 질문과 근거는 중앙 verified legal evidence 검증이 필요하지 않습니다."),
      };
    } catch (error) {
      return {
        status: "failed",
        detail: errorMessage(error),
      };
    }
  }

  async function retryLocalCodexUsageRecord() {
    if (usageRecordState?.status !== "failed") {
      return;
    }

    const failedState = usageRecordState;
    setUsageRecordState({ status: "recording", assistantRecordId: failedState.assistantRecordId });

    try {
      const usageEvent = await recordLocalCodexUsage({
        generated: failedState.generated,
        savedRecord: failedState.savedRecord,
        taskId: failedState.taskId,
      });
      setUsageRecordState({
        status: "recorded",
        assistantRecordId: failedState.assistantRecordId,
        eventId: usageEvent.id,
        inputTokens: usageEvent.inputTokens,
        outputTokens: usageEvent.outputTokens,
        usageAvailable: Boolean(failedState.generated.localCodexUsage?.usageAvailable),
      });
      setStatus("로컬 Codex 사용량 기록을 저장했습니다.");
    } catch (error) {
      setUsageRecordState({
        ...failedState,
        message: errorMessage(error),
      });
      setStatus(errorMessage(error));
    }
  }

  async function refreshAssistantRecords(taskId: string, reviewRequestId?: number) {
    if (reviewRequestId !== undefined && reviewRequestSeqRef.current !== reviewRequestId) {
      return;
    }
    setRecordHistoryLoading(true);
    try {
      const items = await getJson<AssistantReviewSessionItem[]>(`/api/assistant/review-sessions?taskId=${encodeURIComponent(taskId)}`);
      if (reviewRequestId !== undefined && reviewRequestSeqRef.current !== reviewRequestId) {
        return;
      }
      setRecordHistory(items);
    } catch (error) {
      if (reviewRequestId === undefined || reviewRequestSeqRef.current === reviewRequestId) {
        setStatus(errorMessage(error));
      }
    } finally {
      if (reviewRequestId === undefined || reviewRequestSeqRef.current === reviewRequestId) {
        setRecordHistoryLoading(false);
      }
    }
  }

  function updateSummaryDraft(field: keyof DraftSummary, value: string) {
    setSummaryDraft((current) => (current ? { ...current, [field]: value } : current));
    setClosureAcknowledged(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
  }

  async function saveSummary(statusValue: SummarySaveStatus) {
    if (!selectedTask || !record || !summaryDraft) {
      return;
    }

    const blockers = closureGate.filter((item) => item.required && item.status !== "pass");
    if (statusValue === "approved" && blockers.length > 0) {
      setStatus(`승인 전 확인 필요: ${blockers.map((item) => item.label).join(", ")}.`);
      return;
    }
    if (statusValue === "approved" && !closureAcknowledged) {
      setStatus("작업 기록 승인 전에 확인 체크를 완료하세요.");
      return;
    }

    let savedSummaryStatus: SummarySaveStatus | null = null;
    setBusy(true);
    try {
      await postJson("/api/assistant/summaries", {
        taskId: selectedTask.id,
        recordId: record.id,
        ...summaryDraft,
        tags: summaryTags,
        status: statusValue,
      });
      await refreshAssistantRecords(selectedTask.id);
      savedSummaryStatus = statusValue;
      setSummarySaveState(statusValue);
      setTaskUpdateApplied(false);
      setFollowUpTaskCreated(false);
      setProposalStatus("Task 업데이트와 후속 task 제안이 준비되었습니다. 아직 자동 반영된 항목은 없습니다.");
      setStatus("종료 검토 후 작업 요약을 승인했습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
      if (savedSummaryStatus) {
        setStatus(
          "종료 검토 후 작업 요약을 승인했습니다.",
        );
      }
    }
  }

  async function applyTaskUpdateProposal() {
    if (!selectedTask || !taskUpdateProposal || !record) {
      return;
    }

    setBusy(true);
    setProposalStatus("");
    try {
      const patchBody: Record<string, unknown> = {
        version: selectedTask.version,
        decision: taskUpdateProposal.nextDecision,
      };

      if (taskUpdateProposal.statusChanged) {
        patchBody.status = taskUpdateProposal.nextStatus;
      }

      await patchJson<TaskRecord>(`/api/tasks/${encodeURIComponent(selectedTask.id)}`, patchBody);
      await saveAssistantActionAudit({
        action: "task_update_applied",
        sourceTaskId: selectedTask.id,
        targetTaskId: selectedTask.id,
        assistantRecordId: record.id,
        summary: summaryDraft ? buildActionAuditSummary(summaryDraft, summaryTags) : null,
        statusFrom: selectedTask.status,
        statusTo: taskUpdateProposal.nextStatus,
        decisionMarker: `[Assistant approved summary ${record.id}]`,
      });
      setTaskUpdateApplied(true);
      setProposalStatus(
        taskUpdateProposal.statusChanged
          ? `Task decision을 업데이트하고 상태를 ${taskUpdateProposal.nextStatus}(으)로 변경했습니다.`
          : "승인된 assistant 요약으로 task decision을 업데이트했습니다.",
      );
      setStatus("승인된 assistant 요약을 task 기록에 반영했습니다.");
    } catch (error) {
      const message = errorMessage(error);
      setProposalStatus(message);
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function createFollowUpTaskProposal() {
    if (!selectedTask || !followUpTaskProposal || !record) {
      return;
    }

    setBusy(true);
    setProposalStatus("");
    try {
      const created = await postJson<TaskRecord>("/api/tasks", followUpTaskProposal.requestBody);
      await saveAssistantActionAudit({
        action: "follow_up_task_created",
        sourceTaskId: selectedTask.id,
        targetTaskId: created.id,
        createdTaskId: created.id,
        assistantRecordId: record.id,
        summary: summaryDraft ? buildActionAuditSummary(summaryDraft, summaryTags) : null,
        statusTo: created.status,
        decisionMarker: `[Assistant approved summary ${record.id}]`,
      });
      const createdLabel = formatTaskDisplayId(created);
      setFollowUpTaskCreated(true);
      setProposalStatus(`후속 task ${createdLabel}를 생성했습니다.`);
      setStatus(`승인된 assistant 요약에서 후속 task ${createdLabel}를 생성했습니다.`);
    } catch (error) {
      const message = errorMessage(error);
      setProposalStatus(message);
      setStatus(message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSelectedFileAnalysis() {
    if (!selectedTask || !selectedFileId) {
      setStatus("분석 근거를 저장할 첨부 파일을 먼저 선택하세요.");
      return;
    }

    if (!analysisText.trim() && !analysisSummary.trim()) {
      setStatus("파일에서 확인한 텍스트나 요약을 입력하세요.");
      return;
    }

    setBusy(true);
    try {
      const requestBody = {
        sourceType: analysisSourceType,
        extractedText: analysisText,
        summary: analysisSummary,
        provider: analysisSourceType === "manual_text" ? undefined : "client_supplied",
        providerStatus: analysisSourceType === "manual_text" ? undefined : "client_supplied",
        region: analysisSourceType === "image_region" ? buildAnalysisRegionPayload() : undefined,
        verificationState: "unverified",
      };
      const saved = await postJson<{ file: AssistantFile }>(
        `/api/files/${encodeURIComponent(selectedFileId)}/analysis`,
        analysisSourceType === "image_region" && analysisCropDataUrl
          ? {
              ...requestBody,
              mode: "ocr_extract",
              sourceImageDataUrl: analysisCropDataUrl,
              sourceUrl: analysisCropSourceUrl,
              sourceTitle: analysisCropSourceTitle,
              capturedAt: analysisCropCapturedAt,
            }
          : requestBody,
      );
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      setAnalysisText("");
      setAnalysisSummary("");
      clearAnalysisCrop();
      resetGeneratedOutput();
      setStatus("파일 분석 근거를 저장했습니다. 다음 근거 조회부터 assistant 의견에 반영됩니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function autoExtractSelectedFileAnalysis() {
    if (!selectedTask || !selectedFileId) {
      setStatus("자동 추출할 첨부 파일을 먼저 선택하세요.");
      return;
    }

    setBusy(true);
    try {
      const saved = await postJson<{ file: AssistantFile }>(`/api/files/${encodeURIComponent(selectedFileId)}/analysis`, {
        mode: "auto_extract",
      });
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      setAnalysisText("");
      setAnalysisSummary("");
      resetGeneratedOutput();
      setStatus("파일 텍스트를 자동 추출해 assistant 근거로 저장했습니다. 다음 근거 조회부터 반영됩니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function ocrExtractSelectedFileAnalysis() {
    if (!selectedTask || !selectedFileId) {
      setStatus("OCR 추출 전에 첨부 이미지 또는 스캔 PDF를 선택하세요.");
      return;
    }

    setBusy(true);
    try {
      const saved = await postJson<{ file: AssistantFile }>(`/api/files/${encodeURIComponent(selectedFileId)}/analysis`, {
        mode: "ocr_extract",
        sourceType: analysisSourceType === "image_region" ? "image_region" : "ocr_text",
        region: analysisSourceType === "image_region" ? buildAnalysisRegionPayload() : undefined,
        sourceImageDataUrl: analysisSourceType === "image_region" ? analysisCropDataUrl : undefined,
        sourceUrl: analysisSourceType === "image_region" ? analysisCropSourceUrl : undefined,
        sourceTitle: analysisSourceType === "image_region" ? analysisCropSourceTitle : undefined,
        capturedAt: analysisSourceType === "image_region" ? analysisCropCapturedAt : undefined,
      });
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      setAnalysisText("");
      setAnalysisSummary("");
      clearAnalysisCrop();
      resetGeneratedOutput();
      setStatus("OCR 결과를 assistant 파일 근거로 저장했습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSelectedFileAnalysisArtifact(fileId: string, analysisId: string) {
    if (typeof window !== "undefined" && !window.confirm("저장된 크롭 artifact를 제거할까요? 분석 텍스트는 유지됩니다.")) {
      return;
    }

    setBusy(true);
    try {
      const saved = await deleteJson<{ file: AssistantFile; analysisId: string }>(
        `/api/files/${encodeURIComponent(fileId)}/analysis/${encodeURIComponent(analysisId)}/artifact`,
      );
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      resetGeneratedOutput();
      setStatus("저장된 크롭 artifact를 제거했습니다. 분석 텍스트는 파일 근거로 계속 사용할 수 있습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function captureBrowserImageRegion() {
    if (!selectedTask || !selectedFileId) {
      setStatus("이미지 영역을 캡처하기 전에 첨부 파일을 선택하세요.");
      return;
    }

    setBusy(true);
    try {
      const capture = await requestLocalCodexBridge<BrowserRegionCapture>("select-region", undefined, 60000);
      setAnalysisSourceType("image_region");
      setAnalysisRegionX(formatRegionNumber(capture.region.x));
      setAnalysisRegionY(formatRegionNumber(capture.region.y));
      setAnalysisRegionWidth(formatRegionNumber(capture.region.width));
      setAnalysisRegionHeight(formatRegionNumber(capture.region.height));
      setAnalysisCropDataUrl(capture.cropDataUrl || "");
      setAnalysisCropSourceUrl(capture.url);
      setAnalysisCropSourceTitle(capture.title);
      setAnalysisCropCapturedAt(capture.capturedAt);
      setAnalysisSummary((current) =>
        current.trim()
          ? current
          : [
              `브라우저 영역 캡처: ${capture.title || "활성 탭"}`,
              `출처: ${capture.url}`,
              `뷰포트: ${capture.viewport.width}x${capture.viewport.height}; 영역: x ${formatRegionNumber(capture.region.x)}%, y ${formatRegionNumber(capture.region.y)}%, w ${formatRegionNumber(capture.region.width)}%, h ${formatRegionNumber(capture.region.height)}%.`,
              `캡처 시각: ${capture.capturedAt}`,
            ].join("\n"),
      );
      resetGeneratedOutput();
      setStatus("브라우저 이미지 영역을 캡처했습니다. OCR 텍스트 또는 요약을 확인한 뒤 파일 근거로 저장하세요.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveExternalEvidence() {
    if (!selectedTask) {
      setStatus("외부 근거를 저장할 task를 먼저 선택하세요.");
      return;
    }

    if (!externalAllowed) {
      setStatus("외부 웹/스킬 근거 사용을 먼저 허용하세요.");
      return;
    }

    if (!externalTitle.trim() || !externalExcerpt.trim()) {
      setStatus("외부 근거의 제목과 핵심 내용을 입력하세요.");
      return;
    }

    if (!externalUrl.trim() && !externalToolName.trim()) {
      setStatus("출처 URL 또는 스킬/도구 이름 중 하나는 입력해야 합니다.");
      return;
    }

    setBusy(true);
    try {
      const saved = await postJson<SaveExternalEvidenceResponse>("/api/assistant/external-evidence", {
        taskId: selectedTask.id,
        sourceType: externalSourceType,
        title: externalTitle,
        excerpt: externalExcerpt,
        sourceUrl: externalUrl,
        toolName: externalToolName,
        permissionState: "user_approved",
        capturedAt: new Date().toISOString(),
      });
      setExternalEvidence((items) => [saved.externalEvidence, ...items]);
      setExternalTitle("");
      setExternalUrl("");
      setExternalToolName("");
      setExternalExcerpt("");
      resetGeneratedOutput();
      setStatus("사용자 승인 외부 근거를 저장했습니다. 다음 근거 조회부터 web_or_skill로 포함됩니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function resetGeneratedOutput() {
    setRetrieveResult(null);
    setEvidenceExpanded(false);
    setOutput(null);
    setRecord(null);
    setSummaryDraft(null);
    setSummaryTagsInput("");
    setSummaryEditorExpanded(false);
    setClosureAcknowledged(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
    setPendingTaskReview(null);
    setSelectedReviewSession(null);
  }

  function clearAnalysisCrop() {
    setAnalysisCropDataUrl("");
    setAnalysisCropSourceUrl("");
    setAnalysisCropSourceTitle("");
    setAnalysisCropCapturedAt("");
  }

  function buildAnalysisRegionPayload() {
    return {
      pageNumber: parseOptionalNumber(analysisPageNumber),
      x: parseOptionalNumber(analysisRegionX),
      y: parseOptionalNumber(analysisRegionY),
      width: parseOptionalNumber(analysisRegionWidth),
      height: parseOptionalNumber(analysisRegionHeight),
      unit: "percent",
    };
  }

  return (
    <div className="task-assistant" data-task-portal-interaction="true">
      {!isOpen ? (
        <button className="task-assistant__launcher" onClick={() => setIsOpen(true)} type="button">
          <span>AI 검토</span>
          <small>{selectedTask ? selectedTaskLabel : "task 선택 필요"}</small>
        </button>
      ) : (
        <aside aria-label="Task assistant" className="task-assistant__panel">
          <header className="task-assistant__header">
            <div>
              <p>건축 Task Assistant</p>
              <h3>{selectedTask ? selectedTaskLabel : "task 미선택"}</h3>
            </div>
            <div className="task-assistant__header-actions">
              {selectedTask ? (
                <button
                  className="task-assistant__side-panel-button"
                  data-architect-side-panel-launch="true"
                  data-architect-side-panel-project-id={selectedTask.projectId}
                  data-architect-side-panel-question={question}
                  data-architect-side-panel-request-id={sidePanelRequestId}
                  data-architect-side-panel-task-id={selectedTask.id}
                  data-architect-side-panel-title={selectedTask.issueTitle || selectedTaskLabel}
                  disabled={sidePanelOpening}
                  onClick={() => void openExtensionSidePanel()}
                  type="button"
                >
                  {sidePanelOpening ? "여는 중" : "오른쪽 패널"}
                </button>
              ) : null}
              <button aria-label="assistant 닫기" className="task-assistant__close" onClick={() => setIsOpen(false)} type="button">
                x
              </button>
            </div>
          </header>

          <div className="task-assistant__body">
            <section className="task-assistant__flow" aria-label="AI 검토 진행 단계">
              {reviewFlowSteps.map((step, index) => (
                <span
                  className={
                    step.complete
                      ? "task-assistant__flow-step task-assistant__flow-step--complete"
                      : step.active
                        ? "task-assistant__flow-step task-assistant__flow-step--active"
                        : "task-assistant__flow-step"
                  }
                  key={step.label}
                >
                  <b>{index + 1}</b>
                  {step.label}
                </span>
              ))}
            </section>
            {selectedTask ? (
              <section className="task-assistant__task">
                <strong>{selectedTask.issueTitle || "제목 없음"}</strong>
                <p>{selectedTask.issueDetailNote || "상세 설명이 없습니다."}</p>
              </section>
            ) : (
              <section className="task-assistant__empty">
                <strong>일일목록에서 task를 클릭하세요.</strong>
                <p>선택한 task의 제목, 설명, 프로젝트 맥락을 기준으로 응답합니다.</p>
              </section>
            )}

            <section className="task-assistant__mode-switch" aria-label="AI 검토 표시 모드">
              <button
                aria-pressed={assistantPanelMode === "basic"}
                className={
                  assistantPanelMode === "basic"
                    ? "task-assistant__mode-button task-assistant__mode-button--active"
                    : "task-assistant__mode-button"
                }
                onClick={() => setAssistantPanelMode("basic")}
                type="button"
              >
                기본 모드
              </button>
              <button
                aria-pressed={assistantPanelMode === "advanced"}
                className={
                  assistantPanelMode === "advanced"
                    ? "task-assistant__mode-button task-assistant__mode-button--advanced task-assistant__mode-button--active"
                    : "task-assistant__mode-button task-assistant__mode-button--advanced"
                }
                onClick={() => setAssistantPanelMode("advanced")}
                type="button"
              >
                고급 모드
              </button>
            </section>

            <label className="task-assistant__field">
              <span>질문</span>
              <textarea disabled={!selectedTask || busy} onChange={(event) => setQuestion(event.target.value)} rows={3} value={question} />
            </label>

            {assistantPanelMode === "advanced" ? (
              <div className="task-assistant__advanced" aria-label="고급 모드">
            {selectedTask ? (
              <section className="task-assistant__section">
                <div
                  aria-label="최근 검토 기록: 검토기록저장을 누른 항목만 최근 검토 기록에 표시됩니다."
                  className="task-assistant__section-header"
                  data-hint="검토기록저장을 누른 항목만 최근 검토 기록에 표시됩니다."
                  tabIndex={0}
                >
                  <h4>최근 검토 기록</h4>
                  <button
                    aria-expanded={historyExpanded}
                    className="task-assistant__subtle-button"
                    onClick={() => setHistoryExpanded((current) => !current)}
                    type="button"
                  >
                    {historyExpanded ? "접기" : recordHistoryLoading ? "불러오는 중" : `보기 ${recordHistory.length}`}
                  </button>
                </div>
                {!historyExpanded ? (
                  null
                ) : recordHistory.length ? (
                  <>
                    <div className="task-assistant__history-list">
                      {recordHistory.slice(0, 6).map((item) => (
                        <article className="task-assistant__history-item task-assistant__history-item--saas" key={item.id}>
                          <header>
                            <button className="task-assistant__link-button" onClick={() => void openReviewSession(item)} type="button">
                              {item.title}
                            </button>
                            <span>{item.savedRecord.confidenceScore}%</span>
                          </header>
                          <small>
                            {formatRecordDate(item.savedAt)} / {item.verdict ?? "판정 없음"} / {item.conclusionMayChange ? "추가확인필요 후보" : "후보 영향 낮음"}
                          </small>
                          <p>{item.answerPreview}</p>
                          <div className="task-assistant__history-tags">
                            <button className="task-assistant__subtle-button" onClick={() => void openReviewSession(item)} type="button">
                              세션 열기
                            </button>
                            <button className="task-assistant__subtle-button" onClick={() => void renameReviewSession(item)} type="button">
                              이름 변경
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {selectedReviewSession ? (
                      <article className="task-assistant__evidence">
                        <strong>{selectedReviewSession.title}</strong>
                        <small>
                          저장 근거 {selectedReviewSession.savedEvidenceSnapshot.length} / 최신 근거 {selectedReviewSession.latestEvidenceSnapshot.length}
                        </small>
                        <p>질문: {selectedReviewSession.question}</p>
                        <p>{formatVisibleReviewAnswer(selectedReviewSession.answer)}</p>
                      </article>
                    ) : null}
                  </>
                ) : (
                  <p className="task-assistant__hint">
                    {recordHistoryLoading ? "assistant 기록을 불러오는 중입니다." : "아직 이 task에 저장된 assistant 기록이 없습니다."}
                  </p>
                )}
              </section>
            ) : null}

            {selectedTask ? (
              <section className="task-assistant__section">
                <div
                  aria-label="파일 근거: 파일 분석, OCR, 이미지 영역 근거는 필요할 때만 열어 추가합니다."
                  className="task-assistant__section-header"
                  data-hint="파일 분석, OCR, 이미지 영역 근거는 필요할 때만 열어 추가합니다."
                  tabIndex={0}
                >
                  <h4>파일 근거</h4>
                  <button
                    aria-expanded={filesExpanded}
                    className="task-assistant__subtle-button"
                    onClick={() => setFilesExpanded((current) => !current)}
                    type="button"
                  >
                    {filesExpanded ? "접기" : filesLoading ? "불러오는 중" : `보기 ${taskFiles.length}`}
                  </button>
                </div>
                {filesExpanded ? (
                  <>
                <label className="task-assistant__field task-assistant__field--plain">
                  <span>첨부 파일</span>
                  <select
                    disabled={busy || filesLoading || taskFiles.length === 0}
                    onChange={(event) => setSelectedFileId(event.target.value)}
                    value={selectedFileId}
                  >
                    {taskFiles.length === 0 ? <option value="">첨부 파일 없음</option> : null}
                    {taskFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.originalName} {file.metadata?.analysis?.length ? `(${file.metadata.analysis.length})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="task-assistant__field task-assistant__field--plain">
                  <span>분석 방식</span>
                  <select
                    disabled={busy || !selectedFileId}
                    onChange={(event) => {
                      const nextSourceType = event.target.value as FileAnalysisSourceMode;
                      setAnalysisSourceType(nextSourceType);
                      if (nextSourceType !== "image_region") {
                        clearAnalysisCrop();
                      }
                    }}
                    value={analysisSourceType}
                  >
                    <option value="manual_text">직접 입력 텍스트</option>
                    <option value="ocr_text">OCR 텍스트</option>
                    <option value="image_region">선택한 이미지 영역</option>
                  </select>
                </label>
                {selectedFileAnalyses.length ? (
                  <div className="task-assistant__analysis-list" aria-label="저장된 파일 분석 근거">
                    {selectedFileAnalyses.slice(0, 4).map((analysis) => {
                      const artifactPreviewUrl =
                        selectedAssistantFile && analysis.artifact
                          ? buildAnalysisArtifactUrl(selectedAssistantFile.id, analysis.id, "inline")
                          : "";
                      const artifactDownloadUrl =
                        selectedAssistantFile && analysis.artifact
                          ? buildAnalysisArtifactUrl(selectedAssistantFile.id, analysis.id, "attachment")
                          : "";

                      return (
                        <article className="task-assistant__analysis-card" key={analysis.id}>
                          <header>
                            <strong>{fileAnalysisSourceLabel(analysis.sourceType)}</strong>
                            <span>{fileAnalysisVerificationLabel(analysis.verificationState)}</span>
                          </header>
                          {analysis.summary ? <p>{analysis.summary}</p> : null}
                          <small>
                            {fileAnalysisProviderStatusLabel(analysis.providerStatus)} / 신뢰도 {formatConfidenceWeight(analysis.confidenceWeight)}
                          </small>
                          {analysis.region ? <small>{formatAnalysisRegion(analysis.region)}</small> : null}
                          {analysis.artifact ? (
                            <div className="task-assistant__artifact-preview">
                              <Image
                                alt={`${fileAnalysisSourceLabel(analysis.sourceType)} 크롭 미리보기`}
                                height={180}
                                src={artifactPreviewUrl}
                                unoptimized
                                width={320}
                              />
                              <div className="task-assistant__artifact-actions">
                                <a href={artifactPreviewUrl} rel="noreferrer" target="_blank">
                                  크롭 미리보기
                                </a>
                                <a download href={artifactDownloadUrl}>
                                  크롭 다운로드
                                </a>
                                <button
                                  aria-label="저장된 크롭 artifact 제거"
                                  disabled={busy || !selectedAssistantFile}
                                  onClick={() => {
                                    if (selectedAssistantFile) {
                                      void deleteSelectedFileAnalysisArtifact(selectedAssistantFile.id, analysis.id);
                                    }
                                  }}
                                  type="button"
                                >
                                  크롭 제거
                                </button>
                              </div>
                              <small>
                                {analysis.artifact.mimeType} / {formatBytes(analysis.artifact.sizeBytes)}
                                {analysis.artifact.capturedAt ? ` / ${formatRecordDate(analysis.artifact.capturedAt)}` : ""}
                              </small>
                              {analysis.artifact.sourceUrl ? (
                                <a href={analysis.artifact.sourceUrl} rel="noreferrer" target="_blank">
                                  출처 페이지
                                </a>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p className="task-assistant__hint">저장된 파일 근거가 있으면 최근 분석과 crop artifact가 여기에 표시됩니다.</p>
                )}
                {analysisSourceType === "image_region" ? (
                  <>
                    <button
                      className="secondary-button"
                      disabled={busy || !selectedFileId}
                      onClick={() => void captureBrowserImageRegion()}
                      type="button"
                    >
                      브라우저 영역 선택
                    </button>
                    <div className="task-assistant__grid task-assistant__grid--compact">
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>페이지</span>
                      <input disabled={busy || !selectedFileId} onChange={(event) => setAnalysisPageNumber(event.target.value)} placeholder="1" value={analysisPageNumber} />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>X%</span>
                      <input disabled={busy || !selectedFileId} onChange={(event) => setAnalysisRegionX(event.target.value)} placeholder="0" value={analysisRegionX} />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>Y%</span>
                      <input disabled={busy || !selectedFileId} onChange={(event) => setAnalysisRegionY(event.target.value)} placeholder="0" value={analysisRegionY} />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>W%</span>
                      <input disabled={busy || !selectedFileId} onChange={(event) => setAnalysisRegionWidth(event.target.value)} placeholder="100" value={analysisRegionWidth} />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>H%</span>
                      <input disabled={busy || !selectedFileId} onChange={(event) => setAnalysisRegionHeight(event.target.value)} placeholder="100" value={analysisRegionHeight} />
                    </label>
                    </div>
                    {analysisCropDataUrl ? (
                      <div className="task-assistant__artifact-preview task-assistant__artifact-preview--pending" aria-label="Pending crop preview">
                        <Image
                          alt="저장 전 선택 영역 크롭 미리보기"
                          height={180}
                          src={analysisCropDataUrl}
                          unoptimized
                          width={320}
                        />
                        <small>
                          저장 전 크롭 / {analysisCropSourceTitle || "활성 탭"}
                          {analysisCropCapturedAt ? ` / ${formatRecordDate(analysisCropCapturedAt)}` : ""}
                        </small>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <label className="task-assistant__field task-assistant__field--plain">
                  <span>확인 내용</span>
                  <textarea
                    disabled={busy || !selectedFileId}
                    onChange={(event) => setAnalysisText(event.target.value)}
                    placeholder="도면 메모, PDF 본문, 이미지 OCR에서 확인한 내용을 붙여 넣으세요."
                    rows={3}
                    value={analysisText}
                  />
                </label>
                <label className="task-assistant__field task-assistant__field--plain">
                  <span>요약</span>
                  <textarea
                    disabled={busy || !selectedFileId}
                    onChange={(event) => setAnalysisSummary(event.target.value)}
                    placeholder="assistant 근거 목록에 표시할 짧은 요약"
                    rows={2}
                    value={analysisSummary}
                  />
                </label>
                <button
                  className="secondary-button"
                  disabled={busy || !selectedFileId}
                  onClick={() => void autoExtractSelectedFileAnalysis()}
                  type="button"
                >
                  자동 텍스트 추출
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !selectedFileId}
                  onClick={() => void ocrExtractSelectedFileAnalysis()}
                  type="button"
                >
                  OCR 결과 추출
                </button>
                <button
                  className="secondary-button"
                  disabled={busy || !selectedFileId || (!analysisText.trim() && !analysisSummary.trim())}
                  onClick={() => void saveSelectedFileAnalysis()}
                  type="button"
                >
                  파일 근거 저장
                </button>
                  </>
                ) : null}
              </section>
            ) : null}

            {selectedTask ? (
              <section className="task-assistant__section">
                <div
                  aria-label="외부 웹/스킬 근거: 일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다."
                  className="task-assistant__section-header"
                  data-hint="일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다."
                  tabIndex={0}
                >
                  <h4>외부 웹/스킬 근거</h4>
                  <button
                    aria-expanded={externalExpanded}
                    className="task-assistant__subtle-button"
                    onClick={() => setExternalExpanded((current) => !current)}
                    type="button"
                  >
                    {externalExpanded ? "접기" : `추가 ${externalLoading ? "" : externalEvidence.length}`}
                  </button>
                </div>
                {!externalExpanded ? (
                  null
                ) : (
                  <div className="task-assistant__external-body">
                    <label className="task-assistant__toggle">
                      <input
                        checked={externalAllowed}
                        disabled={busy}
                        onChange={(event) => setExternalAllowed(event.target.checked)}
                        type="checkbox"
                      />
                      <span>사용자 승인 근거로 저장</span>
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>출처 유형</span>
                      <select
                        disabled={busy || !externalAllowed}
                        onChange={(event) => setExternalSourceType(event.target.value as ExternalEvidenceSourceType)}
                        value={externalSourceType}
                      >
                        {externalSourceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>제목</span>
                      <input
                        disabled={busy || !externalAllowed}
                        onChange={(event) => setExternalTitle(event.target.value)}
                        placeholder="예: 방화문 제조사 시방서"
                        value={externalTitle}
                      />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>출처 URL</span>
                      <input
                        disabled={busy || !externalAllowed}
                        onChange={(event) => setExternalUrl(event.target.value)}
                        placeholder="https://..."
                        value={externalUrl}
                      />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>스킬/도구 이름</span>
                      <input
                        disabled={busy || !externalAllowed}
                        onChange={(event) => setExternalToolName(event.target.value)}
                        placeholder="예: browser-use, 제조사 검색"
                        value={externalToolName}
                      />
                    </label>
                    <label className="task-assistant__field task-assistant__field--plain">
                      <span>핵심 내용</span>
                      <textarea
                        disabled={busy || !externalAllowed}
                        onChange={(event) => setExternalExcerpt(event.target.value)}
                        placeholder="assistant가 참고할 확인 문장과 제한 사항을 적으세요."
                        rows={3}
                        value={externalExcerpt}
                      />
                    </label>
                    <button
                      className="secondary-button"
                      disabled={busy || !externalAllowed || !externalTitle.trim() || !externalExcerpt.trim()}
                      onClick={() => void saveExternalEvidence()}
                      type="button"
                    >
                      외부 근거 저장
                    </button>
                  </div>
                )}
                {externalExpanded && externalEvidence.length ? (
                  <div className="task-assistant__evidence-list">
                    {externalEvidence.slice(0, 3).map((item) => (
                      <article className="task-assistant__evidence" key={item.id}>
                        <strong>{item.title}</strong>
                        {item.sourceUrl ? (
                          <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                            출처 열기
                          </a>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            <label className="task-assistant__field">
              <span>실행 모드</span>
              <select
                disabled={!selectedTask || busy}
                onChange={(event) => setExecutionMode(event.target.value as AssistantExecutionMode)}
                value={executionMode}
              >
                <option value="local-codex">로컬 Codex 로그인 (기본)</option>
                <option value="saas-api">SaaS API (관리형)</option>
                <option value="mock">Mock/개발용 검토</option>
              </select>
            </label>
            {executionMode === "saas-api" ? (
              <section className="task-assistant__section">
                <div
                  aria-label={
                    assistantPolicy?.enabled
                      ? `SaaS API 모드: ${assistantPolicy.provider} / ${assistantPolicy.model}`
                      : "SaaS API 모드: 관리자 정책이 꺼져 있으면 생성 요청은 감사 로그와 사용량 차단 기록만 남깁니다."
                  }
                  className="task-assistant__section-header"
                  data-hint={
                    assistantPolicy?.enabled
                      ? `${assistantPolicy.provider} / ${assistantPolicy.model}`
                      : "관리자 정책이 꺼져 있으면 생성 요청은 감사 로그와 사용량 차단 기록만 남깁니다."
                  }
                  tabIndex={0}
                >
                  <h4>SaaS API 모드</h4>
                  <span>{assistantPolicy?.enabled ? "사용 중" : "꺼짐"}</span>
                </div>
              </section>
            ) : null}
            {executionMode === "local-codex" ? (
              <section className="task-assistant__section">
                <div
                  aria-label="로컬 Codex 로그인: 로컬 연결 세부 상태는 필요할 때만 펼쳐 확인합니다."
                  className="task-assistant__section-header"
                  data-hint="로컬 연결 세부 상태는 필요할 때만 펼쳐 확인합니다."
                  tabIndex={0}
                >
                  <h4>로컬 Codex 로그인</h4>
                  <button
                    aria-expanded={diagnosticsExpanded}
                    className="task-assistant__subtle-button"
                    onClick={() => setDiagnosticsExpanded((current) => !current)}
                    type="button"
                  >
                    {diagnosticsExpanded ? "접기" : "상태 확인"}
                  </button>
                </div>
                {diagnosticsExpanded ? (
                  <>
                <div className="task-assistant__health-actions">
                  <button
                    className="secondary-button"
                    disabled={healthLoading || busy}
                    onClick={() => void checkLocalCodexHealth()}
                    type="button"
                  >
                    {healthLoading ? "확인 중..." : "연결 상태 확인"}
                  </button>
                  {localCodexHealth ? <span>{localCodexHealth.checkedAt}</span> : null}
                </div>
                {localCodexHealth ? (
                  <div className="task-assistant__health-list">
                    {localCodexHealth.steps.map((step) => (
                      <article className="task-assistant__health-step" key={step.id}>
                        <strong>{step.label}</strong>
                        <span className={`task-assistant__health-badge task-assistant__health-badge--${step.status}`}>
                          {closureGateStatusLabel(step.status)}
                        </span>
                        <p>{step.detail}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
                {localCodexHealth ? (
                  <p className={`task-assistant__diagnostic task-assistant__diagnostic--${diagnosticTone(localCodexHealth)}`}>
                    {localCodexDiagnostic(localCodexHealth)}
                  </p>
                ) : null}
                {showLocalCodexConnectionHelp ? (
                  <p className="task-assistant__hint">
                    사용자 PC의 Codex CLI 로그인 상태로 응답을 생성하며, SaaS는 Codex/OpenAI 인증 정보를 저장하지 않습니다.
                    Chrome extension native host가 등록되어 있어야 합니다.
                  </p>
                ) : null}
                  </>
                ) : (
                  null
                )}
              </section>
            ) : null}
            <section className="task-assistant__section">
              <div
                aria-label="기본 검토지침: 답변 기준은 서비스 기본 검토지침을 사용하며, 사용자는 질문만 조정합니다."
                className="task-assistant__section-header"
                data-hint="답변 기준은 서비스 기본 검토지침을 사용하며, 사용자는 질문만 조정합니다."
                tabIndex={0}
              >
                <h4>기본 검토지침</h4>
                <span>서비스 고정</span>
              </div>
            </section>
              </div>
            ) : null}

            <div className="task-assistant__actions">
              <button className="primary-button" disabled={!selectedTask || busy} onClick={() => void runAssistantReview()} type="button">
                {busy ? "검토 중" : "근거 조회 + 의견 생성"}
              </button>
              <button className="secondary-button" disabled={!canSaveReviewSession} onClick={() => void saveReviewSession()} type="button">
                {reviewSessionSaving ? "저장 중" : "검토기록저장"}
              </button>
              <button className="secondary-button" disabled={!canApproveSummary} onClick={() => void saveSummary("approved")} type="button">
                작업 기록 승인
              </button>
            </div>
            <p className="task-assistant__hint">{reviewActionHint}</p>

            {retrieveResult ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>근거</h4>
                  <button
                    aria-expanded={evidenceExpanded}
                    className="task-assistant__subtle-button"
                    onClick={() => setEvidenceExpanded((current) => !current)}
                    type="button"
                  >
                    {evidenceExpanded ? "접기" : `보기 ${retrieveResult.evidence.length}`}
                  </button>
                </div>
                {evidenceExpanded ? (
                  <>
                    <div className="task-assistant__missing-evidence" role="status">
                      <strong>법적 근거</strong>
                      <p>{(retrieveResult.legalEvidence ?? retrieveResult.evidence.filter((item) => item.legal)).length}개</p>
                    </div>
                    <div className="task-assistant__missing-evidence" role="status">
                      <strong>프로젝트 업로드 자료 반영</strong>
                      <p>{retrieveResult.projectContextChunks?.length ? retrieveResult.projectContextChunks.map((chunk) => chunk.sourceDocumentTitle).join(", ") : "반영된 chunk 없음"}</p>
                    </div>
                    <div className="task-assistant__missing-evidence" role="status">
                      <strong>프로젝트 업로드 자료 검토 상태</strong>
                      <p>{formatProjectContextTraceStatus(retrieveResult.projectContextTrace)}</p>
                    </div>
                    {retrieveResult.unavailableEvidenceKinds.length ? (
                      <div className="task-assistant__missing-evidence" role="status">
                        <strong>사용할 수 없는 근거</strong>
                        <p>{retrieveResult.unavailableEvidenceKinds.map(formatUnavailableEvidenceKind).join(", ")}</p>
                      </div>
                    ) : null}
                    {retrieveResult.evidenceReadinessWarnings?.length ? (
                      <div className="task-assistant__missing-evidence" role="status">
                        <strong>Evidence readiness</strong>
                        <p>{retrieveResult.evidenceReadinessWarnings.map((warning) => warning.message).join(" ")}</p>
                      </div>
                    ) : null}
                    {hasLegalChangeImpactWarning(retrieveResult) ? (
                      <div className="task-assistant__missing-evidence" role="status">
                        <strong>Legal change detected - requires review</strong>
                        <p>{LEGAL_CHANGE_IMPACT_WARNING}</p>
                      </div>
                    ) : null}
                    <div className="task-assistant__evidence-list">
                      {retrieveResult.evidence.slice(0, 10).map((item) => (
                        <article className="task-assistant__evidence" key={item.id}>
                          <strong>{item.title}</strong>
                          {item.sourceUrl ? (
                            <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                              출처 열기
                            </a>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="task-assistant__hint">근거 세부 항목은 필요할 때만 펼쳐 확인합니다.</p>
                )}
              </section>
            ) : null}

            {output ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>검토 의견</h4>
                  {record ? <span>{record.confidenceScore}%</span> : null}
                </div>
                <article className="task-assistant__answer">
                  <p>{formatVisibleReviewAnswer(output.answer)}</p>
                </article>
                {usageRecordState ? (
                  <div className="task-assistant__missing-evidence" role="status">
                    <strong>Local Codex 사용량 기록</strong>
                    <p>{formatLocalCodexUsageRecordState(usageRecordState)}</p>
                    {usageRecordState.status === "failed" ? (
                      <button
                        className="secondary-button"
                        disabled={busy}
                        onClick={() => void retryLocalCodexUsageRecord()}
                        type="button"
                      >
                        사용량 기록 재시도
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {summaryDraft ? (
                  <article className="task-assistant__summary task-assistant__closure">
                    <div className="task-assistant__section-header">
                      <h4>작업 기록 정리 초안</h4>
                      <div className="task-assistant__summary-actions">
                        <span>{approvalBlockers.length === 0 ? "승인 가능" : `${approvalBlockers.length}개 확인 필요`}</span>
                        <button
                          aria-expanded={summaryEditorExpanded}
                          className="task-assistant__subtle-button"
                          onClick={() => setSummaryEditorExpanded((current) => !current)}
                          type="button"
                        >
                          {summaryEditorExpanded
                            ? "요약 접기"
                            : summarySaveState
                            ? "요약 수정"
                            : "작업 기록 승인 준비"}
                        </button>
                      </div>
                    </div>
                    {summaryEditorExpanded ? (
                      <>
                        <label className="task-assistant__field task-assistant__field--plain">
                          <span>결론</span>
                          <textarea
                            disabled={busy}
                            onChange={(event) => updateSummaryDraft("conclusion", event.target.value)}
                            rows={3}
                            value={summaryDraft.conclusion}
                          />
                        </label>
                        <label className="task-assistant__field task-assistant__field--plain">
                          <span>태그</span>
                          <input
                            disabled={busy}
                            onChange={(event) => {
                              setSummaryTagsInput(event.target.value);
                              setClosureAcknowledged(false);
                              setSummarySaveState(null);
                              setProposalStatus("");
                              setTaskUpdateApplied(false);
                              setFollowUpTaskCreated(false);
                            }}
                            value={summaryTagsInput}
                          />
                        </label>
                        <label className="task-assistant__field task-assistant__field--plain">
                          <span>적용 범위</span>
                          <textarea
                            disabled={busy}
                            onChange={(event) => updateSummaryDraft("scope", event.target.value)}
                            rows={2}
                            value={summaryDraft.scope}
                          />
                        </label>
                        <label className="task-assistant__field task-assistant__field--plain">
                          <span>후속 조치</span>
                          <textarea
                            disabled={busy}
                            onChange={(event) => updateSummaryDraft("followUpAction", event.target.value)}
                            rows={3}
                            value={summaryDraft.followUpAction ?? ""}
                          />
                        </label>
                        <div className="task-assistant__closure-list">
                          {visibleClosureGate.map((item) => (
                            <article
                              aria-label={`${item.label}: ${item.detail}`}
                              className={`task-assistant__closure-item task-assistant__closure-item--${item.status}`}
                              key={item.id}
                              tabIndex={0}
                            >
                              <strong>{item.label}</strong>
                              <span>{closureGateStatusLabel(item.status)}</span>
                              <p>{item.detail}</p>
                            </article>
                          ))}
                        </div>
                        <label className="task-assistant__toggle task-assistant__toggle--boxed">
                          <input
                            checked={closureAcknowledged}
                            disabled={busy || approvalBlockers.length > 0}
                            onChange={(event) => setClosureAcknowledged(event.target.checked)}
                            type="checkbox"
                          />
                          <span>검토 내용을 확인하고 승인해주세요.</span>
                        </label>
                      </>
                    ) : (
                      <div className="task-assistant__summary-preview">
                        <p>승인용 입력은 접혀 있습니다. 확인이나 수정이 필요할 때 버튼을 눌러 열어주세요.</p>
                      </div>
                    )}
                  </article>
                ) : null}
                {taskUpdateProposal || followUpTaskProposal ? (
                  <article className="task-assistant__summary task-assistant__proposal">
                    <div className="task-assistant__section-header">
                      <h4>Task 반영 제안</h4>
                      <span>선택 사항</span>
                    </div>
                    <p className="task-assistant__hint">
                      승인된 요약은 자동으로 task를 수정하지 않습니다. 필요한 항목만 아래 버튼으로 별도 적용하세요.
                    </p>
                    {taskUpdateProposal ? (
                      <div className="task-assistant__proposal-card">
                        <header>
                          <strong>Task 기록 업데이트</strong>
                          <span>
                            {selectedTask?.status} -&gt; {taskUpdateProposal.nextStatus}
                          </span>
                        </header>
                        <p className="task-assistant__proposal-preview">{taskUpdateProposal.decisionAppend}</p>
                        {taskUpdateProposal.alreadyRecorded ? (
                          <small>이 assistant record는 이미 task decision에 기록되어 있습니다.</small>
                        ) : null}
                        <button
                          className="secondary-button"
                          disabled={!canApplyTaskUpdate}
                          onClick={() => void applyTaskUpdateProposal()}
                          type="button"
                        >
                          task 기록 업데이트 적용
                        </button>
                      </div>
                    ) : null}
                    {followUpTaskProposal ? (
                      <div className="task-assistant__proposal-card">
                        <header>
                          <strong>후속 task 생성</strong>
                          <span>하위 task</span>
                        </header>
                        <p className="task-assistant__proposal-title">{followUpTaskProposal.issueTitle}</p>
                        <p className="task-assistant__proposal-preview">{followUpTaskProposal.issueDetailNote}</p>
                        <button
                          className="secondary-button"
                          disabled={!canCreateFollowUpTask}
                          onClick={() => void createFollowUpTaskProposal()}
                          type="button"
                        >
                          후속 task 생성
                        </button>
                      </div>
                    ) : null}
                    {proposalStatus ? (
                      <p className="task-assistant__diagnostic task-assistant__diagnostic--pass">{proposalStatus}</p>
                    ) : null}
                  </article>
                ) : null}
              </section>
            ) : null}
          </div>

          <footer className="task-assistant__status">{status}</footer>
        </aside>
      )}
    </div>
  );
}

function buildClosureGate(input: {
  record: SavedAssistantRecord | null;
  retrieveResult: RetrieveResponse | null;
  summaryDraft: DraftSummary | null;
}): ClosureGateItem[] {
  const evidenceCount = input.retrieveResult?.evidence.length ?? 0;
  const hasConclusion = Boolean(input.summaryDraft?.conclusion.trim());
  const hasScope = Boolean(input.summaryDraft?.scope.trim());
  const hasFollowUp = Boolean(input.summaryDraft?.followUpAction?.trim());
  const hasConfidence = Boolean(input.record?.confidenceReason?.trim() || input.record?.confidenceScore !== undefined);

  return [
    {
      id: "conclusion",
      label: "결론",
      detail: hasConclusion ? "작업 요약에 결론이 있습니다." : "승인 전에 판단 또는 검토 결론을 입력하세요.",
      status: hasConclusion ? "pass" : "fail",
      required: true,
    },
    {
      id: "scope",
      label: "적용 범위",
      detail: hasScope ? "요약에 적용 대상 task 또는 범위가 명시되어 있습니다." : "이 요약이 적용되는 task 또는 범위를 정확히 적으세요.",
      status: hasScope ? "pass" : "fail",
      required: true,
    },
    {
      id: "evidence",
      label: "근거",
      detail: evidenceCount > 0 ? `${evidenceCount}개 근거가 연결되어 있습니다.` : "근거 조회와 의견 생성을 실행해 기록에 근거를 연결하세요.",
      status: evidenceCount > 0 ? "pass" : "fail",
      required: true,
    },
    {
      id: "confidence",
      label: "신뢰도",
      detail: hasConfidence
        ? `신뢰도 ${input.record?.confidenceScore ?? "-"}%가 assistant 기록에 저장되어 있습니다.`
        : "승인 전에 신뢰도가 포함된 assistant 기록을 저장하세요.",
      status: hasConfidence ? "pass" : "fail",
      required: true,
    },
    {
      id: "follow-up",
      label: "후속 조치",
      detail: hasFollowUp ? "후속 조치가 기록되어 있습니다." : "다음 조치, 담당자 확인, 또는 종료 가능한 이유를 적으세요.",
      status: hasFollowUp ? "pass" : "fail",
      required: true,
    },
  ];
}

function parseSummaryTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseOptionalNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatRegionNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
}

function buildAnalysisArtifactUrl(fileId: string, analysisId: string, disposition: "inline" | "attachment") {
  const params = new URLSearchParams({ disposition });
  return `/api/files/${encodeURIComponent(fileId)}/analysis/${encodeURIComponent(analysisId)}/artifact?${params.toString()}`;
}

function fileAnalysisSourceLabel(sourceType: string) {
  switch (sourceType) {
    case "document_text":
      return "문서 텍스트";
    case "ocr_text":
      return "OCR 텍스트";
    case "image_region":
      return "이미지 영역";
    case "manual_text":
      return "직접 입력 텍스트";
    default:
      return sourceType || "파일 근거";
  }
}

function fileAnalysisProviderStatusLabel(status?: string) {
  switch (status) {
    case "client_supplied":
      return "사용자 제공";
    case "manual":
    case undefined:
      return "직접 입력";
    default:
      return status;
  }
}

function fileAnalysisVerificationLabel(state: string) {
  switch (state) {
    case "verified":
      return "확인됨";
    case "rejected":
      return "반려됨";
    case "unverified":
      return "미확인";
    default:
      return state || "미확인";
  }
}

function formatLocalCodexUsageRecordState(state: LocalCodexUsageRecordState) {
  if (state.status === "recording") {
    return "답변 저장 후 사용량을 서버 기록에 반영하는 중입니다.";
  }
  if (state.status === "recorded") {
    const totalTokens = state.inputTokens + state.outputTokens;
    return state.usageAvailable
      ? `반영됨. input ${state.inputTokens.toLocaleString("ko-KR")}, output ${state.outputTokens.toLocaleString("ko-KR")}, total ${totalTokens.toLocaleString("ko-KR")} tokens.`
      : `반영됨. Local Codex가 이번 실행의 토큰 메타데이터를 제공하지 않아 0 tokens로 기록했습니다. event ${state.eventId}`;
  }
  return `기록 실패: ${state.message}`;
}

function evidenceKindLabel(kind: AssistantEvidence["kind"]) {
  switch (kind) {
    case "central_knowledge":
      return "중앙 지식";
    case "regulation":
      return "법규/기준";
    case "task":
      return "Task 기록";
    case "project_document":
      return "프로젝트 문서";
    case "web_or_skill":
      return "외부 웹/스킬";
    default:
      return kind;
  }
}

function formatUnavailableEvidenceKind(kind: string) {
  return isAssistantEvidenceKind(kind) ? evidenceKindLabel(kind) : kind;
}

function isAssistantEvidenceKind(kind: string): kind is AssistantEvidence["kind"] {
  return kind === "central_knowledge" || kind === "regulation" || kind === "task" || kind === "project_document" || kind === "web_or_skill";
}

function cleanupStateLabel(state: AssistantRecordHistoryItem["cleanupState"]) {
  switch (state) {
    case "approved":
      return "요약 승인";
    case "deferred":
      return "요약 보류";
    case "draft":
      return "초안";
    default:
      return state;
  }
}

function candidateStateLabel(state: AssistantRecordHistoryItem["candidateState"]) {
  switch (state) {
    case "candidate":
      return "지식 후보";
    case "not_candidate":
      return "후보 아님";
    case "pending_review":
      return "검토 대기";
    case "approved":
      return "승인됨";
    case "rejected":
      return "반려됨";
    default:
      return state;
  }
}

function closureGateStatusLabel(status: ClosureGateItem["status"]) {
  if (status === "pass") {
    return "통과";
  }
  if (status === "warn") {
    return "주의";
  }
  return "확인 필요";
}

function formatConfidenceWeight(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "-";
}

function formatAnalysisRegion(region: NonNullable<AssistantFileAnalysis["region"]>) {
  const page = region.pageNumber ? `페이지 ${region.pageNumber}, ` : "";
  const unit = region.unit === "px" ? "px" : "%";
  return `${page}x ${formatRegionNumber(region.x)}${unit}, y ${formatRegionNumber(region.y)}${unit}, w ${formatRegionNumber(region.width)}${unit}, h ${formatRegionNumber(region.height)}${unit}`;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }
  if (value < 1024) {
    return `${Math.round(value)} B`;
  }
  if (value < 1024 * 1024) {
    return `${Math.round((value / 1024) * 10) / 10} KB`;
  }
  return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
}

function buildTaskUpdateProposal(
  task: TaskRecord,
  summary: DraftSummary,
  tags: string[],
  record: SavedAssistantRecord,
): TaskUpdateProposal {
  const marker = `[Assistant approved summary ${record.id}]`;
  const decisionAppend = buildApprovedSummaryBlock(summary, tags, marker);
  const alreadyRecorded = task.decision.includes(marker);
  const nextStatus = suggestNextTaskStatus(task.status);
  const statusChanged = nextStatus !== task.status;
  const nextDecision = alreadyRecorded
    ? task.decision
    : [task.decision.trim(), decisionAppend].filter(Boolean).join("\n\n");

  return {
    nextStatus,
    statusChanged,
    alreadyRecorded,
    decisionAppend,
    nextDecision,
  };
}

function buildFollowUpTaskProposal(
  task: TaskRecord,
  summary: DraftSummary,
  tags: string[],
  record: SavedAssistantRecord,
): FollowUpTaskProposal | null {
  const followUpAction = summary.followUpAction?.trim();
  if (!followUpAction) {
    return null;
  }

  const issueTitle = createFollowUpTitle(followUpAction);
  const issueDetailNote = [
    `Parent task: ${formatTaskDisplayId(task)}`,
    `Source assistant record: ${record.id}`,
    `Conclusion: ${compactText(summary.conclusion)}`,
    `Scope: ${compactText(summary.scope)}`,
    `Follow-up action: ${compactText(followUpAction)}`,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    issueTitle,
    issueDetailNote,
    requestBody: {
      dueDate: "",
      workType: task.workType,
      coordinationScope: task.coordinationScope,
      requestedBy: task.requestedBy,
      relatedDisciplines: task.relatedDisciplines,
      assignee: task.assignee,
      assigneeProfileId: task.assigneeProfileId,
      reviewedAt: "",
      isDaily: true,
      locationRef: task.locationRef,
      calendarLinked: false,
      issueTitle,
      issueDetailNote,
      status: "new",
      decision: "",
      parentTaskId: task.id,
    },
  };
}

function buildApprovedSummaryBlock(summary: DraftSummary, tags: string[], marker: string) {
  return [
    marker,
    `Conclusion: ${compactText(summary.conclusion)}`,
    `Scope: ${compactText(summary.scope)}`,
    summary.followUpAction?.trim() ? `Follow-up: ${compactText(summary.followUpAction)}` : null,
    tags.length ? `Tags: ${tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildActionAuditSummary(summary: DraftSummary, tags: string[]): AssistantActionAuditSummary {
  return {
    conclusion: compactText(summary.conclusion),
    scope: compactText(summary.scope),
    followUpAction: compactText(summary.followUpAction ?? ""),
    tags,
  };
}

async function saveAssistantActionAudit(body: {
  action: AssistantActionAuditRecord["action"];
  sourceTaskId: string;
  targetTaskId: string;
  createdTaskId?: string;
  assistantRecordId: string;
  summary: AssistantActionAuditSummary | null;
  statusFrom?: string;
  statusTo?: string;
  decisionMarker?: string;
}) {
  const audit = await postJson<AssistantActionAuditRecord>("/api/assistant/action-audits", body);
  window.dispatchEvent(
    new CustomEvent("architect:assistant-action-audit-saved", {
      detail: {
        sourceTaskId: audit.sourceTaskId,
        targetTaskId: audit.targetTaskId,
        createdTaskId: audit.createdTaskId,
      },
    }),
  );
  return audit;
}

function suggestNextTaskStatus(status: TaskRecord["status"]): TaskRecord["status"] {
  return status === "new" ? "in_review" : status;
}

function createFollowUpTitle(value: string) {
  return `Follow-up: ${truncateText(compactText(value), 84)}`;
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

async function getServerVerifiedLocalCodexRetrieval(input: {
  retrieved: RetrieveResponse;
  taskId: string;
  question: string;
  instruction: string;
}): Promise<RetrieveResponse> {
  const review = await postTaskReviewJson({
    taskId: input.taskId,
    question: input.question,
    instruction: input.instruction,
    mode: "preview",
  });

  if (review.taskContext.taskId !== input.taskId) {
    throw new Error("Assistant task-review task mismatch. Please rerun the review for the selected task.");
  }

  if (review.status === "blocked" || review.officialLawVerification.status === "failed") {
    throw new Error(formatTaskReviewBlockedReason(review));
  }

  return {
    ...input.retrieved,
    taskContext: review.taskContext,
    evidence: review.evidence,
    legalEvidence: review.evidence.filter((item) => item.kind === "regulation" || Boolean(item.legal)),
    unavailableEvidenceKinds: review.retrievedEvidence.unavailableEvidenceKinds,
  };
}

async function getVerifiedLocalCodexRetrieval(input: {
  retrieved: RetrieveResponse;
  taskId: string;
  question: string;
  instruction: string;
}): Promise<RetrieveResponse> {
  return getServerVerifiedLocalCodexRetrieval(input);
}

function formatTaskReviewBlockedReason(review: TaskReviewResponse) {
  const failures = review.officialLawVerification.failures.join(" / ");
  const retry = review.officialLawVerification.retry.join(" / ");
  const readiness = review.evidenceReadiness
    .filter((item) => item.status === "missing")
    .map((item) => `${item.kind}: ${item.action}`)
    .join(" / ");

  return [failures || review.reason, retry, readiness].filter(Boolean).join(" / ");
}

async function assertLocalCodexReadyBeforeRetrieval(): Promise<LocalCodexStatus> {
  const readyEvent = await waitForLocalCodexPageBridge(1200);

  try {
    const status = await requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000);
    if (!status.available) {
      throw new Error(status.reason ?? "로컬 Codex 로그인을 사용할 수 없습니다.");
    }
    return status;
  } catch (error) {
    const readyDetail = readyEvent
      ? `content script/native bridge 준비 상태: extension ${readyEvent.extensionId ?? "unknown"}, schema ${readyEvent.bridgeSchemaVersion ?? "unknown"}.`
      : "content script/native bridge 준비 상태가 감지되지 않았습니다.";
    throw new Error(`${readyDetail} ${errorMessage(error)}`);
  }
}

async function generateLocalCodexReview(input: {
  instruction: string;
  question: string;
  retrieval: RetrieveResponse;
  bridgeStatus?: LocalCodexStatus;
}): Promise<AssistantOutput> {
  const [status, preference] = await Promise.all([
    input.bridgeStatus ? Promise.resolve(input.bridgeStatus) : requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000),
    fetchAiSettingsPreference(),
  ]);
  if (!status.available) {
    throw new Error(status.reason ?? "로컬 Codex 로그인을 사용할 수 없습니다.");
  }

  const codexOptions = {
    model: preference.aiDefaultModel,
    reasoningEffort: preference.aiReasoningEffort,
    serviceTier: preference.aiServiceTier,
    timeoutMs: preference.aiRequestTimeoutMs,
    noHistory: preference.aiLocalCodexNoHistory,
  };
  const retrieval = input.retrieval;
  const generated = await requestLocalCodexBridge<Partial<AssistantOutput>>(
    "generate",
    {
      instruction: input.instruction,
      question: input.question,
      taskContext: retrieval.taskContext,
      evidence: retrieval.evidence,
      legalEvidence: retrieval.legalEvidence ?? [],
      projectContextChunks: retrieval.projectContextChunks ?? [],
      projectContextTrace: retrieval.projectContextTrace,
      evidenceReadinessWarnings: retrieval.evidenceReadinessWarnings ?? [],
    },
    preference.aiRequestTimeoutMs,
    { codexOptions },
  );

  const output = normalizeLocalCodexOutput(generated, retrieval.taskContext);
  return {
    ...output,
    retrieval,
    executionMode: "local-chatgpt-codex",
    runtimeMode: "extension-native-bridge-in-page",
    answer: appendLegalChangeReviewNotice(output.answer, {
      taskContext: retrieval.taskContext,
      evidence: retrieval.evidence,
      unavailableEvidenceKinds: retrieval.unavailableEvidenceKinds,
      evidenceReadinessWarnings: retrieval.evidenceReadinessWarnings ?? [],
    }),
    localCodexUsage: normalizeLocalCodexUsageMetadata(generated, preference, status),
    localCodexBridgeSchemaVersion: status.bridgeSchemaVersion,
  };
}

async function fetchAiSettingsPreference(): Promise<AiSettingsPreference> {
  try {
    const response = await fetch("/api/preferences/ai-settings", { cache: "no-store" });
    const payload = (await response.json()) as { data?: unknown };
    if (!response.ok) {
      return DEFAULT_AI_SETTINGS_PREFERENCE;
    }
    return sanitizeAiSettingsPreference(payload.data);
  } catch {
    return DEFAULT_AI_SETTINGS_PREFERENCE;
  }
}

function normalizeLocalCodexOutput(output: Partial<AssistantOutput>, taskContext: AssistantTaskContext): AssistantOutput {
  const fallbackScope = taskContext.issueId || taskContext.taskId;
  const draftSummary = output.draftSummary;

  return {
    answer:
      typeof output.answer === "string" && output.answer.trim()
        ? output.answer
        : "로컬 Codex 로그인에서 답변을 받지 못했습니다.",
    draftSummary: {
      conclusion:
        typeof draftSummary?.conclusion === "string" && draftSummary.conclusion.trim()
          ? draftSummary.conclusion
          : "로컬 Codex 답변은 task 종료 전에 검토가 필요합니다.",
      tags: Array.isArray(draftSummary?.tags)
        ? draftSummary.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
        : ["assistant", "local-codex"],
      scope:
        typeof draftSummary?.scope === "string" && draftSummary.scope.trim() ? draftSummary.scope : fallbackScope,
      followUpAction:
        typeof draftSummary?.followUpAction === "string" && draftSummary.followUpAction.trim()
          ? draftSummary.followUpAction
          : "Task 기록을 업데이트하기 전에 인용 근거를 확인하세요.",
    },
    executionMode: "local-chatgpt-codex",
    runtimeMode: "extension-native-bridge-in-page",
    localCodexUsage: output.localCodexUsage,
    localCodexBridgeSchemaVersion: output.localCodexBridgeSchemaVersion,
  };
}

function normalizeLocalCodexUsageMetadata(
  output: unknown,
  preference: AiSettingsPreference,
  status: LocalCodexStatus,
): LocalCodexUsageMetadata {
  const outputRecord = isRecord(output) ? output : {};
  const usageRecord = isRecord(outputRecord.localCodexUsage)
    ? outputRecord.localCodexUsage
    : isRecord(outputRecord.usage)
      ? outputRecord.usage
      : {};
  const inputTokens = normalizeUsageTokenCount(usageRecord.inputTokens ?? usageRecord.input_tokens);
  const outputTokens = normalizeUsageTokenCount(usageRecord.outputTokens ?? usageRecord.output_tokens);
  const totalTokens = normalizeUsageTokenCount(usageRecord.totalTokens ?? usageRecord.total_tokens) || inputTokens + outputTokens;
  const usageAvailable =
    typeof usageRecord.usageAvailable === "boolean" ? usageRecord.usageAvailable : inputTokens > 0 || outputTokens > 0 || totalTokens > 0;
  const model = typeof usageRecord.model === "string" && usageRecord.model.trim() ? usageRecord.model.trim() : preference.aiDefaultModel;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    usageAvailable,
    model,
    bridgeSchemaVersion: status.bridgeSchemaVersion,
  };
}

function normalizeUsageTokenCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

const VISIBLE_REVIEW_ANSWER_MARKDOWN_HEADINGS = new Set([
  "## 결론",
  "## 검토 의견",
  "## 의견",
  "## 리스크",
  "## 후속 조치",
]);

const HIDDEN_REVIEW_ANSWER_LINE_PREFIXES = [
  "사용자 지침:",
  "주요 근거:",
  "외부 근거:",
  "Evidence readiness warnings:",
  "Legal change impact:",
  "Legal change detected - requires review",
  "Confidence is lowered",
];

function formatVisibleReviewAnswer(answer: string) {
  const normalized = answer.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const visibleMarkdownSections = extractVisibleReviewAnswerMarkdownSections(normalized);
  if (visibleMarkdownSections) {
    return visibleMarkdownSections;
  }

  const blocks = normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const explicitUserFacingBlocks = blocks.filter(isExplicitUserFacingReviewBlock);
  if (explicitUserFacingBlocks.length > 0) {
    return explicitUserFacingBlocks.join("\n\n");
  }

  const nonMetaBlocks = blocks.filter((block) => !isHiddenReviewAnswerBlock(block));
  return nonMetaBlocks.length > 0 ? nonMetaBlocks.join("\n\n") : normalized;
}

function extractVisibleReviewAnswerMarkdownSections(answer: string) {
  const lines = answer.split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  let sawHeading = false;

  for (const line of lines) {
    const normalizedHeading = normalizeReviewAnswerMarkdownHeading(line);
    if (normalizedHeading) {
      sawHeading = true;
      current = { heading: normalizedHeading, lines: [line] };
      sections.push(current);
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (!sawHeading) {
    return null;
  }

  const visible = sections
    .filter((section) => VISIBLE_REVIEW_ANSWER_MARKDOWN_HEADINGS.has(section.heading))
    .map((section) => section.lines.join("\n").trim())
    .filter(Boolean);

  return visible.length > 0 ? visible.join("\n\n") : null;
}

function normalizeReviewAnswerMarkdownHeading(line: string) {
  const trimmed = line.trim();
  return /^##\s+/.test(trimmed) ? trimmed.replace(/\s+/g, " ") : null;
}

function isExplicitUserFacingReviewBlock(block: string) {
  const firstLine = block.split("\n")[0]?.trim() ?? "";
  return firstLine.startsWith("의견:") || firstLine.startsWith("후속 조치:");
}

function isHiddenReviewAnswerBlock(block: string) {
  const firstLine = block.split("\n")[0]?.trim() ?? "";
  return HIDDEN_REVIEW_ANSWER_LINE_PREFIXES.some((prefix) => firstLine.startsWith(prefix));
}

async function recordLocalCodexUsage(input: {
  generated: AssistantOutput;
  savedRecord: SavedAssistantRecord;
  taskId: string;
}): Promise<AssistantUsageEvent> {
  const usage = input.generated.localCodexUsage;
  return postJson<AssistantUsageEvent>("/api/assistant/usage/me", {
    taskId: input.taskId,
    assistantRecordId: input.savedRecord.id,
    requestHash: `local-codex:${input.savedRecord.id}`,
    runtimeMode: "extension-native-bridge-in-page",
    model: usage?.model ?? DEFAULT_AI_SETTINGS_PREFERENCE.aiDefaultModel,
    inputTokens: usage?.usageAvailable ? usage.inputTokens : 0,
    outputTokens: usage?.usageAvailable ? usage.outputTokens : 0,
    status: "success",
    metadata: {
      workflow: "daily-task-panel",
      architectRunId: input.savedRecord.id,
      usageAvailable: Boolean(usage?.usageAvailable),
      bridgeSchemaVersion: usage?.bridgeSchemaVersion ?? input.generated.localCodexBridgeSchemaVersion,
    },
  });
}

function normalizeGeneratedRetrieval(value: unknown): RetrieveResponse | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const taskContext = normalizeGeneratedTaskContext(value.taskContext);
  if (!taskContext || !Array.isArray(value.evidence) || !Array.isArray(value.unavailableEvidenceKinds)) {
    return undefined;
  }

  return {
    taskContext,
    evidence: value.evidence
      .map(normalizeGeneratedEvidence)
      .filter((item): item is AssistantEvidence => Boolean(item)),
    legalEvidence: Array.isArray(value.legalEvidence)
      ? value.legalEvidence.map(normalizeGeneratedEvidence).filter((item): item is AssistantEvidence => Boolean(item))
      : [],
    projectContextChunks: Array.isArray(value.projectContextChunks)
      ? value.projectContextChunks.map(normalizeProjectContextChunk).filter((item): item is ProjectContextChunkForReview => Boolean(item))
      : [],
    projectContextTrace: normalizeProjectContextTrace(value.projectContextTrace),
    unavailableEvidenceKinds: value.unavailableEvidenceKinds.filter((item): item is string => typeof item === "string"),
    evidenceReadinessWarnings: Array.isArray(value.evidenceReadinessWarnings)
      ? value.evidenceReadinessWarnings
        .map(normalizeGeneratedEvidenceReadinessWarning)
        .filter((item): item is EvidenceReadinessWarning => Boolean(item))
      : [],
    conversationMemory: typeof value.conversationMemory === "string" ? value.conversationMemory : "",
  };
}

function normalizeGeneratedTaskContext(value: unknown): AssistantTaskContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const taskContext = {
    taskId: normalizeGeneratedString(value.taskId),
    projectId: normalizeGeneratedString(value.projectId),
    title: normalizeGeneratedString(value.title),
    description: normalizeGeneratedString(value.description),
    status: normalizeGeneratedString(value.status),
    issueId: normalizeGeneratedString(value.issueId),
    projectName: normalizeGeneratedString(value.projectName),
  };
  return taskContext.taskId && taskContext.projectId ? taskContext : undefined;
}

function normalizeProjectContextChunk(value: unknown): ProjectContextChunkForReview | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const chunkId = normalizeGeneratedString(value.chunkId);
  const sourceDocumentTitle = normalizeGeneratedString(value.sourceDocumentTitle);
  const sourceQuote = normalizeGeneratedString(value.sourceQuote);
  if (!chunkId || !sourceDocumentTitle || !sourceQuote) {
    return undefined;
  }
  return {
    chunkId,
    sourceDocumentTitle,
    normalizedText: normalizeGeneratedString(value.normalizedText),
    sourceQuote,
    location: value.location ?? null,
    contextType: normalizeGeneratedString(value.contextType),
    chunkQualityScore: normalizeGeneratedNumber(value.chunkQualityScore),
    injectionRisk: normalizeGeneratedString(value.injectionRisk),
    score: normalizeGeneratedNumber(value.score),
  };
}

function normalizeProjectContextTrace(value: unknown): ProjectContextTraceForReview {
  if (!isRecord(value)) {
    return { status: "active_corpus_missing", fallbackMode: "none" };
  }
  const status = normalizeGeneratedString(value.status);
  return {
    status: isProjectContextTraceStatus(status) ? status : "active_corpus_missing",
    fallbackMode: normalizeGeneratedString(value.fallbackMode) === "legal_only_after_project_context_error"
      ? "legal_only_after_project_context_error"
      : "none",
    noRelevantChunkReason: normalizeGeneratedString(value.noRelevantChunkReason) || null,
    searchErrorCode: normalizeGeneratedString(value.searchErrorCode) || null,
  };
}

function isProjectContextTraceStatus(value: string): value is ProjectContextTraceForReview["status"] {
  return value === "chunks_found" || value === "active_corpus_missing" || value === "no_relevant_chunks" || value === "search_failed";
}

function formatProjectContextTraceStatus(trace: ProjectContextTraceForReview | undefined) {
  if (!trace) {
    return "active_corpus_missing";
  }
  return [
    trace.status,
    trace.noRelevantChunkReason ? `사유: ${trace.noRelevantChunkReason}` : "",
    trace.searchErrorCode ? `오류: ${trace.searchErrorCode}` : "",
  ].filter(Boolean).join(" / ");
}

function normalizeGeneratedEvidence(value: unknown): AssistantEvidence | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = normalizeGeneratedString(value.id);
  const kind = normalizeGeneratedString(value.kind);
  const title = normalizeGeneratedString(value.title);
  const excerpt = normalizeGeneratedString(value.excerpt);
  if (!id || !isAssistantEvidenceKind(kind) || !title || !excerpt) {
    return undefined;
  }
  return {
    id,
    kind,
    priority: typeof value.priority === "number" && Number.isFinite(value.priority) ? value.priority : 99,
    title,
    excerpt,
    sourceUrl: normalizeGeneratedOptionalString(value.sourceUrl),
    recordId: normalizeGeneratedOptionalString(value.recordId),
    confidenceWeight: typeof value.confidenceWeight === "number" && Number.isFinite(value.confidenceWeight)
      ? value.confidenceWeight
      : undefined,
    legal: normalizeGeneratedLegalMetadata(value.legal),
  };
}

function normalizeGeneratedLegalMetadata(value: unknown): AssistantEvidence["legal"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const sourceId = normalizeGeneratedOptionalString(value.sourceId);
  const sourceKind = normalizeGeneratedOptionalString(value.sourceKind);
  const authorityRank = normalizeGeneratedOptionalString(value.authorityRank);
  if (!sourceId || !sourceKind || !authorityRank) {
    return undefined;
  }
  return {
    sourceId,
    sourceKind,
    authorityRank,
    effective: isRecord(value.effective) ? {
      effectiveFrom: normalizeGeneratedOptionalString(value.effective.effectiveFrom),
      effectiveTo: normalizeGeneratedOptionalString(value.effective.effectiveTo),
      promulgatedAt: normalizeGeneratedOptionalString(value.effective.promulgatedAt),
    } : undefined,
    locator: isRecord(value.locator) ? value.locator : undefined,
    stale: value.stale === true,
    legalChangeWarnings: Array.isArray(value.legalChangeWarnings)
      ? value.legalChangeWarnings.filter((item): item is string => typeof item === "string")
      : [],
    confidenceReason: normalizeGeneratedOptionalString(value.confidenceReason),
  };
}

function normalizeGeneratedEvidenceReadinessWarning(value: unknown): EvidenceReadinessWarning | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const code = normalizeGeneratedString(value.code);
  const message = normalizeGeneratedString(value.message);
  return code && message ? { code, message } : undefined;
}

function normalizeGeneratedOptionalString(value: unknown): string | undefined {
  return normalizeGeneratedString(value) || undefined;
}

function normalizeGeneratedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeGeneratedNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function buildLocalCodexHealthReport(status: LocalCodexStatus, lawPreflight: LocalCodexLawPreflight | null): LocalCodexHealthReport {
  const ready = status.available;
  const lawBlocked = lawPreflight?.status === "failed";

  return {
    checkedAt: formatHealthCheckTime(),
    summary: lawBlocked
      ? "로컬 Codex 연결은 준비됐지만 공식 법규 검증이 차단됐습니다."
      : ready
        ? "이 페이지에서 로컬 Codex 로그인을 사용할 수 있습니다."
        : "확장은 응답했지만 로컬 Codex 로그인 실행 환경은 아직 준비되지 않았습니다.",
    steps: [
      {
        id: "content-script",
        label: "확장 연결",
        status: "pass",
        detail: "/daily 페이지가 확장 content script 응답을 받았습니다.",
      },
      {
        id: "native-codex",
        label: "Native host / Codex",
        status: ready ? "pass" : "fail",
        detail: status.reason ?? "Native Codex 연결이 응답했습니다.",
      },
      {
        id: "credentials",
        label: "인증 정보",
        status: "pass",
        detail: "Codex/OpenAI 인증 정보는 SaaS 또는 브라우저 확장 저장소에 저장되지 않습니다.",
      },
      ...(lawPreflight
        ? [
            {
              id: "official-law",
              label: "공식 법규 검증",
              status: lawBlocked ? ("fail" as const) : ("pass" as const),
              detail: lawPreflight.detail,
            },
          ]
        : []),
      {
        id: "generation",
        label: "답변 생성",
        status: lawBlocked ? "fail" : ready ? "pass" : "warn",
        detail: lawBlocked
          ? "공식 법규 검증이 해결될 때까지 법규 근거가 포함된 답변 생성을 실행할 수 없습니다."
          : ready
            ? "선택한 task에 대해 로컬 Codex 로그인 기반 답변 생성을 실행할 수 있습니다."
            : "생성 전에 native host 등록, Codex CLI 설치, Codex 로그인을 확인하세요.",
      },
    ],
  };
}

function buildLocalCodexMissingBridgeReport(error: string): LocalCodexHealthReport {
  return {
    checkedAt: formatHealthCheckTime(),
    summary: "이 페이지에서 로컬 Codex 로그인 확장 연결이 응답하지 않았습니다.",
    steps: [
      {
        id: "content-script",
        label: "확장 연결",
        status: "fail",
        detail: error,
      },
      {
        id: "native-codex",
        label: "Native host / Codex",
        status: "warn",
        detail: "페이지 연결이 응답하지 않아 native host까지 도달하지 못했습니다.",
      },
      {
        id: "credentials",
        label: "인증 정보",
        status: "pass",
        detail: "이 페이지는 Codex/OpenAI 인증 정보를 저장하지 않습니다.",
      },
      {
        id: "generation",
        label: "답변 생성",
        status: "fail",
        detail: "chrome://extensions에서 Architect Browser Assistant를 다시 로드한 뒤 /daily를 새로고침하세요.",
      },
      {
        id: "installed-path-verifier",
        label: "설치 경로 검증",
        status: "warn",
        detail:
          "다시 로드한 뒤에도 실패하면 architect-browser-assistant에서 `npm run native-host:verify:windows -- --extension-id <id> --strict`를 실행하세요.",
      },
    ],
  };
}

function formatHealthCheckTime() {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function requestLocalCodexBridge<T>(
  command: "status" | "generate" | "select-region",
  input?: unknown,
  timeoutMs = 30000,
  options?: LocalCodexBridgeRequestOptions,
): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("로컬 Codex 로그인 연결은 브라우저에서만 사용할 수 있습니다."));
  }

  const requestId = `architect-page-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(
        new Error(
          "로컬 Codex 로그인 확장 연결이 응답하지 않았습니다. chrome://extensions에서 Architect Browser Assistant를 다시 로드한 뒤 /daily를 새로고침하세요.",
        ),
      );
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const response = event.data as LocalCodexBridgeResponse<T>;
      if (
        !response ||
        response.type !== "architect:page-local-runtime-response" ||
        response.requestId !== requestId
      ) {
        return;
      }

      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);

      if (response.ok) {
        resolve(response.data);
        return;
      }

      reject(new Error(response.error));
    }

    window.addEventListener("message", handleMessage);
    window.postMessage(
      {
        type: "architect:page-local-runtime-request",
        requestId,
        command,
        input,
        ...(options?.codexOptions ? { codexOptions: options.codexOptions } : {}),
      },
      window.location.origin,
    );
  });
}

function buildSidePanelContextSnapshot(input: {
  selectedTask: TaskRecord;
  selectedTaskLabel: string;
  question: string;
  executionMode: AssistantExecutionMode;
  assistantMode: SidePanelAssistantMode;
  reason: SidePanelContextUpdateReason;
}): SidePanelContextSnapshot {
  const displayId = sanitizeSidePanelContextText(input.selectedTaskLabel) ?? formatTaskDisplayId(input.selectedTask);
  const title = sanitizeSidePanelContextText(input.selectedTask.issueTitle) ?? displayId;
  const question = sanitizeSidePanelContextText(input.question) ?? "";
  const projectId = sanitizeSidePanelContextText(input.selectedTask.projectId);
  const status = sanitizeSidePanelContextText(input.selectedTask.status);

  return {
    task: {
      taskId: input.selectedTask.id,
      ...(projectId ? { projectId } : {}),
      ...(displayId ? { displayId } : {}),
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
    },
    review: {
      question,
      executionMode: input.executionMode,
      assistantMode: input.assistantMode,
    },
    page: readSidePanelPageContext(),
    reason: input.reason,
    selectedAt: new Date().toISOString(),
    source: SIDE_PANEL_CONTEXT_SOURCE,
  };
}

function dispatchSidePanelContextUpdated(snapshot: SidePanelContextSnapshot) {
  if (typeof window === "undefined") {
    return false;
  }

  window.dispatchEvent(new CustomEvent(SIDE_PANEL_CONTEXT_UPDATED_EVENT, { detail: snapshot }));
  return true;
}

function readSidePanelPageContext() {
  if (typeof window === "undefined") {
    return { url: "", route: "" };
  }

  const route = window.location.pathname;
  return {
    url: `${window.location.origin}${route}`,
    route,
  };
}

function sanitizeSidePanelContextText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function waitForAssistantSidePanelResponse(requestId: string, timeoutMs = 5000) {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("오른쪽 확장 패널은 브라우저에서만 열 수 있습니다."));
  }

  return new Promise<Extract<SidePanelBridgeResponse, { ok: true }>["data"]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(
        new Error(
          "Architect Browser Assistant 확장 패널 응답이 없습니다. 확장이 로드되어 있는지 확인하고 /daily를 새로고침하세요.",
        ),
      );
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const response = event.data as SidePanelBridgeResponse;
      if (!response || response.type !== "architect:page-side-panel-response" || response.requestId !== requestId) {
        return;
      }

      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);

      if (response.ok) {
        resolve(response.data);
        return;
      }

      reject(new Error(sidePanelBridgeErrorMessage(response)));
    }
    window.addEventListener("message", handleMessage);
  });
}

function makeSidePanelRequestId() {
  return `architect-side-panel-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sidePanelBridgeErrorMessage(response: Extract<SidePanelBridgeResponse, { ok: false }>) {
  if (
    response.errorCode === "extension_context_invalidated" ||
    response.error.toLowerCase().includes("extension context invalidated")
  ) {
    return "Chrome 확장이 새로 로드되어 현재 /daily 탭 연결을 갱신해야 합니다.";
  }

  return response.error;
}

function sidePanelOpenErrorMessage(error: unknown) {
  const message = errorMessage(error);
  return message.toLowerCase().includes("extension context invalidated")
    ? "Chrome 확장이 새로 로드되어 현재 /daily 탭 연결을 갱신해야 합니다."
    : message;
}

function isSidePanelPageRefreshRequiredMessage(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("extension context invalidated") || message.includes("현재 /daily 탭 연결을 갱신");
}

function scheduleSidePanelPageRefresh() {
  if (typeof window === "undefined") {
    return false;
  }

  const refreshKey = "architect-side-panel-refresh-after-extension-reload";
  const lastAttempt = Number(window.sessionStorage.getItem(refreshKey) || "0");
  const now = Date.now();
  if (now - lastAttempt < 15000) {
    return false;
  }

  window.sessionStorage.setItem(refreshKey, String(now));
  window.setTimeout(() => {
    window.location.reload();
  }, 900);
  return true;
}

function waitForLocalCodexPageBridge(timeoutMs = 1200): Promise<LocalCodexReadyEvent | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      resolve(null);
    }, timeoutMs);

    function handleMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }

      const message = event.data as LocalCodexReadyEvent;
      if (message?.type !== "architect:page-local-runtime-ready") {
        return;
      }

      window.clearTimeout(timer);
      window.removeEventListener("message", handleMessage);
      resolve(message);
    }

    window.addEventListener("message", handleMessage);
  });
}

function toRecordExecutionMode(mode: AssistantExecutionMode): "local-chatgpt-codex" | "mock" | "saas-api" {
  return mode === "local-codex" ? "local-chatgpt-codex" : mode;
}

function executionModeLabel(mode: AssistantRecordHistoryItem["executionMode"]) {
  if (mode === "local-chatgpt-codex") {
    return "로컬 Codex 로그인";
  }
  if (mode === "saas-api") {
    return "SaaS API";
  }
  if (mode === "unavailable") {
    return "근거만 저장";
  }
  return "Mock";
}

function runtimeModeLabel(mode: string) {
  if (mode === "extension-native-bridge-in-page") {
    return "확장 연결";
  }
  if (mode === "saas-api-daily-task-panel") {
    return "SaaS 팝업";
  }
  if (mode === "saas-daily-task-panel") {
    return "daily 팝업";
  }
  if (mode === "external-evidence") {
    return "외부 근거";
  }
  return mode || "알 수 없는 실행 환경";
}

function historyTone(mode: AssistantRecordHistoryItem["executionMode"]) {
  if (mode === "local-chatgpt-codex") {
    return "local";
  }
  if (mode === "saas-api") {
    return "saas";
  }
  if (mode === "unavailable") {
    return "muted";
  }
  return "mock";
}

function recordPreview(record: AssistantRecordHistoryItem) {
  const text =
    record.draftSummary?.conclusion?.trim() ||
    record.answer?.replace(/\s+/g, " ").trim() ||
    record.question?.replace(/\s+/g, " ").trim() ||
    "저장된 assistant 출력이 없습니다.";
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function formatRecordDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "알 수 없는 시간";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function diagnosticTone(report: LocalCodexHealthReport) {
  if (report.steps.some((step) => step.status === "fail")) {
    return "fail";
  }
  if (report.steps.some((step) => step.status === "warn")) {
    return "warn";
  }
  return "pass";
}

function localCodexDiagnostic(report: LocalCodexHealthReport) {
  const failed = report.steps.find((step) => step.status === "fail");
  if (!failed) {
    return "준비됨: 이 페이지는 선택한 task 맥락을 확장과 로컬 Codex CLI 로그인으로 보낼 수 있습니다.";
  }

  if (failed.id === "content-script") {
    return "페이지 연결이 없습니다. chrome://extensions에서 Architect Browser Assistant를 다시 로드하고 /daily를 새로고침한 뒤 연결 상태를 다시 확인하세요.";
  }
  if (failed.id === "native-codex") {
    return "Native host 또는 Codex가 준비되지 않았습니다. 설치 경로 검증을 실행하고 Codex CLI 로그인 상태를 확인하세요.";
  }
  if (failed.id === "generation") {
    return "실패한 연결 또는 native-host 확인이 해결될 때까지 답변 생성을 실행할 수 없습니다.";
  }
  return failed.detail;
}

function generateArchitectReview(input: {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  evidenceReadinessWarnings?: EvidenceReadinessWarning[];
  question: string;
  instruction: string;
}): AssistantOutput {
  const primary =
    input.evidence.find((item) => item.id.startsWith("file-analysis:")) ??
    input.evidence.find((item) => item.kind === "web_or_skill") ??
    input.evidence[0];
  const taskLabel = input.taskContext.issueId || input.taskContext.taskId;
  const evidenceSummary = primary
    ? `${primary.title}: ${primary.excerpt}${primary.sourceUrl ? ` (${primary.sourceUrl})` : ""}`
    : "현재 연결된 근거가 부족합니다.";
  const externalEvidence = input.evidence.find((item) => item.kind === "web_or_skill");
  const externalEvidenceSummary =
    externalEvidence && externalEvidence.id !== primary?.id
      ? `외부 근거: ${externalEvidence.title}: ${externalEvidence.excerpt}${
          externalEvidence.sourceUrl ? ` (${externalEvidence.sourceUrl})` : ""
        }`
      : null;

  const evidenceReadinessSummary = formatEvidenceReadinessWarningsForAssistant(input.evidenceReadinessWarnings);

  return {
    answer: [
      `${taskLabel} task를 건축 실무 검토 관점으로 확인했습니다.`,
      `사용자 지침: ${input.instruction}`,
      `주요 근거: ${evidenceSummary}`,
      externalEvidenceSummary,
      evidenceReadinessSummary,
      "의견: 현재 기록만으로 확정 판단하지 말고, 관련 도면/기준 문서/협의 이력을 함께 확인한 뒤 task 기록에 반영하는 방식이 안전합니다.",
      "후속 조치: 부족한 근거를 보강하고, 담당자 확인이 필요한 항목은 별도 follow-up task로 분리하세요.",
    ].filter(Boolean).join("\n\n"),
    draftSummary: {
      conclusion: primary ? "검색된 task/project/외부 근거를 기준으로 후속 확인이 필요합니다." : "근거 보강 후 재검토가 필요합니다.",
      tags: ["assistant", "건축검토", "task-review"],
      scope: taskLabel,
      followUpAction: "도면, 첨부 파일, 공식 기준 문서를 확인한 뒤 검토 결론을 task 기록에 반영하세요.",
    },
    executionMode: "mock",
    runtimeMode: "daily-task-panel",
  };
}

function formatEvidenceReadinessWarningsForAssistant(warnings: EvidenceReadinessWarning[] | undefined): string | null {
  if (!warnings?.length) {
    return null;
  }

  const legalChangeNotice = warnings.some(isLegalChangeImpactWarning)
    ? [`Legal change impact: ${LEGAL_CHANGE_IMPACT_WARNING}`, "Confidence is lowered and the answer requires review."]
    : [];

  return [
    "Evidence readiness warnings:",
    ...legalChangeNotice,
    ...warnings.slice(0, 8).map((warning, index) => `${index + 1}. [${warning.code}] ${warning.message}`),
  ].join("\n");
}

function appendLegalChangeReviewNotice(answer: string, retrieval: RetrieveResponse | null | undefined): string {
  if (!hasLegalChangeImpactWarning(retrieval) || answer.includes(LEGAL_CHANGE_IMPACT_WARNING)) {
    return answer;
  }

  return [
    answer,
    [
      "Legal change detected - requires review",
      LEGAL_CHANGE_IMPACT_WARNING,
      "Confidence is lowered and the answer requires review.",
    ].join("\n"),
  ].join("\n\n");
}

function buildAssistantRecordConfidenceOverride(result: RetrieveResponse): AssistantRecordConfidenceOverride {
  if (!hasLegalChangeImpactWarning(result)) {
    return {};
  }

  return {
    confidenceScore: 45,
    confidenceReason:
      "Legal change detected; confidence is capped at 45% and requires legal-change review before use as current legal basis.",
  };
}

function hasLegalChangeImpactWarning(result: RetrieveResponse | null | undefined): boolean {
  if (!result) {
    return false;
  }
  return Boolean(result.evidenceReadinessWarnings?.some(isLegalChangeImpactWarning)) ||
    result.evidence.some((item) => item.legal?.stale || (item.legal?.legalChangeWarnings?.length ?? 0) > 0);
}

function isLegalChangeImpactWarning(warning: EvidenceReadinessWarning): boolean {
  return /LEGAL_CHANGE|STALE/i.test(`${warning.code} ${warning.message}`);
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }

  return parsed.data as T;
}

async function postTaskReviewJson(body: {
  taskId: string;
  question: string;
  instruction: string;
  mode: "preview" | "generate";
}): Promise<TaskReviewResponse> {
  const response = await fetch("/api/assistant/task-review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { data?: TaskReviewResponse; error?: { message?: string } };
  if (!response.ok && response.status !== 409) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }
  if (!parsed.data) {
    throw new Error(parsed.error?.message ?? "task-review 응답이 비어 있습니다.");
  }

  return parsed.data;
}

async function patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }

  return parsed.data as T;
}

async function deleteJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(path, {
    method: "DELETE",
  });
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }

  return parsed.data as T;
}

async function getJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(path);
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "요청에 실패했습니다.");
  }

  return parsed.data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "예상하지 못한 오류가 발생했습니다.";
}
