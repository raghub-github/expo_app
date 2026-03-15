/**
 * Real-time bank/UPI verification (no payout) – limits and constants.
 */

export const MAX_BANK_ATTEMPTS_PER_DAY = 3;
export const MAX_UPI_ATTEMPTS_PER_DAY = 5;
export const MAX_BANK_ACCOUNTS_PER_STORE = 3;
export const MAX_UPI_ACCOUNTS_PER_STORE = 5;
export const VERIFICATION_COOLDOWN_SEC = 10;

export const RAZORPAY_VALIDATION_TYPE_PENNYLESS = "pennyiless" as const;
