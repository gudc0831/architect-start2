import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { createTask, listTasks } from "@/use-cases/task-service";

export async function GET(request: Request) {
  try {
    await requireUser();
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
    const user = await requireUser();
    const body = await request.json();
    const task = await createTask(
      {
        dueDate: body.dueDate,
        category: body.category,
        requester: body.requester,
        assignee: body.assignee,
        title: body.title,
        createdAt: body.createdAt,
        isDaily: Boolean(body.isDaily),
        description: body.description ?? "",
        fileMemo: body.fileMemo ?? "",
        parentTaskId: body.parentTaskId ?? null,
        parentTaskNumber: body.parentTaskNumber ?? undefined,
      },
      user.id,
    );

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
