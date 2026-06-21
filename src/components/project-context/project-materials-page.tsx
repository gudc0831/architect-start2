"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useProjectMeta } from "@/providers/project-provider";
import { t } from "@/lib/ui-copy";
import { recordWorkspaceRouteReady } from "@/lib/workspace/route-timing";
import styles from "./project-materials-page.module.css";

type ProjectMaterialsPageProps = {
  preview?: boolean;
};

type ProjectContextUploadListItem = {
  uploadId: string;
  versionId: string;
  fileName: string;
  createdAt: string;
  rawRetentionUntil: string;
  rawDeletionStatus: string;
  normalizationRuleVersion: string;
  parserVersion: string;
  processedAt: string | null;
  versionStatus: string;
  failureCode: string | null;
  failureMessage: string | null;
  chunkCount: number;
  canApprove: boolean;
  applicationScope: "project-wide";
};

type ProjectContextPreview = {
  uploadId: string;
  fileName: string;
  versionStatus: string;
  rawRetentionUntil: string;
  rawDeletionStatus: string;
  normalizationRuleVersion: string;
  parserVersion: string;
  processedAt: string | null;
  chunks: Array<{
    chunkId: string;
    normalizedText: string;
    sourceQuote: string;
    location: unknown;
    contextType: string;
    chunkQualityScore: number;
    injectionRisk: string;
  }>;
};

export function ProjectMaterialsPage({ preview = false }: ProjectMaterialsPageProps) {
  const pathname = usePathname();
  const { currentProjectId, projectLoaded } = useProjectMeta();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [statusText, setStatusText] = useState(t("materials.ready"));
  const [uploads, setUploads] = useState<ProjectContextUploadListItem[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<ProjectContextPreview | null>(null);
  const disabledReason = useMemo(() => {
    if (preview) {
      return t("materials.previewDisabled");
    }
    if (!currentProjectId) {
      return t("materials.noProject");
    }
    return null;
  }, [currentProjectId, preview]);

  useEffect(() => {
    recordWorkspaceRouteReady({
      fileCount: uploads.length,
      hasError: false,
      mode: "materials",
      pathname,
      taskCount: 0,
    });
  }, [pathname, uploads.length]);

  const refreshUploads = useCallback(async (projectId = currentProjectId) => {
    if (!projectId || preview) {
      return;
    }

    setListBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/materials/uploads`);
      if (!response.ok) {
        throw new Error("load failed");
      }
      const payload = await response.json() as {
        data?: { items?: ProjectContextUploadListItem[]; canApprove?: boolean };
      };
      setUploads(payload.data?.items ?? []);
      setCanApprove(Boolean(payload.data?.canApprove));
    } catch {
      setStatusText("프로젝트 자료 목록을 불러오지 못했습니다.");
    } finally {
      setListBusy(false);
    }
  }, [currentProjectId, preview]);

  useEffect(() => {
    if (!currentProjectId || preview) {
      setUploads([]);
      setCanApprove(false);
      return;
    }
    void refreshUploads(currentProjectId);
  }, [currentProjectId, preview, refreshUploads]);

  async function uploadMaterial() {
    if (!file || !currentProjectId || preview) {
      return;
    }

    setBusy(true);
    setStatusText(t("materials.uploading"));

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/projects/${currentProjectId}/materials/uploads`, {
        method: "POST",
        body,
      });
      if (!response.ok) {
        throw new Error("upload failed");
      }
      setFile(null);
      setStatusText(t("materials.uploaded"));
      await refreshUploads(currentProjectId);
    } catch {
      setStatusText(t("materials.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadPreview(upload: ProjectContextUploadListItem) {
    if (!currentProjectId || preview) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${currentProjectId}/materials/uploads/${upload.uploadId}/preview`);
      if (!response.ok) {
        throw new Error("preview failed");
      }
      const payload = await response.json() as { data?: ProjectContextPreview };
      setSelectedPreview(payload.data ?? null);
    } catch {
      setStatusText("프로젝트 자료 미리보기를 불러오지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(upload: ProjectContextUploadListItem, status: "active" | "rejected" | "archived") {
    if (!currentProjectId || preview) {
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${currentProjectId}/materials/versions/${upload.versionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error("status failed");
      }
      setStatusText(`프로젝트 자료 상태가 ${status}로 변경되었습니다.`);
      await refreshUploads(currentProjectId);
      if (selectedPreview?.uploadId === upload.uploadId) {
        await loadPreview(upload);
      }
    } catch {
      setStatusText("프로젝트 자료 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("materials.title")}</h1>
        <button className="primary-button" disabled={busy || !file || Boolean(disabledReason)} onClick={() => void uploadMaterial()} type="button">
          {t("materials.primaryUpload")}
        </button>
      </header>

      <section className={styles.uploadBand} aria-label={t("materials.title")}>
        <div className={styles.copy}>
          <p>{t("materials.scopeText")}</p>
          <p>{t("materials.rawRetentionText")}</p>
          <p>PM 이상이 active로 승인한 자료만 task review의 project_context 검색 대상이 됩니다.</p>
        </div>
        <label className={styles.fileInput}>
          <span>{t("materials.fileLabel")}</span>
          <input
            disabled={busy || preview || !currentProjectId}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setStatusText(t("materials.ready"));
            }}
            type="file"
          />
        </label>
      </section>

      <section className={styles.listSection} aria-busy={listBusy}>
        <div className={styles.sectionHeader}>
          <h2>업로드 자료</h2>
          <button className="secondary-button" disabled={busy || listBusy || Boolean(disabledReason)} onClick={() => void refreshUploads()} type="button">
            새로고침
          </button>
        </div>
        {uploads.length === 0 ? (
          <p className={styles.empty}>아직 프로젝트 자료가 없습니다.</p>
        ) : (
          <div className={styles.uploadList}>
            {uploads.map((upload) => (
              <article className={styles.uploadItem} key={upload.uploadId}>
                <div className={styles.uploadMain}>
                  <h3>{upload.fileName}</h3>
                  <dl className={styles.metaGrid}>
                    <div>
                      <dt>상태</dt>
                      <dd>{formatStatus(upload.versionStatus)}</dd>
                    </div>
                    <div>
                      <dt>chunk</dt>
                      <dd>{upload.chunkCount}</dd>
                    </div>
                    <div>
                      <dt>원본 보관</dt>
                      <dd>{formatDate(upload.rawRetentionUntil)} / {upload.rawDeletionStatus}</dd>
                    </div>
                    <div>
                      <dt>정책</dt>
                      <dd>{upload.normalizationRuleVersion} / {upload.parserVersion}</dd>
                    </div>
                  </dl>
                  {upload.failureMessage ? (
                    <p className={styles.failure}>{upload.failureCode}: {upload.failureMessage}</p>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <button className="secondary-button" disabled={busy} onClick={() => void loadPreview(upload)} type="button">
                    미리보기
                  </button>
                  {canApprove && upload.versionStatus === "review_pending" ? (
                    <>
                      <button className="secondary-button" disabled={busy || upload.chunkCount === 0} onClick={() => void updateStatus(upload, "active")} type="button">
                        active
                      </button>
                      <button className="secondary-button" disabled={busy} onClick={() => void updateStatus(upload, "rejected")} type="button">
                        reject
                      </button>
                    </>
                  ) : null}
                  {canApprove && upload.versionStatus === "active" ? (
                    <button className="secondary-button" disabled={busy} onClick={() => void updateStatus(upload, "archived")} type="button">
                      archive
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selectedPreview ? (
        <section className={styles.previewSection}>
          <div className={styles.sectionHeader}>
            <h2>{selectedPreview.fileName}</h2>
            <span>{formatStatus(selectedPreview.versionStatus)}</span>
          </div>
          <div className={styles.previewMeta}>
            <span>원본 보관: {formatDate(selectedPreview.rawRetentionUntil)} / {selectedPreview.rawDeletionStatus}</span>
            <span>정규화: {selectedPreview.normalizationRuleVersion}</span>
            <span>parser: {selectedPreview.parserVersion}</span>
            <span>processed: {selectedPreview.processedAt ? formatDate(selectedPreview.processedAt) : "-"}</span>
          </div>
          {selectedPreview.chunks.length === 0 ? (
            <p className={styles.empty}>AI review에 사용할 수 있는 chunk가 아직 없습니다.</p>
          ) : (
            <div className={styles.chunkList}>
              {selectedPreview.chunks.map((chunk, index) => (
                <article className={styles.chunkItem} key={chunk.chunkId}>
                  <div className={styles.chunkHeader}>
                    <strong>Chunk {index + 1}</strong>
                    <span>{chunk.contextType} / {chunk.injectionRisk} / {chunk.chunkQualityScore.toFixed(2)}</span>
                  </div>
                  <p>{chunk.normalizedText}</p>
                  <blockquote>{chunk.sourceQuote}</blockquote>
                  <code>{formatLocation(chunk.location)}</code>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <p className={styles.status} data-loaded={projectLoaded ? "true" : "false"}>
        {disabledReason ?? statusText}
      </p>
    </main>
  );
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    uploaded: "업로드됨",
    extracting: "추출 중",
    normalized_draft: "정규화 초안",
    review_pending: "승인 대기",
    active: "활성",
    archived: "보관됨",
    rejected: "반려됨",
    failed: "처리 실패",
  };
  return labels[status] ?? status;
}

function formatDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return value;
  }
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatLocation(value: unknown) {
  if (!value || typeof value !== "object") {
    return "-";
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => entryValue !== null && entryValue !== undefined);
  return entries.map(([key, entryValue]) => `${key}:${String(entryValue)}`).join(" / ");
}
