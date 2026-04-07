import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import {
  getCurrentProjectForSession,
  listEffectiveTaskCategoriesForProject,
  listProjectsForSession,
  renameCurrentProjectForSession,
} from "@/use-cases/admin/admin-service";

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
    const renamed = await renameCurrentProjectForSession(String(body.projectId ?? ""), String(body.name ?? ""), user.id);
    const [selection, effectiveCategories] = await Promise.all([
      listProjectsForSession(),
      listEffectiveTaskCategoriesForProject(renamed.currentProjectId ?? null),
    ]);
    const categoryDefinitionsByField = Object.fromEntries(
      Object.entries(effectiveCategories.byField).map(([fieldKey, value]) => [fieldKey, value.displayDefinitions]),
    );
    const data = {
      ...selection,
      workTypeDefinitions: effectiveCategories.byField.workType.displayDefinitions,
      categoryDefinitionsByField,
    };
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, selection.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
