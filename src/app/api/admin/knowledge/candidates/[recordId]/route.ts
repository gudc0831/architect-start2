import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { getKnowledgeCandidate } from "@/use-cases/admin/knowledge-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ recordId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.candidates.review");
    const projectContext = await requireCurrentProjectAccess(user);
    const { recordId } = await context.params;
    const data = await getKnowledgeCandidate(recordId, { projectId: projectContext.project.id });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
