import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
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
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const data = await getCurrentProjectForSession(user);
    const response = NextResponse.json({ data });
    return applyProjectSessionProjectId(response, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = (await request.json()) as { projectId?: string; name?: string };
    const projectId = String(body.projectId ?? "").trim();
    if (projectId) {
      await requireProjectManager(projectId, user);
    }
    const renamed = await renameCurrentProjectForSession(String(body.projectId ?? ""), String(body.name ?? ""), user);
    const [selection, effectiveCategories] = await Promise.all([
      listProjectsForSession(user),
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
