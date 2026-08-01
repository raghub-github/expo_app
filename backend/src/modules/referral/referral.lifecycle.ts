/**
 * Referral lifecycle state machine.
 * Allowed transitions are explicit; illegal jumps are rejected (or forceable for admin).
 */

export type ReferralLifecycleState =
  | "LINK_SHARED"
  | "LINK_CLICKED"
  | "PLAY_STORE_OPENED"
  | "APP_INSTALLED"
  | "FIRST_APP_OPEN"
  | "REFERRAL_APPLIED"
  | "FIRST_ORDER_PLACED"
  | "ORDER_DELIVERED"
  | "REWARD_ELIGIBLE"
  | "REWARD_GRANTED"
  | "REWARD_NOTIFIED"
  | "REWARD_FAILED"
  | "FRAUD_BLOCKED"
  | "EXPIRED"
  | "SUSPENDED"
  | "SKIPPED";

const TRANSITIONS: Record<ReferralLifecycleState, ReferralLifecycleState[]> = {
  LINK_SHARED: ["LINK_CLICKED", "EXPIRED", "SUSPENDED"],
  LINK_CLICKED: ["PLAY_STORE_OPENED", "APP_INSTALLED", "FIRST_APP_OPEN", "REFERRAL_APPLIED", "FRAUD_BLOCKED", "EXPIRED"],
  PLAY_STORE_OPENED: ["APP_INSTALLED", "FIRST_APP_OPEN", "EXPIRED", "FRAUD_BLOCKED"],
  APP_INSTALLED: ["FIRST_APP_OPEN", "REFERRAL_APPLIED", "FRAUD_BLOCKED", "EXPIRED"],
  FIRST_APP_OPEN: ["REFERRAL_APPLIED", "FRAUD_BLOCKED", "EXPIRED"],
  REFERRAL_APPLIED: [
    "FIRST_ORDER_PLACED",
    "ORDER_DELIVERED",
    "REWARD_ELIGIBLE",
    "FRAUD_BLOCKED",
    "EXPIRED",
    "SUSPENDED",
  ],
  FIRST_ORDER_PLACED: ["ORDER_DELIVERED", "EXPIRED", "SUSPENDED"],
  ORDER_DELIVERED: ["REWARD_ELIGIBLE", "REWARD_GRANTED", "SKIPPED", "EXPIRED"],
  REWARD_ELIGIBLE: ["REWARD_GRANTED", "REWARD_FAILED", "SKIPPED", "EXPIRED"],
  REWARD_GRANTED: ["REWARD_NOTIFIED", "REWARD_FAILED"],
  REWARD_NOTIFIED: [],
  REWARD_FAILED: ["REWARD_ELIGIBLE", "REWARD_GRANTED", "SKIPPED"],
  FRAUD_BLOCKED: ["SUSPENDED", "SKIPPED"],
  EXPIRED: [],
  SUSPENDED: ["REFERRAL_APPLIED", "SKIPPED"],
  SKIPPED: [],
};

export function canTransition(
  from: ReferralLifecycleState | null | undefined,
  to: ReferralLifecycleState,
): boolean {
  if (!from) return true;
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(
  from: ReferralLifecycleState | null | undefined,
  to: ReferralLifecycleState,
  force = false,
): void {
  if (force || canTransition(from, to)) return;
  throw new Error(`invalid_lifecycle_transition:${from ?? "null"}->${to}`);
}

/** Ordered funnel stages for analytics. */
export const FUNNEL_STAGES: ReferralLifecycleState[] = [
  "LINK_SHARED",
  "LINK_CLICKED",
  "PLAY_STORE_OPENED",
  "APP_INSTALLED",
  "FIRST_APP_OPEN",
  "REFERRAL_APPLIED",
  "FIRST_ORDER_PLACED",
  "ORDER_DELIVERED",
  "REWARD_ELIGIBLE",
  "REWARD_GRANTED",
  "REWARD_NOTIFIED",
];
