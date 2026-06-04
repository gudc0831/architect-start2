import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import { getAdminFoundationSettings, updateAdminFoundationSettings } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    await requireRole("admin");
    const data = await getAdminFoundationSettings();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const body = (await request.json()) as { ownerDiscipline?: string };
    const data = await updateAdminFoundationSettings(
      {
        ownerDiscipline: String(body.ownerDiscipline ?? ""),
      },
      user.id,
    );
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
