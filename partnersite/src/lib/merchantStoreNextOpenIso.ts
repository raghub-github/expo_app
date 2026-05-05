/**
 * Next scheduled open time (IST) — logic aligned with `backend/.../store-schedule-engine.ts`
 * (`getNextOpenIso`, `getNextOpenClose`, `isWithinOperatingHours`, `nowInStoreTz`).
 * Duplicated from dashboard for Partner Site store-operations countdown parity with backend.
 */

/** Default matches backend `store-schedule-engine.ts` (`STORE_TIMEZONE`). */
export const DEFAULT_STORE_TIMEZONE = "Asia/Kolkata";
const GRACE_BUFFER_SECONDS = 30;

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

type Slot = { startMin: number; endMin: number };

function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (t == null || typeof t !== "string") return null;
  const s = String(t).trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return null;
  const h = Math.min(23, Math.max(0, Number(match[1]) || 0));
  const m = Math.min(59, Math.max(0, Number(match[2]) || 0));
  const sec = match[3] != null ? Math.min(59, Math.max(0, Number(match[3]) || 0)) : 0;
  return h * 60 + m + sec / 60;
}

function getSlotsForDay(row: Record<string, unknown>, dayKey: string, sameForAll: boolean): Slot[] {
  const day = sameForAll ? "monday" : dayKey;
  const open = row[`${day}_open`] === true;
  if (!open) return [];
  const s1Start = parseTimeToMinutes(row[`${day}_slot1_start`] as string);
  const s1End = parseTimeToMinutes(row[`${day}_slot1_end`] as string);
  const s2Start = parseTimeToMinutes(row[`${day}_slot2_start`] as string);
  const s2End = parseTimeToMinutes(row[`${day}_slot2_end`] as string);
  const slots: Slot[] = [];
  if (s1Start != null && s1End != null && s1End > s1Start) slots.push({ startMin: s1Start, endMin: s1End });
  if (s2Start != null && s2End != null && s2End > s2Start) slots.push({ startMin: s2Start, endMin: s2End });
  return slots;
}

function minutesToTimeStr(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Current time in IST: day of week (0–6 Sun–Sat) and minutes since midnight (aligned with backend schedule engine). */
export function nowInStoreTz(): { dayOfWeek: number; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_STORE_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute + second / 60;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_STORE_TIMEZONE, weekday: "short" });
  const dayShort = dayFormatter.format(new Date()).toLowerCase();
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  const dayOfWeek = dayMap[dayShort.slice(0, 3)] ?? 0;
  return { dayOfWeek, minutesSinceMidnight };
}

export function isWithinOperatingHours(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number
): boolean {
  const is24 = row.is_24_hours === true;
  if (is24) return true;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const dayKey = DAY_NAMES[dayOfWeek];
  if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) return false;
  const sameForAll = row.same_for_all_days === true;
  const slots = getSlotsForDay(row, dayKey, sameForAll);
  const endGrace = GRACE_BUFFER_SECONDS / 60;
  for (const slot of slots) {
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight <= slot.endMin + endGrace) return true;
  }
  return false;
}

export type NextOpenClose = {
  next_open_time: string | null;
  next_close_time: string | null;
};

export function getNextOpenClose(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number
): NextOpenClose {
  const out: NextOpenClose = { next_open_time: null, next_close_time: null };
  if (row.is_24_hours === true) return out;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const dayKey = DAY_NAMES[dayOfWeek];
  if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) {
    const sameForAll = row.same_for_all_days === true;
    const slots = getSlotsForDay(row, sameForAll ? "monday" : dayKey, sameForAll);
    const first = slots.sort((a, b) => a.startMin - b.startMin)[0];
    if (first) out.next_open_time = minutesToTimeStr(first.startMin);
    return out;
  }
  const sameForAll = row.same_for_all_days === true;
  const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
  const endGrace = GRACE_BUFFER_SECONDS / 60;
  let withinSlot: Slot | null = null;
  for (const slot of slots) {
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight <= slot.endMin + endGrace) {
      withinSlot = slot;
      break;
    }
  }
  if (withinSlot) {
    out.next_close_time = minutesToTimeStr(withinSlot.endMin);
    return out;
  }
  for (const slot of slots) {
    if (slot.startMin > minutesSinceMidnight) {
      out.next_open_time = minutesToTimeStr(slot.startMin);
      return out;
    }
  }
  if (slots.length > 0) out.next_open_time = minutesToTimeStr(slots[0].startMin);
  return out;
}

/** Next open moment as ISO (IST wall time), skipping closed days. Returns null if 24h or no slots. */
export function getNextOpenIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const addDaysInIst = (dateStr: string, days: number): string => {
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    const firstStart = slots[0].startMin;

    if (dayOffset === 0) {
      const hasLaterSlotToday = slots.some((s) => s.startMin > minutesSinceMidnight);
      if (hasLaterSlotToday) {
        const slot = slots.find((s) => s.startMin > minutesSinceMidnight)!;
        const timeStr = minutesToTimeStr(slot.startMin);
        const isoInIst = `${todayStr}T${timeStr}:00+05:30`;
        const dt = new Date(isoInIst);
        return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
      }
      continue;
    }

    const dateStr = addDaysInIst(todayStr, dayOffset);
    const timeStr = minutesToTimeStr(firstStart);
    const isoInIst = `${dateStr}T${timeStr}:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

/** First opening on a future IST calendar day only — for "Close for today" (skip slots later today). */
export function getNextOpenIsoAfterIstCalendarDay(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const addDaysInIst = (dateStr: string, days: number): string => {
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    const firstStart = slots[0].startMin;
    const dateStr = addDaysInIst(todayStr, dayOffset);
    const timeStr = minutesToTimeStr(firstStart);
    const isoInIst = `${dateStr}T${timeStr}:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

export function getNextOpenDayStartIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date
): string | null {
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const formatIstDate = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_STORE_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "0";
    const mo = parts.find((p) => p.type === "month")?.value ?? "01";
    const day = parts.find((p) => p.type === "day")?.value ?? "01";
    return { y, m: mo.padStart(2, "0"), d: day.padStart(2, "0") };
  };
  const refIst = formatIstDate(refDate);
  const todayStr = `${refIst.y}-${refIst.m}-${refIst.d}`;
  const addDays = (dateStr: string, days: number): string => {
    const d = new Date(`${dateStr}T00:00:00+05:30`);
    d.setTime(d.getTime() + days * 86400 * 1000);
    const p = formatIstDate(d);
    return `${p.y}-${p.m}-${p.d}`;
  };
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).toLowerCase() === dayKey)) continue;
    const dateStr = addDays(todayStr, dayOffset);
    const isoInIst = `${dateStr}T00:00:00+05:30`;
    const dt = new Date(isoInIst);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  return null;
}

/** True if `untilIso` is the same IST calendar day as `ref` and at/after 23:59 (legacy “close for today” EOD). */
export function isLikelyLegacyEndOfDayIstClose(untilIso: string, ref: Date): boolean {
  const until = new Date(untilIso);
  if (Number.isNaN(until.getTime())) return false;
  const dFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_STORE_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const tFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_STORE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const du = dFmt.format(until);
  const dr = dFmt.format(ref);
  if (du !== dr) return false;
  const tp = tFmt.formatToParts(until);
  const hh = Number(tp.find((p) => p.type === "hour")?.value ?? 0);
  const mm = Number(tp.find((p) => p.type === "minute")?.value ?? 0);
  return hh > 23 || (hh === 23 && mm >= 59);
}
