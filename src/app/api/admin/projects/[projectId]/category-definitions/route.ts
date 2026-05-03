import { NextResponse } from "next/server";
import { requireTaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { handleRouteError } from "@/lib/api/route-error";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { createProjectTaskCategory, listProjectTaskCategories } from "@/use-cases/admin/admin-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const { searchParams } = new URL(request.url);
    const data = await listProjectTaskCategories(projectId, requireTaskCategoryFieldKey(searchParams.get("fieldKey")));
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectManager(projectId, user);
    const body = (await request.json()) as {
      fieldKey?: string;
      code?: string;
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
    };
    const data = await createProjectTaskCategory(
      projectId,
      requireTaskCategoryFieldKey(body.fieldKey),
      {
        code: String(body.code ?? ""),
        labelKo: String(body.labelKo ?? ""),
        labelEn: String(body.labelEn ?? ""),
        sortOrder: Number(body.sortOrder ?? 0),
      },
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
