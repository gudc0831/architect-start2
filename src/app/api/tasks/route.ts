import { NextResponse } from "next/server";
import { DEFAULT_TASK_STATUS } from "@/domains/task/status";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess, requireCurrentProjectEditor } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { createTask, listTasks } from "@/use-cases/task-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
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
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectEditor(user);
    const body = await request.json();
    const task = await createTask(
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
