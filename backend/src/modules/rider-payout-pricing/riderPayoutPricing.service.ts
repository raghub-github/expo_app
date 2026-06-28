import {
  calcPickupPayout,
  calcDropPayout,
  calcRiderPayoutBreakdown,
  calcWaitingCharge as sharedWaitingCharge,
  type PickupSlab,
  type DropSlab,
} from "@gatimitra/slab-pricing";
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

export function calculateWaitingCharge(args: {
  waitingMinutes: number;
  chargePerMin: number;
  startAfterMinutes: number;
}): number {
  return sharedWaitingCharge(args.waitingMinutes, args.startAfterMinutes, args.chargePerMin);
}

function toPickupSlabs(slabs: RiderPickupSlabRow[]): PickupSlab[] {
  return slabs.map((s) => ({
    id: s.id,
    minKm: s.minKm,
    maxKm: s.maxKm,
    baseFare: s.baseFare,
    pickupPerKm: s.pickupPerKm,
    minCharge: s.minCharge,
    waitingChargePerMin: s.waitingChargePerMin,
    waitingStartAfter: s.waitingStartAfter,
    priority: s.priority,
    isActive: s.isActive,
  }));
}

function toDropSlabs(slabs: RiderDropSlabRow[]): DropSlab[] {
  return slabs.map((s) => ({
    id: s.id,
    minKm: s.minKm,
    maxKm: s.maxKm,
    dropPerKm: s.dropPerKm,
    priority: s.priority,
    isActive: s.isActive,
  }));
}

function mapLegSegments(segments: { slabId?: number; minKm: number; maxKm: number | null; coveredKm: number; rate: number; amount: number }[]): RiderPayoutLegSegment[] {
  return segments.map((s) => ({
    slabId: s.slabId ?? 0,
    minKm: s.minKm,
    maxKm: s.maxKm,
    segmentKm: s.coveredKm,
    perKmRate: s.rate,
    segmentAmount: s.amount,
  }));
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
  const pickupKm = Math.max(0, args.pickupKm);
  const dropKm = Math.max(0, args.dropKm);

  const pickupErrs = validatePickupSlabSet(args.pickupSlabs, pickupKm);
  if (pickupErrs.length > 0) {
    return { ok: false, code: pickupErrs[0]!.code, message: pickupErrs[0]!.message };
  }
  const dropErrs = validateDropSlabSet(args.dropSlabs, dropKm);
  if (dropErrs.length > 0) {
    return { ok: false, code: dropErrs[0]!.code, message: dropErrs[0]!.message };
  }

  const pickupSlabs = toPickupSlabs(args.pickupSlabs);
  const dropSlabs = toDropSlabs(args.dropSlabs);

  const breakdown = calcRiderPayoutBreakdown({
    pickupKm,
    dropKm,
    pickupSlabs,
    dropSlabs,
    waitingMinutes: args.waitingMinutes,
    riderHasGmitraMax: args.riderHasGmitraMax,
    surgeWaitMaxOnly: args.surgeWaitMaxOnly,
    appliedSurges: args.appliedSurges,
    rawSurgeTotal: args.rawSurgeTotal,
    surgeTotal: args.surgeTotal,
    surgeCapped: args.surgeCapped,
  });

  if (!breakdown) {
    return { ok: false, code: "EMPTY", message: "No rider slabs configured" };
  }

  const pickupLeg = calcPickupPayout({
    pickupKm,
    slabs: pickupSlabs,
    waitingMinutes: args.waitingMinutes,
    extrasAllowed: breakdown.gmitraMaxExtrasAllowed,
  });
  const dropLeg = calcDropPayout({ dropKm, slabs: dropSlabs });

  const sortedPickup = [...args.pickupSlabs].sort(
    (a, b) =>
      a.minKm - b.minKm ||
      (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) ||
      b.priority - a.priority ||
      a.id - b.id
  );
  const firstPickup = sortedPickup[0]!;

  return {
    ok: true,
    quote: {
      pickupKm: round2(pickupKm),
      dropKm: round2(dropKm),
      baseFareApplied: breakdown.baseFare,
      pickupSegments: pickupLeg ? mapLegSegments(pickupLeg.segments) : [],
      dropSegments: dropLeg ? mapLegSegments(dropLeg.segments) : [],
      pickupAmount: breakdown.pickupAmount,
      dropAmount: breakdown.dropAmount,
      waitingMinutes: round2(Math.max(0, args.waitingMinutes ?? 0)),
      waitingStartAfter: firstPickup.waitingStartAfter ?? 0,
      waitingAmount: breakdown.waitingAmount,
      subtotalBeforeSurge: breakdown.subtotalBeforeSurge,
      appliedSurges: breakdown.appliedSurges as AppliedRiderSurge[],
      rawSurgeTotal: breakdown.rawSurgeTotal,
      surgeTotal: breakdown.surgeTotal,
      surgeCapped: breakdown.surgeCapped,
      maxTotalSurgeAmount: args.maxTotalSurgeAmount ?? null,
      surgeWaitMaxOnly: args.surgeWaitMaxOnly === true,
      riderGmitraMaxApplied: args.riderHasGmitraMax === true,
      minChargeApplied: breakdown.minChargeApplied,
      finalAmount: breakdown.finalAmount,
      pricingEngine: "rider_pickup_drop_v2",
    },
  };
}
