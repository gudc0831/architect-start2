import type { FileRepository, PreferenceRepository, ProjectRepository, TaskRepository } from "@/repositories/contracts";
import { backendMode } from "@/lib/backend-mode";
import { firestoreFileRepository, firestoreTaskRepository } from "@/repositories/firestore/store";
import { localPreferenceRepository } from "@/repositories/local/preference-store";
import { localProjectRepository } from "@/repositories/local/project-store";
import { memoryFileRepository, memoryTaskRepository } from "@/repositories/memory/store";
import {
  postgresFileRepository,
  postgresPreferenceRepository,
  postgresProjectRepository,
  postgresTaskRepository,
} from "@/repositories/postgres/store";

let taskRepositoryInstance: TaskRepository | null = null;
let fileRepositoryInstance: FileRepository | null = null;
let projectRepositoryInstance: ProjectRepository | null = null;
let preferenceRepositoryInstance: PreferenceRepository | null = null;

function getTaskRepository(): TaskRepository {
  if (!taskRepositoryInstance) {
    if (backendMode === "cloud") {
      taskRepositoryInstance = postgresTaskRepository;
    } else if (backendMode === "firestore") {
      taskRepositoryInstance = firestoreTaskRepository as TaskRepository;
    } else {
      taskRepositoryInstance = memoryTaskRepository as TaskRepository;
    }
  }

  return taskRepositoryInstance!;
}

function getFileRepository(): FileRepository {
  if (!fileRepositoryInstance) {
    if (backendMode === "cloud") {
      fileRepositoryInstance = postgresFileRepository;
    } else if (backendMode === "firestore") {
      fileRepositoryInstance = firestoreFileRepository;
    } else {
      fileRepositoryInstance = memoryFileRepository;
    }
  }

  return fileRepositoryInstance!;
}

function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = backendMode === "cloud" ? postgresProjectRepository : localProjectRepository;
  }

  return projectRepositoryInstance!;
}

function getPreferenceRepository(): PreferenceRepository {
  if (!preferenceRepositoryInstance) {
    preferenceRepositoryInstance = backendMode === "cloud" ? postgresPreferenceRepository : localPreferenceRepository;
  }

  return preferenceRepositoryInstance!;
}

export const taskRepository: TaskRepository = {
  listActiveTasks(projectId) {
    return getTaskRepository().listActiveTasks(projectId);
  },
  listTrashTasks(projectId) {
    return getTaskRepository().listTrashTasks(projectId);
  },
  findTaskById(taskId) {
    return getTaskRepository().findTaskById(taskId);
  },
  createTask(input, options) {
    return getTaskRepository().createTask(input, options);
  },
  updateTask(taskId, input) {
    return getTaskRepository().updateTask(taskId, input);
  },
  updateTaskWithVersion(taskId, input) {
    return getTaskRepository().updateTaskWithVersion(taskId, input);
  },
  async setTaskSiblingOrder(input) {
    const repository = getTaskRepository();
    if (repository.setTaskSiblingOrder) {
      return repository.setTaskSiblingOrder(input);
    }

    const activeTasks = await repository.listActiveTasks(input.projectId);
    const parentTaskId = input.parentTaskId ?? null;
    const siblings = activeTasks
      .filter((task) => (task.parentTaskId ?? null) === parentTaskId)
      .sort((left, right) => left.siblingOrder - right.siblingOrder || left.actionId - right.actionId || left.id.localeCompare(right.id));
    const siblingIds = new Set(siblings.map((task) => task.id));
    const seenIds = new Set<string>();
    const orderedSiblings: typeof siblings = [];
    const siblingOrderStart =
      Number.isInteger(input.siblingOrderStart) && (input.siblingOrderStart ?? 0) >= 0 ? input.siblingOrderStart ?? 0 : 0;
    const shouldAppendMissingSiblings = input.siblingOrderStart === undefined;

    for (const taskId of input.orderedTaskIds) {
      if (seenIds.has(taskId) || !siblingIds.has(taskId)) {
        continue;
      }

      const task = siblings.find((candidate) => candidate.id === taskId);
      if (task) {
        seenIds.add(taskId);
        orderedSiblings.push(task);
      }
    }

    if (shouldAppendMissingSiblings) {
      for (const sibling of siblings) {
        if (!seenIds.has(sibling.id)) {
          orderedSiblings.push(sibling);
        }
      }
    }

    return repository.updateTaskOrders(
      orderedSiblings
        .map((task, index) => ({
          id: task.id,
          siblingOrder: siblingOrderStart + index,
          expectedVersion: task.version,
          updatedBy: input.updatedBy,
        }))
        .filter((update) => activeTasks.find((task) => task.id === update.id)?.siblingOrder !== update.siblingOrder),
    );
  },
  listTaskUserOrders(projectId, profileId) {
    const repository = getTaskRepository();
    return repository.listTaskUserOrders ? repository.listTaskUserOrders(projectId, profileId) : Promise.resolve([]);
  },
  setTaskUserSiblingOrder(input) {
    const repository = getTaskRepository();
    return repository.setTaskUserSiblingOrder ? repository.setTaskUserSiblingOrder(input) : Promise.resolve([]);
  },
  updateTaskOrders(inputs) {
    return getTaskRepository().updateTaskOrders(inputs);
  },
  syncProjectTaskIssueIds(projectId, projectName, updatedBy) {
    return getTaskRepository().syncProjectTaskIssueIds(projectId, projectName, updatedBy);
  },
  moveTaskToTrash(taskId, updatedBy) {
    return getTaskRepository().moveTaskToTrash(taskId, updatedBy);
  },
  restoreTask(taskId, updatedBy) {
    return getTaskRepository().restoreTask(taskId, updatedBy);
  },
  deleteTask(taskId) {
    return getTaskRepository().deleteTask(taskId);
  },
  getNextTaskNumber(projectId) {
    return getTaskRepository().getNextTaskNumber(projectId);
  },
};

export const fileRepository: FileRepository = {
  listActiveFiles(taskId) {
    return getFileRepository().listActiveFiles(taskId);
  },
  listTrashFiles(taskId) {
    return getFileRepository().listTrashFiles(taskId);
  },
  listFilesByTask(taskId) {
    return getFileRepository().listFilesByTask(taskId);
  },
  listFilesByProject(projectId) {
    return getFileRepository().listFilesByProject(projectId);
  },
  async listFileSummaryByProject(projectId, scope = "active") {
    const repository = getFileRepository();
    if (repository.listFileSummaryByProject) {
      return repository.listFileSummaryByProject(projectId, scope);
    }

    const files = scope === "trash" ? await repository.listTrashFiles() : await repository.listFilesByProject(projectId);
    const summaryByTaskId: Record<string, { count: number; latestFileName: string | null; latestCreatedAt: string | null }> = {};
    for (const file of files) {
      if (file.projectId !== projectId || file.purgedAt) {
        continue;
      }

      const current = summaryByTaskId[file.taskId] ?? { count: 0, latestFileName: null, latestCreatedAt: null };
      const isLatest = !current.latestCreatedAt || file.createdAt >= current.latestCreatedAt;
      summaryByTaskId[file.taskId] = {
        count: current.count + 1,
        latestFileName: isLatest ? file.originalName : current.latestFileName,
        latestCreatedAt: isLatest ? file.createdAt : current.latestCreatedAt,
      };
    }

    return Object.fromEntries(
      Object.entries(summaryByTaskId).map(([taskId, summary]) => [
        taskId,
        { count: summary.count, latestFileName: summary.latestFileName },
      ]),
    );
  },
  searchFileAnalyses(input) {
    return getFileRepository().searchFileAnalyses(input);
  },
  findFileById(fileId) {
    return getFileRepository().findFileById(fileId);
  },
  attachFile(input) {
    return getFileRepository().attachFile(input);
  },
  moveFileToTrash(fileId) {
    return getFileRepository().moveFileToTrash(fileId);
  },
  restoreFile(fileId) {
    return getFileRepository().restoreFile(fileId);
  },
  deleteFile(fileId) {
    return getFileRepository().deleteFile(fileId);
  },
  moveFilesToTrashByTask(taskId) {
    return getFileRepository().moveFilesToTrashByTask(taskId);
  },
  restoreFilesByTask(taskId) {
    return getFileRepository().restoreFilesByTask(taskId);
  },
  updateFileMetadata(fileId, metadata) {
    return getFileRepository().updateFileMetadata(fileId, metadata);
  },
};

export const projectRepository: ProjectRepository = {
  getProject() {
    return getProjectRepository().getProject();
  },
  updateProject(input) {
    return getProjectRepository().updateProject(input);
  },
};

export const preferenceRepository: PreferenceRepository = {
  getQuickCreateWidths(profileId) {
    return getPreferenceRepository().getQuickCreateWidths(profileId);
  },
  saveQuickCreateWidths(profileId, widths) {
    return getPreferenceRepository().saveQuickCreateWidths(profileId, widths);
  },
  getTaskListLayout(profileId) {
    return getPreferenceRepository().getTaskListLayout(profileId);
  },
  saveTaskListLayout(profileId, layout) {
    return getPreferenceRepository().saveTaskListLayout(profileId, layout);
  },
  getThemePreference(profileId) {
    return getPreferenceRepository().getThemePreference(profileId);
  },
  saveThemePreference(profileId, themeId) {
    return getPreferenceRepository().saveThemePreference(profileId, themeId);
  },
  getAiSettingsPreference(profileId) {
    return getPreferenceRepository().getAiSettingsPreference(profileId);
  },
  saveAiSettingsPreference(profileId, preference) {
    return getPreferenceRepository().saveAiSettingsPreference(profileId, preference);
  },
};
