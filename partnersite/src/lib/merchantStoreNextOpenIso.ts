/**
 * Next scheduled open time — logic aligned with `backend/.../store-schedule-engine.ts`
 * (`getNextOpenIso`, `getNextOpenClose`, `isWithinOperatingHours`, `nowInStoreTz`).
 * Duplicated from dashboard for Partner Site store-operations countdown parity with backend.
 */

/** Default matches backend `store-schedule-engine.ts` (`STORE_TIMEZONE`). */
export const DEFAULT_STORE_TIMEZONE = "Asia/Kolkata";

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
  if (row[`${dayKey}_open`] !== true) return [];
  const slotDay = sameForAll ? "monday" : dayKey;
  const s1Start = parseTimeToMinutes(row[`${slotDay}_slot1_start`] as string);
  const s1End = parseTimeToMinutes(row[`${slotDay}_slot1_end`] as string);
  const s2Start = parseTimeToMinutes(row[`${slotDay}_slot2_start`] as string);
  const s2End = parseTimeToMinutes(row[`${slotDay}_slot2_end`] as string);
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

function formatCalendarDateInTz(ref: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ref);
  const y = parts.find((p) => p.type === "year")?.value ?? "0";
  const mo = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Map a wall-clock moment in `timeZone` to the corresponding UTC `Date` (iterative, DST-safe enough for partner scheduling). */
export function utcInstantFromWallClock(ymd: string, hm: string, timeZone: string): Date | null {
  const [Y, Mo, D] = ymd.split("-").map((s) => parseInt(s.trim(), 10));
  const segs = hm.split(":");
  const hh = parseInt(segs[0] ?? "0", 10);
  const mm = parseInt(segs[1] ?? "0", 10);
  const ss = segs[2] != null ? parseInt(segs[2], 10) : 0;
  if (![Y, Mo, D, hh, mm, ss].every((n) => Number.isFinite(n))) return null;
  let t = Date.UTC(Y, Mo - 1, D, hh, mm, ss, 0);
  for (let i = 0; i < 16; i++) {
    const d = new Date(t);
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const py = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
    const pmo = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10);
    const pd = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
    const ph = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    const pmi = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
    const psec = parseInt(parts.find((p) => p.type === "second")?.value ?? "0", 10);
    if (py === Y && pmo === Mo && pd === D && ph === hh && pmi === mm && psec === ss) return d;
    const want = Date.UTC(Y, Mo - 1, D, hh, mm, ss, 0);
    const got = Date.UTC(py, pmo - 1, pd, ph, pmi, psec, 0);
    t += want - got;
  }
  return new Date(t);
}

function addCalendarDaysInZone(ymd: string, days: number, timeZone: string): string {
  const anchor = utcInstantFromWallClock(ymd, "12:00:00", timeZone);
  if (!anchor) return ymd;
  const next = new Date(anchor.getTime() + days * 86400000);
  return formatCalendarDateInTz(next, timeZone);
}

/** Current time in `timeZone`: day of week (0–6 Sun–Sat) and minutes since midnight. */
export function nowInStoreTz(timeZone: string = DEFAULT_STORE_TIMEZONE): { dayOfWeek: number; minutesSinceMidnight: number } {
  const tz = timeZone || DEFAULT_STORE_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    // `hour12: false` alone leaves hourCycle unspecified; on some ICU builds it resolves to
    // "h24" (1-24) instead of "h23" (0-23), so midnight reads as hour=24 — pushing
    // minutesSinceMidnight 1440 too high for the whole 00:00-00:59 window. hourCycle alone
    // (no hour12) is required: if both are set, hour12 wins and hourCycle is ignored.
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const second = Number(parts.find((p) => p.type === "second")?.value ?? 0);
  const minutesSinceMidnight = hour * 60 + minute + second / 60;

  const dayFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" });
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
  const dayKey = DAY_NAMES[dayOfWeek];
  const closedDays = (row.closed_days as string[] | null) ?? [];
  if (closedDays.some((d) => String(d).trim().toLowerCase() === dayKey)) return false;
  if (row[`${dayKey}_open`] !== true) return false;
  const sameForAll = row.same_for_all_days === true;
  const is24 = row.is_24_hours === true;
  if (is24) return true;
  const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
  for (let i = 0; i < slots.length - 1; i++) {
    const gapStart = slots[i].endMin;
    const gapEnd = slots[i + 1].startMin;
    if (gapEnd > gapStart && minutesSinceMidnight >= gapStart && minutesSinceMidnight < gapEnd) {
      return false;
    }
  }
  for (const slot of slots) {
    // Strict half-open interval [startMin, endMin): store comes ONLINE at exactly startMin and
    // transitions OFFLINE at exactly endMin (e.g. 10:00 → ONLINE, 14:00 → OFFLINE, 17:00 → ONLINE,
    // 23:00 → OFFLINE). No end-of-slot grace buffer.
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight < slot.endMin) {
      return true;
    }
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
  if (closedDays.some((d) => String(d).trim().toLowerCase() === dayKey)) {
    const sameForAll = row.same_for_all_days === true;
    const slots = getSlotsForDay(row, sameForAll ? "monday" : dayKey, sameForAll);
    const first = slots.sort((a, b) => a.startMin - b.startMin)[0];
    if (first) out.next_open_time = minutesToTimeStr(first.startMin);
    return out;
  }
  const sameForAll = row.same_for_all_days === true;
  const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
  let withinSlot: Slot | null = null;
  for (const slot of slots) {
    if (minutesSinceMidnight >= slot.startMin && minutesSinceMidnight < slot.endMin) {
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

/** Next open moment as ISO (wall time in `timeZone`), skipping closed days. Returns null if 24h or no slots. */
export function getNextOpenIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  minutesSinceMidnight: number,
  refDate: Date,
  timeZone: string = DEFAULT_STORE_TIMEZONE
): string | null {
  const tz = timeZone || DEFAULT_STORE_TIMEZONE;
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatWallDate = (d: Date) => formatCalendarDateInTz(d, tz);

  const refWall = formatWallDate(refDate);
  const todayStr = refWall;

  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).trim().toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;

    if (dayOffset === 0) {
      // Already inside a slot → no future "next open" today. Returning tomorrow
      // was the bug that showed "Opens Sat 09:30" while still within Fri hours.
      const withinNow = slots.some(
        (s) => minutesSinceMidnight >= s.startMin && minutesSinceMidnight < s.endMin
      );
      if (withinNow) return null;

      const hasLaterSlotToday = slots.some((s) => s.startMin > minutesSinceMidnight);
      if (hasLaterSlotToday) {
        const slot = slots.find((s) => s.startMin > minutesSinceMidnight)!;
        const timeStr = minutesToTimeStr(slot.startMin);
        const dt = utcInstantFromWallClock(todayStr, `${timeStr}:00`, tz);
        return dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
      }
      continue;
    }

    const dateStr = addCalendarDaysInZone(todayStr, dayOffset, tz);
    const timeStr = minutesToTimeStr(slots[0].startMin);
    const dt = utcInstantFromWallClock(dateStr, `${timeStr}:00`, tz);
    return dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
  }
  return null;
}

/** First opening on a future calendar day in `timeZone` only — for "Close for today". */
export function getNextOpenIsoAfterIstCalendarDay(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date,
  timeZone: string = DEFAULT_STORE_TIMEZONE
): string | null {
  const tz = timeZone || DEFAULT_STORE_TIMEZONE;
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const sameForAll = row.same_for_all_days === true;
  const formatWallDate = (d: Date) => formatCalendarDateInTz(d, tz);
  const todayStr = formatWallDate(refDate);

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).trim().toLowerCase() === dayKey)) continue;
    const slots = getSlotsForDay(row, dayKey, sameForAll).sort((a, b) => a.startMin - b.startMin);
    if (slots.length === 0) continue;
    const firstStart = slots[0].startMin;
    const dateStr = addCalendarDaysInZone(todayStr, dayOffset, tz);
    const timeStr = minutesToTimeStr(firstStart);
    const dt = utcInstantFromWallClock(dateStr, `${timeStr}:00`, tz);
    return dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
  }
  return null;
}

export function getNextOpenDayStartIso(
  row: Record<string, unknown>,
  dayOfWeek: number,
  refDate: Date,
  timeZone: string = DEFAULT_STORE_TIMEZONE
): string | null {
  const tz = timeZone || DEFAULT_STORE_TIMEZONE;
  if (row.is_24_hours === true) return null;
  const closedDays = (row.closed_days as string[] | null) ?? [];
  const todayStr = formatCalendarDateInTz(refDate, tz);
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const checkDay = (dayOfWeek + dayOffset) % 7;
    const dayKey = DAY_NAMES[checkDay];
    if (closedDays.some((d) => String(d).trim().toLowerCase() === dayKey)) continue;
    const dateStr = addCalendarDaysInZone(todayStr, dayOffset, tz);
    const dt = utcInstantFromWallClock(dateStr, "00:00:00", tz);
    return dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
  }
  return null;
}

/** True if `untilIso` is the same calendar day as `ref` in `timeZone` and at/after 23:59 (legacy “close for today” EOD). */
export function isLikelyLegacyEndOfDayIstClose(untilIso: string, ref: Date, timeZone: string = DEFAULT_STORE_TIMEZONE): boolean {
  const tz = timeZone || DEFAULT_STORE_TIMEZONE;
  const until = new Date(untilIso);
  if (Number.isNaN(until.getTime())) return false;
  const dFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const tFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
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
