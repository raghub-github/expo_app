import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractItemsArray,
  mapCoreDbItemsToRaw,
  normalizeOrderItems,
  orderRawItemsMissingDisplayNames,
  type NormalizedOrderLineItem,
} from '@/lib/orderLineItems';
import { enrichRawOrderItemFromCoreRow } from '@/lib/order-item-customisation';

const CORE_ITEM_SELECT =
  'id, order_id, menu_item_id, item_name, variant_name, category_name, quantity, base_price, addon_price, total_price, veg_nonveg, item_snapshot, applied_offer_type, applied_offer_label, offer_discount_amount';

type CoreItemRow = Parameters<typeof mapCoreDbItemsToRaw>[0][number];
type CoreAddonRow = {
  order_item_id: number;
  addon_name?: string | null;
  quantity: number;
  addon_price?: string | number | null;
};

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
  const cartByOrderText = new Map<string, Record<string, unknown>[]>();
  if (unique.length > 0) {
    const { data: pendingRows } = await db
      .from('pending_orders')
      .select('finalized_order_id, items_snapshot')
      .in('finalized_order_id', unique);
    for (const p of pendingRows || []) {
      const key = String((p as { finalized_order_id?: string }).finalized_order_id ?? '').trim();
      if (!key) continue;
      const lines = extractItemsArray((p as { items_snapshot?: unknown }).items_snapshot).map(
        (r) => (r && typeof r === 'object' ? (r as Record<string, unknown>) : {})
      );
      if (lines.length > 0) cartByOrderText.set(key, lines);
    }
  }

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

  const ctmByItemId = new Map<
    number,
    {
      gross_value: number;
      merchant_offer_discount: number;
      net_ctm_value: number;
      merchant_offer_type: string | null;
      merchant_offer_name: string | null;
    }
  >();
  if (itemIds.length > 0) {
    const { data: ctmRows, error: ctmErr } = await db
      .from('merchant_ctm_pricing_snapshot')
      .select(
        'order_item_id, gross_value, merchant_offer_discount, net_ctm_value, merchant_offer_type, merchant_offer_name'
      )
      .in('order_item_id', itemIds);
    if (!ctmErr && ctmRows?.length) {
      for (const r of ctmRows) {
        const id = Number((r as { order_item_id: number }).order_item_id);
        if (!Number.isFinite(id)) continue;
        ctmByItemId.set(id, {
          gross_value: Number((r as { gross_value: unknown }).gross_value) || 0,
          merchant_offer_discount:
            Number((r as { merchant_offer_discount: unknown }).merchant_offer_discount) || 0,
          net_ctm_value: Number((r as { net_ctm_value: unknown }).net_ctm_value) || 0,
          merchant_offer_type:
            ((r as { merchant_offer_type?: string | null }).merchant_offer_type as string | null) ??
            null,
          merchant_offer_name:
            ((r as { merchant_offer_name?: string | null }).merchant_offer_name as string | null) ??
            null,
        });
      }
    } else if (ctmErr) {
      console.error(
        '[merchant-ctm] failed to load merchant_ctm_pricing_snapshot — reload PostgREST schema or check RLS:',
        ctmErr.message ?? ctmErr
      );
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
    const cartLines = cartByOrderText.get(oid) ?? [];
    const raw = mapCoreDbItemsToRaw(rows, addonsByItemId);
    for (let i = 0; i < rows.length; i++) {
      raw[i] = enrichRawOrderItemFromCoreRow({
        row: rows[i],
        dbAddons: addonsByItemId.get(rows[i].id) ?? [],
        cartLines,
        lineIndex: i,
        raw: raw[i],
      });
      const ctm = ctmByItemId.get(Number(rows[i].id));
      const row = rows[i] as CoreItemRow & {
        applied_offer_type?: string | null;
        applied_offer_label?: string | null;
        offer_discount_amount?: string | number | null;
      };
      const frozenType = String(row.applied_offer_type ?? '').trim() || null;
      const frozenLabel = String(row.applied_offer_label ?? '').trim() || null;
      if (ctm && ctm.gross_value > 0.005) {
        const qty = Math.max(1, Number(raw[i]?.quantity) || 1);
        const offerTypeRaw = String(ctm.merchant_offer_type ?? frozenType ?? '').trim();
        const offerTypeNorm = offerTypeRaw.toUpperCase().replace(/[-\s]+/g, '_');
        const isNone = !offerTypeNorm || offerTypeNorm === 'NONE';
        const isBogo =
          offerTypeNorm === 'BOGO' ||
          offerTypeNorm === 'BUY_X_GET_Y' ||
          offerTypeNorm === 'BUY_N_GET_M';
        const moneyPromo = ctm.merchant_offer_discount > 0.005;
        const offerName =
          String(ctm.merchant_offer_name ?? '').trim() || frozenLabel || null;
        // Type alone is enough (BOGO often has ₹0 line discount; Boost may omit name).
        const hasMerchantOffer = !isNone;
        const displayCatalog = ctm.gross_value;
        raw[i] = {
          ...raw[i],
          total: displayCatalog,
          total_price: displayCatalog,
          price: displayCatalog / qty,
          catalog_line_total: ctm.gross_value,
          net_line_total: ctm.net_ctm_value,
          offer_discount: moneyPromo ? ctm.merchant_offer_discount : 0,
          offer_label: hasMerchantOffer ? offerName : null,
          is_item_promo: moneyPromo || isBogo,
          applied_offer_type: hasMerchantOffer ? offerTypeRaw || null : null,
          ctm_from_snapshot: true,
        };
      } else if (frozenType && frozenType.toUpperCase() !== 'NONE') {
        raw[i] = {
          ...raw[i],
          offer_label: frozenLabel,
          applied_offer_type: frozenType,
          is_item_promo: true,
          offer_discount: Number(row.offer_discount_amount) || 0,
        };
      }
    }
    out.set(oid, raw);
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

  let items = normalizeOrderItems(rawItems);
  if (fromDb?.length) {
    const enriched = normalizeOrderItems(fromDb);
    if (items.length === 0) {
      items = enriched;
    } else if (enriched.length > 0) {
      items = items.map((it, i) => {
        const dbLine = enriched[i];
        if (!dbLine) return it;
        return {
          ...it,
          name: dbLine.name || it.name,
          customizations: dbLine.customizations?.length ? dbLine.customizations : it.customizations,
          customizationLines: dbLine.customizationLines?.length
            ? dbLine.customizationLines
            : it.customizationLines,
          variantTag: dbLine.variantTag ?? it.variantTag,
          variantName: dbLine.variantName ?? it.variantName,
          baseAmount: dbLine.baseAmount ?? it.baseAmount,
          customizationsTotal: dbLine.customizationsTotal ?? it.customizationsTotal,
          capturedBaseAmount: dbLine.capturedBaseAmount ?? it.capturedBaseAmount,
          capturedAddonAmount: dbLine.capturedAddonAmount ?? it.capturedAddonAmount,
          hasCustomizations: dbLine.hasCustomizations ?? it.hasCustomizations,
          categoryName: dbLine.categoryName ?? it.categoryName,
          vegNonveg: dbLine.vegNonveg ?? it.vegNonveg,
          menuItemId: dbLine.menuItemId ?? it.menuItemId,
          description: dbLine.description ?? it.description,
          imageUrl: dbLine.imageUrl ?? it.imageUrl,
          total: dbLine.total > 0 ? dbLine.total : it.total,
          price: dbLine.price > 0 ? dbLine.price : it.price,
          catalogLineTotal: dbLine.catalogLineTotal ?? it.catalogLineTotal,
          netLineTotal: dbLine.netLineTotal ?? it.netLineTotal,
          offerDiscount: dbLine.offerDiscount ?? it.offerDiscount,
          offerLabel: dbLine.offerLabel ?? it.offerLabel,
          isItemPromo: dbLine.isItemPromo || it.isItemPromo,
          appliedOfferType: dbLine.appliedOfferType ?? it.appliedOfferType,
          ctmFromSnapshot: dbLine.ctmFromSnapshot || it.ctmFromSnapshot,
        };
      });
      if (enriched.length > items.length) items = enriched;
    }
  }
  return items;
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
