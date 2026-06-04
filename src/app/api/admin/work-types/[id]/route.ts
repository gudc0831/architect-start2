import { NextResponse } from "next/server";
import { forbidden, notFound } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireProjectManager } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import {
  assertProjectTaskCategoryHasGlobalCode,
  getAdminTaskCategoryDefinition,
  updateAdminWorkType,
} from "@/use-cases/admin/admin-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { id } = await context.params;
    const current = await getAdminTaskCategoryDefinition(id);

    if (!current) {
      throw notFound("Work type definition not found", "TASK_CATEGORY_NOT_FOUND");
    }

    if (current.projectId) {
      await requireProjectManager(current.projectId, user);
      await assertProjectTaskCategoryHasGlobalCode(current);
    } else if (user.accessStatus !== "active" || user.role !== "admin") {
      throw forbidden();
    }

    const body = (await request.json()) as {
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    const data = await updateAdminWorkType(
      id,
      {
        labelKo: body.labelKo,
        labelEn: body.labelEn,
        sortOrder: body.sortOrder === undefined ? undefined : Number(body.sortOrder),
        isActive: body.isActive,
      },
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
