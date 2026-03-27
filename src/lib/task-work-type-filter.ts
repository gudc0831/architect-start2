import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { getWorkTypeOptions, getWorkTypeSelectValue, labelForWorkType } from "@/lib/ui-copy";
import { UNCLASSIFIED_WORK_TYPE_VALUE } from "@/lib/task-work-type-write";

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;

export type TaskWorkTypeFilterOption = {
  value: string;
  label: string;
};

export function getTaskWorkTypeFilterOptions(workTypeDefinitions?: readonly WorkTypeDefinitionLike[]): TaskWorkTypeFilterOption[] {
  return [
    { value: UNCLASSIFIED_WORK_TYPE_VALUE, label: labelForWorkType(UNCLASSIFIED_WORK_TYPE_VALUE, workTypeDefinitions) },
    ...getWorkTypeOptions(workTypeDefinitions),
  ];
}

export function resolveTaskWorkTypeFilterBucket(
  value: string | null | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return UNCLASSIFIED_WORK_TYPE_VALUE;
  }

  return getWorkTypeSelectValue(rawValue, workTypeDefinitions);
}

export function normalizeTaskWorkTypeFilters(
  selectedWorkTypeFilters: readonly string[] | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  const allowedValues = new Set(getTaskWorkTypeFilterOptions(workTypeDefinitions).map((option) => option.value));
  const normalized = new Set<string>();

  for (const value of selectedWorkTypeFilters ?? []) {
    const rawValue = typeof value === "string" ? value.trim() : "";
    if (allowedValues.has(rawValue)) {
      normalized.add(rawValue);
    }
  }

  return normalized.size === 0 || normalized.size === allowedValues.size ? [] : [...normalized];
}

export function matchesTaskWorkTypeFilter(
  taskWorkType: string | null | undefined,
  selectedWorkTypeFilters: readonly string[] | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  const normalizedFilters = normalizeTaskWorkTypeFilters(selectedWorkTypeFilters, workTypeDefinitions);
  if (normalizedFilters.length === 0) {
    return true;
  }

  const taskBucket = resolveTaskWorkTypeFilterBucket(taskWorkType, workTypeDefinitions);
  return normalizedFilters.includes(taskBucket);
}
