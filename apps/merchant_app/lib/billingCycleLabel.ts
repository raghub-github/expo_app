/**
 * Billing cycle labels — keep merchant app + partnersite in sync.
 * Source of truth for display suffixes / human labels from DB `billing_cycle`.
 */

export type BillingCycleCode =
  | "MONTHLY"
  | "QUARTERLY"
  | "SEMI_YEARLY"
  | "YEARLY"
  | string;

function normalizeCycle(raw: string | null | undefined): string {
  return String(raw || "MONTHLY")
    .trim()
    .toUpperCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
}

/** Short suffix for price lines: ₹299/mo, ₹3/semi-yr */
export function billingCycleSuffix(billingCycle: string | null | undefined): string {
  const c = normalizeCycle(billingCycle);
  if (c === "YEARLY" || c === "YEAR" || c === "ANNUAL") return "yr";
  if (c === "SEMI_YEARLY" || c === "SEMIYEARLY" || c === "SEMI_ANNUAL" || c === "SEMIANNUAL") {
    return "semi-yr";
  }
  if (c === "QUARTERLY" || c === "QUARTER") return "qtr";
  return "mo";
}

/** Human label for lists / confirm sheets */
export function billingCycleLabel(billingCycle: string | null | undefined): string {
  const c = normalizeCycle(billingCycle);
  if (c === "YEARLY" || c === "YEAR" || c === "ANNUAL") return "Yearly";
  if (c === "SEMI_YEARLY" || c === "SEMIYEARLY" || c === "SEMI_ANNUAL" || c === "SEMIANNUAL") {
    return "Semi-yearly";
  }
  if (c === "QUARTERLY" || c === "QUARTER") return "Quarterly";
  return "Monthly";
}

export function formatPlanPrice(
  price: number,
  billingCycle: string | null | undefined
): string {
  if (!Number.isFinite(price) || price <= 0) return "Free";
  return `₹${price}/${billingCycleSuffix(billingCycle)}`;
}
