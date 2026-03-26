import { createRequire } from "node:module";
import type { FileRepository, PreferenceRepository, ProjectRepository, TaskRepository } from "@/repositories/contracts";
import { backendMode } from "@/lib/backend-mode";

const require = createRequire(import.meta.url);

let taskRepositoryInstance: TaskRepository | null = null;
let fileRepositoryInstance: FileRepository | null = null;
let projectRepositoryInstance: ProjectRepository | null = null;
let preferenceRepositoryInstance: PreferenceRepository | null = null;

function getTaskRepository(): TaskRepository {
  if (!taskRepositoryInstance) {
    if (backendMode === "cloud") {
      taskRepositoryInstance = require("./postgres/store").postgresTaskRepository as TaskRepository;
    } else if (backendMode === "firestore") {
      taskRepositoryInstance = require("./firestore/store").firestoreTaskRepository as TaskRepository;
    } else {
      taskRepositoryInstance = require("./memory/store").memoryTaskRepository as TaskRepository;
    }
  }

  return taskRepositoryInstance;
}

function getFileRepository(): FileRepository {
  if (!fileRepositoryInstance) {
    if (backendMode === "cloud") {
      fileRepositoryInstance = require("./postgres/store").postgresFileRepository as FileRepository;
    } else if (backendMode === "firestore") {
      fileRepositoryInstance = require("./firestore/store").firestoreFileRepository as FileRepository;
    } else {
      fileRepositoryInstance = require("./memory/store").memoryFileRepository as FileRepository;
    }
  }

  return fileRepositoryInstance;
}

function getProjectRepository(): ProjectRepository {
  if (!projectRepositoryInstance) {
    projectRepositoryInstance = backendMode === "cloud"
      ? require("./postgres/store").postgresProjectRepository as ProjectRepository
      : require("./local/project-store").localProjectRepository as ProjectRepository;
  }

  return projectRepositoryInstance;
}

function getPreferenceRepository(): PreferenceRepository {
  if (!preferenceRepositoryInstance) {
    preferenceRepositoryInstance = backendMode === "cloud"
      ? require("./postgres/store").postgresPreferenceRepository as PreferenceRepository
      : require("./local/preference-store").localPreferenceRepository as PreferenceRepository;
  }

  return preferenceRepositoryInstance;
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
};
