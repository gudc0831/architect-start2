import type { TaskRecord } from "@/domains/task/types";

export type TaskPendingPatchValues = Partial<TaskRecord>;
export type TaskPendingPatchValueMap = Record<string, TaskPendingPatchValues>;

export function mergePendingTaskPatchValues(
  current: TaskPendingPatchValues | null | undefined,
  payload: TaskPendingPatchValues,
) {
  return {
    ...(current ?? {}),
    ...payload,
  };
}

export function clearMatchingPendingTaskPatchValues(
  current: TaskPendingPatchValues | null | undefined,
  payload: TaskPendingPatchValues,
) {
  if (!current) {
    return null;
  }

  const next = { ...current };
  for (const key of Object.keys(payload) as Array<keyof TaskRecord>) {
    if (Object.is(next[key], payload[key])) {
      delete next[key];
    }
  }

  return Object.keys(next).length > 0 ? next : null;
}

export function applyPendingTaskPatchValues<T extends Pick<TaskRecord, "id">>(
  task: T,
  pendingValuesByTaskId: TaskPendingPatchValueMap,
) {
  const pendingValues = pendingValuesByTaskId[task.id];
  return pendingValues ? ({ ...task, ...pendingValues } as T & TaskPendingPatchValues) : task;
}
