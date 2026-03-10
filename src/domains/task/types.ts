export type TaskStatus = "waiting" | "todo" | "in_progress" | "done" | "blocked";

export type TaskRecord = {
  id: string;
  taskNumber: string;
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
  isDaily: boolean;
  description: string;
  status: TaskStatus;
  progressNote: string;
  conclusion: string;
  fileMemo: string;
  deletedAt: string | null;
};

export type FileRecord = {
  id: string;
  taskId: string;
  fileGroupId: string;
  originalName: string;
  storedName: string;
  storedPath: string;
  versionNumber: number;
  versionLabel: string;
  createdAt: string;
  deletedAt: string | null;
};

export type DashboardMode = "board" | "daily" | "calendar" | "trash";