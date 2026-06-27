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
export type PickupSlab = GenericSlab & {
    baseFare?: number | null;
    pickupPerKm: number;
    minCharge?: number | null;
    waitingChargePerMin?: number | null;
    waitingStartAfter?: number;
};
export type DropSlab = GenericSlab & {
    dropPerKm: number;
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
export type PickupPayoutBreakdown = {
    baseFare: number;
    distanceAmount: number;
    subtotalBeforeMin: number;
    minChargeAdjustment: number;
    pickupPayout: number;
    waitingAmount: number;
    freeWaitMin: number;
    waitRatePerMin: number;
    segments: CumulativeSegment[];
};
export type DropPayoutBreakdown = {
    dropAmount: number;
    segments: CumulativeSegment[];
};
export type AppliedSurgeLine = {
    surgeId?: number;
    name: string;
    kind?: string;
    amount: number;
};
export type RiderPayoutBreakdown = {
    baseFare: number;
    pickupAmount: number;
    dropAmount: number;
    waitingAmount: number;
    subtotalBeforeSurge: number;
    appliedSurges: AppliedSurgeLine[];
    rawSurgeTotal: number;
    surgeTotal: number;
    surgeCapped: boolean;
    minChargeApplied: number;
    gmitraMaxExtrasAllowed: boolean;
    finalAmount: number;
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
export declare function calcPickupPayout(input: {
    pickupKm: unknown;
    slabs: PickupSlab[];
    waitingMinutes?: unknown;
    extrasAllowed?: boolean;
}): PickupPayoutBreakdown | null;
export declare function calcDropPayout(input: {
    dropKm: unknown;
    slabs: DropSlab[];
}): DropPayoutBreakdown | null;
export declare function calcGmitraMaxAdjustment(input: {
    riderHasGmitraMax: boolean;
    surgeWaitMaxOnly: boolean;
}): {
    extrasAllowed: boolean;
};
export declare function calcRiderPayoutBreakdown(input: {
    pickupKm: unknown;
    dropKm: unknown;
    pickupSlabs: PickupSlab[];
    dropSlabs: DropSlab[];
    waitingMinutes?: unknown;
    riderHasGmitraMax?: boolean;
    surgeWaitMaxOnly?: boolean;
    appliedSurges?: AppliedSurgeLine[];
    rawSurgeTotal?: number;
    surgeTotal?: number;
    surgeCapped?: boolean;
}): RiderPayoutBreakdown | null;
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
//# sourceMappingURL=slabPricingEngine.d.ts.map