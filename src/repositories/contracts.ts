import type { ProjectRecord } from "@/domains/project/types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";

export type CreateTaskInput = {
  dueDate: string;
  category: string;
  requester: string;
  assignee: string;
  title: string;
  isDaily: boolean;
  description: string;
};

export type UpdateTaskInput = Partial<
  Pick<
    TaskRecord,
    | "dueDate"
    | "category"
    | "requester"
    | "assignee"
    | "title"
    | "isDaily"
    | "description"
    | "status"
    | "progressNote"
    | "conclusion"
    | "deletedAt"
  >
>;

export type UpdateProjectInput = Pick<ProjectRecord, "name">;

export interface TaskRepository {
  listActiveTasks(): Promise<TaskRecord[]>;
  listTrashTasks(): Promise<TaskRecord[]>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskRecord>;
  moveTaskToTrash(taskId: string): Promise<TaskRecord>;
  restoreTask(taskId: string): Promise<TaskRecord>;
}

export interface FileRepository {
  listActiveFiles(taskId?: string): Promise<FileRecord[]>;
  listTrashFiles(taskId?: string): Promise<FileRecord[]>;
  findFileById(fileId: string): Promise<FileRecord | null>;
  attachFile(input: {
    taskId: string;
    originalName: string;
    storedName: string;
    storedPath: string;
    fileGroupId?: string;
    versionNumber?: number;
  }): Promise<FileRecord>;
  moveFileToTrash(fileId: string): Promise<FileRecord>;
  restoreFile(fileId: string): Promise<FileRecord>;
  moveFilesToTrashByTask(taskId: string): Promise<void>;
  restoreFilesByTask(taskId: string): Promise<void>;
}

export interface ProjectRepository {
  getProject(): Promise<ProjectRecord>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord>;
}