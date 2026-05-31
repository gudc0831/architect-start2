import { readFile } from "node:fs/promises";
import type {
  LegalChangeEvent,
  LegalChangeItem,
  LegalChangeListResponse,
  LegalChangeMonitorFreshness,
} from "@/domains/legal/change-events";

const DEFAULT_MONITOR_CADENCE_DAYS = 31;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const MONITOR_REPORT_STATUS = "legal_change_monitor_report";
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DATE_WINDOW_PATTERN = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/;
const REDACTED_UPSTREAM_MONITOR_WARNING = "Upstream legal-change monitor warning redacted.";

type ListLegalChangeItemsOptions = {
  events?: LegalChangeEvent[];
  eventsPath?: string;
  monitorReport?: unknown;
  monitorReportPath?: string;
  currentDate?: Date | string;
  visibleTaskIds?: string[];
};

export function mapLegalChangeEventsToItems(
  events: LegalChangeEvent[],
  options: Pick<ListLegalChangeItemsOptions, "visibleTaskIds"> = {},
): LegalChangeItem[] {
  const visibleTaskIds = options.visibleTaskIds ? new Set(options.visibleTaskIds) : null;
  return events
    .map((event) => {
      const affectedTaskIds = visibleTaskIds
        ? event.affectedTaskIds.filter((taskId) => visibleTaskIds.has(taskId))
        : event.affectedTaskIds;

      return {
        eventId: event.eventId,
        lawName: event.lawName,
        changeKind: event.changeKind,
        effectiveFrom: event.effectiveFrom,
        reviewState: event.reviewState,
        affectedSourceIds: event.affectedSourceIds,
        affectedTaskIds,
        affectedTaskCount: affectedTaskIds.length,
        sourceUrl: event.sourceUrl,
        reindexStatus: "needs_reindex" as const,
      };
    })
    .filter((event) => !visibleTaskIds || event.affectedTaskCount > 0)
    .sort((left, right) => {
      const stateDelta = reviewStatePriority(left.reviewState) - reviewStatePriority(right.reviewState);
      if (stateDelta !== 0) {
        return stateDelta;
      }

      return left.eventId.localeCompare(right.eventId);
    });
}

export async function listLegalChangeItems(
  options: ListLegalChangeItemsOptions = {},
): Promise<LegalChangeListResponse> {
  const events = options.events ?? await readConfiguredLegalChangeEvents(options.eventsPath);
  return {
    items: mapLegalChangeEventsToItems(events, { visibleTaskIds: options.visibleTaskIds }),
    monitor: await readConfiguredLegalChangeMonitor(options),
  };
}

async function readConfiguredLegalChangeEvents(eventsPath?: string): Promise<LegalChangeEvent[]> {
  const configuredPath = eventsPath ?? process.env.LEGAL_CHANGE_EVENTS_PATH?.trim();
  if (!configuredPath) {
    return [];
  }

  return parseJsonl<LegalChangeEvent>(await readFile(configuredPath, "utf8"));
}

function parseJsonl<T>(content: string): T[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

async function readConfiguredLegalChangeMonitor(
  options: Pick<ListLegalChangeItemsOptions, "currentDate" | "monitorReport" | "monitorReportPath">,
): Promise<LegalChangeMonitorFreshness> {
  if ("monitorReport" in options) {
    return mapMonitorReportToFreshness(options.monitorReport, options.currentDate);
  }

  const configuredPath = options.monitorReportPath ?? process.env.LEGAL_CHANGE_MONITOR_REPORT_PATH?.trim();
  if (!configuredPath) {
    return missingMonitorFreshness("Legal change monitor report is not configured.", options.currentDate);
  }

  try {
    return mapMonitorReportToFreshness(JSON.parse(await readFile(configuredPath, "utf8")), options.currentDate);
  } catch {
    return missingMonitorFreshness("Legal change monitor report is unavailable or malformed.", options.currentDate);
  }
}

function mapMonitorReportToFreshness(
  report: unknown,
  currentDateInput?: Date | string,
): LegalChangeMonitorFreshness {
  if (!isRecord(report)) {
    return missingMonitorFreshness("Legal change monitor report is unavailable or malformed.", currentDateInput);
  }

  if (report.status !== MONITOR_REPORT_STATUS) {
    return missingMonitorFreshness("Legal change monitor report is unavailable or malformed.", currentDateInput);
  }

  const detectedAt = isoTimestampValue(report.detectedAt);
  const detectedDate = detectedAt ? new Date(detectedAt) : null;
  const eventCount = nonNegativeIntegerValue(report.eventCount);
  const unchangedCount = nonNegativeIntegerValue(report.unchangedCount);
  if (!detectedAt || !detectedDate || Number.isNaN(detectedDate.getTime()) || eventCount === null || unchangedCount === null) {
    return missingMonitorFreshness("Legal change monitor report is unavailable or malformed.", currentDateInput);
  }

  const cadenceDays = DEFAULT_MONITOR_CADENCE_DAYS;
  const currentDate = normalizeCurrentDate(currentDateInput);
  const ageMs = currentDate.getTime() - detectedDate.getTime();
  const status = ageMs > cadenceDays * DAY_IN_MS ? "stale" : "current";
  const warnings = sanitizeMonitorWarnings(report.warnings);
  if (status === "stale") {
    warnings.unshift(`Legal change monitor report is stale: older than ${cadenceDays} days.`);
  }

  return {
    status,
    cadenceDays,
    lastRunAt: detectedAt,
    detectedAt,
    dateWindow: dateWindowValue(report.dateWindow),
    eventCount,
    unchangedCount,
    staleSourceCount: arrayLength(report.staleSourceIds),
    warnings,
  };
}

function missingMonitorFreshness(
  warning: string,
  currentDateInput?: Date | string,
): LegalChangeMonitorFreshness {
  normalizeCurrentDate(currentDateInput);
  return {
    status: "missing",
    cadenceDays: DEFAULT_MONITOR_CADENCE_DAYS,
    lastRunAt: null,
    detectedAt: null,
    dateWindow: null,
    eventCount: 0,
    unchangedCount: 0,
    staleSourceCount: 0,
    warnings: [warning],
  };
}

function sanitizeMonitorWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.some((warning) => typeof warning === "string" && warning.trim().length > 0)
    ? [REDACTED_UPSTREAM_MONITOR_WARNING]
    : [];
}

function normalizeCurrentDate(input?: Date | string): Date {
  if (input instanceof Date) {
    return input;
  }

  if (typeof input === "string") {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isoTimestampValue(value: unknown): string | null {
  const timestamp = stringValue(value);
  if (!timestamp || !ISO_TIMESTAMP_PATTERN.test(timestamp)) {
    return null;
  }

  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? null : timestamp;
}

function dateWindowValue(value: unknown): string | null {
  const dateWindow = stringValue(value);
  const match = dateWindow?.match(DATE_WINDOW_PATTERN);
  if (!match || !isValidIsoDate(match[1]) || !isValidIsoDate(match[2])) {
    return null;
  }

  return dateWindow;
}

function nonNegativeIntegerValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function arrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function isValidIsoDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function reviewStatePriority(state: LegalChangeItem["reviewState"]): number {
  if (state === "new") {
    return 0;
  }
  if (state === "acknowledged") {
    return 1;
  }
  return 2;
}
