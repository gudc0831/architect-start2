import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { exportAssistantAuditCleanupReviewNoteReport } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await exportAssistantAuditCleanupReviewNoteReport(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        limit: searchParams.get("limit"),
        category: searchParams.get("category"),
        reviewerId: searchParams.get("reviewerId"),
        archivePreviewToken: searchParams.get("archivePreviewToken"),
        cleanupId: searchParams.get("cleanupId"),
      },
      user,
    );

    return new NextResponse(data.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${data.filename}"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
