/**
 * Centralized Store Status / Schedule Engine for Partner Site.
 * Logic aligned with `backend/src/modules/merchant-partner/store-schedule-engine.ts`.
 * All time checks use the store timezone and `merchant_store_operating_hours`.
 */

import {
  DEFAULT_STORE_TIMEZONE,
  getNextOpenDayStartIso,
  getNextOpenIso,
  getNextOpenIsoAfterIstCalendarDay,
  isLikelyLegacyEndOfDayIstClose,
  isWithinOperatingHours,
  nowInStoreTz,
  utcInstantFromWallClock,
} from '@/lib/merchantStoreNextOpenIso';
import { normalizeWallTimeToHHMM } from '@/lib/wallTimeHHMM';

export const DAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type DayName = (typeof DAY_NAMES)[number];

export type SchedulePhase =
  | 'OFF_DAY'
  | 'BREAK'
  | 'PRE_BREAK'
  | 'WITHIN_SLOT'
  | 'OUTSIDE_HOURS'
  | 'NO_HOURS';

/** Show “break starts in” countdown this many minutes before slot 1 ends / break begins. */
export const PRE_BREAK_LEAD_MINUTES = 1;

export type BreakWindow = {
  breakStartMin: number;
  breakEndMin: number;
  slot2StartHm: string;
};

export type ScheduleCountdownKind =
  | 'break_starts_in'
  | 'reopens_in'
  | 'opens_in'
  | 'next_online_in'
  | null;

export type WallSlot = { start: string; end: string };

export type ScheduleEvaluation = {
  dayOfWeek: number;
  dayName: DayName;
  todayDate: string;
  /** Minutes since midnight in store timezone at evaluation time. */
  minutesSinceMidnight: number;
  /** Active slots only (empty when today is scheduled closed). */
  todaySlots: WallSlot[];
  /** Slot times saved in DB for today (shown on card even when scheduled closed). */
  configuredTodaySlots: WallSlot[];
  activeSlot: WallSlot | null;
  nextSlotToday: WallSlot | null;
  schedulePhase: SchedulePhase;
  withinOperatingHours: boolean;
  isTodayScheduledClosed: boolean;
  hasOperatingHoursRow: boolean;
};

/**
 * Slot-end grace (minutes) used by helpers like `isPastLastSlotEndToday`. Kept at 0 so the
 * store transitions to CLOSED at exactly the configured slot end (parity with
 * `isWithinOperatingHours` in `merchantStoreNextOpenIso.ts`).
 *
 * All slot boundaries are read from `merchant_store_operating_hours` (`<day>_slot1_start`,
 * `<day>_slot1_end`, `<day>_slot2_start`, `<day>_slot2_end`); no time literals are hardcoded.
 */
const END_OF_LAST_SLOT_GRACE_MIN = 0;

function sortedTodaySlots(slots: WallSlot[]): WallSlot[] {
  return [...slots].sort(
    (a, b) => (wallClockMinutes(a.start) ?? 0) - (wallClockMinutes(b.start) ?? 0)
  );
}

/** True when current time is before today's first operating slot. */
export function isBeforeFirstSlotToday(
  schedule: Pick<ScheduleEvaluation, 'todaySlots' | 'isTodayScheduledClosed'>,
  minutesSinceMidnight: number
): boolean {
  if (schedule.isTodayScheduledClosed || schedule.todaySlots.length === 0) return false;
  const firstStart = wallClockMinutes(sortedTodaySlots(schedule.todaySlots)[0].start);
  return firstStart != null && minutesSinceMidnight < firstStart;
}

/** True when current wall-clock minute is at or past the last configured slot end (inclusive). */
export function isPastLastSlotEndToday(
  schedule: Pick<ScheduleEvaluation, 'todaySlots'>,
  minutesSinceMidnight: number
): boolean {
  if (schedule.todaySlots.length === 0) return false;
  const last = sortedTodaySlots(schedule.todaySlots).at(-1);
  if (!last) return false;
  const lastEnd = wallClockMinutes(last.end);
  return lastEnd != null && minutesSinceMidnight >= lastEnd + END_OF_LAST_SLOT_GRACE_MIN;
}

/**
 * How to close an OPEN store that is outside operating hours. Always returns `immediate`:
 * we want the store to transition OFFLINE the instant the wall-clock leaves an active slot
 * (slot 1 end, mid-day gap, after final slot, before slot 1 next day). No 5-minute prompt.
 *
 * The `is_manual_override` flag (set when the merchant explicitly turned the store ON outside
 * its schedule) is checked separately in `syncOperationalStatusFromSchedule` and bypasses the
 * auto-close. Vacation and scheduled-off days are hard limits and cannot be overridden.
 */
export function getOutsideHoursClosePolicy(schedule: ScheduleEvaluation): 'immediate' {
  void schedule;
  return 'immediate';
}

export function normalizeStoreTimezone(tz: string | null | undefined): string {
  const raw = typeof tz === 'string' ? tz.trim() : '';
  if (!raw) return DEFAULT_STORE_TIMEZONE;
  if (raw.toLowerCase() === 'ist') return DEFAULT_STORE_TIMEZONE;
  return raw;
}

/** Only explicit `false` disables schedule automation (DB default / legacy rows are treated as enabled). */
export function isAutoOpenFromScheduleEnabled(
  value: boolean | null | undefined
): boolean {
  return value !== false;
}

function wallClockMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Slot template day when `same_for_all_days` (timings copied from Monday). */
function getSlotTemplateDay(row: Record<string, unknown>, dayName: DayName): DayName {
  return row.same_for_all_days === true ? 'monday' : dayName;
}

/** Whether this calendar weekday is open (always uses that day's `_open`, not Monday template). */
export function isCalendarDayMarkedOpen(
  oh: Record<string, unknown>,
  dayName: DayName
): boolean {
  return oh[`${dayName}_open`] === true;
}

const DAY_NAME_ALIASES: Record<string, DayName> = {
  sun: 'sunday',
  sunday: 'sunday',
  mon: 'monday',
  monday: 'monday',
  tue: 'tuesday',
  tuesday: 'tuesday',
  wed: 'wednesday',
  wednesday: 'wednesday',
  thu: 'thursday',
  thursday: 'thursday',
  fri: 'friday',
  friday: 'friday',
  sat: 'saturday',
  saturday: 'saturday',
};

/** Normalize DB `closed_days` (supports monday, Monday, mon, etc.). */
export function normalizeClosedDaysList(raw: unknown): DayName[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: DayName[] = [];
  for (const item of raw) {
    const key = String(item).trim().toLowerCase();
    const day = DAY_NAME_ALIASES[key] ?? (DAY_NAMES.includes(key as DayName) ? (key as DayName) : null);
    if (day && !out.includes(day)) out.push(day);
  }
  return out;
}

function readSlotPair(
  oh: Record<string, unknown>,
  day: DayName,
  slot: 1 | 2
): { start: string | null; end: string | null } {
  const prefix = getSlotTemplateDay(oh, day);
  return {
    start: normalizeWallTimeToHHMM(oh[`${prefix}_slot${slot}_start`]),
    end: normalizeWallTimeToHHMM(oh[`${prefix}_slot${slot}_end`]),
  };
}

function pairOk(start: string | null, end: string | null): boolean {
  if (start == null || end == null) return false;
  if (start === '00:00' && end === '00:00') return false;
  const s = wallClockMinutes(start);
  const e = wallClockMinutes(end);
  return s != null && e != null && e > s;
}

function collectSlotPairs(oh: Record<string, unknown>, dayName: DayName): WallSlot[] {
  if (oh.is_24_hours === true) {
    return [{ start: '00:00', end: '23:59' }];
  }
  const slots: WallSlot[] = [];
  const s1 = readSlotPair(oh, dayName, 1);
  const s2 = readSlotPair(oh, dayName, 2);
  if (pairOk(s1.start, s1.end) && s1.start && s1.end) {
    slots.push({ start: s1.start, end: s1.end });
  }
  if (pairOk(s2.start, s2.end) && s2.start && s2.end) {
    slots.push({ start: s2.start, end: s2.end });
  }
  return slots.sort((a, b) => {
    const sa = wallClockMinutes(a.start) ?? 0;
    const sb = wallClockMinutes(b.start) ?? 0;
    return sa - sb;
  });
}

/** Slot times stored in DB for display (ignores whether the day is marked open/closed). */
export function getConfiguredSlotsForDayName(
  oh: Record<string, unknown>,
  dayName: DayName
): WallSlot[] {
  return collectSlotPairs(oh, dayName);
}

/**
 * Slot times for UI when the store is closed — includes fallbacks so the card never shows "—"
 * when outlet timings exist on another weekday or on the Monday template (`same_for_all_days`).
 */
export function getConfiguredSlotsForDayDisplay(
  oh: Record<string, unknown>,
  dayName: DayName
): WallSlot[] {
  const direct = collectSlotPairs(oh, dayName);
  if (direct.length > 0) return direct;

  if (oh.same_for_all_days === true) {
    const mondaySlots = collectSlotPairs(oh, 'monday');
    if (mondaySlots.length > 0) return mondaySlots;
  }

  for (const d of DAY_NAMES) {
    if (d === dayName) continue;
    const slots = collectSlotPairs(oh, d);
    if (slots.length > 0) return slots;
  }

  return [];
}

/** Slots for schedule logic — only when the calendar day is marked open. */
export function getSlotsForDayName(
  oh: Record<string, unknown>,
  dayName: DayName
): WallSlot[] {
  if (!isCalendarDayMarkedOpen(oh, dayName)) return [];
  return collectSlotPairs(oh, dayName);
}

/** True when the day has real operating time (not placeholder slots). */
export function hasValidOperatingSlotsForDay(
  oh: Record<string, unknown>,
  dayName: DayName
): boolean {
  if (!isCalendarDayMarkedOpen(oh, dayName)) return false;
  if (oh.is_24_hours === true) return true;
  return getSlotsForDayName(oh, dayName).length > 0;
}

/** Scheduled closed: closed_days, day flag off, or open with no valid slots. */
export function isDayScheduledClosed(
  oh: Record<string, unknown>,
  dayName: DayName
): boolean {
  const closedDays = normalizeClosedDaysList(oh.closed_days);
  if (closedDays.includes(dayName)) return true;
  if (!isCalendarDayMarkedOpen(oh, dayName)) return true;
  return !hasValidOperatingSlotsForDay(oh, dayName);
}

export function formatTodayDateInTz(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Slot1 end → slot2 start gap (break window), if configured. */
export function getBreakWindow(
  oh: Record<string, unknown>,
  dayName: DayName
): BreakWindow | null {
  if (isDayScheduledClosed(oh, dayName)) return null;
  const s1 = readSlotPair(oh, dayName, 1);
  const s2 = readSlotPair(oh, dayName, 2);
  if (!pairOk(s1.start, s1.end) || !s2.start) return null;
  const e1 = wallClockMinutes(s1.end);
  const s2m = wallClockMinutes(s2.start);
  if (e1 == null || s2m == null || s2m <= e1) return null;
  return { breakStartMin: e1, breakEndMin: s2m, slot2StartHm: s2.start };
}

/** Last N minutes of slot 1 before the break gap (store may still be online). */
export function isInPreBreakWindow(
  oh: Record<string, unknown>,
  dayName: DayName,
  minutesSinceMidnight: number,
  leadMinutes: number = PRE_BREAK_LEAD_MINUTES
): boolean {
  const w = getBreakWindow(oh, dayName);
  if (!w) return false;
  return (
    minutesSinceMidnight >= w.breakStartMin - leadMinutes &&
    minutesSinceMidnight < w.breakStartMin
  );
}

/** Detect mid-day gap between slot1 end and slot2 start. */
export function isInBreakBetweenSlots(
  oh: Record<string, unknown>,
  dayName: DayName,
  minutesSinceMidnight: number
): boolean {
  if (isDayScheduledClosed(oh, dayName)) return false;
  const s1 = readSlotPair(oh, dayName, 1);
  const s2 = readSlotPair(oh, dayName, 2);
  if (!pairOk(s1.start, s1.end)) return false;
  const e1 = wallClockMinutes(s1.end);
  const s2m = wallClockMinutes(s2.start);
  if (e1 == null || s2m == null || s2m <= e1) return false;
  return minutesSinceMidnight >= e1 && minutesSinceMidnight < s2m;
}

function findActiveSlot(
  slots: WallSlot[],
  minutesSinceMidnight: number,
  withinHours: boolean
): WallSlot | null {
  if (!withinHours || slots.length === 0) return null;
  const sorted = [...slots].sort((a, b) => {
    const sa = wallClockMinutes(a.start) ?? 0;
    const sb = wallClockMinutes(b.start) ?? 0;
    return sa - sb;
  });
  for (const slot of sorted) {
    const s = wallClockMinutes(slot.start);
    const e = wallClockMinutes(slot.end);
    if (s == null || e == null) continue;
    // Strict half-open interval [s, e) so the active slot ends exactly at e (e.g. 14:00 / 23:00).
    if (minutesSinceMidnight >= s && minutesSinceMidnight < e) return slot;
  }
  return null;
}

function findNextSlotToday(
  slots: WallSlot[],
  minutesSinceMidnight: number
): WallSlot | null {
  for (const slot of slots) {
    const s = wallClockMinutes(slot.start);
    if (s != null && s > minutesSinceMidnight) return slot;
  }
  return null;
}

export function evaluateStoreSchedule(
  oh: Record<string, unknown> | null,
  storeTimezone: string,
  refNow: Date = new Date()
): ScheduleEvaluation {
  const tz = normalizeStoreTimezone(storeTimezone);
  const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(tz);
  const dayName = DAY_NAMES[dayOfWeek];
  const todayDate = formatTodayDateInTz(refNow, tz);

  if (!oh || Object.keys(oh).length === 0) {
    return {
      dayOfWeek,
      dayName,
      todayDate,
      minutesSinceMidnight,
      todaySlots: [],
      configuredTodaySlots: [],
      activeSlot: null,
      nextSlotToday: null,
      schedulePhase: 'NO_HOURS',
      withinOperatingHours: false,
      isTodayScheduledClosed: true,
      hasOperatingHoursRow: false,
    };
  }

  const configuredTodaySlots = getConfiguredSlotsForDayDisplay(oh, dayName);
  const isTodayScheduledClosed = isDayScheduledClosed(oh, dayName);
  const todaySlots = isTodayScheduledClosed ? [] : getSlotsForDayName(oh, dayName);
  const inBreakBetweenSlots =
    !isTodayScheduledClosed && isInBreakBetweenSlots(oh, dayName, minutesSinceMidnight);
  const withinOperatingHours = isTodayScheduledClosed
    ? false
    : inBreakBetweenSlots
      ? false
      : isWithinOperatingHours(oh, dayOfWeek, minutesSinceMidnight);
  const inPreBreakWindow =
    !isTodayScheduledClosed &&
    !inBreakBetweenSlots &&
    withinOperatingHours &&
    isInPreBreakWindow(oh, dayName, minutesSinceMidnight);

  let schedulePhase: SchedulePhase;
  if (isTodayScheduledClosed) {
    schedulePhase = 'OFF_DAY';
  } else if (inBreakBetweenSlots) {
    schedulePhase = 'BREAK';
  } else if (inPreBreakWindow) {
    schedulePhase = 'PRE_BREAK';
  } else if (withinOperatingHours) {
    schedulePhase = 'WITHIN_SLOT';
  } else if (todaySlots.length === 0) {
    schedulePhase = 'NO_HOURS';
  } else {
    schedulePhase = 'OUTSIDE_HOURS';
  }

  const activeSlot = findActiveSlot(todaySlots, minutesSinceMidnight, withinOperatingHours);
  const nextSlotToday = findNextSlotToday(todaySlots, minutesSinceMidnight);

  return {
    dayOfWeek,
    dayName,
    todayDate,
    minutesSinceMidnight,
    todaySlots,
    configuredTodaySlots,
    activeSlot,
    nextSlotToday,
    schedulePhase,
    withinOperatingHours,
    isTodayScheduledClosed,
    hasOperatingHoursRow: true,
  };
}

export function schedulePhaseLabel(phase: SchedulePhase): string {
  switch (phase) {
    case 'OFF_DAY':
      return 'Today Closed (Scheduled Closed)';
    case 'BREAK':
      return 'Break between slots';
    case 'PRE_BREAK':
      return 'Break starting soon';
    case 'WITHIN_SLOT':
      return 'Within operating hours';
    case 'OUTSIDE_HOURS':
      return 'Outside operating hours';
    case 'NO_HOURS':
      return 'No hours configured';
    default:
      return '';
  }
}

export function computeOpensAtIso(args: {
  oh: Record<string, unknown> | null;
  storeTimezone: string;
  displayOperational: 'OPEN' | 'CLOSED';
  manualCloseUntil: Date | null;
  blockAutoOpen: boolean;
  unavailableReason: string | null;
  schedule: ScheduleEvaluation;
  refNow?: Date;
}): string | null {
  const {
    oh,
    storeTimezone,
    displayOperational,
    manualCloseUntil,
    blockAutoOpen,
    unavailableReason,
    schedule,
  } = args;
  const refNow = args.refNow ?? new Date();
  const tz = normalizeStoreTimezone(storeTimezone);

  if (displayOperational === 'OPEN') return null;

  // Already inside today's slot with no manual hold — do not advertise tomorrow's open.
  // Backend tick / partner-status should flip OPEN; UI must not show a 24h countdown.
  if (
    schedule.withinOperatingHours &&
    !blockAutoOpen &&
    !manualCloseUntil &&
    (unavailableReason?.trim().toLowerCase() ?? '') !== 'manual_indefinite'
  ) {
    return null;
  }

  const manualIso = manualCloseUntil ? manualCloseUntil.toISOString() : null;
  const unavailNorm = unavailableReason?.trim().toLowerCase() ?? '';

  if (blockAutoOpen) return null;
  if (!manualIso && unavailNorm === 'manual_indefinite') return null;

  const ohRecord = oh && Object.keys(oh).length > 0 ? oh : null;
  const { dayOfWeek, minutesSinceMidnight } = nowInStoreTz(tz);

  let nextOpenIso: string | null = null;
  if (ohRecord) {
    nextOpenIso =
      getNextOpenIso(ohRecord, dayOfWeek, minutesSinceMidnight, refNow, tz) ??
      getNextOpenDayStartIso(ohRecord, dayOfWeek, refNow, tz);
  }

  const nextOpenIsoAfterToday =
    ohRecord != null
      ? getNextOpenIsoAfterIstCalendarDay(ohRecord, dayOfWeek, refNow, tz) ??
        getNextOpenDayStartIso(ohRecord, dayOfWeek, refNow, tz)
      : null;

  if (manualIso) {
    if (isLikelyLegacyEndOfDayIstClose(manualIso, refNow, tz)) {
      return nextOpenIsoAfterToday ?? nextOpenIso ?? manualIso;
    }
    return manualIso;
  }

  if (
    (schedule.schedulePhase === 'BREAK' || schedule.schedulePhase === 'PRE_BREAK') &&
    schedule.nextSlotToday
  ) {
    const dt = utcInstantFromWallClock(
      schedule.todayDate,
      `${schedule.nextSlotToday.start}:00`,
      tz
    );
    if (dt && !Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  return nextOpenIso;
}

function wallHmFromMinutes(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const mi = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

function wallClockLabelFromIso(iso: string, tz: string): string | null {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: tz,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
}

/** Live countdown target for dashboard (break pre-alert, break reopen, next slot, off-day). */
export function computeScheduleCountdown(args: {
  oh: Record<string, unknown> | null;
  storeTimezone: string;
  schedule: ScheduleEvaluation;
  displayOperational: 'OPEN' | 'CLOSED';
  opensAtIso: string | null;
  refNow?: Date;
}): { at: string | null; kind: ScheduleCountdownKind; wallLabel: string | null } {
  const { schedule, displayOperational, opensAtIso } = args;
  const tz = normalizeStoreTimezone(args.storeTimezone);
  const oh = args.oh && Object.keys(args.oh).length > 0 ? args.oh : null;

  if (oh && schedule.schedulePhase === 'PRE_BREAK') {
    const w = getBreakWindow(oh, schedule.dayName);
    if (w) {
      const dt = utcInstantFromWallClock(
        schedule.todayDate,
        `${wallHmFromMinutes(w.breakStartMin)}:00`,
        tz
      );
      const at = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
      return {
        at,
        kind: 'break_starts_in',
        wallLabel: at ? wallClockLabelFromIso(at, tz) : null,
      };
    }
  }

  if (schedule.schedulePhase === 'BREAK' && schedule.nextSlotToday) {
    const dt = utcInstantFromWallClock(
      schedule.todayDate,
      `${schedule.nextSlotToday.start}:00`,
      tz
    );
    const at = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString() : null;
    return {
      at,
      kind: 'reopens_in',
      wallLabel: at ? wallClockLabelFromIso(at, tz) : null,
    };
  }

  if (displayOperational === 'CLOSED' && opensAtIso) {
    return {
      at: opensAtIso,
      kind: schedule.schedulePhase === 'OFF_DAY' ? 'next_online_in' : 'opens_in',
      wallLabel: wallClockLabelFromIso(opensAtIso, tz),
    };
  }

  return { at: null, kind: null, wallLabel: null };
}

/** Transition candidate offset past slot end (0 = transition fires exactly at slot end). */
const SLOT_END_GRACE_MIN = 0;

/**
 * Earliest UTC instant when schedule phase may change (slot start/end, break boundaries).
 * Used by the dashboard to poll aggressively near transitions.
 */
export function computeNextScheduleTransitionIso(
  oh: Record<string, unknown> | null,
  storeTimezone: string,
  schedule: ScheduleEvaluation,
  refNow: Date = new Date()
): string | null {
  if (!oh || Object.keys(oh).length === 0) return null;
  const tz = normalizeStoreTimezone(storeTimezone);
  const ymd = schedule.todayDate;
  const candidates: number[] = [];

  const addWall = (hm: string) => {
    const dt = utcInstantFromWallClock(ymd, `${hm}:00`, tz);
    if (dt && dt.getTime() > refNow.getTime()) candidates.push(dt.getTime());
  };

  if (schedule.isTodayScheduledClosed) {
    const next = computeOpensAtIso({
      oh,
      storeTimezone: tz,
      displayOperational: 'CLOSED',
      manualCloseUntil: null,
      blockAutoOpen: false,
      unavailableReason: null,
      schedule,
      refNow,
    });
    return next;
  }

  const breakWin = getBreakWindow(oh, schedule.dayName);
  const slotCount = schedule.todaySlots.length;

  for (let i = 0; i < schedule.todaySlots.length; i++) {
    const slot = schedule.todaySlots[i];
    addWall(slot.start);
    const endMin = wallClockMinutes(slot.end);
    if (endMin == null) continue;
    const isLast = i === slotCount - 1;
    if (isLast) {
      const endHm = minutesToWallHm(endMin + SLOT_END_GRACE_MIN);
      if (endHm) addWall(endHm);
    } else if (breakWin && endMin === breakWin.breakStartMin) {
      const preBreakHm = minutesToWallHm(endMin - PRE_BREAK_LEAD_MINUTES);
      if (preBreakHm) addWall(preBreakHm);
      const breakStartHm = minutesToWallHm(endMin);
      if (breakStartHm) addWall(breakStartHm);
    } else {
      const endHm = minutesToWallHm(endMin);
      if (endHm) addWall(endHm);
    }
  }

  if (breakWin) {
    const reopenHm = minutesToWallHm(breakWin.breakEndMin);
    if (reopenHm) addWall(reopenHm);
  } else if (schedule.schedulePhase === 'BREAK' && schedule.nextSlotToday) {
    addWall(schedule.nextSlotToday.start);
  }

  if (candidates.length === 0) {
    return (
      getNextOpenIso(oh, schedule.dayOfWeek, schedule.minutesSinceMidnight, refNow, tz) ??
      getNextOpenDayStartIso(oh, schedule.dayOfWeek, refNow, tz)
    );
  }
  return new Date(Math.min(...candidates)).toISOString();
}

function minutesToWallHm(min: number): string | null {
  if (!Number.isFinite(min)) return null;
  const h = Math.floor(min / 60) % 24;
  const mi = Math.floor(min % 60);
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}
