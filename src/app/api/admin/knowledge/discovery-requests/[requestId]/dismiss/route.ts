import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { dismissKnowledgeDiscoveryRequest } from "@/use-cases/admin/knowledge-discovery-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.discovery.dismiss");
    const projectContext = await requireCurrentProjectAccess(user);
    const { requestId } = await context.params;
    const data = await dismissKnowledgeDiscoveryRequest({ projectId: projectContext.project.id, requestId }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
