import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { moveTaskToTrash } from "@/use-cases/task-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
    const task = await moveTaskToTrash(taskId, user.id);

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleRouteError(error);
  }
}