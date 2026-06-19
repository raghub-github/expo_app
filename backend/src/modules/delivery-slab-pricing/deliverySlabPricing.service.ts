import type { DeliveryRateSlabRow, ProgressiveSlabQuote } from "./types.js";
import { validateEffectiveSlabs } from "./validation.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp0(n: number): number {
  return Math.max(0, n);
}

export function calculateProgressiveSlabAmount(args: {
  distanceKm: number;
  slabs: DeliveryRateSlabRow[];
  /** Optional rider-only input */
  waitingMinutes?: number;
  /** When true, apply rider-only extras (waiting + surge). */
  applyRiderExtras?: boolean;
}): { ok: true; quote: ProgressiveSlabQuote } | { ok: false; code: string; message: string } {
  const distanceKm = args.distanceKm;
  const slabs = args.slabs ?? [];

  const errs = validateEffectiveSlabs(slabs, distanceKm);
  if (errs.length > 0) {
    return { ok: false, code: errs[0]!.code, message: errs[0]!.message };
  }

  const sorted = [...slabs].sort(
    (a, b) =>
      a.minKm - b.minKm ||
      ((a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)) ||
      b.priority - a.priority ||
      a.id - b.id
  );

  const first = sorted[0]!;
  /**
   * Progressive customer pricing (monotonic + explainable):
   * - First slab defines the included block:
   *     - included_km := first.max_km (if null, treated as 0)
   *     - base_fee := first.min_charge (preferred), else first.base_fare (legacy)
   * - Charge per-km only for distance ABOVE included_km, accumulating across slab bands:
   *     base_fee + Σ( segment_km × per_km_rate )
   *
   * This matches "₹X includes first Y km, then ₹r/km for next band…" and prevents
   * slab-switch price drops.
   */
  const includedKm = Math.max(0, Number(first.maxKm ?? 0) || 0);
  const baseFeeApplied = clamp0((first.minCharge ?? first.baseFare ?? 0) as number);
  const riderExtras = args.applyRiderExtras === true;
  const waitingMinutes = riderExtras ? Math.max(0, Number(args.waitingMinutes ?? 0) || 0) : 0;
  const waitingChargePerMin = riderExtras ? clamp0(first.waitingChargePerMin ?? 0) : 0;
  const waitingAmount = riderExtras ? round2(waitingMinutes * waitingChargePerMin) : 0;
  const surgeMultiplier = riderExtras ? Math.max(1, Number(first.surgeMultiplier ?? 1) || 1) : 1;

  const segments: ProgressiveSlabQuote["segments"] = [];
  let perKmTotal = 0;

  for (const s of sorted) {
    const min = Math.max(s.minKm, includedKm);
    const max = s.maxKm ?? Infinity;
    const segKm = Math.max(0, Math.min(distanceKm, max) - min);
    if (segKm <= 0) continue;
    const segAmount = round2(segKm * clamp0(s.perKmRate));
    perKmTotal += segAmount;
    segments.push({
      slabId: s.id,
      minKm: s.minKm,
      maxKm: s.maxKm,
      segmentKm: round2(segKm),
      perKmRate: clamp0(s.perKmRate),
      segmentAmount: segAmount,
    });
    if (max >= distanceKm) break;
  }

  // Rider payout uses: (base + distance + waiting) * surge. Customer delivery uses base+distance only.
  const preSurgeTotal = round2(baseFeeApplied + perKmTotal + waitingAmount);
  const surgedTotal = round2(preSurgeTotal * surgeMultiplier);
  const preMinChargeTotal = surgedTotal;
  const minChargeApplied = 0;
  const finalAmount = preMinChargeTotal;

  return {
    ok: true,
    quote: {
      distanceKm: round2(distanceKm),
      baseFareApplied: round2(baseFeeApplied),
      segments,
      preMinChargeTotal,
      minChargeApplied: round2(minChargeApplied),
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

import type { ProgressiveSlabSegment } from "./types.js";

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
  /** Progressive geo slabs — distance bands applied for this quote. */
  segments?: ProgressiveSlabSegment[];
  /** First-slab included km (from DB `max_km` on the zero/min slab). */
  includedKm?: number;
};

/**
 * Customer delivery fee slab logic (non-progressive), matching product requirement:
 * - pick the matching slab by (min_km <= distance <= max_km)
 * - if slab.min_km=0: fee = max(min_charge, base_fare + distance * per_km)
 * - else: fee = max(min_charge, distance * per_km)
 *
 * Note: This is intentionally different from progressive slab pricing used for rider payout / tiered rates.
 */
export function calculateSelectedSlabAmount(args: {
  distanceKm: number;
  slabs: DeliveryRateSlabRow[];
}): { ok: true; quote: SelectedSlabQuote } | { ok: false; code: string; message: string } {
  const distanceKm = args.distanceKm;
  const slabs = args.slabs ?? [];

  const errs = validateEffectiveSlabs(slabs, distanceKm);
  if (errs.length > 0) {
    return { ok: false, code: errs[0]!.code, message: errs[0]!.message };
  }

  const sorted = [...slabs].sort(
    (a, b) =>
      a.minKm - b.minKm ||
      ((a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)) ||
      b.priority - a.priority ||
      a.id - b.id
  );

  const match =
    sorted.find((s) => {
      const max = s.maxKm ?? Infinity;
      return distanceKm >= s.minKm && distanceKm <= max;
    }) ?? sorted[0]!;

  const perKmRate = clamp0(match.perKmRate);
  const baseFareApplied = match.minKm === 0 ? clamp0(match.baseFare ?? 0) : 0;
  const rawDistanceAmount = round2(distanceKm * perKmRate);
  const preMinChargeTotal = round2(baseFareApplied + rawDistanceAmount);
  const minCharge = match.minCharge != null && Number.isFinite(match.minCharge) ? Math.max(0, round2(match.minCharge)) : null;
  const finalAmount = minCharge != null ? round2(Math.max(preMinChargeTotal, minCharge)) : preMinChargeTotal;

  return {
    ok: true,
    quote: {
      distanceKm: round2(distanceKm),
      slabId: match.id,
      minKm: match.minKm,
      maxKm: match.maxKm ?? null,
      baseFareApplied: round2(baseFareApplied),
      perKmRate: round2(perKmRate),
      rawDistanceAmount,
      preMinChargeTotal,
      minCharge,
      finalAmount,
    },
  };
}

