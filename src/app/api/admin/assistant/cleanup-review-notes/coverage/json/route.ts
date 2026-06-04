import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { exportAssistantAuditCleanupReviewCoverageJson } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await exportAssistantAuditCleanupReviewCoverageJson(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        category: searchParams.get("category"),
        reviewerId: searchParams.get("reviewerId"),
        archivePreviewToken: searchParams.get("archivePreviewToken"),
        cleanupId: searchParams.get("cleanupId"),
        staleDays: searchParams.get("staleDays"),
        coveragePreset: searchParams.get("coveragePreset"),
      },
      user,
    );

    return new NextResponse(data.json, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${data.filename}"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
