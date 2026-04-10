import type { RiderRateEffectiveDetail } from "@/lib/geo/geo-shared";

export function formatRiderRateBadge(d: RiderRateEffectiveDetail | null | undefined): string {
  if (!d) return "—";
  const b = Number.isFinite(d.base_fare) ? d.base_fare : 0;
  const k = Number.isFinite(d.per_km_rate) ? d.per_km_rate : 0;
  const bStr = b % 1 === 0 ? String(b) : b.toFixed(2);
  const kStr = k % 1 === 0 ? String(k) : k.toFixed(2);
  return `₹${bStr} + ₹${kStr}/km`;
}

export function riderRateSourceLabel(d: RiderRateEffectiveDetail | null | undefined): string {
  if (!d) return "No rider rate card";
  const lvl = d.applied_level.replaceAll("_", " ");
  if (d.is_inherited) return `Inherited from ${lvl}`;
  if (d.override) return `Overridden at ${lvl}`;
  return `Rate at ${lvl}`;
}
