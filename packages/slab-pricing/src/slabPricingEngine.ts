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

// ─── Geo Delivery Pricing v3.1: first-mile (pre-pickup) composed WITH the pool ──
//
// SINGLE SOURCE OF TRUTH for how the first-mile allowance combines with the rider %
// pool. Shared verbatim by the backend (offer estimate + wallet credit) and the
// dashboard simulator so the offered, paid, and simulated numbers are identical.
//
// BEFORE (v3.0): first-mile was ALWAYS added on top → rider total exceeded 100% of the
// delivery fee and was silently company-funded for every service.
// NOW (v3.1): rider % of the GROSS eligible delivery fee is the "rider base pool";
// first-mile is allocated FIRST from that pool (post-pickup = remainder). Two money
// pools are tracked: (A) delivery-fee funded (≤100%), (B) company funded (may exceed
// 100%: surge/incentives + any company-funded first-mile top-up).

export type PrePickupFunding = "company" | "customer" | "shared";

export type RiderPayoutCompositionInput = {
  /** Rider % of the GROSS eligible delivery fee (subtotal before surge/waiting). */
  basePool: number;
  /** Raw first-mile allowance (rate ₹/km × pickup km). May be 0. */
  prePickupRaw: number;
  /** Surge/incentive on top of the pool (company-funded). */
  surge?: number;
  /** Rider waiting earning (customer/delivery-fee funded share). */
  waiting?: number;
  /** Customer tip — passthrough, never subject to the % or the pool. */
  tip?: number;
  /** How the first-mile is funded for this service. */
  funding: PrePickupFunding;
};

export type RiderPayoutComposition = {
  funding: PrePickupFunding;
  basePool: number;
  prePickupFromPool: number;
  postPickup: number;
  prePickupCompanyFunded: number;
  prePickupPaid: number;
  surge: number;
  waiting: number;
  tip: number;
  /** Ledger A — customer / delivery-fee funded (≤100% of the delivery fee). */
  deliveryFeeFundedTotal: number;
  /** Ledger B — company funded (surge/incentives + company first-mile). May exceed 100%. */
  companyFundedTotal: number;
  /** Rider wallet delivery credit EXCLUDING tip (single number credited on delivery). */
  riderDeliveryCredit: number;
  /** Grand total the rider receives = delivery credit + tip. */
  riderTotal: number;
  /** True when a customer-funded first-mile could not fully fit in the pool. */
  prePickupCappedAtPool: boolean;
};

const VALID_PREPICKUP_FUNDING = new Set<PrePickupFunding>([
  "company",
  "customer",
  "shared",
]);

export function normalizePrePickupFunding(
  raw: unknown,
  fallback: PrePickupFunding = "company"
): PrePickupFunding {
  const s = String(raw ?? "").trim().toLowerCase();
  return VALID_PREPICKUP_FUNDING.has(s as PrePickupFunding)
    ? (s as PrePickupFunding)
    : fallback;
}

/**
 * Service-aware default funding when no explicit config exists. FOOD → company-funded
 * first-mile (on top); PARCEL + PERSON RIDE → customer-funded (within the pool).
 */
export function defaultPrePickupFunding(service: string): PrePickupFunding {
  const s = String(service ?? "").trim().toLowerCase();
  if (s === "parcel" || s === "ride" || s === "person_ride") return "customer";
  return "company";
}

/** Compose the rider payout — the ONE place that decides pool-vs-company first-mile. */
export function composeRiderPayout(
  input: RiderPayoutCompositionInput
): RiderPayoutComposition {
  const funding = normalizePrePickupFunding(input.funding);
  const nonNeg = (n: unknown): number => {
    const v = Number(n);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const basePool = round2(nonNeg(input.basePool));
  const prePickupRaw = round2(nonNeg(input.prePickupRaw));
  const surge = round2(nonNeg(input.surge));
  const waiting = round2(nonNeg(input.waiting));
  const tip = round2(nonNeg(input.tip));

  let prePickupFromPool = 0;
  let prePickupCompanyFunded = 0;
  if (funding === "company") {
    prePickupFromPool = 0;
    prePickupCompanyFunded = prePickupRaw;
  } else if (funding === "customer") {
    prePickupFromPool = Math.min(prePickupRaw, basePool);
    prePickupCompanyFunded = 0;
  } else {
    prePickupFromPool = Math.min(prePickupRaw, basePool);
    prePickupCompanyFunded = Math.max(0, round2(prePickupRaw - prePickupFromPool));
  }

  prePickupFromPool = round2(prePickupFromPool);
  prePickupCompanyFunded = round2(prePickupCompanyFunded);
  const postPickup = round2(Math.max(0, basePool - prePickupFromPool));
  const prePickupPaid = round2(prePickupFromPool + prePickupCompanyFunded);

  const deliveryFeeFundedTotal = round2(postPickup + prePickupFromPool + waiting);
  const companyFundedTotal = round2(surge + prePickupCompanyFunded);
  const riderDeliveryCredit = round2(deliveryFeeFundedTotal + companyFundedTotal);
  const riderTotal = round2(riderDeliveryCredit + tip);

  return {
    funding,
    basePool,
    prePickupFromPool,
    postPickup,
    prePickupCompanyFunded,
    prePickupPaid,
    surge,
    waiting,
    tip,
    deliveryFeeFundedTotal,
    companyFundedTotal,
    riderDeliveryCredit,
    riderTotal,
    prePickupCappedAtPool: funding === "customer" && prePickupRaw > basePool,
  };
}

// ─── Geo Delivery Pricing v3.2: INDEPENDENT pre-pickup & post-pickup legs ───────
//
// v3.1 (composeRiderPayout) treated post-pickup as the pool remainder. v3.2 prices the
// two legs INDEPENDENTLY (each from its own rule: pre = rider->pickup, post = pickup->drop,
// with their own rate/slab/vehicle/geo/min/max/funding) and then RECONCILES them against
// the rider % pool. The rider is paid the pool (delivery-fee-funded, <=100%); company-funded
// leg portions + surge/incentives are recorded on top (Ledger B) and may exceed 100%.
//
// SINGLE SOURCE OF TRUTH — shared by the backend offer/credit/settlement AND the dashboard
// simulator + POST /pricing/simulate, so raw, allocated, and paid numbers are identical.

export type RiderLeg = {
  /** Raw entitlement for this leg = base + rate x leg_km, clamped to [min,max]. */
  rawAmount: number;
  /** How this leg is funded. */
  funding: PrePickupFunding;
  /** For funding === "shared": % of the leg the CUSTOMER bears (rest is company). */
  customerSharePct?: number;
  /** Diagnostics carried through for the simulator/snapshot (not used in math). */
  distanceKm?: number;
  ratePerKm?: number;
  ruleId?: number | null;
};

export type ReconcileRiderLegsInput = {
  /** Rider base pool = eligible delivery fee x rider%. */
  pool: number;
  pre: RiderLeg;
  post: RiderLeg;
  surge?: number;
  waiting?: number;
  tip?: number;
  /** Other company-funded incentives (dynamic night/rain/etc.). */
  companyIncentive?: number;
  /**
   * When the customer-funded legs exceed the pool: true (default) caps them at the pool
   * (rider gets the pool, excess dropped); false funds the excess from the company purse.
   */
  capExcessToPool?: boolean;
};

export type ReconciledLeg = {
  rawAmount: number;
  /** Customer-funded portion of the raw (drawn from the pool). */
  customerFunded: number;
  /** Company-funded portion of the raw (added on top, Ledger B). */
  companyFunded: number;
  /** Amount actually allocated to this leg out of the pool. */
  allocated: number;
  funding: PrePickupFunding;
  distanceKm?: number;
  ratePerKm?: number;
  ruleId?: number | null;
};

export type ReconciledRiderPayout = {
  pool: number;
  pre: ReconciledLeg;
  post: ReconciledLeg;
  /** Customer-funded raw that did not fit in the pool (capped or company-funded). */
  poolExcess: number;
  /** Portion of poolExcess the company chose to fund (0 when capped). */
  companyExcessTopup: number;
  surge: number;
  waiting: number;
  tip: number;
  companyIncentive: number;
  /** Ledger A — customer / delivery-fee funded (pool + waiting), always <= pool + waiting. */
  deliveryFeeFundedTotal: number;
  /** Ledger B — company funded (company leg portions + excess top-up + surge + incentives). */
  companyFundedTotal: number;
  /** Single wallet delivery credit (excludes tip). */
  riderDeliveryCredit: number;
  /** Grand total = delivery credit + tip. */
  riderTotal: number;
};

/** Split a leg's raw into (customerFunded from pool, companyFunded on top) by funding. */
function splitLegFunding(leg: RiderLeg): { customer: number; company: number } {
  const raw = Math.max(0, Number(leg.rawAmount) || 0);
  const funding = normalizePrePickupFunding(leg.funding);
  if (funding === "company") return { customer: 0, company: raw };
  if (funding === "customer") return { customer: raw, company: 0 };
  // shared
  const share = Math.min(100, Math.max(0, Number(leg.customerSharePct) || 0)) / 100;
  const customer = round2(raw * share);
  return { customer, company: round2(raw - customer) };
}

/**
 * Reconcile two independently-priced legs against the rider % pool (v3.2).
 * Pure — the ONE place that decides how raw pre/post entitlements become allocated pay.
 */
export function reconcileRiderLegs(input: ReconcileRiderLegsInput): ReconciledRiderPayout {
  const pool = round2(Math.max(0, Number(input.pool) || 0));
  const surge = round2(Math.max(0, Number(input.surge) || 0));
  const waiting = round2(Math.max(0, Number(input.waiting) || 0));
  const tip = round2(Math.max(0, Number(input.tip) || 0));
  const companyIncentive = round2(Math.max(0, Number(input.companyIncentive) || 0));
  const capExcessToPool = input.capExcessToPool !== false; // default true

  const preSplit = splitLegFunding(input.pre);
  const postSplit = splitLegFunding(input.post);
  const custRawTotal = round2(preSplit.customer + postSplit.customer);

  let allocPre: number;
  let allocPost: number;
  let poolExcess = 0;

  if (custRawTotal <= pool) {
    // Everything customer-funded fits. Rider is paid the FULL pool: pre keeps its raw
    // customer share and the unallocated remainder falls to the post (drop) leg.
    allocPre = preSplit.customer;
    allocPost = round2(postSplit.customer + (pool - custRawTotal));
  } else {
    // Customer-funded legs exceed the pool — allocate pre first, then the rest to post.
    allocPre = Math.min(preSplit.customer, pool);
    allocPost = round2(pool - allocPre);
    poolExcess = round2(custRawTotal - pool);
  }
  allocPre = round2(allocPre);

  const companyExcessTopup = capExcessToPool ? 0 : poolExcess;

  const deliveryFeeFundedTotal = round2(allocPre + allocPost + waiting);
  const companyFundedTotal = round2(
    preSplit.company + postSplit.company + companyExcessTopup + surge + companyIncentive
  );
  const riderDeliveryCredit = round2(deliveryFeeFundedTotal + companyFundedTotal);
  const riderTotal = round2(riderDeliveryCredit + tip);

  const mk = (leg: RiderLeg, split: { customer: number; company: number }, allocated: number): ReconciledLeg => ({
    rawAmount: round2(Math.max(0, Number(leg.rawAmount) || 0)),
    customerFunded: round2(split.customer),
    companyFunded: round2(split.company),
    allocated: round2(allocated),
    funding: normalizePrePickupFunding(leg.funding),
    distanceKm: leg.distanceKm,
    ratePerKm: leg.ratePerKm,
    ruleId: leg.ruleId ?? null,
  });

  return {
    pool,
    pre: mk(input.pre, preSplit, allocPre),
    post: mk(input.post, postSplit, allocPost),
    poolExcess,
    companyExcessTopup: round2(companyExcessTopup),
    surge,
    waiting,
    tip,
    companyIncentive,
    deliveryFeeFundedTotal,
    companyFundedTotal,
    riderDeliveryCredit,
    riderTotal,
  };
}

/** Clamp a raw leg amount to configured [min,max]: min(max(base + rate*km, min), max). */
export function clampLegAmount(
  raw: number,
  minAmount: number | null | undefined,
  maxAmount: number | null | undefined
): number {
  let v = Math.max(0, Number(raw) || 0);
  if (minAmount != null && Number.isFinite(minAmount)) v = Math.max(v, minAmount);
  if (maxAmount != null && Number.isFinite(maxAmount)) v = Math.min(v, maxAmount);
  return round2(v);
}
