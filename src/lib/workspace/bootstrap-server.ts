import { forbidden, serviceUnavailable } from "@/lib/api/errors";
import { isDatabaseConnectivityError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { listEffectiveTaskCategoriesForProject, listProjectsForSession } from "@/use-cases/admin/admin-service";
import { listTasks } from "@/use-cases/task-service";
import { taskRepository } from "@/repositories";
import type { TaskRecord } from "@/domains/task/types";
import type { WorkspaceBootstrapPayload } from "@/lib/workspace/bootstrap-types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

type WorkspaceBootstrapOptions = {
  activeTaskOrderScope?: "daily" | null;
  includeActiveTasks?: boolean;
};

export async function loadWorkspaceBootstrap(options: WorkspaceBootstrapOptions = {}): Promise<WorkspaceBootstrapPayload> {
  const user = await requireUser();
  const selection = await listProjectsForSession(user);
  const selectedProject =
    selection.availableProjects.find((project) => project.id === selection.currentProjectId) ??
    selection.availableProjects[0] ??
    null;

  if (!selectedProject) {
    if (user.role !== "admin") {
      throw forbidden("Project access has not been provisioned.", "PROJECT_ACCESS_DENIED");
    }

    throw serviceUnavailable("No project is configured", "PROJECT_MISSING");
  }

  const shouldLoadActiveTasks = options.includeActiveTasks ?? true;
  const shouldLoadDailyUserOrder = true;
  const dailyUserOrdersPromise =
    shouldLoadDailyUserOrder && taskRepository.listTaskUserOrders
      ? taskRepository
          .listTaskUserOrders(selectedProject.id, user.id)
          .then((orders) =>
            orders.map((order) => ({
              taskId: order.taskId,
              parentTaskId: order.parentTaskId,
              siblingOrder: order.siblingOrder,
            })),
          )
          .catch((error: unknown) => {
            console.warn("[workspace-bootstrap] daily task order preload failed", error);
            return [];
          })
      : Promise.resolve(shouldLoadDailyUserOrder ? [] : null);

  const [effectiveCategories, activeTasksResult, activeTaskUserOrders] = await Promise.all([
    listEffectiveTaskCategoriesForProject(selectedProject.id),
    shouldLoadActiveTasks
      ? listTasks("active", selectedProject)
          .then((activeTasks) => ({ activeTasks, error: null }))
          .catch((error: unknown) => {
            console.warn("[workspace-bootstrap] active task preload failed", error);
            return {
              activeTasks: null,
              error: {
                code: isDatabaseConnectivityError(error) ? "DATABASE_UNAVAILABLE" : "TASK_BOOTSTRAP_FAILED",
                message: "Active task preload failed",
              },
            };
          })
      : Promise.resolve({ activeTasks: null, error: null }),
    dailyUserOrdersPromise,
  ]);
  const categoryDefinitionsByField = Object.fromEntries(
    Object.entries(effectiveCategories.byField).map(([fieldKey, value]) => [fieldKey, value.displayDefinitions]),
  );

  return {
    user,
    project: {
      ...selection,
      currentProjectId: selectedProject.id,
      workTypeDefinitions: effectiveCategories.byField.workType.displayDefinitions as WorkTypeDefinition[],
      categoryDefinitionsByField,
    },
    activeTasks: activeTasksResult.activeTasks as TaskRecord[] | null,
    activeTaskUserOrders,
    activeTasksError: activeTasksResult.error,
  };
}
