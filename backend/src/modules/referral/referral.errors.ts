/**
 * Canonical errors for global Customer / Rider / Merchant referral service toggles.
 * Super Admin toggles are the source of truth; clients must not invent their own.
 */

export const REFERRAL_SERVICE_DISABLED = "REFERRAL_SERVICE_DISABLED";
/** Legacy apply/share error — treat as the same disable signal. */
export const REFERRAL_SERVICE_DISABLED_LEGACY = "referral_disabled";

export const REFERRAL_SERVICE_DISABLED_API_MESSAGE =
  "Referral service is currently unavailable.";

/** User-facing copy for every app / Partner Site / AM Dashboard. */
export const REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE =
  "This referral code is no longer available.";

export function isReferralServiceDisabledError(error: string | null | undefined): boolean {
  const e = String(error ?? "").trim();
  return e === REFERRAL_SERVICE_DISABLED || e === REFERRAL_SERVICE_DISABLED_LEGACY;
}

export function referralServiceDisabledPayload() {
  return {
    ok: false as const,
    valid: false as const,
    error: REFERRAL_SERVICE_DISABLED,
    code: REFERRAL_SERVICE_DISABLED,
    message: REFERRAL_SERVICE_DISABLED_API_MESSAGE,
    userMessage: REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
  };
}

export function httpStatusForReferralApplyError(error: string): number {
  if (isReferralServiceDisabledError(error)) return 409;
  if (error === "forbidden") return 403;
  return 400;
}
