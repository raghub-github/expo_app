/**
 * Client-side delivery slab explain copy — mirrors backend `formatDeliverySlabExplainSubtext`.
 * Prefer `deliveryFeeExplainSubtext` from POST /billing/calculate when present.
 */

export type DeliverySlabSegment = {
  slabId?: number;
  minKm?: number;
  maxKm?: number | null;
  segmentKm?: number;
  perKmRate?: number;
  segmentAmount?: number;
};

export type DeliverySlabQuote = {
  distanceKm?: number;
  baseFareApplied?: number;
  perKmRate?: number;
  minCharge?: number | null;
  maxKm?: number | null;
  includedKm?: number;
  segments?: DeliverySlabSegment[];
};

function fmtInr(n: number): string {
  const x = Math.round(n * 100) / 100;
  return Math.abs(x - Math.round(x)) < 0.005 ? String(Math.round(x)) : x.toFixed(2);
}

function fmtKm(n: number): string {
  const x = Math.round(n * 10) / 10;
  return Math.abs(x - Math.round(x)) < 0.05 ? String(Math.round(x)) : x.toFixed(1);
}

export function formatDeliverySlabExplainSubtext(args: {
  pricingEngine?: string | null;
  slabQuote?: DeliverySlabQuote | null;
}): string | null {
  const engine = args.pricingEngine ?? null;
  const q = args.slabQuote;

  if (engine === "slab_geo" && q) {
    const base = Number(q.baseFareApplied ?? 0) || 0;
    const perKm = Number(q.perKmRate ?? 0) || 0;
    const includedKm = Number(q.includedKm ?? q.maxKm ?? 0) || 0;
    const segments = q.segments ?? [];
    const activePerKmRates = [
      ...new Set(segments.filter((s) => (s.perKmRate ?? 0) > 0.005).map((s) => s.perKmRate!)),
    ];

    if (base > 0 && includedKm > 0 && activePerKmRates.length > 0) {
      if (activePerKmRates.length === 1) {
        return `₹${fmtInr(base)} for first ${fmtKm(includedKm)} km, then ₹${fmtInr(activePerKmRates[0]!)} per km`;
      }
      const bandText = segments
        .filter((s) => (s.perKmRate ?? 0) > 0.005 && (s.segmentKm ?? 0) > 0.005)
        .map((s) => `₹${fmtInr(s.perKmRate!)} /km × ${fmtKm(s.segmentKm!)} km`)
        .join(", ");
      if (bandText) {
        return `₹${fmtInr(base)} base (first ${fmtKm(includedKm)} km included), ${bandText}`;
      }
    }

    if (base > 0 && perKm > 0) {
      return `₹${fmtInr(base)} per order plus ₹${fmtInr(perKm)} per km`;
    }

    if (base > 0 && includedKm > 0) {
      return `₹${fmtInr(base)} for up to ${fmtKm(includedKm)} km`;
    }

    if (base > 0) {
      return `₹${fmtInr(base)} base fee per order`;
    }

    if (perKm > 0) {
      return `₹${fmtInr(perKm)} per km`;
    }

    if (q.minCharge != null && q.minCharge > 0.005) {
      return `Minimum delivery charge ₹${fmtInr(q.minCharge)}`;
    }
  }

  if (engine === "fallback_per_km" || engine === "no_geo_match" || engine === "slab_invalid") {
    return "₹25 per order plus ₹5 per km";
  }

  return null;
}

export function formatDeliveryDistanceKmLabel(distanceKm: number | null | undefined): string {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm <= 0) {
    return "this trip";
  }
  return `${fmtKm(distanceKm)} km`;
}
