import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractItemsArray,
  mapCoreDbItemsToRaw,
  normalizeOrderItems,
  orderRawItemsMissingDisplayNames,
  type NormalizedOrderLineItem,
} from '@/lib/orderLineItems';

const CORE_ITEM_SELECT =
  'id, order_id, menu_item_id, item_name, variant_name, category_name, quantity, base_price, total_price, veg_nonveg, item_snapshot';

type CoreItemRow = Parameters<typeof mapCoreDbItemsToRaw>[0][number];
type CoreAddonRow = { order_item_id: number; addon_name?: string | null; quantity: number };

/** Collect public order_id strings used in orders_core_items.order_id. */
export function collectCoreItemOrderKeys(
  core: Record<string, unknown>,
  food?: Record<string, unknown> | null
): string[] {
  const keys = new Set<string>();
  const primary = String(core.order_id ?? '').trim();
  const alt = String(food?.core_order_id ?? '').trim();
  if (primary) keys.add(primary);
  if (alt) keys.add(alt);
  return [...keys];
}

function itemsFromBillingSnapshot(core: Record<string, unknown>): unknown {
  const snap = core.billing_snapshot;
  if (!snap || typeof snap !== 'object') return [];
  const o = snap as Record<string, unknown>;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.line_items)) return o.line_items;
  if (Array.isArray(o.cart_items)) return o.cart_items;
  const cart = o.cart;
  if (cart && typeof cart === 'object') {
    const c = cart as Record<string, unknown>;
    if (Array.isArray(c.items)) return c.items;
  }
  return [];
}

/** Batch-load orders_core_items keyed by orders_core.order_id (text). */
export async function loadCoreDbItemsByOrderTextIds(
  db: SupabaseClient,
  orderIdTexts: string[]
): Promise<Map<string, Record<string, unknown>[]>> {
  const unique = [...new Set(orderIdTexts.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, Record<string, unknown>[]>();
  if (unique.length === 0) return out;

  const { data: coreItemRows, error } = await db
    .from('orders_core_items')
    .select(CORE_ITEM_SELECT)
    .in('order_id', unique)
    .order('id');

  if (error || !coreItemRows?.length) return out;

  const itemIds = coreItemRows
    .map((r) => Number((r as { id: number }).id))
    .filter((n) => Number.isFinite(n));

  const addonsByItemId = new Map<number, CoreAddonRow[]>();
  if (itemIds.length > 0) {
    const { data: addonRows } = await db
      .from('orders_core_item_addons')
      .select('order_item_id, addon_name, quantity, addon_price')
      .in('order_item_id', itemIds);
    for (const a of addonRows || []) {
      const itemId = Number((a as { order_item_id: number }).order_item_id);
      if (!Number.isFinite(itemId)) continue;
      const list = addonsByItemId.get(itemId) ?? [];
      list.push(a as CoreAddonRow);
      addonsByItemId.set(itemId, list);
    }
  }

  const grouped = new Map<string, CoreItemRow[]>();
  for (const row of coreItemRows) {
    const r = row as CoreItemRow & { order_id: string };
    const oid = String(r.order_id);
    const list = grouped.get(oid) ?? [];
    list.push(r);
    grouped.set(oid, list);
  }

  for (const [oid, rows] of grouped) {
    out.set(oid, mapCoreDbItemsToRaw(rows, addonsByItemId));
  }
  return out;
}

export function resolvePartnerOrderItems(
  core: Record<string, unknown>,
  food: Record<string, unknown> | null | undefined,
  itemsByOrderTextId: Map<string, Record<string, unknown>[]>
): NormalizedOrderLineItem[] {
  const keys = collectCoreItemOrderKeys(core, food);
  let fromDb: Record<string, unknown>[] | undefined;
  for (const k of keys) {
    const hit = itemsByOrderTextId.get(k);
    if (hit?.length) {
      fromDb = hit;
      break;
    }
  }

  let rawItems: unknown =
    food != null &&
    food.items != null &&
    Array.isArray(food.items) &&
    (food.items as unknown[]).length > 0
      ? food.items
      : extractItemsArray(core.items).length > 0
        ? core.items
        : itemsFromBillingSnapshot(core);

  if (
    (extractItemsArray(rawItems).length === 0 || orderRawItemsMissingDisplayNames(rawItems)) &&
    fromDb?.length
  ) {
    rawItems = fromDb;
  }

  return normalizeOrderItems(rawItems);
}

/** Load line items for one orders_food row (PATCH / detail refresh). */
export async function loadPartnerOrderItemsForFoodRow(
  db: SupabaseClient,
  foodRow: Record<string, unknown>
): Promise<NormalizedOrderLineItem[]> {
  const corePk = Number(foodRow.order_id);
  if (!Number.isFinite(corePk)) return normalizeOrderItems(foodRow.items);

  const { data: core } = await db.from('orders_core').select('*').eq('id', corePk).maybeSingle();
  if (!core) return normalizeOrderItems(foodRow.items);

  const keys = collectCoreItemOrderKeys(core as Record<string, unknown>, foodRow);
  const itemsByTextId = await loadCoreDbItemsByOrderTextIds(db, keys);
  return resolvePartnerOrderItems(core as Record<string, unknown>, foodRow, itemsByTextId);
}
