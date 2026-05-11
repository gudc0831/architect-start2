"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [month, setMonth] = useState(currentMonth);
  const [actionAuditAction, setActionAuditAction] = useState<AssistantActionAuditAction | "all">("all");
  const [actionAuditTask, setActionAuditTask] = useState("");
  const [actionAuditRecordId, setActionAuditRecordId] = useState("");
  const [actionAuditActorId, setActionAuditActorId] = useState("");
  const [status, setStatus] = useState("Assistant 운영 데이터를 불러오는 중입니다.");
  const [loading, setLoading] = useState(true);
  const [actionAuditLoading, setActionAuditLoading] = useState(false);
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
              <span>{actionAuditLoading ? "Loading" : `${actionAudits.length} records`}</span>
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
                    <a href={event.dailyTaskUrl}>Open task</a>
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

async function writeJson<T>(input: RequestInfo, body: unknown) {
  const response = await fetch(input, {
    method: "PUT",
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
