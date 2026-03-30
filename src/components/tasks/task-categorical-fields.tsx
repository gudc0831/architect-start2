import type { ComponentPropsWithoutRef } from "react";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import {
  getTaskCategoricalFilterOptions as getTaskCategoricalFieldOptionsInternal,
  getTaskCategoricalFilterValue as getTaskCategoricalFieldValueInternal,
  labelForTaskCategoricalFilterValue as labelForTaskCategoricalFieldValueInternal,
  type TaskCategoricalFilterContext,
  type TaskCategoricalFilterFieldKey,
  type TaskCategoricalFilterOption,
} from "@/lib/task-categorical-filter";

export type TaskCategoricalFieldKey = TaskCategoricalFilterFieldKey;
export type TaskCategoricalFieldOption = TaskCategoricalFilterOption;

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;
type TaskCategoricalFieldContext = TaskCategoricalFilterContext & {
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[];
};

export function getTaskCategoricalFieldOptions(
  fieldKey: TaskCategoricalFieldKey,
  context: TaskCategoricalFieldContext = {},
  value?: string | null,
) {
  void value;
  return getTaskCategoricalFieldOptionsInternal(fieldKey, context);
}

export function getTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFieldContext = {},
) {
  return getTaskCategoricalFieldValueInternal(fieldKey, value, context);
}

export function labelForTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFieldContext = {},
) {
  return labelForTaskCategoricalFieldValueInternal(fieldKey, value, context);
}

type TaskCategoricalFieldSelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  fieldKey: TaskCategoricalFieldKey;
  value: string | null | undefined;
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[];
};

export function TaskCategoricalFieldSelect({
  fieldKey,
  value,
  workTypeDefinitions,
  ...props
}: TaskCategoricalFieldSelectProps) {
  const context = { workTypeDefinitions };
  const options = getTaskCategoricalFieldOptions(fieldKey, context, value);
  const selectedValue = getTaskCategoricalFieldValue(fieldKey, value, context);

  return (
    <select {...props} value={selectedValue}>
      {options.map((option) => (
        <option key={option.value || "__empty__"} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
