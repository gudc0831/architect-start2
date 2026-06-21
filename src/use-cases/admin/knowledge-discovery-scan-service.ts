import { randomUUID } from "node:crypto";
import type { AuthUser } from "@/domains/auth/types";
import type { TaskRecord } from "@/domains/task/types";
import { taskRepository } from "@/repositories";
import {
  createKnowledgeDiscoveryRequest,
  listKnowledgeDiscoveryRequests,
} from "@/use-cases/admin/knowledge-discovery-service";

export type KnowledgeDiscoveryScanResult = {
  scanId: string;
  scannedTaskCount: number;
  createdRequestCount: number;
};

export async function runKnowledgeDiscoveryScan(projectId: string, user: AuthUser): Promise<KnowledgeDiscoveryScanResult> {
  const scanId = randomUUID();
  const [tasks, existing] = await Promise.all([
    taskRepository.listActiveTasks(projectId),
    listKnowledgeDiscoveryRequests(projectId),
  ]);
  const existingTaskIds = new Set(existing.filter((request) => request.state !== "stale").map((request) => request.taskId));
  const selected = selectDiscoveryCandidates(tasks).filter((task) => !existingTaskIds.has(task.id)).slice(0, 10);
  for (const task of selected) {
    await createKnowledgeDiscoveryRequest({
      projectId,
      taskId: task.id,
      scanId,
      recommendationScore: scoreTask(task),
      recommendationReason: createRecommendationReason(task),
      evidenceSummary: {
        taskId: task.id,
        status: task.status,
        completedAt: task.completedAt,
        hasDecision: Boolean(task.decision.trim()),
      },
    }, user);
  }
  return {
    scanId,
    scannedTaskCount: tasks.length,
    createdRequestCount: selected.length,
  };
}

function selectDiscoveryCandidates(tasks: TaskRecord[]) {
  return tasks
    .filter((task) => !task.deletedAt && !task.purgedAt)
    .filter((task) => task.status === "done" || Boolean(task.completedAt) || task.decision.trim().length >= 80)
    .sort((left, right) => scoreTask(right) - scoreTask(left));
}

function scoreTask(task: TaskRecord) {
  let score = 35;
  if (task.status === "done") score += 20;
  if (task.completedAt) score += 15;
  if (task.decision.trim().length >= 80) score += 20;
  if (task.issueDetailNote.trim().length >= 120) score += 10;
  return Math.min(100, score);
}

function createRecommendationReason(task: TaskRecord) {
  const basis = [
    task.status === "done" ? "완료 상태" : "",
    task.completedAt ? "완료일 존재" : "",
    task.decision.trim() ? "결정/결론 메모 존재" : "",
    task.issueDetailNote.trim() ? "업무 상세 메모 존재" : "",
  ].filter(Boolean).join(", ");
  return `${task.issueId || task.id} / ${task.issueTitle}: ${basis || "업무 기록"} 기준으로 WIKI 후보 검토 가치가 있습니다.`;
}
