import {
  taskCategoryFieldKeys,
  type TaskCategoryDefinition,
  type TaskCategoryFieldKey,
} from "@/domains/admin/task-category-definitions";
import {
  getTaskCategoryOptions,
  getTaskCategoryValue,
  getTaskCategoryValues,
  labelForTaskCategoryValue,
  labelForTaskCategoryValues,
  matchesTaskCategoryFilter,
  normalizeTaskCategoryFilterSelection,
  serializeTaskCategoryValues,
  type TaskCategoryContext,
} from "@/lib/task-category-values";

export const taskCategoricalFilterFieldKeys = [...taskCategoryFieldKeys, "status"] as const;

export type TaskCategoricalFilterFieldKey = (typeof taskCategoricalFilterFieldKeys)[number];
export type TaskCategoricalFilterSelection = Partial<Record<TaskCategoricalFilterFieldKey, string[]>>;
export type TaskCategoricalFilterOption = {
  value: string;
  label: string;
};

type TaskCategoryDefinitionLike = Pick<TaskCategoryDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;

export type TaskCategoricalFilterContext = TaskCategoryContext & {
  workTypeDefinitions?: readonly TaskCategoryDefinitionLike[];
};

function toContext(context: TaskCategoricalFilterContext): TaskCategoryContext {
  if (context.categoryDefinitionsByField) {
    return context;
  }

  return {
    categoryDefinitionsByField: context.workTypeDefinitions
      ? {
          workType: context.workTypeDefinitions.map((definition) => ({
            fieldKey: "workType" as const,
            ...definition,
          })),
        }
      : undefined,
  };
}

function hasActiveDefinitions(fieldKey: TaskCategoryFieldKey, context: TaskCategoricalFilterContext) {
  const definitions = toContext(context).categoryDefinitionsByField?.[fieldKey] ?? [];
  return definitions.some((definition) => definition.isActive !== false);
}

function fallbackLegacyCategoryLabel(
  fieldKey: Exclude<TaskCategoricalFilterFieldKey, "status" | "workType">,
  value: unknown,
  context: TaskCategoricalFilterContext,
) {
  if (hasActiveDefinitions(fieldKey, context)) {
    return null;
  }

  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) {
    return null;
  }

  if (fieldKey === "relatedDisciplines") {
    return rawValue
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(", ");
  }

  return rawValue;
}

export function getTaskCategoricalFilterOptions(
  fieldKey: TaskCategoricalFilterFieldKey,
  context: TaskCategoricalFilterContext = {},
) {
  return getTaskCategoryOptions(fieldKey, toContext(context));
}

export function getTaskCategoricalFilterValue(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: unknown,
  context: TaskCategoricalFilterContext = {},
) {
  return getTaskCategoryValue(fieldKey, value, toContext(context));
}

export function getTaskCategoricalFilterValues(
  fieldKey: Exclude<TaskCategoricalFilterFieldKey, "status">,
  value: unknown,
  context: TaskCategoricalFilterContext = {},
) {
  return getTaskCategoryValues(fieldKey, value, toContext(context));
}

export function labelForTaskCategoricalFilterValue(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: unknown,
  context: TaskCategoricalFilterContext = {},
) {
  if (fieldKey === "coordinationScope" || fieldKey === "relatedDisciplines") {
    const fallbackLabel = fallbackLegacyCategoryLabel(fieldKey, value, context);
    if (fallbackLabel) {
      return fallbackLabel;
    }
  }

  if (fieldKey === "relatedDisciplines") {
    return labelForTaskCategoryValues(fieldKey, value, toContext(context));
  }

  return labelForTaskCategoryValue(fieldKey, value, toContext(context));
}

export function normalizeTaskCategoricalFilterSelection(
  fieldKey: TaskCategoricalFilterFieldKey,
  selectedValues: readonly string[] | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  return normalizeTaskCategoryFilterSelection(fieldKey, selectedValues, toContext(context));
}

export function matchesTaskCategoricalFilter(
  fieldKey: TaskCategoricalFilterFieldKey,
  value: unknown,
  selectedValues: readonly string[] | undefined,
  context: TaskCategoricalFilterContext = {},
) {
  return matchesTaskCategoryFilter(fieldKey, value, selectedValues, toContext(context));
}

export { serializeTaskCategoryValues };
