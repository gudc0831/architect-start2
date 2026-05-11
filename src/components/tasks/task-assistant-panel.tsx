"use client";

import { useEffect, useMemo, useState } from "react";

import { formatTaskDisplayId } from "@/domains/task/daily-list";
import type { TaskRecord } from "@/domains/task/types";

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

type TaskAssistantPanelProps = {
  selectedTask: TaskRecord | null;
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

export function TaskAssistantPanel({ selectedTask }: TaskAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(null);
  const [output, setOutput] = useState<AssistantOutput | null>(null);
  const [record, setRecord] = useState<SavedAssistantRecord | null>(null);
  const [summaryDraft, setSummaryDraft] = useState<DraftSummary | null>(null);
  const [summaryTagsInput, setSummaryTagsInput] = useState("");
  const [closureAcknowledged, setClosureAcknowledged] = useState(false);
  const [recordHistory, setRecordHistory] = useState<AssistantRecordHistoryItem[]>([]);
  const [taskFiles, setTaskFiles] = useState<AssistantFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [executionMode, setExecutionMode] = useState<AssistantExecutionMode>("mock");
  const [assistantPolicy, setAssistantPolicy] = useState<AssistantPolicyResponse | null>(null);
  const [recordHistoryLoading, setRecordHistoryLoading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);
  const [externalLoading, setExternalLoading] = useState(false);
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

  useEffect(() => {
    setRetrieveResult(null);
    setOutput(null);
    setRecord(null);
    setSummaryDraft(null);
    setSummaryTagsInput("");
    setClosureAcknowledged(false);
    setRecordHistory([]);
    setTaskFiles([]);
    setSelectedFileId("");
    setAnalysisText("");
    setAnalysisSummary("");
    setExecutionMode("mock");
    setAssistantPolicy(null);
    setExternalEvidence([]);
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
          ? `SaaS API Mode 검토 의견을 저장했습니다. 신뢰도 ${savedRecord.confidenceScore}%.`
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
  }

  async function saveSummary(statusValue: SummarySaveStatus) {
    if (!selectedTask || !record || !summaryDraft) {
      return;
    }

    const blockers = closureGate.filter((item) => item.required && item.status !== "pass");
    if (statusValue === "approved" && blockers.length > 0) {
      setStatus(`Approval blocked: ${blockers.map((item) => item.label).join(", ")}.`);
      return;
    }
    if (statusValue === "approved" && !closureAcknowledged) {
      setStatus("Confirm the closure acknowledgement before approving this work summary.");
      return;
    }

    let savedSummaryStatus: SummarySaveStatus | null = null;
    setBusy(true);
    try {
      await postJson("/api/assistant/summaries", {
        taskId: selectedTask.id,
        recordId: record.id,
        ...summaryDraft,
        tags: parseSummaryTags(summaryTagsInput),
        status: statusValue,
      });
      await refreshAssistantRecords(selectedTask.id);
      savedSummaryStatus = statusValue;
      setStatus(statusValue === "approved" ? "Work summary approved after closure review." : "Work summary saved as deferred for later review.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
      if (savedSummaryStatus) {
        setStatus(
          savedSummaryStatus === "approved"
            ? "Work summary approved after closure review."
            : "Work summary saved as deferred for later review.",
        );
      }
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
      const saved = await postJson<{ file: AssistantFile }>(`/api/files/${encodeURIComponent(selectedFileId)}/analysis`, {
        sourceType: "manual_text",
        extractedText: analysisText,
        summary: analysisSummary,
        verificationState: "unverified",
      });
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      setAnalysisText("");
      setAnalysisSummary("");
      resetGeneratedOutput();
      setStatus("파일 분석 근거를 저장했습니다. 다음 근거 조회부터 assistant 의견에 반영됩니다.");
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
                  <span>{recordHistoryLoading ? "loading" : `${recordHistory.length}`}</span>
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
                          <span>{item.cleanupState}</span>
                          <span>{item.candidateState}</span>
                          {item.evidenceKinds.slice(0, 3).map((kind) => (
                            <span key={kind}>{kind}</span>
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
                  <span>{filesLoading ? "loading" : `${taskFiles.length}`}</span>
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
                  <span>{externalLoading ? "loading" : `${externalEvidence.length}`}</span>
                </div>
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
                {externalEvidence.length ? (
                  <div className="task-assistant__evidence-list">
                    {externalEvidence.slice(0, 3).map((item) => (
                      <article className="task-assistant__evidence" key={item.id}>
                        <strong>{item.title}</strong>
                        <small>{item.sourceType}{item.toolName ? ` / ${item.toolName}` : ""}</small>
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
                <option value="mock">Mock/local foundation</option>
                <option value="local-codex">Local Codex (extension)</option>
                <option value="saas-api">SaaS API</option>
              </select>
            </label>
            {executionMode === "saas-api" ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>SaaS API Mode</h4>
                  <span>{assistantPolicy?.enabled ? "enabled" : "disabled"}</span>
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
                  <h4>Local Codex</h4>
                  <span>extension bridge</span>
                </div>
                <div className="task-assistant__health-actions">
                  <button
                    className="secondary-button"
                    disabled={healthLoading || busy}
                    onClick={() => void checkLocalCodexHealth()}
                    type="button"
                  >
                    {healthLoading ? "Checking..." : "Check bridge"}
                  </button>
                  {localCodexHealth ? <span>{localCodexHealth.checkedAt}</span> : null}
                </div>
                {localCodexHealth ? (
                  <div className="task-assistant__health-list">
                    {localCodexHealth.steps.map((step) => (
                      <article className="task-assistant__health-step" key={step.id}>
                        <strong>{step.label}</strong>
                        <span className={`task-assistant__health-badge task-assistant__health-badge--${step.status}`}>
                          {step.status}
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
                  Chrome extension native host가 등록되어 있어야 합니다. 응답 생성은 사용자 PC의 Codex CLI 로그인 상태를 사용하며,
                  credential은 SaaS나 브라우저 저장소에 저장하지 않습니다.
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

            {retrieveResult ? (
              <section className="task-assistant__section">
                <div className="task-assistant__section-header">
                  <h4>근거</h4>
                  <span>{retrieveResult.evidence.length}</span>
                </div>
                <div className="task-assistant__evidence-list">
                  {retrieveResult.evidence.slice(0, 10).map((item) => (
                    <article className="task-assistant__evidence" key={item.id}>
                      <strong>{item.title}</strong>
                      <small>{item.kind} / priority {item.priority}</small>
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
                      <span>{approvalBlockers.length === 0 ? "ready" : `${approvalBlockers.length} blockers`}</span>
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
                          <span>{item.status}</span>
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
      label: "Conclusion",
      detail: hasConclusion ? "The summary has a conclusion." : "Add the decision or review conclusion before approval.",
      status: hasConclusion ? "pass" : "fail",
      required: true,
    },
    {
      id: "scope",
      label: "Scope",
      detail: hasScope ? "The summary names the applicable task or scope." : "State exactly what task or scope this summary applies to.",
      status: hasScope ? "pass" : "fail",
      required: true,
    },
    {
      id: "evidence",
      label: "Evidence",
      detail: evidenceCount > 0 ? `${evidenceCount} evidence items are linked.` : "Run retrieval/generation so evidence is linked to the record.",
      status: evidenceCount > 0 ? "pass" : "fail",
      required: true,
    },
    {
      id: "confidence",
      label: "Confidence",
      detail: hasConfidence
        ? `Confidence ${input.record?.confidenceScore ?? "-"}% is saved with the assistant record.`
        : "Save an assistant record with confidence before approval.",
      status: hasConfidence ? "pass" : "fail",
      required: true,
    },
    {
      id: "follow-up",
      label: "Follow-up",
      detail: hasFollowUp ? "A follow-up action is documented." : "Add the next action, owner check, or reason this can be closed.",
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
  question: string;
}): Promise<AssistantOutput> {
  const status = await requestLocalCodexBridge<LocalCodexStatus>("status", undefined, 5000);
  if (!status.available) {
    throw new Error(status.reason ?? "Local Codex bridge is unavailable.");
  }

  const generated = await requestLocalCodexBridge<Partial<AssistantOutput>>(
    "generate",
    {
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
        : "Local Codex bridge returned no answer.",
    draftSummary: {
      conclusion:
        typeof draftSummary?.conclusion === "string" && draftSummary.conclusion.trim()
          ? draftSummary.conclusion
          : "Local Codex answer should be reviewed before task closure.",
      tags: Array.isArray(draftSummary?.tags)
        ? draftSummary.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 12)
        : ["assistant", "local-codex"],
      scope:
        typeof draftSummary?.scope === "string" && draftSummary.scope.trim() ? draftSummary.scope : fallbackScope,
      followUpAction:
        typeof draftSummary?.followUpAction === "string" && draftSummary.followUpAction.trim()
          ? draftSummary.followUpAction
          : "Confirm cited evidence before updating the task record.",
    },
  };
}

function buildLocalCodexHealthReport(status: LocalCodexStatus): LocalCodexHealthReport {
  const ready = status.available;

  return {
    checkedAt: formatHealthCheckTime(),
    summary: ready
      ? "Local Codex bridge is ready for this page."
      : "Extension bridge responded, but Local Codex is not ready.",
    steps: [
      {
        id: "content-script",
        label: "Extension bridge",
        status: "pass",
        detail: "The /daily page received a response from the extension content script.",
      },
      {
        id: "native-codex",
        label: "Native host / Codex",
        status: ready ? "pass" : "fail",
        detail: status.reason ?? "Native Codex bridge responded.",
      },
      {
        id: "credentials",
        label: "Credentials",
        status: "pass",
        detail: "Codex/OpenAI credentials are not stored in SaaS or browser extension storage.",
      },
      {
        id: "generation",
        label: "Generation",
        status: ready ? "pass" : "warn",
        detail: ready
          ? "You can run Local Codex generation for the selected task."
          : "Fix native host registration, Codex CLI install, or Codex login before generating.",
      },
    ],
  };
}

function buildLocalCodexMissingBridgeReport(error: string): LocalCodexHealthReport {
  return {
    checkedAt: formatHealthCheckTime(),
    summary: "Local Codex extension bridge did not respond on this page.",
    steps: [
      {
        id: "content-script",
        label: "Extension bridge",
        status: "fail",
        detail: error,
      },
      {
        id: "native-codex",
        label: "Native host / Codex",
        status: "warn",
        detail: "The native host was not reached because the page bridge did not respond.",
      },
      {
        id: "credentials",
        label: "Credentials",
        status: "pass",
        detail: "No Codex/OpenAI credential is stored by this page.",
      },
      {
        id: "generation",
        label: "Generation",
        status: "fail",
        detail: "Open chrome://extensions, reload Architect Browser Assistant, then refresh /daily before trying Local Codex generation.",
      },
      {
        id: "installed-path-verifier",
        label: "Installed path verifier",
        status: "warn",
        detail:
          "If this still fails after reload, run `npm run native-host:verify:windows -- --extension-id <id> --strict` from architect-browser-assistant.",
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
  command: "status" | "generate",
  input?: unknown,
  timeoutMs = 30000,
): Promise<T> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Local Codex bridge is only available in the browser."));
  }

  const requestId = `architect-page-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", handleMessage);
      reject(
        new Error(
          "Local Codex extension bridge did not respond. Reload Architect Browser Assistant in chrome://extensions, then refresh /daily.",
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
    return "Local Codex";
  }
  if (mode === "saas-api") {
    return "SaaS API";
  }
  if (mode === "unavailable") {
    return "Evidence only";
  }
  return "Mock";
}

function runtimeModeLabel(mode: string) {
  if (mode === "extension-native-bridge-in-page") {
    return "extension bridge";
  }
  if (mode === "saas-api-daily-task-panel") {
    return "SaaS popup";
  }
  if (mode === "saas-daily-task-panel") {
    return "daily popup";
  }
  if (mode === "external-evidence") {
    return "external evidence";
  }
  return mode || "unknown runtime";
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
    "No assistant output was stored.";
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function formatRecordDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "unknown time";
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
    return "Ready: this page can send the selected task context through the extension and local Codex CLI.";
  }

  if (failed.id === "content-script") {
    return "Page bridge missing: reload Architect Browser Assistant in chrome://extensions, refresh /daily, then run Check bridge again.";
  }
  if (failed.id === "native-codex") {
    return "Native host or Codex is not ready: run the installed-path verifier and confirm Codex CLI login before generation.";
  }
  if (failed.id === "generation") {
    return "Generation is blocked until the failed bridge or native-host check is fixed.";
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
    throw new Error(parsed.error?.message ?? "Request failed");
  }

  return parsed.data as T;
}

async function getJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(path);
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "Request failed");
  }

  return parsed.data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
