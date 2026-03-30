import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listEffectiveTaskCategoriesForSession } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    await requireUser();
    const data = await listEffectiveTaskCategoriesForSession();
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
