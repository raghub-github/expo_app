/**
 * Waiting charge engine — free minutes, per-min rate, optional max, funding split.
 * Pure math + policy normalization. Callers load policy from service_payout_rules.
 */

export type ComponentFundingMode = "CUSTOMER_100" | "COMPANY_100" | "SHARED";

export type WaitingChargePolicy = {
  freeMinutes: number;
  chargePerMin: number;
  maxCharge?: number | null;
  fundingMode?: ComponentFundingMode | null;
  customerSharePct?: number | null;
  companySharePct?: number | null;
};

export type WaitingChargeResult = {
  gross: number;
  capped: number;
  customerShare: number;
  companyShare: number;
  fundingMode: ComponentFundingMode;
  chargeableMinutes: number;
};

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function pos(n: number | null | undefined): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

export function normalizeFundingShares(
  mode: ComponentFundingMode | null | undefined,
  customerPct: number | null | undefined,
  companyPct: number | null | undefined
): { mode: ComponentFundingMode; customerPct: number; companyPct: number } {
  const m = (mode ?? "CUSTOMER_100") as ComponentFundingMode;
  if (m === "CUSTOMER_100") return { mode: m, customerPct: 100, companyPct: 0 };
  if (m === "COMPANY_100") return { mode: m, customerPct: 0, companyPct: 100 };
  const c = Math.max(0, Math.min(100, Number(customerPct) || 0));
  const co = Math.max(0, Math.min(100, Number(companyPct) || 0));
  if (c + co <= 0) return { mode: "SHARED", customerPct: 50, companyPct: 50 };
  const sum = c + co;
  return {
    mode: "SHARED",
    customerPct: round2((c / sum) * 100),
    companyPct: round2((co / sum) * 100),
  };
}

/**
 * Compute waiting charge from finalized wait seconds.
 * Waiting starts after rider reaches pickup (caller supplies seconds since arrival).
 */
export function computeWaitingCharge(
  pickupWaitSeconds: number,
  policy: WaitingChargePolicy
): WaitingChargeResult {
  const freeBudgetSec = Math.max(0, Math.round(pos(policy.freeMinutes) * 60));
  const waitSec = Math.max(0, Math.round(pickupWaitSeconds));
  const billableSec = Math.max(0, waitSec - freeBudgetSec);
  const chargeableMinutes = billableSec <= 0 ? 0 : Math.ceil(billableSec / 60);
  const perMin = pos(policy.chargePerMin);
  let gross = chargeableMinutes > 0 && perMin > 0 ? round2(chargeableMinutes * perMin) : 0;

  const max = policy.maxCharge != null ? pos(policy.maxCharge) : null;
  const capped = max != null && max > 0 ? round2(Math.min(gross, max)) : gross;

  const funding = normalizeFundingShares(
    policy.fundingMode,
    policy.customerSharePct,
    policy.companySharePct
  );
  const customerShare = round2((capped * funding.customerPct) / 100);
  const companyShare = round2(Math.max(0, capped - customerShare));

  return {
    gross,
    capped,
    customerShare,
    companyShare,
    fundingMode: funding.mode,
    chargeableMinutes,
  };
}
