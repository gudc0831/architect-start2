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

  return {
    sourceReviewRecordId: rawBody.sourceReviewRecordId,
    sourceWorkSummaryDraftId: rawBody.sourceWorkSummaryDraftId,
    supplementalNote: typeof rawBody.supplementalNote === "string" ? rawBody.supplementalNote : "",
  };
}

function isTruthyQueryValue(value: string | null) {
  return value === "1" || value === "true" || value === "yes";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
