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

type TaskAssistantPanelProps = {
  selectedTask: TaskRecord | null;
};

const defaultInstruction =
  "건축 실무 관점에서 근거, 리스크, 확인할 도면/문서, 후속 조치를 분리해서 의견을 작성해줘.";

export function TaskAssistantPanel({ selectedTask }: TaskAssistantPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(null);
  const [output, setOutput] = useState<AssistantOutput | null>(null);
  const [record, setRecord] = useState<SavedAssistantRecord | null>(null);
  const [taskFiles, setTaskFiles] = useState<AssistantFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState("");
  const [analysisText, setAnalysisText] = useState("");
  const [analysisSummary, setAnalysisSummary] = useState("");
  const [filesLoading, setFilesLoading] = useState(false);
  const [status, setStatus] = useState("task를 선택하면 assistant가 그 task에 반응합니다.");
  const [busy, setBusy] = useState(false);

  const selectedTaskLabel = useMemo(() => (selectedTask ? formatTaskDisplayId(selectedTask) : ""), [selectedTask]);

  useEffect(() => {
    setRetrieveResult(null);
    setOutput(null);
    setRecord(null);
    setTaskFiles([]);
    setSelectedFileId("");
    setAnalysisText("");
    setAnalysisSummary("");

    if (!selectedTask) {
      setQuestion("");
      setStatus("task를 선택하면 assistant가 그 task에 반응합니다.");
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
    setFilesLoading(true);
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

      const generated = generateArchitectReview({
        evidence: retrieved.evidence,
        instruction,
        question,
        taskContext: retrieved.taskContext,
      });
      setOutput(generated);

      const savedRecord = await postJson<SavedAssistantRecord>("/api/assistant/records", {
        taskId: retrieved.taskContext.taskId,
        question,
        answer: generated.answer,
        evidence: retrieved.evidence,
        executionMode: "mock",
        runtimeMode: "saas-daily-task-panel",
        draftSummary: generated.draftSummary,
      });
      setRecord(savedRecord);
      setStatus(`검토 의견을 저장했습니다. 신뢰도 ${savedRecord.confidenceScore}%.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function approveSummary() {
    if (!selectedTask || !record || !output) {
      return;
    }

    setBusy(true);
    try {
      await postJson("/api/assistant/summaries", {
        taskId: selectedTask.id,
        recordId: record.id,
        ...output.draftSummary,
        status: "approved",
      });
      setStatus("작업 기록 정리 초안을 승인했습니다.");
    } catch (error) {
      setStatus(errorMessage(error));
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
      const saved = await postJson<{ file: AssistantFile }>(`/api/files/${encodeURIComponent(selectedFileId)}/analysis`, {
        sourceType: "manual_text",
        extractedText: analysisText,
        summary: analysisSummary,
        verificationState: "unverified",
      });
      setTaskFiles((files) => files.map((file) => (file.id === saved.file.id ? saved.file : file)));
      setAnalysisText("");
      setAnalysisSummary("");
      setRetrieveResult(null);
      setOutput(null);
      setRecord(null);
      setStatus("파일 분석 근거를 저장했습니다. 이제 근거 조회를 실행하면 assistant 의견에 반영됩니다.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="task-assistant" data-task-portal-interaction="true">
      {!isOpen ? (
        <button
          className="task-assistant__launcher"
          onClick={() => setIsOpen(true)}
          type="button"
        >
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
              ×
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
                <p>선택한 task의 제목, 설명, 프로젝트 맥락을 기준으로 답변합니다.</p>
              </section>
            )}

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
                  <span>확인한 내용</span>
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

            <label className="task-assistant__field">
              <span>질문</span>
              <textarea disabled={!selectedTask || busy} onChange={(event) => setQuestion(event.target.value)} rows={3} value={question} />
            </label>
            <label className="task-assistant__field">
              <span>검토 지침</span>
              <textarea disabled={!selectedTask || busy} onChange={(event) => setInstruction(event.target.value)} rows={4} value={instruction} />
            </label>

            <div className="task-assistant__actions">
              <button className="primary-button" disabled={!selectedTask || busy} onClick={() => void runAssistantReview()} type="button">
                {busy ? "검토 중" : "근거 조회 + 의견 생성"}
              </button>
              <button
                className="secondary-button"
                disabled={!record || !output || busy}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  void approveSummary();
                }}
                onPointerUp={(event) => {
                  if (event.button !== 0) {
                    return;
                  }

                  event.preventDefault();
                  void approveSummary();
                }}
                type="button"
              >
                작업 기록 승인
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
                <article className="task-assistant__summary">
                  <strong>{output.draftSummary.conclusion}</strong>
                  <small>{output.draftSummary.tags.join(", ")}</small>
                  <p>{output.draftSummary.followUpAction}</p>
                </article>
              </section>
            ) : null}
          </div>

          <footer className="task-assistant__status">{status}</footer>
        </aside>
      )}
    </div>
  );
}

function generateArchitectReview(input: {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  question: string;
  instruction: string;
}): AssistantOutput {
  const primary = input.evidence.find((item) => item.id.startsWith("file-analysis:")) ?? input.evidence[0];
  const taskLabel = input.taskContext.issueId || input.taskContext.taskId;
  const evidenceSummary = primary
    ? `${primary.title}: ${primary.excerpt}`
    : "현재 연결된 근거가 부족합니다.";

  return {
    answer: [
      `${taskLabel} task를 건축 실무 검토 관점으로 확인했습니다.`,
      `사용자 지침: ${input.instruction}`,
      `주요 근거: ${evidenceSummary}`,
      "의견: 현재 기록만으로 확정 판단하지 말고, 관련 도면/기준 문서/협의 이력을 함께 확인한 뒤 task 기록에 반영하는 방식이 안전합니다.",
      "후속 조치: 누락 근거를 보강하고, 담당자 확인이 필요한 항목은 별도 follow-up task로 분리하세요.",
    ].join("\n\n"),
    draftSummary: {
      conclusion: primary ? "검색된 task/project 근거를 기준으로 후속 확인이 필요합니다." : "근거 보강 후 재검토가 필요합니다.",
      tags: ["assistant", "건축검토", "task-review"],
      scope: taskLabel,
      followUpAction: "도면, 첨부파일, 공식 기준 문서를 확인한 뒤 검토 결론을 task 기록에 반영하세요.",
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
