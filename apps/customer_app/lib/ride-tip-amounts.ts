/** Discrete tip steps shown on pre-book and post-timeout boost sheets. */
export const RIDE_TIP_STEPS = [0, 10, 20, 30, 40, 50] as const;

export type RideTipStep = (typeof RIDE_TIP_STEPS)[number];

export function isValidRideTipAmount(amount: number): amount is RideTipStep {
  return (RIDE_TIP_STEPS as readonly number[]).includes(amount);
}

/** Pre-book tip sheet only for long trips (pickup → drop route distance). */
export const PREBOOK_TIP_MIN_DISTANCE_KM = 20;

export function shouldShowPreBookTipSheet(tripKm: number | null | undefined): boolean {
  return tripKm != null && Number.isFinite(tripKm) && tripKm > PREBOOK_TIP_MIN_DISTANCE_KM;
}
