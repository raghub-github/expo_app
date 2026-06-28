/**
 * Validates a slab set for super-admin CRUD. Aligned with billing rules:
 * start at 0 km, base fare only on first slab, no overlaps, contiguous ranges.
 * The last slab may be finite (e.g. 0–5 only) or open-ended (maxKm empty).
 * Only one open-ended slab is allowed and it must be the last row.
 */

function roundKm(n: number): number {
  return Math.round(n * 100) / 100;
}

export function validateDeliveryRateSlabSet(
  slabs: Array<{ minKm: number; maxKm: number | null; baseFare: number | null }>
): string | null {
  if (slabs.length === 0) return null;
  const sorted = [...slabs].sort(
    (a, b) => roundKm(a.minKm) - roundKm(b.minKm) || ((a.maxKm ?? 1e18) - (b.maxKm ?? 1e18))
  );
  if (roundKm(sorted[0]!.minKm) !== 0) return "Slabs must start at 0 km (minKm=0).";
  for (let i = 1; i < sorted.length; i++) {
    if ((sorted[i]!.baseFare ?? 0) > 0) return "Base fare can be set only on the first slab (minKm=0).";
  }
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const s = sorted[i]!;
    if (prev.maxKm == null) {
      return "Only the last slab may be open-ended. Set max km on the previous slab before adding another.";
    }
    const prevMax = roundKm(prev.maxKm);
    const minKm = roundKm(s.minKm);
    if (minKm < prevMax) return `Slabs overlap near ${s.minKm} km.`;
    if (minKm !== prevMax) return `Slabs must be contiguous (gap between ${prevMax} and ${s.minKm} km).`;
  }
  return null;
}
