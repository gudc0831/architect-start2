import type { ComponentPropsWithoutRef } from "react";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import type { TaskStatus } from "@/domains/task/types";
import { getWorkTypeSelectOptions, getWorkTypeSelectValue, labelForStatus, labelForWorkType } from "@/lib/ui-copy";

export type TaskCategoricalFieldKey = "status" | "workType";
export type TaskCategoricalFieldOption = {
  value: string;
  label: string;
};

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;
type TaskCategoricalFieldContext = {
  workTypeDefinitions?: readonly WorkTypeDefinitionLike[];
};

const taskStatusOrder = ["waiting", "todo", "in_progress", "blocked", "done"] as const satisfies readonly TaskStatus[];
const taskStatusOptions = taskStatusOrder.map<TaskCategoricalFieldOption>((status) => ({
  value: status,
  label: labelForStatus(status),
}));

function normalizeTaskStatusValue(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  return taskStatusOrder.includes(raw as TaskStatus) ? raw : "waiting";
}

export function getTaskCategoricalFieldOptions(
  fieldKey: TaskCategoricalFieldKey,
  context: TaskCategoricalFieldContext = {},
  value?: string | null,
) {
  if (fieldKey === "status") {
    return taskStatusOptions;
  }

  return getWorkTypeSelectOptions(value, context.workTypeDefinitions);
}

export function getTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFieldContext = {},
) {
  if (fieldKey === "status") {
    return normalizeTaskStatusValue(value);
  }

  return getWorkTypeSelectValue(value, context.workTypeDefinitions);
}

export function labelForTaskCategoricalFieldValue(
  fieldKey: TaskCategoricalFieldKey,
  value: string | null | undefined,
  context: TaskCategoricalFieldContext = {},
) {
  if (fieldKey === "status") {
    return labelForStatus(normalizeTaskStatusValue(value) as TaskStatus);
  }

  return labelForWorkType(value, context.workTypeDefinitions);
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
