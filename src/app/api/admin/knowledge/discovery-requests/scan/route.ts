import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { runKnowledgeDiscoveryScan } from "@/use-cases/admin/knowledge-discovery-scan-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.discovery.scan");
    const projectContext = await requireCurrentProjectAccess(user);
    const data = await runKnowledgeDiscoveryScan(projectContext.project.id, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
