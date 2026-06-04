import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { getProjectContextUploadPreview } from "@/use-cases/project-context-approval-service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; uploadId: string }> },
) {
  try {
    const user = await requireUser();
    const { projectId, uploadId } = await context.params;
    const data = await getProjectContextUploadPreview({ projectId, uploadId, user });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}
