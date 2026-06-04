import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantRunPolicy, updateAssistantRunPolicy } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantRunPolicy({ projectId: searchParams.get("projectId") }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const data = await updateAssistantRunPolicy(await request.json(), user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
