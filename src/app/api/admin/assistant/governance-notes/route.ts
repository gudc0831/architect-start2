import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireRole } from "@/lib/auth/require-user";
import { getAssistantActionAuditGovernanceNoteReport } from "@/use-cases/assistant-saas-mode-service";

export async function GET(request: Request) {
  try {
    const user = await requireRole("admin");
    const { searchParams } = new URL(request.url);
    const data = await getAssistantActionAuditGovernanceNoteReport(
      {
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
        limit: searchParams.get("limit"),
        category: searchParams.get("category"),
        reviewerId: searchParams.get("reviewerId"),
        task: searchParams.get("task"),
        assistantRecordId: searchParams.get("assistantRecordId"),
      },
      user,
    );

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
