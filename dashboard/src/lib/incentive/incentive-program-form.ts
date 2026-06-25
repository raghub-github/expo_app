import {
  buildIncentiveTimeWindows,
  resolveActiveDays,
  validateSlotSchedule,
  type SlotDayMode,
} from "@/lib/incentive/incentive-slot-schedule";
import type { IncentiveProgramBody } from "@/lib/incentive/incentive-program-api-schema";

export type TierRow = { tier_no: number; min_orders: string; reward_amount: string };
export type SlotWindowRow = { start_time: string; end_time: string; label: string };
export type CalendarBadgeRow = { date: string; label: string };

export type IncentiveFormState = {
  name: string;
  code: string;
  description: string;
  service: string;
  vehicle_type: string;
  status: "draft" | "active" | "paused" | "archived";
  start_at: string;
  end_at: string;
  timezone: string;
  recurrence_type: "one_time" | "daily" | "weekly" | "monthly";
  slot_mode: "all_day" | "custom_slots";
  slot_day_mode: SlotDayMode;
  specific_days: number[];
  slot_windows: SlotWindowRow[];
  geo_scope_mode: "selected_states" | "all_india" | "selected_cities" | "selected_zones";
  requires_gmitra_max: boolean;
  show_to_non_subscribers: boolean;
  show_before_eligible: boolean;
  reward_type: "flat" | "tier" | "rank" | "pool" | "streak";
  payout_mode: "instant" | "next_settlement" | "manual_approve";
  payout_cap_mode: "all_eligible" | "top_n" | "top_percent" | "first_n" | "pool_limit";
  max_winners: string;
  max_total_payout: string;
  max_payout_per_rider: string;
  stop_on_budget_exhaust: boolean;
  sort_basis: string;
  tie_breaker: string;
  min_completed_orders: string;
  min_acceptance_rate: string;
  max_cancellation_rate: string;
  min_active_minutes: string;
  min_customer_rating: string;
  min_login_days: string;
  exclude_suspended_riders: boolean;
  exclude_low_rating_riders: boolean;
  tiers: TierRow[];
  calendar_badges: CalendarBadgeRow[];
};

const DEFAULTS_BY_SERVICE: Record<
  string,
  { minOrders: number; acceptance: number; cancellation: number; activeMinutes: number }
> = {
  food: { minOrders: 14, acceptance: 90, cancellation: 3, activeMinutes: 480 },
  parcel: { minOrders: 12, acceptance: 88, cancellation: 4, activeMinutes: 480 },
  ride_2w: { minOrders: 10, acceptance: 92, cancellation: 3, activeMinutes: 480 },
  ride_3w: { minOrders: 10, acceptance: 92, cancellation: 3, activeMinutes: 480 },
  ride_4w_ac: { minOrders: 10, acceptance: 92, cancellation: 3, activeMinutes: 480 },
  ride_4w_non_ac: { minOrders: 10, acceptance: 92, cancellation: 3, activeMinutes: 480 },
  all_ride: { minOrders: 10, acceptance: 92, cancellation: 3, activeMinutes: 480 },
};

export function generateIncentiveCodeFromName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function emptyIncentiveForm(service = "food"): IncentiveFormState {
  const d = DEFAULTS_BY_SERVICE[service] ?? DEFAULTS_BY_SERVICE.food!;
  return {
    name: "",
    code: "",
    description: "",
    service,
    vehicle_type: "",
    status: "draft",
    start_at: "",
    end_at: "",
    timezone: "Asia/Kolkata",
    recurrence_type: "daily",
    slot_mode: "all_day",
    slot_day_mode: "full_week",
    specific_days: [1, 2, 3, 4, 5],
    slot_windows: [{ start_time: "12:00", end_time: "15:00", label: "Lunch peak" }],
    geo_scope_mode: "selected_states",
    requires_gmitra_max: true,
    show_to_non_subscribers: true,
    show_before_eligible: true,
    reward_type: "tier",
    payout_mode: "manual_approve",
    payout_cap_mode: "top_n",
    max_winners: "50",
    max_total_payout: "",
    max_payout_per_rider: "",
    stop_on_budget_exhaust: true,
    sort_basis: "completed_orders_desc",
    tie_breaker: "lower_cancellations",
    min_completed_orders: String(d.minOrders),
    min_acceptance_rate: String(d.acceptance),
    max_cancellation_rate: String(d.cancellation),
    min_active_minutes: String(d.activeMinutes),
    min_customer_rating: "4.5",
    min_login_days: "",
    exclude_suspended_riders: true,
    exclude_low_rating_riders: false,
    tiers: [
      { tier_no: 1, min_orders: String(d.minOrders), reward_amount: "80" },
      { tier_no: 2, min_orders: String(d.minOrders + 4), reward_amount: "140" },
      { tier_no: 3, min_orders: String(d.minOrders + 10), reward_amount: "220" },
    ],
    calendar_badges: [],
  };
}

function parseCalendarBadges(raw: unknown): CalendarBadgeRow[] {
  let source = raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      source = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  const rows: CalendarBadgeRow[] = [];
  for (const item of source) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const date = String(rec.date ?? "").trim();
    const label = String(rec.label ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) continue;
    rows.push({ date, label: label.slice(0, 24) });
  }
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.date)) return false;
    seen.add(r.date);
    return true;
  });
}

export function normalizeCalendarBadges(rows: CalendarBadgeRow[]): CalendarBadgeRow[] {
  const seen = new Set<string>();
  const out: CalendarBadgeRow[] = [];
  for (const row of rows) {
    const date = row.date.trim();
    const label = row.label.trim().slice(0, 24);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !label) continue;
    if (seen.has(date)) continue;
    seen.add(date);
    out.push({ date, label });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function toDatetimeLocal(val: unknown): string {
  if (val == null || String(val).trim() === "") return "";
  const d = new Date(String(val));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeToInput(val: unknown): string {
  if (val == null) return "";
  const s = String(val);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function strVal(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  const s = String(v).trim();
  return s === "" ? fallback : s;
}

/** DB numeric/text → form string; never inject placeholder defaults. */
function dbFieldStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function parseJsonArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function optionalFormNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function dedupeSlotWindows(
  windows: Array<Record<string, unknown>>,
): SlotWindowRow[] {
  const map = new Map<string, SlotWindowRow>();
  for (const w of windows) {
    const start = timeToInput(w.start_time);
    const end = timeToInput(w.end_time);
    const label = strVal(w.label);
    const key = `${start}|${end}|${label}`;
    map.set(key, { start_time: start, end_time: end, label });
  }
  const rows = Array.from(map.values());
  return rows;
}

export function incentiveDetailToForm(detail: {
  program: Record<string, unknown>;
  rules: Record<string, unknown> | null;
  reward_tiers: Array<Record<string, unknown>>;
  state_ids: string[];
  time_windows: Array<Record<string, unknown>>;
}): { form: IncentiveFormState; stateIds: string[] } {
  const p = detail.program;
  const rules = detail.rules;
  const slotMode = (String(p.slot_mode ?? "all_day") as IncentiveFormState["slot_mode"]) || "all_day";
  const slotDayMode = (String(p.slot_day_mode ?? "full_week") as SlotDayMode) || "full_week";
  let specificDays: number[] = [];
  const rawDays = parseJsonArray(p.active_days);
  specificDays = rawDays.map((d) => Number(d)).filter((d) => !Number.isNaN(d));
  if (slotDayMode === "specific_days" && specificDays.length === 0 && detail.time_windows.length) {
    specificDays = [
      ...new Set(
        detail.time_windows
          .map((w) => w.day_of_week)
          .filter((d): d is number => d != null && !Number.isNaN(Number(d)))
          .map((d) => Number(d)),
      ),
    ].sort((a, b) => a - b);
  }

  const tiers: TierRow[] = detail.reward_tiers.map((t, i) => ({
    tier_no: Number(t.tier_no ?? i + 1),
    min_orders: dbFieldStr(t.min_orders),
    reward_amount: dbFieldStr(t.reward_amount),
  }));

  const slotWindowsFromDb = dedupeSlotWindows(detail.time_windows);

  const form: IncentiveFormState = {
    name: dbFieldStr(p.name),
    code: dbFieldStr(p.code),
    description: dbFieldStr(p.description),
    service: dbFieldStr(p.service) || "food",
    vehicle_type: dbFieldStr(p.vehicle_type),
    status: (String(p.status ?? "draft") as IncentiveFormState["status"]) || "draft",
    start_at: toDatetimeLocal(p.start_at),
    end_at: toDatetimeLocal(p.end_at),
    timezone: dbFieldStr(p.timezone) || "Asia/Kolkata",
    recurrence_type:
      (String(p.recurrence_type ?? "one_time") as IncentiveFormState["recurrence_type"]) || "one_time",
    slot_mode: slotMode,
    slot_day_mode: slotDayMode,
    specific_days: specificDays,
    slot_windows:
      slotMode === "custom_slots"
        ? slotWindowsFromDb.length > 0
          ? slotWindowsFromDb
          : [{ start_time: "12:00", end_time: "15:00", label: "" }]
        : slotWindowsFromDb.length > 0
          ? slotWindowsFromDb
          : [{ start_time: "12:00", end_time: "15:00", label: "" }],
    geo_scope_mode:
      (String(p.geo_scope_mode ?? "selected_states") as IncentiveFormState["geo_scope_mode"]) ||
      "selected_states",
    requires_gmitra_max: p.requires_gmitra_max !== false,
    show_to_non_subscribers: p.show_to_non_subscribers !== false,
    show_before_eligible: p.show_before_eligible !== false,
    reward_type: (String(p.reward_type ?? "tier") as IncentiveFormState["reward_type"]) || "tier",
    payout_mode: (String(p.payout_mode ?? "manual_approve") as IncentiveFormState["payout_mode"]) || "manual_approve",
    payout_cap_mode:
      (String(p.payout_cap_mode ?? "top_n") as IncentiveFormState["payout_cap_mode"]) || "top_n",
    max_winners: dbFieldStr(p.max_winners),
    max_total_payout: dbFieldStr(p.max_total_payout),
    max_payout_per_rider: dbFieldStr(p.max_payout_per_rider),
    stop_on_budget_exhaust: p.stop_on_budget_exhaust === true,
    sort_basis: dbFieldStr(p.sort_basis),
    tie_breaker: dbFieldStr(p.tie_breaker),
    min_completed_orders: dbFieldStr(rules?.min_completed_orders),
    min_acceptance_rate: dbFieldStr(rules?.min_acceptance_rate),
    max_cancellation_rate: dbFieldStr(rules?.max_cancellation_rate),
    min_active_minutes: dbFieldStr(rules?.min_active_minutes),
    min_customer_rating: dbFieldStr(rules?.min_customer_rating),
    min_login_days: dbFieldStr(rules?.min_login_days),
    exclude_suspended_riders: rules?.exclude_suspended_riders !== false,
    exclude_low_rating_riders: rules?.exclude_low_rating_riders === true,
    tiers,
    calendar_badges: parseCalendarBadges(p.calendar_badges),
  };

  return { form, stateIds: detail.state_ids ?? [] };
}

export function buildIncentiveProgramPayload(
  form: IncentiveFormState,
  selectedStateIds: string[],
): { payload: IncentiveProgramBody | null; error: string | null } {
  if (!form.name.trim() || !form.code.trim()) {
    return { payload: null, error: "Name and internal code are required." };
  }
  if (!form.start_at || !form.end_at) {
    return { payload: null, error: "Start and end dates are required." };
  }
  if (form.geo_scope_mode === "selected_states" && selectedStateIds.length === 0) {
    return { payload: null, error: "Select at least one state / UT for geo scope." };
  }

  const slotErr = validateSlotSchedule({
    slot_mode: form.slot_mode,
    slot_day_mode: form.slot_day_mode,
    specific_days: form.specific_days,
    slot_windows: form.slot_windows,
  });
  if (slotErr) return { payload: null, error: slotErr };

  const activeDays =
    form.slot_day_mode === "specific_days"
      ? resolveActiveDays("specific_days", form.specific_days)
      : [];

  const timeWindows = buildIncentiveTimeWindows({
    slot_mode: form.slot_mode,
    slot_day_mode: form.slot_day_mode,
    specific_days: form.specific_days,
    slot_windows: form.slot_windows,
  });

  const rewardTiers = form.tiers.map((t) => ({
    tier_no: t.tier_no,
    tier_type: form.reward_type === "rank" ? ("rank_range" as const) : ("trip_threshold" as const),
    min_orders: optionalFormNumber(t.min_orders),
    reward_amount: Number(t.reward_amount),
  }));

  if (rewardTiers.some((t) => Number.isNaN(t.reward_amount))) {
    return { payload: null, error: "Reward tier amounts must be valid numbers." };
  }

  const calendarBadges = normalizeCalendarBadges(form.calendar_badges);

  return {
    payload: {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      service: form.service,
      vehicle_type: form.vehicle_type.trim() || null,
      status: form.status,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
      timezone: form.timezone.trim() || "Asia/Kolkata",
      recurrence_type: form.recurrence_type,
      slot_mode: form.slot_mode,
      slot_day_mode: form.slot_day_mode,
      active_days: activeDays,
      time_windows: timeWindows,
      geo_scope_mode: form.geo_scope_mode,
      requires_gmitra_max: form.requires_gmitra_max,
      show_to_non_subscribers: form.show_to_non_subscribers,
      show_before_eligible: form.show_before_eligible,
      reward_type: form.reward_type,
      payout_mode: form.payout_mode,
      payout_cap_mode: form.payout_cap_mode,
      max_winners: optionalFormNumber(form.max_winners),
      max_total_payout: optionalFormNumber(form.max_total_payout),
      max_payout_per_rider: optionalFormNumber(form.max_payout_per_rider),
      stop_on_budget_exhaust: form.stop_on_budget_exhaust,
      sort_basis: form.sort_basis.trim() || null,
      tie_breaker: form.tie_breaker.trim() || null,
      is_active: form.status === "active",
      state_ids: form.geo_scope_mode === "selected_states" ? selectedStateIds : [],
      rules: {
        min_completed_orders: optionalFormNumber(form.min_completed_orders),
        min_acceptance_rate: optionalFormNumber(form.min_acceptance_rate),
        max_cancellation_rate: optionalFormNumber(form.max_cancellation_rate),
        min_active_minutes: optionalFormNumber(form.min_active_minutes),
        min_customer_rating: optionalFormNumber(form.min_customer_rating),
        min_login_days: optionalFormNumber(form.min_login_days),
        exclude_suspended_riders: form.exclude_suspended_riders,
        exclude_low_rating_riders: form.exclude_low_rating_riders,
      },
      reward_tiers: rewardTiers,
      calendar_badges: calendarBadges,
    },
    error: null,
  };
}

export { DEFAULTS_BY_SERVICE };
