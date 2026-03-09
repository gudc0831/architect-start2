import { NextResponse } from "next/server";
import { fileRepository, taskRepository } from "@/repositories";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { taskId } = await context.params;
  const task = await taskRepository.moveTaskToTrash(taskId);
  await fileRepository.moveFilesToTrashByTask(taskId);

  return NextResponse.json({ data: task });
}
