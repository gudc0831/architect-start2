import type { ProjectRecord } from "@/domains/project/types";
import type { FileRecord, TaskRecord } from "@/domains/task/types";

export type CreateTaskInput = {
  projectId: string;
  dueDate: string;
  category: string;
  requester: string;
  assignee: string;
  title: string;
  createdAt?: string;
  isDaily: boolean;
  description: string;
  fileMemo?: string;
  parentTaskId?: string | null;
  parentTaskNumber?: string | null;
  rootTaskId?: string;
  depth?: number;
  siblingOrder?: number;
  createdBy?: string | null;
  updatedBy?: string | null;
};

export type UpdateTaskInput = Partial<
  Pick<
    TaskRecord,
    | "parentTaskId"
    | "rootTaskId"
    | "depth"
    | "siblingOrder"
    | "dueDate"
    | "category"
    | "requester"
    | "assignee"
    | "title"
    | "createdAt"
    | "isDaily"
    | "description"
    | "status"
    | "progressNote"
    | "conclusion"
    | "fileMemo"
    | "deletedAt"
  >
> & {
  parentTaskNumber?: string | null;
  updatedBy?: string | null;
};

export type VersionedTaskUpdateInput = UpdateTaskInput & {
  expectedVersion: number;
};

export type CreateFileInput = {
  taskId: string;
  projectId: string;
  originalName: string;
  mimeType?: string | null;
  sizeBytes: number;
  storageBucket: string;
  objectPath: string;
  fileGroupId?: string;
  version?: number;
  versionNumber?: number;
  uploadedBy?: string | null;
  storedName?: string;
  storedPath?: string;
};

export type UpdateProjectInput = Pick<ProjectRecord, "name"> & {
  updatedBy?: string | null;
};

export interface TaskRepository {
  listActiveTasks(projectId?: string): Promise<TaskRecord[]>;
  listTrashTasks(projectId?: string): Promise<TaskRecord[]>;
  findTaskById(taskId: string): Promise<TaskRecord | null>;
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<TaskRecord>;
  updateTaskWithVersion(taskId: string, input: VersionedTaskUpdateInput): Promise<TaskRecord | null>;
  moveTaskToTrash(taskId: string, updatedBy?: string | null): Promise<TaskRecord>;
  restoreTask(taskId: string, updatedBy?: string | null): Promise<TaskRecord>;
  getNextTaskNumber(projectId: string): Promise<number>;
}

export interface FileRepository {
  listActiveFiles(taskId?: string): Promise<FileRecord[]>;
  listTrashFiles(taskId?: string): Promise<FileRecord[]>;
  findFileById(fileId: string): Promise<FileRecord | null>;
  attachFile(input: CreateFileInput): Promise<FileRecord>;
  moveFileToTrash(fileId: string): Promise<FileRecord>;
  restoreFile(fileId: string): Promise<FileRecord>;
  moveFilesToTrashByTask(taskId: string): Promise<void>;
  restoreFilesByTask(taskId: string): Promise<void>;
}

export interface ProjectRepository {
  getProject(): Promise<ProjectRecord>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord>;
}
