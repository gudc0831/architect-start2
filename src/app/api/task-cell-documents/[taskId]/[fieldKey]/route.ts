import { NextResponse } from "next/server";
import { notFound } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { requireUser } from "@/lib/auth/require-user";
import { isDailyCellDocumentsEnabled } from "@/lib/features/daily-cell-documents";
import { getTaskCellDocument } from "@/use-cases/task-cell-document-service";

export const maxDuration = 30;

export async function GET(
  request: Request,
  context: { params: Promise<{ taskId: string; fieldKey: string }> },
) {
  try {
    if (!isDailyCellDocumentsEnabled()) {
      throw notFound("Task cell documents are disabled.", "TASK_CELL_DOCUMENTS_DISABLED");
    }

    const user = await requireUser();
    const projectContext = await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const { taskId, fieldKey } = await context.params;
    const document = await getTaskCellDocument({
      projectId: projectContext.project.id,
      taskId,
      fieldKey,
      knownVersion: readOptionalInteger(searchParams.get("knownVersion")),
      stateVectorBase64: searchParams.get("stateVector") ?? searchParams.get("stateVectorBase64"),
    });

    return NextResponse.json({ data: document });
  } catch (error) {
    return handleRouteError(error);
  }
}

function readOptionalInteger(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
