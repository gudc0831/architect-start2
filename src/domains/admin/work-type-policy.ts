import type { WorkTypeDefinition } from "@/domains/task/work-types";
import {
  assertCreatableTaskCategoryCode,
  requireStoredTaskCategoryCode,
  resolveEffectiveTaskCategoryDefinitions,
} from "@/domains/admin/task-category-definitions";

export function requireAdminStoredWorkTypeCode(value: unknown, fieldName = "code") {
  return requireStoredTaskCategoryCode(value, fieldName);
}

export function assertCreatableWorkTypeCode(
  definitions: readonly WorkTypeDefinition[],
  projectId: string | null,
  rawCode: unknown,
) {
  return assertCreatableTaskCategoryCode(definitions, "workType", projectId, rawCode);
}

export function resolveEffectiveWorkTypeDefinitions(
  definitions: readonly WorkTypeDefinition[],
  projectId: string | null,
) {
  return resolveEffectiveTaskCategoryDefinitions(definitions, "workType", projectId);
}
