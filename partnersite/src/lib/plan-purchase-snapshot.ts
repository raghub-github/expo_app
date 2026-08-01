/**
 * Immutable plan fields captured at subscription purchase / activation.
 * Prefer these over live merchant_plans joins in history UIs.
 */

export type MerchantPlanSnapshotSource = {
  plan_name?: string | null;
  plan_code?: string | null;
  billing_cycle?: string | null;
  price?: number | string | null;
  benefits_json?: unknown;
  gst_percent?: number | string | null;
};

export type PlanPurchaseSnapshot = {
  plan_name_snapshot: string;
  plan_code_snapshot: string | null;
  billing_cycle_snapshot: string | null;
  plan_list_price_paise: number;
  plan_benefits_snapshot: unknown | null;
};

export function buildPlanPurchaseSnapshot(
  plan: MerchantPlanSnapshotSource | null | undefined
): PlanPurchaseSnapshot {
  const listPrice = Number(plan?.price ?? 0);
  const listPaise = Number.isFinite(listPrice) ? Math.round(listPrice * 100) : 0;
  return {
    plan_name_snapshot: String(plan?.plan_name ?? "Plan").trim() || "Plan",
    plan_code_snapshot: plan?.plan_code != null ? String(plan.plan_code) : null,
    billing_cycle_snapshot:
      plan?.billing_cycle != null ? String(plan.billing_cycle) : null,
    plan_list_price_paise: listPaise,
    plan_benefits_snapshot:
      plan?.benefits_json != null && typeof plan.benefits_json === "object"
        ? plan.benefits_json
        : null,
  };
}

/** Compute entitlement end from catalog billing cycle (for new purchases only). */
export function expiryFromBillingCycle(from: Date, billingCycle: string | null | undefined): Date {
  const end = new Date(from);
  const cycle = String(billingCycle || "MONTHLY")
    .toUpperCase()
    .replace(/-/g, "_");
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else if (cycle === "SEMI_YEARLY" || cycle === "SEMIYEARLY") {
    end.setMonth(end.getMonth() + 6);
  } else if (cycle === "QUARTERLY") {
    end.setMonth(end.getMonth() + 3);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

export function resolveHistoricalPlanName(row: {
  plan_name_snapshot?: string | null;
  plan_name?: string | null;
  merchant_plans?: { plan_name?: string | null } | null;
}): string {
  return (
    (row.plan_name_snapshot && String(row.plan_name_snapshot).trim()) ||
    (row.merchant_plans?.plan_name && String(row.merchant_plans.plan_name).trim()) ||
    (row.plan_name && String(row.plan_name).trim()) ||
    "Plan"
  );
}

export function resolveHistoricalPlanCode(row: {
  plan_code_snapshot?: string | null;
  plan_code?: string | null;
  merchant_plans?: { plan_code?: string | null } | null;
}): string | null {
  const v =
    row.plan_code_snapshot ??
    row.merchant_plans?.plan_code ??
    row.plan_code ??
    null;
  return v != null && String(v).trim() ? String(v) : null;
}
