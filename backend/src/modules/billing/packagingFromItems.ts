import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

/**
 * Sum per-line packaging from item snapshots when packaging is explicitly enabled.
 * Expects itemSnapshot: { packaging_enabled?: boolean, packaging_charges?: number } (or camelCase).
 */
export function sumItemPackagingFromSnapshots(items: NormalizedOrderItem[]): number {
  let t = 0;
  for (const line of items) {
    const snap = line.itemSnapshot;
    if (!snap || typeof snap !== "object") continue;
    const rec = snap as Record<string, unknown>;
    const enabled = rec.packaging_enabled === true || rec.packaging_applies === true;
    if (!enabled) continue;
    const per = num(rec.packaging_charges ?? rec.packagingCharges);
    if (per > 0) t += per * line.quantity;
  }
  return t;
}
