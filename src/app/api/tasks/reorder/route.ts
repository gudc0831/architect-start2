import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import type { TaskOrderingStrategy, TaskReorderCommand } from "@/domains/task/ordering";
import { reorderTasks } from "@/use-cases/task-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const command = buildReorderCommand(body);
    const data = await reorderTasks(command, user.id);

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function buildReorderCommand(body: unknown): TaskReorderCommand {
  if (!isRecord(body) || typeof body.action !== "string") {
    throw badRequest("action is required", "TASK_REORDER_ACTION_REQUIRED");
  }

  if (body.action === "manual_move") {
    const movedTaskId = String(body.movedTaskId ?? "").trim();
    if (!movedTaskId) {
      throw badRequest("movedTaskId is required", "TASK_REORDER_MOVED_TASK_ID_REQUIRED");
    }

    const rawTargetIndex = body.targetIndex;
    if (typeof rawTargetIndex !== "number" && typeof rawTargetIndex !== "string") {
      throw badRequest("targetIndex is required", "TASK_REORDER_TARGET_INDEX_REQUIRED");
    }

    const targetIndex = Number(rawTargetIndex);
    if (!Number.isInteger(targetIndex) || targetIndex < 0) {
      throw badRequest("targetIndex is required", "TASK_REORDER_TARGET_INDEX_REQUIRED");
    }

    return {
      action: "manual_move",
      movedTaskId,
      targetParentTaskId: normalizeNullableId(body.targetParentTaskId),
      targetIndex,
    };
  }

  if (body.action !== "auto_sort") {
    throw badRequest("action is invalid", "TASK_REORDER_ACTION_INVALID");
  }

  return {
    action: "auto_sort",
    strategy: normalizeStrategy(body.strategy),
  };
}

function normalizeStrategy(value: unknown): TaskOrderingStrategy {
  if (value === "action_id") {
    return "action_id";
  }

  if (value === undefined || value === null || value === "priority") {
    return "priority";
  }

  throw badRequest("strategy is invalid", "TASK_REORDER_STRATEGY_INVALID");
}

function normalizeNullableId(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
