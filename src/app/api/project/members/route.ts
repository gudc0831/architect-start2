import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listCurrentProjectMembersForSession } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    const user = await requireUser();
    const data = await listCurrentProjectMembersForSession(user);
    const response = NextResponse.json({ data });
    response.headers.set("Cache-Control", "no-store");
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
