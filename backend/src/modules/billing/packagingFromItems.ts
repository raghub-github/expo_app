import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";

function num(v: unknown): number {
  if (v == null) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
}

export type PackagingDbLookup = {
  /** Per-unit packaging charges from menu master. Missing key = row not loaded. */
  perUnitByMenuItemId: ReadonlyMap<number, number>;
  /** Menu item ids that were found in DB lookup (even if per-unit is 0/null). */
  foundMenuItemIds: ReadonlySet<number>;
};

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

/**
 * Canonical packaging total calculator:
 * - Snapshot per-unit (when packaging enabled) wins
 * - Else DB per-unit wins (when present >0)
 * - Else store default per-unit applies ONLY when packaging is applicable:
 *   - snapshot explicitly enabled OR menu item row exists in DB lookup
 *
 * This matches product rule: per-item packaging, with store default fallback when item is mapped but amount missing.
 */
export function computeItemPackagingTotal(args: {
  items: NormalizedOrderItem[];
  storeDefaultPerUnit: number;
  db?: PackagingDbLookup;
}): number {
  const items = args.items ?? [];
  const storeDefault = Math.max(0, num(args.storeDefaultPerUnit));
  const perUnitById = args.db?.perUnitByMenuItemId ?? new Map<number, number>();
  const foundIds = args.db?.foundMenuItemIds ?? new Set<number>();

  let sum = 0;
  for (const line of items) {
    const snap = line.itemSnapshot;
    const rec = snap && typeof snap === "object" ? (snap as Record<string, unknown>) : null;
    const snapEnabled = rec ? rec.packaging_enabled === true || rec.packaging_applies === true : false;
    const snapPer = rec ? num(rec.packaging_charges ?? rec.packagingCharges) : 0;

    const id = Number(line.menuItemId);
    const dbPer = perUnitById.get(id) ?? 0;
    const dbFound = foundIds.has(id);

    const packagingApplies = snapEnabled || snapPer > 0 || dbPer > 0 || dbFound;
    const perUnit = snapPer > 0 ? snapPer : dbPer > 0 ? dbPer : packagingApplies ? storeDefault : 0;
    if (perUnit > 0) sum += perUnit * Math.max(1, line.quantity);
  }
  return sum;
}
