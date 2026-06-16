/** Kitchen prep delay — aligned with partnersite `order-prep-time.ts`. */

export const PLATFORM_DEFAULT_PREP_MINUTES = 30;

export type FoodPrepCountdownOrder = {
  prepReadyByAt?: string | null;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  createdAt: string;
  preparationTimeMinutes?: number | null;
  prepDelayMinutes?: number | null;
};

function clampPrepMinutes(raw: unknown, fallback = PLATFORM_DEFAULT_PREP_MINUTES): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(5, Math.min(180, Math.round(n)));
}

export function prepReadyDeadlineMs(order: FoodPrepCountdownOrder): number {
  if (order.prepReadyByAt) {
    const t = new Date(order.prepReadyByAt).getTime();
    if (Number.isFinite(t)) return t;
  }
  const base = order.acceptedAt || order.preparingAt || order.createdAt;
  const baseMs = new Date(base).getTime();
  const prepMins = clampPrepMinutes(order.preparationTimeMinutes, PLATFORM_DEFAULT_PREP_MINUTES);
  const delayMins = Math.max(0, Number(order.prepDelayMinutes) || 0);
  return baseMs + (prepMins + delayMins) * 60_000;
}

/** Whole seconds past prep deadline; 0 when on time or already ready. */
export function prepOverdueSeconds(order: FoodPrepCountdownOrder, nowMs: number): number {
  const deadline = prepReadyDeadlineMs(order);
  if (!Number.isFinite(deadline) || nowMs <= deadline) return 0;
  return Math.floor((nowMs - deadline) / 1000);
}

export function isFoodPrepDelayed(
  order: FoodPrepCountdownOrder,
  nowMs: number,
  merchantReady: boolean
): boolean {
  if (merchantReady) return false;
  return prepOverdueSeconds(order, nowMs) > 0;
}

/** `02:27:00` for any duration in seconds. */
export function formatDurationHhMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec
    .toString()
    .padStart(2, "0")}`;
}

export function formatPrepDelayedLabel(overdueSeconds: number): string {
  return `Delayed - ${formatDurationHhMmSs(overdueSeconds)}`;
}

export function foodPrepCountdownFromOrder(order: {
  prepReadyByAt?: string | null;
  acceptedAt?: string | null;
  preparingAt?: string | null;
  createdAt: string;
  preparationTimeMinutes?: number | null;
  prepDelayMinutes?: number | null;
}): FoodPrepCountdownOrder {
  return {
    prepReadyByAt: order.prepReadyByAt ?? null,
    acceptedAt: order.acceptedAt ?? null,
    preparingAt: order.preparingAt ?? null,
    createdAt: order.createdAt,
    preparationTimeMinutes: order.preparationTimeMinutes ?? null,
    prepDelayMinutes: order.prepDelayMinutes ?? null,
  };
}
