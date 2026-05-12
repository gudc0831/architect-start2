import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { exportAssistantAuditCleanupHistory } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await exportAssistantAuditCleanupHistory(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        actorId: searchParams.get("actorId"),
        cutoffAt: searchParams.get("cutoffAt"),
        archivePreviewToken: searchParams.get("archivePreviewToken"),
        limit: searchParams.get("limit"),
      },
      user,
    );

    return new NextResponse(data.csv, {
      headers: {
        "content-disposition": `attachment; filename="${data.filename}"`,
        "content-type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
