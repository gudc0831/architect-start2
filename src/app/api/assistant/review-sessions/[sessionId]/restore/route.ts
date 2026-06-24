import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { restoreTaskReviewSession } from "@/use-cases/task-review-service";

export const runtime = "nodejs";
export const preferredRegion = "icn1";

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const { sessionId } = await context.params;
    const data = await restoreTaskReviewSession(sessionId, user);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
