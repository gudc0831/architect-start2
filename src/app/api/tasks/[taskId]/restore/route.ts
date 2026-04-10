import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { restoreTask } from "@/use-cases/task-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    assertRequestIntegrity(_request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const { taskId } = await context.params;
    const task = await restoreTask(taskId, user.id);

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleRouteError(error);
  }
}
