export type TaskStatus = "waiting" | "todo" | "in_progress" | "done" | "blocked";

export type TaskRecord = {
  id: string;
  projectId: string;
  taskNumber: number;
  actionId: number;
  issueId: string;
  parentTaskId: string | null;
  rootTaskId: string;
  depth: number;
  siblingOrder: number;
  dueDate: string;
  workType: string;
  coordinationScope: string;
  ownerDiscipline: string;
  requestedBy: string;
  relatedDisciplines: string;
  assignee: string;
  issueTitle: string;
  reviewedAt: string;
  createdAt: string;
  createdBy: string | null;
  isDaily: boolean;
  locationRef: string;
  calendarLinked: boolean;
  issueDetailNote: string;
  status: TaskStatus;
  statusHistory: string;
  decision: string;
  completedAt: string | null;
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
