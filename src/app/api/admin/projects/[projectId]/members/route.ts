import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { isAssignableProjectRole, type RequestedProjectRole } from "@/lib/auth/project-capabilities";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { listProjectMembers, replaceProjectMembers } from "@/use-cases/admin/admin-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const data = await listProjectMembers(projectId);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const body = (await request.json()) as {
      memberships?: Array<{
        profileId?: string;
        displayName?: string;
        email?: string;
        role?: RequestedProjectRole;
      }>;
    };
    const data = await replaceProjectMembers(
      projectId,
      Array.isArray(body.memberships)
        ? body.memberships.map((membership) => ({
            profileId: String(membership.profileId ?? ""),
            displayName: String(membership.displayName ?? ""),
            email: String(membership.email ?? ""),
            role: isAssignableProjectRole(membership.role) ? membership.role : "editor",
          }))
        : [],
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
