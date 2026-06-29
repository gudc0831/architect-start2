import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listProjectWiki, registerProjectWiki } from "@/use-cases/project-wiki-service";
import { readJsonBody } from "@/app/api/projects/[projectId]/project-wiki/json-body";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await listProjectWiki({
      projectId,
      query: searchParams.get("query") ?? "",
      includeDisabled: isTruthyQueryValue(searchParams.get("includeDisabled")),
      user,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    const body = parseRegistrationBody(await readJsonBody(request));
    const data = await registerProjectWiki({
      projectId,
      sourceReviewRecordId: body.sourceReviewRecordId,
      sourceWorkSummaryDraftId: body.sourceWorkSummaryDraftId,
      supplementalNote: body.supplementalNote,
      title: body.title,
      summary: body.summary,
      bodyMarkdown: body.bodyMarkdown,
      tags: body.tags,
      user,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseRegistrationBody(rawBody: unknown) {
  if (!isRecord(rawBody)) {
    throw badRequest("Invalid project WIKI registration payload.", "PROJECT_WIKI_REGISTER_PAYLOAD_INVALID");
  }
  if (typeof rawBody.sourceReviewRecordId !== "string" || !rawBody.sourceReviewRecordId.trim()) {
    throw badRequest("sourceReviewRecordId is required.", "PROJECT_WIKI_SOURCE_REVIEW_REQUIRED");
  }
  if (typeof rawBody.sourceWorkSummaryDraftId !== "string" || !rawBody.sourceWorkSummaryDraftId.trim()) {
    throw badRequest("sourceWorkSummaryDraftId is required.", "PROJECT_WIKI_SOURCE_DRAFT_REQUIRED");
  }
  const draft = readOptionalDraft(rawBody);

  return {
    sourceReviewRecordId: rawBody.sourceReviewRecordId,
    sourceWorkSummaryDraftId: rawBody.sourceWorkSummaryDraftId,
    supplementalNote: typeof rawBody.supplementalNote === "string" ? rawBody.supplementalNote : "",
    title: readOptionalString(rawBody, "title") ?? draft?.title,
    summary: readOptionalString(rawBody, "summary") ?? draft?.summary,
    bodyMarkdown: readOptionalString(rawBody, "bodyMarkdown") ?? draft?.bodyMarkdown,
    tags: readOptionalStringArray(rawBody, "tags") ?? draft?.tags,
  };
}

function isTruthyQueryValue(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function readOptionalString(body: Record<string, unknown>, field: string) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) {
    return undefined;
  }
  const value = body[field];
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string.`, `PROJECT_WIKI_${field.toUpperCase()}_INVALID`);
  }
  return value;
}

function readOptionalStringArray(body: Record<string, unknown>, field: string) {
  if (!Object.prototype.hasOwnProperty.call(body, field)) {
    return undefined;
  }
  const value = body[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw badRequest(`${field} must be a string array.`, `PROJECT_WIKI_${field.toUpperCase()}_INVALID`);
  }
  return value;
}

function readOptionalDraft(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, "draft")) {
    return null;
  }
  const draft = body.draft;
  if (!isRecord(draft)) {
    throw badRequest("draft must be an object.", "PROJECT_WIKI_DRAFT_INVALID");
  }
  return {
    title: readOptionalString(draft, "title"),
    summary: readOptionalString(draft, "summary"),
    bodyMarkdown: readOptionalString(draft, "bodyMarkdown"),
    tags: readOptionalStringArray(draft, "tags"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
