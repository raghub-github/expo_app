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
export function calcPickupPayout(input) {
    const slabs = input.slabs ?? [];
    if (slabs.length === 0)
        return null;
    const pickupKm = normalizeKm(input.pickupKm);
    const first = getFirstZeroKmSlab(slabs);
    const baseFare = normalizeMoney(first?.baseFare ?? 0);
    const { amount: distanceAmount, segments } = calcCumulativeDistanceCharge(pickupKm, getActiveSortedSlabs(slabs).map((s) => ({ ...s, rate: s.pickupPerKm })));
    const subtotalBeforeMin = round2(baseFare + distanceAmount);
    const minCharge = first?.minCharge != null && Number.isFinite(Number(first.minCharge))
        ? normalizeMoney(first.minCharge)
        : null;
    const pickupPayout = minCharge != null ? round2(Math.max(subtotalBeforeMin, minCharge)) : subtotalBeforeMin;
    const minChargeAdjustment = round2(pickupPayout - subtotalBeforeMin);
    const extrasAllowed = input.extrasAllowed !== false;
    const freeWaitMin = normalizeKm(first?.waitingStartAfter ?? 0);
    const waitRatePerMin = extrasAllowed ? normalizeMoney(first?.waitingChargePerMin ?? 0) : 0;
    const waitingAmount = calcWaitingCharge(input.waitingMinutes ?? 0, freeWaitMin, waitRatePerMin);
    return {
        baseFare,
        distanceAmount,
        subtotalBeforeMin,
        minChargeAdjustment,
        pickupPayout,
        waitingAmount,
        freeWaitMin,
        waitRatePerMin,
        segments,
    };
}
export function calcDropPayout(input) {
    const slabs = input.slabs ?? [];
    if (slabs.length === 0)
        return null;
    const { amount: dropAmount, segments } = calcCumulativeDistanceCharge(input.dropKm, getActiveSortedSlabs(slabs).map((s) => ({ ...s, rate: s.dropPerKm })));
    return { dropAmount, segments };
}
export function calcGmitraMaxAdjustment(input) {
    const riderMax = input.riderHasGmitraMax === true;
    const surgeWaitMaxOnly = input.surgeWaitMaxOnly === true;
    return { extrasAllowed: !surgeWaitMaxOnly || riderMax };
}
export function calcRiderPayoutBreakdown(input) {
    if (input.pickupSlabs.length === 0 && input.dropSlabs.length === 0)
        return null;
    const { extrasAllowed } = calcGmitraMaxAdjustment({
        riderHasGmitraMax: input.riderHasGmitraMax === true,
        surgeWaitMaxOnly: input.surgeWaitMaxOnly === true,
    });
    const pickup = input.pickupSlabs.length > 0
        ? calcPickupPayout({
            pickupKm: input.pickupKm,
            slabs: input.pickupSlabs,
            waitingMinutes: input.waitingMinutes,
            extrasAllowed,
        })
        : null;
    const drop = input.dropSlabs.length > 0
        ? calcDropPayout({ dropKm: input.dropKm, slabs: input.dropSlabs })
        : null;
    const baseFare = pickup?.baseFare ?? 0;
    const pickupAmount = pickup?.distanceAmount ?? 0;
    const minChargeApplied = pickup?.minChargeAdjustment ?? 0;
    const dropAmount = drop?.dropAmount ?? 0;
    const waitingAmount = pickup?.waitingAmount ?? 0;
    const subtotalBeforeSurge = round2((pickup?.pickupPayout ?? 0) + dropAmount + waitingAmount);
    const appliedSurges = extrasAllowed ? (input.appliedSurges ?? []) : [];
    const rawSurgeTotal = extrasAllowed
        ? round2(input.rawSurgeTotal ?? appliedSurges.reduce((s, x) => s + x.amount, 0))
        : 0;
    const surgeTotal = extrasAllowed ? round2(input.surgeTotal ?? rawSurgeTotal) : 0;
    const finalAmount = round2(subtotalBeforeSurge + surgeTotal);
    return {
        baseFare,
        pickupAmount,
        dropAmount,
        waitingAmount,
        subtotalBeforeSurge,
        appliedSurges,
        rawSurgeTotal,
        surgeTotal,
        surgeCapped: input.surgeCapped === true,
        minChargeApplied,
        gmitraMaxExtrasAllowed: extrasAllowed,
        finalAmount,
    };
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
