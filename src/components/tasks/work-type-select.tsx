import type { ComponentPropsWithoutRef } from "react";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { TaskCategoricalFieldSelect } from "@/components/tasks/task-categorical-fields";

type WorkTypeSelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  value: string | null | undefined;
  definitions?: readonly Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">[];
};

export function WorkTypeSelect({ definitions, value, ...props }: WorkTypeSelectProps) {
  return <TaskCategoricalFieldSelect {...props} fieldKey="workType" value={value} workTypeDefinitions={definitions} />;
}
