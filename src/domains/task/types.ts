export type TaskStatus = "waiting" | "todo" | "in_progress" | "done" | "blocked";

export type TaskRecord = {
  id: string;
  projectId: string;
  taskNumber: number;
  parentTaskId: string | null;
  rootTaskId: string;
  depth: number;
  siblingOrder: number;
  dueDate: string;
  category: string;
  requester: string;
  assignee: string;
  title: string;
  createdAt: string;
  createdBy: string | null;
  isDaily: boolean;
  description: string;
  status: TaskStatus;
  progressNote: string;
  conclusion: string;
  fileMemo: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
  deletedAt: string | null;
};

export type FileRecord = {
  id: string;
  taskId: string;
  projectId: string;
  fileGroupId: string;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  storageBucket: string;
  objectPath: string;
  version: number;
  versionNumber: number;
  versionLabel: string;
  createdAt: string;
  updatedAt: string;
  uploadedBy: string | null;
  deletedAt: string | null;
  downloadUrl: string | null;
};

export type DashboardMode = "board" | "daily" | "calendar" | "trash";