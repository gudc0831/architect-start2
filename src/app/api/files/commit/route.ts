import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { commitFileUpload } from "@/use-cases/file-service";
import { requireTaskInSelectedProject } from "@/use-cases/project-scope-guard";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = (await request.json()) as {
      projectId?: string;
      taskId?: string;
      sourceFileId?: string | null;
      replaceFileId?: string | null;
      fileId?: string | null;
      storageBucket?: string;
      objectPath?: string;
      fileGroupId?: string;
      nextVersion?: number;
      originalName?: string;
      mimeType?: string | null;
      contentType?: string | null;
      sizeBytes?: number;
    };

    if (
      typeof body.taskId !== "string" ||
      typeof body.storageBucket !== "string" ||
      typeof body.objectPath !== "string" ||
      typeof body.fileGroupId !== "string" ||
      typeof body.nextVersion !== "number" ||
      typeof body.originalName !== "string" ||
      typeof body.sizeBytes !== "number"
    ) {
      throw badRequest("taskId, storageBucket, objectPath, fileGroupId, nextVersion, originalName, and sizeBytes are required", "FILE_UPLOAD_COMMIT_INVALID");
    }

    const task = await requireTaskInSelectedProject(body.taskId);
    const data = await commitFileUpload({
      projectId: typeof body.projectId === "string" ? body.projectId : task.projectId,
      taskId: body.taskId,
      sourceFileId: body.sourceFileId ?? body.replaceFileId ?? body.fileId ?? null,
      storageBucket: body.storageBucket,
      objectPath: body.objectPath,
      fileGroupId: body.fileGroupId,
      nextVersion: body.nextVersion,
      originalName: body.originalName,
      mimeType: body.contentType ?? body.mimeType ?? null,
      sizeBytes: body.sizeBytes,
      uploadedBy: user.id,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
