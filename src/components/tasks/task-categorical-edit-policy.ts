import {
  getTaskCategoricalFieldOptions,
  type TaskCategoricalFieldKey,
} from "@/components/tasks/task-categorical-fields";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import type { WorkTypeDefinition } from "@/domains/task/work-types";

type TaskCategoricalEditorContext = {
  workTypeDefinitions?: readonly WorkTypeDefinition[];
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinition[]>>;
};

export function shouldUseLegacyTaskCategoricalTextInput(
  fieldKey: TaskCategoricalFieldKey,
  context: TaskCategoricalEditorContext,
) {
  if (
    fieldKey !== "coordinationScope" &&
    fieldKey !== "requestedBy" &&
    fieldKey !== "relatedDisciplines" &&
    fieldKey !== "locationRef"
  ) {
    return false;
  }

  return !getTaskCategoricalFieldOptions(fieldKey, context).some((option) => option.value);
}
