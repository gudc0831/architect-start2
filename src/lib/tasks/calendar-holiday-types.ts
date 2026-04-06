export type CalendarHolidaySource = "api" | "cache" | "stale-cache" | "local-fallback";

export type CalendarHolidayRecord = {
  date: string;
  label?: string;
};

export type CalendarHolidayMonthSource = {
  month: string;
  source: CalendarHolidaySource;
};

export type CalendarHolidayRangeData = {
  from: string;
  to: string;
  items: CalendarHolidayRecord[];
  months: CalendarHolidayMonthSource[];
};
