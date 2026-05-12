import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantAuditCleanupDetail } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request, context: { params: Promise<{ cleanupId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { cleanupId } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await getAssistantAuditCleanupDetail(
      {
        cleanupId,
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
