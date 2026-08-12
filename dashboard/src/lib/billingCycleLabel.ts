/**
 * Billing cycle display labels — keep in sync with partnersite `lib/billingCycleLabel.ts`
 * and merchant app so plan price lines never drift.
 */

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

export function billingCycleLabel(billingCycle: string | null | undefined): string {
  const c = normalizeCycle(billingCycle);
  if (c === "YEARLY" || c === "YEAR" || c === "ANNUAL") return "Yearly";
  if (c === "SEMI_YEARLY" || c === "SEMIYEARLY" || c === "SEMI_ANNUAL" || c === "SEMIANNUAL") {
    return "Semi-yearly";
  }
  if (c === "QUARTERLY" || c === "QUARTER") return "Quarterly";
  return "Monthly";
}
