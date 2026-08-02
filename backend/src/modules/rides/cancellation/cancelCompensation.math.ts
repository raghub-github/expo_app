/**
 * Pre-pickup cancellation compensation — pure math.
 * Applies when rider reached pickup and customer cancels.
 */

export type CancelCalcType = "FIXED" | "PER_KM" | "PERCENTAGE";
export type CancelPayerMode = "CUSTOMER_100" | "COMPANY_100" | "SHARED";

export type CancelCompensationRule = {
  id?: number | null;
  calcType: CancelCalcType;
  valueNumeric: number;
  minCompensation?: number | null;
  maxCompensation?: number | null;
  includeWaitingCompensation?: boolean;
  waitingCompensationPerMin?: number;
  payerMode?: CancelPayerMode;
  customerSharePct?: number;
  companySharePct?: number;
};

export type CancelCompensationInput = {
  pickupKm: number;
  /** Optional fare base for PERCENTAGE calc. */
  fareBase?: number;
  waitingMinutes: number;
  rule: CancelCompensationRule;
};

export type CancelCompensationResult = {
  baseCompensation: number;
  waitingCompensation: number;
  totalCompensation: number;
  customerShare: number;
  companyShare: number;
  payerMode: CancelPayerMode;
  calcType: CancelCalcType;
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

export function computeCancellationCompensation(
  input: CancelCompensationInput
): CancelCompensationResult {
  const rule = input.rule;
  const calcType = rule.calcType;
  const value = pos(rule.valueNumeric);
  let base = 0;
  if (calcType === "FIXED") base = value;
  else if (calcType === "PER_KM") base = round2(pos(input.pickupKm) * value);
  else if (calcType === "PERCENTAGE") {
    base = round2((pos(input.fareBase) * value) / 100);
  }

  let waiting = 0;
  if (rule.includeWaitingCompensation !== false) {
    const perMin = pos(rule.waitingCompensationPerMin);
    waiting = round2(pos(input.waitingMinutes) * perMin);
  }

  let total = round2(base + waiting);
  const minC = rule.minCompensation != null ? pos(rule.minCompensation) : null;
  const maxC = rule.maxCompensation != null ? pos(rule.maxCompensation) : null;
  if (minC != null && total < minC) total = minC;
  if (maxC != null && maxC > 0 && total > maxC) total = maxC;

  const payer = (rule.payerMode ?? "CUSTOMER_100") as CancelPayerMode;
  let customerPct = 100;
  let companyPct = 0;
  if (payer === "COMPANY_100") {
    customerPct = 0;
    companyPct = 100;
  } else if (payer === "SHARED") {
    customerPct = Math.max(0, Math.min(100, Number(rule.customerSharePct) || 50));
    companyPct = Math.max(0, Math.min(100, Number(rule.companySharePct) || 50));
    const sum = customerPct + companyPct;
    if (sum <= 0) {
      customerPct = 50;
      companyPct = 50;
    } else {
      customerPct = round2((customerPct / sum) * 100);
      companyPct = round2((companyPct / sum) * 100);
    }
  }

  const customerShare = round2((total * customerPct) / 100);
  const companyShare = round2(Math.max(0, total - customerShare));

  return {
    baseCompensation: round2(base),
    waitingCompensation: waiting,
    totalCompensation: total,
    customerShare,
    companyShare,
    payerMode: payer,
    calcType,
  };
}
