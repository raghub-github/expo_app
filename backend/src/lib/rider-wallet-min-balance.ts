/**
 * Minimum available wallet balance for post-paid (cash-capable) services.
 *
 * A rider who collects cash owes the platform its share out of their wallet, so
 * the wallet needs headroom before they take another cash-capable job. Below the
 * configured minimum (₹200 by default, ride_wallet_config.min_wallet_balance):
 *
 *   off     — nothing happens
 *   warn    — the rider sees the shortfall and can recharge; dispatch unaffected
 *   enforce — no new Person Ride or Parcel assignments until the balance is back
 *
 * Food is prepaid (no cash collection) so it is never restricted by this rule; a
 * restricted rider can still earn back above the minimum on food.
 *
 * Computed from the committed wallet balance every time restrictions are read,
 * so it can never go stale or be lifted by the app — there is no stored block row
 * to forget to clear after a recharge. The negative-wallet blocks are separate
 * and unchanged.
 */

export type MinBalanceMode = "off" | "warn" | "enforce";

export const MIN_BALANCE_RESTRICTED_SERVICES = ["parcel", "person_ride"] as const;
export type MinBalanceRestrictedService = (typeof MIN_BALANCE_RESTRICTED_SERVICES)[number];

export type RiderMinBalanceStatus = {
  mode: MinBalanceMode;
  threshold: number;
  balance: number;
  /** Exact recharge that brings the balance back to the minimum. */
  shortfall: number;
  belowMinimum: boolean;
  /** True only in enforce mode while below the minimum. */
  restricted: boolean;
  restrictedServices: MinBalanceRestrictedService[];
  message: string | null;
};

export function normalizeMinBalanceMode(value: unknown): MinBalanceMode {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "warn" || v === "enforce" ? v : "off";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rupees(n: number): string {
  return Number.isInteger(n) ? `₹${n}` : `₹${n.toFixed(2)}`;
}

export function evaluateMinWalletBalance(input: {
  balance: number;
  threshold: number;
  mode: MinBalanceMode;
}): RiderMinBalanceStatus {
  const balance = round2(Number.isFinite(input.balance) ? input.balance : 0);
  const threshold = round2(Math.max(0, Number.isFinite(input.threshold) ? input.threshold : 0));
  const mode = input.mode;
  const belowMinimum = mode !== "off" && threshold > 0 && balance < threshold;
  const shortfall = belowMinimum ? round2(threshold - balance) : 0;
  const restricted = belowMinimum && mode === "enforce";
  let message: string | null = null;
  if (restricted) {
    message = `Your available wallet balance is below ${rupees(threshold)}. Recharge your wallet to continue receiving new assignments.`;
  } else if (belowMinimum) {
    message = `Your available wallet balance is below ${rupees(threshold)}. Recharge ${rupees(shortfall)} to keep receiving Ride and Parcel assignments without interruption.`;
  }
  return {
    mode,
    threshold,
    balance,
    shortfall,
    belowMinimum,
    restricted,
    restrictedServices: restricted ? [...MIN_BALANCE_RESTRICTED_SERVICES] : [],
    message,
  };
}

/**
 * What a rider must pay to clear their wallet: the negative balance, or — while
 * the minimum-balance policy is active — the shortfall up to the minimum.
 */
export function riderWalletRechargeDue(input: {
  balance: number;
  threshold: number;
  mode: MinBalanceMode;
}): number {
  const negative = input.balance < 0 ? round2(-input.balance) : 0;
  const status = evaluateMinWalletBalance(input);
  return round2(Math.max(negative, status.shortfall));
}
