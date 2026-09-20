import type { ProgressiveSlabSegment } from "./types.js";

export type SlabQuoteExplainPayload = {
  distanceKm?: number;
  baseFareApplied?: number;
  perKmRate?: number;
  minCharge?: number | null;
  maxKm?: number | null;
  includedKm?: number;
  segments?: ProgressiveSlabSegment[];
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
  pricingEngine: string | null | undefined;
  slabQuote: SlabQuoteExplainPayload | null | undefined;
  defaultBaseInr?: number;
  defaultPerKmInr?: number;
}): string | null {
  const engine = args.pricingEngine ?? null;
  const q = args.slabQuote;

  if ((engine === "slab_geo" || engine === "fallback_slab") && q) {
    const base = Number(q.baseFareApplied ?? 0) || 0;
    const perKm = Number(q.perKmRate ?? 0) || 0;
    const includedKm = Number(q.includedKm ?? q.maxKm ?? 0) || 0;
    const segments = q.segments ?? [];
    const activePerKmRates = [
      ...new Set(segments.filter((s) => s.perKmRate > 0.005).map((s) => s.perKmRate)),
    ];

    if (base > 0 && activePerKmRates.length > 0) {
      // "Included" free km ONLY when the first (0 km) slab genuinely charges ₹0/km. Otherwise
      // the base is a flat fee and per-km applies from km 0 (e.g. ₹15 base + ₹7.50/km). The old
      // "₹15 for first 3 km" wording wrongly implied the first 3 km were free — they are charged
      // at the first band's per-km rate (dashboard preview: 3 km = ₹15 + ₹7.50×3 = ₹37.50).
      const firstSeg = segments.find((s) => Number(s.minKm) <= 0.005);
      const includedFreeKm =
        firstSeg && firstSeg.perKmRate <= 0.005 && firstSeg.maxKm != null
          ? Number(firstSeg.maxKm)
          : 0;
      const paidBands = segments
        .filter((s) => s.perKmRate > 0.005 && s.segmentKm > 0.005)
        .map((s) => {
          const range =
            s.maxKm != null
              ? `${fmtKm(s.minKm)}–${fmtKm(s.maxKm)} km`
              : `beyond ${fmtKm(s.minKm)} km`;
          return `₹${fmtInr(s.perKmRate)}/km (${range})`;
        })
        .join(", ");
      if (includedFreeKm > 0 && paidBands) {
        return `₹${fmtInr(base)} for first ${fmtKm(includedFreeKm)} km, then ${paidBands}`;
      }
      if (paidBands) {
        return `₹${fmtInr(base)} base + ${paidBands}`;
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
    const base = args.defaultBaseInr ?? 25;
    const perKm = args.defaultPerKmInr ?? 5;
    return `₹${fmtInr(base)} per order plus ₹${fmtInr(perKm)} per km`;
  }

  return null;
}
