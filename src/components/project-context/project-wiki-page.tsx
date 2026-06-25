"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { ProjectWikiActionLog, ProjectWikiItem, ProjectWikiStatus, ProjectWikiSuitabilityState } from "@/domains/project-wiki/types";
import { projectWikiStatusLabel, suitabilityBadgeTone } from "@/domains/project-wiki/search";
import styles from "./project-materials-page.module.css";

type ProjectWikiPageProps = {
  preview?: boolean;
  projectId: string | null;
};

type ProjectWikiDetail = {
  item: ProjectWikiItem;
  actionLogs: ProjectWikiActionLog[];
};

type ProjectWikiStatusResult = {
  item: ProjectWikiItem;
  actionLog: ProjectWikiActionLog | null;
};

const dateFormatter = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeZone: "Asia/Seoul",
  timeStyle: "short",
});

const previewNow = "2026-06-24T09:00:00.000Z";

const PREVIEW_PROJECT_WIKI_ITEMS: ProjectWikiItem[] = [
  {
    id: "preview-project-wiki-fire-1",
    projectId: "preview-project",
    sourceTaskId: "preview-task-fire-escape",
    sourceReviewRecordId: "preview-review-fire-escape",
    sourceWorkSummaryDraftId: "preview-work-summary-fire-escape",
    commonCandidateRecordId: "preview-common-candidate-fire-escape",
    commonCandidateStatus: "candidate",
    title: "방화 구획 검토 기준",
    summary: "지하층 방화 구획은 용도와 피난 동선을 함께 확인해 승인한다.",
    bodyMarkdown: "방화 구획 검토 시 방화문 위치, 피난 동선, 설비 관통부 마감 기준을 같이 확인한다.",
    tags: ["방화", "피난", "지하층"],
    aiSuitabilityState: "recommended",
    aiSuitabilityReason: "프로젝트 전반에 반복 적용 가능한 승인 기준입니다.",
    commonizationCaution: "타 프로젝트 적용 전 관할 소방 협의 조건을 확인해야 합니다.",
    supplementalNote: "A동 지하 1층 검토에서 승인된 기준입니다.",
    status: "active",
    createdBy: "preview-profile-1",
    createdByDisplay: "Preview PM",
    createdAt: previewNow,
    updatedAt: previewNow,
    disabledBy: null,
    disabledAt: null,
    restoredBy: null,
    restoredAt: null,
  },
  {
    id: "preview-project-wiki-disabled-1",
    projectId: "preview-project",
    sourceTaskId: "preview-task-old-standard",
    sourceReviewRecordId: "preview-review-old-standard",
    sourceWorkSummaryDraftId: "preview-work-summary-old-standard",
    commonCandidateRecordId: null,
    commonCandidateStatus: null,
    title: "방화 셔터 기존 운영 기준",
    summary: "현장 조건 변경 전 검토 기준으로 현재는 재사용하지 않는다.",
    bodyMarkdown: "2026년 5월 이전 현장 운영 기준입니다. 현재 도면 기준과 달라 비활성화했습니다.",
    tags: ["방화", "비활성", "운영"],
    aiSuitabilityState: "caution",
    aiSuitabilityReason: "조건부로만 재사용할 수 있습니다.",
    commonizationCaution: "공용화 전에 최신 현장 기준과 재검토가 필요합니다.",
    supplementalNote: "비활성 사유: 최신 설계변경 반영 전 기준.",
    status: "disabled",
    createdBy: "preview-profile-2",
    createdByDisplay: "Preview Architect",
    createdAt: "2026-06-20T06:30:00.000Z",
    updatedAt: "2026-06-23T08:10:00.000Z",
    disabledBy: "preview-profile-2",
    disabledAt: "2026-06-23T08:10:00.000Z",
    restoredBy: null,
    restoredAt: null,
  },
];

const PREVIEW_ACTION_LOGS: Record<string, ProjectWikiActionLog[]> = {
  "preview-project-wiki-disabled-1": [
    {
      id: "preview-project-wiki-log-1",
      projectId: "preview-project",
      projectWikiItemId: "preview-project-wiki-disabled-1",
      action: "disable",
      actorProfileId: "preview-profile-2",
      actorDisplay: "Preview Architect",
      reason: "최신 설계변경 전 기준이라 재사용을 중지했습니다.",
      createdAt: "2026-06-23T08:10:00.000Z",
    },
  ],
};

export function ProjectWikiPage({ preview = false, projectId }: ProjectWikiPageProps) {
  const searchParams = useSearchParams();
  const initialItemId = searchParams.get("projectWikiItemId");
  const [query, setQuery] = useState("");
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [items, setItems] = useState<ProjectWikiItem[]>([]);
  const [previewItems, setPreviewItems] = useState<ProjectWikiItem[]>(PREVIEW_PROJECT_WIKI_ITEMS);
  const [previewActionLogs, setPreviewActionLogs] = useState<Record<string, ProjectWikiActionLog[]>>(PREVIEW_ACTION_LOGS);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [detail, setDetail] = useState<ProjectWikiDetail | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState(preview ? "Preview 프로젝트 WIKI 샘플입니다." : "프로젝트 WIKI를 불러오세요.");

  const visibleItems = useMemo(() => {
    const sourceItems = preview ? previewItems : items;
    return sourceItems
      .filter((item) => includeDisabled || item.status === "active")
      .filter((item) => matchesKeyword(item, query))
      .sort(compareProjectWikiItems);
  }, [includeDisabled, items, preview, previewItems, query]);

  const selectedPreviewDetail = useMemo<ProjectWikiDetail | null>(() => {
    if (!preview || !selectedItemId) {
      return null;
    }
    const item = previewItems.find((candidate) => candidate.id === selectedItemId);
    return item ? { item, actionLogs: previewActionLogs[item.id] ?? [] } : null;
  }, [preview, previewActionLogs, previewItems, selectedItemId]);

  const refreshList = useCallback(async () => {
    if (preview) {
      return;
    }
    if (!projectId) {
      setItems([]);
      setDetail(null);
      setSelectedItemId("");
      setStatusText("프로젝트를 먼저 선택하세요.");
      return;
    }

    setItems([]);
    setDetail(null);
    setSelectedItemId("");
    setBusy(true);
    try {
      const searchParams = new URLSearchParams({
        query,
        includeDisabled: includeDisabled ? "1" : "0",
      });
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/project-wiki?${searchParams.toString()}`);
      const payload = await response.json().catch(() => ({})) as { data?: ProjectWikiItem[]; error?: { message?: string } };
      if (!response.ok || !Array.isArray(payload.data)) {
        throw new Error(payload.error?.message ?? "프로젝트 WIKI 목록을 불러오지 못했습니다.");
      }
      setItems(payload.data);
      setStatusText(`${payload.data.length}개 프로젝트 WIKI를 불러왔습니다.`);
    } catch (error) {
      setItems([]);
      setDetail(null);
      setSelectedItemId("");
      setStatusText(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [includeDisabled, preview, projectId, query]);

  useEffect(() => {
    if (preview) {
      setStatusText("Preview 프로젝트 WIKI 샘플입니다.");
      return;
    }
    void refreshList();
  }, [preview, refreshList]);

  useEffect(() => {
    if (visibleItems.length === 0) {
      setSelectedItemId("");
      setDetail(null);
      return;
    }
    const preferredItemId = initialItemId && visibleItems.some((item) => item.id === initialItemId) ? initialItemId : "";
    if (preferredItemId && selectedItemId !== preferredItemId) {
      setSelectedItemId(preferredItemId);
      return;
    }
    if (!visibleItems.some((item) => item.id === selectedItemId)) {
      setSelectedItemId(preferredItemId || visibleItems[0]?.id || "");
    }
  }, [initialItemId, selectedItemId, visibleItems]);

  useEffect(() => {
    if (preview) {
      setDetail(selectedPreviewDetail);
      return;
    }
    if (!projectId || !selectedItemId) {
      setDetail(null);
      return;
    }

    const activeProjectId = projectId;
    let cancelled = false;
    setDetail(null);
    async function loadDetail() {
      setBusy(true);
      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/project-wiki/${encodeURIComponent(selectedItemId)}`);
        const payload = await response.json().catch(() => ({})) as { data?: ProjectWikiDetail; error?: { message?: string } };
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "프로젝트 WIKI 상세를 불러오지 못했습니다.");
        }
        if (!cancelled) {
          setDetail(payload.data);
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setStatusText(errorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [preview, projectId, selectedItemId, selectedPreviewDetail]);

  async function changeStatus(item: ProjectWikiItem) {
    const action = item.status === "active" ? "disable" : "restore";
    if (preview) {
      const updated = updatePreviewItemStatus(item, action, reason);
      const actionLog = createPreviewActionLog(updated, action, reason);
      setPreviewItems((current) => current.map((candidate) => (candidate.id === item.id ? updated : candidate)));
      setPreviewActionLogs((current) => ({
        ...current,
        [item.id]: [actionLog, ...(current[item.id] ?? [])],
      }));
      setReason("");
      setStatusText(action === "disable" ? "Preview 프로젝트 WIKI를 비활성화했습니다." : "Preview 프로젝트 WIKI를 복원했습니다.");
      return;
    }
    if (!projectId) {
      setStatusText("프로젝트를 먼저 선택하세요.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/project-wiki/${encodeURIComponent(item.id)}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-architect-request-intent": "mutate",
        },
        body: JSON.stringify({ action, reason }),
      });
      const payload = await response.json().catch(() => ({})) as { data?: ProjectWikiStatusResult; error?: { message?: string } };
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "프로젝트 WIKI 상태를 변경하지 못했습니다.");
      }
      const nextItem = payload.data.item;
      setItems((current) => current.map((candidate) => (candidate.id === nextItem.id ? nextItem : candidate)));
      setDetail((current) =>
        current && current.item.id === nextItem.id
          ? {
              item: nextItem,
              actionLogs: payload.data?.actionLog ? [payload.data.actionLog, ...current.actionLogs] : current.actionLogs,
            }
          : current,
      );
      setReason("");
      setStatusText(action === "disable" ? "프로젝트 WIKI를 비활성화했습니다." : "프로젝트 WIKI를 복원했습니다.");
    } catch (error) {
      setStatusText(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const selectedDetail = preview ? selectedPreviewDetail : detail;

  return (
    <section className={styles.wikiShell} aria-busy={busy} aria-label="프로젝트 WIKI">
      <div className={styles.wikiToolbar}>
        <label className={styles.searchField}>
          <span>검색어</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="키워드 검색"
            type="search"
            value={query}
          />
        </label>
        <label className={styles.checkboxField}>
          <input
            checked={includeDisabled}
            onChange={(event) => setIncludeDisabled(event.target.checked)}
            type="checkbox"
          />
          <span>비활성 포함</span>
        </label>
        <button className="secondary-button" disabled={busy || preview || !projectId} onClick={() => void refreshList()} type="button">
          새로고침
        </button>
      </div>

      <div className={styles.wikiLayout}>
        <section className={styles.wikiList} aria-label="프로젝트 WIKI 목록">
          {visibleItems.length === 0 ? (
            <p className={styles.empty}>검색 조건에 맞는 프로젝트 WIKI가 없습니다.</p>
          ) : (
            visibleItems.map((item) => (
              <article
                className={selectedItemId === item.id ? `${styles.wikiItem} ${styles.wikiItemSelected}` : styles.wikiItem}
                key={item.id}
              >
                <button className={styles.wikiItemButton} onClick={() => setSelectedItemId(item.id)} type="button">
                  <span className={styles.wikiItemTitle}>{item.title}</span>
                  <span className={`${styles.statusBadge} ${statusClassName(item.status)}`}>{projectWikiStatusLabel(item.status)}</span>
                </button>
                <p>{item.summary}</p>
                <div className={styles.tagList}>
                  {item.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <dl className={styles.wikiMetaGrid}>
                  <div>
                    <dt>source task</dt>
                    <dd><a href={`/daily?taskId=${encodeURIComponent(item.sourceTaskId)}`}>{shortId(item.sourceTaskId)}</a></dd>
                  </div>
                  <div>
                    <dt>creator</dt>
                    <dd>{item.createdByDisplay || shortId(item.createdBy)}</dd>
                  </div>
                  <div>
                    <dt>created date</dt>
                    <dd>{formatDate(item.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>common candidate status</dt>
                    <dd>{commonCandidateStatus(item)}</dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </section>

        <section className={styles.wikiDetail} aria-label="프로젝트 WIKI 상세">
          {selectedDetail ? (
            <>
              <header className={styles.wikiDetailHeader}>
                <div>
                  <h2>{selectedDetail.item.title}</h2>
                  <p>{selectedDetail.item.summary}</p>
                </div>
                <div className={styles.badgeRow}>
                  <span className={`${styles.statusBadge} ${statusClassName(selectedDetail.item.status)}`}>
                    {projectWikiStatusLabel(selectedDetail.item.status)}
                  </span>
                  <span className={`${styles.suitabilityBadge} ${suitabilityClassName(selectedDetail.item.aiSuitabilityState)}`}>
                    {suitabilityLabel(selectedDetail.item.aiSuitabilityState)}
                  </span>
                </div>
              </header>

              <div className={styles.detailBlock}>
                <h3>body</h3>
                <p>{selectedDetail.item.bodyMarkdown}</p>
              </div>

              <dl className={styles.detailGrid}>
                <div>
                  <dt>supplemental note</dt>
                  <dd>{selectedDetail.item.supplementalNote || "보완 메모 없음"}</dd>
                </div>
                <div>
                  <dt>source task</dt>
                  <dd><a href={`/daily?taskId=${encodeURIComponent(selectedDetail.item.sourceTaskId)}`}>{selectedDetail.item.sourceTaskId}</a></dd>
                </div>
                <div>
                  <dt>source temporary review record</dt>
                  <dd>
                    <a href={`/daily?taskId=${encodeURIComponent(selectedDetail.item.sourceTaskId)}&assistantReviewSessionId=${encodeURIComponent(selectedDetail.item.sourceReviewRecordId)}`}>
                      {selectedDetail.item.sourceReviewRecordId}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>approved work record link</dt>
                  <dd>
                    <a href={`/daily?taskId=${encodeURIComponent(selectedDetail.item.sourceTaskId)}&assistantReviewSessionId=${encodeURIComponent(selectedDetail.item.sourceReviewRecordId)}&workSummaryDraftId=${encodeURIComponent(selectedDetail.item.sourceWorkSummaryDraftId)}`}>
                      {selectedDetail.item.sourceWorkSummaryDraftId}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt>AI suitability reason</dt>
                  <dd>{selectedDetail.item.aiSuitabilityReason || "사유 없음"}</dd>
                </div>
                <div>
                  <dt>common WIKI candidate link/status</dt>
                  <dd>{commonCandidateLink(selectedDetail.item)}</dd>
                </div>
                <div>
                  <dt>공용화 주의사항</dt>
                  <dd>{selectedDetail.item.commonizationCaution || "주의사항 없음"}</dd>
                </div>
              </dl>

              <section className={styles.actionLogSection} aria-label="프로젝트 WIKI action log">
                <h3>action log</h3>
                {selectedDetail.actionLogs.length === 0 ? (
                  <p className={styles.empty}>상태 변경 기록이 없습니다.</p>
                ) : (
                  <ol>
                    {selectedDetail.actionLogs.map((log) => (
                      <li key={log.id}>
                        <strong>{log.action === "disable" ? "비활성화" : "복원"}</strong>
                        <span>{log.actorDisplay} / {formatDate(log.createdAt)}</span>
                        <p>{log.reason || "사유 없음"}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <section className={styles.statusControl} aria-label="프로젝트 WIKI 상태 변경">
                <label className={styles.searchField}>
                  <span>사유</span>
                  <input
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="선택 입력"
                    type="text"
                    value={reason}
                  />
                </label>
                <button className="secondary-button" disabled={busy} onClick={() => void changeStatus(selectedDetail.item)} type="button">
                  {selectedDetail.item.status === "active" ? "비활성화" : "복원"}
                </button>
              </section>
            </>
          ) : (
            <p className={styles.empty}>프로젝트 WIKI를 선택하세요.</p>
          )}
        </section>
      </div>

      <p className={styles.status}>{statusText}</p>
    </section>
  );
}

function matchesKeyword(item: ProjectWikiItem, query: string) {
  const keyword = normalize(query);
  if (!keyword) {
    return true;
  }
  const haystack = normalize([
    item.title,
    item.summary,
    item.bodyMarkdown,
    item.tags.join(" "),
    item.supplementalNote,
  ].join(" "));
  return haystack.includes(keyword);
}

function normalize(value: string) {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase("ko-KR");
}

function compareProjectWikiItems(left: ProjectWikiItem, right: ProjectWikiItem) {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

function updatePreviewItemStatus(item: ProjectWikiItem, action: "disable" | "restore", _reason: string): ProjectWikiItem {
  const timestamp = new Date().toISOString();
  if (action === "disable") {
    return {
      ...item,
      status: "disabled",
      disabledBy: "preview-profile",
      disabledAt: timestamp,
      updatedAt: timestamp,
    };
  }
  return {
    ...item,
    status: "active",
    restoredBy: "preview-profile",
    restoredAt: timestamp,
    updatedAt: timestamp,
  };
}

function createPreviewActionLog(item: ProjectWikiItem, action: "disable" | "restore", reason: string): ProjectWikiActionLog {
  return {
    id: `preview-project-wiki-log-${Date.now()}`,
    projectId: item.projectId,
    projectWikiItemId: item.id,
    action,
    actorProfileId: "preview-profile",
    actorDisplay: "Preview User",
    reason,
    createdAt: new Date().toISOString(),
  };
}

function statusClassName(status: ProjectWikiStatus) {
  return status === "active" ? styles.statusBadgeActive : styles.statusBadgeDisabled;
}

function suitabilityClassName(state: ProjectWikiSuitabilityState) {
  const tone = suitabilityBadgeTone(state);
  if (tone === "green") {
    return styles.suitabilityBadgeRecommended;
  }
  if (tone === "amber") {
    return styles.suitabilityBadgeCaution;
  }
  return styles.suitabilityBadgeNeutral;
}

function suitabilityLabel(state: ProjectWikiSuitabilityState) {
  switch (state) {
    case "recommended":
      return "AI 추천";
    case "caution":
      return "AI 주의";
    case "not_recommended":
      return "AI 비추천";
  }
}

function commonCandidateStatus(item: ProjectWikiItem) {
  switch (item.commonCandidateStatus) {
    case "candidate":
      return "후보";
    case "pending_review":
      return "SaaS 검토 대기";
    case "approved":
      return "승인됨";
    case "rejected":
      return "반려됨";
    case "not_candidate":
      return "후보 아님";
    default:
      return item.commonCandidateRecordId ? "후보 상태 확인 필요" : "후보 없음";
  }
}

function commonCandidateLink(item: ProjectWikiItem) {
  if (!item.commonCandidateRecordId) {
    return "공용 WIKI 후보 없음";
  }
  return (
    <a href={`/admin/knowledge?work=candidates&candidateId=${encodeURIComponent(item.commonCandidateRecordId)}`}>
      {commonCandidateStatus(item)} {shortId(item.commonCandidateRecordId)}
    </a>
  );
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? dateFormatter.format(new Date(timestamp)) : value;
}

function shortId(value: string) {
  return value.length > 12 ? value.slice(0, 12) : value;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
}
