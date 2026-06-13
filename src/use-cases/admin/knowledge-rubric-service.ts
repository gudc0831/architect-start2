import { Prisma } from "@prisma/client";
import { knowledgeAuditEventTypes } from "@/domains/admin/knowledge-workflow";
import type { AuthUser } from "@/domains/auth/types";
import { badRequest, conflict, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import { assistantRepository } from "@/repositories/assistant";

export type KnowledgeImportRubricView = {
  id: string;
  name: string;
  version: number;
  state: string;
  hardBlockers: unknown;
  scoringCriteria: unknown;
  weights: unknown;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

type CreateRubricInput = {
  name?: unknown;
  hardBlockers?: unknown;
  scoringCriteria?: unknown;
  weights?: unknown;
};

const defaultRubricName = "wiki-import-rubric";

export async function listKnowledgeImportRubrics(): Promise<KnowledgeImportRubricView[]> {
  const rubrics = await prisma.knowledgeImportRubric.findMany({
    orderBy: [{ state: "asc" }, { updatedAt: "desc" }],
    take: 100,
  });
  return rubrics.map(toRubricView);
}

export async function getOrCreateActiveKnowledgeImportRubric(user: AuthUser) {
  const active = await prisma.knowledgeImportRubric.findFirst({ where: { state: "active" } });
  if (active) {
    return active;
  }
  const rubric = await prisma.knowledgeImportRubric.create({
    data: {
      name: defaultRubricName,
      version: 1,
      state: "active",
      hardBlockers: [
        "secrets",
        "credentials",
        "absolute_local_paths",
      ] as Prisma.InputJsonValue,
      scoringCriteria: [
        "재사용 가치",
        "근거 강도",
        "업무 연결성",
        "최신성",
        "WIKI 공백 보완성",
        "초안 작성 가능성",
        "위험도",
      ] as Prisma.InputJsonValue,
      weights: {
        reuse: 20,
        evidence: 20,
        taskFit: 15,
        freshness: 10,
        gapFill: 15,
        draftability: 10,
        risk: -10,
      } as Prisma.InputJsonValue,
      createdBy: user.id,
      updatedBy: user.id,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: null,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.rubricActivated,
    targetType: "knowledge_import_rubric",
    targetId: rubric.id,
    metadata: { name: rubric.name, version: rubric.version, bootstrap: true },
  });
  return rubric;
}

export async function createKnowledgeImportRubricDraft(
  input: CreateRubricInput,
  user: AuthUser,
): Promise<KnowledgeImportRubricView> {
  const name = normalizeOptionalText(input.name) || defaultRubricName;
  const latest = await prisma.knowledgeImportRubric.findFirst({
    where: { name },
    orderBy: { version: "desc" },
  });
  const rubric = await prisma.knowledgeImportRubric.create({
    data: {
      name,
      version: (latest?.version ?? 0) + 1,
      state: "draft",
      hardBlockers: sanitizeJson(input.hardBlockers, []),
      scoringCriteria: sanitizeJson(input.scoringCriteria, []),
      weights: sanitizeJson(input.weights, {}),
      createdBy: user.id,
      updatedBy: user.id,
    },
  });
  await assistantRepository.createAuditEvent({
    projectId: null,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.rubricCreated,
    targetType: "knowledge_import_rubric",
    targetId: rubric.id,
    metadata: { name: rubric.name, version: rubric.version },
  });
  return toRubricView(rubric);
}

export async function activateKnowledgeImportRubric(rubricId: string, user: AuthUser): Promise<KnowledgeImportRubricView> {
  const rubric = await prisma.knowledgeImportRubric.findUnique({ where: { id: normalizeRequiredText(rubricId, "rubricId") } });
  if (!rubric) {
    throw notFound("Rubric not found.", "KNOWLEDGE_RUBRIC_NOT_FOUND");
  }
  if (rubric.state === "active") {
    return toRubricView(rubric);
  }
  if (rubric.state !== "draft" && rubric.state !== "archived") {
    throw conflict("Only draft or archived rubrics can be activated.", "KNOWLEDGE_RUBRIC_ACTIVATE_STATE_INVALID");
  }
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const previous = await tx.knowledgeImportRubric.findFirst({ where: { state: "active" } });
    if (previous) {
      await tx.knowledgeImportRubric.update({
        where: { id: previous.id },
        data: { state: "archived", archivedAt: now, updatedBy: user.id },
      });
    }
    return tx.knowledgeImportRubric.update({
      where: { id: rubric.id },
      data: { state: "active", archivedAt: null, updatedBy: user.id },
    });
  });
  await assistantRepository.createAuditEvent({
    projectId: null,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.rubricActivated,
    targetType: "knowledge_import_rubric",
    targetId: updated.id,
    metadata: { name: updated.name, version: updated.version },
  });
  return toRubricView(updated);
}

export async function rollbackKnowledgeImportRubric(
  rubricId: string,
  input: { reason?: unknown },
  user: AuthUser,
): Promise<KnowledgeImportRubricView> {
  const reason = normalizeOptionalText(input.reason);
  if (!reason) {
    throw badRequest("Rollback reason is required.", "KNOWLEDGE_RUBRIC_ROLLBACK_REASON_REQUIRED");
  }
  const restored = await prisma.knowledgeImportRubric.findUnique({ where: { id: normalizeRequiredText(rubricId, "rubricId") } });
  if (!restored || restored.state !== "archived") {
    throw conflict("Only archived rubrics can be rolled back.", "KNOWLEDGE_RUBRIC_ROLLBACK_STATE_INVALID");
  }
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const current = await tx.knowledgeImportRubric.findFirst({ where: { state: "active" } });
    if (current) {
      await tx.knowledgeImportRubric.update({
        where: { id: current.id },
        data: { state: "archived", archivedAt: now, updatedBy: user.id },
      });
    }
    return tx.knowledgeImportRubric.update({
      where: { id: restored.id },
      data: { state: "active", archivedAt: null, updatedBy: user.id },
    });
  });
  await assistantRepository.createAuditEvent({
    projectId: null,
    profileId: user.id,
    eventType: knowledgeAuditEventTypes.rubricRolledBack,
    targetType: "knowledge_import_rubric",
    targetId: updated.id,
    metadata: { reason, restoredRubricId: updated.id, restoredVersion: updated.version },
  });
  return toRubricView(updated);
}

function toRubricView(rubric: {
  id: string;
  name: string;
  version: number;
  state: string;
  hardBlockers: Prisma.JsonValue;
  scoringCriteria: Prisma.JsonValue;
  weights: Prisma.JsonValue;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}): KnowledgeImportRubricView {
  return {
    id: rubric.id,
    name: rubric.name,
    version: rubric.version,
    state: rubric.state,
    hardBlockers: rubric.hardBlockers,
    scoringCriteria: rubric.scoringCriteria,
    weights: rubric.weights,
    createdBy: rubric.createdBy,
    updatedBy: rubric.updatedBy,
    createdAt: rubric.createdAt.toISOString(),
    updatedAt: rubric.updatedAt.toISOString(),
    archivedAt: rubric.archivedAt?.toISOString() ?? null,
  };
}

function normalizeRequiredText(value: unknown, label: string) {
  const text = normalizeOptionalText(value);
  if (!text) {
    throw badRequest(`${label} is required.`, "KNOWLEDGE_RUBRIC_REQUIRED_FIELD");
  }
  return text;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeJson(value: unknown, fallback: Prisma.InputJsonValue): Prisma.InputJsonValue {
  return value && typeof value === "object" ? (value as Prisma.InputJsonValue) : fallback;
}
