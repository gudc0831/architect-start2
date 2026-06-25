import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AssistantCandidateState, AssistantRecordMetadata, ProjectWikiReviewState } from "@/domains/assistant/types";
import type {
  ProjectWikiActionLog,
  ProjectWikiDraft,
  ProjectWikiItem,
  ProjectWikiRegistrationPreview,
  ProjectWikiStatus,
  ProjectWikiSuitabilityState,
} from "@/domains/project-wiki/types";
import { matchesProjectWikiKeyword, rankProjectWikiItems } from "@/domains/project-wiki/search";
import { badRequest, notFound } from "@/lib/api/errors";
import { prisma } from "@/lib/prisma";
import type {
  BuildProjectWikiRegistrationPreviewInput,
  GetProjectWikiItemInput,
  ListProjectWikiItemsInput,
  ProjectWikiRepository,
  RegisterProjectWikiInput,
  SearchProjectWikiForAssistantInput,
  SetProjectWikiStatusInput,
} from "@/repositories/project-wiki/contracts";
import { evaluateProjectWikiSuitability } from "@/use-cases/project-wiki-suitability-service";

type ProjectWikiActionLogRecord = {
  id: string;
  projectId: string;
  projectWikiItemId: string;
  action: string;
  actorProfileId: string;
  actorDisplay: string;
  reason: string;
  createdAt: Date;
};

type ProjectWikiItemRecord = {
  id: string;
  projectId: string;
  sourceTaskId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  commonCandidateRecordId: string | null;
  title: string;
  summary: string;
  bodyMarkdown: string;
  tags: Prisma.JsonValue;
  supplementalNote: string;
  aiSuitabilityState: string;
  aiSuitabilityReason: string;
  commonizationCaution: string;
  status: string;
  createdBy: string;
  disabledBy: string | null;
  disabledAt: Date | null;
  restoredBy: string | null;
  restoredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  creator?: { displayName: string } | null;
  commonCandidateRecord?: { candidateState: string } | null;
  actionLogs?: ProjectWikiActionLogRecord[];
};

type SourceReviewRecord = {
  id: string;
  projectId: string;
  taskId: string;
  profileId: string;
  question: string;
  answer: string;
  evidence: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  reviewDeletedAt: Date | null;
  task?: { title: string } | null;
};

type WorkSummaryDraftRecord = {
  id: string;
  projectId: string;
  taskId: string;
  recordId: string;
  conclusion: string;
  tags: Prisma.JsonValue;
  scope: string;
  followUpAction: string;
  status: string;
};

class PostgresProjectWikiRepository implements ProjectWikiRepository {
  async listProjectWikiItems(input: ListProjectWikiItemsInput) {
    const rows = await prisma.projectWikiItem.findMany({
      where: {
        projectId: input.projectId,
        status: input.status ?? "active",
      },
      include: {
        creator: { select: { displayName: true } },
        commonCandidateRecord: { select: { candidateState: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...(input.limit ? { take: Math.min(Math.max(input.limit, 1), 500) } : {}),
    });
    const limit = normalizeOptionalLimit(input.limit);
    return rows
      .map((row) => toProjectWikiItem(row))
      .filter((item) => matchesProjectWikiKeyword(item, input.query ?? ""))
      .slice(0, limit ?? undefined);
  }

  async getProjectWikiItem(input: GetProjectWikiItemInput) {
    const row = await prisma.projectWikiItem.findFirst({
      where: {
        id: input.itemId,
        projectId: input.projectId,
      },
      include: {
        creator: { select: { displayName: true } },
        commonCandidateRecord: { select: { candidateState: true } },
        actionLogs: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        },
      },
    });
    return row ? toProjectWikiItemWithLogs(row) : null;
  }

  async findProjectWikiBySourceReviewRecord(input: {
    projectId: string;
    sourceReviewRecordId: string;
  }) {
    const row = await prisma.projectWikiItem.findFirst({
      where: {
        projectId: input.projectId,
        sourceReviewRecordId: input.sourceReviewRecordId,
      },
      include: {
        creator: { select: { displayName: true } },
        commonCandidateRecord: { select: { candidateState: true } },
      },
    });
    return row ? toProjectWikiItem(row) : null;
  }

  async buildProjectWikiRegistrationPreview(
    input: BuildProjectWikiRegistrationPreviewInput,
  ): Promise<ProjectWikiRegistrationPreview> {
    const existingItem = await this.findProjectWikiBySourceReviewRecord({
      projectId: input.projectId,
      sourceReviewRecordId: input.sourceReviewRecordId,
    });
    if (existingItem) {
      return {
        state: "registered",
        draft: null,
        existingItem,
        blockingReason: "이미 프로젝트 WIKI로 등록된 검토입니다.",
        canRegister: false,
      };
    }

    const sourceReview = await loadSourceReviewRecord(input.projectId, input.sourceReviewRecordId);
    if (!sourceReview || !isUsableTaskReviewRecord(sourceReview)) {
      return blockedRegistrationPreview("저장된 task 검토 기록을 찾을 수 없습니다.");
    }

    const approvedDraft = await loadApprovedWorkSummaryDraft({
      projectId: input.projectId,
      sourceReviewRecordId: input.sourceReviewRecordId,
      sourceWorkSummaryDraftId: input.sourceWorkSummaryDraftId,
    });
    if (!approvedDraft) {
      return blockedRegistrationPreview("승인된 work summary draft가 없어 프로젝트 WIKI 등록을 진행할 수 없습니다.");
    }

    const draft = await buildDraftFromSource(input.projectId, sourceReview, approvedDraft);
    const canRegister = isRegisterableSuitabilityState(draft.aiSuitabilityState);
    return {
      state: draft.aiSuitabilityState,
      draft,
      existingItem: null,
      blockingReason: canRegister ? "" : "AI 비추천 결과라 프로젝트 WIKI 등록을 진행할 수 없습니다.",
      canRegister,
    };
  }

  async registerProjectWiki(input: RegisterProjectWikiInput) {
    try {
      return await prisma.$transaction(async (tx) => {
        const sourceReview = await tx.assistantTaskRecord.findFirst({
          where: {
            id: input.sourceReviewRecordId,
            projectId: input.projectId,
          },
          include: {
            task: { select: { title: true } },
          },
        });
        if (!sourceReview || !isUsableTaskReviewRecord(sourceReview)) {
          throw notFound("Source review record not found.", "PROJECT_WIKI_SOURCE_REVIEW_NOT_FOUND");
        }
        if (sourceReview.taskId !== input.sourceTaskId) {
          throw badRequest("sourceTaskId does not match the source review record.", "PROJECT_WIKI_SOURCE_TASK_MISMATCH");
        }

        const approvedDraft = await tx.assistantWorkSummaryDraft.findFirst({
          where: {
            id: input.sourceWorkSummaryDraftId,
            recordId: input.sourceReviewRecordId,
            projectId: input.projectId,
            status: "approved",
          },
        });
        if (!approvedDraft) {
          throw badRequest("Approved work summary draft is required.", "PROJECT_WIKI_APPROVED_DRAFT_REQUIRED");
        }

        const existing = await tx.projectWikiItem.findFirst({
          where: {
            projectId: input.projectId,
            sourceReviewRecordId: input.sourceReviewRecordId,
          },
          include: {
            creator: { select: { displayName: true } },
            commonCandidateRecord: { select: { candidateState: true } },
          },
        });
        if (existing) {
          return toProjectWikiItem(existing);
        }

        const itemId = randomUUID();
        const commonCandidate = await tx.assistantTaskRecord.create({
          data: {
            projectId: input.projectId,
            taskId: sourceReview.taskId,
            profileId: input.actorProfileId,
            question: `Project WIKI common candidate: ${input.draft.title}`,
            answer: input.draft.bodyMarkdown,
            evidence: toInputJson(readEvidenceArray(sourceReview.evidence)),
            confidenceScore: suitabilityConfidenceScore(input.draft.aiSuitabilityState),
            confidenceReason: input.draft.aiSuitabilityReason,
            executionMode: "unavailable",
            runtimeMode: "project-wiki-registration",
            draftSummary: toInputJson({
              conclusion: input.draft.summary,
              tags: input.draft.tags,
              scope: "project-wiki-registration",
              followUpAction: input.draft.commonizationCaution,
            }),
            cleanupState: "draft",
            candidateState: "candidate",
            metadata: toInputJson({
              commonWikiCandidate: {
                source: "project-wiki",
                sourceProjectWikiStatus: "active",
                sourceReviewRecordId: input.sourceReviewRecordId,
                sourceWorkSummaryDraftId: input.sourceWorkSummaryDraftId,
                sourceProjectWikiItemId: itemId,
                supplementalNote: input.supplementalNote,
                aiSuitabilityState: input.draft.aiSuitabilityState,
                aiSuitabilityReason: input.draft.aiSuitabilityReason,
                commonizationCaution: input.draft.commonizationCaution,
                projectSpecificContext: true,
              },
            }),
          },
        });

        const item = await tx.projectWikiItem.create({
          data: {
            id: itemId,
            projectId: input.projectId,
            sourceTaskId: sourceReview.taskId,
            sourceReviewRecordId: sourceReview.id,
            sourceWorkSummaryDraftId: approvedDraft.id,
            commonCandidateRecordId: commonCandidate.id,
            title: input.draft.title,
            summary: input.draft.summary,
            bodyMarkdown: input.draft.bodyMarkdown,
            tags: toInputJson(input.draft.tags),
            supplementalNote: input.supplementalNote,
            aiSuitabilityState: input.draft.aiSuitabilityState,
            aiSuitabilityReason: input.draft.aiSuitabilityReason,
            commonizationCaution: input.draft.commonizationCaution,
            status: "active",
            createdBy: input.actorProfileId,
          },
          include: {
            creator: { select: { displayName: true } },
            commonCandidateRecord: { select: { candidateState: true } },
          },
        });

        const projectWikiState: ProjectWikiReviewState = {
          registrationState: "registered",
          suitabilityReason: input.draft.aiSuitabilityReason || null,
          projectWikiItemId: item.id,
          commonCandidateRecordId: commonCandidate.id,
          workSummaryDraftId: approvedDraft.id,
        };
        const nextMetadata = mergeReviewSessionProjectWikiState(asAssistantRecordMetadata(sourceReview.metadata), projectWikiState);
        const updateResult = await tx.assistantTaskRecord.updateMany({
          where: {
            id: sourceReview.id,
            projectId: input.projectId,
          },
          data: {
            metadata: toInputJson(nextMetadata),
          },
        });
        if (updateResult.count !== 1) {
          throw notFound("Source review record not found.", "PROJECT_WIKI_SOURCE_REVIEW_NOT_FOUND");
        }

        return toProjectWikiItem(item);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existing = await this.findProjectWikiBySourceReviewRecord({
          projectId: input.projectId,
          sourceReviewRecordId: input.sourceReviewRecordId,
        });
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async setProjectWikiStatus(input: SetProjectWikiStatusInput) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.projectWikiItem.findFirst({
        where: {
          id: input.itemId,
          projectId: input.projectId,
        },
        include: {
          creator: { select: { displayName: true } },
          commonCandidateRecord: { select: { candidateState: true } },
          actionLogs: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 50,
          },
        },
      });
      if (!current) {
        throw notFound("Project WIKI item not found.", "PROJECT_WIKI_ITEM_NOT_FOUND");
      }
      if (normalizeProjectWikiStatus(current.status) === input.status) {
        await updateCommonWikiCandidateSourceStatus(tx, {
          projectId: input.projectId,
          commonCandidateRecordId: current.commonCandidateRecordId,
          status: input.status,
        });
        return {
          item: toProjectWikiItemWithLogs(current),
          actionLog: null,
        };
      }

      const action = input.status === "disabled" ? "disable" : "restore";
      await tx.projectWikiItem.update({
        where: { id: current.id },
        data:
          input.status === "disabled"
            ? {
                status: "disabled",
                disabledBy: input.actorProfileId,
                disabledAt: new Date(),
                restoredBy: null,
                restoredAt: null,
              }
            : {
                status: "active",
                disabledBy: null,
                disabledAt: null,
                restoredBy: input.actorProfileId,
                restoredAt: new Date(),
              },
      });
      const actionLog = await tx.projectWikiActionLog.create({
        data: {
          projectId: input.projectId,
          projectWikiItemId: current.id,
          action,
          actorProfileId: input.actorProfileId,
          actorDisplay: input.actorDisplay ?? "",
          reason: input.reason ?? "",
        },
      });
      await updateCommonWikiCandidateSourceStatus(tx, {
        projectId: input.projectId,
        commonCandidateRecordId: current.commonCandidateRecordId,
        status: input.status,
      });
      const updated = await tx.projectWikiItem.findFirstOrThrow({
        where: {
          id: current.id,
          projectId: input.projectId,
        },
        include: {
          creator: { select: { displayName: true } },
          commonCandidateRecord: { select: { candidateState: true } },
          actionLogs: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 50,
          },
        },
      });

      return {
        item: toProjectWikiItemWithLogs(updated),
        actionLog: toProjectWikiActionLog(actionLog),
      };
    });
  }

  async searchProjectWikiForAssistant(input: SearchProjectWikiForAssistantInput) {
    const items = await this.listProjectWikiItems({
      projectId: input.projectId,
      status: "active",
      query: input.query,
    });
    return rankProjectWikiItems({
      items,
      query: input.query,
      excludedItemIds: input.excludedItemIds,
      limit: input.limit,
    });
  }
}

export const postgresProjectWikiRepository = new PostgresProjectWikiRepository();

function toProjectWikiItemWithLogs(row: ProjectWikiItemRecord): ProjectWikiItem & { actionLogs: ProjectWikiActionLog[] } {
  return {
    ...toProjectWikiItem(row),
    actionLogs: (row.actionLogs ?? []).map(toProjectWikiActionLog),
  };
}

function toProjectWikiItem(row: ProjectWikiItemRecord): ProjectWikiItem {
  return {
    id: row.id,
    projectId: row.projectId,
    sourceTaskId: row.sourceTaskId,
    sourceReviewRecordId: row.sourceReviewRecordId,
    sourceWorkSummaryDraftId: row.sourceWorkSummaryDraftId,
    commonCandidateRecordId: row.commonCandidateRecordId,
    commonCandidateStatus: normalizeCandidateState(row.commonCandidateRecord?.candidateState),
    title: row.title,
    summary: row.summary,
    bodyMarkdown: row.bodyMarkdown,
    tags: asStringArray(row.tags).slice(0, 8),
    supplementalNote: row.supplementalNote,
    aiSuitabilityState: normalizeSuitabilityState(row.aiSuitabilityState),
    aiSuitabilityReason: row.aiSuitabilityReason,
    commonizationCaution: row.commonizationCaution,
    status: normalizeProjectWikiStatus(row.status),
    createdBy: row.createdBy,
    createdByDisplay: row.creator?.displayName ?? "",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    disabledBy: row.disabledBy,
    disabledAt: row.disabledAt?.toISOString() ?? null,
    restoredBy: row.restoredBy,
    restoredAt: row.restoredAt?.toISOString() ?? null,
  };
}

function toProjectWikiActionLog(row: ProjectWikiActionLogRecord): ProjectWikiActionLog {
  return {
    id: row.id,
    projectId: row.projectId,
    projectWikiItemId: row.projectWikiItemId,
    action: row.action === "restore" ? "restore" : "disable",
    actorProfileId: row.actorProfileId,
    actorDisplay: row.actorDisplay,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadSourceReviewRecord(projectId: string, sourceReviewRecordId: string) {
  return prisma.assistantTaskRecord.findFirst({
    where: {
      id: sourceReviewRecordId,
      projectId,
    },
    include: {
      task: { select: { title: true } },
    },
  }) as Promise<SourceReviewRecord | null>;
}

async function loadApprovedWorkSummaryDraft(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
}) {
  return prisma.assistantWorkSummaryDraft.findFirst({
    where: {
      projectId: input.projectId,
      recordId: input.sourceReviewRecordId,
      status: "approved",
      id: input.sourceWorkSummaryDraftId,
    },
  }) as Promise<WorkSummaryDraftRecord | null>;
}

async function buildDraftFromSource(projectId: string, sourceReview: SourceReviewRecord, approvedDraft: WorkSummaryDraftRecord): Promise<ProjectWikiDraft> {
  return evaluateProjectWikiSuitability({
    projectId,
    taskId: sourceReview.taskId,
    taskTitle: sourceReview.task?.title || sourceReview.question,
    approvedConclusion: approvedDraft.conclusion,
    approvedScope: approvedDraft.scope,
    approvedFollowUpAction: approvedDraft.followUpAction,
    evidenceTitles: readEvidenceTitles(sourceReview.evidence),
    userId: sourceReview.profileId,
  });
}

function blockedRegistrationPreview(blockingReason: string): ProjectWikiRegistrationPreview {
  return {
    state: "not_evaluated",
    draft: null,
    existingItem: null,
    blockingReason,
    canRegister: false,
  };
}

async function updateCommonWikiCandidateSourceStatus(
  tx: Prisma.TransactionClient,
  input: {
    projectId: string;
    commonCandidateRecordId: string | null;
    status: ProjectWikiStatus;
  },
) {
  if (!input.commonCandidateRecordId) {
    return;
  }
  const commonCandidate = await tx.assistantTaskRecord.findFirst({
    where: {
      id: input.commonCandidateRecordId,
      projectId: input.projectId,
    },
    select: {
      metadata: true,
    },
  });
  if (!commonCandidate) {
    return;
  }

  const metadata = asAssistantRecordMetadata(commonCandidate.metadata);
  const nextMetadata: AssistantRecordMetadata = {
    ...metadata,
    commonWikiCandidate: {
      ...(metadata.commonWikiCandidate ?? {}),
      sourceProjectWikiStatus: input.status,
    },
  };
  await tx.assistantTaskRecord.updateMany({
    where: {
      id: input.commonCandidateRecordId,
      projectId: input.projectId,
    },
    data: {
      metadata: toInputJson(nextMetadata),
    },
  });
}

function mergeReviewSessionProjectWikiState(
  metadata: AssistantRecordMetadata,
  projectWikiState: ProjectWikiReviewState,
): AssistantRecordMetadata {
  const taskReview = metadata.taskReview;
  if (taskReview?.source !== "assistant-task-review") {
    throw badRequest("Source review record is not a task review session.", "PROJECT_WIKI_SOURCE_REVIEW_INVALID");
  }

  return {
    ...metadata,
    taskReview: {
      ...taskReview,
      projectWikiState,
    },
  };
}

function isUsableTaskReviewRecord(record: SourceReviewRecord) {
  return !record.reviewDeletedAt && asAssistantRecordMetadata(record.metadata).taskReview?.source === "assistant-task-review";
}

function asAssistantRecordMetadata(value: Prisma.JsonValue): AssistantRecordMetadata {
  return isRecord(value) ? (value as AssistantRecordMetadata) : {};
}

function readEvidenceArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value : [];
}

function readEvidenceTitles(value: Prisma.JsonValue) {
  return readEvidenceArray(value)
    .map((item) => (isRecord(item) && typeof item.title === "string" ? item.title.trim() : ""))
    .filter(Boolean)
    .slice(0, 20);
}

function asStringArray(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function normalizeProjectWikiStatus(value: string): ProjectWikiStatus {
  return value === "disabled" ? "disabled" : "active";
}

function normalizeSuitabilityState(value: string): ProjectWikiSuitabilityState {
  if (value === "recommended" || value === "caution" || value === "not_recommended") {
    return value;
  }
  return "caution";
}

function normalizeCandidateState(value: string | undefined): AssistantCandidateState | null {
  return value === "candidate" ||
    value === "not_candidate" ||
    value === "pending_review" ||
    value === "approved" ||
    value === "rejected"
    ? value
    : null;
}

function isRegisterableSuitabilityState(state: ProjectWikiSuitabilityState) {
  return state === "recommended" || state === "caution";
}

function suitabilityConfidenceScore(state: ProjectWikiSuitabilityState) {
  if (state === "recommended") {
    return 86;
  }
  if (state === "caution") {
    return 62;
  }
  return 35;
}

function normalizeOptionalLimit(value: number | undefined) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.min(500, Math.floor(value as number)));
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
