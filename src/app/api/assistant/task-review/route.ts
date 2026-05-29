import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { reviewTaskWithServerOrchestrator } from "@/use-cases/task-review-service";

type TaskReviewRouteBody = {
  taskId: string;
  question: string;
  instruction?: string;
  mode: "preview" | "generate";
};

function parseTaskReviewRouteBody(rawBody: unknown): TaskReviewRouteBody {
  if (rawBody === null || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    throw badRequest("Invalid task review payload", "TASK_REVIEW_PAYLOAD_INVALID");
  }

  const body = rawBody as Record<string, unknown>;
  if (typeof body.taskId !== "string" || body.taskId.trim() === "") {
    throw badRequest("taskId is required", "TASK_REVIEW_TASK_ID_REQUIRED");
  }
  if (typeof body.question !== "string" || body.question.trim() === "") {
    throw badRequest("question is required", "TASK_REVIEW_QUESTION_REQUIRED");
  }

  let mode: TaskReviewRouteBody["mode"] = "preview";
  if (body.mode !== undefined) {
    if (body.mode !== "preview" && body.mode !== "generate") {
      throw badRequest("mode is invalid", "TASK_REVIEW_MODE_INVALID");
    }
    mode = body.mode;
  }

  return {
    taskId: body.taskId,
    question: body.question,
    ...(typeof body.instruction === "string" ? { instruction: body.instruction } : {}),
    mode,
  };
}

export async function POST(request: Request) {
  try {
    assertRequestIntegrity(request);
    const user = await requireUser();
    const body = parseTaskReviewRouteBody(await request.json());
    if (body.mode === "generate") {
      await requireCurrentProjectEditor(user);
    } else {
      await requireCurrentProjectAccess(user);
    }

    const data = await reviewTaskWithServerOrchestrator(
      {
        taskId: body.taskId,
        question: body.question,
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
