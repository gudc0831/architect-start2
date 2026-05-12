import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { exportAssistantActionAuditEvidencePackage } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request, context: { params: Promise<{ auditId: string }> }) {
  try {
    const user = await requireRole("admin");
    const { auditId } = await context.params;
    const { searchParams } = new URL(request.url);
    const data = await exportAssistantActionAuditEvidencePackage(
      {
        auditId,
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
      },
      user,
    );

    return new NextResponse(data.markdown, {
      headers: {
        "content-disposition": `attachment; filename="${data.filename}"`,
        "content-type": "text/markdown; charset=utf-8",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
