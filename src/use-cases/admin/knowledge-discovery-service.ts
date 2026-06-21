import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { knowledgeAuditEventTypes } from "@/domains/admin/knowledge-workflow";
import type { AuthUser } from "@/domains/auth/types";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { assistantRepository } from "@/repositories/assistant";

export type KnowledgeDiscoveryRequestView = {
  id: string;
  projectId: string;
  taskId: string;
  scanId: string;
  state: string;
  recommendationScore: number;
  recommendationReason: string;
  evidenceSummary: unknown;
  promotedCandidateId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CreateDiscoveryRequestInput = {
  projectId: string;
  taskId: unknown;
  scanId?: unknown;
  recommendationScore?: unknown;
  recommendationReason?: unknown;
  evidenceSummary?: unknown;
};

export async function listKnowledgeDiscoveryRequests(projectId: string): Promise<KnowledgeDiscoveryRequestView[]> {
  const requests = await prisma.knowledgeDiscoveryRequest.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return requests.map(toDiscoveryView);
}

export async function createKnowledgeDiscoveryRequest(
  input: CreateDiscoveryRequestInput,
  user: AuthUser,
): Promise<KnowledgeDiscoveryRequestView> {
  const task = await prisma.task.findUnique({
    where: { projectId_id: { projectId: input.projectId, id: normalizeRequiredText(input.taskId, "taskId") } },
  });
  if (!task || task.purgedAt) {
    throw badRequest("Discovery request task is not available in the current project.", "KNOWLEDGE_DISCOVERY_TASK_SCOPE_INVALID");
  }

  const scanId = normalizeOptionalText(input.scanId) || randomUUID();
  const request = await prisma.knowledgeDiscoveryRequest.upsert({
    where: { scanId_taskId: { scanId, taskId: task.id } },
    create: {
      projectId: input.projectId,
      taskId: task.id,
      scanId,
      state: "new",
      recommendationScore: normalizeScore(input.recommendationScore),
      recommendationReason: normalizeOptionalText(input.recommendationReason).slice(0, 1000),
      evidenceSummary: sanitizeJson(input.evidenceSummary, {}),
      reviewedBy: user.id,
      reviewedAt: new Date(),
    },
    update: {
      state: "reviewed",
      recommendationScore: normalizeScore(input.recommendationScore),
      recommendationReason: normalizeOptionalText(input.recommendationReason).slice(0, 1000),
      evidenceSummary: sanitizeJson(input.evidenceSummary, {}),
      reviewedBy: user.id,
      reviewedAt: new Date(),
    },
  });
  return toDiscoveryView(request);
}

export async function dismissKnowledgeDiscoveryRequest(
  input: { projectId: string; requestId: string },
  user: AuthUser,
): Promise<KnowledgeDiscoveryRequestView> {
  const request = await prisma.knowledgeDiscoveryRequest.findFirst({
    where: { id: normalizeRequiredText(input.requestId, "requestId"), projectId: input.projectId },
  });
  if (!request) {
    throw notFound("Discovery request not found.", "KNOWLEDGE_DISCOVERY_REQUEST_NOT_FOUND");
  }
  if (request.state === "promoted") {
    throw conflict("Promoted discovery requests cannot be dismissed.", "KNOWLEDGE_DISCOVERY_ALREADY_PROMOTED");
  }

  const updated = await prisma.knowledgeDiscoveryRequest.update({
    where: { id: request.id },
    data: { state: "dismissed", reviewedBy: user.id, reviewedAt: new Date() },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.projectId,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.discoveryDismissed,
    targetType: "knowledge_discovery_request",
    targetId: request.id,
    metadata: { fromState: request.state, toState: "dismissed" },
  });
  return toDiscoveryView(updated);
}

export async function promoteKnowledgeDiscoveryRequest(
  input: { projectId: string; requestId: string },
  user: AuthUser,
) {
  const request = await prisma.knowledgeDiscoveryRequest.findFirst({
    where: { id: normalizeRequiredText(input.requestId, "requestId"), projectId: input.projectId },
  });
  if (!request) {
    throw notFound("Discovery request not found.", "KNOWLEDGE_DISCOVERY_REQUEST_NOT_FOUND");
  }
  if (request.state !== "new" && request.state !== "reviewed") {
    throw conflict("Discovery request cannot be promoted from its current state.", "KNOWLEDGE_DISCOVERY_PROMOTION_INVALID");
  }

  const task = await prisma.task.findUnique({
    where: { projectId_id: { projectId: request.projectId, id: request.taskId } },
    select: { id: true, projectId: true, title: true, issueId: true, purgedAt: true },
  });
  if (!task || task.purgedAt) {
    throw badRequest("Discovery request task is not available in the current project.", "KNOWLEDGE_DISCOVERY_TASK_SCOPE_INVALID");
  }

  const sourceDigest = hashSource(`${request.id}:${request.updatedAt.toISOString()}:${request.recommendationReason}`);
  const record = await prisma.$transaction(async (tx) => {
    const claim = await tx.knowledgeDiscoveryRequest.updateMany({
      where: { id: request.id, projectId: input.projectId, state: { in: ["new", "reviewed"] } },
      data: {
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
    if (claim.count !== 1) {
      throw conflict("Discovery request was already transitioned.", "KNOWLEDGE_DISCOVERY_TRANSITION_RACE");
    }
    const created = await tx.assistantTaskRecord.create({
      data: {
        projectId: request.projectId,
        taskId: request.taskId,
        profileId: user.id,
        question: `자동 발굴 WIKI 후보: ${task.issueId || task.id}`,
        answer: request.recommendationReason || "자동 발굴 요청에서 WIKI 후보 승격이 필요하다고 판단했습니다.",
        evidence: [],
        confidenceScore: request.recommendationScore,
        confidenceReason: "자동 발굴 요청을 후보로 승격했습니다.",
        executionMode: "mock",
        runtimeMode: "knowledge-discovery",
        draftSummary: {},
        candidateState: "pending_review",
        metadata: {
          knowledgeCandidateSource: {
            type: "discovery_request",
            refId: request.id,
            sourceDigest,
            importedAt: new Date().toISOString(),
          },
        } as Prisma.InputJsonValue,
      },
    });
    await tx.knowledgeDiscoveryRequest.update({
      where: { id: request.id },
      data: {
        state: "promoted",
        promotedCandidateId: created.id,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
    await tx.assistantAuditEvent.create({
      data: {
        projectId: input.projectId,
        profileId: user.id,
        eventType: knowledgeAuditEventTypes.discoveryPromoted,
        targetType: "knowledge_discovery_request",
        targetId: request.id,
        metadata: {
          fromState: request.state,
          toState: "promoted",
          promotedCandidateId: created.id,
          sourceDigest,
        } as Prisma.InputJsonValue,
      },
    });
    return created;
  });
  return record;
}

function toDiscoveryView(request: {
  id: string;
  projectId: string;
  taskId: string;
  scanId: string;
  state: string;
  recommendationScore: number;
  recommendationReason: string;
  evidenceSummary: Prisma.JsonValue;
  promotedCandidateId: string | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeDiscoveryRequestView {
  return {
    id: request.id,
    projectId: request.projectId,
    taskId: request.taskId,
    scanId: request.scanId,
    state: request.state,
    recommendationScore: request.recommendationScore,
    recommendationReason: request.recommendationReason,
    evidenceSummary: request.evidenceSummary,
    promotedCandidateId: request.promotedCandidateId,
    reviewedBy: request.reviewedBy,
    reviewedAt: request.reviewedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw badRequest(`${label} is required.`, "KNOWLEDGE_DISCOVERY_REQUIRED_FIELD");
  }
  return text;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeScore(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(number)));
}

function sanitizeJson(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value && typeof value === "object" ? (value as Prisma.InputJsonValue) : fallback;
}

function hashSource(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
