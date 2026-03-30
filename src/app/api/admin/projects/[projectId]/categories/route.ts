import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { isTaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { badRequest } from "@/lib/api/errors";
import { createProjectTaskCategory, listProjectTaskCategories } from "@/use-cases/admin/admin-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    await requireRole("admin");
    const { projectId } = await context.params;
    const { searchParams } = new URL(request.url);
    const fieldKey = String(searchParams.get("fieldKey") ?? "");
    if (!isTaskCategoryFieldKey(fieldKey)) {
      throw badRequest("fieldKey is required", "TASK_CATEGORY_FIELD_REQUIRED");
    }

    const data = await listProjectTaskCategories(projectId, fieldKey);
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
    const user = await requireRole("admin");
    const { projectId } = await context.params;
    const body = (await request.json()) as {
      fieldKey?: string;
      code?: string;
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
    };
    if (!isTaskCategoryFieldKey(body.fieldKey)) {
      throw badRequest("fieldKey is required", "TASK_CATEGORY_FIELD_REQUIRED");
    }

    const data = await createProjectTaskCategory(
      projectId,
      body.fieldKey,
      {
        code: String(body.code ?? ""),
        labelKo: String(body.labelKo ?? ""),
        labelEn: String(body.labelEn ?? ""),
        sortOrder: Number(body.sortOrder ?? 0),
      },
      user.id,
    );
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
