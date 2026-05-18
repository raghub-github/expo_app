import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NormalizedOrderItem } from "../modules/orders/orderNormalizer.js";
import type { FoodOrderLineItem, VegNonVegAggregate } from "./food-order-payload.js";

/** Map DB / snapshot food_type or cart isVeg to orders_food.veg_non_veg enum. */
export function foodTypeToVegNonVeg(
  raw: string | null | undefined,
  isVeg?: boolean | null
): VegNonVegAggregate | null {
  if (raw != null && String(raw).trim() !== "") {
    const t = String(raw).trim().toUpperCase();
    if (t === "NON_VEG" || t === "NON-VEG" || (t.includes("NON") && t.includes("VEG"))) return "non_veg";
    if (t === "VEG" || t === "PURE_VEG" || (t.includes("VEG") && !t.includes("NON"))) return "veg";
    if (t === "EGG" || t.includes("EGG")) return "na";
    if (t === "MIXED") return "mixed";
    if (t === "NA") return "na";
  }
  if (isVeg === true) return "veg";
  if (isVeg === false) return "non_veg";
  return null;
}

function lineVegFromSnapshot(snap: Record<string, unknown> | null): VegNonVegAggregate | null {
  if (!snap) return null;
  const raw =
    snap.veg_non_veg ??
    snap.vegNonVeg ??
    snap.food_type ??
    snap.foodType ??
    snap.is_veg;
  if (typeof raw === "boolean") return foodTypeToVegNonVeg(null, raw);
  return foodTypeToVegNonVeg(raw != null ? String(raw) : null, null);
}

/** Attach food_type / veg_non_veg on each line from DB when snapshot is missing it. */
export async function resolveItemsWithFoodTypes(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  merchantStoreId: number,
  items: NormalizedOrderItem[],
  storePureVeg?: boolean | null
): Promise<NormalizedOrderItem[]> {
  const ids = [...new Set(items.map((i) => i.menuItemId).filter((id) => id > 0))];
  const byMenuPk = new Map<number, string>();

  if (ids.length > 0) {
    const rows = (await tx.execute(
      sql`SELECT id, food_type FROM merchant_menu_items WHERE store_id = ${merchantStoreId} AND id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})`
    )) as unknown as Array<{ id: number; food_type: string | null }>;
    for (const r of rows) {
      if (r?.id != null && r.food_type) byMenuPk.set(Number(r.id), String(r.food_type));
    }
  }

  return items.map((item) => {
    const snap = item.itemSnapshot != null ? { ...item.itemSnapshot } : {};
    let lineVeg = lineVegFromSnapshot(snap);
    if (!lineVeg) {
      const ft = byMenuPk.get(item.menuItemId);
      if (ft) {
        snap.food_type = ft;
        lineVeg = foodTypeToVegNonVeg(ft, null);
      }
    }
    if (lineVeg) snap.veg_non_veg = lineVeg;
    return {
      ...item,
      itemSnapshot: Object.keys(snap).length > 0 ? snap : item.itemSnapshot,
    };
  });
}

export function aggregateVegWithStoreFallback(
  lines: FoodOrderLineItem[],
  storePureVeg?: boolean | null
): VegNonVegAggregate | null {
  const types = new Set<VegNonVegAggregate>();
  for (const line of lines) {
    const v = foodTypeToVegNonVeg(line.veg_non_veg, null);
    if (v) types.add(v);
  }
  if (types.size === 0 && storePureVeg === true) return "veg";
  if (types.size === 0) return null;
  if (types.size === 1) return [...types][0]!;
  return "mixed";
}
