import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { reviewKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    const { recordId } = await context.params;
    const body = await request.json();
    const data = await reviewKnowledgeCandidate({
      action: "approve",
      recordId,
      reviewerId: user.id,
      title: isRecord(body) ? body.title : "",
      summary: isRecord(body) ? body.summary : "",
      bodyMarkdown: isRecord(body) ? body.bodyMarkdown : "",
      tags: isRecord(body) ? body.tags : [],
      scope: isRecord(body) ? body.scope : "organization",
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
