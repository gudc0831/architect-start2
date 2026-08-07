import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { backendMode } from "@/lib/backend-mode";
import { listProjectContextUploads } from "@/use-cases/project-context-approval-service";
import { processProjectContextUpload } from "@/use-cases/project-context-processing-service";
import { createProjectContextUpload } from "@/use-cases/project-context-upload-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId } = await context.params;
    if (backendMode !== "cloud") {
      return NextResponse.json({ data: { items: [], canApprove: user.role === "admin" } });
    }
    const data = await listProjectContextUploads({ projectId, user });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const { projectId } = await context.params;
    await requireProjectEditor(projectId, user);
    const formData = await request.formData();
    const file = formData.get("file");
    const uploadedTaskIdValue = formData.get("uploadedTaskId");

    if (!(file instanceof File)) {
      throw badRequest("file is required", "PROJECT_CONTEXT_UPLOAD_FILE_REQUIRED");
    }

    const uploadedTaskId =
      typeof uploadedTaskIdValue === "string" && uploadedTaskIdValue.trim() ? uploadedTaskIdValue.trim() : null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const data = await createProjectContextUpload({
      projectId,
      user,
      uploadedTaskId,
      originalFilename: file.name,
      mimeType: file.type,
      fileSizeBytes: file.size,
      bytes,
    });
    const processing = await processProjectContextUpload({
      projectId,
      uploadId: data.uploadId,
    });

    return NextResponse.json({ data: { ...data, processing } }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
