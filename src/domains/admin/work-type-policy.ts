import type { WorkTypeDefinition } from "@/domains/task/work-types";
import { conflict } from "@/lib/api/errors";
import { requireStoredWorkTypeCode } from "@/lib/task-work-type-write";

function comparePreferredDefinition(
  left: WorkTypeDefinition,
  right: WorkTypeDefinition,
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

export function requireAdminStoredWorkTypeCode(value: unknown, fieldName = "code") {
  return requireStoredWorkTypeCode(value, fieldName);
}

export function assertCreatableWorkTypeCode(
  definitions: readonly WorkTypeDefinition[],
  projectId: string | null,
  rawCode: unknown,
) {
  const code = requireAdminStoredWorkTypeCode(rawCode, "code");
  const hasConflict = definitions.some((definition) => {
    if (definition.code !== code) {
      return false;
    }

    if (projectId === null) {
      return true;
    }

    return definition.projectId === null || definition.projectId === projectId;
  });

  if (hasConflict) {
    throw conflict("Work type code already exists in this effective scope", "WORK_TYPE_CODE_CONFLICT");
  }

  return code;
}

export function resolveEffectiveWorkTypeDefinitions(
  definitions: readonly WorkTypeDefinition[],
  projectId: string | null,
) {
  const relevantDefinitions = definitions.filter(
    (definition) => definition.projectId === null || definition.projectId === projectId,
  );
  const byCode = new Map<string, WorkTypeDefinition[]>();

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
