import { NextResponse } from "next/server";
import { DEFAULT_TASK_STATUS } from "@/domains/task/status";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { publishDailyRowRealtimeInvalidation } from "@/lib/tasks/daily-row-realtime-server";
import { createStageTimingCollector, formatServerTimingHeader, timeStage, timeStageSync } from "@/lib/timing/stage-timing";
import { createTask, listTasks } from "@/use-cases/task-service";

export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const context = await requireCurrentProjectAccess(user);
    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") === "trash" ? "trash" : "active";
    const orderProfileId = scope === "active" && searchParams.get("orderScope") === "daily" ? user.id : null;
    const data = await listTasks(scope, context.project, { orderProfileId });

    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  const timing = createStageTimingCollector();
  try {
    timeStageSync(timing.record, "route.integrity", () => assertRequestIntegrity(request));
    const user = await timeStage(timing.record, "route.requireUser", () => requireUser());
    const context = await timeStage(timing.record, "route.projectEditorGuard", () => requireCurrentProjectEditor(user));
    const body = await timeStage(timing.record, "route.bodyParse", () => request.json());
    const task = await timeStage(timing.record, "route.createTask", () =>
      createTask(
      {
        dueDate: body.dueDate ?? body.due_date ?? "",
        workType: body.workType ?? body.work_type ?? "",
        coordinationScope: body.coordinationScope ?? body["Coordination Scope"] ?? "",
        ownerDiscipline: "",
        requestedBy: body.requestedBy ?? body.requested_by ?? "",
        relatedDisciplines: body.relatedDisciplines ?? body["Related Disciplines"] ?? "",
        assignee: body.assignee ?? "",
        assigneeProfileId: body.assigneeProfileId ?? body.assignee_profile_id ?? null,
        issueTitle: body.issueTitle ?? body.issue_title ?? "",
        reviewedAt: body.reviewedAt ?? body.reviewed_at ?? "",
        isDaily: Boolean(body.isDaily ?? true),
        locationRef: body.locationRef ?? body["Location Ref"] ?? "",
        calendarLinked: Boolean(body.calendarLinked ?? body["Calendar Linked"] ?? false),
        issueDetailNote: body.issueDetailNote ?? body["ISSUE Detail Note"] ?? "",
        status: body.status ?? DEFAULT_TASK_STATUS,
        decision: body.decision ?? "",
        createdAt: body.createdAt,
        id: readOptionalClientMutationId(body),
        parentTaskId: body.parentTaskId ?? null,
        parentTaskNumber: body.parentTaskNumber ?? undefined,
        siblingOrder: readOptionalSiblingOrder(body),
      },
      user.id,
      context.project,
      { recordTiming: timing.record },
      ),
    );
    if (task.isDaily) {
      await timeStage(timing.record, "route.publishDailyRealtime", () =>
        publishDailyRowRealtimeInvalidation({
          actorProfileId: user.id,
          clientMutationId: readOptionalClientMutationId(body),
          name: "task-created",
          operationType: "create",
          projectId: context.project.id,
          taskId: task.id,
        }),
      );
    }

    return NextResponse.json(
      { data: task, meta: { timings: timing.timings } },
      { headers: { "Server-Timing": formatServerTimingHeader(timing.timings) }, status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

function readOptionalSiblingOrder(body: Record<string, unknown>) {
  const value = body.siblingOrder ?? body.sibling_order;
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function readOptionalClientMutationId(body: Record<string, unknown>) {
  const value = String(body.clientMutationId ?? body.client_mutation_id ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : undefined;
}
