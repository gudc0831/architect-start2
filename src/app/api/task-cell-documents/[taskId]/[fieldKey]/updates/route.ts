import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { badRequest } from "@/lib/api/errors";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { applyTaskCellDocumentUpdate } from "@/use-cases/task-cell-document-service";

export const maxDuration = 30;

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string; fieldKey: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const projectContext = await requireCurrentProjectEditor(user);
    const { taskId, fieldKey } = await context.params;
    const body = await request.json();
    if (!isRecord(body)) {
      throw badRequest("Request body is invalid.", "TASK_CELL_DOCUMENT_BODY_INVALID");
    }

    const document = await applyTaskCellDocumentUpdate({
      projectId: projectContext.project.id,
      taskId,
      fieldKey,
      actorProfileId: user.id,
      clientUpdateId: String(body.clientUpdateId ?? ""),
      updateBase64: String(body.updateBase64 ?? body.update ?? ""),
    });

    return NextResponse.json({ data: document });
  } catch (error) {
    return handleRouteError(error);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
