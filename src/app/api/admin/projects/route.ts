import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import { createAdminProject, listAdminProjects } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    const user = await requireRole("admin");
    const data = await listAdminProjects(user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const body = (await request.json()) as { name?: string };
    const data = await createAdminProject(String(body.name ?? ""), user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
