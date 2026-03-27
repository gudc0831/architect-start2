import { normalizeLegacyWorkType, workTypeCodeOrder, type WorkTypeCode, type WorkTypeDefinition } from "@/domains/task/work-types";
import { UNCLASSIFIED_WORK_TYPE_VALUE } from "@/lib/task-work-type-write";

const workTypeLabelMap: Record<WorkTypeCode, string> = {
  coordination: "\uD611\uC758",
  review: "\uAC80\uD1A0",
  request: "\uC694\uCCAD",
  reply: "\uD68C\uC2E0",
  record: "\uAE30\uB85D",
  confirmation: "\uD655\uC778",
  revision: "\uC218\uC815",
};

type WorkTypeDefinitionLike = Pick<WorkTypeDefinition, "code" | "labelKo" | "isActive" | "sortOrder">;
const UNCLASSIFIED_WORK_TYPE_LABEL = "\uBBF8\uBD84\uB958";

function resolveAllWorkTypeDefinitions(definitions?: readonly WorkTypeDefinitionLike[]) {
  if ((definitions ?? []).length > 0) {
    return [...(definitions ?? [])].sort((left, right) => left.sortOrder - right.sortOrder);
  }

  return workTypeCodeOrder.map((code, index) => ({
    code,
    labelKo: workTypeLabelMap[code],
    isActive: true,
    sortOrder: index,
  }));
}

function resolveSelectableWorkTypeDefinitions(definitions?: readonly WorkTypeDefinitionLike[]) {
  return resolveAllWorkTypeDefinitions(definitions).filter((definition) => definition.isActive !== false);
}

function resolveWorkTypeLabel(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }

  const selectableDefinitions = resolveSelectableWorkTypeDefinitions(definitions);
  const resolvedDefinitions = resolveAllWorkTypeDefinitions(definitions);
  const directMatch = resolvedDefinitions.find((definition) => definition.code === raw);
  if (directMatch?.labelKo && directMatch.isActive !== false) {
    return directMatch.labelKo;
  }

  const normalized = normalizeLegacyWorkType(value);
  if (!normalized) {
    return null;
  }

  const matchedDefinition = selectableDefinitions.find((definition) => definition.code === normalized);
  if (matchedDefinition?.labelKo) {
    return matchedDefinition.labelKo;
  }

  if (definitions && definitions.length > 0) {
    return null;
  }

  return workTypeLabelMap[normalized] ?? null;
}

export function labelForWorkType(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  return resolveWorkTypeLabel(value, definitions) ?? UNCLASSIFIED_WORK_TYPE_LABEL;
}

export function getWorkTypeOptions(definitions?: readonly WorkTypeDefinitionLike[]) {
  return resolveSelectableWorkTypeDefinitions(definitions).map((definition) => ({
    value: definition.code,
    label: definition.labelKo,
  }));
}

export function getWorkTypeSelectOptions(_value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  const options = getWorkTypeOptions(definitions);
  return [{ value: UNCLASSIFIED_WORK_TYPE_VALUE, label: UNCLASSIFIED_WORK_TYPE_LABEL }, ...options];
}

export function getWorkTypeSelectValue(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return UNCLASSIFIED_WORK_TYPE_VALUE;
  }

  if (resolveSelectableWorkTypeDefinitions(definitions).some((definition) => definition.code === raw)) {
    return raw;
  }

  const normalized = normalizeLegacyWorkType(raw);
  if (normalized && resolveSelectableWorkTypeDefinitions(definitions).some((definition) => definition.code === normalized)) {
    return normalized;
  }

  return UNCLASSIFIED_WORK_TYPE_VALUE;
}
