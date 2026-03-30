import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { TaskStatus } from "@/domains/task/types";
import { getWorkTypeSelectOptions, getWorkTypeSelectValue, labelForStatus, labelForWorkType } from "@/lib/ui-copy";

export type TaskCategoricalFilterFieldKey = "status" | "workType";
export type TaskCategoricalFilterOption = {
  value: string;
  label: string;
};

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;

export type TaskCategoricalFilterContext = {
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[];
};

const taskStatusOrder = ["waiting", "todo", "in_progress", "blocked", "done"] as const satisfies readonly TaskStatus[];
const taskStatusOptions = taskStatusOrder.map<TaskCategoricalFilterOption>((status) => ({
  value: status,
  label: labelForStatus(status),
}));

function normalizeTaskStatusValue(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return taskStatusOrder.includes(raw as TaskStatus) ? raw : "waiting";
}

export function getTaskCategoricalFilterOptions(
  fieldKey: TaskCategoricalFilterFieldKey,
  context: TaskCategoricalFilterContext = {},
) {
  if (fieldKey === "status") {
    return taskStatusOptions;
  }

  return getWorkTypeSelectOptions("", context.workTypeDefinitions);
}

export function getTaskCategoricalFilterValue(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  if (fieldKey === "status") {
    return normalizeTaskStatusValue(value);
  }

  return getWorkTypeSelectValue(value, context.workTypeDefinitions);
}

export function labelForTaskCategoricalFilterValue(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  if (fieldKey === "status") {
    return labelForStatus(normalizeTaskStatusValue(value) as TaskStatus);
  }

  return labelForWorkType(value, context.workTypeDefinitions);
}

export function normalizeTaskCategoricalFilterSelection(
  fieldKey: TaskCategoricalFilterFieldKey,
  selectedValues: readonly string[] | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  const allowedValues = new Set(getTaskCategoricalFilterOptions(fieldKey, context).map((option) => option.value));
  const normalized = new Set<string>();

  for (const value of selectedValues ?? []) {
    const rawValue = typeof value === "string" ? value.trim() : "";
    if (allowedValues.has(rawValue)) {
      normalized.add(rawValue);
    }
  }

  return normalized.size === 0 || normalized.size === allowedValues.size ? [] : [...normalized];
}

export function matchesTaskCategoricalFilter(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: string | null | undefined,
  selectedValues: readonly string[] | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  const normalizedFilters = normalizeTaskCategoricalFilterSelection(fieldKey, selectedValues, context);
  if (normalizedFilters.length === 0) {
    return true;
  }

  const bucket = getTaskCategoricalFilterValue(fieldKey, value, context);
  return normalizedFilters.includes(bucket);
}
