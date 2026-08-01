/** Immutable plan fields at merchant subscription purchase / activation. */

export type MerchantPlanSnapshotSource = {
  plan_name?: string | null;
  plan_code?: string | null;
  billing_cycle?: string | null;
  price?: number | string | null;
  benefits_json?: unknown;
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
