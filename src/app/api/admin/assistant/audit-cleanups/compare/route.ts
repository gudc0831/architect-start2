import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantAuditCleanupComparison } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantAuditCleanupComparison(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        retentionDays: searchParams.get("retentionDays"),
        cutoffAt: searchParams.get("cutoffAt"),
        archivePreviewToken: searchParams.get("archivePreviewToken"),
        limit: searchParams.get("limit"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
