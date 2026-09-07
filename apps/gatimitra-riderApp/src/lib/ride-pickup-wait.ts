/** Person ride: waiting timer from rider reach until passenger shares pickup OTP. */

export type RidePickupWaitFields = {
  pickupWaitStartedAt?: string | null;
  pickupWaitSeconds?: number | null;
  pickupWaitFinalized?: boolean;
  pickupTimerBudgetSeconds?: number | null;
  ridePickupWaitFreeMinutes?: number | null;
  ridePickupWaitingChargePerMin?: number | null;
  ridePickupWaitingMaxCharge?: number | null;
  pickupOtpVerified?: boolean;
};

export const DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES = 2;

export function isRidePickupWaitActive(order: RidePickupWaitFields): boolean {
  return !!order.pickupWaitStartedAt && !order.pickupOtpVerified && !order.pickupWaitFinalized;
}

export function resolveRidePickupFreeMinutes(order: RidePickupWaitFields): number {
  if (order.pickupTimerBudgetSeconds != null && order.pickupTimerBudgetSeconds > 0) {
    return Math.round(order.pickupTimerBudgetSeconds / 60);
  }
  const minutes = Number(order.ridePickupWaitFreeMinutes);
  if (Number.isFinite(minutes) && minutes >= 0) return Math.round(minutes);
  return DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
}

export function resolveRidePickupFreeBudgetSeconds(order: RidePickupWaitFields): number {
  if (order.pickupTimerBudgetSeconds != null && order.pickupTimerBudgetSeconds > 0) {
    return Math.max(0, Math.floor(order.pickupTimerBudgetSeconds));
  }
  return resolveRidePickupFreeMinutes(order) * 60;
}

export function resolveRidePickupWaitElapsedSeconds(
  order: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  if (order.pickupWaitSeconds != null && Number.isFinite(order.pickupWaitSeconds)) {
    return Math.max(0, Math.floor(order.pickupWaitSeconds));
  }
  const startedAt = order.pickupWaitStartedAt?.trim();
  if (!startedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export function resolveRidePickupFreeRemainingSeconds(
  order: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  const freeBudget = resolveRidePickupFreeBudgetSeconds(order);
  const elapsed = resolveRidePickupWaitElapsedSeconds(order, nowMs);
  return Math.max(0, freeBudget - elapsed);
}

export function resolveRidePickupBillableSeconds(
  order: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  const freeBudget = resolveRidePickupFreeBudgetSeconds(order);
  const elapsed = resolveRidePickupWaitElapsedSeconds(order, nowMs);
  return Math.max(0, elapsed - freeBudget);
}

export function formatRideWaitMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function buildRidePickupWaitRiderLabel(order: RidePickupWaitFields, nowMs = Date.now()): string {
  const remaining = resolveRidePickupFreeRemainingSeconds(order, nowMs);
  if (remaining > 0) {
    return `Free wait · ${formatRideWaitMmSs(remaining)} left`;
  }
  const billable = resolveRidePickupBillableSeconds(order, nowMs);
  const charge = estimateRidePickupWaitingCharge(order, nowMs);
  // Show the live ₹ the rider is earning once the free window is over (matches the customer app).
  const chargeSuffix = charge > 0 ? ` · +₹${Math.round(charge)}` : "";
  return `Waiting for OTP · ${formatRideWaitMmSs(billable)}${chargeSuffix}`;
}

/** ₹/min the rider earns after the free window (0 when not configured). */
export function resolveRidePickupWaitingChargePerMin(order: RidePickupWaitFields): number {
  const perMin = Number(order.ridePickupWaitingChargePerMin);
  return Number.isFinite(perMin) && perMin > 0 ? perMin : 0;
}

/**
 * Live estimated pickup-waiting ₹ from the billable seconds and per-minute rate, capped to the
 * rule's max charge when present. Returns 0 while still within the free window. Mirrors the
 * customer app's estimate so both sides show the same live number as the wait accrues.
 */
export function estimateRidePickupWaitingCharge(
  order: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  const perMin = resolveRidePickupWaitingChargePerMin(order);
  if (perMin <= 0) return 0;
  const billableSec = resolveRidePickupBillableSeconds(order, nowMs);
  if (billableSec <= 0) return 0;
  const billableMinutes = Math.ceil(billableSec / 60);
  const gross = Math.round(billableMinutes * perMin * 10) / 10;
  const cap = Number(order.ridePickupWaitingMaxCharge);
  return Number.isFinite(cap) && cap > 0 ? Math.min(gross, cap) : gross;
}
