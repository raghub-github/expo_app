/**
 * Waiting charge engine — free minutes, per-min rate, duration + amount caps, funding split.
 * Pure math + policy normalization. Callers load policy from service_payout_rules.
 *
 * BOTH caps are ALWAYS enforced (audit Problem A): a rule's own value when set, else the
 * absolute safety ceiling from @gatimitra/slab-pricing. A waiting charge can therefore
 * never grow unbounded, regardless of geo configuration.
 */
import {
  WAITING_DEFAULT_MAX_MINUTES,
  WAITING_DEFAULT_MAX_CHARGE,
} from "@gatimitra/slab-pricing";

export type ComponentFundingMode = "CUSTOMER_100" | "COMPANY_100" | "MERCHANT_100" | "SHARED";

export type WaitingChargePolicy = {
  freeMinutes: number;
  chargePerMin: number;
  /** Amount cap (₹). Null → the absolute safety ceiling is used instead of "no cap". */
  maxCharge?: number | null;
  /** Duration cap (billable minutes). Null → the absolute safety ceiling is used. */
  maxMinutes?: number | null;
  fundingMode?: ComponentFundingMode | null;
  customerSharePct?: number | null;
  companySharePct?: number | null;
};

export type WaitingChargeResult = {
  gross: number;
  capped: number;
  customerShare: number;
  companyShare: number;
  /** Merchant-funded portion (food prep-delay borne by the store). 0 unless MERCHANT_100. */
  merchantShare: number;
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
): { mode: ComponentFundingMode; customerPct: number; companyPct: number; merchantPct: number } {
  const m = (mode ?? "CUSTOMER_100") as ComponentFundingMode;
  if (m === "CUSTOMER_100") return { mode: m, customerPct: 100, companyPct: 0, merchantPct: 0 };
  if (m === "COMPANY_100") return { mode: m, customerPct: 0, companyPct: 100, merchantPct: 0 };
  // MERCHANT_100 — food prep-delay borne by the store (Step 2). Never charges the customer.
  if (m === "MERCHANT_100") return { mode: m, customerPct: 0, companyPct: 0, merchantPct: 100 };
  const c = Math.max(0, Math.min(100, Number(customerPct) || 0));
  const co = Math.max(0, Math.min(100, Number(companyPct) || 0));
  if (c + co <= 0) return { mode: "SHARED", customerPct: 50, companyPct: 50, merchantPct: 0 };
  const sum = c + co;
  return {
    mode: "SHARED",
    customerPct: round2((c / sum) * 100),
    companyPct: round2((co / sum) * 100),
    merchantPct: 0,
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
  // Raw (uncapped) minutes — reported as `gross` so the delta vs the cap stays visible.
  const rawMinutes = billableSec <= 0 ? 0 : Math.ceil(billableSec / 60);
  const perMin = pos(policy.chargePerMin);
  const gross = rawMinutes > 0 && perMin > 0 ? round2(rawMinutes * perMin) : 0;

  // Duration cap: rule value when set, else the absolute safety ceiling (never "no cap").
  const minutesCap =
    policy.maxMinutes != null && pos(policy.maxMinutes) > 0
      ? pos(policy.maxMinutes)
      : WAITING_DEFAULT_MAX_MINUTES;
  const chargeableMinutes = Math.min(rawMinutes, minutesCap);
  const afterDuration = chargeableMinutes > 0 && perMin > 0 ? round2(chargeableMinutes * perMin) : 0;

  // Amount cap: rule value when set, else the absolute safety ceiling (never "no cap").
  const amountCap =
    policy.maxCharge != null && pos(policy.maxCharge) > 0
      ? pos(policy.maxCharge)
      : WAITING_DEFAULT_MAX_CHARGE;
  const capped = round2(Math.min(afterDuration, amountCap));

  const funding = normalizeFundingShares(
    policy.fundingMode,
    policy.customerSharePct,
    policy.companySharePct
  );
  const customerShare = round2((capped * funding.customerPct) / 100);
  const merchantShare = round2((capped * funding.merchantPct) / 100);
  const companyShare = round2(Math.max(0, capped - customerShare - merchantShare));

  return {
    gross,
    capped,
    customerShare,
    companyShare,
    merchantShare,
    fundingMode: funding.mode,
    chargeableMinutes,
  };
}
