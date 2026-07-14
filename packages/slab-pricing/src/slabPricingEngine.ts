/**
 * Shared cumulative slab pricing engine — single source of truth for
 * customer delivery fees and rider pickup/drop payouts.
 */

export type GenericSlab = {
  id?: number;
  minKm: number;
  maxKm: number | null;
  isActive?: boolean;
  priority?: number;
};

export type CustomerSlab = GenericSlab & {
  baseFare?: number | null;
  perKmRate: number;
  minCharge?: number | null;
};

export type CumulativeSegment = {
  slabId?: number;
  minKm: number;
  maxKm: number | null;
  coveredKm: number;
  rate: number;
  amount: number;
};

export type CustomerSlabPrice = {
  baseFare: number;
  distanceAmount: number;
  subtotalBeforeMin: number;
  minChargeAdjustment: number;
  finalAmount: number;
  segments: CumulativeSegment[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toSafeNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeKm(value: unknown): number {
  return Math.max(0, round2(toSafeNumber(value, 0)));
}

export function normalizeMoney(value: unknown): number {
  return round2(Math.max(0, toSafeNumber(value, 0)));
}

export function normalizeNullableMaxKm(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = toSafeNumber(value, NaN);
  if (!Number.isFinite(n)) return null;
  return round2(Math.max(0, n));
}

export function getActiveSortedSlabs<T extends GenericSlab>(slabs: T[]): T[] {
  return [...(slabs ?? [])]
    .filter((s) => s.isActive !== false)
    .sort(
      (a, b) =>
        normalizeKm(a.minKm) - normalizeKm(b.minKm) ||
        (normalizeNullableMaxKm(a.maxKm) ?? 1e9) - (normalizeNullableMaxKm(b.maxKm) ?? 1e9) ||
        toSafeNumber(b.priority, 0) - toSafeNumber(a.priority, 0) ||
        toSafeNumber(a.id, 0) - toSafeNumber(b.id, 0)
    );
}

export function getFirstZeroKmSlab<T extends GenericSlab>(slabs: T[]): T | null {
  return getActiveSortedSlabs(slabs).find((s) => normalizeKm(s.minKm) === 0) ?? null;
}

export function calcCumulativeDistanceCharge(
  km: unknown,
  slabs: Array<GenericSlab & { rate: number }>
): { amount: number; segments: CumulativeSegment[] } {
  const distanceKm = normalizeKm(km);
  const active = getActiveSortedSlabs(slabs);
  const segments: CumulativeSegment[] = [];
  let amount = 0;

  for (const slab of active) {
    const slabStart = normalizeKm(slab.minKm);
    const slabEnd = normalizeNullableMaxKm(slab.maxKm) ?? Infinity;
    const coveredKm = round2(Math.max(0, Math.min(distanceKm, slabEnd) - slabStart));
    if (coveredKm <= 0) continue;
    const rate = normalizeMoney(slab.rate);
    const segmentAmount = round2(coveredKm * rate);
    amount += segmentAmount;
    segments.push({
      slabId: slab.id,
      minKm: slabStart,
      maxKm: slab.maxKm == null ? null : slabEnd,
      coveredKm,
      rate,
      amount: segmentAmount,
    });
  }

  return { amount: round2(amount), segments };
}

export function calcCustomerSlabPrice(input: {
  distanceKm: unknown;
  slabs: CustomerSlab[];
}): CustomerSlabPrice | null {
  const slabs = input.slabs ?? [];
  if (slabs.length === 0) return null;

  const distanceKm = normalizeKm(input.distanceKm);
  const first = getFirstZeroKmSlab(slabs);
  const baseFare = normalizeMoney(first?.baseFare ?? 0);

  const { amount: distanceAmount, segments } = calcCumulativeDistanceCharge(
    distanceKm,
    getActiveSortedSlabs(slabs).map((s) => ({ ...s, rate: s.perKmRate }))
  );

  const subtotalBeforeMin = round2(baseFare + distanceAmount);
  const minCharge =
    first?.minCharge != null && Number.isFinite(Number(first.minCharge))
      ? normalizeMoney(first.minCharge)
      : null;
  const finalAmount =
    minCharge != null ? round2(Math.max(subtotalBeforeMin, minCharge)) : subtotalBeforeMin;
  const minChargeAdjustment = round2(finalAmount - subtotalBeforeMin);

  return {
    baseFare,
    distanceAmount,
    subtotalBeforeMin,
    minChargeAdjustment,
    finalAmount,
    segments,
  };
}

export function calcWaitingCharge(
  waitMin: unknown,
  freeWaitMin: unknown,
  waitRate: unknown
): number {
  const minutes = normalizeKm(waitMin);
  const free = normalizeKm(freeWaitMin);
  const rate = normalizeMoney(waitRate);
  const chargeableWait = Math.max(0, minutes - free);
  return round2(chargeableWait * rate);
}

export function calcGmitraMaxAdjustment(input: {
  riderHasGmitraMax: boolean;
  surgeWaitMaxOnly: boolean;
}): { extrasAllowed: boolean } {
  const riderMax = input.riderHasGmitraMax === true;
  const surgeWaitMaxOnly = input.surgeWaitMaxOnly === true;
  return { extrasAllowed: !surgeWaitMaxOnly || riderMax };
}

export function mapCustomerSlabsFromPerKmRows<
  T extends {
    id: number;
    minKm: number;
    maxKm: number | null;
    baseFare?: number | null;
    perKmRate: number;
    minCharge?: number | null;
    priority?: number;
    isActive?: boolean;
  },
>(rows: T[]): CustomerSlab[] {
  return rows.map((s) => ({
    id: s.id,
    minKm: s.minKm,
    maxKm: s.maxKm,
    baseFare: s.baseFare,
    perKmRate: s.perKmRate,
    minCharge: s.minCharge,
    priority: s.priority,
    isActive: s.isActive,
  }));
}

// ─── Rider Fare Engine v3.0: percentage-of-customer-fare payout split ─────────

export type ServicePayoutRule = {
  riderPercentage: number;
  platformPercentage: number;
};

export type ServicePayoutRuleSplit = {
  customerFare: number;
  riderTotal: number;
  platformRevenue: number;
  pickupRatio: number;
  dropRatio: number;
  pickupAmount: number;
  dropAmount: number;
};

/**
 * Rider Fare Engine v3.0: rider payout = rider_percentage of customerFare,
 * split pickup/drop purely by distance ratio (pickupKm / totalKm). No
 * guardrails, no fixed ratios, no fallbacks — pickup and drop always sum to
 * exactly riderTotal. Waiting charge and surge are NOT part of this split —
 * callers add them on top.
 */
export function calcServicePayoutRuleSplit(input: {
  customerFare: number;
  pickupKm: number;
  dropKm: number;
  rule: ServicePayoutRule;
}): ServicePayoutRuleSplit {
  const customerFare = normalizeMoney(input.customerFare);
  const pickupKm = normalizeKm(input.pickupKm);
  const dropKm = normalizeKm(input.dropKm);
  const rule = input.rule;

  const riderTotal = round2(customerFare * (rule.riderPercentage / 100));
  const platformRevenue = round2(customerFare - riderTotal);

  const totalKm = pickupKm + dropKm;
  const pickupRatio = totalKm > 0 ? pickupKm / totalKm : 1;
  const dropRatio = totalKm > 0 ? dropKm / totalKm : 0;

  const pickupAmount = totalKm > 0 ? round2(riderTotal * pickupRatio) : riderTotal;
  const dropAmount = round2(riderTotal - pickupAmount);

  return {
    customerFare,
    riderTotal,
    platformRevenue,
    pickupRatio: round2(pickupRatio * 100),
    dropRatio: round2(dropRatio * 100),
    pickupAmount,
    dropAmount,
  };
}
