/**
 * Resolve per-line veg / non-veg for order history & detail APIs.
 */

import { getSql } from "../db/client.js";
import { foodTypeToVegNonVeg } from "./food-order-veg.js";

export type ResolvedItemDiet = "veg" | "non_veg" | "egg" | null;

type JsonLine = {
  item_id?: number;
  menuItemId?: number | string;
  veg_non_veg?: string | null;
  vegNonVeg?: string | null;
};

function normalizeDiet(value: string | null | undefined): ResolvedItemDiet {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "egg" || v === "na") return "egg";
  if (v === "non_veg" || v === "nonveg" || v === "non-veg") return "non_veg";
  if (v === "veg" || v === "pure_veg") return "veg";
  if (v.includes("egg")) return "egg";
  if (v.includes("non") && v.includes("veg")) return "non_veg";
  if (v.includes("veg")) return "veg";
  return null;
}

export function resolveItemVegNonVeg(
  vegNonveg: string | null | undefined,
  itemSnapshot: Record<string, unknown> | null | undefined,
  jsonLineVeg?: string | null,
  menuFoodType?: string | null
): ResolvedItemDiet {
  const fromColumn = normalizeDiet(vegNonveg);
  if (fromColumn) return fromColumn;

  const snap = itemSnapshot ?? {};
  const isVegValue = snap.isVeg ?? snap.is_veg;
  if (typeof isVegValue === "boolean") return isVegValue ? "veg" : "non_veg";

  const snapRaw =
    snap.veg_non_veg ??
    snap.vegNonveg ??
    snap.vegNonVeg ??
    snap.food_type ??
    snap.foodType;
  const fromSnap = normalizeDiet(snapRaw != null ? String(snapRaw) : null);
  if (fromSnap) return fromSnap;

  const fromJson = normalizeDiet(jsonLineVeg);
  if (fromJson) return fromJson;

  const mapped = foodTypeToVegNonVeg(menuFoodType, null);
  if (mapped === "veg" || mapped === "non_veg") return mapped;
  if (mapped === "na") return "egg";

  return null;
}

function buildJsonVegMap(itemsJson: unknown): Map<number, string> {
  const map = new Map<number, string>();
  if (!Array.isArray(itemsJson)) return map;
  for (const raw of itemsJson as JsonLine[]) {
    const id = Number(raw?.item_id ?? raw?.menuItemId);
    const veg = raw?.veg_non_veg ?? raw?.vegNonVeg;
    if (Number.isFinite(id) && id > 0 && veg != null && String(veg).trim()) {
      map.set(id, String(veg));
    }
  }
  return map;
}

async function loadMenuFoodTypes(
  merchantStoreId: number | null | undefined,
  menuItemIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const unique = [...new Set(menuItemIds.filter((id) => id > 0))];
  if (!merchantStoreId || unique.length === 0) return map;

  const sql = getSql();
  const rows = (await sql`
    SELECT id, food_type::text AS food_type
    FROM merchant_menu_items
    WHERE store_id = ${merchantStoreId}
      AND id IN ${sql(unique)}
  `) as Array<{ id: number; food_type: string | null }>;

  for (const row of rows) {
    if (row?.id != null && row.food_type) map.set(Number(row.id), String(row.food_type));
  }
  return map;
}

export type OrderItemVegInput = {
  menuItemId?: number | string | null;
  vegNonveg?: string | null;
  itemSnapshot?: Record<string, unknown> | null;
};

export type OrderItemVegOutput = {
  vegNonVeg: string | null;
};

/** Batch-resolve veg/non-veg for order line items (list + detail APIs). */
export async function resolveOrderItemsVegNonVeg(
  merchantStoreId: number | null | undefined,
  itemsJson: unknown,
  rows: OrderItemVegInput[]
): Promise<OrderItemVegOutput[]> {
  if (rows.length === 0) return [];

  const jsonVegByItemId = buildJsonVegMap(itemsJson);
  const needMenuLookup: number[] = [];

  for (const row of rows) {
    const menuPk = Number(row.menuItemId);
    const jsonVeg = Number.isFinite(menuPk) ? jsonVegByItemId.get(menuPk) ?? null : null;
    const resolved = resolveItemVegNonVeg(row.vegNonveg, row.itemSnapshot, jsonVeg, null);
    if (!resolved && Number.isFinite(menuPk) && menuPk > 0) needMenuLookup.push(menuPk);
  }

  const menuFoodTypes = await loadMenuFoodTypes(merchantStoreId, needMenuLookup);

  return rows.map((row) => {
    const menuPk = Number(row.menuItemId);
    const jsonVeg = Number.isFinite(menuPk) ? jsonVegByItemId.get(menuPk) ?? null : null;
    const menuFoodType = Number.isFinite(menuPk) ? menuFoodTypes.get(menuPk) ?? null : null;
    const diet = resolveItemVegNonVeg(row.vegNonveg, row.itemSnapshot, jsonVeg, menuFoodType);
    return { vegNonVeg: diet };
  });
}

export function vegNonvegForPlacementItem(itemSnapshot: Record<string, unknown> | null): string | null {
  const diet = resolveItemVegNonVeg(null, itemSnapshot, null, null);
  return diet === "egg" ? "egg" : diet;
}
