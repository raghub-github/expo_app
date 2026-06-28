/**
 * Rider-facing incentive program listing (visibility + progress snapshot).
 */

import { getSql } from "../db/client.js";
import { getRiderSubscriptionStatus } from "../modules/rider/rider-subscription.service.js";
import { ensureIncentiveProgramSlotColumns } from "./ensure-incentive-program-slot-columns.js";
import { programMatchesRiderGeo, resolveRiderStateRef } from "./rider-incentive-geo.js";

const IST_OFFSET = "+05:30";

export type RiderIncentiveCategory = "incentive" | "surge" | "peak";

export type RiderIncentiveTier = {
  tierNo: number;
  minOrders: number;
  rewardAmount: number;
  unlocked: boolean;
  isCurrent: boolean;
};

export type RiderIncentiveTimeWindow = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  durationLabel: string;
  completed: boolean;
};

export type RiderIncentiveProgramItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: RiderIncentiveCategory;
  service: string;
  recurrenceType: string;
  isLive: boolean;
  isSpecialDay: boolean;
  riderStatus: string;
  lockedReason: string | null;
  requiresGmitraMax: boolean;
  cycleLabel: string;
  cycleStartAt: string;
  cycleEndAt: string;
  maxReward: number;
  completedOrders: number;
  projectedReward: number | null;
  tiers: RiderIncentiveTier[];
  timeWindows: RiderIncentiveTimeWindow[];
  mandatoryLoginSlots: number;
  mandatoryLoginCompleted: number;
  minLoginDays: number | null;
};

export type RiderIncentiveFilterChip = {
  key: string;
  label: string;
  count: number;
};

export type RiderIncentiveListResult = {
  date: string;
  dateBadges: Record<string, string>;
  filters: RiderIncentiveFilterChip[];
  programs: RiderIncentiveProgramItem[];
};

type ProgramRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service: string;
  vehicle_type: string | null;
  start_at: string;
  end_at: string;
  timezone: string;
  recurrence_type: string;
  slot_mode: string;
  slot_day_mode: string;
  active_days: unknown;
  geo_scope_mode: string;
  requires_gmitra_max: boolean;
  show_to_non_subscribers: boolean;
  show_before_eligible: boolean;
  reward_type: string;
  calendar_badges: unknown;
};

type TierRow = {
  tier_no: number;
  min_orders: number | null;
  reward_amount: string | number;
};

type WindowRow = {
  id: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  label: string | null;
};

type ProgressRow = {
  id: string;
  completed_orders: number;
  projected_reward: string | number | null;
  rider_status: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatIstDateLabel(dateStr: string, isToday: boolean): string {
  const d = new Date(`${dateStr}T12:00:00${IST_OFFSET}`);
  const day = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  return isToday ? `Today, ${day}` : day;
}

function todayIstDateStr(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function parseDateParam(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todayIstDateStr();
}

function dayOfWeekIst(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00${IST_OFFSET}`);
  return d.getUTCDay();
}

function parseActiveDays(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number).filter(Number.isFinite);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(Number).filter(Number.isFinite);
    } catch {
      /* ignore */
    }
  }
  return [];
}

function resolveActiveDays(mode: string, activeDays: unknown): number[] {
  const days = parseActiveDays(activeDays);
  switch (mode) {
    case "weekdays":
      return [1, 2, 3, 4, 5];
    case "weekends":
      return [0, 6];
    case "specific_days":
      return days;
    default:
      return [0, 1, 2, 3, 4, 5, 6];
  }
}

function isDateActiveForProgram(row: ProgramRow, dateStr: string): boolean {
  const start = new Date(row.start_at).getTime();
  const end = new Date(row.end_at).getTime();
  const dayStart = new Date(`${dateStr}T00:00:00${IST_OFFSET}`).getTime();
  const dayEnd = new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`).getTime();
  if (dayEnd < start || dayStart > end) return false;

  const dow = dayOfWeekIst(dateStr);
  return resolveActiveDays(row.slot_day_mode, row.active_days).includes(dow);
}

type CalendarBadgeEntry = { date: string; label: string };

function parseCalendarBadges(value: unknown): CalendarBadgeEntry[] {
  if (!Array.isArray(value)) return [];
  const rows: CalendarBadgeEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const date = String(rec.date ?? "").trim();
    const label = String(rec.label ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) continue;
    rows.push({ date, label: label.slice(0, 24) });
  }
  return rows;
}

function buildCurrentWeekDates(anchorDateStr: string): string[] {
  const d = new Date(`${anchorDateStr}T12:00:00${IST_OFFSET}`);
  const weekStartOffset = d.getUTCDay();
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(d);
    day.setUTCDate(d.getUTCDate() - weekStartOffset + i);
    dates.push(day.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  }
  return dates;
}

function programVisibleToRider(
  row: Pick<ProgramRow, "requires_gmitra_max" | "show_to_non_subscribers">,
  subscriptionActive: boolean,
): boolean {
  if (row.requires_gmitra_max && !subscriptionActive && !row.show_to_non_subscribers) {
    return false;
  }
  return true;
}

async function buildWeekDateBadges(args: {
  riderId: number;
  anchorDate: string;
  stateId: string | null;
  stateName: string | null;
  subscriptionActive: boolean;
}): Promise<Record<string, string>> {
  const weekDates = buildCurrentWeekDates(args.anchorDate);
  const weekStart = weekDates[0]!;
  const weekEnd = weekDates[weekDates.length - 1]!;
  const sql = getSql();

  const rows = await sql<ProgramRow[]>`
    SELECT
      p.id, p.code, p.name, p.description, p.service, p.vehicle_type,
      p.start_at::text, p.end_at::text, p.timezone, p.recurrence_type,
      p.slot_mode, p.slot_day_mode, p.active_days, p.geo_scope_mode,
      p.requires_gmitra_max, p.show_to_non_subscribers, p.show_before_eligible,
      p.reward_type, p.calendar_badges
    FROM incentive_programs p
    WHERE p.status = 'active'
      AND p.is_paused = false
      AND p.calendar_badges != '[]'::jsonb
      AND p.start_at <= ${`${weekEnd}T23:59:59${IST_OFFSET}`}::timestamptz
      AND p.end_at >= ${`${weekStart}T00:00:00${IST_OFFSET}`}::timestamptz
    ORDER BY p.created_at DESC
  `;

  const weekSet = new Set(weekDates);
  const badges: Record<string, string> = {};

  for (const row of rows) {
    if (!programVisibleToRider(row, args.subscriptionActive)) continue;

    const geoOk = await programMatchesGeo(row.id, row.geo_scope_mode, args.stateId, args.stateName);
    if (!geoOk) continue;

    for (const entry of parseCalendarBadges(row.calendar_badges)) {
      if (!weekSet.has(entry.date)) continue;
      if (!isDateActiveForProgram(row, entry.date)) continue;
      if (!badges[entry.date]) {
        badges[entry.date] = entry.label;
      }
    }
  }

  return badges;
}

function programHasBadgeOnDate(row: ProgramRow, dateStr: string): boolean {
  return parseCalendarBadges(row.calendar_badges).some((b) => b.date === dateStr);
}

function computeCycleBounds(row: ProgramRow, dateStr: string): { start: string; end: string } {
  const tz = row.timezone || "Asia/Kolkata";
  if (row.recurrence_type === "daily") {
    return {
      start: new Date(`${dateStr}T00:00:00${IST_OFFSET}`).toISOString(),
      end: new Date(`${dateStr}T23:59:59.999${IST_OFFSET}`).toISOString(),
    };
  }
  if (row.recurrence_type === "weekly") {
    const dow = dayOfWeekIst(dateStr);
    const anchor = new Date(`${dateStr}T12:00:00${IST_OFFSET}`);
    const weekStart = new Date(anchor);
    weekStart.setUTCDate(anchor.getUTCDate() - dow);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);
    return { start: weekStart.toISOString(), end: weekEnd.toISOString() };
  }
  if (row.recurrence_type === "monthly") {
    const [y, m] = dateStr.split("-").map(Number);
    const monthStart = new Date(`${y}-${pad2(m!)}-01T00:00:00${IST_OFFSET}`);
    const nextMonth = m === 12 ? 1 : m! + 1;
    const nextYear = m === 12 ? y! + 1 : y!;
    const monthEnd = new Date(`${nextYear}-${pad2(nextMonth)}-01T00:00:00${IST_OFFSET}`);
    monthEnd.setMilliseconds(monthEnd.getMilliseconds() - 1);
    return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
  }
  return { start: new Date(row.start_at).toISOString(), end: new Date(row.end_at).toISOString() };
}

function deriveCategory(row: ProgramRow): RiderIncentiveCategory {
  const hay = `${row.code} ${row.name}`.toLowerCase();
  if (hay.includes("surge")) return "surge";
  if (row.slot_mode === "custom_slots" || hay.includes("peak")) return "peak";
  return "incentive";
}

function formatTime12h(time: string): string {
  const [hRaw, mRaw] = time.split(":");
  let h = Number(hRaw);
  const m = Number(mRaw ?? 0);
  const ampm = h >= 12 ? "pm" : "am";
  h = h % 12;
  if (h === 0) h = 12;
  return m > 0 ? `${h}:${pad2(m)}${ampm}` : `${h}${ampm}`;
}

function slotDurationLabel(startTime: string, endTime: string): string {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let mins = eh! * 60 + em! - (sh! * 60 + sm!);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function buildTiers(tiers: TierRow[], completedOrders: number): RiderIncentiveTier[] {
  const sorted = [...tiers].sort((a, b) => a.tier_no - b.tier_no);
  let currentIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const min = sorted[i]!.min_orders ?? 0;
    if (completedOrders >= min) currentIdx = i;
  }
  return sorted.map((t, idx) => ({
    tierNo: t.tier_no,
    minOrders: t.min_orders ?? 0,
    rewardAmount: Number(t.reward_amount),
    unlocked: completedOrders >= (t.min_orders ?? 0),
    isCurrent: idx === currentIdx,
  }));
}

function maxTierReward(tiers: TierRow[]): number {
  if (!tiers.length) return 0;
  return Math.max(...tiers.map((t) => Number(t.reward_amount)));
}

async function programMatchesGeo(
  programId: string,
  geoMode: string,
  stateId: string | null,
  stateName: string | null,
): Promise<boolean> {
  return programMatchesRiderGeo({ programId, geoScopeMode: geoMode, stateId, stateName });
}

async function loadProgramChildren(programId: string) {
  const sql = getSql();
  const [tiers, windows, rules] = await Promise.all([
    sql<TierRow[]>`
      SELECT tier_no, min_orders, reward_amount
      FROM incentive_program_reward_tiers
      WHERE program_id = ${programId}::uuid
      ORDER BY tier_no ASC
    `,
    sql<WindowRow[]>`
      SELECT id, day_of_week, start_time::text AS start_time, end_time::text AS end_time, label
      FROM incentive_program_time_windows
      WHERE program_id = ${programId}::uuid AND is_active = true
      ORDER BY start_time ASC
    `,
    sql<{ min_login_days: number | null }[]>`
      SELECT min_login_days FROM incentive_program_rules
      WHERE program_id = ${programId}::uuid
      LIMIT 1
    `,
  ]);
  return {
    tiers: Array.isArray(tiers) ? tiers : [],
    windows: Array.isArray(windows) ? windows : [],
    minLoginDays: rules[0]?.min_login_days ?? null,
  };
}

async function getOrCreateProgress(args: {
  programId: string;
  riderUserId: string;
  riderId: number;
  stateId: string | null;
  service: string;
  cycleStart: string;
  cycleEnd: string;
  subscriptionActive: boolean;
  requiresGmitraMax: boolean;
}): Promise<{ completedOrders: number; projectedReward: number | null; riderStatus: string }> {
  const sql = getSql();
  const existing = await sql<ProgressRow[]>`
    SELECT id, completed_orders, projected_reward, rider_status
    FROM rider_incentive_progress
    WHERE program_id = ${args.programId}::uuid
      AND rider_user_id = ${args.riderUserId}
      AND cycle_start_at = ${args.cycleStart}::timestamptz
      AND cycle_end_at = ${args.cycleEnd}::timestamptz
    LIMIT 1
  `;

  if (existing[0]) {
    return {
      completedOrders: existing[0].completed_orders,
      projectedReward: existing[0].projected_reward != null ? Number(existing[0].projected_reward) : null,
      riderStatus: existing[0].rider_status,
    };
  }

  let riderStatus = "IN_PROGRESS";
  if (args.requiresGmitraMax && !args.subscriptionActive) {
    riderStatus = "LOCKED_SUBSCRIPTION";
  }

  await sql`
    INSERT INTO rider_incentive_progress (
      program_id, rider_user_id, rider_id, state_id, service,
      cycle_start_at, cycle_end_at, visible, rider_status
    ) VALUES (
      ${args.programId}::uuid,
      ${args.riderUserId},
      ${args.riderId},
      ${args.stateId}::uuid,
      ${args.service},
      ${args.cycleStart}::timestamptz,
      ${args.cycleEnd}::timestamptz,
      true,
      ${riderStatus}
    )
    ON CONFLICT (program_id, rider_user_id, cycle_start_at, cycle_end_at) DO NOTHING
  `;

  return { completedOrders: 0, projectedReward: null, riderStatus };
}

async function evaluateSlotCompletion(
  riderId: number,
  dateStr: string,
  windows: WindowRow[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!windows.length) return result;

  const dayStart = `${dateStr}T00:00:00${IST_OFFSET}`;
  const dayEnd = `${dateStr}T23:59:59.999${IST_OFFSET}`;
  const sql = getSql();
  const logs = await sql<{ status: string; timestamp: string }[]>`
    SELECT status, timestamp
    FROM duty_logs
    WHERE rider_id = ${riderId}
      AND timestamp >= ${dayStart}::timestamptz
      AND timestamp <= ${dayEnd}::timestamptz
    ORDER BY timestamp ASC
  `;

  for (const w of windows) {
    const slotStart = new Date(`${dateStr}T${w.start_time}${IST_OFFSET}`).getTime();
    const slotEnd = new Date(`${dateStr}T${w.end_time}${IST_OFFSET}`).getTime();
    const requiredMs = Math.max(slotEnd - slotStart, 0);
    if (requiredMs <= 0) {
      result.set(w.id, false);
      continue;
    }

    let onlineMs = 0;
    let onSince: number | null = null;
    for (const log of logs) {
      const ts = new Date(log.timestamp).getTime();
      if (log.status === "ON") {
        if (onSince == null) onSince = Math.max(ts, slotStart);
      } else if (onSince != null) {
        const segEnd = Math.min(ts, slotEnd);
        const segStart = Math.max(onSince, slotStart);
        if (segEnd > segStart) onlineMs += segEnd - segStart;
        onSince = null;
      }
    }
    if (onSince != null) {
      const segEnd = Math.min(Date.now(), slotEnd);
      const segStart = Math.max(onSince, slotStart);
      if (segEnd > segStart) onlineMs += segEnd - segStart;
    }

    result.set(w.id, onlineMs >= requiredMs * 0.5);
  }

  return result;
}

function filterWindowsForDate(windows: WindowRow[], dateStr: string): WindowRow[] {
  const dow = dayOfWeekIst(dateStr);
  return windows.filter((w) => w.day_of_week == null || w.day_of_week === dow);
}

export async function listRiderIncentives(args: {
  riderId: number;
  riderUserId: string;
  date?: string;
  filter?: string;
}): Promise<RiderIncentiveListResult> {
  await ensureIncentiveProgramSlotColumns();

  const dateStr = parseDateParam(args.date);
  const todayStr = todayIstDateStr();
  const isToday = dateStr === todayStr;
  const sql = getSql();

  const { stateId, stateName } = await resolveRiderStateRef(args.riderId);
  const subscription = await getRiderSubscriptionStatus(args.riderId);
  const subscriptionActive = Boolean(subscription.active);

  const programRows = await sql<ProgramRow[]>`
    SELECT
      p.id, p.code, p.name, p.description, p.service, p.vehicle_type,
      p.start_at::text, p.end_at::text, p.timezone, p.recurrence_type,
      p.slot_mode, p.slot_day_mode, p.active_days, p.geo_scope_mode,
      p.requires_gmitra_max, p.show_to_non_subscribers, p.show_before_eligible,
      p.reward_type, p.calendar_badges
    FROM incentive_programs p
    WHERE p.status = 'active'
      AND p.is_paused = false
      AND p.start_at <= ${`${dateStr}T23:59:59${IST_OFFSET}`}::timestamptz
      AND p.end_at >= ${`${dateStr}T00:00:00${IST_OFFSET}`}::timestamptz
    ORDER BY p.created_at DESC
  `;

  const items: RiderIncentiveProgramItem[] = [];

  for (const row of programRows) {
    if (!isDateActiveForProgram(row, dateStr)) continue;

    const geoOk = await programMatchesGeo(row.id, row.geo_scope_mode, stateId, stateName);
    if (!geoOk) continue;

    if (row.requires_gmitra_max && !subscriptionActive && !row.show_to_non_subscribers) continue;

    const { tiers, windows, minLoginDays } = await loadProgramChildren(row.id);
    const cycle = computeCycleBounds(row, dateStr);
    const progress = await getOrCreateProgress({
      programId: row.id,
      riderUserId: args.riderUserId,
      riderId: args.riderId,
      stateId,
      service: row.service,
      cycleStart: cycle.start,
      cycleEnd: cycle.end,
      subscriptionActive,
      requiresGmitraMax: row.requires_gmitra_max,
    });

    const dayWindows = filterWindowsForDate(windows, dateStr);
    const slotCompletion =
      dayWindows.length > 0
        ? await evaluateSlotCompletion(args.riderId, dateStr, dayWindows)
        : new Map<string, boolean>();

    const mandatoryCompleted = [...slotCompletion.values()].filter(Boolean).length;
    const locked =
      row.requires_gmitra_max && !subscriptionActive && progress.riderStatus === "LOCKED_SUBSCRIPTION";

    const category = deriveCategory(row);
    const maxReward = maxTierReward(tiers);
    const completedOrders = progress.completedOrders;

    items.push({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      category,
      service: row.service,
      recurrenceType: row.recurrence_type,
      isLive: isToday && !locked,
      isSpecialDay: programHasBadgeOnDate(row, dateStr),
      riderStatus: progress.riderStatus,
      lockedReason: locked ? "GMITRA_MAX_REQUIRED" : null,
      requiresGmitraMax: row.requires_gmitra_max,
      cycleLabel: formatIstDateLabel(dateStr, isToday),
      cycleStartAt: cycle.start,
      cycleEndAt: cycle.end,
      maxReward,
      completedOrders,
      projectedReward: progress.projectedReward,
      tiers: buildTiers(tiers, completedOrders),
      timeWindows: dayWindows.map((w, idx) => ({
        id: w.id,
        label: w.label?.trim() || `Slot ${idx + 1}`,
        startTime: formatTime12h(w.start_time.slice(0, 5)),
        endTime: formatTime12h(w.end_time.slice(0, 5)),
        durationLabel: slotDurationLabel(w.start_time.slice(0, 8), w.end_time.slice(0, 8)),
        completed: slotCompletion.get(w.id) ?? false,
      })),
      mandatoryLoginSlots: dayWindows.length,
      mandatoryLoginCompleted: mandatoryCompleted,
      minLoginDays: minLoginDays,
    });
  }

  const filterKey = (args.filter ?? "all").toLowerCase();
  const filtered =
    filterKey === "all" ? items : items.filter((p) => p.category === filterKey);

  const counts = {
    all: items.length,
    incentive: items.filter((p) => p.category === "incentive").length,
    surge: items.filter((p) => p.category === "surge").length,
    peak: items.filter((p) => p.category === "peak").length,
  };

  const filters: RiderIncentiveFilterChip[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "surge", label: "Surge", count: counts.surge },
    { key: "incentive", label: "Incentive", count: counts.incentive },
    { key: "peak", label: "Peak Inc.", count: counts.peak },
  ].filter((f) => f.key === "all" || f.count > 0);

  const dateBadges = await buildWeekDateBadges({
    riderId: args.riderId,
    anchorDate: dateStr,
    stateId,
    stateName,
    subscriptionActive,
  });

  return { date: dateStr, dateBadges, filters, programs: filtered };
}
