import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { reviewAccessRequest } from "@/use-cases/access-request-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { requestId } = await context.params;
    const body = (await request.json()) as {
      action?: string;
      projectId?: unknown;
      role?: unknown;
    };

    if (body.action !== "approve" && body.action !== "reject") {
      throw badRequest("action is required", "ACCESS_REQUEST_ACTION_REQUIRED");
    }

    const data = await reviewAccessRequest({
      actor: user,
      requestId,
      action: body.action,
      projectId: body.projectId,
      role: body.role,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
