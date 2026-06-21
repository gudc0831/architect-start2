import { badRequest } from "@/lib/api/errors";

export const TEXT_CELL_DOCUMENT_FIELDS = ["issueTitle", "issueDetailNote", "decision"] as const;
export const SCALAR_CELL_DOCUMENT_FIELDS = [
  "status",
  "dueDate",
  "workType",
  "coordinationScope",
  "requestedBy",
  "relatedDisciplines",
  "assignee",
  "assigneeProfileId",
  "locationRef",
  "calendarLinked",
] as const;

export const TASK_CELL_DOCUMENT_FIELDS = [...TEXT_CELL_DOCUMENT_FIELDS, ...SCALAR_CELL_DOCUMENT_FIELDS] as const;

export type TextCellDocumentFieldKey = (typeof TEXT_CELL_DOCUMENT_FIELDS)[number];
export type ScalarCellDocumentFieldKey = (typeof SCALAR_CELL_DOCUMENT_FIELDS)[number];
export type TaskCellDocumentFieldKey = (typeof TASK_CELL_DOCUMENT_FIELDS)[number];

export const MAX_CELL_UPDATE_BYTES = 64 * 1024;
export const MAX_CELL_SNAPSHOT_BYTES = 512 * 1024;

export const TASK_CELL_TEXT_FIELD_TO_COLUMN = {
  issueTitle: "title",
  issueDetailNote: "description",
  decision: "conclusion",
} as const satisfies Record<TextCellDocumentFieldKey, "title" | "description" | "conclusion">;

const TASK_CELL_DOCUMENT_FIELD_SET = new Set<string>(TASK_CELL_DOCUMENT_FIELDS);
const TEXT_CELL_DOCUMENT_FIELD_SET = new Set<string>(TEXT_CELL_DOCUMENT_FIELDS);
const SCALAR_CELL_DOCUMENT_FIELD_SET = new Set<string>(SCALAR_CELL_DOCUMENT_FIELDS);

export function isTaskCellDocumentFieldKey(fieldKey: string): fieldKey is TaskCellDocumentFieldKey {
  return TASK_CELL_DOCUMENT_FIELD_SET.has(fieldKey);
}

export function isTextCellDocumentField(fieldKey: string): fieldKey is TextCellDocumentFieldKey {
  return TEXT_CELL_DOCUMENT_FIELD_SET.has(fieldKey);
}

export function isScalarCellDocumentField(fieldKey: string): fieldKey is ScalarCellDocumentFieldKey {
  return SCALAR_CELL_DOCUMENT_FIELD_SET.has(fieldKey);
}

export function assertTaskCellDocumentFieldKey(fieldKey: string): TaskCellDocumentFieldKey {
  if (!isTaskCellDocumentFieldKey(fieldKey)) {
    throw badRequest("Unsupported task cell document field.", "TASK_CELL_DOCUMENT_FIELD_UNSUPPORTED");
  }

  return fieldKey;
}

export function buildTaskCellDocumentTopic(projectId: string, taskId: string, fieldKey: TaskCellDocumentFieldKey) {
  return `project:${projectId}:task:${taskId}:cell:${fieldKey}`;
}

export function getTaskCellDocumentType(fieldKey: TaskCellDocumentFieldKey) {
  return isTextCellDocumentField(fieldKey) ? "text" : "scalar";
}

export function readTaskProjectionText(task: { title: string; description: string; conclusion: string }, fieldKey: TextCellDocumentFieldKey) {
  switch (fieldKey) {
    case "issueTitle":
      return task.title;
    case "issueDetailNote":
      return task.description;
    case "decision":
      return task.conclusion;
  }
}
