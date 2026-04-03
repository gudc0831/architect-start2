export const TASK_STATUS_ORDER = ["new", "in_review", "in_discussion", "blocked", "done"] as const;

export type TaskStatus = (typeof TASK_STATUS_ORDER)[number];

export const DEFAULT_TASK_STATUS: TaskStatus = "new";

export const LEGACY_TASK_STATUS_MAP = {
  waiting: "new",
  todo: "in_review",
  in_progress: "in_discussion",
  blocked: "blocked",
  done: "done",
} as const satisfies Record<string, TaskStatus>;

export type LegacyTaskStatus = keyof typeof LEGACY_TASK_STATUS_MAP;
export type CompatibleTaskStatus = TaskStatus | LegacyTaskStatus;

export const TASK_STATUS_FOCUS_ORDER = ["in_review", "in_discussion", "blocked"] as const;

const canonicalTaskStatusSet = new Set<string>(TASK_STATUS_ORDER);
const compatibleTaskStatusSet = new Set<string>([
  ...TASK_STATUS_ORDER,
  ...(Object.keys(LEGACY_TASK_STATUS_MAP) as LegacyTaskStatus[]),
]);

export const TASK_STATUS_HISTORY_ENTRY_PATTERN =
  /(.* - )(waiting|todo|in_progress|new|in_review|in_discussion|blocked|done)$/u;

export function isTaskStatus(value: unknown): value is TaskStatus {
  return canonicalTaskStatusSet.has(String(value ?? "").trim());
}

export function isCompatibleTaskStatus(value: unknown): value is CompatibleTaskStatus {
  return compatibleTaskStatusSet.has(String(value ?? "").trim());
}

export function normalizeTaskStatus(value: unknown, fallback: TaskStatus = DEFAULT_TASK_STATUS): TaskStatus {
  const raw = String(value ?? "").trim();
  if (isTaskStatus(raw)) {
    return raw;
  }

  return LEGACY_TASK_STATUS_MAP[raw as LegacyTaskStatus] ?? fallback;
}

export function createTaskStatusHistoryEntry(timestamp: string, status: TaskStatus) {
  return `${timestamp} - ${status}`;
}

export function canonicalizeTaskStatusHistory(
  raw: unknown,
  fallbackStatus: TaskStatus = DEFAULT_TASK_STATUS,
  fallbackTimestamp?: string,
) {
  const normalized = String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line.replace(TASK_STATUS_HISTORY_ENTRY_PATTERN, (_match, prefix: string, status: CompatibleTaskStatus) => {
        return prefix + normalizeTaskStatus(status, fallbackStatus);
      }),
    );

  if (normalized.length > 0) {
    return normalized.join("\n");
  }

  return fallbackTimestamp ? createTaskStatusHistoryEntry(fallbackTimestamp, fallbackStatus) : "";
}
