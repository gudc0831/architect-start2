import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { attachUploadedFile } from "@/use-cases/file-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const formData = await request.formData();
    const file = formData.get("file");
    const taskId = formData.get("taskId");

    if (!(file instanceof File) || typeof taskId !== "string") {
      throw badRequest("file and taskId are required");
    }

    const record = await attachUploadedFile({ taskId, file, userId: user.id });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
