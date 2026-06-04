export const PREP_TIME_MIN = 5;
export const PREP_TIME_MAX = 180;
export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type PrepTimeSource = 'merchant' | 'store_default';

export function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, Math.round(n)));
}

export function resolveStoreDefaultPrepMinutes(storeAvgPrepMinutes: unknown): number {
  return clampPrepMinutes(storeAvgPrepMinutes, PLATFORM_DEFAULT_PREP_MINUTES);
}

export function computePrepReadyByAtIso(acceptedAtIso: string, prepMinutes: number): string {
  const base = new Date(acceptedAtIso).getTime();
  return new Date(base + clampPrepMinutes(prepMinutes) * 60_000).toISOString();
}

/** Minimal order shape for prep countdown UI (partnersite + API). */
export type PrepCountdownOrder = {
  prep_ready_by_at?: string | null;
  accepted_at?: string | null;
  preparing_at?: string | null;
  created_at: string;
  preparation_time_minutes?: number | null;
  /** Cumulative minutes added via "Need more time" (used when prep_ready_by_at missing). */
  prep_delay_minutes?: number | null;
  eta_seconds?: number | null;
  prepared_late_minutes?: number | null;
};

/** Deadline for "Mark as ready" countdown — prefers committed prep_ready_by_at (includes need-more-time). */
export function prepReadyDeadlineMs(order: PrepCountdownOrder): number {
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
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Prep window start (for progress bar fill). */
export function prepReadyWindowStartMs(order: PrepCountdownOrder): number {
  const deadline = prepReadyDeadlineMs(order);
  const mins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  if (order.prep_ready_by_at) {
    return deadline - mins * 60_000;
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  return new Date(base).getTime();
}

/** 0 = time up, 1 = full prep window remaining (for depleting button fill). */
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
  const prefix = opts?.prefix ?? 'Mark as ready';
  const expiredLabel = opts?.expiredLabel ?? 'Mark as ready';
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

export function isPrepPipelineStatus(status: string | null | undefined): boolean {
  const st = String(status || '').toUpperCase();
  return st === 'ACCEPTED' || st === 'PREPARING';
}

export function isPrepDeadlinePassed(order: PrepCountdownOrder, nowMs: number): boolean {
  return nowMs >= prepReadyDeadlineMs(order);
}

/** True when prep countdown has finished (Mark as ready without timer). */
export function isPrepCountdownExpired(
  order: PrepCountdownOrder,
  nowMs: number,
  opts?: { prefix?: string; expiredLabel?: string }
): boolean {
  return prepReadyCountdownLabel(order, nowMs, opts).secondsLeft <= 0;
}

/** Whole minutes past prep deadline (KPT + need-more-time); updates with nowMs each tick. */
export function prepOverdueMinutes(order: PrepCountdownOrder, nowMs: number): number {
  const deadline = prepReadyDeadlineMs(order);
  if (!Number.isFinite(deadline) || nowMs <= deadline) return 0;
  return Math.max(1, Math.floor((nowMs - deadline) / 60_000));
}

export function formatPrepDelayedBannerLabel(overdueMinutes: number): string {
  const mins = Math.max(1, overdueMinutes);
  return `${mins} min delayed`;
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
  return `Ready after ${mins} min delay`;
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

export const PREP_DELAY_OPTIONS = [5, 10, 15] as const;

export function extendPrepReadyByAtIso(
  currentPrepReadyByAt: string | null | undefined,
  additionalMinutes: number,
  nowIso = new Date().toISOString()
): string {
  const add = clampPrepMinutes(additionalMinutes, 5);
  const nowMs = new Date(nowIso).getTime();
  const baseMs = currentPrepReadyByAt
    ? Math.max(nowMs, new Date(currentPrepReadyByAt).getTime())
    : nowMs;
  return new Date(baseMs + add * 60_000).toISOString();
}

export function deliveryEtaMinutesLabel(etaSeconds: number | null | undefined): string | null {
  if (etaSeconds == null || !Number.isFinite(etaSeconds) || etaSeconds <= 0) return null;
  const mins = Math.max(1, Math.round(etaSeconds / 60));
  return `Delivering in ${mins} min${mins === 1 ? '' : 's'}`;
}

export type AcceptPrepCommitment = {
  prepMinutes: number;
  prepReadyByAt: string;
  prepTimeSource: PrepTimeSource;
};

export function resolveAcceptPrepCommitment(input: {
  acceptedAtIso: string;
  storeDefaultMinutes: number;
  bodyPrepMinutes?: unknown;
  existingOrderPrepMinutes?: unknown;
}): AcceptPrepCommitment {
  const storeDefault = clampPrepMinutes(input.storeDefaultMinutes);
  const hasBody =
    input.bodyPrepMinutes != null &&
    input.bodyPrepMinutes !== '' &&
    Number.isFinite(Number(input.bodyPrepMinutes));
  const prepMinutes = hasBody
    ? clampPrepMinutes(input.bodyPrepMinutes, storeDefault)
    : input.existingOrderPrepMinutes != null && Number(input.existingOrderPrepMinutes) > 0
      ? clampPrepMinutes(input.existingOrderPrepMinutes, storeDefault)
      : storeDefault;
  const prepTimeSource: PrepTimeSource = hasBody ? 'merchant' : 'store_default';
  return {
    prepMinutes,
    prepReadyByAt: computePrepReadyByAtIso(input.acceptedAtIso, prepMinutes),
    prepTimeSource,
  };
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
