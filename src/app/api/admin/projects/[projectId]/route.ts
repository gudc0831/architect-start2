import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { updateAdminProject } from "@/use-cases/admin/admin-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const body = (await request.json()) as { name?: string };
    const data = await updateAdminProject(projectId, String(body.name ?? ""), user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
