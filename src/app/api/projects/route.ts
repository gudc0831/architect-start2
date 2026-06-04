import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { listEffectiveTaskCategoriesForProject, listProjectsForSession } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    const user = await requireUser();
    const selection = await listProjectsForSession(user);
    const effectiveCategories = await listEffectiveTaskCategoriesForProject(selection.currentProjectId ?? null);
    const categoryDefinitionsByField = Object.fromEntries(
      Object.entries(effectiveCategories.byField).map(([fieldKey, value]) => [fieldKey, value.displayDefinitions]),
    );
    const data = {
      ...selection,
      workTypeDefinitions: effectiveCategories.byField.workType.displayDefinitions,
      categoryDefinitionsByField,
    };
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
