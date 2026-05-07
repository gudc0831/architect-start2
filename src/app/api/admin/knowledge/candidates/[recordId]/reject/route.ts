import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireRole } from "@/lib/auth/require-user";
import { reviewKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireRole("admin");
    const { recordId } = await context.params;
    const body = await request.json();
    const data = await reviewKnowledgeCandidate({
      action: "reject",
      recordId,
      reviewerId: user.id,
      rejectionReason: isRecord(body) ? body.rejectionReason : "",
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
