import { badRequest } from "@/lib/api/errors";
import { buildProjectIssueId } from "@/domains/task/identifiers";
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
    await syncProjectTaskIssueIds(project.id, project.name, userId ?? null);
  } catch (error) {
    if (currentProject.name !== project.name) {
      await projectRepository.updateProject({
        name: currentProject.name,
        updatedBy: userId ?? null,
      });
      await syncProjectTaskIssueIds(currentProject.id, currentProject.name, userId ?? null);
    }

    throw error;
  }

  return project;
}

async function syncProjectTaskIssueIds(projectId: string, projectName: string, userId: string | null) {
  const [activeTasks, trashTasks] = await Promise.all([
    taskRepository.listActiveTasks(projectId),
    taskRepository.listTrashTasks(projectId),
  ]);

  for (const task of [...activeTasks, ...trashTasks]) {
    const nextIssueId = buildProjectIssueId(projectName, task.taskNumber || task.actionId || 1);
    if (task.issueId === nextIssueId) {
      continue;
    }

    await taskRepository.updateTask(task.id, {
      issueId: nextIssueId,
      updatedBy: userId ?? task.updatedBy ?? null,
    });
  }
}
