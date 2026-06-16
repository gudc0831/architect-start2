import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { reviewKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.candidates.review");
    const projectContext = await requireCurrentProjectAccess(user);
    const { recordId } = await context.params;
    const body = await request.json();
    const bodyRecord = isRecord(body) ? body : null;
    const data = await reviewKnowledgeCandidate({
      action: "approve",
      recordId,
      projectId: projectContext.project.id,
      reviewerId: user.id,
      title: bodyRecord?.title ?? "",
      summary: bodyRecord?.summary ?? "",
      bodyMarkdown: bodyRecord?.bodyMarkdown ?? "",
      tags: bodyRecord?.tags ?? [],
      scope: bodyRecord?.scope ?? "organization",
      structuredDraft: bodyRecord?.structuredDraft,
      generationRunId: bodyRecord?.generationRunId,
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
