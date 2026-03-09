import { NextResponse } from "next/server";
import { taskRepository } from "@/repositories";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const data = scope === "trash" ? await taskRepository.listTrashTasks() : await taskRepository.listActiveTasks();

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const task = await taskRepository.createTask({
    dueDate: body.dueDate,
    category: body.category,
    requester: body.requester,
    assignee: body.assignee,
    title: body.title,
    isDaily: Boolean(body.isDaily),
    description: body.description ?? "",
  });

  return NextResponse.json({ data: task }, { status: 201 });
}
