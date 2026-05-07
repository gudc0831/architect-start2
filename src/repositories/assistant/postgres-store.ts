import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  AssistantDraftSummary,
  AssistantEvidence,
  ApprovedKnowledgeItem,
  AssistantCandidateState,
  AssistantRecordMetadata,
  AssistantRecord,
  AssistantWorkSummaryDraft,
} from "@/domains/assistant/types";
import { prisma } from "@/lib/prisma";
import type {
  AssistantRepository,
  CreateAssistantRecordInput,
  ReviewKnowledgeCandidateInput,
  SaveAssistantWorkSummaryDraftInput,
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

class PostgresAssistantRepository implements AssistantRepository {
  async listRecordsByTask(taskId: string) {
    const records = await prisma.assistantTaskRecord.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
    });
    return records.map(toRecord);
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

  async findRecordById(recordId: string) {
    const record = await prisma.assistantTaskRecord.findUnique({ where: { id: recordId } });
    return record ? toRecord(record) : null;
  }

  async findWorkSummaryDraftByRecordId(recordId: string) {
    const summary = await prisma.assistantWorkSummaryDraft.findUnique({ where: { recordId } });
    return summary ? toSummary(summary) : null;
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
        metadata: {},
      },
    });

    return toRecord(record);
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

    const record = await prisma.assistantTaskRecord.update({
      where: { id: input.recordId },
      data: {
        candidateState: input.action === "approve" ? "approved" : "rejected",
        metadata: nextMetadata as Prisma.InputJsonValue,
      },
    });

    return { record: toRecord(record), approvedKnowledgeItem };
  }
}

export const postgresAssistantRepository = new PostgresAssistantRepository();
