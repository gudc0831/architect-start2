import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { listKnowledgeCandidates } from "@/use-cases/admin/knowledge-service";

export async function GET() {
  try {
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.candidates.review");
    const projectContext = await requireCurrentProjectAccess(user);
    const data = await listKnowledgeCandidates({ projectId: projectContext.project.id });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
