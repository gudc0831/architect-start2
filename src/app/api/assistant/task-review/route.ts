import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import type { TaskReviewRequest } from "@/domains/assistant/task-review";
import { reviewTaskWithServerOrchestrator } from "@/use-cases/task-review-service";

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const body = (await request.json()) as Partial<TaskReviewRequest>;
    const data = await reviewTaskWithServerOrchestrator(
      {
        taskId: String(body.taskId ?? ""),
        question: String(body.question ?? ""),
        instruction: body.instruction,
        mode: body.mode,
      },
      user,
    );

    return NextResponse.json({ data }, { status: data.status === "blocked" ? 409 : 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
