import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { listProjectMembers, replaceProjectMembers } from "@/use-cases/admin/admin-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    await requireRole("admin");
    const { projectId } = await context.params;
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
    const user = await requireRole("admin");
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      memberships?: Array<{
        profileId?: string;
        displayName?: string;
        email?: string;
        role?: "manager" | "member";
      }>;
    };
    const data = await replaceProjectMembers(
      projectId,
      Array.isArray(body.memberships)
        ? body.memberships.map((membership) => ({
            profileId: String(membership.profileId ?? ""),
            displayName: String(membership.displayName ?? ""),
            email: String(membership.email ?? ""),
            role: membership.role === "manager" ? "manager" : "member",
          }))
        : [],
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
