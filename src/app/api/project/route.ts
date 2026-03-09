import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { getProject, updateProject } from "@/use-cases/project-service";

export async function GET() {
  try {
    const data = await getProject();
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const data = await updateProject(String(body.name ?? ""));
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}