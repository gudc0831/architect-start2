"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

type TaskRecord = {
  id: string;
  issueId: string;
  issueTitle: string;
  issueDetailNote: string;
  status: string;
};

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

type AssistantPolicy = {
  enabled: boolean;
  provider: "mock" | "openai";
  model: string;
  monthlyBudgetCents?: number;
};

type AssistantGenerateResponse = {
  answer: string;
  suggestedDraftSummary: DraftSummary;
  usage: {
    inputTokens: number;
    outputTokens: number;
    estimatedCostCents: number;
  };
  executionMode: "saas-api";
  policyDecision: string;
  policy: AssistantPolicy;
};

type RetrieveResponse = {
  taskContext: AssistantTaskContext;
  evidence: AssistantEvidence[];
  unavailableEvidenceKinds: string[];
};

const defaultQuestion = "이 task의 검토 근거와 후속 조치를 정리해줘.";

export function AssistantTestClient() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [question, setQuestion] = useState(defaultQuestion);
  const [retrieveResult, setRetrieveResult] = useState<RetrieveResponse | null>(null);
  const [output, setOutput] = useState<AssistantOutput | null>(null);
  const [recordId, setRecordId] = useState("");
  const [policy, setPolicy] = useState<AssistantPolicy | null>(null);
  const [status, setStatus] = useState("Loading tasks...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadTasks();
    void loadPolicy();
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks],
  );

  async function loadTasks() {
    setBusy(true);
    try {
      const data = await getJson<TaskRecord[]>("/api/tasks");
      setTasks(data);
      setSelectedTaskId((current) => current || data[0]?.id || "");
      setStatus(data.length ? "Select a task and run the core loop." : "No tasks found. Create a sample task first.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createSampleTask() {
    setBusy(true);
    try {
      const task = await postJson<TaskRecord>("/api/tasks", {
        issueTitle: `Assistant test task ${new Date().toLocaleTimeString()}`,
        issueDetailNote: "Assistant core loop smoke-test task. Use this to verify retrieval, mock generation, record save, and summary approval.",
        status: "in_review",
        isDaily: true,
      });
      setTasks((current) => [task, ...current]);
      setSelectedTaskId(task.id);
      setStatus("Sample task created.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function loadPolicy() {
    try {
      const data = await getJson<AssistantPolicy>("/api/admin/assistant/policy");
      setPolicy(data);
    } catch {
      setPolicy(null);
    }
  }

  async function enableSaasPolicy() {
    setBusy(true);
    try {
      const data = await putJson<AssistantPolicy>("/api/admin/assistant/policy", {
        enabled: true,
        provider: "mock",
        model: "deterministic-foundation",
        monthlyBudgetCents: 50000,
        maxInputTokens: 12000,
        maxOutputTokens: 2000,
        externalEvidenceAllowed: true,
      });
      setPolicy(data);
      setStatus("SaaS API Mode policy enabled for the current project.");
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function runRetrieve() {
    if (!selectedTaskId || !question.trim()) {
      return;
    }

    setBusy(true);
    setOutput(null);
    setRecordId("");
    try {
      const data = await postJson<RetrieveResponse>("/api/assistant/retrieve", {
        taskId: selectedTaskId,
        question,
      });
      setRetrieveResult(data);
      setStatus(`Retrieved ${data.evidence.length} evidence item(s).`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function generateAndSave() {
    if (!retrieveResult) {
      return;
    }

    setBusy(true);
    try {
      const generated = generateMockAnswer(retrieveResult.taskContext, retrieveResult.evidence);
      setOutput(generated);
      const record = await postJson<{ id: string; confidenceScore: number }>("/api/assistant/records", {
        taskId: retrieveResult.taskContext.taskId,
        question,
        answer: generated.answer,
        evidence: retrieveResult.evidence,
        executionMode: "mock",
        runtimeMode: "saas-test-harness",
        draftSummary: generated.draftSummary,
      });
      setRecordId(record.id);
      setStatus(`Assistant record saved. Confidence ${record.confidenceScore}%.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function generateWithSaasApiAndSave() {
    if (!selectedTaskId || !question.trim()) {
      return;
    }

    setBusy(true);
    try {
      const generated = await postJson<AssistantGenerateResponse>("/api/assistant/generate", {
        taskId: selectedTaskId,
        question,
        instruction: "건축 실무 PM 관점에서 근거, 리스크, 후속 조치를 분리해 답변해줘.",
      });
      const nextOutput = {
        answer: [
          generated.answer,
          `Usage: input ${generated.usage.inputTokens}, output ${generated.usage.outputTokens}, estimated ${generated.usage.estimatedCostCents} cents.`,
        ].join("\n\n"),
        draftSummary: generated.suggestedDraftSummary,
      } satisfies AssistantOutput;
      setOutput(nextOutput);
      const record = await postJson<{ id: string; confidenceScore: number }>("/api/assistant/records", {
        taskId: selectedTaskId,
        question,
        answer: nextOutput.answer,
        evidence: retrieveResult?.evidence ?? [],
        executionMode: "saas-api",
        runtimeMode: "saas-api-test-harness",
        draftSummary: nextOutput.draftSummary,
      });
      setRecordId(record.id);
      setStatus(`SaaS API Mode generated and saved. Confidence ${record.confidenceScore}%.`);
      void loadPolicy();
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function saveSummary(statusValue: "approved" | "deferred") {
    if (!retrieveResult || !recordId || !output) {
      return;
    }

    setBusy(true);
    try {
      await postJson("/api/assistant/summaries", {
        taskId: retrieveResult.taskContext.taskId,
        recordId,
        ...output.draftSummary,
        status: statusValue,
      });
      setStatus(`Work summary ${statusValue}.`);
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.shell}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Task Assistant Core Loop</p>
          <h1 style={styles.title}>Assistant Test Harness</h1>
        </div>
        <a href="/board" style={styles.link}>Open board</a>
      </header>

      <section style={styles.section}>
        <div style={styles.toolbar}>
          <button style={styles.secondaryButton} type="button" onClick={loadTasks} disabled={busy}>Reload tasks</button>
          <button style={styles.secondaryButton} type="button" onClick={createSampleTask} disabled={busy}>Create sample task</button>
          <button style={styles.secondaryButton} type="button" onClick={enableSaasPolicy} disabled={busy}>Enable SaaS policy</button>
        </div>
        <p style={styles.muted}>
          SaaS policy: {policy?.enabled ? `enabled (${policy.provider} / ${policy.model})` : "disabled or unavailable"}
        </p>
        <label style={styles.label}>
          Task
          <select
            style={styles.input}
            value={selectedTaskId}
            onChange={(event) => setSelectedTaskId(event.target.value)}
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.issueId || task.id} - {task.issueTitle}
              </option>
            ))}
          </select>
        </label>
        {selectedTask ? <p style={styles.muted}>{selectedTask.issueDetailNote || "No task detail note."}</p> : null}
      </section>

      <section style={styles.section}>
        <label style={styles.label}>
          Question
          <textarea
            style={{ ...styles.input, minHeight: 96, resize: "vertical" }}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div style={styles.toolbar}>
          <button style={styles.primaryButton} type="button" onClick={runRetrieve} disabled={busy || !selectedTaskId}>
            1. Retrieve Evidence
          </button>
          <button style={styles.primaryButton} type="button" onClick={generateAndSave} disabled={busy || !retrieveResult}>
            2. Mock Generate + Save
          </button>
          <button style={styles.primaryButton} type="button" onClick={generateWithSaasApiAndSave} disabled={busy || !selectedTaskId}>
            SaaS Generate + Save
          </button>
        </div>
      </section>

      <section style={styles.grid}>
        <div style={styles.section}>
          <h2 style={styles.heading}>Evidence</h2>
          {retrieveResult?.evidence.length ? (
            retrieveResult.evidence.map((item) => (
              <article key={item.id} style={styles.item}>
                <strong>{item.title}</strong>
                <small>{item.kind} / priority {item.priority}</small>
                <p>{item.excerpt}</p>
              </article>
            ))
          ) : (
            <p style={styles.muted}>No evidence retrieved yet.</p>
          )}
        </div>

        <div style={styles.section}>
          <h2 style={styles.heading}>Answer And Summary</h2>
          {output ? (
            <>
              <article style={styles.item}>
                <strong>Mock answer</strong>
                <p>{output.answer}</p>
              </article>
              <article style={styles.item}>
                <strong>{output.draftSummary.conclusion}</strong>
                <small>{output.draftSummary.tags.join(", ")}</small>
                <p>{output.draftSummary.followUpAction}</p>
              </article>
              <div style={styles.toolbar}>
                <button style={styles.primaryButton} type="button" onClick={() => saveSummary("approved")} disabled={busy || !recordId}>
                  3. Approve Summary
                </button>
                <button style={styles.secondaryButton} type="button" onClick={() => saveSummary("deferred")} disabled={busy || !recordId}>
                  Defer
                </button>
              </div>
            </>
          ) : (
            <p style={styles.muted}>Generated answer and work summary will appear here.</p>
          )}
        </div>
      </section>

      <footer style={styles.status}>{status}</footer>
    </main>
  );
}

function generateMockAnswer(taskContext: AssistantTaskContext, evidence: AssistantEvidence[]): AssistantOutput {
  const primary = evidence[0];
  return {
    answer: [
      `${taskContext.issueId || taskContext.taskId} task를 SaaS 근거 기준으로 검토했습니다.`,
      primary ? `주요 근거: ${primary.title} - ${primary.excerpt}` : "현재 검색된 근거가 부족합니다.",
      "이 결과는 업무 검토 보조 의견이며 법적 확정이나 인허가 가능성 보장이 아닙니다.",
    ].join("\n\n"),
    draftSummary: {
      conclusion: primary ? "검색된 task/project 근거를 기준으로 후속 확인이 필요합니다." : "근거 수집 후 재검토가 필요합니다.",
      tags: ["assistant", "core-loop", "검토"],
      scope: taskContext.issueId || taskContext.taskId,
      followUpAction: "프로젝트 조건과 공식 근거 문서를 확인한 뒤 task 기록에 반영하세요.",
    },
  };
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  return parseJson<T>(response);
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

async function putJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseJson<T>(response);
}

async function parseJson<T>(response: Response): Promise<T> {
  const parsed = (await response.json()) as { data?: T; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(parsed.error?.message ?? "Request failed");
  }

  return parsed.data as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

const styles: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: "100vh",
    background: "#f5f6f3",
    color: "#17201c",
    padding: 24,
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 18,
  },
  eyebrow: {
    margin: "0 0 4px",
    color: "#52645c",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
  },
  title: {
    margin: 0,
    fontSize: 28,
    letterSpacing: 0,
  },
  link: {
    color: "#2f6b57",
    fontWeight: 700,
  },
  section: {
    border: "1px solid #d4dad2",
    borderRadius: 8,
    background: "#fff",
    padding: 16,
    marginBottom: 14,
  },
  toolbar: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 12,
  },
  label: {
    display: "grid",
    gap: 8,
    fontSize: 13,
    fontWeight: 700,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #c8d0c8",
    borderRadius: 6,
    padding: 10,
    color: "#17201c",
    background: "#fff",
  },
  primaryButton: {
    border: "1px solid #2f6b57",
    borderRadius: 6,
    background: "#2f6b57",
    color: "#fff",
    padding: "9px 12px",
    fontWeight: 800,
  },
  secondaryButton: {
    border: "1px solid #bac4bc",
    borderRadius: 6,
    background: "#fff",
    color: "#17201c",
    padding: "9px 12px",
    fontWeight: 800,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 14,
  },
  heading: {
    margin: "0 0 12px",
    fontSize: 14,
    textTransform: "uppercase",
  },
  item: {
    display: "grid",
    gap: 6,
    borderTop: "1px solid #e5e9e2",
    paddingTop: 10,
    marginTop: 10,
    fontSize: 13,
    lineHeight: 1.45,
  },
  muted: {
    color: "#657168",
    fontSize: 13,
  },
  status: {
    marginTop: 16,
    borderLeft: "4px solid #2f6b57",
    background: "#fff",
    padding: 12,
    fontSize: 13,
    fontWeight: 700,
  },
};
