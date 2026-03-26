import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { createAdminProject, listAdminProjects } from "@/use-cases/admin/admin-service";

export async function GET() {
  try {
    await requireRole("admin");
    const data = await listAdminProjects();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("admin");
    const body = (await request.json()) as { name?: string };
    const data = await createAdminProject(String(body.name ?? ""), user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
