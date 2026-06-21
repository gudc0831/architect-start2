import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { activateKnowledgeImportRubric } from "@/use-cases/admin/knowledge-rubric-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ rubricId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.rubric.activate");
    const { rubricId } = await context.params;
    const data = await activateKnowledgeImportRubric(rubricId, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
