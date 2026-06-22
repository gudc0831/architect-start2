import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import {
  getTaskReviewSessionDetail,
  renameTaskReviewSession,
} from "@/use-cases/task-review-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { sessionId } = await context.params;
    const data = await getTaskReviewSessionDetail(sessionId, user);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { sessionId } = await context.params;
    const body = await request.json();
    const title = parseRenameTitle(body);
    const data = await renameTaskReviewSession({ sessionId, title }, user);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseRenameTitle(rawBody: unknown) {
  if (!isRecord(rawBody) || typeof rawBody.title !== "string" || !rawBody.title.trim()) {
    throw badRequest("title is required", "TASK_REVIEW_SESSION_TITLE_REQUIRED");
  }
  return rawBody.title;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
