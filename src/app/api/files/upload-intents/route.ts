import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { createFileUploadIntent } from "@/use-cases/file-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const body = (await request.json()) as {
      taskId?: string;
      fileId?: string | null;
      replaceFileId?: string | null;
      originalName?: string;
      sizeBytes?: number;
      mimeType?: string | null;
      contentType?: string | null;
    };

    if (typeof body?.taskId !== "string" || typeof body.originalName !== "string" || typeof body.sizeBytes !== "number") {
      throw badRequest("taskId, originalName, and sizeBytes are required", "FILE_UPLOAD_INTENT_INVALID");
    }

    const data = await createFileUploadIntent({
      taskId: body.taskId,
      fileId: body.replaceFileId ?? body.fileId ?? null,
      originalName: body.originalName,
      sizeBytes: body.sizeBytes,
      mimeType: body.contentType ?? body.mimeType ?? null,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
