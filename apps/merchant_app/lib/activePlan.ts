/**
 * Active subscription plan — shared between Profile (Current Plan card) and Plans screen.
 * Update when user subscribes or when API returns current subscription.
 */

export const ACTIVE_PLAN_CODE = "FREE";

export const ACTIVE_PLAN_DISPLAY_NAME: Record<string, string> = {
  FREE: "Free Plan",
  PREMIUM: "Premium Plan",
  ENTERPRISE: "Pro Plan",
};

export function getActivePlanDisplayName(code: string): string {
  const key = (code || "").toUpperCase();
  return (ACTIVE_PLAN_DISPLAY_NAME[key] ?? code) || "Plan";
}

/** Expiry and trial — replace with API data when available. */
export const ACTIVE_PLAN_EXPIRY = "Mar 15, 2026";
export const ACTIVE_PLAN_TRIAL = "14 days left";
