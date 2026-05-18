import type { OrdersFoodRow } from '@/lib/types/food-orders';

export const PREP_TIME_MIN = 5;
export const PREP_TIME_MAX = 180;
export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type PrepTimeSource = 'merchant' | 'store_default';

export function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(PREP_TIME_MIN, Math.min(PREP_TIME_MAX, Math.round(n)));
}

/** Store default from merchant_stores.avg_preparation_time_minutes or platform default. */
export function resolveStoreDefaultPrepMinutes(storeAvgPrepMinutes: unknown): number {
  return clampPrepMinutes(storeAvgPrepMinutes, PLATFORM_DEFAULT_PREP_MINUTES);
}

/** Initial prep minutes shown in accept modal before merchant adjusts. */
export function resolveInitialPrepMinutesForOrder(
  order: OrdersFoodRow,
  storeDefaultMinutes: number
): number {
  if (order.preparation_time_minutes != null && Number(order.preparation_time_minutes) > 0) {
    return clampPrepMinutes(order.preparation_time_minutes, storeDefaultMinutes);
  }
  return storeDefaultMinutes;
}

export function computePrepReadyByAtIso(acceptedAtIso: string, prepMinutes: number): string {
  const base = new Date(acceptedAtIso).getTime();
  return new Date(base + clampPrepMinutes(prepMinutes) * 60_000).toISOString();
}

/** Deadline for "Order ready" countdown — prefers committed prep_ready_by_at. */
export function prepReadyDeadlineMs(order: OrdersFoodRow): number {
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
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

/** Prep window start (for progress bar fill). */
export function prepReadyWindowStartMs(order: OrdersFoodRow): number {
  const deadline = prepReadyDeadlineMs(order);
  const mins = clampPrepMinutes(order.preparation_time_minutes, PLATFORM_DEFAULT_PREP_MINUTES);
  if (order.prep_ready_by_at) {
    return deadline - mins * 60_000;
  }
  const base = order.accepted_at || order.preparing_at || order.created_at;
  return new Date(base).getTime();
}

/** 0 = time up, 1 = full prep window remaining (for depleting button fill). */
export function prepReadyTimeRemainingRatio(order: OrdersFoodRow, nowMs: number): number {
  const deadline = prepReadyDeadlineMs(order);
  const start = prepReadyWindowStartMs(order);
  const totalMs = Math.max(60_000, deadline - start);
  const leftMs = Math.max(0, deadline - nowMs);
  return Math.min(1, Math.max(0, leftMs / totalMs));
}

export function prepReadyCountdownLabel(
  order: OrdersFoodRow,
  nowMs: number,
  opts?: { prefix?: string; expiredLabel?: string }
): { label: string; disabled: boolean; secondsLeft: number } {
  const prefix = opts?.prefix ?? 'Order ready';
  const expiredLabel = opts?.expiredLabel ?? 'Order ready';
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

export type AcceptPrepCommitment = {
  prepMinutes: number;
  prepReadyByAt: string;
  prepTimeSource: PrepTimeSource;
};

/** Resolve prep minutes + ready-by when merchant accepts an order. */
export const PREP_DELAY_OPTIONS = [5, 10, 15] as const;

export function isPrepDeadlinePassed(order: OrdersFoodRow, nowMs: number): boolean {
  return nowMs >= prepReadyDeadlineMs(order);
}

/** True when prep countdown has finished (Mark as ready without timer). */
export function isPrepCountdownExpired(order: OrdersFoodRow, nowMs: number): boolean {
  return prepReadyCountdownLabel(order, nowMs).secondsLeft <= 0;
}

/** Minutes food was marked ready after prep_ready_by_at (0 if on time). */
export function computePreparedLateMinutes(
  preparedAtIso: string,
  prepReadyByAtIso: string | null | undefined
): number {
  if (!prepReadyByAtIso) return 0;
  const lateMs = new Date(preparedAtIso).getTime() - new Date(prepReadyByAtIso).getTime();
  if (lateMs <= 0) return 0;
  return Math.ceil(lateMs / 60_000);
}

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
