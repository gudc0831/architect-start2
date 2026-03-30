import type { WorkTypeDefinition } from "@/domains/task/work-types";
import {
  getTaskCategoricalFilterOptions,
  getTaskCategoricalFilterValue,
  matchesTaskCategoricalFilter,
  normalizeTaskCategoricalFilterSelection,
  type TaskCategoricalFilterOption,
} from "@/lib/task-categorical-filter";

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;

export type TaskWorkTypeFilterOption = TaskCategoricalFilterOption;

export function getTaskWorkTypeFilterOptions(workTypeDefinitions?: readonly WorkTypeDefinitionLike[]): TaskWorkTypeFilterOption[] {
  return getTaskCategoricalFilterOptions("workType", { workTypeDefinitions });
}

export function resolveTaskWorkTypeFilterBucket(
  value: string | null | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  return getTaskCategoricalFilterValue("workType", value, { workTypeDefinitions });
}

export function normalizeTaskWorkTypeFilters(
  selectedWorkTypeFilters: readonly string[] | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  return normalizeTaskCategoricalFilterSelection("workType", selectedWorkTypeFilters, { workTypeDefinitions });
}

export function matchesTaskWorkTypeFilter(
  taskWorkType: string | null | undefined,
  selectedWorkTypeFilters: readonly string[] | undefined,
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[],
) {
  return matchesTaskCategoricalFilter("workType", taskWorkType, selectedWorkTypeFilters, { workTypeDefinitions });
}
