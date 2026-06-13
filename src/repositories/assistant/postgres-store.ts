import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import {
  type CreateExternalEvidenceInput,
  externalEvidenceToAssistantEvidence,
  normalizeExternalEvidenceMetadata,
} from "@/domains/assistant/external-evidence";
import {
  assertKnowledgeCandidateReviewTransition,
  nonDeletableWorkflowAuditTargetTypes,
} from "@/domains/admin/knowledge-workflow";
import { normalizeThreadSummaryUpdate } from "@/domains/assistant/thread-memory";
import type {
  AssistantDraftSummary,
  AssistantEvidence,
  ApprovedKnowledgeItem,
  AssistantCandidateState,
  AssistantRecordMetadata,
  AssistantRecord,
  AssistantThread,
  AssistantThreadMessage,
  AssistantThreadSummaryProvenance,
  AssistantWorkSummaryDraft,
} from "@/domains/assistant/types";
import type {
  AssistantAuditEvent,
  AssistantPolicyProvider,
  AssistantRunPolicy,
  AssistantUsageEvent,
} from "@/domains/assistant/saas-api-mode";
import { normalizeAllowedEvidenceKinds } from "@/domains/assistant/saas-api-mode";
import { prisma } from "@/lib/prisma";
import type {
  AssistantRepository,
  AppendAssistantThreadMessageInput,
  CreateAssistantThreadInput,
  CreateAssistantAuditEventInput,
  CreateAssistantRecordInput,
  CreateAssistantUsageEventInput,
  ListAssistantAuditEventsInput,
  ListAssistantUsageEventsInput,
  ListAssistantUsageEventsForProfileInput,
  ReviewKnowledgeCandidateInput,
  SaveAssistantWorkSummaryDraftInput,
  UpsertAssistantRunPolicyInput,
} from "@/repositories/assistant/contracts";

type PrismaAssistantRecord = {
  id: string;
  projectId: string;
  taskId: string;
  profileId: string;
  question: string;
  answer: string;
  evidence: Prisma.JsonValue;
  confidenceScore: number;
  confidenceReason: string;
  executionMode: string;
  runtimeMode: string;
  draftSummary: Prisma.JsonValue;
  cleanupState: string;
  candidateState: string;
  metadata: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAssistantWorkSummaryDraft = {
  id: string;
  projectId: string;
  taskId: string;
  recordId: string;
  profileId: string;
  conclusion: string;
  tags: Prisma.JsonValue;
  scope: string;
  followUpAction: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAssistantThread = {
  id: string;
  projectId: string;
  taskId: string | null;
  profileId: string;
  title: string;
  summary: string;
  summaryProvenance: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAssistantThreadMessage = {
  id: string;
  threadId: string;
  assistantRecordId: string | null;
  role: string;
  content: string;
  evidenceSnapshot: Prisma.JsonValue;
  createdAt: Date;
};

type PrismaAssistantRunPolicy = {
  id: string;
  projectId: string;
  enabled: boolean;
  provider: string;
  model: string;
  monthlyBudgetCents: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  externalEvidenceAllowed: boolean;
  allowedEvidenceKinds: Prisma.JsonValue;
  retentionDays: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PrismaAssistantUsageEvent = {
  id: string;
  projectId: string;
  taskId: string | null;
  profileId: string;
  assistantRecordId: string | null;
  executionMode: string;
  runtimeMode: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
  status: string;
  policyDecision: string;
  requestHash: string | null;
  errorCode: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type PrismaAssistantAuditEvent = {
  id: string;
  projectId: string | null;
  profileId: string | null;
  eventType: string;
  targetType: string;
  targetId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

type PrismaApprovedKnowledgeSearchRow = {
  item: Prisma.JsonValue;
  updatedAt: Date;
  ftsRank: number | null;
};

const assistantPrisma = prisma as typeof prisma & {
  assistantThread: {
    create: (...args: unknown[]) => Promise<PrismaAssistantThread>;
    findFirst: (...args: unknown[]) => Promise<PrismaAssistantThread | null>;
    update: (...args: unknown[]) => Promise<PrismaAssistantThread>;
  };
  assistantThreadMessage: {
    create: (...args: unknown[]) => Promise<PrismaAssistantThreadMessage>;
    findMany: (...args: unknown[]) => Promise<PrismaAssistantThreadMessage[]>;
  };
  assistantRunPolicy: {
    findUnique: (...args: unknown[]) => Promise<PrismaAssistantRunPolicy | null>;
    upsert: (...args: unknown[]) => Promise<PrismaAssistantRunPolicy>;
  };
  assistantUsageEvent: {
    create: (...args: unknown[]) => Promise<PrismaAssistantUsageEvent>;
    findMany: (...args: unknown[]) => Promise<PrismaAssistantUsageEvent[]>;
  };
  assistantAuditEvent: {
    create: (...args: unknown[]) => Promise<PrismaAssistantAuditEvent>;
    findMany: (...args: unknown[]) => Promise<PrismaAssistantAuditEvent[]>;
    deleteMany: (...args: unknown[]) => Promise<{ count: number }>;
  };
};

function asEvidence(value: Prisma.JsonValue): AssistantEvidence[] {
  return Array.isArray(value) ? (value as AssistantEvidence[]) : [];
}

function asDraftSummary(value: Prisma.JsonValue): AssistantDraftSummary | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AssistantDraftSummary) : null;
}

function asTags(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.map((tag) => String(tag)).filter(Boolean) : [];
}

function asMetadata(value: Prisma.JsonValue): AssistantRecordMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AssistantRecordMetadata) : {};
}

function asSummaryProvenance(value: Prisma.JsonValue): AssistantThreadSummaryProvenance {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AssistantThreadSummaryProvenance) : {};
}

function asRecordMetadata(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toRecord(record: PrismaAssistantRecord): AssistantRecord {
  return {
    id: record.id,
    projectId: record.projectId,
    taskId: record.taskId,
    profileId: record.profileId,
    question: record.question,
    answer: record.answer,
    evidence: asEvidence(record.evidence),
    confidenceScore: record.confidenceScore,
    confidenceReason: record.confidenceReason,
    executionMode: record.executionMode as AssistantRecord["executionMode"],
    runtimeMode: record.runtimeMode,
    draftSummary: asDraftSummary(record.draftSummary),
    cleanupState: record.cleanupState as AssistantRecord["cleanupState"],
    candidateState: record.candidateState as AssistantRecord["candidateState"],
    metadata: asMetadata(record.metadata),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toSummary(record: PrismaAssistantWorkSummaryDraft): AssistantWorkSummaryDraft {
  return {
    id: record.id,
    projectId: record.projectId,
    taskId: record.taskId,
    recordId: record.recordId,
    profileId: record.profileId,
    conclusion: record.conclusion,
    tags: asTags(record.tags),
    scope: record.scope,
    followUpAction: record.followUpAction,
    status: record.status as AssistantWorkSummaryDraft["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toThread(thread: PrismaAssistantThread): AssistantThread {
  return {
    id: thread.id,
    projectId: thread.projectId,
    taskId: thread.taskId,
    profileId: thread.profileId,
    title: thread.title,
    summary: thread.summary,
    summaryProvenance: asSummaryProvenance(thread.summaryProvenance),
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
  };
}

function toThreadMessage(message: PrismaAssistantThreadMessage): AssistantThreadMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    assistantRecordId: message.assistantRecordId,
    role: message.role as AssistantThreadMessage["role"],
    content: message.content,
    evidenceSnapshot: asEvidence(message.evidenceSnapshot),
    createdAt: message.createdAt.toISOString(),
  };
}

function toPolicy(policy: PrismaAssistantRunPolicy): AssistantRunPolicy {
  return {
    id: policy.id,
    scopeType: "project",
    projectId: policy.projectId,
    enabled: policy.enabled,
    provider: policy.provider as AssistantPolicyProvider,
    model: policy.model,
    monthlyBudgetCents: policy.monthlyBudgetCents,
    maxInputTokens: policy.maxInputTokens,
    maxOutputTokens: policy.maxOutputTokens,
    externalEvidenceAllowed: policy.externalEvidenceAllowed,
    allowedEvidenceKinds: normalizeAllowedEvidenceKinds(policy.allowedEvidenceKinds),
    retentionDays: policy.retentionDays,
    createdBy: policy.createdBy,
    updatedBy: policy.updatedBy,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function toUsageEvent(event: PrismaAssistantUsageEvent): AssistantUsageEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    taskId: event.taskId,
    profileId: event.profileId,
    assistantRecordId: event.assistantRecordId,
    executionMode: "saas-api",
    runtimeMode: event.runtimeMode,
    provider: event.provider as AssistantPolicyProvider,
    model: event.model,
    inputTokens: event.inputTokens,
    outputTokens: event.outputTokens,
    estimatedCostCents: event.estimatedCostCents,
    status: event.status as AssistantUsageEvent["status"],
    policyDecision: event.policyDecision as AssistantUsageEvent["policyDecision"],
    requestHash: event.requestHash,
    errorCode: event.errorCode,
    metadata: asRecordMetadata(event.metadata),
    createdAt: event.createdAt.toISOString(),
  };
}

function toAuditEvent(event: PrismaAssistantAuditEvent): AssistantAuditEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    profileId: event.profileId,
    eventType: event.eventType,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: asRecordMetadata(event.metadata),
    createdAt: event.createdAt.toISOString(),
  };
}

class PostgresAssistantRepository implements AssistantRepository {
  async listRecordsByTask(taskId: string) {
    const records = await prisma.assistantTaskRecord.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toRecord);
  }

  async listExternalEvidenceByTask(taskId: string) {
    const records = await prisma.assistantTaskRecord.findMany({
      where: { taskId, runtimeMode: "external-evidence" },
      orderBy: { createdAt: "desc" },
    });
    return records
      .map((record) => normalizeExternalEvidenceMetadata(toRecord(record).metadata.externalEvidence))
      .filter((record) => record !== null);
  }

  async listKnowledgeCandidateRecords(input?: { states?: AssistantCandidateState[] }) {
    const states = input?.states ?? ["candidate", "pending_review", "approved", "rejected"];
    const records = await prisma.assistantTaskRecord.findMany({
      where: { candidateState: { in: states } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return records.map(toRecord);
  }

  async searchApprovedKnowledge(input: { projectId: string; query: string; limit?: number }) {
    const limit = Math.max(0, input.limit ?? 4);
    if (limit === 0) {
      return [];
    }

    try {
      const rows = await prisma.$queryRaw<PrismaApprovedKnowledgeSearchRow[]>(Prisma.sql`
        with approved_knowledge as (
          select
            metadata->'approvedKnowledgeItem' as item,
            updated_at as "updatedAt",
            concat_ws(
              ' ',
              metadata #>> '{approvedKnowledgeItem,title}',
              metadata #>> '{approvedKnowledgeItem,summary}',
              metadata #>> '{approvedKnowledgeItem,bodyMarkdown}',
              metadata #>> '{approvedKnowledgeItem,tags}'
            ) as search_text
          from assistant_task_records
          where candidate_state = 'approved'
            and metadata ? 'approvedKnowledgeItem'
            and (
              project_id = ${input.projectId}::uuid
              or metadata #>> '{approvedKnowledgeItem,scope}' = 'organization'
            )
        )
        select
          item,
          "updatedAt",
          ts_rank_cd(to_tsvector('simple', search_text), plainto_tsquery('simple', ${input.query}))::float as "ftsRank"
        from approved_knowledge
        order by "ftsRank" desc, "updatedAt" desc
        limit ${100}
      `);
      const terms = input.query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2);
      return rows
        .map((row) => {
          const item = row.item as ApprovedKnowledgeItem | null;
          if (!item) {
            return null;
          }
          const score = scoreApprovedKnowledge(item, terms) + Math.max(0, Number(row.ftsRank ?? 0)) * 12;
          return { item, score };
        })
        .filter((entry): entry is { item: ApprovedKnowledgeItem; score: number } => entry !== null && entry.score > 0)
        .sort((left, right) => right.score - left.score || right.item.approvedAt.localeCompare(left.item.approvedAt))
        .map((entry) => entry.item)
        .slice(0, limit);
    } catch {
      const records = await prisma.assistantTaskRecord.findMany({
        where: {
          candidateState: "approved",
          OR: [
            { projectId: input.projectId },
            {
              metadata: {
                path: ["approvedKnowledgeItem", "scope"],
                equals: "organization",
              },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 100,
      });

      return rankApprovedKnowledge(
        records
          .map((record) => toRecord(record).metadata.approvedKnowledgeItem)
          .filter((item): item is ApprovedKnowledgeItem => Boolean(item)),
        input.query,
      ).slice(0, limit);
    }
  }

  async findRecordById(recordId: string) {
    const record = await prisma.assistantTaskRecord.findUnique({ where: { id: recordId } });
    return record ? toRecord(record) : null;
  }

  async findWorkSummaryDraftByRecordId(recordId: string) {
    const summary = await prisma.assistantWorkSummaryDraft.findUnique({ where: { recordId } });
    return summary ? toSummary(summary) : null;
  }

  async createThread(input: CreateAssistantThreadInput) {
    const summaryUpdate = normalizeThreadSummaryUpdate({
      summary: input.summary ?? "",
      provenance: input.summaryProvenance ?? {},
    });
    const thread = await assistantPrisma.assistantThread.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        profileId: input.profileId,
        title: input.title,
        summary: summaryUpdate.summary,
        summaryProvenance: summaryUpdate.provenance as Prisma.InputJsonValue,
      },
    });
    return toThread(thread);
  }

  async appendThreadMessage(input: AppendAssistantThreadMessageInput) {
    const message = await prisma.$transaction(async (tx) => {
      const assistantTx = tx as unknown as typeof assistantPrisma;
      await assistantTx.assistantThread.update({
        where: { id: input.threadId },
        data: { updatedAt: new Date() },
      });
      return assistantTx.assistantThreadMessage.create({
        data: {
          threadId: input.threadId,
          assistantRecordId: input.assistantRecordId ?? null,
          role: input.role,
          content: input.content,
          evidenceSnapshot: (input.evidenceSnapshot ?? []) as Prisma.InputJsonValue,
        },
      });
    });
    return toThreadMessage(message);
  }

  async listRecentThreadMessages(threadId: string, limit: number) {
    const messages = await assistantPrisma.assistantThreadMessage.findMany({
      where: { threadId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: normalizeRecentMessageLimit(limit),
    });
    return messages.map(toThreadMessage).reverse();
  }

  async updateThreadSummary(threadId: string, summary: string, provenance: AssistantThreadSummaryProvenance) {
    const summaryUpdate = normalizeThreadSummaryUpdate({ summary, provenance });
    await assistantPrisma.assistantThread.update({
      where: { id: threadId },
      data: {
        summary: summaryUpdate.summary,
        summaryProvenance: summaryUpdate.provenance as Prisma.InputJsonValue,
      },
    });
  }

  async findThreadByTask(taskId: string) {
    const thread = await assistantPrisma.assistantThread.findFirst({
      where: { taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return thread ? toThread(thread) : null;
  }

  async createRecord(input: CreateAssistantRecordInput) {
    const record = await prisma.assistantTaskRecord.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId,
        profileId: input.profileId,
        question: input.question,
        answer: input.answer,
        evidence: input.evidence as Prisma.InputJsonValue,
        confidenceScore: input.confidenceScore,
        confidenceReason: input.confidenceReason,
        executionMode: input.executionMode,
        runtimeMode: input.runtimeMode,
        draftSummary: (input.draftSummary ?? {}) as Prisma.InputJsonValue,
        cleanupState: input.cleanupState,
        candidateState: input.candidateState,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return toRecord(record);
  }

  async createExternalEvidence(input: CreateExternalEvidenceInput) {
    const timestamp = new Date().toISOString();
    const externalEvidence = {
      id: randomUUID(),
      ...input,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const evidence = externalEvidenceToAssistantEvidence(externalEvidence);
    await prisma.assistantTaskRecord.create({
      data: {
        id: externalEvidence.id,
        projectId: input.projectId,
        taskId: input.taskId,
        profileId: input.createdBy,
        question: `External evidence: ${input.title}`,
        answer: input.excerpt,
        evidence: toInputJson([evidence]),
        confidenceScore: Math.round((evidence.confidenceWeight ?? 0.28) * 100),
        confidenceReason: "User-approved external web/skill evidence saved for assistant retrieval.",
        executionMode: "unavailable",
        runtimeMode: "external-evidence",
        draftSummary: {},
        cleanupState: "deferred",
        candidateState: "not_candidate",
        metadata: toInputJson({ externalEvidence }),
      },
    });

    return externalEvidence;
  }

  async saveWorkSummaryDraft(input: SaveAssistantWorkSummaryDraftInput) {
    const summary = await prisma.assistantWorkSummaryDraft.upsert({
      where: { recordId: input.recordId },
      update: {
        conclusion: input.conclusion,
        tags: input.tags,
        scope: input.scope,
        followUpAction: input.followUpAction,
        status: input.status,
      },
      create: {
        projectId: input.projectId,
        taskId: input.taskId,
        recordId: input.recordId,
        profileId: input.profileId,
        conclusion: input.conclusion,
        tags: input.tags,
        scope: input.scope,
        followUpAction: input.followUpAction,
        status: input.status,
      },
    });

    await prisma.assistantTaskRecord.update({
      where: { id: input.recordId },
      data: { cleanupState: input.status },
    });

    return toSummary(summary);
  }

  async reviewKnowledgeCandidate(input: ReviewKnowledgeCandidateInput) {
    const current = await prisma.assistantTaskRecord.findUnique({ where: { id: input.recordId } });
    if (!current) {
      throw new Error("Assistant record not found");
    }

    const currentRecord = toRecord(current);
    const nextCandidateState = input.action === "approve" ? "approved" : "rejected";
    assertKnowledgeCandidateReviewTransition(currentRecord.candidateState, nextCandidateState);
    const timestamp = new Date().toISOString();
    const approvedKnowledgeItem =
      input.action === "approve"
        ? ({
            id: randomUUID(),
            title: input.title,
            summary: input.summary,
            bodyMarkdown: input.bodyMarkdown,
            tags: input.tags,
            scope: input.scope,
            sourceRecordId: currentRecord.id,
            sourceTaskId: currentRecord.taskId,
            sourceProjectId: currentRecord.projectId,
            sourceReferences: currentRecord.evidence,
            approvedBy: input.reviewerId,
            approvedAt: timestamp,
          } satisfies ApprovedKnowledgeItem)
        : null;
    const knowledgeReview =
      input.action === "reject"
        ? {
            status: "rejected" as const,
            reviewerId: input.reviewerId,
            reviewedAt: timestamp,
            rejectionReason: input.rejectionReason,
          }
        : {
            status: "approved" as const,
            reviewerId: input.reviewerId,
            reviewedAt: timestamp,
          };
    const nextMetadata: AssistantRecordMetadata = {
      ...currentRecord.metadata,
      knowledgeReview,
      approvedKnowledgeItem: approvedKnowledgeItem ?? currentRecord.metadata.approvedKnowledgeItem,
    };

    const updateResult = await prisma.assistantTaskRecord.updateMany({
      where: {
        id: input.recordId,
        candidateState: { in: ["candidate", "pending_review"] },
      },
      data: {
        candidateState: nextCandidateState,
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });
    if (updateResult.count !== 1) {
      throw new Error(`Invalid knowledge candidate transition: ${currentRecord.candidateState} -> ${nextCandidateState}`);
    }
    const record = await prisma.assistantTaskRecord.findUniqueOrThrow({ where: { id: input.recordId } });

    return { record: toRecord(record), approvedKnowledgeItem };
  }

  async getRunPolicy(projectId: string) {
    const policy = await assistantPrisma.assistantRunPolicy.findUnique({
      where: { projectId },
    });

    return policy ? toPolicy(policy) : null;
  }

  async upsertRunPolicy(input: UpsertAssistantRunPolicyInput) {
    const policy = await assistantPrisma.assistantRunPolicy.upsert({
      where: { projectId: input.projectId },
      update: {
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
        monthlyBudgetCents: input.monthlyBudgetCents,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        externalEvidenceAllowed: input.externalEvidenceAllowed,
        allowedEvidenceKinds: input.allowedEvidenceKinds as Prisma.InputJsonValue,
        retentionDays: input.retentionDays,
        updatedBy: input.actorId,
      },
      create: {
        projectId: input.projectId,
        enabled: input.enabled,
        provider: input.provider,
        model: input.model,
        monthlyBudgetCents: input.monthlyBudgetCents,
        maxInputTokens: input.maxInputTokens,
        maxOutputTokens: input.maxOutputTokens,
        externalEvidenceAllowed: input.externalEvidenceAllowed,
        allowedEvidenceKinds: input.allowedEvidenceKinds as Prisma.InputJsonValue,
        retentionDays: input.retentionDays,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });

    return toPolicy(policy);
  }

  async createUsageEvent(input: CreateAssistantUsageEventInput) {
    const event = await assistantPrisma.assistantUsageEvent.create({
      data: {
        projectId: input.projectId,
        taskId: input.taskId ?? null,
        profileId: input.profileId,
        assistantRecordId: input.assistantRecordId ?? null,
        executionMode: input.executionMode,
        runtimeMode: input.runtimeMode,
        provider: input.provider,
        model: input.model,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        estimatedCostCents: input.estimatedCostCents,
        status: input.status,
        policyDecision: input.policyDecision,
        requestHash: input.requestHash ?? null,
        errorCode: input.errorCode ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return toUsageEvent(event);
  }

  async listUsageEvents(input: ListAssistantUsageEventsInput) {
    const createdAt = buildMonthRange(input.month);
    const events = await assistantPrisma.assistantUsageEvent.findMany({
      where: {
        projectId: input.projectId,
        ...(createdAt ? { createdAt } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    return events.map(toUsageEvent);
  }

  async listUsageEventsForProfile(input: ListAssistantUsageEventsForProfileInput) {
    const events = await assistantPrisma.assistantUsageEvent.findMany({
      where: {
        profileId: input.profileId,
        createdAt: {
          gte: new Date(input.from),
          lt: new Date(input.to),
        },
      },
      orderBy: { createdAt: "asc" },
      take: input.limit ?? 1000,
    });

    return events.map(toUsageEvent);
  }

  async createAuditEvent(input: CreateAssistantAuditEventInput) {
    const event = await assistantPrisma.assistantAuditEvent.create({
      data: {
        projectId: input.projectId ?? null,
        profileId: input.profileId ?? null,
        eventType: input.eventType,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    return toAuditEvent(event);
  }

  async listAuditEvents(input: ListAssistantAuditEventsInput) {
    const createdAt = buildMonthRange(input.month);
    const events = await assistantPrisma.assistantAuditEvent.findMany({
      where: {
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(input.eventTypes?.length ? { eventType: { in: input.eventTypes } } : {}),
        ...(input.targetType ? { targetType: input.targetType } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: input.limit ?? 100,
    });

    return events.map(toAuditEvent);
  }

  async deleteAuditEventsByIds(input: { projectId: string; ids: string[] }) {
    const existingEvents = await assistantPrisma.assistantAuditEvent.findMany({
      where: {
        projectId: input.projectId,
        id: { in: input.ids },
        targetType: { notIn: [...nonDeletableWorkflowAuditTargetTypes] },
      },
      select: { id: true },
    });
    const deletedIds = existingEvents.map((event: { id: string }) => event.id);
    const deletedIdSet = new Set(deletedIds);
    const skippedIds = input.ids.filter((id) => !deletedIdSet.has(id));

    if (deletedIds.length > 0) {
      await assistantPrisma.assistantAuditEvent.deleteMany({
        where: {
          projectId: input.projectId,
          id: { in: deletedIds },
          targetType: { notIn: [...nonDeletableWorkflowAuditTargetTypes] },
        },
      });
    }

    return { deletedIds, skippedIds };
  }
}

export const postgresAssistantRepository = new PostgresAssistantRepository();

function buildMonthRange(month?: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [yearValue, monthValue] = month.split("-").map(Number);
  const start = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const end = new Date(Date.UTC(yearValue, monthValue, 1));
  return { gte: start, lt: end };
}

function rankApprovedKnowledge(items: ApprovedKnowledgeItem[], query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2);
  return items
    .map((item) => ({
      item,
      score: scoreApprovedKnowledge(item, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || right.item.approvedAt.localeCompare(left.item.approvedAt))
    .map((entry) => entry.item);
}

function scoreApprovedKnowledge(item: ApprovedKnowledgeItem, terms: string[]) {
  const haystack = `${item.title} ${item.summary} ${item.bodyMarkdown} ${item.tags.join(" ")}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function normalizeRecentMessageLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return 6;
  }

  return Math.max(1, Math.min(50, Math.floor(limit)));
}
