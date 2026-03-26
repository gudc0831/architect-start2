import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import {
  getCurrentProjectForSession,
  renameCurrentProjectForSession,
} from "@/use-cases/admin/admin-service";
import { applyProjectSessionProjectId } from "@/lib/project-session";

export async function GET() {
  try {
    await requireUser();
    const data = await getCurrentProjectForSession();
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as { projectId?: string; name?: string };
    const data = await renameCurrentProjectForSession(String(body.projectId ?? ""), String(body.name ?? ""), user.id);
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
