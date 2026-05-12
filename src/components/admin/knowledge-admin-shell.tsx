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
  approvedKnowledgeItem: unknown | null;
};

type KnowledgeAdminShellProps = {
  initialCandidates: CandidateListItem[];
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

export function KnowledgeAdminShell({ initialCandidates }: KnowledgeAdminShellProps) {
  const [candidates, setCandidates] = useState(initialCandidates);
  const [selectedId, setSelectedId] = useState(initialCandidates[0]?.id ?? "");
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [status, setStatus] = useState("후보를 선택하세요.");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<CandidateState | "all">("candidate");
  const [candidateSearch, setCandidateSearch] = useState("");
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
    });
  }, [candidateSearch, candidates, filter]);
  const candidateStateCounts = useMemo(
    () => ({
      all: candidates.length,
      candidate: candidates.filter((candidate) => candidate.state === "candidate").length,
      approved: candidates.filter((candidate) => candidate.state === "approved").length,
      rejected: candidates.filter((candidate) => candidate.state === "rejected").length,
    }),
    [candidates],
  );
  const draftReadiness = useMemo(
    () => [
      { label: "Title", ready: Boolean(draft.title.trim()) },
      { label: "Summary", ready: Boolean(draft.summary.trim()) },
      { label: "Body", ready: Boolean(draft.bodyMarkdown.trim()) },
      { label: "Tags", ready: splitTags(draft.tagsText).length > 0 },
      { label: "Evidence", ready: Boolean(detail?.evidence.length) },
    ],
    [detail?.evidence.length, draft.bodyMarkdown, draft.summary, draft.tagsText, draft.title],
  );

  useEffect(() => {
    if (!selectedId && visibleCandidates[0]) {
      setSelectedId(visibleCandidates[0].id);
    }
  }, [selectedId, visibleCandidates]);

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
        setDraft({
          title: data.wikiDraft.title,
          summary: data.wikiDraft.summary,
          bodyMarkdown: data.wikiDraft.bodyMarkdown,
          tagsText: data.wikiDraft.tags.join(", "),
          scope: data.wikiDraft.scope,
          rejectionReason: data.review?.rejectionReason ?? "",
        });
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
        tags: splitTags(draft.tagsText),
        scope: draft.scope,
      });
      setDetail(data);
      await refreshCandidates(data.id);
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
          <label className={styles.queueSearch}>
            Search candidates
            <input
              onChange={(event) => setCandidateSearch(event.target.value)}
              placeholder="Title, task, project, tag"
              value={candidateSearch}
            />
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
                <small>{candidate.projectName} / {candidate.taskIssueId}</small>
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
                  <div className={styles.evidenceList}>
                    {detail.evidence.length ? detail.evidence.map((evidence) => (
                      <article className={styles.evidence} key={evidence.id}>
                        <span>{evidence.kind}</span>
                        <strong>{evidence.title}</strong>
                        <p>{evidence.excerpt}</p>
                        {evidence.sourceUrl ? (
                          <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
                            source
                          </a>
                        ) : null}
                      </article>
                    )) : <p className={styles.empty}>저장된 근거가 없습니다.</p>}
                  </div>
                </div>
              </section>

              <section className={styles.editor}>
                <div className={styles.editorHeader}>
                  <div>
                    <p>WIKI Draft</p>
                    <h3>승인 전 편집</h3>
                  </div>
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
                <section className={styles.markdownPreview} aria-label="Knowledge draft Markdown preview">
                  <h4>Markdown preview</h4>
                  <pre>{draft.bodyMarkdown.trim() || "No Markdown body yet."}</pre>
                </section>
              </section>

              <footer className={styles.footer}>
                <label>
                  반려 사유
                  <input
                    value={draft.rejectionReason}
                    onChange={(event) => setDraft((current) => ({ ...current, rejectionReason: event.target.value }))}
                    placeholder="반려할 때 필요한 사유"
                  />
                </label>
                <div className={styles.actions}>
                  <button disabled={busy} onClick={rejectCandidate} type="button">반려</button>
                  <button disabled={busy} onClick={approveCandidate} type="button">WIKI 지식 승인</button>
                </div>
              </footer>
            </>
          ) : (
            <p className={styles.empty}>선택된 후보가 없습니다.</p>
          )}
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
