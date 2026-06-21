import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { importKnowledgeImportPreview } from "@/use-cases/admin/knowledge-import-preview-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ previewId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.import.confirm");
    const projectContext = await requireCurrentProjectAccess(user);
    const { previewId } = await context.params;
    const data = await importKnowledgeImportPreview({ projectId: projectContext.project.id, previewId }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
