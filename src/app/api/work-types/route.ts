import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { listEffectiveWorkTypesForSession } from "@/use-cases/admin/admin-service";
import { applyProjectSessionProjectId } from "@/lib/project-session";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const data = await listEffectiveWorkTypesForSession(user);
    const response = NextResponse.json({
      data: {
        currentProjectId: data.currentProjectId,
        definitions: data.displayDefinitions,
      },
    });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
