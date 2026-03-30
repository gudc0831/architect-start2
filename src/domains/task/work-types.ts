import type { TaskCategoryDefinition } from "@/domains/admin/task-category-definitions";

export type WorkTypeCode =
  | "coordination"
  | "review"
  | "request"
  | "reply"
  | "record"
  | "confirmation"
  | "revision";

export type WorkTypeDefinition = TaskCategoryDefinition & { fieldKey: "workType" };

export const workTypeCodeOrder = [
  "coordination",
  "review",
  "request",
  "reply",
  "record",
  "confirmation",
  "revision",
] as const satisfies readonly WorkTypeCode[];

export const workTypeCodePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type WorkTypeSeed = Pick<WorkTypeDefinition, "code" | "labelKo" | "labelEn" | "sortOrder">;

const systemWorkTypeSeeds: readonly WorkTypeSeed[] = [
  { code: "coordination", labelKo: "\uD611\uC758", labelEn: "Coordination", sortOrder: 0 },
  { code: "review", labelKo: "\uAC80\uD1A0", labelEn: "Review", sortOrder: 1 },
  { code: "request", labelKo: "\uC694\uCCAD", labelEn: "Request", sortOrder: 2 },
  { code: "reply", labelKo: "\uD68C\uC2E0", labelEn: "Reply", sortOrder: 3 },
  { code: "record", labelKo: "\uAE30\uB85D", labelEn: "Record", sortOrder: 4 },
  { code: "confirmation", labelKo: "\uD655\uC778", labelEn: "Confirmation", sortOrder: 5 },
  { code: "revision", labelKo: "\uC218\uC815", labelEn: "Revision", sortOrder: 6 },
] as const;

const legacyWorkTypeMap = {
  "\uC81C\uCD9C\uBCF8 \uAC80\uD1A0": "review",
  "\uBC30\uCE58 \uAC80\uD1A0": "review",
  "\uBC95\uADDC \uC0C1\uC138 \uAC80\uD1A0": "review",
  "\uC785\uBA74 \uC0C1\uC138 \uC870\uC815": "revision",
  "\uD3C9\uBA74 \uC0C1\uC138 \uC870\uC815": "revision",
  "\uAC00\uAD6C \uCE58\uC218 \uC870\uC815": "revision",
  "\uCC9C\uC7A5 \uC810\uAC80\uAD6C \uC870\uC815": "revision",
  "\uBCBD\uCCB4 \uC0C1\uC138 \uC218\uC815": "revision",
  "\uAC04\uC12D \uC870\uC815": "coordination",
} as const satisfies Record<string, WorkTypeCode>;

export const SYSTEM_WORK_TYPES = Object.freeze(systemWorkTypeSeeds.map((seed) => ({ ...seed })));

export const LEGACY_WORK_TYPE_CODE_MAP = Object.freeze({ ...legacyWorkTypeMap });

export function isWorkTypeCode(value: string | null | undefined): value is WorkTypeCode {
  if (!value) {
    return false;
  }

  return workTypeCodeOrder.includes(value as WorkTypeCode);
}

export function normalizeWorkTypeCode(value: string | null | undefined): WorkTypeCode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isWorkTypeCode(normalized) ? normalized : null;
}

export function normalizeWorkTypeIdentifier(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return workTypeCodePattern.test(normalized) ? normalized : null;
}

export function normalizeLegacyWorkType(value: string | null | undefined): WorkTypeCode | null {
  const normalizedCode = normalizeWorkTypeCode(value);
  if (normalizedCode) {
    return normalizedCode;
  }

  const normalizedLabel = String(value ?? "").trim();
  if (!normalizedLabel) {
    return null;
  }

  return legacyWorkTypeMap[normalizedLabel as keyof typeof legacyWorkTypeMap] ?? null;
}

export function getSystemWorkTypeSeed(code: WorkTypeCode) {
  return systemWorkTypeSeeds.find((seed) => seed.code === code) ?? null;
}

export function labelForSystemWorkType(value: string | null | undefined, locale: "ko" | "en" = "ko") {
  const normalized = normalizeWorkTypeCode(value);
  if (!normalized) {
    return String(value ?? "").trim();
  }

  const seed = getSystemWorkTypeSeed(normalized);
  if (!seed) {
    return normalized;
  }

  return locale === "ko" ? seed.labelKo : seed.labelEn;
}

export function buildSystemWorkTypeDefinitions(input?: {
  now?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}) {
  const timestamp = input?.now ?? new Date().toISOString();
  const createdBy = input?.createdBy ?? null;
  const updatedBy = input?.updatedBy ?? null;

  return systemWorkTypeSeeds.map<WorkTypeDefinition>((seed) => ({
    id: `system:work-type:${seed.code}`,
    fieldKey: "workType",
    projectId: null,
    code: seed.code,
    labelKo: seed.labelKo,
    labelEn: seed.labelEn,
    isSystem: true,
    isActive: true,
    sortOrder: seed.sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy,
    updatedBy,
  }));
}
