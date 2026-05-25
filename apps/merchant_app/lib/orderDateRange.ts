/** IST date-range presets for order history (Partner / Zomato style). */

import { isActiveMerchantOrderStage } from "@/lib/merchantActiveOrders";

const IST = "Asia/Kolkata";

export type DateRangePresetId =
  | "last_2_days"
  | "this_week"
  | "last_week"
  | "last_30_days"
  | "custom";

export type OrderDateRange = {
  preset: DateRangePresetId;
  startMs: number;
  endMs: number;
};

function startOfIstDay(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return new Date(`${y}-${m}-${day}T00:00:00+05:30`);
}

function endOfIstDay(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return new Date(`${y}-${m}-${day}T23:59:59.999+05:30`);
}

function addIstDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function istDayOfWeek(d: Date): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: IST, weekday: "short" }).format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[wd] ?? 0;
}

export function formatIstDayMonth(d: Date): string {
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: IST }).format(d);
  const month = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: IST }).format(d);
  return `${day} ${month}`;
}

export function formatIstDayMonthYear(d: Date): string {
  const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", timeZone: IST }).format(d);
  const month = new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: IST }).format(d);
  const year = new Intl.DateTimeFormat("en-IN", { year: "2-digit", timeZone: IST }).format(d);
  return `${day} ${month}'${year}`;
}

export function formatRangeSubtitle(start: Date, end: Date): string {
  return `${formatIstDayMonth(start)} - ${formatIstDayMonthYear(end)}`;
}

export function buildPresetRange(preset: DateRangePresetId, ref = new Date()): OrderDateRange {
  const todayStart = startOfIstDay(ref);
  const todayEnd = endOfIstDay(ref);

  if (preset === "last_2_days") {
    const start = startOfIstDay(addIstDays(ref, -1));
    return { preset, startMs: start.getTime(), endMs: todayEnd.getTime() };
  }
  if (preset === "this_week") {
    const dow = istDayOfWeek(ref);
    const start = startOfIstDay(addIstDays(ref, -dow));
    return { preset, startMs: start.getTime(), endMs: todayEnd.getTime() };
  }
  if (preset === "last_week") {
    const dow = istDayOfWeek(ref);
    const thisWeekStart = startOfIstDay(addIstDays(ref, -dow));
    const lastWeekEnd = endOfIstDay(addIstDays(thisWeekStart, -1));
    const lastWeekStart = startOfIstDay(addIstDays(lastWeekEnd, -6));
    return { preset, startMs: lastWeekStart.getTime(), endMs: lastWeekEnd.getTime() };
  }
  if (preset === "last_30_days") {
    const start = startOfIstDay(addIstDays(ref, -29));
    return { preset, startMs: start.getTime(), endMs: todayEnd.getTime() };
  }
  return { preset: "custom", startMs: todayStart.getTime(), endMs: todayEnd.getTime() };
}

export const DEFAULT_HISTORY_DATE_RANGE = buildPresetRange("last_30_days");

export function presetLabel(preset: DateRangePresetId): string {
  switch (preset) {
    case "last_2_days":
      return "Last 2 days";
    case "this_week":
      return "This week";
    case "last_week":
      return "Last week";
    case "last_30_days":
      return "Last 30 days";
    default:
      return "Custom date range";
  }
}

export function presetSubtitle(preset: DateRangePresetId, ref = new Date()): string {
  const r = buildPresetRange(preset, ref);
  return formatRangeSubtitle(new Date(r.startMs), new Date(r.endMs));
}

export function orderInDateRange(iso: string, range: OrderDateRange): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= range.startMs && t <= range.endMs;
}

/** Compact one-line label for the date bar: "Last 30 days · 18 Apr - 17 May'26" */
export function formatDateBarLabel(range: OrderDateRange): string {
  const title = presetLabel(range.preset);
  const sub = formatRangeSubtitle(new Date(range.startMs), new Date(range.endMs));
  return `${title} · ${sub}`;
}

export const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

export function isWithinLast24Hours(createdAt: string, nowMs = Date.now()): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs - t <= TWENTY_FOUR_H_MS;
}

/** Live orders board: pending/active orders always visible; terminal orders only in last 24h. */
export function isVisibleOnLiveOrdersBoard(
  order: { createdAt: string; status: string },
  nowMs = Date.now()
): boolean {
  if (isActiveMerchantOrderStage(order.status)) return true;
  return isWithinLast24Hours(order.createdAt, nowMs);
}
