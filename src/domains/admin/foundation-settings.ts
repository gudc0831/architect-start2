import { badRequest } from "@/lib/api/errors";

export const DEFAULT_OWNER_DISCIPLINE = "건축";

export type AdminFoundationSettings = {
  ownerDiscipline: string;
};

export function sanitizeOwnerDiscipline(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeOwnerDiscipline(value: unknown) {
  return sanitizeOwnerDiscipline(value) || DEFAULT_OWNER_DISCIPLINE;
}

export function normalizeAdminFoundationSettings(value: unknown): AdminFoundationSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ownerDiscipline: DEFAULT_OWNER_DISCIPLINE,
    };
  }

  const source = value as Record<string, unknown>;
  return {
    ownerDiscipline: normalizeOwnerDiscipline(source.ownerDiscipline),
  };
}

export function requireOwnerDiscipline(value: unknown, fieldName = "ownerDiscipline") {
  const normalized = sanitizeOwnerDiscipline(value);
  if (!normalized) {
    throw badRequest(`${fieldName} is required`, "OWNER_DISCIPLINE_REQUIRED");
  }

  return normalized;
}
