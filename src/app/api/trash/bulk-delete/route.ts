import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { bulkDeleteTrashSelection } from "@/use-cases/trash-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const body = (await request.json()) as { taskIds?: string[]; fileIds?: string[] };
    await bulkDeleteTrashSelection(
      {
        taskIds: Array.isArray(body?.taskIds) ? body.taskIds : [],
        fileIds: Array.isArray(body?.fileIds) ? body.fileIds : [],
      },
      user.id,
    );

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}
