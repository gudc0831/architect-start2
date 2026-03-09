export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";

export type TaskRecord = {
  id: string;
  taskNumber: string;
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
  deletedAt: string | null;
};

export type FileRecord = {
  id: string;
  taskId: string;
  originalName: string;
  storedName: string;
  storedPath: string;
  createdAt: string;
  deletedAt: string | null;
};

export type DashboardMode = "board" | "daily" | "calendar" | "trash";
