import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { exportAssistantAuditRetentionArchivePreview } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await exportAssistantAuditRetentionArchivePreview(
      {
        projectId: searchParams.get("projectId"),
        retentionDays: searchParams.get("retentionDays"),
        cutoffAt: searchParams.get("cutoffAt"),
        limit: searchParams.get("limit"),
      },
      user,
    );

    return new NextResponse(data.json, {
      headers: {
        "content-disposition": `attachment; filename="${data.filename}"`,
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
