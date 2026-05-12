import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantAuditRetentionPreview } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantAuditRetentionPreview(
      {
        projectId: searchParams.get("projectId"),
        retentionDays: searchParams.get("retentionDays"),
        limit: searchParams.get("limit"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
