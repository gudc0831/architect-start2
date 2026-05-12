import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantAuditCleanupReviewNoteSummary } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantAuditCleanupReviewNoteSummary(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        category: searchParams.get("category"),
        reviewerId: searchParams.get("reviewerId"),
        archivePreviewToken: searchParams.get("archivePreviewToken"),
        cleanupId: searchParams.get("cleanupId"),
        staleDays: searchParams.get("staleDays"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
