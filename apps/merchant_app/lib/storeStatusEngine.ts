export type StoreStatus = "ONLINE" | "OFFLINE";
export type ActionSource = "manual" | "schedule" | "system";

export type StoreStatusEngineState = {
  store_status: StoreStatus;

  is_manual_override: boolean;
  manual_override_at: string | null;

  is_schedule_enabled: boolean;
  schedule_start_time: string | null; // "HH:mm"
  schedule_end_time: string | null; // "HH:mm"

  is_vacation_mode: boolean;
  vacation_start: string | null; // ISO
  vacation_end: string | null; // ISO

  schedule_end_prompt_expires_at: string | null; // ISO

  rush_ends_at: string | null; // ISO (optional feature)

  last_action_source: ActionSource;
};

export type StoreStatusEngineEffect =
  | { type: "toast"; level: "info" | "error"; message: string }
  | { type: "schedule_end_modal" }
  | { type: "persist" };

export type StoreStatusEngineEvent =
  | { type: "MANUAL_ON"; now: Date }
  | { type: "MANUAL_OFF"; now: Date }
  | { type: "SCHEDULE_END_RESPONSE"; now: Date; action: "stay_online" | "go_offline" }
  | { type: "CONFIG_UPDATE"; now: Date; patch: Partial<StoreStatusEngineState> }
  | { type: "TICK"; now: Date };

const TZ = "Asia/Kolkata";
const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

export const UI_STRINGS = {
  manualOnBeforeSchedule: "You are going live before your scheduled time",
  scheduleEndTitle: "Scheduled time ended",
  scheduleEndBody: "Your scheduled time has ended. Do you want to stay online?",
  vacationActiveBlocked: "Vacation mode is active. Disable vacation to go online.",
} as const;

export function createInitialStoreStatusState(): StoreStatusEngineState {
  return {
    store_status: "OFFLINE",
    is_manual_override: false,
    manual_override_at: null,
    is_schedule_enabled: false,
    schedule_start_time: null,
    schedule_end_time: null,
    is_vacation_mode: false,
    vacation_start: null,
    vacation_end: null,
    schedule_end_prompt_expires_at: null,
    rush_ends_at: null,
    last_action_source: "system",
  };
}

function toIso(d: Date): string {
  return d.toISOString();
}

function parseIsoMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const d = new Date(String(iso));
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function hhmmToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1]) || 0));
  const mi = Math.min(59, Math.max(0, Number(m[2]) || 0));
  return h * 60 + mi;
}

function minutesSinceMidnightInTz(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function isWithinScheduleWindow(s: StoreStatusEngineState, now: Date): boolean {
  if (!s.is_schedule_enabled) return false;
  const startMin = hhmmToMinutes(s.schedule_start_time);
  const endMin = hhmmToMinutes(s.schedule_end_time);
  if (startMin == null || endMin == null) return false;
  const cur = minutesSinceMidnightInTz(now);
  // [start, end) same-day only (spec v1)
  if (endMin <= startMin) return false;
  return cur >= startMin && cur < endMin;
}

function isVacationActive(s: StoreStatusEngineState, now: Date): boolean {
  if (!s.is_vacation_mode) return false;
  const a = parseIsoMs(s.vacation_start);
  const b = parseIsoMs(s.vacation_end);
  const t = now.getTime();
  return a > 0 && b > 0 && t >= a && t < b;
}

function isRushActive(s: StoreStatusEngineState, now: Date): boolean {
  const t = now.getTime();
  const e = parseIsoMs(s.rush_ends_at);
  return e > 0 && t < e;
}

function clearPrompt(s: StoreStatusEngineState): StoreStatusEngineState {
  if (!s.schedule_end_prompt_expires_at) return s;
  return { ...s, schedule_end_prompt_expires_at: null };
}

export function reduceStoreStatusEngine(
  state: StoreStatusEngineState,
  event: StoreStatusEngineEvent
): { state: StoreStatusEngineState; effects: StoreStatusEngineEffect[] } {
  const now = event.now;
  const effects: StoreStatusEngineEffect[] = [];

  // System rule: vacation override
  if (event.type !== "CONFIG_UPDATE" && isVacationActive(state, now)) {
    if (
      state.store_status !== "OFFLINE" ||
      state.is_manual_override ||
      state.manual_override_at != null ||
      state.schedule_end_prompt_expires_at != null
    ) {
      return {
        state: {
          ...state,
          store_status: "OFFLINE",
          is_manual_override: false,
          manual_override_at: null,
          schedule_end_prompt_expires_at: null,
          last_action_source: "system",
        },
        effects: [{ type: "persist" }],
      };
    }
    return { state, effects };
  }

  if (event.type === "CONFIG_UPDATE") {
    const next = { ...state, ...event.patch };
    effects.push({ type: "persist" });
    return { state: next, effects };
  }

  if (event.type === "MANUAL_ON") {
    if (isVacationActive(state, now)) {
      effects.push({ type: "toast", level: "error", message: UI_STRINGS.vacationActiveBlocked });
      return { state, effects };
    }
    if (state.store_status === "ONLINE" && state.is_manual_override === true) {
      return { state: clearPrompt(state), effects: state.schedule_end_prompt_expires_at ? [{ type: "persist" }] : [] };
    }
    const within = isWithinScheduleWindow(state, now);
    const manualOverride = !within;
    const next: StoreStatusEngineState = {
      ...state,
      store_status: "ONLINE",
      is_manual_override: manualOverride,
      manual_override_at: manualOverride ? toIso(now) : null,
      schedule_end_prompt_expires_at: null,
      last_action_source: "manual",
    };
    if (manualOverride) {
      effects.push({ type: "toast", level: "info", message: UI_STRINGS.manualOnBeforeSchedule });
    }
    effects.push({ type: "persist" });
    return { state: next, effects };
  }

  if (event.type === "MANUAL_OFF") {
    if (state.store_status === "OFFLINE" && !state.is_manual_override && !state.schedule_end_prompt_expires_at) {
      return { state, effects };
    }
    const next: StoreStatusEngineState = {
      ...state,
      store_status: "OFFLINE",
      is_manual_override: false,
      manual_override_at: null,
      schedule_end_prompt_expires_at: null,
      last_action_source: "manual",
    };
    effects.push({ type: "persist" });
    return { state: next, effects };
  }

  if (event.type === "SCHEDULE_END_RESPONSE") {
    if (event.action === "stay_online") {
      const next: StoreStatusEngineState = {
        ...state,
        store_status: "ONLINE",
        is_manual_override: true,
        manual_override_at: toIso(now),
        schedule_end_prompt_expires_at: null,
        last_action_source: "manual",
      };
      effects.push({ type: "persist" });
      return { state: next, effects };
    }
    // go_offline
    return reduceStoreStatusEngine(state, { type: "MANUAL_OFF", now });
  }

  // TICK
  const within = isWithinScheduleWindow(state, now);

  // Schedule start
  if (within && state.is_schedule_enabled) {
    if (state.store_status === "OFFLINE" && state.is_manual_override === false) {
      const next: StoreStatusEngineState = {
        ...state,
        store_status: "ONLINE",
        last_action_source: "schedule",
      };
      effects.push({ type: "persist" });
      return { state: next, effects };
    }
    // Within hours: clear schedule-end prompt if any
    if (state.schedule_end_prompt_expires_at) {
      const next = { ...state, schedule_end_prompt_expires_at: null };
      effects.push({ type: "persist" });
      return { state: next, effects };
    }
    return { state, effects };
  }

  // Schedule end
  if (!within && state.is_schedule_enabled) {
    if (state.store_status === "ONLINE") {
      if (state.is_manual_override) return { state, effects };
      if (isRushActive(state, now)) return { state, effects };

      const expMs = parseIsoMs(state.schedule_end_prompt_expires_at);
      if (!expMs) {
        const next: StoreStatusEngineState = {
          ...state,
          schedule_end_prompt_expires_at: new Date(now.getTime() + PROMPT_TIMEOUT_MS).toISOString(),
          last_action_source: "system",
        };
        effects.push({ type: "schedule_end_modal" }, { type: "persist" });
        return { state: next, effects };
      }

      if (now.getTime() >= expMs) {
        const next: StoreStatusEngineState = {
          ...state,
          store_status: "OFFLINE",
          is_manual_override: false,
          manual_override_at: null,
          schedule_end_prompt_expires_at: null,
          last_action_source: "system",
        };
        effects.push({ type: "persist" });
        return { state: next, effects };
      }

      // Prompt still active; keep online
      return { state, effects };
    }

    // Offline: ensure prompt cleared
    if (state.schedule_end_prompt_expires_at) {
      const next = { ...state, schedule_end_prompt_expires_at: null };
      effects.push({ type: "persist" });
      return { state: next, effects };
    }
  }

  return { state, effects };
}

