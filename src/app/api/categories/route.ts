import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listEffectiveTaskCategoriesForSession } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const data = await listEffectiveTaskCategoriesForSession(user);
    const response = NextResponse.json({
      data: {
        currentProjectId: data.currentProjectId,
        definitionsByField: Object.fromEntries(
          Object.entries(data.byField).map(([fieldKey, value]) => [fieldKey, value.displayDefinitions]),
        ),
        workTypeDefinitions: data.byField.workType.displayDefinitions,
      },
    });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
