type HolidayGroup = {
  dates: string[];
  label: string;
  substituteEnabled: boolean;
};

export type KoreanHolidayItem = {
  date: string;
  label: string;
};

type KoreanLunarDate = {
  month: number;
  day: number;
  isLeapMonth: boolean;
};

const KOREAN_LUNAR_FORMATTER = new Intl.DateTimeFormat("ko-KR-u-ca-chinese", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const LEAP_MONTH_MARKER = "\uC724";
const holidayCache = new Map<number, Map<string, string>>();
const localHolidayProvider = {
  isKoreanPublicHoliday,
  listKoreanHolidayItemsForRange,
  listKoreanHolidayItemsForMonth,
  listLocalKoreanPublicHolidaysForMonth,
};

export function isKoreanPublicHoliday(date: Date) {
  return getHolidayMap(date.getFullYear()).has(formatDateKey(date));
}

export function listKoreanHolidayItemsForMonth(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return listKoreanHolidayItemsForRange(start, end);
}

export function listLocalKoreanPublicHolidaysForMonth(month: string) {
  const [year, monthValue] = month.split("-").map((token) => Number(token));
  return listKoreanHolidayItemsForMonth(year, monthValue).map((item) => ({
    date: item.date,
    label: item.label,
  }));
}

export function listKoreanHolidayItemsForRange(from: Date, to: Date) {
  const start = from <= to ? startOfDay(from) : startOfDay(to);
  const end = from <= to ? endOfDay(to) : endOfDay(from);
  const years = collectYearsInRange(start, end);
  const items: KoreanHolidayItem[] = [];
  const startKey = formatDateKey(start);
  const endKey = formatDateKey(end);

  for (const year of years) {
    const holidayMap = getHolidayMap(year);
    for (const [date, label] of holidayMap.entries()) {
      if (date < startKey || date > endKey) {
        continue;
      }

      items.push({ date, label });
    }
  }

  return items.sort((left, right) => left.date.localeCompare(right.date) || left.label.localeCompare(right.label));
}

export default localHolidayProvider;

function getHolidayMap(year: number) {
  const cached = holidayCache.get(year);
  if (cached) {
    return cached;
  }

  const groups = buildHolidayGroups(year);
  const holidayCounts = new Map<string, number>();
  const holidayMap = new Map<string, string>();

  for (const group of groups) {
    for (const dateKey of group.dates) {
      holidayCounts.set(dateKey, (holidayCounts.get(dateKey) ?? 0) + 1);
      if (!holidayMap.has(dateKey)) {
        holidayMap.set(dateKey, group.label);
      }
    }
  }

  const substituteClusters = mergeOverlappingGroups(groups.filter((group) => group.substituteEnabled));
  for (const cluster of substituteClusters) {
    const needsSubstitute = cluster.some((dateKey) => isWeekendDateKey(dateKey) || (holidayCounts.get(dateKey) ?? 0) > 1);
    if (!needsSubstitute) {
      continue;
    }

    let cursor = addDays(parseDateKey(cluster[cluster.length - 1] ?? `${year}-01-01`), 1);
    while (holidayMap.has(formatDateKey(cursor)) || isWeekend(cursor)) {
      cursor = addDays(cursor, 1);
    }

    holidayMap.set(formatDateKey(cursor), "\uB300\uCCB4\uACF5\uD734\uC77C");
  }

  holidayCache.set(year, holidayMap);
  return holidayMap;
}

function buildHolidayGroups(year: number) {
  const groups: HolidayGroup[] = [
    { dates: [`${year}-01-01`], label: "\uC2E0\uC815", substituteEnabled: false },
    { dates: [`${year}-03-01`], label: "3\u00B71\uC808", substituteEnabled: true },
    { dates: [`${year}-05-05`], label: "\uC5B4\uB9B0\uC774\uB0A0", substituteEnabled: true },
    { dates: [`${year}-06-06`], label: "\uD604\uCDA9\uC77C", substituteEnabled: false },
    { dates: [`${year}-08-15`], label: "\uAD11\uBCF5\uC808", substituteEnabled: true },
    { dates: [`${year}-10-03`], label: "\uAC1C\uCC9C\uC808", substituteEnabled: true },
    { dates: [`${year}-10-09`], label: "\uD55C\uAE00\uB0A0", substituteEnabled: true },
    { dates: [`${year}-12-25`], label: "\uC131\uD0C4\uC808", substituteEnabled: year >= 2023 },
  ];

  const seollalDates: string[] = [];
  const buddhaDates: string[] = [];
  const chuseokDates: string[] = [];

  for (let offset = 0; offset < 366; offset += 1) {
    const date = new Date(year, 0, 1 + offset);
    if (date.getFullYear() !== year) {
      break;
    }

    const lunarDate = getKoreanLunarDate(date);
    const nextLunarDate = getKoreanLunarDate(addDays(date, 1));
    const dateKey = formatDateKey(date);

    if (!nextLunarDate.isLeapMonth && nextLunarDate.month === 1 && nextLunarDate.day === 1) {
      seollalDates.push(dateKey);
    }

    if (!lunarDate.isLeapMonth && lunarDate.month === 1 && (lunarDate.day === 1 || lunarDate.day === 2)) {
      seollalDates.push(dateKey);
    }

    if (!lunarDate.isLeapMonth && lunarDate.month === 4 && lunarDate.day === 8) {
      buddhaDates.push(dateKey);
    }

    if (!lunarDate.isLeapMonth && lunarDate.month === 8 && lunarDate.day >= 14 && lunarDate.day <= 16) {
      chuseokDates.push(dateKey);
    }
  }

  if (seollalDates.length > 0) {
    groups.push({ dates: seollalDates, label: "\uC124\uB0A0", substituteEnabled: true });
  }

  if (buddhaDates.length > 0) {
    groups.push({ dates: buddhaDates, label: "\uBD80\uCC98\uB2D8\uC624\uC2E0\uB0A0", substituteEnabled: year >= 2023 });
  }

  if (chuseokDates.length > 0) {
    groups.push({ dates: chuseokDates, label: "\uCD94\uC11D", substituteEnabled: true });
  }

  return groups.map((group) => ({
    ...group,
    dates: [...new Set(group.dates)].sort(),
  }));
}

function getKoreanLunarDate(date: Date): KoreanLunarDate {
  const parts = KOREAN_LUNAR_FORMATTER.formatToParts(date);
  const rawMonth = parts.find((part) => part.type === "month")?.value ?? "";
  const rawDay = parts.find((part) => part.type === "day")?.value ?? "";

  return {
    month: Number(rawMonth.replace(/[^\d]/g, "")),
    day: Number(rawDay.replace(/[^\d]/g, "")),
    isLeapMonth: rawMonth.includes(LEAP_MONTH_MARKER),
  };
}

function mergeOverlappingGroups(groups: readonly HolidayGroup[]) {
  if (groups.length === 0) {
    return [] as string[][];
  }

  const parents = groups.map((_, index) => index);
  const dateSets = groups.map((group) => new Set(group.dates));

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      if (!setsOverlap(dateSets[i], dateSets[j])) {
        continue;
      }

      union(parents, i, j);
    }
  }

  const clusters = new Map<number, Set<string>>();
  groups.forEach((group, index) => {
    const root = find(parents, index);
    const cluster = clusters.get(root) ?? new Set<string>();
    group.dates.forEach((dateKey) => cluster.add(dateKey));
    clusters.set(root, cluster);
  });

  return [...clusters.values()]
    .map((cluster) => [...cluster].sort())
    .sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
}

function setsOverlap(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  for (const value of left) {
    if (right.has(value)) {
      return true;
    }
  }

  return false;
}

function find(parents: number[], index: number): number {
  const parent = parents[index];
  if (parent === index) {
    return index;
  }

  const root = find(parents, parent);
  parents[index] = root;
  return root;
}

function union(parents: number[], left: number, right: number) {
  const leftRoot = find(parents, left);
  const rightRoot = find(parents, right);
  if (leftRoot === rightRoot) {
    return;
  }

  parents[rightRoot] = leftRoot;
}

function isWeekendDateKey(dateKey: string) {
  return isWeekend(parseDateKey(dateKey));
}

function isWeekend(date: Date) {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  return new Date(year, month - 1, day);
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function collectYearsInRange(from: Date, to: Date) {
  const startYear = from.getFullYear();
  const endYear = to.getFullYear();
  const years: number[] = [];

  for (let year = startYear; year <= endYear; year += 1) {
    years.push(year);
  }

  return years;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
