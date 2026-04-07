import { badRequest } from "@/lib/api/errors";
import { projectRepository, taskRepository } from "@/repositories";

export async function getProject() {
  return projectRepository.getProject();
}

export async function updateProject(name: string, userId?: string | null) {
  const normalized = name.trim();

  if (!normalized) {
    throw badRequest("project name is required", "PROJECT_NAME_REQUIRED");
  }

  const currentProject = await projectRepository.getProject();
  const project = await projectRepository.updateProject({
    name: normalized,
    updatedBy: userId ?? null,
  });

  try {
    await taskRepository.syncProjectTaskIssueIds(project.id, project.name, userId ?? null);
  } catch (error) {
    if (currentProject.name !== project.name) {
      await projectRepository.updateProject({
        name: currentProject.name,
        updatedBy: userId ?? null,
      });
      await taskRepository.syncProjectTaskIssueIds(currentProject.id, currentProject.name, userId ?? null);
    }

    throw error;
  }

  return project;
}
