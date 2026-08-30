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
export declare function toSafeNumber(value: unknown, fallback?: number): number;
export declare function normalizeKm(value: unknown): number;
export declare function normalizeMoney(value: unknown): number;
export declare function normalizeNullableMaxKm(value: unknown): number | null;
export declare function getActiveSortedSlabs<T extends GenericSlab>(slabs: T[]): T[];
export declare function getFirstZeroKmSlab<T extends GenericSlab>(slabs: T[]): T | null;
export declare function calcCumulativeDistanceCharge(km: unknown, slabs: Array<GenericSlab & {
    rate: number;
}>): {
    amount: number;
    segments: CumulativeSegment[];
};
export declare function calcCustomerSlabPrice(input: {
    distanceKm: unknown;
    slabs: CustomerSlab[];
}): CustomerSlabPrice | null;
/**
 * Absolute safety ceilings for waiting charges. These apply ONLY when a rule leaves
 * the corresponding cap unset (null) — a configured cap always wins. They guarantee a
 * waiting charge can never grow unbounded even for an un-backfilled or newly-created
 * rule, which is the root cause of the ₹1,000+ waiting bug (see audit Problem A).
 * A per-geo/service cap set in the dashboard is expected to be lower than these.
 */
export declare const WAITING_DEFAULT_MAX_MINUTES = 45;
export declare const WAITING_DEFAULT_MAX_CHARGE = 150;
/**
 * Waiting charge = chargeable-minutes × rate, bounded by BOTH a duration cap and an
 * amount cap. Both caps are always applied: a rule's own value when set, else the
 * absolute safety ceiling above. `maxMinutes`/`maxCharge` are optional so existing
 * callers stay compatible, but the result is always bounded regardless.
 */
export declare function calcWaitingCharge(waitMin: unknown, freeWaitMin: unknown, waitRate: unknown, maxMinutes?: unknown, maxCharge?: unknown): number;
export declare function calcGmitraMaxAdjustment(input: {
    riderHasGmitraMax: boolean;
    surgeWaitMaxOnly: boolean;
}): {
    extrasAllowed: boolean;
};
export declare function mapCustomerSlabsFromPerKmRows<T extends {
    id: number;
    minKm: number;
    maxKm: number | null;
    baseFare?: number | null;
    perKmRate: number;
    minCharge?: number | null;
    priority?: number;
    isActive?: boolean;
}>(rows: T[]): CustomerSlab[];
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
export declare function calcServicePayoutRuleSplit(input: {
    customerFare: number;
    pickupKm: number;
    dropKm: number;
    rule: ServicePayoutRule;
}): ServicePayoutRuleSplit;
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
export declare function normalizePrePickupFunding(raw: unknown, fallback?: PrePickupFunding): PrePickupFunding;
/**
 * Service-aware default funding when no explicit config exists. FOOD → company-funded
 * first-mile (on top); PARCEL + PERSON RIDE → customer-funded (within the pool).
 */
export declare function defaultPrePickupFunding(service: string): PrePickupFunding;
/** Compose the rider payout — the ONE place that decides pool-vs-company first-mile. */
export declare function composeRiderPayout(input: RiderPayoutCompositionInput): RiderPayoutComposition;
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
/**
 * Reconcile two independently-priced legs against the rider % pool (v3.2).
 * Pure — the ONE place that decides how raw pre/post entitlements become allocated pay.
 */
export declare function reconcileRiderLegs(input: ReconcileRiderLegsInput): ReconciledRiderPayout;
/** Clamp a raw leg amount to configured [min,max]: min(max(base + rate*km, min), max). */
export declare function clampLegAmount(raw: number, minAmount: number | null | undefined, maxAmount: number | null | undefined): number;
//# sourceMappingURL=slabPricingEngine.d.ts.map