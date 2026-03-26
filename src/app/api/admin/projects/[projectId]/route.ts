import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { updateAdminProject } from "@/use-cases/admin/admin-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireRole("admin");
    const { projectId } = await context.params;
    const body = (await request.json()) as { name?: string };
    const data = await updateAdminProject(projectId, String(body.name ?? ""), user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
