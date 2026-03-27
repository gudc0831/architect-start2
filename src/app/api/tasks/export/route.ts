import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { badRequest } from "@/lib/api/errors";
import { listEffectiveWorkTypesForSession } from "@/use-cases/admin/admin-service";
import { getTaskListLayout } from "@/use-cases/preference-service";
import { listFiles } from "@/use-cases/file-service";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";
import { listTasks } from "@/use-cases/task-service";
import {
  matchesTaskWorkTypeFilter,
  normalizeTaskWorkTypeFilters,
} from "@/lib/task-work-type-filter";
import {
  buildTaskExportFilename,
  buildTaskExportWorkbook,
  mergeTaskExportLayout,
  serializeTaskExportWorkbook,
  type TaskExportLayoutInput,
} from "@/lib/tasks/task-export";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await readRequestBody(request);
    const [project, tasks, allFiles, storedLayout, workTypes] = await Promise.all([
      getSelectedTaskProject(),
      listTasks("active"),
      listFiles("active"),
      getTaskListLayout(user.id),
      listEffectiveWorkTypesForSession(),
    ]);
    const selectedWorkTypeFilters = normalizeTaskWorkTypeFilters(body.workTypeFilters, workTypes.displayDefinitions);
    const filteredTasks = tasks.filter((task) =>
      matchesTaskWorkTypeFilter(task.workType, selectedWorkTypeFilters, workTypes.displayDefinitions),
    );
    const taskIds = new Set(filteredTasks.map((task) => task.id));
    const files = allFiles.filter((file) => taskIds.has(file.taskId));

    const layout = mergeTaskExportLayout(body, storedLayout);
    const workbook = await buildTaskExportWorkbook({
      projectName: project.name,
      tasks: filteredTasks,
      files,
      layout,
      workTypeDefinitions: workTypes.displayDefinitions,
    });
    const buffer = await serializeTaskExportWorkbook(workbook);
    const filename = buildTaskExportFilename(project.name);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

async function readRequestBody(request: Request): Promise<TaskExportLayoutInput> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw badRequest("Content-Type must be application/json", "EXPORT_TASKS_CONTENT_TYPE_INVALID");
  }

  let body: TaskExportLayoutInput;
  try {
    body = (await request.json()) as TaskExportLayoutInput;
  } catch {
    throw badRequest("Invalid export payload", "EXPORT_TASKS_PAYLOAD_INVALID");
  }

  if (body.workTypeFilters !== undefined) {
    if (!Array.isArray(body.workTypeFilters) || body.workTypeFilters.some((value) => typeof value !== "string")) {
      throw badRequest("workTypeFilters must be an array of strings", "EXPORT_TASKS_PAYLOAD_INVALID");
    }
  }

  return {
    columnWidths: body.columnWidths,
    rowHeights: body.rowHeights,
    workTypeFilters: body.workTypeFilters,
  };
}
