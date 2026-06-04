import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { createFileDownloadUrl } from "@/use-cases/file-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    assertRequestIntegrity(_request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { fileId } = await context.params;
    const url = await createFileDownloadUrl(fileId);
    return NextResponse.json({ url });
  } catch (error) {
    return handleRouteError(error);
  }
}
