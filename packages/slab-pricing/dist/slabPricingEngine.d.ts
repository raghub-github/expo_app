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
export declare function calcWaitingCharge(waitMin: unknown, freeWaitMin: unknown, waitRate: unknown): number;
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
//# sourceMappingURL=slabPricingEngine.d.ts.map