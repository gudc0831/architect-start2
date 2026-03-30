import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { updateAdminTaskCategory } from "@/use-cases/admin/admin-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("admin");
    const { id } = await context.params;
    const body = (await request.json()) as {
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    const data = await updateAdminTaskCategory(
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
