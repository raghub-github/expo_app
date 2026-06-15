import type {
  RiderDropSlabRow,
  RiderPickupSlabRow,
  RiderPayoutLegSegment,
  RiderPayoutQuote,
} from "./types.js";
import type { AppliedRiderSurge } from "../rider-surge/types.js";
import { validateDropSlabSet, validatePickupSlabSet } from "./validation.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp0(n: number): number {
  return Math.max(0, n);
}

/**
 * Waiting charge with free threshold.
 * Example: charge=₹1/min, startAfter=3 → 5 min wait = ₹2, 3 min = ₹0.
 */
export function calculateWaitingCharge(args: {
  waitingMinutes: number;
  chargePerMin: number;
  startAfterMinutes: number;
}): number {
  const minutes = clamp0(args.waitingMinutes);
  const startAfter = clamp0(args.startAfterMinutes);
  const rate = clamp0(args.chargePerMin);
  if (minutes <= startAfter || rate <= 0) return 0;
  return round2((minutes - startAfter) * rate);
}

function calculateLegProgressiveAmount<T extends { id: number; minKm: number; maxKm: number | null; priority: number }>(
  distanceKm: number,
  slabs: T[],
  perKmOf: (s: T) => number
): { segments: RiderPayoutLegSegment[]; amount: number } | { ok: false; code: string; message: string } {
  const sorted = [...slabs].sort(
    (a, b) =>
      a.minKm - b.minKm ||
      (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) ||
      b.priority - a.priority ||
      a.id - b.id
  );

  const first = sorted[0]!;
  const includedKm = Math.max(0, Number(first.maxKm ?? 0) || 0);
  const segments: RiderPayoutLegSegment[] = [];
  let total = 0;

  for (const s of sorted) {
    const min = Math.max(s.minKm, includedKm);
    const max = s.maxKm ?? Infinity;
    const segKm = Math.max(0, Math.min(distanceKm, max) - min);
    if (segKm <= 0) continue;
    const rate = clamp0(perKmOf(s));
    const segAmount = round2(segKm * rate);
    total += segAmount;
    segments.push({
      slabId: s.id,
      minKm: s.minKm,
      maxKm: s.maxKm,
      segmentKm: round2(segKm),
      perKmRate: rate,
      segmentAmount: segAmount,
    });
    if (max >= distanceKm) break;
  }

  return { segments, amount: round2(total) };
}

export function calculateRiderPickupDropPayout(args: {
  pickupKm: number;
  dropKm: number;
  pickupSlabs: RiderPickupSlabRow[];
  dropSlabs: RiderDropSlabRow[];
  waitingMinutes?: number;
  riderHasGmitraMax?: boolean;
  surgeWaitMaxOnly?: boolean;
  appliedSurges?: AppliedRiderSurge[];
  rawSurgeTotal?: number;
  surgeTotal?: number;
  surgeCapped?: boolean;
  maxTotalSurgeAmount?: number | null;
}): { ok: true; quote: RiderPayoutQuote } | { ok: false; code: string; message: string } {
  const pickupKm = clamp0(args.pickupKm);
  const dropKm = clamp0(args.dropKm);

  const pickupErrs = validatePickupSlabSet(args.pickupSlabs, pickupKm);
  if (pickupErrs.length > 0) {
    return { ok: false, code: pickupErrs[0]!.code, message: pickupErrs[0]!.message };
  }
  const dropErrs = validateDropSlabSet(args.dropSlabs, dropKm);
  if (dropErrs.length > 0) {
    return { ok: false, code: dropErrs[0]!.code, message: dropErrs[0]!.message };
  }

  const sortedPickup = [...args.pickupSlabs].sort(
    (a, b) =>
      a.minKm - b.minKm ||
      (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) ||
      b.priority - a.priority ||
      a.id - b.id
  );
  const firstPickup = sortedPickup[0]!;

  const baseFeeApplied = clamp0((firstPickup.minCharge ?? firstPickup.baseFare ?? 0) as number);
  const minChargeFloor =
    firstPickup.minCharge != null && Number.isFinite(firstPickup.minCharge)
      ? Math.max(0, round2(firstPickup.minCharge))
      : null;

  const pickupLeg = calculateLegProgressiveAmount(pickupKm, sortedPickup, (s) => s.pickupPerKm);
  if ("ok" in pickupLeg && pickupLeg.ok === false) {
    return pickupLeg;
  }
  const dropLeg = calculateLegProgressiveAmount(dropKm, args.dropSlabs, (s) => s.dropPerKm);
  if ("ok" in dropLeg && dropLeg.ok === false) {
    return dropLeg;
  }

  const riderMax = args.riderHasGmitraMax === true;
  const surgeWaitMaxOnly = args.surgeWaitMaxOnly === true;
  const extrasAllowed = !surgeWaitMaxOnly || riderMax;
  const waitingAllowed = extrasAllowed;

  const waitingMinutes = clamp0(args.waitingMinutes ?? 0);
  const waitingStartAfter = clamp0(firstPickup.waitingStartAfter ?? 0);
  const waitingChargePerMin = waitingAllowed ? clamp0(firstPickup.waitingChargePerMin ?? 0) : 0;
  const waitingAmount = calculateWaitingCharge({
    waitingMinutes,
    chargePerMin: waitingChargePerMin,
    startAfterMinutes: waitingStartAfter,
  });

  const pickupAmount = pickupLeg.amount;
  const dropAmount = dropLeg.amount;
  const subtotalBeforeSurge = round2(baseFeeApplied + pickupAmount + dropAmount + waitingAmount);

  const appliedSurges = extrasAllowed ? (args.appliedSurges ?? []) : [];
  const rawSurgeTotal = extrasAllowed
    ? round2(args.rawSurgeTotal ?? appliedSurges.reduce((s, x) => s + x.amount, 0))
    : 0;
  const surgeTotal = extrasAllowed ? round2(args.surgeTotal ?? rawSurgeTotal) : 0;

  let finalAmount = round2(subtotalBeforeSurge + surgeTotal);
  let minChargeApplied = 0;
  if (minChargeFloor != null && finalAmount < minChargeFloor) {
    minChargeApplied = round2(minChargeFloor - finalAmount);
    finalAmount = minChargeFloor;
  }

  return {
    ok: true,
    quote: {
      pickupKm: round2(pickupKm),
      dropKm: round2(dropKm),
      baseFareApplied: round2(baseFeeApplied),
      pickupSegments: pickupLeg.segments,
      dropSegments: dropLeg.segments,
      pickupAmount,
      dropAmount,
      waitingMinutes: round2(waitingMinutes),
      waitingStartAfter,
      waitingAmount,
      subtotalBeforeSurge,
      appliedSurges,
      rawSurgeTotal,
      surgeTotal,
      surgeCapped: args.surgeCapped === true,
      maxTotalSurgeAmount: args.maxTotalSurgeAmount ?? null,
      surgeWaitMaxOnly,
      riderGmitraMaxApplied: riderMax,
      minChargeApplied,
      finalAmount,
      pricingEngine: "rider_pickup_drop_v2",
    },
  };
}
