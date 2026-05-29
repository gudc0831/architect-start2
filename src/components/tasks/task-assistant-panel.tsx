"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { formatTaskDisplayId } from "@/domains/task/daily-list";
import type { TaskRecord } from "@/domains/task/types";
import type { AssistantActionAuditRecord, AssistantActionAuditSummary } from "@/domains/assistant/saas-api-mode";

type AssistantEvidence = {
  id: string;
  kind: "central_knowledge" | "regulation" | "task" | "project_document" | "web_or_skill";
  priority: number;
  title: string;
  excerpt: string;
  sourceUrl?: string;
  recordId?: string;
  confidenceWeight?: number;
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
};

type AssistantExecutionMode = "mock" | "saas-api" | "local-codex";
const DEFAULT_ASSISTANT_EXECUTION_MODE: AssistantExecutionMode = "local-codex";
type FileAnalysisSourceMode = "manual_text" | "ocr_text" | "image_region";

type RetrieveResponse = {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  unavailableEvidenceKinds: string[];
};

type SavedAssistantRecord = {
  id: string;
  confidenceScore: number;
  confidenceReason?: string;
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
};

type LocalCodexStatus = {
  available: boolean;
  mode: "local-chatgpt-codex" | "mock";
  reason?: string;
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

type LocalCodexHealthStep = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
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

type SummarySaveStatus = "approved" | "deferred";

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
  const [closureAcknowledged, setClosureAcknowledged] = useState(false);
  const [summarySaveState, setSummarySaveState] = useState<SummarySaveStatus | null>(null);
  const [proposalStatus, setProposalStatus] = useState("");
  const [taskUpdateApplied, setTaskUpdateApplied] = useState(false);
  const [followUpTaskCreated, setFollowUpTaskCreated] = useState(false);
  const [recordHistory, setRecordHistory] = useState<AssistantRecordHistoryItem[]>([]);
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
  const [externalExpanded, setExternalExpanded] = useState(false);
  const [externalAllowed, setExternalAllowed] = useState(false);
  const [externalEvidence, setExternalEvidence] = useState<ExternalEvidenceRecord[]>([]);
  const [externalSourceType, setExternalSourceType] = useState<ExternalEvidenceSourceType>("web_page");
  const [externalTitle, setExternalTitle] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalToolName, setExternalToolName] = useState("");
  const [externalExcerpt, setExternalExcerpt] = useState("");
  const [localCodexHealth, setLocalCodexHealth] = useState<LocalCodexHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [status, setStatus] = useState("task를 선택하면 assistant가 해당 task에 반응합니다.");
  const [busy, setBusy] = useState(false);

  const selectedTaskLabel = useMemo(() => (selectedTask ? formatTaskDisplayId(selectedTask) : ""), [selectedTask]);
  const closureGate = useMemo(
    () => buildClosureGate({ record, retrieveResult, summaryDraft }),
    [record, retrieveResult, summaryDraft],
  );
  const approvalBlockers = closureGate.filter((item) => item.required && item.status !== "pass");
  const canDeferSummary = Boolean(selectedTask && record && output && summaryDraft && !busy);
  const canApproveSummary = canDeferSummary && closureAcknowledged && approvalBlockers.length === 0;
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
        complete: summarySaveState === "approved" || summarySaveState === "deferred",
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
      return "검토 의견을 확인한 뒤 작업 기록을 승인하거나 보류하세요.";
    }
    return "검토 흐름이 처리되었습니다.";
  }, [output, question, retrieveResult, selectedTask, summarySaveState]);

  useEffect(() => {
    setRetrieveResult(null);
    setOutput(null);
    setRecord(null);
    setSummaryDraft(null);
    setSummaryTagsInput("");
    setClosureAcknowledged(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
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
    setExecutionMode(DEFAULT_ASSISTANT_EXECUTION_MODE);
    setAssistantPolicy(null);
    setExternalEvidence([]);
    setExternalExpanded(false);
    setExternalAllowed(false);
    setExternalTitle("");
    setExternalUrl("");
    setExternalToolName("");
    setExternalExcerpt("");
    setLocalCodexHealth(null);
    setHealthLoading(false);
    setRecordHistoryLoading(false);

    if (!selectedTask) {
      setQuestion("");
      setStatus("task를 선택하면 assistant가 해당 task에 반응합니다.");
      return;
    }

    setQuestion(`${selectedTaskLabel} task의 검토 근거와 후속 조치를 정리해줘.`);
    setStatus(`${selectedTaskLabel} task가 선택되었습니다.`);
  }, [selectedTask, selectedTaskLabel]);

  useEffect(() => {
    if (!isOpen || !selectedTask) {
      return;
    }

    let cancelled = false;
    setRecordHistoryLoading(true);
    setFilesLoading(true);
    setExternalLoading(true);

    getJson<AssistantRecordHistoryItem[]>(`/api/assistant/records?taskId=${encodeURIComponent(selectedTask.id)}`)
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

    setBusy(true);
    setOutput(null);
    setRecord(null);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
    try {
      const retrieved = await postJson<RetrieveResponse>("/api/assistant/retrieve", {
        taskId: selectedTask.id,
        question,
      });
      setRetrieveResult(retrieved);

      const generated =
        executionMode === "saas-api"
          ? await generateSaasApiReview({
              instruction,
              question,
              taskId: retrieved.taskContext.taskId,
            })
          : executionMode === "local-codex"
            ? await generateLocalCodexReview({
                evidence: retrieved.evidence,
                instruction,
                question,
                taskContext: retrieved.taskContext,
              })
            : generateArchitectReview({
                evidence: retrieved.evidence,
                instruction,
                question,
                taskContext: retrieved.taskContext,
              });
      setOutput(generated);
      setSummaryDraft(generated.draftSummary);
      setSummaryTagsInput(generated.draftSummary.tags.join(", "));
      setClosureAcknowledged(false);

      const savedRecord = await postJson<SavedAssistantRecord>("/api/assistant/records", {
        taskId: retrieved.taskContext.taskId,
        question,
        answer: generated.answer,
        evidence: retrieved.evidence,
        executionMode: toRecordExecutionMode(executionMode),
        runtimeMode:
          executionMode === "saas-api"
            ? "saas-api-daily-task-panel"
            : executionMode === "local-codex"
              ? "extension-native-bridge-in-page"
              : "saas-daily-task-panel",
        draftSummary: generated.draftSummary,
      });
      setRecord(savedRecord);
      await refreshAssistantRecords(retrieved.taskContext.taskId);
      setStatus(
        executionMode === "saas-api"
          ? `SaaS API 모드 검토 의견을 저장했습니다. 신뢰도 ${savedRecord.confidenceScore}%.`
          : `검토 의견을 저장했습니다. 신뢰도 ${savedRecord.confidenceScore}%.`,
      );
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function checkLocalCodexHealth() {
    setHealthLoading(true);
    setLocalCodexHealth(null);

    try {
      const bridgeStatus = await requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000);
      const report = buildLocalCodexHealthReport(bridgeStatus);
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

  async function refreshAssistantRecords(taskId: string) {
    setRecordHistoryLoading(true);
    try {
      const items = await getJson<AssistantRecordHistoryItem[]>(`/api/assistant/records?taskId=${encodeURIComponent(taskId)}`);
      setRecordHistory(items);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setRecordHistoryLoading(false);
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
      setProposalStatus(
        statusValue === "approved"
          ? "Task 업데이트와 후속 task 제안이 준비되었습니다. 아직 자동 반영된 항목은 없습니다."
          : "",
      );
      setStatus(statusValue === "approved" ? "종료 검토 후 작업 요약을 승인했습니다." : "작업 요약을 나중에 검토하도록 보류 저장했습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
      if (savedSummaryStatus) {
        setStatus(
          savedSummaryStatus === "approved"
            ? "종료 검토 후 작업 요약을 승인했습니다."
            : "작업 요약을 나중에 검토하도록 보류 저장했습니다.",
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
    setOutput(null);
    setRecord(null);
    setSummaryDraft(null);
    setSummaryTagsInput("");
    setClosureAcknowledged(false);
    setSummarySaveState(null);
    setProposalStatus("");
    setTaskUpdateApplied(false);
    setFollowUpTaskCreated(false);
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
            <button aria-label="assistant 닫기" className="task-assistant__close" onClick={() => setIsOpen(false)} type="button">
              x
            </button>
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

            {selectedTask ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>최근 검토 기록</h4>
                  <span>{recordHistoryLoading ? "불러오는 중" : `${recordHistory.length}`}</span>
                </div>
                {recordHistory.length ? (
                  <div className="task-assistant__history-list">
                    {recordHistory.slice(0, 4).map((item) => (
                      <article
                        className={`task-assistant__history-item task-assistant__history-item--${historyTone(item.executionMode)}`}
                        key={item.id}
                      >
                        <header>
                          <strong>{executionModeLabel(item.executionMode)}</strong>
                          <span>{item.confidenceScore}%</span>
                        </header>
                        <small>
                          {formatRecordDate(item.createdAt)} / {runtimeModeLabel(item.runtimeMode)} / 근거 {item.evidenceCount}
                        </small>
                        <p>{recordPreview(item)}</p>
                        <div className="task-assistant__history-tags">
                          <span>{cleanupStateLabel(item.cleanupState)}</span>
                          <span>{candidateStateLabel(item.candidateState)}</span>
                          {item.evidenceKinds.slice(0, 3).map((kind) => (
                            <span key={kind}>{evidenceKindLabel(kind)}</span>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="task-assistant__hint">
                    {recordHistoryLoading ? "assistant 기록을 불러오는 중입니다." : "아직 이 task에 저장된 assistant 기록이 없습니다."}
                  </p>
                )}
              </section>
            ) : null}

            {selectedTask ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>파일 근거</h4>
                  <span>{filesLoading ? "불러오는 중" : `${taskFiles.length}`}</span>
                </div>
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
              </section>
            ) : null}

            {selectedTask ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
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
                  <p className="task-assistant__hint">일반 검토 흐름에서는 접어두고, 승인된 웹/스킬 근거를 추가할 때만 엽니다.</p>
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
                {externalEvidence.length ? (
                  <div className="task-assistant__evidence-list">
                    {externalEvidence.slice(0, 3).map((item) => (
                      <article className="task-assistant__evidence" key={item.id}>
                        <strong>{item.title}</strong>
                        <small>{externalSourceTypeLabel(item.sourceType)}{item.toolName ? ` / ${item.toolName}` : ""}</small>
                        <p>{item.excerpt}</p>
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
              <span>질문</span>
              <textarea disabled={!selectedTask || busy} onChange={(event) => setQuestion(event.target.value)} rows={3} value={question} />
            </label>
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
                <div className="task-assistant__section-header">
                  <h4>SaaS API 모드</h4>
                  <span>{assistantPolicy?.enabled ? "사용 중" : "꺼짐"}</span>
                </div>
                <p className="task-assistant__hint">
                  {assistantPolicy?.enabled
                    ? `${assistantPolicy.provider} / ${assistantPolicy.model}`
                    : "관리자 정책이 꺼져 있으면 생성 요청은 감사 로그와 사용량 차단 기록만 남깁니다."}
                </p>
              </section>
            ) : null}
            {executionMode === "local-codex" ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>로컬 Codex 로그인</h4>
                  <span>기본 실행</span>
                </div>
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
                <p className="task-assistant__hint">
                  사용자 PC의 Codex CLI 로그인 상태로 응답을 생성하며, SaaS는 Codex/OpenAI 인증 정보를 저장하지 않습니다.
                  Chrome extension native host가 등록되어 있어야 합니다.
                </p>
              </section>
            ) : null}
            <label className="task-assistant__field">
              <span>검토 지침</span>
              <textarea disabled={!selectedTask || busy} onChange={(event) => setInstruction(event.target.value)} rows={4} value={instruction} />
            </label>

            <div className="task-assistant__actions">
              <button className="primary-button" disabled={!selectedTask || busy} onClick={() => void runAssistantReview()} type="button">
                {busy ? "검토 중" : "근거 조회 + 의견 생성"}
              </button>
              <button className="secondary-button" disabled={!canApproveSummary} onClick={() => void saveSummary("approved")} type="button">
                작업 기록 승인
              </button>
              <button className="secondary-button" disabled={!canDeferSummary} onClick={() => void saveSummary("deferred")} type="button">
                보류 저장
              </button>
            </div>
            <p className="task-assistant__hint">{reviewActionHint}</p>

            {retrieveResult ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>근거</h4>
                  <span>{retrieveResult.evidence.length}</span>
                </div>
                {retrieveResult.unavailableEvidenceKinds.length ? (
                  <div className="task-assistant__missing-evidence" role="status">
                    <strong>사용할 수 없는 근거</strong>
                    <p>{retrieveResult.unavailableEvidenceKinds.map(formatUnavailableEvidenceKind).join(", ")}</p>
                  </div>
                ) : null}
                <div className="task-assistant__evidence-list">
                  {retrieveResult.evidence.slice(0, 10).map((item) => (
                      <article className="task-assistant__evidence" key={item.id}>
                        <strong>{item.title}</strong>
                      <small>{evidenceKindLabel(item.kind)} / 우선순위 {item.priority}</small>
                      <p>{item.excerpt}</p>
                      {item.sourceUrl ? (
                        <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                          출처 열기
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {output ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>검토 의견</h4>
                  {record ? <span>{record.confidenceScore}%</span> : null}
                </div>
                <article className="task-assistant__answer">
                  <p>{output.answer}</p>
                </article>
                {summaryDraft ? (
                  <article className="task-assistant__summary task-assistant__closure">
                    <div className="task-assistant__section-header">
                      <h4>작업 기록 정리 초안</h4>
                      <span>{approvalBlockers.length === 0 ? "승인 가능" : `${approvalBlockers.length}개 확인 필요`}</span>
                    </div>
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
                      {closureGate.map((item) => (
                        <article className={`task-assistant__closure-item task-assistant__closure-item--${item.status}`} key={item.id}>
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
                      <span>위 초안, 근거, 신뢰도와 후속 조치를 확인했고 이 내용을 작업 기록으로 승인합니다.</span>
                    </label>
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

function externalSourceTypeLabel(sourceType: ExternalEvidenceSourceType) {
  return externalSourceOptions.find((option) => option.value === sourceType)?.label ?? sourceType;
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

async function generateSaasApiReview(input: { taskId: string; question: string; instruction: string }): Promise<AssistantOutput> {
  const generated = await postJson<AssistantGenerateResponse>("/api/assistant/generate", {
    taskId: input.taskId,
    question: input.question,
    instruction: input.instruction,
  });

  return {
    answer: [
      generated.answer,
      `Provider: ${generated.provider.provider} / ${generated.provider.model} / ${generated.provider.callMode}`,
      `사용량: input ${generated.usage.inputTokens}, output ${generated.usage.outputTokens}, estimated ${generated.usage.estimatedCostCents} cents.`,
    ].join("\n\n"),
    draftSummary: generated.suggestedDraftSummary,
  };
}

async function generateLocalCodexReview(input: {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  instruction: string;
  question: string;
}): Promise<AssistantOutput> {
  const status = await requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000);
  if (!status.available) {
    throw new Error(status.reason ?? "로컬 Codex 로그인을 사용할 수 없습니다.");
  }

  const generated = await requestLocalCodexBridge<Partial<AssistantOutput>>(
    "generate",
    {
      instruction: input.instruction,
      question: input.question,
      taskContext: input.taskContext,
      evidence: input.evidence,
    },
    120000,
  );

  return normalizeLocalCodexOutput(generated, input.taskContext);
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
  };
}

function buildLocalCodexHealthReport(status: LocalCodexStatus): LocalCodexHealthReport {
  const ready = status.available;

  return {
    checkedAt: formatHealthCheckTime(),
    summary: ready
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
      {
        id: "generation",
        label: "답변 생성",
        status: ready ? "pass" : "warn",
        detail: ready
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
      },
      window.location.origin,
    );
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

  return {
    answer: [
      `${taskLabel} task를 건축 실무 검토 관점으로 확인했습니다.`,
      `사용자 지침: ${input.instruction}`,
      `주요 근거: ${evidenceSummary}`,
      externalEvidenceSummary,
      "의견: 현재 기록만으로 확정 판단하지 말고, 관련 도면/기준 문서/협의 이력을 함께 확인한 뒤 task 기록에 반영하는 방식이 안전합니다.",
      "후속 조치: 부족한 근거를 보강하고, 담당자 확인이 필요한 항목은 별도 follow-up task로 분리하세요.",
    ].filter(Boolean).join("\n\n"),
    draftSummary: {
      conclusion: primary ? "검색된 task/project/외부 근거를 기준으로 후속 확인이 필요합니다." : "근거 보강 후 재검토가 필요합니다.",
      tags: ["assistant", "건축검토", "task-review"],
      scope: taskLabel,
      followUpAction: "도면, 첨부 파일, 공식 기준 문서를 확인한 뒤 검토 결론을 task 기록에 반영하세요.",
    },
  };
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
