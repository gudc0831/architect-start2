import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { knowledgeAuditEventTypes } from "@/domains/admin/knowledge-workflow";
import type { AuthUser } from "@/domains/auth/types";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { assistantRepository } from "@/repositories/assistant";
import { getOrCreateActiveKnowledgeImportRubric } from "@/use-cases/admin/knowledge-rubric-service";

export type KnowledgeImportPreviewItemInput = {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  bodyMarkdown?: unknown;
  tags?: unknown;
  targetTaskId?: unknown;
};

export type KnowledgeImportPreviewView = {
  id: string;
  projectId: string;
  defaultTaskId: string | null;
  rubricId: string;
  rubricVersion: number;
  state: string;
  workspaceFingerprint: string;
  includedItems: unknown;
  excludedItems: unknown;
  createdBy: string;
  confirmedBy: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

type CreateImportPreviewInput = {
  projectId: string;
  defaultTaskId?: unknown;
  workspaceFingerprint?: unknown;
  items?: unknown;
};

const secretPatterns = [
  /OPENAI_API_KEY\s*=/i,
  /Authorization:\s*Bearer\s+\S+/i,
  /DATABASE_URL\s*=/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /[A-Z]:\\Users\\/i,
  /\/home\/[^/\s]+/i,
];

export async function listKnowledgeImportPreviews(projectId: string): Promise<KnowledgeImportPreviewView[]> {
  const previews = await prisma.knowledgeImportPreview.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return previews.map(toImportPreviewView);
}

export async function createKnowledgeImportPreview(
  input: CreateImportPreviewInput,
  user: AuthUser,
): Promise<KnowledgeImportPreviewView> {
  const defaultTaskId = normalizeOptionalText(input.defaultTaskId);
  if (defaultTaskId) {
    await assertTaskInProject(input.projectId, defaultTaskId);
  }
  const rubric = await getOrCreateActiveKnowledgeImportRubric(user);
  const items = Array.isArray(input.items) ? input.items : [];
  const includedItems: Array<Record<string, unknown>> = [];
  const excludedItems: Array<Record<string, unknown>> = [];

  for (const rawItem of items) {
    const item = normalizePreviewItem(rawItem);
    const blockedReason = readBlockedReason(`${item.title}\n${item.summary}\n${item.bodyMarkdown}`);
    if (blockedReason) {
      excludedItems.push({
        id: item.id,
        title: redactSensitiveText(item.title),
        titleDigest: hashSource(item.title),
        reason: blockedReason,
      });
      continue;
    }
    includedItems.push({
      id: item.id,
      title: item.title,
      summary: item.summary,
      bodyMarkdown: item.bodyMarkdown,
      tags: item.tags,
      targetTaskId: item.targetTaskId || defaultTaskId,
      score: scorePreviewItem(item),
    });
  }

  for (const item of includedItems) {
    const targetTaskId = normalizeOptionalText(item.targetTaskId);
    if (!targetTaskId) {
      throw badRequest("Included import preview item needs targetTaskId or preview defaultTaskId.", "KNOWLEDGE_IMPORT_TARGET_TASK_REQUIRED");
    }
    await assertTaskInProject(input.projectId, targetTaskId);
  }

  const preview = await prisma.knowledgeImportPreview.create({
    data: {
      projectId: input.projectId,
      defaultTaskId: defaultTaskId || null,
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      state: "ready",
      workspaceFingerprint: createWorkspaceFingerprint(input.workspaceFingerprint, includedItems),
      includedItems: includedItems as Prisma.InputJsonValue,
      excludedItems: excludedItems as Prisma.InputJsonValue,
      createdBy: user.id,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.projectId,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.importPreviewCreated,
    targetType: "knowledge_import_preview",
    targetId: preview.id,
    metadata: {
      includedCount: includedItems.length,
      excludedCount: excludedItems.length,
      rubricId: rubric.id,
      rubricVersion: rubric.version,
    },
  });
  return toImportPreviewView(preview);
}

export async function confirmKnowledgeImportPreview(
  input: { projectId: string; previewId: string },
  user: AuthUser,
): Promise<KnowledgeImportPreviewView> {
  const preview = await prisma.knowledgeImportPreview.findFirst({
    where: { id: normalizeRequiredText(input.previewId, "previewId"), projectId: input.projectId },
  });
  if (!preview) {
    throw notFound("Import preview not found.", "KNOWLEDGE_IMPORT_PREVIEW_NOT_FOUND");
  }
  if (preview.state !== "ready") {
    throw conflict("Only ready import previews can be confirmed.", "KNOWLEDGE_IMPORT_CONFIRM_STATE_INVALID");
  }
  const updated = await prisma.knowledgeImportPreview.update({
    where: { id: preview.id },
    data: { state: "confirmed", confirmedBy: user.id, confirmedAt: new Date() },
  });
  await assistantRepository.createAuditEvent({
    projectId: input.projectId,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.importPreviewConfirmed,
    targetType: "knowledge_import_preview",
    targetId: preview.id,
    metadata: {
      rubricId: preview.rubricId,
      rubricVersion: preview.rubricVersion,
      includedCount: Array.isArray(preview.includedItems) ? preview.includedItems.length : 0,
    },
  });
  return toImportPreviewView(updated);
}

export async function importKnowledgeImportPreview(
  input: { projectId: string; previewId: string },
  user: AuthUser,
) {
  const preview = await prisma.knowledgeImportPreview.findFirst({
    where: { id: normalizeRequiredText(input.previewId, "previewId"), projectId: input.projectId },
  });
  if (!preview) {
    throw notFound("Import preview not found.", "KNOWLEDGE_IMPORT_PREVIEW_NOT_FOUND");
  }
  if (preview.state !== "confirmed") {
    throw conflict("Only confirmed import previews can be imported.", "KNOWLEDGE_IMPORT_STATE_INVALID");
  }

  const items = readIncludedItems(preview.includedItems);
  if (!items.length) {
    throw badRequest("Import preview has no included items.", "KNOWLEDGE_IMPORT_EMPTY");
  }
  for (const item of items) {
    const targetTaskId = normalizeRequiredText(item.targetTaskId, "targetTaskId");
    await assertTaskInProject(input.projectId, targetTaskId);
  }
  const created = await prisma.$transaction(async (tx) => {
    const updateResult = await tx.knowledgeImportPreview.updateMany({
      where: { id: preview.id, projectId: input.projectId, state: "confirmed" },
      data: { state: "imported" },
    });
    if (updateResult.count !== 1) {
      throw conflict("Import preview was already transitioned.", "KNOWLEDGE_IMPORT_TRANSITION_RACE");
    }
    const createdRecords = [];
    for (const item of items) {
      const targetTaskId = normalizeRequiredText(item.targetTaskId, "targetTaskId");
      const sourceDigest = hashSource(`${preview.id}:${item.id}:${item.bodyMarkdown}`);
      const record = await tx.assistantTaskRecord.create({
        data: {
          projectId: input.projectId,
          taskId: targetTaskId,
          profileId: user.id,
          question: `로컬 WIKI 가져오기 후보: ${item.title}`,
          answer: item.bodyMarkdown,
          evidence: [],
          confidenceScore: Math.max(0, Math.min(100, Math.round(Number(item.score ?? 0)))),
          confidenceReason: "로컬 WIKI 가져오기 미리보기에서 균형 선별을 통과했습니다.",
          executionMode: "mock",
          runtimeMode: "local-wiki-import",
          draftSummary: {
            conclusion: item.summary,
            tags: item.tags,
            scope: "organization",
            followUpAction: "관리자 승인 검토",
          } as Prisma.InputJsonValue,
          candidateState: "pending_review",
          metadata: {
            knowledgeCandidateSource: {
              type: "local_wiki_import",
              refId: preview.id,
              sourceDigest,
              importedAt: new Date().toISOString(),
            },
          } as Prisma.InputJsonValue,
        },
      });
      createdRecords.push(record);
      await tx.assistantAuditEvent.create({
        data: {
          projectId: input.projectId,
          profileId: user.id,
          eventType: knowledgeAuditEventTypes.importCandidateImported,
          targetType: "knowledge_import_preview",
          targetId: preview.id,
          metadata: {
            candidateId: record.id,
            itemId: item.id,
            targetTaskId,
            sourceDigest,
          } as Prisma.InputJsonValue,
        },
      });
    }
    return createdRecords;
  });
  return created;
}

export function readBlockedReason(text: string) {
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) {
      return "blocked_secret_or_local_path";
    }
  }
  return "";
}

function normalizePreviewItem(rawValue: unknown) {
  const raw = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
    ? rawValue as KnowledgeImportPreviewItemInput
    : {};
  const title = normalizeOptionalText(raw.title).slice(0, 160) || "Untitled local WIKI";
  const summary = normalizeOptionalText(raw.summary).slice(0, 500);
  const bodyMarkdown = normalizeOptionalText(raw.bodyMarkdown);
  return {
    id: normalizeOptionalText(raw.id) || hashSource(`${title}:${summary}:${bodyMarkdown}`).slice(0, 16),
    title,
    summary,
    bodyMarkdown,
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => normalizeOptionalText(tag)).filter(Boolean).slice(0, 12) : [],
    targetTaskId: normalizeOptionalText(raw.targetTaskId),
    score: typeof (raw as { score?: unknown }).score === "number" ? (raw as { score: number }).score : 0,
  };
}

function readIncludedItems(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => normalizePreviewItem(item));
}

function scorePreviewItem(item: { summary: string; bodyMarkdown: string; tags: string[] }) {
  let score = 40;
  if (item.summary) score += 15;
  if (item.bodyMarkdown.length >= 200) score += 20;
  if (item.tags.length) score += 10;
  return Math.min(100, score);
}

async function assertTaskInProject(projectId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { projectId_id: { projectId, id: taskId } },
    select: { id: true, purgedAt: true },
  });
  if (!task || task.purgedAt) {
    throw badRequest("Import preview task is not available in the current project.", "KNOWLEDGE_IMPORT_TASK_SCOPE_INVALID");
  }
}

function toImportPreviewView(preview: {
  id: string;
  projectId: string;
  defaultTaskId: string | null;
  rubricId: string;
  rubricVersion: number;
  state: string;
  workspaceFingerprint: string;
  includedItems: Prisma.JsonValue;
  excludedItems: Prisma.JsonValue;
  createdBy: string;
  confirmedBy: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
}): KnowledgeImportPreviewView {
  return {
    id: preview.id,
    projectId: preview.projectId,
    defaultTaskId: preview.defaultTaskId,
    rubricId: preview.rubricId,
    rubricVersion: preview.rubricVersion,
    state: preview.state,
    workspaceFingerprint: preview.workspaceFingerprint,
    includedItems: preview.includedItems,
    excludedItems: preview.excludedItems,
    createdBy: preview.createdBy,
    confirmedBy: preview.confirmedBy,
    createdAt: preview.createdAt.toISOString(),
    confirmedAt: preview.confirmedAt?.toISOString() ?? null,
  };
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = normalizeOptionalText(value);
  if (!text) {
    throw badRequest(`${label} is required.`, "KNOWLEDGE_IMPORT_REQUIRED_FIELD");
  }
  return text;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createWorkspaceFingerprint(value: unknown, includedItems: Array<Record<string, unknown>>) {
  const normalized = normalizeOptionalText(value);
  const basis = normalized || JSON.stringify(includedItems.map((item) => item.id));
  return `sha256:${hashSource(basis)}`;
}

function redactSensitiveText(value: string) {
  return readBlockedReason(value) ? "[redacted]" : value.slice(0, 160);
}

function hashSource(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
