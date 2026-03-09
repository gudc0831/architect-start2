import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { updateTask } from "@/use-cases/task-service";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await context.params;
    const body = await request.json();
    const task = await updateTask(taskId, body);

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleRouteError(error);
  }
}