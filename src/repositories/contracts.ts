import type {
  AiSettingsPreference,
  QuickCreateWidthMap,
  TaskListLayoutPreference,
  ThemeId,
  ThemePreference,
} from "@/domains/preferences/types";
import type { ProjectRecord } from "@/domains/project/types";
import type { FileMetadata } from "@/domains/file/analysis";
import type { FileAnalysisSearchResult } from "@/domains/file/search";
import type { FileRecord, TaskFileSummary, TaskRecord, TaskStatus } from "@/domains/task/types";

export type TaskOrderUpdateInput = {
  id: string;
  siblingOrder: number;
  expectedVersion?: number;
  updatedBy?: string | null;
};

export type SetTaskSiblingOrderInput = {
  projectId: string;
  parentTaskId: string | null;
  orderedTaskIds: readonly string[];
  siblingOrderStart?: number;
  updatedBy?: string | null;
};

export type SetTaskUserSiblingOrderInput = {
  projectId: string;
  profileId: string;
  parentTaskId: string | null;
  orderedTaskIds: readonly string[];
  siblingOrderStart?: number;
};

export type TaskUserOrderRecord = {
  projectId: string;
  profileId: string;
  taskId: string;
  parentTaskId: string | null;
  siblingOrder: number;
  updatedAt: string;
};

export type CreateTaskInput = {
  id?: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  workType: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requestedBy: string;
  relatedDisciplines: string;
  assignee: string;
  assigneeProfileId?: string | null;
  issueTitle: string;
  reviewedAt?: string;
  isDaily: boolean;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  decision: string;
  createdAt?: string;
  completedAt?: string | null;
  statusHistory?: string;
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
    | "issueId"
    | "dueDate"
    | "workType"
    | "coordinationScope"
    | "ownerDiscipline"
    | "requestedBy"
    | "relatedDisciplines"
    | "assignee"
    | "assigneeProfileId"
    | "issueTitle"
    | "reviewedAt"
    | "isDaily"
    | "locationRef"
    | "calendarLinked"
    | "issueDetailNote"
    | "status"
    | "statusHistory"
    | "decision"
    | "completedAt"
    | "deletedAt"
    | "purgedAt"
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

export type SearchFileAnalysesInput = {
  projectId: string;
  query: string;
  excludedFileIds?: string[];
  limit?: number;
  queryEmbedding?: number[];
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
  setTaskSiblingOrder?(input: SetTaskSiblingOrderInput): Promise<TaskRecord[]>;
  listTaskUserOrders?(projectId: string, profileId: string): Promise<TaskUserOrderRecord[]>;
  setTaskUserSiblingOrder?(input: SetTaskUserSiblingOrderInput): Promise<TaskUserOrderRecord[]>;
  updateTaskOrders(inputs: ReadonlyArray<TaskOrderUpdateInput>): Promise<TaskRecord[]>;
  syncProjectTaskIssueIds(projectId: string, projectName: string, updatedBy?: string | null): Promise<number>;
  moveTaskToTrash(taskId: string, updatedBy?: string | null): Promise<TaskRecord>;
  restoreTask(taskId: string, updatedBy?: string | null): Promise<TaskRecord>;
  deleteTask(taskId: string): Promise<void>;
  getNextTaskNumber(projectId: string): Promise<number>;
}

export interface FileRepository {
  listActiveFiles(taskId?: string): Promise<FileRecord[]>;
  listTrashFiles(taskId?: string): Promise<FileRecord[]>;
  listFilesByTask(taskId: string): Promise<FileRecord[]>;
  listFilesByProject(projectId: string): Promise<FileRecord[]>;
  listFileSummaryByProject?(projectId: string, scope?: "active" | "trash"): Promise<TaskFileSummaryMap>;
  searchFileAnalyses(input: SearchFileAnalysesInput): Promise<FileAnalysisSearchResult[]>;
  findFileById(fileId: string): Promise<FileRecord | null>;
  attachFile(input: CreateFileInput): Promise<FileRecord>;
  moveFileToTrash(fileId: string): Promise<FileRecord>;
  restoreFile(fileId: string): Promise<FileRecord>;
  deleteFile(fileId: string): Promise<void>;
  moveFilesToTrashByTask(taskId: string): Promise<void>;
  restoreFilesByTask(taskId: string): Promise<void>;
  updateFileMetadata(fileId: string, metadata: FileMetadata): Promise<FileRecord>;
}

export interface ProjectRepository {
  getProject(): Promise<ProjectRecord>;
  updateProject(input: UpdateProjectInput): Promise<ProjectRecord>;
}

export interface PreferenceRepository {
  getQuickCreateWidths(profileId: string): Promise<QuickCreateWidthMap>;
  saveQuickCreateWidths(profileId: string, widths: QuickCreateWidthMap): Promise<QuickCreateWidthMap>;
  getTaskListLayout(profileId: string): Promise<TaskListLayoutPreference>;
  saveTaskListLayout(profileId: string, layout: TaskListLayoutPreference): Promise<TaskListLayoutPreference>;
  getThemePreference(profileId: string): Promise<ThemePreference>;
  saveThemePreference(profileId: string, themeId: ThemeId): Promise<ThemePreference>;
  getAiSettingsPreference(profileId: string): Promise<AiSettingsPreference>;
  saveAiSettingsPreference(profileId: string, preference: AiSettingsPreference): Promise<AiSettingsPreference>;
}

export type TaskFileSummaryMap = Record<string, TaskFileSummary>;
