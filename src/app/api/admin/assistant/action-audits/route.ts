import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantActionAuditReview } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantActionAuditReview(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        limit: searchParams.get("limit"),
        action: searchParams.get("action"),
        task: searchParams.get("task"),
        assistantRecordId: searchParams.get("assistantRecordId"),
        actorId: searchParams.get("actorId"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
