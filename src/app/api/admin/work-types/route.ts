import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { createGlobalWorkType, listGlobalWorkTypes } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    await requireRole("admin");
    const data = await listGlobalWorkTypes();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    const body = (await request.json()) as {
      code?: string;
      labelKo?: string;
      labelEn?: string;
      sortOrder?: number;
      isSystem?: boolean;
    };
    const data = await createGlobalWorkType(
      {
        code: String(body.code ?? ""),
        labelKo: String(body.labelKo ?? ""),
        labelEn: String(body.labelEn ?? ""),
        sortOrder: Number(body.sortOrder ?? 0),
        isSystem: Boolean(body.isSystem),
      },
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
