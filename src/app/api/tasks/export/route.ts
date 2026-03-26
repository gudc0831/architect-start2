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
    const taskIds = new Set(tasks.map((task) => task.id));
    const files = allFiles.filter((file) => taskIds.has(file.taskId));

    const layout = mergeTaskExportLayout(body, storedLayout);
    const workbook = await buildTaskExportWorkbook({
      projectName: project.name,
      tasks,
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

  try {
    const body = (await request.json()) as TaskExportLayoutInput;
    return {
      columnWidths: body.columnWidths,
      rowHeights: body.rowHeights,
    };
  } catch {
    throw badRequest("Invalid export payload", "EXPORT_TASKS_PAYLOAD_INVALID");
  }
}
