import type { ComponentPropsWithoutRef } from "react";
import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { getWorkTypeSelectOptions, getWorkTypeSelectValue } from "@/lib/ui-copy";

type WorkTypeSelectProps = Omit<ComponentPropsWithoutRef<"select">, "children" | "value"> & {
  value: string | null | undefined;
  definitions?: readonly Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">[];
};

export function WorkTypeSelect({ definitions, value, ...props }: WorkTypeSelectProps) {
  const options = getWorkTypeSelectOptions(value, definitions);
  const selectedValue = getWorkTypeSelectValue(value, definitions);

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
