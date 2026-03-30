import type { TaskRecord } from "@/domains/task/types";
import { normalizeWorkTypeIdentifier } from "@/domains/task/work-types";
import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { badRequest } from "@/lib/api/errors";

type TaskCategoryDefinitionLike = Pick<
  TaskCategoryDefinition,
  "code" | "isActive" | "sortOrder" | "createdAt" | "updatedAt" | "id"
>;

export type TaskCategoryFilterSelection = Partial<Record<TaskCategoryFieldKey, string[]>>;

export const UNCLASSIFIED_TASK_CATEGORY_VALUE = "";

const multiValueFieldKeys = new Set<TaskCategoryFieldKey>(["relatedDisciplines"]);
const multiValueSeparators = /[\n,;|]+/;

function compareDefinitionOrder(left: TaskCategoryDefinitionLike, right: TaskCategoryDefinitionLike) {
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

function toActiveDefinitionMap(definitions?: readonly TaskCategoryDefinitionLike[]) {
  const definitionsByCode = new Map<string, TaskCategoryDefinitionLike>();

  for (const definition of definitions ?? []) {
    if (definition.isActive === false) {
      continue;
    }

    const normalizedCode = normalizeWorkTypeIdentifier(definition.code);
    if (!normalizedCode) {
      continue;
    }

    const current = definitionsByCode.get(normalizedCode);
    if (!current || compareDefinitionOrder(definition, current) < 0) {
      definitionsByCode.set(normalizedCode, definition);
    }
  }

  return definitionsByCode;
}

function trimToString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isMultiValueTaskCategoryField(fieldKey: TaskCategoryFieldKey) {
  return multiValueFieldKeys.has(fieldKey);
}

function invalidFieldErrorCode(fieldKey: TaskCategoryFieldKey) {
  switch (fieldKey) {
    case "workType":
      return "TASK_WORK_TYPE_INVALID";
    case "coordinationScope":
      return "TASK_COORDINATION_SCOPE_INVALID";
    case "relatedDisciplines":
      return "TASK_RELATED_DISCIPLINES_INVALID";
  }
}

function parseCategoryCodes(value: string) {
  return value
    .split(multiValueSeparators)
    .map((token) => normalizeWorkTypeIdentifier(token))
    .filter((token): token is string => Boolean(token));
}

function sortCodesCanonically(codes: readonly string[], definitions?: readonly TaskCategoryDefinitionLike[]) {
  const definitionMap = toActiveDefinitionMap(definitions);
  const indexByCode = new Map(
    [...definitionMap.values()]
      .sort(compareDefinitionOrder)
      .map((definition, index) => [normalizeWorkTypeIdentifier(definition.code) ?? definition.code, index] as const),
  );

  return [...codes].sort((left, right) => {
    const leftIndex = indexByCode.get(left);
    const rightIndex = indexByCode.get(right);

    if (leftIndex !== undefined || rightIndex !== undefined) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER);
    }

    return left.localeCompare(right);
  });
}

export function normalizeTaskCategoryFieldValue(
  fieldKey: TaskCategoryFieldKey,
  value: unknown,
  definitions?: readonly TaskCategoryDefinitionLike[],
  options?: {
    allowLegacyTextWhenDefinitionsMissing?: boolean;
  },
) {
  const rawValue = trimToString(value);
  if (!rawValue) {
    return UNCLASSIFIED_TASK_CATEGORY_VALUE;
  }

  const activeDefinitionMap = toActiveDefinitionMap(definitions);
  if (activeDefinitionMap.size === 0 && options?.allowLegacyTextWhenDefinitionsMissing) {
    return rawValue;
  }

  if (!isMultiValueTaskCategoryField(fieldKey)) {
    const normalizedCode = normalizeWorkTypeIdentifier(rawValue);
    if (normalizedCode && activeDefinitionMap.has(normalizedCode)) {
      return normalizedCode;
    }

    throw badRequest(`${fieldKey} is invalid`, invalidFieldErrorCode(fieldKey));
  }

  const normalizedCodes = parseCategoryCodes(rawValue);
  if (normalizedCodes.length === 0) {
    throw badRequest(`${fieldKey} is invalid`, invalidFieldErrorCode(fieldKey));
  }

  const uniqueCodes = [...new Set(normalizedCodes)];
  if (uniqueCodes.some((code) => !activeDefinitionMap.has(code))) {
    throw badRequest(`${fieldKey} is invalid`, invalidFieldErrorCode(fieldKey));
  }

  return sortCodesCanonically(uniqueCodes, definitions).join(",");
}

export function resolvePatchedTaskCategoryFieldValue(
  fieldKey: TaskCategoryFieldKey,
  value: unknown,
  definitions?: readonly TaskCategoryDefinitionLike[],
  options?: {
    allowLegacyTextWhenDefinitionsMissing?: boolean;
  },
) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeTaskCategoryFieldValue(fieldKey, value, definitions, options);
}

function resolveTaskCategoryFilterBuckets(
  fieldKey: TaskCategoryFieldKey,
  value: string | null | undefined,
  definitions?: readonly TaskCategoryDefinitionLike[],
) {
  const rawValue = trimToString(value);
  if (!rawValue) {
    return [UNCLASSIFIED_TASK_CATEGORY_VALUE];
  }

  const activeDefinitionMap = toActiveDefinitionMap(definitions);
  if (activeDefinitionMap.size === 0) {
    return [UNCLASSIFIED_TASK_CATEGORY_VALUE];
  }

  if (!isMultiValueTaskCategoryField(fieldKey)) {
    const normalizedCode = normalizeWorkTypeIdentifier(rawValue);
    return normalizedCode && activeDefinitionMap.has(normalizedCode)
      ? [normalizedCode]
      : [UNCLASSIFIED_TASK_CATEGORY_VALUE];
  }

  const matchedCodes = [...new Set(parseCategoryCodes(rawValue))].filter((code) => activeDefinitionMap.has(code));
  if (matchedCodes.length === 0) {
    return [UNCLASSIFIED_TASK_CATEGORY_VALUE];
  }

  return sortCodesCanonically(matchedCodes, definitions);
}

export function normalizeTaskCategoryFilterSelection(
  fieldKey: TaskCategoryFieldKey,
  selectedValues: readonly string[] | undefined,
  definitions?: readonly TaskCategoryDefinitionLike[],
) {
  const allowedValues = new Set<string>([
    UNCLASSIFIED_TASK_CATEGORY_VALUE,
    ...[...toActiveDefinitionMap(definitions).keys()].sort(),
  ]);
  const normalized = new Set<string>();

  for (const value of selectedValues ?? []) {
    const rawValue = trimToString(value);
    const normalizedCode = rawValue ? normalizeWorkTypeIdentifier(rawValue) : UNCLASSIFIED_TASK_CATEGORY_VALUE;
    const normalizedValue = normalizedCode ?? rawValue;
    if (allowedValues.has(normalizedValue)) {
      normalized.add(normalizedValue);
    }
  }

  return normalized.size === 0 || normalized.size === allowedValues.size ? [] : [...normalized];
}

export function matchesTaskCategoryFilter(
  fieldKey: TaskCategoryFieldKey,
  value: string | null | undefined,
  selectedValues: readonly string[] | undefined,
  definitions?: readonly TaskCategoryDefinitionLike[],
) {
  const normalizedFilters = normalizeTaskCategoryFilterSelection(fieldKey, selectedValues, definitions);
  if (normalizedFilters.length === 0) {
    return true;
  }

  return resolveTaskCategoryFilterBuckets(fieldKey, value, definitions).some((bucket) => normalizedFilters.includes(bucket));
}

export function valueForTaskCategoryField(task: Pick<TaskRecord, "workType" | "coordinationScope" | "relatedDisciplines">, fieldKey: TaskCategoryFieldKey) {
  switch (fieldKey) {
    case "workType":
      return task.workType;
    case "coordinationScope":
      return task.coordinationScope;
    case "relatedDisciplines":
      return task.relatedDisciplines;
  }
}
