"use client";

import { useLayoutEffect, useMemo } from "react";

import { TaskAssistantPanel } from "@/components/tasks/task-assistant-panel";
import type { TaskRecord } from "@/domains/task/types";

const previewNow = "2026-05-29T03:40:00.000Z";

const previewTask: TaskRecord = {
  id: "preview-assistant-task-001",
  projectId: "preview-project",
  taskNumber: 12,
  actionId: 12,
  issueId: "A-012",
  parentTaskId: null,
  rootTaskId: "preview-assistant-task-001",
  depth: 0,
  siblingOrder: 12,
  dueDate: "2026-06-03",
  workType: "coordination",
  coordinationScope: "facade",
  ownerDiscipline: "architecture",
  requestedBy: "설계 PM",
  relatedDisciplines: "구조, 외장",
  assignee: "김건축",
  assigneeProfileId: null,
  issueTitle: "커튼월 앵커 간섭 검토",
  reviewedAt: "2026-05-29",
  createdAt: previewNow,
  createdBy: null,
  isDaily: true,
  locationRef: "Tower A / L12",
  calendarLinked: false,
  issueDetailNote: "구조 보강 플레이트와 커튼월 앵커 위치가 일부 중첩되어 도면, 제조사 기준, 현장 협의 이력을 함께 확인해야 합니다.",
  status: "in_review",
  statusHistory: `${previewNow} - in_review`,
  decision: "",
  completedAt: null,
  version: 1,
  updatedAt: previewNow,
  updatedBy: null,
  deletedAt: null,
  purgedAt: null,
  fileSummary: {
    count: 1,
    latestFileName: "A-500_curtain-wall-anchor.pdf",
  },
};

export function AssistantPanelPreviewClient() {
  const selectedTask = useMemo(() => previewTask, []);

  useLayoutEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const records = [createHistoryRecord("preview-record-001")];
    let previewFile = createPreviewFile();
    const externalEvidenceRecords = [createExternalEvidenceRecord("preview-external-001")];
    const actionAuditRecords: ReturnType<typeof createActionAuditRecord>[] = [];
    const reviewSessions: ReturnType<typeof createReviewSessionItem>[] = [];
    const reviewSessionDetails = new Map<string, ReturnType<typeof createReviewSessionDetail>>();

    window.fetch = async (input, init) => {
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const url = new URL(requestUrl, window.location.origin);

      if (url.origin !== window.location.origin) {
        return originalFetch(input, init);
      }

      if (url.pathname === "/api/assistant/records" && requestMethod(init) === "GET") {
        return jsonResponse(records);
      }

      if (url.pathname === "/api/assistant/records" && requestMethod(init) === "POST") {
        const record = createHistoryRecord(`preview-record-${records.length + 1}`);
        records.unshift(record);
        return jsonResponse({
          id: record.id,
          confidenceScore: record.confidenceScore,
          confidenceReason: record.confidenceReason,
        });
      }

      if (url.pathname === "/api/assistant/review-sessions" && requestMethod(init) === "GET") {
        return jsonResponse(reviewSessions);
      }

      if (url.pathname === "/api/assistant/review-sessions" && requestMethod(init) === "POST") {
        const body = await readJsonBody(init);
        const id = `preview-review-session-${reviewSessions.length + 1}`;
        const item = createReviewSessionItem(id, body);
        const detail = createReviewSessionDetail(item, body);
        reviewSessions.unshift(item);
        reviewSessionDetails.set(item.id, detail);
        return jsonResponse(item);
      }

      if (url.pathname.startsWith("/api/assistant/review-sessions/")) {
        const sessionId = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        const detail = reviewSessionDetails.get(sessionId);
        if (!detail) {
          return jsonResponse({ message: "preview review session not found" }, 404);
        }
        if (requestMethod(init) === "GET") {
          return jsonResponse(detail);
        }
        if (requestMethod(init) === "PATCH") {
          const body = await readJsonBody(init);
          const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : detail.title;
          const updated = { ...detail, title, updatedAt: previewNow };
          reviewSessionDetails.set(sessionId, updated);
          const index = reviewSessions.findIndex((item) => item.id === sessionId);
          if (index >= 0) {
            reviewSessions[index] = toReviewSessionItem(updated);
          }
          return jsonResponse(toReviewSessionItem(updated));
        }
      }

      if (url.pathname === "/api/files") {
        return jsonResponse([previewFile]);
      }

      if (isPreviewFileAnalysisPath(url.pathname) && requestMethod(init) === "POST") {
        const body = await readJsonBody(init);
        previewFile = addPreviewFileAnalysis(previewFile, body);
        return jsonResponse({ file: previewFile }, 201);
      }

      if (url.pathname === "/api/assistant/external-evidence") {
        if (requestMethod(init) === "POST") {
          const body = await readJsonBody(init);
          const externalEvidence = createExternalEvidenceRecord(
            `preview-external-${externalEvidenceRecords.length + 1}`,
            body,
          );
          externalEvidenceRecords.unshift(externalEvidence);
          return jsonResponse({ externalEvidence }, 201);
        }
        return jsonResponse(externalEvidenceRecords);
      }

      if (url.pathname === "/api/assistant/action-audits") {
        if (requestMethod(init) === "POST") {
          const body = await readJsonBody(init);
          const audit = createActionAuditRecord(`preview-action-audit-${actionAuditRecords.length + 1}`, body);
          actionAuditRecords.unshift(audit);
          return jsonResponse(audit, 201);
        }
        return jsonResponse(actionAuditRecords);
      }

      if (url.pathname === "/api/assistant/policy") {
        return jsonResponse({
          enabled: true,
          provider: "mock",
          model: "preview-deterministic",
          externalEvidenceAllowed: true,
          allowedEvidenceKinds: ["central_knowledge", "project_wiki", "task", "project_document", "web_or_skill"],
        });
      }

      if (url.pathname === "/api/assistant/retrieve") {
        return jsonResponse({
          taskContext: {
            taskId: previewTask.id,
            projectId: previewTask.projectId,
            title: previewTask.issueTitle,
            description: previewTask.issueDetailNote,
            status: previewTask.status,
            issueId: previewTask.issueId,
            projectName: "Preview Project",
          },
          evidence: [
            {
              id: "task:preview-assistant-task-001",
              kind: "task",
              priority: 1,
              title: "선택된 task 기록",
              excerpt: previewTask.issueDetailNote,
              confidenceWeight: 0.76,
            },
            {
              id: "web:preview-external-001",
              kind: "web_or_skill",
              priority: 2,
              title: "제조사 앵커 설치 허용 오차",
              excerpt: "승인된 외부 근거는 접힌 영역에서만 추가하고, 생성 결과에는 출처와 함께 반영합니다.",
              sourceUrl: "https://example.com/curtain-wall-anchor-guide",
              confidenceWeight: 0.68,
            },
          ],
          unavailableEvidenceKinds: ["regulation", "project_document"],
        });
      }

      if (url.pathname === "/api/assistant/summaries") {
        return jsonResponse({ ok: true });
      }

      if (url.pathname === `/api/tasks/${previewTask.id}` || url.pathname === "/api/tasks") {
        return jsonResponse(previewTask);
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return (
    <main className="assistant-preview-page">
      <section className="assistant-preview-page__surface" aria-label="공개 assistant preview">
        <p className="workspace__eyebrow">Preview Verification</p>
        <h1>브라우저 어시스턴트 UI</h1>
        <p className="workspace__meta">배포 화면 확인 전용 샘플 task입니다. 실제 프로젝트 데이터나 API를 사용하지 않습니다.</p>
      </section>
      <TaskAssistantPanel defaultExecutionMode="mock" defaultOpen selectedTask={selectedTask} />
    </main>
  );
}

function requestMethod(init?: RequestInit) {
  return init?.method?.toUpperCase() ?? "GET";
}

async function readJsonBody(init?: RequestInit) {
  if (typeof init?.body !== "string") {
    return {} as Record<string, unknown>;
  }
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function isPreviewFileAnalysisPath(pathname: string) {
  return pathname === "/api/files/preview-file-001/analysis";
}

function createPreviewFile() {
  return {
    id: "preview-file-001",
    originalName: "A-500_curtain-wall-anchor.pdf",
    metadata: {
      analysis: [
        {
          id: "preview-analysis-001",
          sourceType: "image_region",
          verificationState: "verified",
          summary: "앵커 플레이트와 보강재가 같은 그리드 축에 걸려 있어 시공 여유 치수 확인이 필요합니다.",
          confidenceWeight: 0.82,
          provider: "preview",
          providerStatus: "complete",
          region: { pageNumber: 5, x: 42, y: 28, width: 18, height: 12, unit: "percent" },
          createdAt: previewNow,
        },
      ],
    },
  };
}

type PreviewFile = ReturnType<typeof createPreviewFile>;
type PreviewAnalysisRegion = PreviewFile["metadata"]["analysis"][number]["region"];

function addPreviewFileAnalysis(file: PreviewFile, body: Record<string, unknown>) {
  const sourceType = readString(body.sourceType) || (readString(body.mode) === "ocr_extract" ? "ocr_text" : "manual_text");
  const summary =
    readString(body.summary) ||
    readString(body.extractedText) ||
    (readString(body.mode) === "auto_extract"
      ? "Preview 자동 텍스트 추출 결과입니다."
      : "Preview OCR 결과 추출 근거입니다.");
  const analysis = {
    id: `preview-analysis-${file.metadata.analysis.length + 1}`,
    sourceType,
    verificationState: "unverified",
    summary,
    confidenceWeight: 0.72,
    provider: readString(body.provider) || "preview",
    providerStatus: readString(body.providerStatus) || "client_supplied",
    region: normalizePreviewRegion(body.region),
    createdAt: previewNow,
  };

  return {
    ...file,
    metadata: {
      ...file.metadata,
      analysis: [analysis, ...file.metadata.analysis],
    },
  };
}

function normalizePreviewRegion(value: unknown): PreviewAnalysisRegion {
  const fallback: PreviewAnalysisRegion = { pageNumber: 1, x: 0, y: 0, width: 100, height: 100, unit: "percent" };
  if (!isPlainObject(value)) {
    return fallback;
  }
  return {
    pageNumber: readNumber(value.pageNumber, fallback.pageNumber),
    x: readNumber(value.x, fallback.x),
    y: readNumber(value.y, fallback.y),
    width: readNumber(value.width, fallback.width),
    height: readNumber(value.height, fallback.height),
    unit: readString(value.unit) || fallback.unit,
  };
}

function createExternalEvidenceRecord(id: string, body: Record<string, unknown> = {}) {
  return {
    id,
    taskId: previewTask.id,
    sourceType: readString(body.sourceType) || "manufacturer_doc",
    title: readString(body.title) || "제조사 앵커 설치 허용 오차",
    excerpt:
      readString(body.excerpt) ||
      "앵커 중심선과 보강재 간 최소 이격을 확보해야 하며, 편심 시 구조 검토 확인이 필요합니다.",
    sourceUrl: readString(body.sourceUrl) || "https://example.com/curtain-wall-anchor-guide",
    toolName: readString(body.toolName) || "preview",
    capturedAt: readString(body.capturedAt) || previewNow,
  };
}

function createActionAuditRecord(id: string, body: Record<string, unknown>) {
  return {
    id,
    action: readString(body.action) || "task_update_applied",
    projectId: previewTask.projectId,
    sourceTaskId: readString(body.sourceTaskId) || previewTask.id,
    targetTaskId: readString(body.targetTaskId) || previewTask.id,
    createdTaskId: readString(body.createdTaskId) || null,
    assistantRecordId: readString(body.assistantRecordId) || "preview-record",
    summary: isPlainObject(body.summary) ? body.summary : null,
    statusFrom: readString(body.statusFrom) || null,
    statusTo: readString(body.statusTo) || null,
    decisionMarker: readString(body.decisionMarker) || null,
    createdBy: "preview-user",
    createdAt: previewNow,
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function createReviewSessionItem(id: string, body: Record<string, unknown>) {
  const answer = typeof body.answer === "string" ? body.answer : "샘플 검토 의견입니다.";
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "012 검토";
  return {
    id,
    taskId: previewTask.id,
    title,
    question: typeof body.question === "string" ? body.question : "012 task의 검토 근거와 후속 조치를 정리해줘.",
    answerPreview: answer.slice(0, 140),
    verdict: null,
    conclusionMayChange: false,
    savedAt: previewNow,
    updatedAt: previewNow,
    savedRecord: {
      id: `preview-record-${id}`,
      taskId: previewTask.id,
      confidenceScore: 84,
      confidenceReason: "샘플 task 기록과 승인된 외부 근거가 함께 사용되었습니다.",
      executionMode: "mock",
      runtimeMode: "preview-assistant-panel",
      draftSummary: isDraftSummary(body.draftSummary) ? body.draftSummary : null,
      candidateState: "candidate",
      createdAt: previewNow,
      updatedAt: previewNow,
    },
  };
}

function createReviewSessionDetail(item: ReturnType<typeof createReviewSessionItem>, body: Record<string, unknown>) {
  const evidence = Array.isArray(body.evidence) ? body.evidence : [];
  return {
    ...item,
    answer: typeof body.answer === "string" ? body.answer : item.answerPreview,
    savedEvidenceSnapshot: evidence,
    latestEvidenceSnapshot: evidence,
    savedWikiEvidence: [],
    latestWikiEvidence: [],
    savedHistoryEvidence: [],
    latestHistoryEvidence: [],
  };
}

function toReviewSessionItem(detail: ReturnType<typeof createReviewSessionDetail>) {
  const { answer: _answer, savedEvidenceSnapshot: _savedEvidence, latestEvidenceSnapshot: _latestEvidence, savedWikiEvidence: _savedWiki, latestWikiEvidence: _latestWiki, savedHistoryEvidence: _savedHistory, latestHistoryEvidence: _latestHistory, ...item } = detail;
  return item;
}

function isDraftSummary(value: unknown) {
  return Boolean(value) && typeof value === "object";
}

function createHistoryRecord(id: string) {
  return {
    id,
    taskId: previewTask.id,
    question: "커튼월 앵커 간섭 검토 근거와 후속 조치를 정리해줘.",
    answer: "샘플 검토 의견입니다. 도면, 제조사 기준, 구조 검토 이력을 함께 확인해야 합니다.",
    evidenceCount: 2,
    evidenceKinds: ["task", "web_or_skill"],
    confidenceScore: 84,
    confidenceReason: "샘플 task 기록과 승인된 외부 근거가 함께 사용되었습니다.",
    executionMode: "mock",
    runtimeMode: "preview-assistant-panel",
    draftSummary: {
      conclusion: "앵커 위치 간섭 가능성이 있어 공식 도면과 제조사 기준 확인이 필요합니다.",
      tags: ["assistant", "preview", "외장검토"],
      scope: previewTask.issueId,
      followUpAction: "구조 담당자와 앵커 편심 허용 여부를 확인하고 task 기록에 반영하세요.",
    },
    cleanupState: "draft",
    candidateState: "candidate",
    createdAt: previewNow,
    updatedAt: previewNow,
  };
}
