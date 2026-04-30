export type { TaskStatus } from "./status";

import type { TaskStatus } from "./status";

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
  assigneeProfileId: string | null;
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
  purgedAt: string | null;
  fileSummary?: TaskFileSummary | null;
};

export type TaskFileSummary = {
  count: number;
  latestFileName: string | null;
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
  purgedAt: string | null;
};

export type DashboardMode = "board" | "daily" | "calendar" | "trash";
