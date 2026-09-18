export const RC_PAYMENT_BLOCKING_STATES = new Set([
  // Photo still required (mismatch) or rejected — must re-upload before pay.
  // MANUAL_REVIEW_PENDING intentionally NOT blocking: rider may finish onboarding + pay.
  "NAME_MISMATCH",
  "MANUAL_REJECTED",
]);

export const RC_PAYMENT_ALLOWED_STATES = new Set([
  "AUTO_VERIFIED",
  "MANUAL_VERIFIED",
  // Submitted for agent review — payment/onboarding may proceed; activation waits.
  "MANUAL_REVIEW_PENDING",
]);

export const RC_APPROVED_FOR_VEHICLE_SHEET_STATES = new Set([
  "AUTO_VERIFIED",
  "MANUAL_VERIFIED",
]);

export function isRcBlockingOnboardingPayment(state?: string | null): boolean {
  if (!state) return false;
  return RC_PAYMENT_BLOCKING_STATES.has(state);
}

export function isRcAcceptableForOnboardingPayment(state?: string | null, skipped = false): boolean {
  if (skipped) return true;
  if (!state) return true;
  return RC_PAYMENT_ALLOWED_STATES.has(state);
}

/** True when Cashfree/manual RC is fully approved — safe to show vehicle complete sheet. */
export function isRcApprovedForVehicleSheet(state?: string | null): boolean {
  if (!state) return false;
  return RC_APPROVED_FOR_VEHICLE_SHEET_STATES.has(state);
}

export function isRcManualReviewPending(state?: string | null): boolean {
  return state === "MANUAL_REVIEW_PENDING" || state === "AUTO_VERIFICATION_PENDING";
}

/** Rejected or soft-mismatch still needing a new photo/upload. */
export function isRcRejectedOrNeedsReupload(state?: string | null): boolean {
  return state === "MANUAL_REJECTED" || state === "NAME_MISMATCH";
}
