/**
 * Minimum available wallet balance for post-paid (cash-capable) services.
 *
 * The evaluator lives in @gatimitra/financial-rules so the backend (dispatch, duty
 * toggle, app banners) and the dashboard (Blacklist Status by Service card) decide
 * "is this rider restricted for Parcel / Person Ride" with the same code. This file
 * keeps the original import path for existing callers.
 *
 *   off     — nothing happens
 *   warn    — the rider sees the shortfall and can recharge; dispatch unaffected
 *   enforce — no new Person Ride or Parcel assignments until the balance is back
 *
 * Food is prepaid (no cash collection) so it is never restricted by this rule.
 */
export {
  MIN_BALANCE_RESTRICTED_SERVICES,
  evaluateMinWalletBalance,
  normalizeMinBalanceMode,
  riderWalletRechargeDue,
  type MinBalanceMode,
  type MinBalanceRestrictedService,
  type RiderMinBalanceStatus,
} from "@gatimitra/financial-rules";
