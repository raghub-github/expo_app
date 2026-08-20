/**
 * Server-authoritative pricing for the billing engine.
 *
 * Pipeline (v2):
 *   merchant net (CTM) → item Boost on CTM → discounted CTM → gross-up commission.
 * BOGO is not baked here; billing applies free-unit discounts on the marked-up catalog.
 */

import { getSql } from "../../db/client.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { markupRupeesPaise } from "../commission/pricing.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";
import {
  resolveItemPricing,
  serializeCanonicalPricing,
} from "../pricing/canonicalItemPricing.js";
import { loadMerchantOffersForPricing } from "../pricing/loadMerchantOffersForPricing.js";
import type { MerchantOfferRow } from "./types.js";

export async function rewriteCartPricesAuthoritatively(
  storeId: number,
  items: NormalizedOrderItem[],
  offersOverride?: MerchantOfferRow[],
): Promise<NormalizedOrderItem[]> {
  if (items.length === 0) return items;
  const sql = getSql();
  const commission = await resolveStoreCommission(storeId);
  const pct = commission.percent;
  const offers = offersOverride ?? (await loadMerchantOffersForPricing(storeId));

  const itemIds = Array.from(new Set(items.map((i) => i.menuItemId).filter((n): n is number => Number.isFinite(n))));
  const addonPkIds = Array.from(
    new Set(
      items.flatMap((i) =>
        i.addons.map((a) => a.menuAddonPk).filter((n): n is number => n != null && n > 0),
      ),
    ),
  );
  const addonTextKeys = Array.from(
    new Set(
      items.flatMap((i) =>
        i.addons.map((a) => {
          const id = String(a.menuAddonId ?? "").trim();
          const cust = a.customizationId != null ? String(a.customizationId).trim() : "";
          return id ? `${cust}\t${id}` : "";
        }).filter(Boolean),
      ),
    ),
  );

  // Load all required prices in batched lookups.
  const itemPriceById = new Map<number, number>();
  const itemCatalogIdByPk = new Map<number, string>();
  /** variant row PK → net price */
  const variantPriceByPk = new Map<number, number>();
  /** `${menuItemId}\t${variant_id text}` → net price */
  const variantPriceByItemKey = new Map<string, number>();
  const addonPriceByPk = new Map<number, number>();
  const addonPriceByTextKey = new Map<string, number>();

  if (itemIds.length > 0) {
    const rows = await sql<Array<{ id: number; selling_price: string; item_id: string | null }>>`
      SELECT id, selling_price::text AS selling_price, item_id
      FROM merchant_menu_items
      WHERE id IN ${sql(itemIds)}
        AND store_id = ${storeId}
    `;
    for (const r of rows) {
      const p = parseFloat(r.selling_price);
      if (Number.isFinite(p) && p > 0) itemPriceById.set(Number(r.id), p);
      if (r.item_id) itemCatalogIdByPk.set(Number(r.id), String(r.item_id).trim());
    }
  }
  if (itemIds.length > 0) {
    const variantRows = await sql<
      Array<{ menu_item_id: number; id: number; variant_id: string; variant_price: string }>
    >`
      SELECT menu_item_id, id, variant_id, variant_price::text AS variant_price
      FROM merchant_menu_item_variants
      WHERE menu_item_id IN ${sql(itemIds)}
    `;
    for (const r of variantRows) {
      const p = parseFloat(r.variant_price);
      if (!Number.isFinite(p) || p < 0) continue;
      const mid = Number(r.menu_item_id);
      variantPriceByPk.set(Number(r.id), p);
      variantPriceByItemKey.set(`${mid}\t${String(r.variant_id ?? "").trim()}`, p);
    }
  }
  if (addonPkIds.length > 0) {
    const rows = await sql<Array<{ id: number; addon_price: string }>>`
      SELECT id, addon_price::text AS addon_price
      FROM merchant_menu_item_addons
      WHERE id IN ${sql(addonPkIds)}
    `;
    for (const r of rows) {
      const p = parseFloat(r.addon_price);
      if (Number.isFinite(p) && p >= 0) addonPriceByPk.set(Number(r.id), p);
    }
  }
  if (addonTextKeys.length > 0) {
    const rows = await sql<
      Array<{ addon_id: string; customization_id: string; addon_price: string }>
    >`
      SELECT a.addon_id, c.customization_id, a.addon_price::text AS addon_price
      FROM merchant_menu_item_addons a
      INNER JOIN merchant_menu_item_customizations c ON c.id = a.customization_id
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id
      WHERE m.store_id = ${storeId}
    `;
    for (const r of rows) {
      const key = `${String(r.customization_id ?? "").trim()}\t${String(r.addon_id ?? "").trim()}`;
      const p = parseFloat(r.addon_price);
      if (key.endsWith("\t") || !key.includes("\t")) continue;
      if (Number.isFinite(p) && p >= 0) addonPriceByTextKey.set(key, p);
    }
  }

  return items.map((it) => {
    const hasVariantRef =
      (it.variantId != null && it.variantId > 0) || Boolean(it.variantKey?.trim());
    let variantNet: number | undefined;
    if (it.variantId != null && it.variantId > 0) {
      variantNet = variantPriceByPk.get(it.variantId);
    }
    if (variantNet == null && it.variantKey?.trim()) {
      variantNet = variantPriceByItemKey.get(`${it.menuItemId}\t${it.variantKey.trim()}`);
    }
    const itemNet = itemPriceById.get(it.menuItemId);
    // When a size/variant was chosen, never fall back to menu item selling_price (often the minimum size).
    const net = variantNet ?? (hasVariantRef ? undefined : itemNet);

    const rewrittenAddons = it.addons.map((a) => {
      const textKey = `${a.customizationId ?? ""}\t${a.menuAddonId}`;
      const addonNet =
        (a.menuAddonPk != null ? addonPriceByPk.get(a.menuAddonPk) : undefined) ??
        addonPriceByTextKey.get(textKey);
      if (addonNet == null) return a;
      return { ...a, addonPrice: markupRupeesPaise(addonNet, pct), _addonNet: addonNet } as typeof a & {
        _addonNet?: number;
      };
    });
    const addonCtmLine = rewrittenAddons.reduce((s, a) => {
      const netA = (a as { _addonNet?: number })._addonNet;
      const customerAlready = a.addonPrice;
      const ctm = netA != null ? netA : 0;
      return s + (ctm > 0 ? ctm : 0) * a.quantity * it.quantity;
    }, 0);
    const addonsOut = rewrittenAddons.map((a) => {
      const { _addonNet, ...rest } = a as typeof a & { _addonNet?: number };
      void _addonNet;
      return rest;
    });

    if (net == null) {
      return { ...it, addons: addonsOut };
    }

    const catalogId = itemCatalogIdByPk.get(it.menuItemId);
    const priced = resolveItemPricing({
      baseCtmUnit: net,
      quantity: it.quantity,
      addonCtmLine,
      commissionPercent: pct,
      offers,
      menuItemId: it.menuItemId,
      extraAliases: catalogId ? [catalogId] : [],
    });
    const snap = {
      ...(it.itemSnapshot && typeof it.itemSnapshot === "object" ? it.itemSnapshot : {}),
      canonical_pricing: serializeCanonicalPricing(priced),
    };
    return {
      ...it,
      basePrice: priced.customerItemPriceUnit,
      addons: addonsOut,
      itemSnapshot: snap,
    };
  });
}

/**
 * Menu item IDs whose catalog MRP (base_price) is above selling_price —
 * already discounted; not eligible for further cart/coupon promos.
 */
export async function loadMrpIneligibleMenuItemIds(
  storeId: number,
  menuItemIds: number[]
): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = Array.from(new Set(menuItemIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0) return out;
  const sql = getSql();
  const rows = await sql<
    Array<{ id: number; selling_price: string; base_price: string | null }>
  >`
    SELECT id, selling_price::text AS selling_price, base_price::text AS base_price
    FROM merchant_menu_items
    WHERE id IN ${sql(ids)}
      AND store_id = ${storeId}
  `;
  for (const r of rows) {
    const selling = parseFloat(r.selling_price);
    const base = r.base_price != null ? parseFloat(r.base_price) : NaN;
    if (Number.isFinite(selling) && Number.isFinite(base) && base > selling + 0.001) {
      out.add(String(r.id));
    }
  }
  return out;
}

/**
 * Map cart menu PK → catalog item_id (+ reverse) so Boost offers that target
 * merchant `item_id` strings still match billing lines keyed by numeric PK.
 */
export async function loadMenuItemIdAliases(
  storeId: number,
  menuItemIds: number[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const ids = Array.from(new Set(menuItemIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (ids.length === 0) return out;
  const sql = getSql();
  const rows = await sql<Array<{ id: number; item_id: string | null }>>`
    SELECT id, item_id
    FROM merchant_menu_items
    WHERE id IN ${sql(ids)}
      AND store_id = ${storeId}
  `;
  for (const r of rows) {
    const pk = String(r.id);
    const itemId = r.item_id != null ? String(r.item_id).trim() : "";
    const aliases = itemId && itemId !== pk ? [itemId] : [];
    if (aliases.length) out.set(pk, aliases);
  }
  return out;
}
