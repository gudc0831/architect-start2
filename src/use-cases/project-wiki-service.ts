import type { AuthUser } from "@/domains/auth/types";
import type { ProjectWikiActionLog, ProjectWikiItem } from "@/domains/project-wiki/types";
import { badRequest, notFound } from "@/lib/api/errors";
import { requireProjectAccess } from "@/lib/auth/project-guards";
import { assistantRepository } from "@/repositories/assistant";
import { projectWikiRepository } from "@/repositories/project-wiki";

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
    limit: 100,
  });
  if (!input.includeDisabled) {
    return activeItems;
  }

  const disabledItems = await projectWikiRepository.listProjectWikiItems({
    projectId: input.projectId,
    query,
    status: "disabled",
    limit: 100,
  });
  return [...activeItems, ...disabledItems].sort(compareProjectWikiItems);
}

export async function getProjectWikiDetail(input: {
  projectId: string;
  itemId: string;
  user: AuthUser;
}) {
  await requireProjectAccess(input.projectId, input.user);
  const item = await projectWikiRepository.getProjectWikiItem({
    projectId: input.projectId,
    itemId: normalizeRequiredText(input.itemId, "itemId"),
  });
  if (!item) {
    throw notFound("Project WIKI item not found.", "PROJECT_WIKI_ITEM_NOT_FOUND");
  }

  return {
    item: stripActionLogs(item),
    actionLogs: readActionLogs(item),
  };
}

export async function buildProjectWikiRegistrationPreview(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  user: AuthUser;
}) {
  await requireProjectAccess(input.projectId, input.user);
  return projectWikiRepository.buildProjectWikiRegistrationPreview({
    projectId: input.projectId,
    sourceReviewRecordId: normalizeRequiredText(input.sourceReviewRecordId, "sourceReviewRecordId"),
    sourceWorkSummaryDraftId: normalizeRequiredText(input.sourceWorkSummaryDraftId, "sourceWorkSummaryDraftId"),
  });
}

export async function registerProjectWiki(input: {
  projectId: string;
  sourceReviewRecordId: string;
  sourceWorkSummaryDraftId: string;
  supplementalNote?: string;
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
  if (preview.existingItem) {
    return preview.existingItem;
  }
  if (!preview.canRegister || !preview.draft) {
    throw badRequest(preview.blockingReason || "Project WIKI registration is not available.", "PROJECT_WIKI_REGISTER_BLOCKED");
  }

  const sourceRecord = await assistantRepository.findRecordById(sourceReviewRecordId);
  if (!sourceRecord || sourceRecord.projectId !== input.projectId) {
    throw notFound("Source review record not found.", "PROJECT_WIKI_SOURCE_REVIEW_NOT_FOUND");
  }

  return projectWikiRepository.registerProjectWiki({
    projectId: input.projectId,
    sourceTaskId: sourceRecord.taskId,
    sourceReviewRecordId,
    sourceWorkSummaryDraftId,
    supplementalNote: normalizeOptionalText(input.supplementalNote),
    draft: preview.draft,
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
  await requireProjectAccess(input.projectId, input.user);
  const itemId = normalizeRequiredText(input.itemId, "itemId");
  const action = normalizeStatusAction(input.action);
  return projectWikiRepository.setProjectWikiStatus({
    projectId: input.projectId,
    itemId,
    status: action === "disable" ? "disabled" : "active",
    actorProfileId: input.user.id,
    actorDisplay: displayName(input.user),
    reason: normalizeOptionalText(input.reason),
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

function normalizeStatusAction(value: string) {
  if (value === "disable" || value === "restore") {
    return value;
  }
  throw badRequest("action must be disable or restore.", "PROJECT_WIKI_STATUS_ACTION_INVALID");
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

function displayName(user: AuthUser) {
  return user.displayName || user.name || user.email || user.id;
}

function compareProjectWikiItems(left: ProjectWikiItem, right: ProjectWikiItem) {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}
