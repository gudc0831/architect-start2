import { NextResponse } from "next/server";
import { badRequest, forbidden } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { listApprovedKnowledgeItems } from "@/use-cases/admin/knowledge-service";

export async function GET(request: Request) {
  try {
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.approved_wiki.export");
    const projectContext = await requireCurrentProjectAccess(user);
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
    if (!projectId) {
      throw badRequest("projectId is required", "PROJECT_ID_REQUIRED");
    }
    if (projectId !== projectContext.project.id) {
      throw forbidden("Cannot read approved WIKI items outside the current project.", "PROJECT_ACCESS_FORBIDDEN");
    }
    const data = await listApprovedKnowledgeItems({ projectId });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
