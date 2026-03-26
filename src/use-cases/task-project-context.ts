import { serviceUnavailable } from "@/lib/api/errors";
import { adminRepository } from "@/repositories/admin";
import { getCurrentProjectForSession } from "@/use-cases/admin/admin-service";

type SelectedTaskProject = Awaited<ReturnType<typeof getCurrentProjectForSession>>;

export async function getSelectedTaskProject(): Promise<SelectedTaskProject> {
  try {
    return await getCurrentProjectForSession();
  } catch (error) {
    if (!isMissingRequestScopeError(error)) {
      throw error;
    }
  }

  const selection = await adminRepository.getProjectSelection();
  const currentProject =
    selection.availableProjects.find((project) => project.id === selection.currentProjectId) ?? selection.availableProjects[0] ?? null;

  if (!currentProject) {
    throw serviceUnavailable("No project is configured", "PROJECT_MISSING");
  }

  return {
    id: currentProject.id,
    name: currentProject.name,
    source: currentProject.source,
    currentProjectId: currentProject.id,
    availableProjects: selection.availableProjects,
  };
}

function isMissingRequestScopeError(error: unknown) {
  return error instanceof Error && error.message.includes("outside a request scope");
}
