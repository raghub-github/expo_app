/** Rider wait at merchant pickup + 3-minute pickup window after order is ready. */

export const PICKUP_TIMER_BUDGET_SECONDS = 180;

export type PickupSheetTimerMode = "waiting" | "pickup" | "none";

export type PickupTimerOrderFields = {
  pickupWaitStartedAt?: string | null;
  pickupWaitSeconds?: number | null;
  pickupWaitFinalized?: boolean;
  pickupTimerStartedAt?: string | null;
  pickupTimerBudgetSeconds?: number | null;
  preparedAt?: string | null;
  merchantOrderReady?: boolean;
};

/** Pickup window opens when rider is at store AND order is ready (max of reach vs prepared). */
export function resolveEffectivePickupTimerStartedAt(
  order: PickupTimerOrderFields,
  merchantReady: boolean
): string | null {
  if (order.pickupTimerStartedAt) return order.pickupTimerStartedAt;
  if (!merchantReady || !order.pickupWaitStartedAt) return null;
  const reachedMs = new Date(order.pickupWaitStartedAt).getTime();
  if (!Number.isFinite(reachedMs)) return null;
  const preparedMs = order.preparedAt
    ? new Date(order.preparedAt).getTime()
    : reachedMs;
  const startMs = Math.max(
    reachedMs,
    Number.isFinite(preparedMs) ? preparedMs : reachedMs
  );
  return new Date(startMs).toISOString();
}

/** Elapsed wait seconds (counts up) while rider waits for merchant ready. */
export function resolvePickupWaitSeconds(
  pickupWaitStartedAt: string | null | undefined,
  pickupWaitSeconds: number | null | undefined,
  nowMs = Date.now()
): number {
  if (pickupWaitSeconds != null && Number.isFinite(pickupWaitSeconds)) {
    return Math.max(0, Math.floor(pickupWaitSeconds));
  }
  if (pickupWaitStartedAt) {
    const startMs = new Date(pickupWaitStartedAt).getTime();
    if (Number.isFinite(startMs)) {
      return Math.max(0, Math.floor((nowMs - startMs) / 1000));
    }
  }
  return 0;
}

export function resolvePickupSheetTimerMode(
  order: PickupTimerOrderFields,
  merchantReady: boolean
): PickupSheetTimerMode {
  if (order.pickupTimerStartedAt) return "pickup";
  if (
    order.pickupWaitStartedAt &&
    !merchantReady &&
    order.pickupWaitSeconds == null &&
    !order.pickupWaitFinalized
  ) {
    return "waiting";
  }
  if (merchantReady && order.pickupWaitStartedAt) return "pickup";
  return "none";
}

/** Countdown seconds remaining in the pickup window (3 min default). */
export function resolvePickupCountdownSeconds(
  pickupTimerStartedAt: string | null | undefined,
  budgetSeconds: number | null | undefined,
  nowMs = Date.now()
): number {
  if (!pickupTimerStartedAt) return budgetSeconds ?? PICKUP_TIMER_BUDGET_SECONDS;
  const startMs = new Date(pickupTimerStartedAt).getTime();
  if (!Number.isFinite(startMs)) return budgetSeconds ?? PICKUP_TIMER_BUDGET_SECONDS;
  const budget = budgetSeconds ?? PICKUP_TIMER_BUDGET_SECONDS;
  const elapsed = Math.floor((nowMs - startMs) / 1000);
  return Math.max(0, budget - elapsed);
}

/** M:SS countdown for pickup window (e.g. 2:47). */
export function formatPickupCountdownMmSs(remainingSeconds: number): string {
  const s = Math.max(0, Math.floor(remainingSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
