import { badRequest, conflict } from "@/lib/api/errors";
import { normalizeWorkTypeIdentifier } from "@/domains/task/work-types";

export const taskCategoryFieldKeys = ["workType", "coordinationScope", "requestedBy", "relatedDisciplines", "locationRef"] as const;

export type TaskCategoryFieldKey = (typeof taskCategoryFieldKeys)[number];

export type TaskCategoryDefinition = {
  id: string;
  fieldKey: TaskCategoryFieldKey;
  projectId: string | null;
  code: string;
  labelKo: string;
  labelEn: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
};

function comparePreferredDefinition(
  left: TaskCategoryDefinition,
  right: TaskCategoryDefinition,
  currentProjectId: string | null,
) {
  const leftIsProjectScoped = left.projectId === currentProjectId ? 1 : 0;
  const rightIsProjectScoped = right.projectId === currentProjectId ? 1 : 0;
  if (leftIsProjectScoped !== rightIsProjectScoped) {
    return rightIsProjectScoped - leftIsProjectScoped;
  }

  const leftIsActive = left.isActive ? 1 : 0;
  const rightIsActive = right.isActive ? 1 : 0;
  if (leftIsActive !== rightIsActive) {
    return rightIsActive - leftIsActive;
  }

  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  if (left.updatedAt !== right.updatedAt) {
    return right.updatedAt.localeCompare(left.updatedAt);
  }

  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt);
  }

  return left.id.localeCompare(right.id);
}

export function isTaskCategoryFieldKey(value: unknown): value is TaskCategoryFieldKey {
  return taskCategoryFieldKeys.includes(value as TaskCategoryFieldKey);
}

export function requireTaskCategoryFieldKey(value: unknown, fieldName = "fieldKey") {
  if (!isTaskCategoryFieldKey(value)) {
    throw badRequest(`${fieldName} is invalid`, "TASK_CATEGORY_FIELD_INVALID");
  }

  return value;
}

export function requireStoredTaskCategoryCode(value: unknown, fieldName = "code") {
  const normalized = normalizeWorkTypeIdentifier(typeof value === "string" ? value.trim() : "");
  if (!normalized) {
    throw badRequest(`${fieldName} is invalid`, "TASK_CATEGORY_CODE_INVALID");
  }

  return normalized;
}

export function assertCreatableTaskCategoryCode(
  definitions: readonly TaskCategoryDefinition[],
  fieldKey: TaskCategoryFieldKey,
  projectId: string | null,
  rawCode: unknown,
) {
  const code = requireStoredTaskCategoryCode(rawCode, "code");
  const hasConflict = definitions.some((definition) => {
    if (definition.fieldKey !== fieldKey || definition.code !== code) {
      return false;
    }

    if (projectId === null) {
      return definition.projectId === null;
    }

    return definition.projectId === projectId;
  });

  if (hasConflict) {
    throw conflict("Category code already exists in this effective scope", "TASK_CATEGORY_CODE_CONFLICT");
  }

  return code;
}

export function resolveEffectiveTaskCategoryDefinitions(
  definitions: readonly TaskCategoryDefinition[],
  fieldKey: TaskCategoryFieldKey,
  projectId: string | null,
) {
  const relevantDefinitions = definitions.filter(
    (definition) =>
      definition.fieldKey === fieldKey && (definition.projectId === null || definition.projectId === projectId),
  );
  const byCode = new Map<string, TaskCategoryDefinition[]>();

  for (const definition of relevantDefinitions) {
    const existing = byCode.get(definition.code);
    if (existing) {
      existing.push(definition);
      continue;
    }

    byCode.set(definition.code, [definition]);
  }

  const displayDefinitions = [...byCode.values()]
    .map((candidates) => [...candidates].sort((left, right) => comparePreferredDefinition(left, right, projectId))[0])
    .sort((left, right) => comparePreferredDefinition(left, right, projectId));

  return {
    displayDefinitions,
    selectableDefinitions: displayDefinitions.filter((definition) => definition.isActive),
  };
}
