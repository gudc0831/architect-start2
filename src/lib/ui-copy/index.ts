import type { AuthRole } from "@/domains/auth/types";
import type { DashboardMode, TaskStatus } from "@/domains/task/types";
import { uiCopyCatalog, type ProjectSourceLabelKey, type UICatalog, type UiLocale, type UploadModeLabelKey } from "@/lib/ui-copy/catalog";

export { getWorkTypeOptions, getWorkTypeSelectOptions, getWorkTypeSelectValue, labelForWorkType } from "@/lib/ui-copy/work-types";

export const DEFAULT_UI_LOCALE: UiLocale = "ko";
export const DEFAULT_UI_LOCALE_TAG = DEFAULT_UI_LOCALE === "ko" ? "ko-KR" : "en-US";

type Primitive = string | number | boolean | null | undefined;
type NestedKeyOf<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${NestedKeyOf<T[K]>}`
      : never;
}[keyof T & string];

type PathValue<T, P extends string> = P extends `${infer Head}.${infer Tail}`
  ? Head extends keyof T
    ? PathValue<T[Head], Tail>
    : never
  : P extends keyof T
    ? T[P]
    : never;

type CatalogPath = NestedKeyOf<UICatalog>;
export type FieldLabelKey = keyof UICatalog["fields"];
export type ErrorCopyKey = keyof UICatalog["errors"];

const errorCodeMap = {
  INVALID_CREDENTIALS: "invalidCredentials",
  AUTH_NOT_CONFIGURED: "authNotConfigured",
  UNAUTHORIZED: "unauthorized",
  FORBIDDEN: "forbidden",
  TASK_NOT_FOUND: "taskNotFound",
  FILE_NOT_FOUND: "fileNotFound",
  FILE_NOT_IN_TRASH: "fileNotInTrash",
  TASK_NOT_IN_TRASH: "taskNotInTrash",
  TASK_VERSION_REQUIRED: "taskVersionRequired",
  TASK_VERSION_CONFLICT: "taskVersionConflict",
  INVALID_PARENT_TASK: "invalidParentTask",
  PARENT_TASK_NOT_FOUND: "parentTaskNotFound",
  PARENT_TASK_NUMBER_INVALID: "parentTaskNumberInvalid",
  TASK_STATUS_INVALID: "taskStatusInvalid",
  PROJECT_NAME_REQUIRED: "projectNameRequired",
  TASK_ID_REQUIRED: "taskIdRequired",
  FILE_REQUIRED: "fileRequired",
  FILE_TOO_LARGE: "fileTooLarge",
  FILE_TYPE_NOT_ALLOWED: "fileTypeNotAllowed",
  SUPABASE_ENV_MISSING: "supabaseEnvMissing",
  FIREBASE_ENV_MISSING: "firebaseEnvMissing",
  CLOUD_ENV_MISSING: "cloudEnvMissing",
  BACKEND_MODE_INVALID: "backendModeInvalid",
  DATABASE_URL_MISSING: "databaseUrlMissing",
  INTERNAL_SERVER_ERROR: "internalServerError",
} satisfies Record<string, ErrorCopyKey>;

function getCatalog(locale: UiLocale = DEFAULT_UI_LOCALE) {
  return uiCopyCatalog[locale];
}

function resolvePath<T extends Record<string, unknown>, P extends string>(obj: T, path: P): PathValue<T, P> {
  return path.split(".").reduce<unknown>((acc, segment) => {
    if (!acc || typeof acc !== "object") {
      throw new Error(`Invalid ui-copy path: ${path}`);
    }
    return (acc as Record<string, unknown>)[segment];
  }, obj) as PathValue<T, P>;
}

function interpolate(template: string, values?: Record<string, Primitive>) {
  if (!values) return template;
  return template.replace(/{{\s*([\w]+)\s*}}/g, (_match, key: string) => String(values[key] ?? ""));
}

export function t<P extends CatalogPath>(path: P, values?: Record<string, Primitive>) {
  const template = resolvePath(getCatalog(), path);
  if (typeof template !== "string") {
    throw new Error(`ui-copy path does not resolve to a string: ${path}`);
  }
  return interpolate(template, values);
}

export function labelForMode(mode: DashboardMode) {
  return getCatalog().nav[mode];
}

export function labelForStatus(status: TaskStatus) {
  return getCatalog().status.labels[status];
}

export function describeStatus(status: TaskStatus) {
  return getCatalog().status.descriptions[status];
}

export function labelForField(field: FieldLabelKey) {
  return getCatalog().fields[field];
}

export function labelForRole(role: AuthRole | null | undefined) {
  if (!role) return t("system.unknown");
  return getCatalog().system.roles[role] ?? t("system.unknown");
}

export function labelForProjectSource(source: string | null | undefined) {
  const key = (source ?? "unknown") as ProjectSourceLabelKey;
  return getCatalog().system.projectSources[key] ?? t("system.projectSources.unknown");
}

export function labelForDataMode(mode: string | null | undefined) {
  return labelForProjectSource(mode);
}

export function labelForUploadMode(mode: string | null | undefined) {
  const key = (mode ?? "unknown") as UploadModeLabelKey;
  return getCatalog().system.uploadModes[key] ?? t("system.uploadModes.unknown");
}

export function labelForBoolean(value: boolean) {
  return value ? t("system.yes") : t("system.no");
}

export function formatStatusHistoryForDisplay(raw: string) {
  if (!raw) return raw;

  return raw
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/(.* - )(waiting|todo|in_progress|blocked|done)$/u, (_match, prefix: string, status: TaskStatus) => {
        return prefix + labelForStatus(status);
      }),
    )
    .join("\n");
}

export function localizeError(input: { code?: string | null; fallbackKey?: ErrorCopyKey }) {
  const { code, fallbackKey = "internalServerError" } = input;
  const resolvedKey = code && code in errorCodeMap ? errorCodeMap[code as keyof typeof errorCodeMap] : fallbackKey;
  return getCatalog().errors[resolvedKey];
}

export function getWeekdayLabels() {
  return Object.values(getCatalog().workspace.weekdays);
}

export function getWeekdayLabelByIndex(index: number, long = false) {
  const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const key = keys[index] ?? "sun";
  return long ? getCatalog().workspace.weekdaysLong[key] : getCatalog().workspace.weekdays[key];
}

export { getCatalog, uiCopyCatalog };


