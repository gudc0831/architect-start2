import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { resolveEffectiveWorkTypeDefinitions } from "@/domains/admin/work-type-policy";
import { applyProjectSessionProjectId } from "@/lib/project-session";
import { adminRepository } from "@/repositories/admin";
import { selectProjectForSession } from "@/use-cases/admin/admin-service";

export async function POST(request: Request) {
  try {
    await requireUser();
    const body = (await request.json()) as { projectId?: string };
    const data = await selectProjectForSession(String(body.projectId ?? ""));
    const [globalDefinitions, projectDefinitions] = await Promise.all([
      adminRepository.listGlobalWorkTypeDefinitions(),
      data.currentProjectId ? adminRepository.listProjectWorkTypeDefinitions(data.currentProjectId) : Promise.resolve([]),
    ]);
    const workTypes = resolveEffectiveWorkTypeDefinitions(
      [...globalDefinitions, ...projectDefinitions],
      data.currentProjectId ?? null,
    );
    const patchedResponse = NextResponse.json({
      data: {
        ...data,
        workTypeDefinitions: workTypes.displayDefinitions,
      },
    });
    return applyProjectSessionProjectId(patchedResponse, data.currentProjectId);
  } catch (error) {
    return handleRouteError(error);
  }
}
