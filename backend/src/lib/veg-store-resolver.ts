/**
 * Effective veg-store classification for the customer "Pure Veg" toggle.
 *
 * A store is shown in veg-only mode when EITHER:
 *   1. the merchant has explicitly declared it pure-veg (`merchant_stores.is_pure_veg`), OR
 *   2. every customer-visible menu item on it is veg (and it has at least one).
 *
 * Rule (2) is what fixes the "all-veg store hidden in veg mode" bug: a store whose
 * whole live menu is veg is functionally a place a veg customer can fully order from,
 * so we surface it even when the merchant never toggled the flag. It is *derived from
 * the live menu*, so it self-heals — the moment a non-veg (or unknown food_type) item
 * becomes visible, the store drops out of veg mode again, with no flag to maintain and
 * no backfill. The rule is purely ADDITIVE (an OR): it can only reveal genuinely-veg
 * stores, never hide a merchant who explicitly declared pure-veg.
 *
 * "Customer-visible item" mirrors the canonical predicate used by the menu endpoints
 * (see customer-menu-item-visibility.ts): not deleted AND approval_status is
 * APPROVED or PENDING. Food type is matched with the same `LOWER(...) LIKE 'veg%'`
 * test the menu queries use, and an item with a NULL/blank food_type is treated as
 * NON-veg (fail-closed) so we never over-claim a store as veg on missing data.
 */

import type postgres from "postgres";

export type VegClassificationInput = {
  /** merchant_stores.is_pure_veg — the merchant's explicit declaration. */
  isPureVeg: boolean;
  /** Count of customer-visible menu items on the store. */
  visibleItemCount: number;
  /**
   * bool_and over customer-visible items of `food_type LIKE 'veg%'`.
   * Postgres bool_and is NULL for zero rows — pass null in that case.
   */
  allVisibleVeg: boolean | null;
};

/**
 * Pure boolean rule (no DB) so the classification can be unit-tested exhaustively.
 * effective-veg = declared pure-veg OR (has visible items AND all of them are veg).
 */
export function isStoreVegEligible(input: VegClassificationInput): boolean {
  if (input.isPureVeg === true) return true;
  return input.visibleItemCount > 0 && input.allVisibleVeg === true;
}

type VegAggRow = {
  id: string | number;
  is_pure_veg: boolean | null;
  visible_count: string | number | null;
  all_veg: boolean | null;
};

/**
 * For a set of candidate store ids, return the subset that is veg-eligible under the
 * rule above. One grouped query over the (already location-narrowed) candidate set —
 * so it runs on ~tens of stores, not the whole catalog.
 */
export async function resolveVegEligibleStoreIds(
  sql: postgres.Sql,
  storeIds: number[]
): Promise<Set<number>> {
  const ids = Array.from(
    new Set(storeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
  );
  if (ids.length === 0) return new Set<number>();

  const rows = (await sql`
    SELECT
      ms.id AS id,
      ms.is_pure_veg AS is_pure_veg,
      COUNT(mmi.id) AS visible_count,
      bool_and(LOWER(COALESCE(mmi.food_type, '')) LIKE 'veg%') AS all_veg
    FROM merchant_stores ms
    LEFT JOIN merchant_menu_items mmi
      ON mmi.store_id = ms.id
      AND mmi.is_deleted = false
      AND mmi.approval_status::text IN ('APPROVED', 'PENDING')
    WHERE ms.id = ANY(${ids})
    GROUP BY ms.id, ms.is_pure_veg
  `) as unknown as VegAggRow[];

  const eligible = new Set<number>();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    const ok = isStoreVegEligible({
      isPureVeg: row.is_pure_veg === true,
      visibleItemCount: Number(row.visible_count ?? 0),
      allVisibleVeg: row.all_veg,
    });
    if (ok) eligible.add(id);
  }
  return eligible;
}
