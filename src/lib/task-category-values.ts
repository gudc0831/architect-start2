import type { TaskCategoryDefinition, TaskCategoryFieldKey } from "@/domains/admin/task-category-definitions";
import { DEFAULT_TASK_STATUS, normalizeTaskStatus, TASK_STATUS_ORDER } from "@/domains/task/status";
import type { TaskStatus } from "@/domains/task/types";
import { normalizeWorkTypeIdentifier } from "@/domains/task/work-types";
import { t } from "@/lib/ui-copy";
import { getWorkTypeSelectOptions, getWorkTypeSelectValue, labelForStatus, labelForWorkType } from "@/lib/ui-copy";

export const UNCLASSIFIED_TASK_CATEGORY_VALUE = "";

type TaskCategoryDefinitionLike = Pick<TaskCategoryDefinition, "fieldKey" | "code" | "labelKo" | "isActive" | "sortOrder">;

export type TaskCategoryContext = {
  categoryDefinitionsByField?: Partial<Record<TaskCategoryFieldKey, readonly TaskCategoryDefinitionLike[]>>;
};

const taskStatusOptions = TASK_STATUS_ORDER.map((status) => ({
  value: status,
  label: labelForStatus(status),
}));
const taskCategoryValueSeparators = /[\n,;|]+/;

function normalizeTaskCategoryCode(value: string) {
  const trimmed = value.trim();
  return normalizeWorkTypeIdentifier(trimmed) ?? trimmed;
}

function getDefinitionsForField(fieldKey: TaskCategoryFieldKey, context: TaskCategoryContext) {
  return [...(context.categoryDefinitionsByField?.[fieldKey] ?? [])]
    .filter((definition) => definition.fieldKey === fieldKey)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

function getActiveDefinitionsForField(fieldKey: TaskCategoryFieldKey, context: TaskCategoryContext) {
  return getDefinitionsForField(fieldKey, context).filter((definition) => definition.isActive !== false);
}

function normalizeStatusValue(value: string | null | undefined) {
  return normalizeTaskStatus(value, DEFAULT_TASK_STATUS);
}

export function parseStoredTaskCategoryValues(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry ?? "").split(taskCategoryValueSeparators))
      .map((entry) => normalizeTaskCategoryCode(entry))
      .filter(Boolean);
  }

  if (typeof value !== "string") {
    return [] as string[];
  }

  return value
    .split(taskCategoryValueSeparators)
    .map((entry) => normalizeTaskCategoryCode(entry))
    .filter(Boolean);
}

export function serializeTaskCategoryValues(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).join(",");
}

export function getTaskCategoryOptions(fieldKey: TaskCategoryFieldKey | "status", context: TaskCategoryContext = {}) {
  if (fieldKey === "status") {
    return taskStatusOptions;
  }

  if (fieldKey === "workType") {
    return getWorkTypeSelectOptions("", context.categoryDefinitionsByField?.workType as never);
  }

  const options = getActiveDefinitionsForField(fieldKey, context).map((definition) => ({
    value: definition.code,
    label: definition.labelKo,
  }));
  return [{ value: UNCLASSIFIED_TASK_CATEGORY_VALUE, label: t("empty.uncategorized") }, ...options];
}

export function getTaskCategoryValue(
  fieldKey: TaskCategoryFieldKey | "status",
  value: unknown,
  context: TaskCategoryContext = {},
) {
  if (fieldKey === "status") {
    return normalizeStatusValue(String(value ?? ""));
  }

  if (fieldKey === "workType") {
    return getWorkTypeSelectValue(typeof value === "string" ? value : "", context.categoryDefinitionsByField?.workType as never);
  }

  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return UNCLASSIFIED_TASK_CATEGORY_VALUE;
  }

  const normalizedValue = normalizeTaskCategoryCode(raw);
  return getActiveDefinitionsForField(fieldKey, context).some(
    (definition) => normalizeTaskCategoryCode(definition.code) === normalizedValue,
  )
    ? normalizedValue
    : UNCLASSIFIED_TASK_CATEGORY_VALUE;
}

export function getTaskCategoryValues(
  fieldKey: TaskCategoryFieldKey,
  value: unknown,
  context: TaskCategoryContext = {},
) {
  const rawValues = parseStoredTaskCategoryValues(value);
  if (rawValues.length === 0) {
    return [] as string[];
  }

  const allowed = new Set(
    getActiveDefinitionsForField(fieldKey, context).map((definition) => normalizeTaskCategoryCode(definition.code)),
  );
  return rawValues.filter((entry, index) => allowed.has(entry) && rawValues.indexOf(entry) === index);
}

export function labelForTaskCategoryValue(
  fieldKey: TaskCategoryFieldKey | "status",
  value: unknown,
  context: TaskCategoryContext = {},
) {
  if (fieldKey === "status") {
    return labelForStatus(normalizeStatusValue(String(value ?? "")) as TaskStatus);
  }

  if (fieldKey === "workType") {
    return labelForWorkType(typeof value === "string" ? value : "", context.categoryDefinitionsByField?.workType as never);
  }

  const normalizedValue = getTaskCategoryValue(fieldKey, value, context);
  if (!normalizedValue) {
    return t("empty.uncategorized");
  }

  return (
    getDefinitionsForField(fieldKey, context).find(
      (definition) => normalizeTaskCategoryCode(definition.code) === normalizedValue,
    )?.labelKo ??
    t("empty.uncategorized")
  );
}

export function labelForTaskCategoryValues(
  fieldKey: TaskCategoryFieldKey,
  value: unknown,
  context: TaskCategoryContext = {},
) {
  const values = getTaskCategoryValues(fieldKey, value, context);
  if (values.length === 0) {
    return t("empty.uncategorized");
  }

  const labelByCode = new Map(
    getDefinitionsForField(fieldKey, context).map((definition) => [
      normalizeTaskCategoryCode(definition.code),
      definition.labelKo,
    ]),
  );
  return values.map((entry) => labelByCode.get(entry) ?? entry).join(", ");
}

export function normalizeTaskCategoryFilterSelection(
  fieldKey: TaskCategoryFieldKey | "status",
  selectedValues: readonly string[] | undefined,
  context: TaskCategoryContext = {},
) {
  if (selectedValues === undefined) {
    return undefined;
  }

  const allowedValuesInOrder = getTaskCategoryOptions(fieldKey, context).map((option) => option.value);
  const allowedValues = new Set(allowedValuesInOrder);
  const normalized = new Set<string>();

  for (const value of selectedValues ?? []) {
    const rawValue = typeof value === "string" ? value.trim() : "";
    if (allowedValues.has(rawValue)) {
      normalized.add(rawValue);
    }
  }

  if (normalized.size === 0) {
    return [];
  }

  if (normalized.size === allowedValuesInOrder.length) {
    return undefined;
  }

  return allowedValuesInOrder.filter((value) => normalized.has(value));
}

export function matchesTaskCategoryFilter(
  fieldKey: TaskCategoryFieldKey | "status",
  value: unknown,
  selectedValues: readonly string[] | undefined,
  context: TaskCategoryContext = {},
) {
  const normalizedFilters = normalizeTaskCategoryFilterSelection(fieldKey, selectedValues, context);
  if (normalizedFilters === undefined) {
    return true;
  }

  if (normalizedFilters.length === 0) {
    return false;
  }

  if (fieldKey === "relatedDisciplines" || fieldKey === "locationRef") {
    const bucketValues = getTaskCategoryValues(fieldKey, value, context);
    if (bucketValues.length === 0) {
      return normalizedFilters.includes(UNCLASSIFIED_TASK_CATEGORY_VALUE);
    }

    return normalizedFilters.some((filterValue) => bucketValues.includes(filterValue));
  }

  return normalizedFilters.includes(getTaskCategoryValue(fieldKey, value, context));
}
