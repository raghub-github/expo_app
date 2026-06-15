/** Person ride: waiting timer from rider reach until passenger shares pickup OTP. */

export type RidePickupWaitFields = {
  riderReachedPickupAt?: string | null;
  pickupOtpVerifiedAt?: string | null;
  pickupWaitSeconds?: number | null;
  pickupWaitFreeMinutes?: number | null;
};

export const DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES = 2;

export function isRidePickupWaitActive(fields: RidePickupWaitFields): boolean {
  return !!fields.riderReachedPickupAt?.trim() && !fields.pickupOtpVerifiedAt;
}

export function resolveRidePickupFreeMinutes(fields: RidePickupWaitFields): number {
  const minutes = Number(fields.pickupWaitFreeMinutes);
  if (Number.isFinite(minutes) && minutes >= 0) return Math.round(minutes);
  return DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
}

export function resolveRidePickupFreeBudgetSeconds(fields: RidePickupWaitFields): number {
  return resolveRidePickupFreeMinutes(fields) * 60;
}

export function resolveRidePickupWaitElapsedSeconds(
  fields: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  if (fields.pickupWaitSeconds != null && Number.isFinite(fields.pickupWaitSeconds)) {
    return Math.max(0, Math.floor(fields.pickupWaitSeconds));
  }
  const startedAt = fields.riderReachedPickupAt?.trim();
  if (!startedAt) return 0;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

export function resolveRidePickupFreeRemainingSeconds(
  fields: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  const freeBudget = resolveRidePickupFreeBudgetSeconds(fields);
  const elapsed = resolveRidePickupWaitElapsedSeconds(fields, nowMs);
  return Math.max(0, freeBudget - elapsed);
}

export function resolveRidePickupBillableSeconds(
  fields: RidePickupWaitFields,
  nowMs = Date.now()
): number {
  const freeBudget = resolveRidePickupFreeBudgetSeconds(fields);
  const elapsed = resolveRidePickupWaitElapsedSeconds(fields, nowMs);
  return Math.max(0, elapsed - freeBudget);
}

export function formatRideWaitMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** hh:mm:ss for pickup waiting display on live tracking. */
export function formatRideWaitHhMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function resolveRidePickupWaitingChargePerMin(
  checkoutMetadata?: Record<string, unknown> | null
): number {
  if (!checkoutMetadata || typeof checkoutMetadata !== "object") return 0;
  const raw =
    checkoutMetadata.pickupWaitingChargePerMin ??
    checkoutMetadata.waitingChargePerMin ??
    checkoutMetadata.waiting_charge_per_min;
  const perMin = Number(raw);
  if (Number.isFinite(perMin) && perMin > 0) return perMin;
  const note =
    typeof checkoutMetadata.waitingChargeNote === "string"
      ? checkoutMetadata.waitingChargeNote
      : null;
  if (note) {
    const fromNote = note.match(/₹\s*(\d+(?:\.\d+)?)\s*\/\s*min/i);
    if (fromNote?.[1]) {
      const parsed = Number(fromNote[1]);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }
  return 0;
}

/** Billable pickup waiting charge (₹) from elapsed seconds and per-minute rate. */
export function estimateRidePickupWaitingCharge(
  fields: RidePickupWaitFields,
  chargePerMin: number,
  nowMs = Date.now()
): number {
  if (chargePerMin <= 0) return 0;
  const billableSec = resolveRidePickupBillableSeconds(fields, nowMs);
  if (billableSec <= 0) return 0;
  const billableMinutes = Math.ceil(billableSec / 60);
  return Math.round(billableMinutes * chargePerMin * 10) / 10;
}

export function formatRideWaitMinutesCeil(remainingSeconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, remainingSeconds) / 60));
}

export function buildRidePickupWaitCustomerBanner(fields: RidePickupWaitFields, nowMs = Date.now()): string {
  const remaining = resolveRidePickupFreeRemainingSeconds(fields, nowMs);
  if (remaining > 0) {
    const mins = formatRideWaitMinutesCeil(remaining);
    return `Share OTP in ${mins}m — avoid wait fees`;
  }
  return "Share OTP now — waiting fees may apply";
}

/** Estimate font size so banner copy stays on one line inside the pill. */
export function fitRideWaitBannerFontSize(
  text: string,
  screenWidth: number,
  baseSize = 13,
  minSize = 9
): number {
  const reserved = 52;
  const available = Math.max(120, screenWidth - reserved);
  const charFactor = 0.5;
  let size = baseSize;
  while (size > minSize && text.length * size * charFactor > available) {
    size -= 0.25;
  }
  return Math.max(minSize, size);
}

export function buildRidePickupWaitRiderLabel(fields: RidePickupWaitFields, nowMs = Date.now()): string {
  const remaining = resolveRidePickupFreeRemainingSeconds(fields, nowMs);
  if (remaining > 0) {
    return `Free wait · ${formatRideWaitMmSs(remaining)} left`;
  }
  const billable = resolveRidePickupBillableSeconds(fields, nowMs);
  return `Waiting for OTP · ${formatRideWaitMmSs(billable)}`;
}
