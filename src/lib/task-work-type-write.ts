import type { WorkTypeCode, WorkTypeDefinition } from "@/domains/task/work-types";
import { normalizeLegacyWorkType, normalizeWorkTypeCode, normalizeWorkTypeIdentifier } from "@/domains/task/work-types";
import { badRequest } from "@/lib/api/errors";

export type WorkTypeMigrationAction = "keep" | "map" | "delete";

export type WorkTypeMigrationDecision = {
  rawValue: string;
  nextCode: WorkTypeCode | null;
  action: WorkTypeMigrationAction;
  reason: string;
};

type AllowedWorkTypeInput =
  | Iterable<string>
  | readonly Pick<WorkTypeDefinition, "code" | "isActive">[]
  | undefined;

export function requireCanonicalWorkType(value: unknown, fieldName = "workType") {
  const normalized = normalizeWorkTypeCode(asTrimmedString(value));

  if (!normalized) {
    throw badRequest(`${fieldName} is invalid`, "TASK_WORK_TYPE_INVALID");
  }

  return normalized;
}

export function requireStoredWorkTypeCode(value: unknown, fieldName = "workType") {
  const normalized = normalizeWorkTypeIdentifier(asTrimmedString(value));

  if (!normalized) {
    throw badRequest(`${fieldName} is invalid`, "TASK_WORK_TYPE_INVALID");
  }

  return normalized;
}

export function requireAllowedWorkType(value: unknown, allowedCodes?: AllowedWorkTypeInput, fieldName = "workType") {
  const normalized = requireStoredWorkTypeCode(value, fieldName);

  if (!isAllowedWorkType(normalized, allowedCodes)) {
    throw badRequest(`${fieldName} is invalid`, "TASK_WORK_TYPE_INVALID");
  }

  return normalized;
}

export function resolvePatchedWorkType(
  value: unknown,
  options?: {
    currentValue?: string | null;
    fieldName?: string;
    allowedCodes?: AllowedWorkTypeInput;
  },
) {
  if (value === undefined) {
    return undefined;
  }

  const fieldName = options?.fieldName ?? "workType";
  const rawValue = asTrimmedString(value);
  const normalized = normalizeWorkTypeIdentifier(rawValue);
  if (normalized && isAllowedWorkType(normalized, options?.allowedCodes)) {
    return normalized;
  }

  const currentValue = asTrimmedString(options?.currentValue);
  const normalizedCurrentValue = normalizeWorkTypeIdentifier(currentValue);
  if (rawValue && currentValue && rawValue === currentValue) {
    const currentValueIsAllowed = normalizedCurrentValue
      ? isAllowedWorkType(normalizedCurrentValue, options?.allowedCodes)
      : false;

    if (!currentValueIsAllowed) {
      return undefined;
    }
  }

  throw badRequest(`${fieldName} is invalid`, "TASK_WORK_TYPE_INVALID");
}

export function classifyLegacyWorkType(value: unknown): WorkTypeMigrationDecision {
  const rawValue = asTrimmedString(value);

  if (!rawValue) {
    return {
      rawValue,
      nextCode: null,
      action: "delete",
      reason: "empty-work-type",
    };
  }

  const canonicalCode = normalizeWorkTypeCode(rawValue);
  if (canonicalCode) {
    return {
      rawValue,
      nextCode: canonicalCode,
      action: "keep",
      reason: "already-canonical",
    };
  }

  const mappedCode = normalizeLegacyWorkType(rawValue);
  if (mappedCode) {
    return {
      rawValue,
      nextCode: mappedCode,
      action: "map",
      reason: "legacy-mapping",
    };
  }

  return {
    rawValue,
    nextCode: null,
    action: "delete",
    reason: "unmappable",
  };
}

function isAllowedWorkType(value: string, allowedCodes?: AllowedWorkTypeInput) {
  const allowedSet = toAllowedWorkTypeSet(allowedCodes);
  if (!allowedSet) {
    return Boolean(normalizeWorkTypeCode(value));
  }

  return allowedSet.has(value);
}

function toAllowedWorkTypeSet(allowedCodes?: AllowedWorkTypeInput) {
  if (!allowedCodes) {
    return null;
  }

  const allowedSet = new Set<string>();

  for (const item of allowedCodes) {
    if (typeof item === "string") {
      const normalized = normalizeWorkTypeIdentifier(item);
      if (normalized) {
        allowedSet.add(normalized);
      }
      continue;
    }

    if (item?.isActive === false) {
      continue;
    }

    const normalized = normalizeWorkTypeIdentifier(item?.code);
    if (normalized) {
      allowedSet.add(normalized);
    }
  }

  return allowedSet;
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
