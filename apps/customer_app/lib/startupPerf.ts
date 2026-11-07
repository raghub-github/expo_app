/**
 * Lightweight DEV-only startup / location / weather timing.
 * Never logs raw coordinates. No-ops in production.
 */

type CounterKey =
  | "gps_requests"
  | "weather_requests"
  | "active_location_watchers";

const marks = new Map<string, number>();
const counters: Record<CounterKey, number> = {
  gps_requests: 0,
  weather_requests: 0,
  active_location_watchers: 0,
};

const PROCESS_START = Date.now();

/** Structured launch milestones (acceptance instrumentation). */
export type LaunchMilestone =
  | "APP_LAUNCH"
  | "NATIVE_SPLASH_VISIBLE"
  | "AUTH_RESTORE_START"
  | "AUTH_RESTORE_DONE"
  | "ROOT_LAYOUT_READY"
  | "SPLASH_FADE_ARMED"
  | "SPLASH_HARD_DEADLINE"
  | "SPLASH_HIDE"
  | "HOME_FIRST_RENDER"
  | "LOCATION_PERMISSION_RESULT"
  | "GPS_FETCH_START"
  | "GPS_FETCH_DONE"
  | "REVERSE_GEOCODE_DONE"
  | "HOME_LOCATION_UPDATED";

export function startupLaunchLog(
  milestone: LaunchMilestone | string,
  extra?: Record<string, unknown>
): void {
  if (!__DEV__) return;
  const ageMs = Date.now() - PROCESS_START;
  // eslint-disable-next-line no-console
  console.log(`[startup] ${milestone}`, { ageMs, ...extra });
}

/** DEV watchdog — flags any stage that exceeds a budget. */
export function startupWatch(
  stage: string,
  startedAtMs: number,
  budgetMs: number,
  extra?: Record<string, unknown>
): number {
  const durationMs = Date.now() - startedAtMs;
  if (!__DEV__) return durationMs;
  if (durationMs > budgetMs) {
    startupLaunchLog("STARTUP_BLOCKER", {
      stage,
      durationMs,
      budgetMs,
      ...extra,
    });
  }
  return durationMs;
}

export function startupMark(label: string): void {
  if (!__DEV__) return;
  marks.set(label, Date.now());
}

export function startupMeasure(label: string, fromLabel?: string): number | null {
  if (!__DEV__) return null;
  const end = Date.now();
  const start = fromLabel ? marks.get(fromLabel) : PROCESS_START;
  if (start == null) return null;
  const ms = end - start;
  // eslint-disable-next-line no-console
  console.log(`[startup-perf] ${label}=${ms}ms`);
  marks.set(label, end);
  return ms;
}

export function startupInc(key: CounterKey, delta = 1): void {
  if (!__DEV__) return;
  counters[key] = Math.max(0, (counters[key] ?? 0) + delta);
}

export function startupSetWatchers(count: number): void {
  if (!__DEV__) return;
  counters.active_location_watchers = Math.max(0, count);
}

export function startupDumpCounters(phase: string): void {
  if (!__DEV__) return;
  // eslint-disable-next-line no-console
  console.log(`[startup-perf] counters@${phase}`, { ...counters });
}

/** Process start epoch for absolute age measurements. */
export function startupProcessAgeMs(): number {
  return Date.now() - PROCESS_START;
}

startupMark("process_start");
