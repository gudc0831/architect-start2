import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import { createAssistantActionAuditGovernanceNote } from "@/use-cases/assistant-saas-mode-service";

export async function POST(request: Request, context: { params: Promise<{ auditId: string }> }) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const { auditId } = await context.params;
    const { searchParams } = new URL(request.url);
    const body = await request.json();
    const data = await createAssistantActionAuditGovernanceNote(
      {
        ...body,
        auditId,
        projectId: searchParams.get("projectId"),
        month: searchParams.get("month"),
      },
      user,
    );

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
