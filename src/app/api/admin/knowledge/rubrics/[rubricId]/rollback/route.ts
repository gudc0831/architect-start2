import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { rollbackKnowledgeImportRubric } from "@/use-cases/admin/knowledge-rubric-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ rubricId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.rubric.activate");
    const body = await request.json();
    const { rubricId } = await context.params;
    const data = await rollbackKnowledgeImportRubric(rubricId, {
      reason: isRecord(body) ? body.reason : "",
    }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
