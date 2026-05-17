/**
 * Resolve human-readable order IDs for merchant_store_ratings.order_id.
 * Ratings may store orders_core.id, orders_food.id, or legacy orders.id.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type RatingOrderMeta = {
  coreId: number | null;
  orderPublicId: string | null;
  order_type?: string | null;
  items?: unknown;
  grand_total?: number | null;
};

type CoreRow = {
  id: number;
  order_id?: string | null;
  formatted_order_id?: string | null;
  order_type?: string | null;
  items?: unknown;
  grand_total?: number | null;
};

const CORE_SELECT =
  "id, order_id, formatted_order_id, order_type, items, grand_total";

export function orderPublicIdFromRow(
  row:
    | { formatted_order_id?: string | null; order_id?: string | null }
    | undefined,
): string | null {
  if (!row) return null;
  const formatted = String(row.formatted_order_id ?? "").trim();
  if (formatted) return formatted;
  const legacy = String(row.order_id ?? "").trim();
  return legacy || null;
}

function metaFromCore(row: CoreRow): RatingOrderMeta {
  return {
    coreId: row.id,
    orderPublicId: orderPublicIdFromRow(row),
    order_type: row.order_type ?? null,
    items: row.items,
    grand_total: row.grand_total ?? null,
  };
}

export async function resolveOrderMetaByRatingOrderIds(
  db: SupabaseClient,
  orderIds: number[],
): Promise<Map<number, RatingOrderMeta>> {
  const out = new Map<number, RatingOrderMeta>();
  const unique = [...new Set(orderIds.filter((id) => id > 0))];
  if (unique.length === 0) return out;

  const found = new Set<number>();

  const { data: coreRows } = await db
    .from("orders_core")
    .select(CORE_SELECT)
    .in("id", unique);

  for (const raw of coreRows ?? []) {
    const row = raw as CoreRow;
    if (typeof row.id !== "number") continue;
    out.set(row.id, metaFromCore(row));
    found.add(row.id);
  }

  const missing = unique.filter((id) => !found.has(id));
  if (missing.length === 0) return out;

  const { data: foodRows } = await db
    .from("orders_food")
    .select("id, order_id, formatted_order_id, items")
    .in("id", missing);

  const coreIdsNeeded = new Set<number>();
  const foodByRatingId = new Map<
    number,
    {
      coreId: number;
      formatted_order_id?: string | null;
      items?: unknown;
    }
  >();

  for (const raw of foodRows ?? []) {
    const f = raw as {
      id?: number;
      order_id?: number;
      formatted_order_id?: string | null;
      items?: unknown;
    };
    if (typeof f.id !== "number" || typeof f.order_id !== "number") continue;
    foodByRatingId.set(f.id, {
      coreId: f.order_id,
      formatted_order_id: f.formatted_order_id,
      items: f.items,
    });
    if (!out.has(f.order_id)) coreIdsNeeded.add(f.order_id);
  }

  if (coreIdsNeeded.size > 0) {
    const { data: extraCore } = await db
      .from("orders_core")
      .select(CORE_SELECT)
      .in("id", [...coreIdsNeeded]);
    for (const raw of extraCore ?? []) {
      const row = raw as CoreRow;
      if (typeof row.id !== "number") continue;
      out.set(row.id, metaFromCore(row));
    }
  }

  for (const [ratingOrderId, food] of foodByRatingId) {
    const core = out.get(food.coreId);
    const publicId =
      orderPublicIdFromRow({
        formatted_order_id: food.formatted_order_id,
        order_id: null,
      }) ?? core?.orderPublicId ?? null;

    out.set(ratingOrderId, {
      coreId: food.coreId,
      orderPublicId: publicId,
      order_type: core?.order_type ?? "food",
      items: food.items ?? core?.items,
      grand_total: core?.grand_total ?? null,
    });
    found.add(ratingOrderId);
  }

  const stillMissing = missing.filter((id) => !found.has(id));
  if (stillMissing.length === 0) return out;

  const { data: legacyRows } = await db
    .from("orders")
    .select("id, order_id, formatted_order_id")
    .in("id", stillMissing);

  for (const raw of legacyRows ?? []) {
    const row = raw as {
      id?: number;
      order_id?: string | null;
      formatted_order_id?: string | null;
    };
    if (typeof row.id !== "number") continue;
    out.set(row.id, {
      coreId: row.id,
      orderPublicId: orderPublicIdFromRow(row),
      order_type: "food",
      items: undefined,
      grand_total: null,
    });
  }

  return out;
}
