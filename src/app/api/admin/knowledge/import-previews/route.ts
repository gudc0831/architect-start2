import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { assertKnowledgeCapability, requireKnowledgeAdmin } from "@/lib/auth/knowledge-guards";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { backendMode } from "@/lib/backend-mode";
import {
  createKnowledgeImportPreview,
  listKnowledgeImportPreviews,
} from "@/use-cases/admin/knowledge-import-preview-service";

export async function GET() {
  try {
    const user = await requireKnowledgeAdmin();
    const context = await requireCurrentProjectAccess(user);
    if (backendMode !== "cloud") {
      return NextResponse.json({ data: [] });
    }
    const data = await listKnowledgeImportPreviews(context.project.id);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireKnowledgeAdmin();
    assertKnowledgeCapability(user, "knowledge.import.preview");
    const context = await requireCurrentProjectAccess(user);
    const body = await request.json();
    const data = await createKnowledgeImportPreview({
      projectId: context.project.id,
      defaultTaskId: isRecord(body) ? body.defaultTaskId : "",
      workspaceFingerprint: isRecord(body) ? body.workspaceFingerprint : "",
      items: isRecord(body) ? body.items : [],
    }, user);
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
