import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { setProjectWikiStatus } from "@/use-cases/project-wiki-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; itemId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId, itemId } = await context.params;
    const body = parseStatusBody(await request.json());
    const data = await setProjectWikiStatus({
      projectId,
      itemId,
      action: body.action,
      reason: body.reason,
      user,
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseStatusBody(rawBody: unknown): { action: "disable" | "restore"; reason: string } {
  if (!isRecord(rawBody)) {
    throw badRequest("Invalid project WIKI status payload.", "PROJECT_WIKI_STATUS_PAYLOAD_INVALID");
  }
  if (rawBody.action !== "disable" && rawBody.action !== "restore") {
    throw badRequest("action must be disable or restore.", "PROJECT_WIKI_STATUS_ACTION_INVALID");
  }
  const action = rawBody.action;

  return {
    action,
    reason: typeof rawBody.reason === "string" ? rawBody.reason : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
