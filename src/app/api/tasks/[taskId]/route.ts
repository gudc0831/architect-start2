import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { permanentlyDeleteTask, updateTask } from "@/use-cases/task-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
    const body = await request.json();
    const task = await updateTask(taskId, body, user.id);

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleRouteError(error);
  }
}
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
    await permanentlyDeleteTask(taskId, user.id);

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleRouteError(error);
  }
}


