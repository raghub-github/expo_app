/**
 * Server-authoritative pricing for the billing engine.
 *
 * The customer app may carry stale cart data (`item.basePrice` set when an
 * item was added an hour ago). To keep the bill accurate AND prevent clients
 * from tampering with prices, we re-fetch each cart line's true net price
 * from the database and mark it up with the current commission for the
 * store. This produces the same `customer_visible` value the menu API
 * returned at read time, so menu / cart / bill all match.
 *
 * Net price source per line:
 *   - If variantId is set → `merchant_menu_item_variants.variant_price`
 *   - Otherwise           → `merchant_menu_items.selling_price`
 *   - Addons               → `merchant_menu_item_addons.addon_price`
 *
 * "Net" = the merchant's stated payout intent. We then apply commission on
 * top exactly once via `customerPriceFromBase`, matching the customer menu
 * API in [merchant.service.ts]. Any failed lookup (item deleted between
 * cart-add and checkout) falls back to the client-sent value so checkout
 * isn't blocked.
 */

import { getSql } from "../../db/client.js";
import { resolveStoreCommission } from "../commission/commission.resolver.js";
import { customerPriceFromBase } from "../commission/pricing.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";

function markupRupees(netRupees: number, percent: number): number {
  if (!Number.isFinite(netRupees) || netRupees <= 0) return 0;
  const { customerPaise } = customerPriceFromBase(
    Math.round(netRupees * 100),
    percent,
  );
  return customerPaise / 100;
}

export async function rewriteCartPricesAuthoritatively(
  storeId: number,
  items: NormalizedOrderItem[],
): Promise<NormalizedOrderItem[]> {
  if (items.length === 0) return items;
  const sql = getSql();
  const commission = await resolveStoreCommission(storeId);
  const pct = commission.percent;

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
  /** variant row PK → net price */
  const variantPriceByPk = new Map<number, number>();
  /** `${menuItemId}\t${variant_id text}` → net price */
  const variantPriceByItemKey = new Map<string, number>();
  const addonPriceByPk = new Map<number, number>();
  const addonPriceByTextKey = new Map<string, number>();

  if (itemIds.length > 0) {
    const rows = await sql<Array<{ id: number; selling_price: string }>>`
      SELECT id, selling_price::text AS selling_price
      FROM merchant_menu_items
      WHERE id IN ${sql(itemIds)}
        AND store_id = ${storeId}
    `;
    for (const r of rows) {
      const p = parseFloat(r.selling_price);
      if (Number.isFinite(p) && p > 0) itemPriceById.set(Number(r.id), p);
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
    const rewrittenBase =
      net != null ? markupRupees(net, pct) : it.basePrice; // fallback: keep client value

    const rewrittenAddons = it.addons.map((a) => {
      const textKey = `${a.customizationId ?? ""}\t${a.menuAddonId}`;
      const addonNet =
        (a.menuAddonPk != null ? addonPriceByPk.get(a.menuAddonPk) : undefined) ??
        addonPriceByTextKey.get(textKey);
      if (addonNet == null) return a;
      return { ...a, addonPrice: markupRupees(addonNet, pct) };
    });

    return { ...it, basePrice: rewrittenBase, addons: rewrittenAddons };
  });
}
