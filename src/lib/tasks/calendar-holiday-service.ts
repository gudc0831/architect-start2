import { XMLParser } from "fast-xml-parser";
import { holidayApiServiceKey } from "@/lib/runtime-config";
import type {
  CalendarHolidayMonthSource,
  CalendarHolidayRangeData,
  CalendarHolidayRecord,
  CalendarHolidaySource,
} from "@/lib/tasks/calendar-holiday-types";
import koreanPublicHolidays from "@/lib/tasks/korean-public-holidays";

const HOLIDAY_API_URL = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
const HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_HOLIDAY_RANGE_MONTHS = 4;
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false,
  trimValues: true,
});

type HolidayCacheRecord = {
  month: string;
  fetchedAt: string;
  expiresAt: string | null;
  items: CalendarHolidayRecord[];
  source: "api";
};

const holidayMonthCache = new Map<string, HolidayCacheRecord>();

type ResolvedHolidayMonth = {
  month: string;
  source: CalendarHolidaySource;
  items: CalendarHolidayRecord[];
};

export async function getCalendarHolidaysForRange(input: { from: string; to: string }): Promise<CalendarHolidayRangeData> {
  const months = listMonthKeysInRange(input.from, input.to);
  if (months.length > MAX_HOLIDAY_RANGE_MONTHS) {
    throw new Error("Holiday range too large");
  }
  const results = await Promise.all(months.map((month) => resolveHolidayMonth(month)));
  const rangeItems = filterItemsToRange(results.flatMap((result) => result.items), input.from, input.to);

  return {
    from: input.from,
    to: input.to,
    items: dedupeHolidayRecords(rangeItems),
    months: results.map<CalendarHolidayMonthSource>((result) => ({
      month: result.month,
      source: result.source,
    })),
  };
}

async function resolveHolidayMonth(month: string): Promise<ResolvedHolidayMonth> {
  if (!holidayApiServiceKey) {
    return {
      month,
      source: "local-fallback",
      items: koreanPublicHolidays.listLocalKoreanPublicHolidaysForMonth(month),
    };
  }

  const cache = readHolidayMonthCache(month);
  if (cache && isHolidayCacheFresh(cache)) {
    return {
      month,
      source: "cache",
      items: cache.items,
    };
  }

  try {
    const items = await fetchOfficialHolidayMonth(month);
    await writeHolidayMonthCache(month, items);
    return {
      month,
      source: "api",
      items,
    };
  } catch {
    if (cache) {
      return {
        month,
        source: "stale-cache",
        items: cache.items,
      };
    }

    return {
      month,
      source: "local-fallback",
      items: koreanPublicHolidays.listLocalKoreanPublicHolidaysForMonth(month),
    };
  }
}

async function fetchOfficialHolidayMonth(month: string) {
  const [year, monthValue] = month.split("-");
  const serviceKey = normalizeHolidayServiceKey(holidayApiServiceKey);
  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    pageNo: "1",
    numOfRows: "64",
    solYear: year,
    solMonth: monthValue,
  });
  const response = await fetch(`${HOLIDAY_API_URL}?${params.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Holiday API request failed: ${response.status}`);
  }

  const xml = await response.text();
  const parsed = xmlParser.parse(xml) as {
    response?: {
      header?: {
        resultCode?: string;
        resultMsg?: string;
      };
      body?: {
        items?: {
          item?: Array<Record<string, unknown>> | Record<string, unknown>;
        };
      };
    };
  };
  const resultCode = String(parsed.response?.header?.resultCode ?? "");
  if (resultCode !== "00") {
    throw new Error(String(parsed.response?.header?.resultMsg ?? "Holiday API error"));
  }

  const rawItems = parsed.response?.body?.items?.item;
  const items = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

  return dedupeHolidayRecords(
    items
      .filter((item) => String(item.isHoliday ?? "N").trim().toUpperCase() === "Y")
      .map((item) => ({
        date: normalizeLocdate(item.locdate),
        label: String(item.dateName ?? "").trim() || undefined,
      }))
      .filter((item) => item.date.startsWith(`${month}-`)),
  );
}

function readHolidayMonthCache(month: string) {
  return holidayMonthCache.get(month) ?? null;
}

async function writeHolidayMonthCache(month: string, items: CalendarHolidayRecord[]) {
  const now = new Date();
  const record: HolidayCacheRecord = {
    month,
    fetchedAt: now.toISOString(),
    expiresAt: isPastMonth(month) ? null : new Date(now.getTime() + HOLIDAY_CACHE_TTL_MS).toISOString(),
    items,
    source: "api",
  };

  holidayMonthCache.set(month, record);

  for (const [cachedMonth, cachedRecord] of holidayMonthCache.entries()) {
    if (cachedMonth === month) {
      continue;
    }

    if (cachedRecord.expiresAt !== null && new Date(cachedRecord.expiresAt).getTime() <= now.getTime()) {
      holidayMonthCache.delete(cachedMonth);
    }
  }
}

function isHolidayCacheFresh(cache: HolidayCacheRecord) {
  if (cache.expiresAt === null) {
    return true;
  }

  return new Date(cache.expiresAt).getTime() > Date.now();
}

function listMonthKeysInRange(from: string, to: string) {
  const start = parseDateKey(from);
  const end = parseDateKey(to);
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor.getTime() <= end.getTime()) {
    months.push(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`);
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }

  return months;
}

function filterItemsToRange(items: CalendarHolidayRecord[], from: string, to: string) {
  return items.filter((item) => item.date >= from && item.date <= to);
}

function dedupeHolidayRecords(items: CalendarHolidayRecord[]) {
  const labelsByDate = new Map<string, Set<string>>();
  for (const item of items) {
    if (!item.date) {
      continue;
    }

    const labels = labelsByDate.get(item.date) ?? new Set<string>();
    if (item.label) {
      labels.add(item.label);
    }
    labelsByDate.set(item.date, labels);
  }

  return [...labelsByDate.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, labels]) => ({
      date,
      label: labels.size > 0 ? [...labels].join(" / ") : undefined,
    }));
}

function normalizeLocdate(value: unknown) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (digits.length !== 8) {
    return "";
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

function isPastMonth(month: string) {
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  return month < currentMonth;
}

function parseDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid holiday date key: ${value}`);
  }

  const [year, month, day] = value.split("-").map((token) => Number(token));
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(`Invalid holiday date key: ${value}`);
  }

  return date;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeHolidayServiceKey(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
