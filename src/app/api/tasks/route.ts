import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { createTask, listTasks } from "@/use-cases/task-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "trash" ? "trash" : "active";
    const data = await listTasks(scope);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const task = await createTask({
      dueDate: body.dueDate,
      category: body.category,
      requester: body.requester,
      assignee: body.assignee,
      title: body.title,
      isDaily: Boolean(body.isDaily),
      description: body.description ?? "",
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}