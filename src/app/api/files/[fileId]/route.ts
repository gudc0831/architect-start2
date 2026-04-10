import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { permanentlyDeleteFile } from "@/use-cases/file-service";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    assertRequestIntegrity(_request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { fileId } = await context.params;
    await permanentlyDeleteFile(fileId);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
