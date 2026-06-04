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

      if (url.pathname === "/api/files") {
        return jsonResponse([
          {
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
          },
        ]);
      }

      if (url.pathname === "/api/assistant/external-evidence") {
        return jsonResponse([
          {
            id: "preview-external-001",
            taskId: previewTask.id,
            sourceType: "manufacturer_doc",
            title: "제조사 앵커 설치 허용 오차",
            excerpt: "앵커 중심선과 보강재 간 최소 이격을 확보해야 하며, 편심 시 구조 검토 확인이 필요합니다.",
            sourceUrl: "https://example.com/curtain-wall-anchor-guide",
            toolName: "preview",
            capturedAt: previewNow,
          },
        ]);
      }

      if (url.pathname === "/api/assistant/policy") {
        return jsonResponse({
          enabled: true,
          provider: "mock",
          model: "preview-deterministic",
          externalEvidenceAllowed: true,
          allowedEvidenceKinds: ["central_knowledge", "task", "project_document", "web_or_skill"],
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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json" },
    status,
  });
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
