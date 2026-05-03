import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api/route-error";
import { requireCurrentProjectAccess } from "@/lib/auth/project-guards";
import { assertRequestIntegrity } from "@/lib/auth/request-integrity";
import { requireUser } from "@/lib/auth/require-user";
import { badRequest } from "@/lib/api/errors";
import {
  taskCategoryFieldKeys,
} from "@/domains/admin/task-category-definitions";
import {
  matchesTaskCategoricalFilter,
  taskCategoricalFilterFieldKeys,
  type TaskCategoricalFilterFieldKey,
  type TaskCategoricalFilterSelection,
} from "@/lib/task-categorical-filter";
import { listEffectiveTaskCategoriesForSession } from "@/use-cases/admin/admin-service";
import { getAdminFoundationSettings } from "@/use-cases/admin/admin-service";
import { getTaskListLayout } from "@/use-cases/preference-service";
import { listFiles } from "@/use-cases/file-service";
import { getSelectedTaskProject } from "@/use-cases/task-project-context";
import { listTasks } from "@/use-cases/task-service";
import type { TaskRecord } from "@/domains/task/types";
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
    assertRequestIntegrity(request);
    const user = await requireUser();
    await requireCurrentProjectAccess(user);
    const body = await readRequestBody(request);
    const [project, tasks, allFiles, storedLayout, categoryDefinitions, foundationSettings] = await Promise.all([
      getSelectedTaskProject(),
      listTasks("active"),
      listFiles("active"),
      getTaskListLayout(user.id),
      listEffectiveTaskCategoriesForSession(user),
      getAdminFoundationSettings(),
    ]);
    const selectedCategoricalFilters = resolveExportCategoricalFilters(body);
    const categoricalFieldContext = {
      categoryDefinitionsByField: Object.fromEntries(
        taskCategoryFieldKeys.map((fieldKey) => [fieldKey, categoryDefinitions.byField[fieldKey].displayDefinitions]),
      ),
    };
    const filteredTasks = tasks.filter((task) =>
      taskCategoricalFilterFieldKeys.every((fieldKey) =>
        matchesTaskCategoricalFilter(
          fieldKey,
          valueForTaskField(task, fieldKey),
          selectedCategoricalFilters[fieldKey],
          categoricalFieldContext,
        ),
      ),
    );
    const taskIds = new Set(filteredTasks.map((task) => task.id));
    const files = allFiles.filter((file) => taskIds.has(file.taskId));

    const layout = mergeTaskExportLayout(body, storedLayout);
    const workbook = await buildTaskExportWorkbook({
      projectName: project.name,
      tasks: filteredTasks,
      files,
      layout,
      ownerDiscipline: foundationSettings.ownerDiscipline,
      categoryDefinitionsByField: categoricalFieldContext.categoryDefinitionsByField,
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

  if (body.categoricalFilters !== undefined) {
    if (!isCategoricalFilterSelection(body.categoricalFilters)) {
      throw badRequest("categoricalFilters must be an object keyed by supported category fields", "EXPORT_TASKS_PAYLOAD_INVALID");
    }
  }

  return {
    columnWidths: body.columnWidths,
    rowHeights: body.rowHeights,
    workTypeFilters: body.workTypeFilters,
    categoricalFilters: body.categoricalFilters,
  };
}

function resolveExportCategoricalFilters(body: TaskExportLayoutInput): TaskCategoricalFilterSelection {
  if (body.categoricalFilters && body.categoricalFilters.workType !== undefined) {
    return body.categoricalFilters;
  }

  if (body.workTypeFilters === undefined) {
    return body.categoricalFilters ?? {};
  }

  return {
    ...(body.categoricalFilters ?? {}),
    workType: body.workTypeFilters,
  };
}

function isCategoricalFilterSelection(value: unknown): value is TaskCategoricalFilterSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.entries(value as Record<string, unknown>).every(([fieldKey, selectedValues]) => {
    if (!taskCategoricalFilterFieldKeys.includes(fieldKey as TaskCategoricalFilterFieldKey)) {
      return false;
    }

    return Array.isArray(selectedValues) && selectedValues.every((entry) => typeof entry === "string");
  });
}

function valueForTaskField(
  task: Pick<TaskRecord, "workType" | "coordinationScope" | "requestedBy" | "relatedDisciplines" | "locationRef" | "status">,
  fieldKey: TaskCategoricalFilterFieldKey,
) {
  switch (fieldKey) {
    case "workType":
      return task.workType;
    case "coordinationScope":
      return task.coordinationScope;
    case "requestedBy":
      return task.requestedBy;
    case "relatedDisciplines":
      return task.relatedDisciplines;
    case "locationRef":
      return task.locationRef;
    case "status":
      return task.status;
  }
}
