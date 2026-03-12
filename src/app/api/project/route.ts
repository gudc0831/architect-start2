import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { getProject, updateProject } from "@/use-cases/project-service";

export async function GET() {
  try {
    await requireUser();
    const data = await getProject();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const data = await updateProject(String(body.name ?? ""), user.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
