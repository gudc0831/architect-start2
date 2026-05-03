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
  createTask(input) {
    return getTaskRepository().createTask(input);
  },
  updateTask(taskId, input) {
    return getTaskRepository().updateTask(taskId, input);
  },
  updateTaskWithVersion(taskId, input) {
    return getTaskRepository().updateTaskWithVersion(taskId, input);
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
};
