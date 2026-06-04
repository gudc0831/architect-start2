import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { getAssistantTaskContext } from "@/use-cases/assistant-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const data = await getAssistantTaskContext(searchParams.get("taskId") ?? "");

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
