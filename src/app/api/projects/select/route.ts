import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listEffectiveTaskCategoriesForProject, selectProjectForSession } from "@/use-cases/admin/admin-service";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as { projectId?: string };
    const data = await selectProjectForSession(String(body.projectId ?? ""));
    const effectiveCategories = await listEffectiveTaskCategoriesForProject(data.currentProjectId ?? null);
    const categoryDefinitionsByField = Object.fromEntries(
      Object.entries(effectiveCategories.byField).map(([fieldKey, value]) => [fieldKey, value.displayDefinitions]),
    );
    const patchedResponse = NextResponse.json({
      data: {
        ...data,
        workTypeDefinitions: effectiveCategories.byField.workType.displayDefinitions,
        categoryDefinitionsByField,
      },
    });
    return applyProjectSessionProjectId(patchedResponse, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
