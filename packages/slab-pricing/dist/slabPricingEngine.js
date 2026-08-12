/**
 * Shared cumulative slab pricing engine — single source of truth for
 * customer delivery fees and rider pickup/drop payouts.
 */
function round2(n) {
    return Math.round(n * 100) / 100;
}
export function toSafeNumber(value, fallback = 0) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
}
export function normalizeKm(value) {
    return Math.max(0, round2(toSafeNumber(value, 0)));
}
export function normalizeMoney(value) {
    return round2(Math.max(0, toSafeNumber(value, 0)));
}
export function normalizeNullableMaxKm(value) {
    if (value == null || value === "")
        return null;
    const n = toSafeNumber(value, NaN);
    if (!Number.isFinite(n))
        return null;
    return round2(Math.max(0, n));
}
export function getActiveSortedSlabs(slabs) {
    return [...(slabs ?? [])]
        .filter((s) => s.isActive !== false)
        .sort((a, b) => normalizeKm(a.minKm) - normalizeKm(b.minKm) ||
        (normalizeNullableMaxKm(a.maxKm) ?? 1e9) - (normalizeNullableMaxKm(b.maxKm) ?? 1e9) ||
        toSafeNumber(b.priority, 0) - toSafeNumber(a.priority, 0) ||
        toSafeNumber(a.id, 0) - toSafeNumber(b.id, 0));
}
export function getFirstZeroKmSlab(slabs) {
    return getActiveSortedSlabs(slabs).find((s) => normalizeKm(s.minKm) === 0) ?? null;
}
export function calcCumulativeDistanceCharge(km, slabs) {
    const distanceKm = normalizeKm(km);
    const active = getActiveSortedSlabs(slabs);
    const segments = [];
    let amount = 0;
    for (const slab of active) {
        const slabStart = normalizeKm(slab.minKm);
        const slabEnd = normalizeNullableMaxKm(slab.maxKm) ?? Infinity;
        const coveredKm = round2(Math.max(0, Math.min(distanceKm, slabEnd) - slabStart));
        if (coveredKm <= 0)
            continue;
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
export function calcCustomerSlabPrice(input) {
    const slabs = input.slabs ?? [];
    if (slabs.length === 0)
        return null;
    const distanceKm = normalizeKm(input.distanceKm);
    const first = getFirstZeroKmSlab(slabs);
    const baseFare = normalizeMoney(first?.baseFare ?? 0);
    const { amount: distanceAmount, segments } = calcCumulativeDistanceCharge(distanceKm, getActiveSortedSlabs(slabs).map((s) => ({ ...s, rate: s.perKmRate })));
    const subtotalBeforeMin = round2(baseFare + distanceAmount);
    const minCharge = first?.minCharge != null && Number.isFinite(Number(first.minCharge))
        ? normalizeMoney(first.minCharge)
        : null;
    const finalAmount = minCharge != null ? round2(Math.max(subtotalBeforeMin, minCharge)) : subtotalBeforeMin;
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
export function calcWaitingCharge(waitMin, freeWaitMin, waitRate) {
    const minutes = normalizeKm(waitMin);
    const free = normalizeKm(freeWaitMin);
    const rate = normalizeMoney(waitRate);
    const chargeableWait = Math.max(0, minutes - free);
    return round2(chargeableWait * rate);
}
export function calcGmitraMaxAdjustment(input) {
    const riderMax = input.riderHasGmitraMax === true;
    const surgeWaitMaxOnly = input.surgeWaitMaxOnly === true;
    return { extrasAllowed: !surgeWaitMaxOnly || riderMax };
}
export function mapCustomerSlabsFromPerKmRows(rows) {
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
/**
 * Rider Fare Engine v3.0: rider payout = rider_percentage of customerFare,
 * split pickup/drop purely by distance ratio (pickupKm / totalKm). No
 * guardrails, no fixed ratios, no fallbacks — pickup and drop always sum to
 * exactly riderTotal. Waiting charge and surge are NOT part of this split —
 * callers add them on top.
 */
export function calcServicePayoutRuleSplit(input) {
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
const VALID_PREPICKUP_FUNDING = new Set([
    "company",
    "customer",
    "shared",
]);
export function normalizePrePickupFunding(raw, fallback = "company") {
    const s = String(raw ?? "").trim().toLowerCase();
    return VALID_PREPICKUP_FUNDING.has(s)
        ? s
        : fallback;
}
/**
 * Service-aware default funding when no explicit config exists. FOOD → company-funded
 * first-mile (on top); PARCEL + PERSON RIDE → customer-funded (within the pool).
 */
export function defaultPrePickupFunding(service) {
    const s = String(service ?? "").trim().toLowerCase();
    if (s === "parcel" || s === "ride" || s === "person_ride")
        return "customer";
    return "company";
}
/** Compose the rider payout — the ONE place that decides pool-vs-company first-mile. */
export function composeRiderPayout(input) {
    const funding = normalizePrePickupFunding(input.funding);
    const nonNeg = (n) => {
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
    }
    else if (funding === "customer") {
        prePickupFromPool = Math.min(prePickupRaw, basePool);
        prePickupCompanyFunded = 0;
    }
    else {
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
