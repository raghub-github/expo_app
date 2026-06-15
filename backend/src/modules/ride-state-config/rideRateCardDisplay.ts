import type { RideCustomerPricingRow } from "../rider-payout-pricing/types.js";

/** Customer-facing slab summary for fare details sheet (e.g. "6rs/km till 4km | 8rs/km from 4km to 6km"). */
export function formatRideCustomerRateCardSummary(slabs: RideCustomerPricingRow[]): string | null {
  const active = slabs
    .filter((s) => s.isActive)
    .sort(
      (a, b) =>
        a.minKm - b.minKm ||
        (a.maxKm ?? 1e9) - (b.maxKm ?? 1e9) ||
        b.priority - a.priority ||
        a.id - b.id
    );
  if (active.length === 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < active.length; i++) {
    const s = active[i]!;
    const rate = Math.round(s.perKmRate);
    if (rate <= 0) continue;
    const min = s.minKm;
    const max = s.maxKm;
    if (i === 0 && max != null && max > 0 && min <= 0) {
      parts.push(`${rate}rs/km till ${max}km`);
    } else if (max == null) {
      parts.push(`${rate}rs/km for >${min}km`);
    } else {
      parts.push(`${rate}rs/km from ${min}km to ${max}km`);
    }
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

export function formatRideWaitingChargeNote(freeMinutes: number, chargePerMin: number): string | null {
  if (chargePerMin <= 0) return null;
  const mins = Math.max(0, Math.round(freeMinutes));
  return `Waiting charges after ${mins} mins of captain arrival is ₹${chargePerMin}/min`;
}
