import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { isAssignableProjectRole } from "@/lib/auth/project-capabilities";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { createProjectInvitation, listProjectInvitations } from "@/use-cases/invitation-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requestUrl = new URL(request.url);
    const projectId = requestUrl.searchParams.get("projectId") ?? "";
    if (!projectId) {
      throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
    }

    const data = await listProjectInvitations({ projectId, actor: user });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = (await request.json()) as {
      projectId?: string;
      email?: string;
      role?: unknown;
    };

    if (!isAssignableProjectRole(body.role)) {
      throw badRequest("role is invalid", "INVITATION_ROLE_INVALID");
    }

    const data = await createProjectInvitation({
      projectId: String(body.projectId ?? ""),
      email: String(body.email ?? ""),
      role: body.role,
      actor: user,
      requestUrl: new URL(request.url),
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
