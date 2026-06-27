import {
  calcCustomerSlabPrice,
  calcRiderPayoutBreakdown,
  calcWaitingCharge,
  calcPickupPayout,
  calcDropPayout,
  type CustomerSlab,
  type PickupSlab,
  type DropSlab,
  type CumulativeSegment,
} from "@gatimitra/slab-pricing";
import type { DeliveryRateSlabRow, ProgressiveSlabQuote } from "./types.js";
import { validateEffectiveSlabs } from "./validation.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp0(n: number): number {
  return Math.max(0, n);
}

function toCustomerSlabs(slabs: DeliveryRateSlabRow[]): CustomerSlab[] {
  return slabs.map((s) => ({
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

function mapSegments(segments: CumulativeSegment[]): ProgressiveSlabQuote["segments"] {
  return segments.map((s) => ({
    slabId: s.slabId ?? 0,
    minKm: s.minKm,
    maxKm: s.maxKm,
    segmentKm: s.coveredKm,
    perKmRate: s.rate,
    segmentAmount: s.amount,
  }));
}

export function calculateWaitingCharge(args: {
  waitingMinutes: number;
  chargePerMin: number;
  startAfterMinutes: number;
}): number {
  return calcWaitingCharge(args.waitingMinutes, args.startAfterMinutes, args.chargePerMin);
}

export function calculateProgressiveSlabAmount(args: {
  distanceKm: number;
  slabs: DeliveryRateSlabRow[];
  waitingMinutes?: number;
  applyRiderExtras?: boolean;
}): { ok: true; quote: ProgressiveSlabQuote } | { ok: false; code: string; message: string } {
  const distanceKm = args.distanceKm;
  const slabs = args.slabs ?? [];

  const errs = validateEffectiveSlabs(slabs, distanceKm);
  if (errs.length > 0) {
    return { ok: false, code: errs[0]!.code, message: errs[0]!.message };
  }

  const price = calcCustomerSlabPrice({
    distanceKm,
    slabs: toCustomerSlabs(slabs),
  });
  if (!price) {
    return { ok: false, code: "EMPTY", message: "No active slabs" };
  }

  const riderExtras = args.applyRiderExtras === true;
  const sorted = [...slabs].sort((a, b) => a.minKm - b.minKm);
  const first = sorted[0]!;

  const waitingMinutes = riderExtras ? clamp0(args.waitingMinutes ?? 0) : 0;
  const waitingChargePerMin = riderExtras ? clamp0(first.waitingChargePerMin ?? 0) : 0;
  const waitingAmount = riderExtras
    ? calcWaitingCharge(waitingMinutes, 0, waitingChargePerMin)
    : 0;
  const surgeMultiplier = riderExtras ? Math.max(1, Number(first.surgeMultiplier ?? 1) || 1) : 1;

  const preSurgeTotal = round2(price.finalAmount + waitingAmount);
  const finalAmount = round2(preSurgeTotal * surgeMultiplier);

  return {
    ok: true,
    quote: {
      distanceKm: round2(distanceKm),
      baseFareApplied: price.baseFare,
      segments: mapSegments(price.segments),
      preMinChargeTotal: preSurgeTotal,
      minChargeApplied: price.minChargeAdjustment,
      ...(riderExtras && (waitingMinutes > 0 || waitingChargePerMin > 0 || surgeMultiplier !== 1)
        ? {
            waitingMinutes: round2(waitingMinutes),
            waitingAmount,
            surgeMultiplierApplied: surgeMultiplier,
          }
        : {}),
      finalAmount,
    },
  };
}

export type SelectedSlabQuote = {
  distanceKm: number;
  slabId: number;
  minKm: number;
  maxKm: number | null;
  baseFareApplied: number;
  perKmRate: number;
  rawDistanceAmount: number;
  preMinChargeTotal: number;
  minCharge: number | null;
  finalAmount: number;
  /**
   * Per-slab segments used to compute the progressive total. Populated by
   * storeQuote.service when a real slab calc ran; absent for legacy /
   * pre-progressive callers. The `segments` shape is the same as
   * `ProgressiveSlabQuote["segments"]` — kept loose here to avoid an
   * import cycle.
   */
  segments?: import("./types.js").ProgressiveSlabSegment[];
  /** Free distance included in the base fare (km). */
  includedKm?: number;
};

/** @deprecated Unused — kept for API compatibility. Prefer calculateProgressiveSlabAmount. */
export function calculateSelectedSlabAmount(args: {
  distanceKm: number;
  slabs: DeliveryRateSlabRow[];
}): { ok: true; quote: SelectedSlabQuote } | { ok: false; code: string; message: string } {
  const res = calculateProgressiveSlabAmount({ distanceKm: args.distanceKm, slabs: args.slabs });
  if (!res.ok) return res;
  const q = res.quote;
  const firstSeg = q.segments[0];
  return {
    ok: true,
    quote: {
      distanceKm: q.distanceKm,
      slabId: firstSeg?.slabId ?? 0,
      minKm: firstSeg?.minKm ?? 0,
      maxKm: firstSeg?.maxKm ?? null,
      baseFareApplied: q.baseFareApplied,
      perKmRate: firstSeg?.perKmRate ?? 0,
      rawDistanceAmount: round2(q.preMinChargeTotal - q.baseFareApplied),
      preMinChargeTotal: q.preMinChargeTotal,
      minCharge: q.minChargeApplied > 0 ? q.minChargeApplied : null,
      finalAmount: q.finalAmount,
    },
  };
}
