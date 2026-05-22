import { forbidden, serviceUnavailable } from "@/lib/api/errors";
import { isDatabaseConnectivityError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { listEffectiveTaskCategoriesForProject, listProjectsForSession } from "@/use-cases/admin/admin-service";
import { listTasks } from "@/use-cases/task-service";
import type { TaskRecord } from "@/domains/task/types";
import type { WorkspaceBootstrapPayload } from "@/lib/workspace/bootstrap-types";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

export async function loadWorkspaceBootstrap(): Promise<WorkspaceBootstrapPayload> {
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

  const [effectiveCategories, activeTasksResult] = await Promise.all([
    listEffectiveTaskCategoriesForProject(selectedProject.id),
    listTasks("active", selectedProject)
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
      }),
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
    activeTasksError: activeTasksResult.error,
  };
}
