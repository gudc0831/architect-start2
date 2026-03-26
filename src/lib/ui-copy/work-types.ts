import { normalizeLegacyWorkType, workTypeCodeOrder, type WorkTypeCode, type WorkTypeDefinition } from "@/domains/task/work-types";

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

  const resolvedDefinitions = resolveAllWorkTypeDefinitions(definitions);
  const directMatch = resolvedDefinitions.find((definition) => definition.code === raw);
  if (directMatch?.labelKo) {
    return directMatch.labelKo;
  }

  const normalized = normalizeLegacyWorkType(value);
  if (!normalized) {
    return null;
  }

  const matchedDefinition = resolvedDefinitions.find((definition) => definition.code === normalized);
  if (matchedDefinition?.labelKo) {
    return matchedDefinition.labelKo;
  }

  return workTypeLabelMap[normalized] ?? null;
}

export function labelForWorkType(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  return resolveWorkTypeLabel(value, definitions) ?? "\uBBF8\uBD84\uB958";
}

export function getWorkTypeOptions(definitions?: readonly WorkTypeDefinitionLike[]) {
  return resolveSelectableWorkTypeDefinitions(definitions).map((definition) => ({
    value: definition.code,
    label: definition.labelKo,
  }));
}

export function getWorkTypeSelectOptions(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  const raw = String(value ?? "").trim();
  const allDefinitions = resolveAllWorkTypeDefinitions(definitions);
  const options = getWorkTypeOptions(definitions);
  const directDefinition = allDefinitions.find((definition) => definition.code === raw);
  const hasDirectDefinition = Boolean(directDefinition);
  const normalized = hasDirectDefinition ? raw : normalizeLegacyWorkType(raw);

  if (!raw) {
    return [{ value: "", label: "\uBBF8\uBD84\uB958" }, ...options];
  }

  if (directDefinition && directDefinition.isActive === false) {
    return [{ value: directDefinition.code, label: `${directDefinition.labelKo} (\uBE44\uD65C\uC131)` }, ...options];
  }

  if (!normalized) {
    return [{ value: raw, label: "\uBBF8\uBD84\uB958" }, ...options];
  }

  if (!options.some((option) => option.value === normalized)) {
    const normalizedDefinition = allDefinitions.find((definition) => definition.code === normalized);
    if (normalizedDefinition) {
      return [{ value: normalizedDefinition.code, label: normalizedDefinition.labelKo }, ...options];
    }
  }

  return options;
}

export function getWorkTypeSelectValue(value: string | null | undefined, definitions?: readonly WorkTypeDefinitionLike[]) {
  const raw = String(value ?? "").trim();
  if (resolveAllWorkTypeDefinitions(definitions).some((definition) => definition.code === raw)) {
    return raw;
  }

  return normalizeLegacyWorkType(raw) ?? raw;
}
