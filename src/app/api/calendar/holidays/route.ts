import { NextResponse } from "next/server";
import { badRequest } from "@/lib/api/errors";
import { handleRouteError } from "@/lib/api/route-error";
import { requireUser } from "@/lib/auth/require-user";
import { getCalendarHolidaysForRange } from "@/lib/tasks/calendar-holiday-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HOLIDAY_RANGE_MONTHS = 4;

export async function GET(request: Request) {
  try {
    await requireUser();
    const { searchParams } = new URL(request.url);
    const from = String(searchParams.get("from") ?? "").trim();
    const to = String(searchParams.get("to") ?? "").trim();

    const fromDate = parseIsoDateKey(from);
    const toDate = parseIsoDateKey(to);

    if (!fromDate || !toDate) {
      throw badRequest("from and to must be YYYY-MM-DD", "HOLIDAY_RANGE_INVALID");
    }

    if (from > to) {
      throw badRequest("from must be earlier than or equal to to", "HOLIDAY_RANGE_INVALID");
    }

    if (countTouchedMonths(fromDate, toDate) > MAX_HOLIDAY_RANGE_MONTHS) {
      throw badRequest(`holiday range must be ${MAX_HOLIDAY_RANGE_MONTHS} months or less`, "HOLIDAY_RANGE_TOO_LARGE");
    }

    const data = await getCalendarHolidaysForRange({ from, to });
    return NextResponse.json({ data });
  } catch (error) {
    return handleRouteError(error);
  }
}

function parseIsoDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function countTouchedMonths(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}
