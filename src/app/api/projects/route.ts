import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listEffectiveWorkTypesForSession, listProjectsForSession } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    await requireUser();
    const [selection, effectiveWorkTypes] = await Promise.all([
      listProjectsForSession(),
      listEffectiveWorkTypesForSession(),
    ]);
    const data = {
      ...selection,
      workTypeDefinitions: effectiveWorkTypes.displayDefinitions,
    };
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
