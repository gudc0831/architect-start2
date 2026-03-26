import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { createProjectWorkType, listProjectWorkTypes } from "@/use-cases/admin/admin-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    await requireRole("admin");
    const { projectId } = await context.params;
    const data = await listProjectWorkTypes(projectId);
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
      code?: string;
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
    };
    const data = await createProjectWorkType(
      projectId,
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
