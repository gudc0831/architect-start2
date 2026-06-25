import { randomUUID } from "node:crypto";
import type {
  AssistantEvidence,
  AssistantRecord,
  AssistantRecordMetadata,
  AssistantWorkSummaryDraft,
  ProjectWikiReviewState,
} from "@/domains/assistant/types";
import type {
  ProjectWikiActionLog,
  ProjectWikiCommonCandidateStatus,
  ProjectWikiDraft,
  ProjectWikiItem,
  ProjectWikiRegistrationPreview,
} from "@/domains/project-wiki/types";
import { matchesProjectWikiKeyword, rankProjectWikiItems } from "@/domains/project-wiki/search";
import { badRequest, notFound } from "@/lib/api/errors";
import { assistantRepository } from "@/repositories/assistant";
import type {
  BuildProjectWikiRegistrationPreviewInput,
  ListProjectWikiItemsInput,
  ProjectWikiRepository,
  RegisterProjectWikiInput,
  SearchProjectWikiForAssistantInput,
  SetProjectWikiStatusInput,
} from "@/repositories/project-wiki/contracts";
import { evaluateProjectWikiSuitability } from "@/use-cases/project-wiki-suitability-service";

const projectWikiItems: ProjectWikiItem[] = [];
const projectWikiActionLogs: ProjectWikiActionLog[] = [];

class LocalProjectWikiRepository implements ProjectWikiRepository {
  async listProjectWikiItems(input: ListProjectWikiItemsInput) {
    const limit = normalizeOptionalLimit(input.limit);
    const items = projectWikiItems
      .filter((item) => item.projectId === input.projectId)
      .filter((item) => item.status === (input.status ?? "active"))
      .filter((item) => matchesProjectWikiKeyword(item, input.query ?? ""))
      .sort(compareProjectWikiItems)
      .slice(0, limit ?? undefined);
    return Promise.all(items.map(withCurrentCommonCandidateStatus));
  }

  async getProjectWikiItem(input: { projectId: string; itemId: string }) {
    const item = projectWikiItems.find((candidate) => candidate.projectId === input.projectId && candidate.id === input.itemId);
    return item ? attachActionLogs(await withCurrentCommonCandidateStatus(item)) : null;
  }

  async findProjectWikiBySourceReviewRecord(input: { projectId: string; sourceReviewRecordId: string }) {
    const item =
      projectWikiItems.find(
        (item) => item.projectId === input.projectId && item.sourceReviewRecordId === input.sourceReviewRecordId,
      ) ?? null;
    return item ? withCurrentCommonCandidateStatus(item) : null;
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

    const sourceReview = await loadLocalSourceReview(input.projectId, input.sourceReviewRecordId);
    if (!sourceReview) {
      return blockedRegistrationPreview("저장된 task 검토 기록을 찾을 수 없습니다.");
    }
    const approvedDraft = await loadLocalApprovedDraft({
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
    const existing = await this.findProjectWikiBySourceReviewRecord({
      projectId: input.projectId,
      sourceReviewRecordId: input.sourceReviewRecordId,
    });
    if (existing) {
      return existing;
    }

    const sourceReview = await loadLocalSourceReview(input.projectId, input.sourceReviewRecordId);
    if (!sourceReview) {
      throw notFound("Source review record not found.", "PROJECT_WIKI_SOURCE_REVIEW_NOT_FOUND");
    }
    if (sourceReview.taskId !== input.sourceTaskId) {
      throw badRequest("sourceTaskId does not match the source review record.", "PROJECT_WIKI_SOURCE_TASK_MISMATCH");
    }
    const approvedDraft = await loadLocalApprovedDraft({
      projectId: input.projectId,
      sourceReviewRecordId: input.sourceReviewRecordId,
      sourceWorkSummaryDraftId: input.sourceWorkSummaryDraftId,
    });
    if (!approvedDraft) {
      throw badRequest("Approved work summary draft is required.", "PROJECT_WIKI_APPROVED_DRAFT_REQUIRED");
    }

    const timestamp = nowIso();
    const itemId = randomUUID();
    const commonCandidate = await assistantRepository.createRecord({
      projectId: input.projectId,
      taskId: sourceReview.taskId,
      profileId: input.actorProfileId,
      question: `Project WIKI common candidate: ${input.draft.title}`,
      answer: input.draft.bodyMarkdown,
      evidence: sourceReview.evidence,
      confidenceScore: suitabilityConfidenceScore(input.draft.aiSuitabilityState),
      confidenceReason: input.draft.aiSuitabilityReason,
      executionMode: "unavailable",
      runtimeMode: "project-wiki-registration",
      draftSummary: {
        conclusion: input.draft.summary,
        tags: input.draft.tags,
        scope: "project-wiki-registration",
        followUpAction: input.draft.commonizationCaution,
      },
      cleanupState: "draft",
      candidateState: "candidate",
      metadata: {
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
      } as Record<string, unknown> as AssistantRecordMetadata,
    });

    const projectWikiState: ProjectWikiReviewState = {
      registrationState: "registered",
      suitabilityReason: input.draft.aiSuitabilityReason || null,
      projectWikiItemId: itemId,
      commonCandidateRecordId: commonCandidate.id,
      workSummaryDraftId: approvedDraft.id,
    };
    await assistantRepository.updateReviewSessionProjectWikiState({
      projectId: input.projectId,
      recordId: sourceReview.id,
      projectWikiState,
    });

    const item: ProjectWikiItem = {
      ...input.draft,
      id: itemId,
      projectId: input.projectId,
      sourceTaskId: sourceReview.taskId,
      sourceReviewRecordId: sourceReview.id,
      sourceWorkSummaryDraftId: approvedDraft.id,
      commonCandidateRecordId: commonCandidate.id,
      commonCandidateStatus: "candidate",
      supplementalNote: input.supplementalNote,
      status: "active",
      createdBy: input.actorProfileId,
      createdByDisplay: input.actorDisplay ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
      disabledBy: null,
      disabledAt: null,
      restoredBy: null,
      restoredAt: null,
    };
    projectWikiItems.unshift(item);
    return item;
  }

  async setProjectWikiStatus(input: SetProjectWikiStatusInput) {
    const index = projectWikiItems.findIndex((item) => item.projectId === input.projectId && item.id === input.itemId);
    if (index < 0) {
      throw notFound("Project WIKI item not found.", "PROJECT_WIKI_ITEM_NOT_FOUND");
    }

    const timestamp = nowIso();
    const current = projectWikiItems[index];
    if (current.status === input.status) {
      await updateLocalCommonWikiCandidateSourceStatus(current, input.status);
      return {
        item: attachActionLogs(await withCurrentCommonCandidateStatus(current)),
        actionLog: null,
      };
    }

    const action = input.status === "disabled" ? "disable" : "restore";
    const item: ProjectWikiItem =
      input.status === "disabled"
        ? {
            ...current,
            status: "disabled",
            disabledBy: input.actorProfileId,
            disabledAt: timestamp,
            restoredBy: null,
            restoredAt: null,
            updatedAt: timestamp,
          }
        : {
            ...current,
            status: "active",
            disabledBy: null,
            disabledAt: null,
            restoredBy: input.actorProfileId,
            restoredAt: timestamp,
            updatedAt: timestamp,
          };
    projectWikiItems[index] = item;
    const actionLog: ProjectWikiActionLog = {
      id: randomUUID(),
      projectId: input.projectId,
      projectWikiItemId: input.itemId,
      action,
      actorProfileId: input.actorProfileId,
      actorDisplay: input.actorDisplay ?? "",
      reason: input.reason ?? "",
      createdAt: timestamp,
    };
    projectWikiActionLogs.unshift(actionLog);
    await updateLocalCommonWikiCandidateSourceStatus(item, input.status);

    return {
      item: attachActionLogs(await withCurrentCommonCandidateStatus(item)),
      actionLog,
    };
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

export const localProjectWikiRepository = new LocalProjectWikiRepository();

async function updateLocalCommonWikiCandidateSourceStatus(item: ProjectWikiItem, status: ProjectWikiItem["status"]) {
  if (!item.commonCandidateRecordId) {
    return;
  }
  await assistantRepository.updateCommonWikiCandidateSourceStatus({
    projectId: item.projectId,
    recordId: item.commonCandidateRecordId,
    sourceProjectWikiStatus: status,
  });
}

async function withCurrentCommonCandidateStatus(item: ProjectWikiItem): Promise<ProjectWikiItem> {
  const commonCandidateStatus = await readCurrentCommonCandidateStatus(item);
  if (commonCandidateStatus === item.commonCandidateStatus) {
    return item;
  }
  const updated = { ...item, commonCandidateStatus };
  const index = projectWikiItems.findIndex((candidate) => candidate.id === item.id && candidate.projectId === item.projectId);
  if (index >= 0) {
    projectWikiItems[index] = updated;
  }
  return updated;
}

async function readCurrentCommonCandidateStatus(item: ProjectWikiItem): Promise<ProjectWikiCommonCandidateStatus> {
  if (!item.commonCandidateRecordId) {
    return null;
  }
  const record = await assistantRepository.findRecordById(item.commonCandidateRecordId);
  return record?.projectId === item.projectId ? record.candidateState : item.commonCandidateStatus;
}

async function loadLocalSourceReview(projectId: string, sourceReviewRecordId: string) {
  const record = await assistantRepository.findRecordById(sourceReviewRecordId);
  if (
    !record ||
    record.projectId !== projectId ||
    record.reviewDeletedAt ||
    record.metadata.taskReview?.source !== "assistant-task-review"
  ) {
    return null;
  }
  return record;
}

async function loadLocalApprovedDraft(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
}) {
  const draft = await assistantRepository.findWorkSummaryDraftByRecordId(input.sourceReviewRecordId);
  if (
    !draft ||
    draft.projectId !== input.projectId ||
    draft.recordId !== input.sourceReviewRecordId ||
    draft.status !== "approved" ||
    draft.id !== input.sourceWorkSummaryDraftId
  ) {
    return null;
  }
  return draft;
}

async function buildDraftFromSource(projectId: string, sourceReview: AssistantRecord, approvedDraft: AssistantWorkSummaryDraft): Promise<ProjectWikiDraft> {
  return evaluateProjectWikiSuitability({
    projectId,
    taskId: sourceReview.taskId,
    taskTitle: sourceReview.metadata.taskReview?.reviewSessionTitle || sourceReview.question,
    approvedConclusion: approvedDraft.conclusion,
    approvedScope: approvedDraft.scope,
    approvedFollowUpAction: approvedDraft.followUpAction,
    evidenceTitles: readEvidenceTitles(sourceReview.evidence),
    userId: sourceReview.profileId,
  });
}

function isRegisterableSuitabilityState(state: ProjectWikiDraft["aiSuitabilityState"]) {
  return state === "recommended" || state === "caution";
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

function attachActionLogs(item: ProjectWikiItem): ProjectWikiItem & { actionLogs: ProjectWikiActionLog[] } {
  return {
    ...item,
    actionLogs: projectWikiActionLogs
      .filter((log) => log.projectId === item.projectId && log.projectWikiItemId === item.id)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)),
  };
}

function readEvidenceTitles(evidence: AssistantEvidence[]) {
  return evidence.map((item) => item.title.trim()).filter(Boolean).slice(0, 20);
}

function compareProjectWikiItems(left: ProjectWikiItem, right: ProjectWikiItem) {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

function suitabilityConfidenceScore(state: ProjectWikiDraft["aiSuitabilityState"]) {
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

function nowIso() {
  return new Date().toISOString();
}
