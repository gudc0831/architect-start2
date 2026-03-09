import { NextResponse } from "next/server";
import { taskRepository } from "@/repositories";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const body = await request.json();
  const task = await taskRepository.updateTask(taskId, body);

  return NextResponse.json({ data: task });
}
