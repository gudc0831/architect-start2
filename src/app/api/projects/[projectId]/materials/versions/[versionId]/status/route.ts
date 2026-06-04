import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { updateProjectContextVersionStatus, type ProjectContextVersionStatusAction } from "@/use-cases/project-context-approval-service";

const allowedStatuses = new Set<ProjectContextVersionStatusAction>(["active", "rejected", "archived"]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; versionId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId, versionId } = await context.params;
    const body = (await request.json()) as { status?: string };
    if (!allowedStatuses.has(body.status as ProjectContextVersionStatusAction)) {
      throw badRequest("status must be active, rejected, or archived.", "PROJECT_CONTEXT_VERSION_STATUS_INVALID");
    }
    const data = await updateProjectContextVersionStatus({
      projectId,
      versionId,
      status: body.status as ProjectContextVersionStatusAction,
      user,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
