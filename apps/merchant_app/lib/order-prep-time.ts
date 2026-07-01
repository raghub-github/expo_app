export const PREP_TIME_MIN = 5;
export const PREP_TIME_MAX = 180;
export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type PrepCountdownOrder = {
  prep_ready_by_at?: string | null;
  expected_ready_at?: string | null;
  accepted_at?: string | null;
  preparing_at?: string | null;
  created_at: string;
  preparation_time_minutes?: number | null;
  prep_delay_minutes?: number | null;
  last_prep_delay_minutes_added?: number | null;
  eta_seconds?: number | null;
  prepared_late_minutes?: number | null;
};

export function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, Math.round(n)));
}

export function prepPerformanceDeadlineMs(order: PrepCountdownOrder): number {
  if (order.prep_ready_by_at) {
    const t = new Date(order.prep_ready_by_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  const baseMs = new Date(base).getTime();
  const prepMins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  return baseMs + prepMins * 60_000;
}

export function prepReadyDeadlineMs(order: PrepCountdownOrder): number {
  if (order.expected_ready_at) {
    const t = new Date(order.expected_ready_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (order.prep_ready_by_at) {
    const t = new Date(order.prep_ready_by_at).getTime();
    if (Number.isFinite(t)) return t;
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  const baseMs = new Date(base).getTime();
  const prepMins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  const delayMins = Math.max(0, Number(order.prep_delay_minutes) || 0);
  return baseMs + (prepMins + delayMins) * 60_000;
}

export function formatCountdownMmSs(secondsLeft: number): string {
  const s = Math.max(0, secondsLeft);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function prepReadyWindowStartMs(order: PrepCountdownOrder): number {
  const deadline = prepReadyDeadlineMs(order);
  if (order.expected_ready_at) {
    const extMins = Math.max(1, Number(order.last_prep_delay_minutes_added) || 5);
    return deadline - extMins * 60_000;
  }
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

/** True when merchant is past original KPT deadline (delay banner + Need more time eligibility). */
export function isPrepPerformanceOverdue(order: PrepCountdownOrder, nowMs: number): boolean {
  return prepOverdueSeconds(order, nowMs) > 0;
}

/** Seconds past original KPT deadline — never resets on Need more time. */
export function prepOverdueSeconds(order: PrepCountdownOrder, nowMs: number): number {
  const deadline = prepPerformanceDeadlineMs(order);
  if (!Number.isFinite(deadline) || nowMs <= deadline) return 0;
  return Math.floor((nowMs - deadline) / 1000);
}

/** Whole minutes past prep deadline — legacy helpers / analytics. */
export function prepOverdueMinutes(order: PrepCountdownOrder, nowMs: number): number {
  const secs = prepOverdueSeconds(order, nowMs);
  if (secs <= 0) return 0;
  return Math.max(1, Math.floor(secs / 60));
}

export function formatDurationHhMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec
    .toString()
    .padStart(2, "0")}`;
}

/** Live / frozen delay banner — `Delayed - 02:42:00`. */
export function formatPrepDelayedBannerLabel(overdueSeconds: number): string {
  const secs = Math.max(1, Math.floor(overdueSeconds));
  return `Delayed - ${formatDurationHhMmSs(secs)}`;
}

/** Convert stored late minutes (e.g. prepared_late_minutes) to banner label. */
export function formatPrepDelayedBannerLabelFromMinutes(lateMinutes: number): string {
  const mins = Math.max(1, Math.floor(lateMinutes));
  return formatPrepDelayedBannerLabel(mins * 60);
}

/** Minutes food was marked ready after prep_ready_by_at (0 if on time). */
export function computePreparedLateMinutes(
  preparedAtIso: string,
  prepReadyByAtIso: string | null | undefined
): number {
  if (!prepReadyByAtIso) return 0;
  const lateMs = new Date(preparedAtIso).getTime() - new Date(prepReadyByAtIso).getTime();
  if (lateMs <= 0) return 0;
  return Math.max(1, Math.ceil(lateMs / 60_000));
}

/** Label for picked-up cards when order was marked ready late. */
export function formatPreparedLateLabel(lateMinutes: number | null | undefined): string | null {
  const mins = Number(lateMinutes);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  return `Ready after ${formatDurationHhMmSs(Math.max(1, Math.floor(mins)) * 60)} delay`;
}

export type PreparedLateOrder = {
  prepared_late_minutes?: number | null;
  prepared_at?: string | null;
  prep_ready_by_at?: string | null;
};

/** Stored value, or compute from prepared_at vs prep_ready_by_at for older rows. */
export function resolvePreparedLateMinutes(order: PreparedLateOrder): number | null {
  const stored = Number(order.prepared_late_minutes);
  if (Number.isFinite(stored) && stored > 0) return stored;
  if (!order.prepared_at) return null;
  const computed = computePreparedLateMinutes(order.prepared_at, order.prep_ready_by_at);
  return computed > 0 ? computed : null;
}

/** Minutes food was marked ready before prep_ready_by_at (0 if on time or late). */
export function computePreparedEarlyMinutes(
  preparedAtIso: string,
  prepReadyByAtIso: string | null | undefined,
): number {
  if (!prepReadyByAtIso) return 0;
  const earlyMs = new Date(prepReadyByAtIso).getTime() - new Date(preparedAtIso).getTime();
  if (earlyMs <= 0) return 0;
  return Math.max(1, Math.ceil(earlyMs / 60_000));
}

function prepTimingMinuteLabel(minutes: number): string {
  const mins = Math.max(1, Math.round(minutes));
  return `${mins} min${mins === 1 ? "" : "s"}`;
}

/** Zomato-style footnote on cancelled order detail — delayed or earlier preparation. */
export function formatOrderPrepTimingFootnote(order: PreparedLateOrder): string | null {
  const lateMins = resolvePreparedLateMinutes(order);
  if (lateMins != null && lateMins > 0) {
    return `Food preparation delayed by ${prepTimingMinuteLabel(lateMins)}`;
  }
  if (order.prepared_at && order.prep_ready_by_at) {
    const earlyMins = computePreparedEarlyMinutes(order.prepared_at, order.prep_ready_by_at);
    if (earlyMins > 0) {
      return `Food preparation earlier by ${prepTimingMinuteLabel(earlyMins)}`;
    }
  }
  return null;
}

export type PrepFootnoteTone = "early" | "delayed";

export function resolveOrderPrepTimingFootnote(order: PreparedLateOrder): {
  text: string;
  tone: PrepFootnoteTone;
} | null {
  const lateMins = resolvePreparedLateMinutes(order);
  if (lateMins != null && lateMins > 0) {
    return {
      text: `Food preparation delayed by ${prepTimingMinuteLabel(lateMins)}`,
      tone: "delayed",
    };
  }
  if (order.prepared_at && order.prep_ready_by_at) {
    const earlyMins = computePreparedEarlyMinutes(order.prepared_at, order.prep_ready_by_at);
    if (earlyMins > 0) {
      return {
        text: `Food preparation earlier by ${prepTimingMinuteLabel(earlyMins)}`,
        tone: "early",
      };
    }
  }
  return null;
}

export const PREP_DELAY_OPTIONS = [5, 10, 15] as const;

export function extendPrepReadyByAtIso(
  currentPrepReadyByAt: string | null | undefined,
  additionalMinutes: number,
  nowIso = new Date().toISOString()
): string {
  return computeExpectedReadyAtFromNow(additionalMinutes, nowIso);
}

/** Customer / merchant working ready time after Need more time — now + extension. */
export function computeExpectedReadyAtFromNow(
  additionalMinutes: number,
  nowIso = new Date().toISOString()
): string {
  const add = clampPrepMinutes(additionalMinutes, 5);
  const nowMs = new Date(nowIso).getTime();
  return new Date(nowMs + add * 60_000).toISOString();
}

export function formatExtraPrepTimeAddedLabel(
  lastAddedMinutes: number | null | undefined,
  totalDelayMinutes?: number | null
): string | null {
  const last = Number(lastAddedMinutes);
  if (Number.isFinite(last) && last > 0) {
    return `Extra Time Added: +${Math.round(last)} min`;
  }
  const total = Number(totalDelayMinutes);
  if (Number.isFinite(total) && total > 0) {
    return `Extra Time Added: +${Math.round(total)} min`;
  }
  return null;
}

export const PREP_DELAY_MAX_USES_NORMAL = 1;
export const PREP_DELAY_MAX_USES_BULK = 2;

export function maxPrepDelayUses(isBulkOrder: boolean): number {
  return isBulkOrder ? PREP_DELAY_MAX_USES_BULK : PREP_DELAY_MAX_USES_NORMAL;
}

/** Resolve use count from API field, with legacy fallback when column is missing. */
export function resolvePrepDelayUseCount(
  prepDelayUseCount: number | null | undefined,
  prepDelayMinutes: number | null | undefined
): number {
  if (prepDelayUseCount != null && Number.isFinite(Number(prepDelayUseCount))) {
    return Math.max(0, Math.round(Number(prepDelayUseCount)));
  }
  return (Number(prepDelayMinutes) || 0) > 0 ? 1 : 0;
}

export function canUseNeedMoreTime(
  prepDelayUseCount: number | null | undefined,
  isBulkOrder: boolean,
  prepDelayMinutes?: number | null
): boolean {
  const used = resolvePrepDelayUseCount(prepDelayUseCount, prepDelayMinutes);
  return used < maxPrepDelayUses(isBulkOrder);
}
