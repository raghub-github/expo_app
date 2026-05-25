export const PREP_TIME_MIN = 5;
export const PREP_TIME_MAX = 180;
export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type PrepCountdownOrder = {
  prep_ready_by_at?: string | null;
  accepted_at?: string | null;
  preparing_at?: string | null;
  created_at: string;
  preparation_time_minutes?: number | null;
  eta_seconds?: number | null;
  prepared_late_minutes?: number | null;
};

export function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, Math.round(n)));
}

export function prepReadyDeadlineMs(order: PrepCountdownOrder): number {
  if (order.prep_ready_by_at) {
    return new Date(order.prep_ready_by_at).getTime();
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  const mins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  return new Date(base).getTime() + mins * 60_000;
}

export function formatCountdownMmSs(secondsLeft: number): string {
  const s = Math.max(0, secondsLeft);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function prepReadyWindowStartMs(order: PrepCountdownOrder): number {
  const deadline = prepReadyDeadlineMs(order);
  const mins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  if (order.prep_ready_by_at) {
    return deadline - mins * 60_000;
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  return new Date(base).getTime();
}

export function prepReadyTimeRemainingRatio(order: PrepCountdownOrder, nowMs: number): number {
  const deadline = prepReadyDeadlineMs(order);
  const start = prepReadyWindowStartMs(order);
  const totalMs = Math.max(60_000, deadline - start);
  const leftMs = Math.max(0, deadline - nowMs);
  return Math.min(1, Math.max(0, leftMs / totalMs));
}

export function prepReadyCountdownLabel(
  order: PrepCountdownOrder,
  nowMs: number,
  opts?: { prefix?: string; expiredLabel?: string }
): { label: string; disabled: boolean; secondsLeft: number } {
  const prefix = opts?.prefix ?? "Mark as ready";
  const expiredLabel = opts?.expiredLabel ?? "Mark as ready";
  const deadline = prepReadyDeadlineMs(order);
  const secondsLeft = Math.max(0, Math.ceil((deadline - nowMs) / 1000));
  if (secondsLeft <= 0) {
    return { label: expiredLabel, disabled: false, secondsLeft: 0 };
  }
  return {
    label: `${prefix} (${formatCountdownMmSs(secondsLeft)})`,
    disabled: false,
    secondsLeft,
  };
}

export function isPrepCountdownExpired(
  order: PrepCountdownOrder,
  nowMs: number,
  opts?: { prefix?: string; expiredLabel?: string }
): boolean {
  return prepReadyCountdownLabel(order, nowMs, opts).secondsLeft <= 0;
}
