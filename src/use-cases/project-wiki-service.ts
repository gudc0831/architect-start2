import type { ProjectMembershipRole } from "@/domains/admin/types";
import type { AuthUser } from "@/domains/auth/types";
import type { ProjectWikiActionLog, ProjectWikiDraft, ProjectWikiItem } from "@/domains/project-wiki/types";
import { badRequest, forbidden, notFound } from "@/lib/api/errors";
import { requireProjectAccess } from "@/lib/auth/project-guards";
import { assistantRepository } from "@/repositories/assistant";
import { projectWikiRepository } from "@/repositories/project-wiki";

const PROJECT_WIKI_EDIT_LIMITS = {
  title: 80,
  summary: 220,
  bodyMarkdown: 2400,
  tags: 8,
  statusReason: 200,
} as const;

const PROJECT_WIKI_STATUS_PERMISSION_REASON =
  "프로젝트 WIKI 생성자, 프로젝트 매니저 또는 관리자만 비활성화/복원할 수 있습니다.";

type ProjectWikiStatusControl = {
  canChangeStatus: boolean;
  reason: string;
  disableReasonRequired: true;
  restoreReasonRequired: false;
};

export async function listProjectWiki(input: {
  projectId: string;
  query?: string;
  includeDisabled?: boolean;
  user: AuthUser;
}) {
  await requireProjectAccess(input.projectId, input.user);
  const query = normalizeOptionalText(input.query);
  const activeItems = await projectWikiRepository.listProjectWikiItems({
    projectId: input.projectId,
    query,
    status: "active",
  });
  if (!input.includeDisabled) {
    return activeItems;
  }

  const disabledItems = await projectWikiRepository.listProjectWikiItems({
    projectId: input.projectId,
    query,
    status: "disabled",
  });
  return [...activeItems, ...disabledItems].sort(compareProjectWikiItems);
}

export async function getProjectWikiDetail(input: {
  projectId: string;
  itemId: string;
  user: AuthUser;
}) {
  const access = await requireProjectAccess(input.projectId, input.user);
  const item = await projectWikiRepository.getProjectWikiItem({
    projectId: input.projectId,
    itemId: normalizeRequiredText(input.itemId, "itemId"),
  });
  if (!item) {
    throw notFound("Project WIKI item not found.", "PROJECT_WIKI_ITEM_NOT_FOUND");
  }
  const sourceReview = await readSourceReviewAvailability({
    projectId: input.projectId,
    sourceReviewRecordId: item.sourceReviewRecordId,
  });

  return {
    item: stripActionLogs(item),
    sourceReview,
    actionLogs: readActionLogs(item),
    statusControl: buildProjectWikiStatusControl({
      item,
      user: access.user,
      projectRole: access.membership?.role ?? null,
    }),
  };
}

export async function buildProjectWikiRegistrationPreview(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  user: AuthUser;
}) {
  await requireProjectAccess(input.projectId, input.user);
  const sourceReviewRecordId = normalizeRequiredText(input.sourceReviewRecordId, "sourceReviewRecordId");
  const sourceWorkSummaryDraftId = normalizeRequiredText(input.sourceWorkSummaryDraftId, "sourceWorkSummaryDraftId");
  const preview = await projectWikiRepository.buildProjectWikiRegistrationPreview({
    projectId: input.projectId,
    sourceReviewRecordId,
    sourceWorkSummaryDraftId,
  });
  await persistProjectWikiPreviewState({
    projectId: input.projectId,
    sourceReviewRecordId,
    sourceWorkSummaryDraftId,
    preview,
  });
  return preview;
}

export async function registerProjectWiki(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  supplementalNote?: string;
  title?: string;
  summary?: string;
  bodyMarkdown?: string;
  tags?: string[];
  user: AuthUser;
}) {
  await requireProjectAccess(input.projectId, input.user);
  const sourceReviewRecordId = normalizeRequiredText(input.sourceReviewRecordId, "sourceReviewRecordId");
  const sourceWorkSummaryDraftId = normalizeRequiredText(input.sourceWorkSummaryDraftId, "sourceWorkSummaryDraftId");

  const existingItem = await projectWikiRepository.findProjectWikiBySourceReviewRecord({
    projectId: input.projectId,
    sourceReviewRecordId,
  });
  if (existingItem) {
    return existingItem;
  }

  const sourceRecord = await assistantRepository.findRecordById(sourceReviewRecordId);
  if (!sourceRecord || sourceRecord.projectId !== input.projectId) {
    throw notFound("Source review record not found.", "PROJECT_WIKI_SOURCE_REVIEW_NOT_FOUND");
  }
  const storedPreview = readStoredProjectWikiRegistrationPreview(sourceRecord.metadata.taskReview?.projectWikiState, sourceWorkSummaryDraftId);
  if (
    !storedPreview ||
    !storedPreview.canRegister ||
    !storedPreview.draft ||
    !isRegisterableProjectWikiState(storedPreview.state) ||
    !isRegisterableProjectWikiState(storedPreview.draft.aiSuitabilityState)
  ) {
    throw badRequest(
      storedPreview?.blockingReason || "Project WIKI registration preview must be generated before registration.",
      "PROJECT_WIKI_PREVIEW_REQUIRED",
    );
  }
  const draft = applyProjectWikiDraftEdits(storedPreview.draft, {
    title: input.title,
    summary: input.summary,
    bodyMarkdown: input.bodyMarkdown,
    tags: input.tags,
  });

  return projectWikiRepository.registerProjectWiki({
    projectId: input.projectId,
    sourceTaskId: sourceRecord.taskId,
    sourceReviewRecordId,
    sourceWorkSummaryDraftId,
    supplementalNote: normalizeOptionalText(input.supplementalNote),
    draft,
    actorProfileId: input.user.id,
    actorDisplay: displayName(input.user),
  });
}

export async function setProjectWikiStatus(input: {
  projectId: string;
  itemId: string;
  action: "disable" | "restore";
  reason?: string;
  user: AuthUser;
}) {
  const access = await requireProjectAccess(input.projectId, input.user);
  const itemId = normalizeRequiredText(input.itemId, "itemId");
  const action = normalizeStatusAction(input.action);
  const item = await projectWikiRepository.getProjectWikiItem({
    projectId: input.projectId,
    itemId,
  });
  if (!item) {
    throw notFound("Project WIKI item not found.", "PROJECT_WIKI_ITEM_NOT_FOUND");
  }
  const statusControl = buildProjectWikiStatusControl({
    item,
    user: access.user,
    projectRole: access.membership?.role ?? null,
  });
  if (!statusControl.canChangeStatus) {
    throw forbidden(statusControl.reason, "PROJECT_WIKI_STATUS_FORBIDDEN");
  }

  return projectWikiRepository.setProjectWikiStatus({
    projectId: input.projectId,
    itemId,
    status: action === "disable" ? "disabled" : "active",
    actorProfileId: input.user.id,
    actorDisplay: displayName(input.user),
    reason: normalizeStatusReason(action, input.reason),
  });
}

function readActionLogs(item: ProjectWikiItem): ProjectWikiActionLog[] {
  const candidate = item as ProjectWikiItem & { actionLogs?: unknown };
  return Array.isArray(candidate.actionLogs) ? (candidate.actionLogs as ProjectWikiActionLog[]) : [];
}

function stripActionLogs(item: ProjectWikiItem): ProjectWikiItem {
  const { actionLogs: _actionLogs, ...rest } = item as ProjectWikiItem & { actionLogs?: ProjectWikiActionLog[] };
  return rest;
}

async function readSourceReviewAvailability(input: {
  projectId: string;
  sourceReviewRecordId: string;
}) {
  const sourceRecord = await assistantRepository.findRecordById(input.sourceReviewRecordId);
  if (!sourceRecord || sourceRecord.projectId !== input.projectId) {
    return {
      available: false,
      deletedAt: null,
    };
  }
  return {
    available: !sourceRecord.reviewDeletedAt,
    deletedAt: sourceRecord.reviewDeletedAt ?? null,
  };
}

function normalizeStatusAction(value: string) {
  if (value === "disable" || value === "restore") {
    return value;
  }
  throw badRequest("action must be disable or restore.", "PROJECT_WIKI_STATUS_ACTION_INVALID");
}

function normalizeStatusReason(action: "disable" | "restore", value: string | undefined) {
  const reason = normalizeOptionalText(value);
  if (action === "disable" && !reason) {
    throw badRequest("비활성화 사유를 입력하세요.", "PROJECT_WIKI_DISABLE_REASON_REQUIRED");
  }
  if (reason.length > PROJECT_WIKI_EDIT_LIMITS.statusReason) {
    throw badRequest(
      `사유는 ${PROJECT_WIKI_EDIT_LIMITS.statusReason}자 이내로 입력하세요.`,
      "PROJECT_WIKI_STATUS_REASON_TOO_LONG",
    );
  }
  return reason;
}

function normalizeRequiredText(value: string | undefined, field: string) {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw badRequest(`${field} is required.`, `PROJECT_WIKI_${field.toUpperCase()}_REQUIRED`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | undefined) {
  return value?.replace(/\u0000/g, "").replace(/\s+/gu, " ").trim() ?? "";
}

function applyProjectWikiDraftEdits(
  draft: ProjectWikiDraft,
  edits: {
    title?: string;
    summary?: string;
    bodyMarkdown?: string;
    tags?: string[];
  },
): ProjectWikiDraft {
  return {
    ...draft,
    title:
      edits.title === undefined
        ? draft.title
        : normalizeEditedRequiredText(edits.title, "title", "제목", PROJECT_WIKI_EDIT_LIMITS.title),
    summary:
      edits.summary === undefined
        ? draft.summary
        : normalizeEditedRequiredText(edits.summary, "summary", "요약", PROJECT_WIKI_EDIT_LIMITS.summary),
    bodyMarkdown:
      edits.bodyMarkdown === undefined
        ? draft.bodyMarkdown
        : normalizeEditedRequiredMultilineText(
            edits.bodyMarkdown,
            "bodyMarkdown",
            "본문",
            PROJECT_WIKI_EDIT_LIMITS.bodyMarkdown,
          ),
    tags: edits.tags === undefined ? draft.tags : normalizeEditedTags(edits.tags),
  };
}

function normalizeEditedRequiredText(value: string, field: string, label: string, maxLength: number) {
  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    throw badRequest(`프로젝트 WIKI ${label}을 입력하세요.`, `PROJECT_WIKI_${field.toUpperCase()}_REQUIRED`);
  }
  if (normalized.length > maxLength) {
    throw badRequest(
      `프로젝트 WIKI ${label}은 ${maxLength}자 이내로 입력하세요.`,
      `PROJECT_WIKI_${field.toUpperCase()}_TOO_LONG`,
    );
  }
  return normalized;
}

function normalizeEditedRequiredMultilineText(value: string, field: string, label: string, maxLength: number) {
  const normalized = normalizeMultilineText(value);
  if (!normalized) {
    throw badRequest(`프로젝트 WIKI ${label}을 입력하세요.`, `PROJECT_WIKI_${field.toUpperCase()}_REQUIRED`);
  }
  if (normalized.length > maxLength) {
    throw badRequest(
      `프로젝트 WIKI ${label}은 ${maxLength}자 이내로 입력하세요.`,
      `PROJECT_WIKI_${field.toUpperCase()}_TOO_LONG`,
    );
  }
  return normalized;
}

function normalizeEditedTags(tags: string[]) {
  const normalizedTags = tags.map(normalizeOptionalText).filter(Boolean);
  return [...new Set(normalizedTags)].slice(0, PROJECT_WIKI_EDIT_LIMITS.tags);
}

function buildProjectWikiStatusControl(input: {
  item: ProjectWikiItem;
  user: AuthUser;
  projectRole: ProjectMembershipRole | null;
}): ProjectWikiStatusControl {
  const canChangeStatus =
    input.user.role === "admin" ||
    input.projectRole === "manager" ||
    input.item.createdBy === input.user.id;
  return {
    canChangeStatus,
    reason: canChangeStatus ? "" : PROJECT_WIKI_STATUS_PERMISSION_REASON,
    disableReasonRequired: true,
    restoreReasonRequired: false,
  };
}

function displayName(user: AuthUser) {
  return user.displayName || user.name || user.email || user.id;
}

function compareProjectWikiItems(left: ProjectWikiItem, right: ProjectWikiItem) {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}

async function persistProjectWikiPreviewState(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  preview: Awaited<ReturnType<typeof projectWikiRepository.buildProjectWikiRegistrationPreview>>;
}) {
  if (input.preview.state === "registered" || !input.preview.draft) {
    return;
  }
  const sourceRecord = await assistantRepository.findRecordById(input.sourceReviewRecordId);
  if (!sourceRecord || sourceRecord.projectId !== input.projectId) {
    return;
  }
  await assistantRepository.updateReviewSessionProjectWikiState({
    projectId: input.projectId,
    recordId: input.sourceReviewRecordId,
    projectWikiState: {
      registrationState: input.preview.state,
      suitabilityReason: input.preview.draft.aiSuitabilityReason || null,
      projectWikiItemId: null,
      commonCandidateRecordId: null,
      workSummaryDraftId: input.sourceWorkSummaryDraftId,
      previewDraft: input.preview.draft,
    },
  });
}

function isRegisterableProjectWikiState(state: string) {
  return state === "recommended" || state === "caution";
}

function readStoredProjectWikiRegistrationPreview(
  projectWikiState: { registrationState: string; blockingReason?: string | null; workSummaryDraftId: string | null; previewDraft?: unknown } | undefined,
  sourceWorkSummaryDraftId: string,
) {
  if (!projectWikiState || projectWikiState.workSummaryDraftId !== sourceWorkSummaryDraftId) {
    return null;
  }
  const draft = normalizeStoredProjectWikiDraft(projectWikiState.previewDraft);
  if (!draft) {
    return null;
  }
  const canRegister = isRegisterableProjectWikiState(projectWikiState.registrationState);
  return {
    state: projectWikiState.registrationState,
    draft,
    blockingReason: canRegister ? "" : "AI 비추천 결과라 프로젝트 WIKI 등록을 진행할 수 없습니다.",
    canRegister,
  };
}

function normalizeStoredProjectWikiDraft(value: unknown): ProjectWikiDraft | null {
  if (!isRecord(value)) {
    return null;
  }
  const title = normalizeOptionalText(readString(value.title));
  const summary = normalizeOptionalText(readString(value.summary));
  const bodyMarkdown = normalizeMultilineText(readString(value.bodyMarkdown));
  const aiSuitabilityState = readProjectWikiSuitabilityState(value.aiSuitabilityState);
  if (!title || !summary || !bodyMarkdown || !aiSuitabilityState) {
    return null;
  }
  return {
    title,
    summary,
    bodyMarkdown,
    tags: readStringArray(value.tags).slice(0, 8),
    aiSuitabilityState,
    aiSuitabilityReason: normalizeOptionalText(readString(value.aiSuitabilityReason)),
    commonizationCaution: normalizeOptionalText(readString(value.commonizationCaution)),
  };
}

function readProjectWikiSuitabilityState(value: unknown): ProjectWikiDraft["aiSuitabilityState"] | null {
  return value === "recommended" || value === "caution" || value === "not_recommended" ? value : null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).map(normalizeOptionalText).filter(Boolean) : [];
}

function normalizeMultilineText(value: string) {
  return value.replace(/\u0000/g, "").replace(/[ \t]+/gu, " ").replace(/\n{3,}/gu, "\n\n").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
