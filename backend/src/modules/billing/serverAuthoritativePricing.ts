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
  const variantIds = Array.from(
    new Set(
      items
        .map((i) => i.variantId)
        .filter((n): n is number => n != null && Number.isFinite(n) && n > 0),
    ),
  );
  const addonIds = Array.from(
    new Set(
      items.flatMap((i) =>
        i.addons.map((a) => a.addonId).filter((n) => Number.isFinite(n) && n > 0),
      ),
    ),
  );

  // Load all required prices in three batched lookups.
  const itemPriceById = new Map<number, number>();
  const variantPriceById = new Map<number, number>();
  const addonPriceById = new Map<number, number>();

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
  if (variantIds.length > 0) {
    const rows = await sql<Array<{ id: number; variant_price: string }>>`
      SELECT id, variant_price::text AS variant_price
      FROM merchant_menu_item_variants
      WHERE id IN ${sql(variantIds)}
    `;
    for (const r of rows) {
      const p = parseFloat(r.variant_price);
      if (Number.isFinite(p) && p > 0) variantPriceById.set(Number(r.id), p);
    }
  }
  if (addonIds.length > 0) {
    const rows = await sql<Array<{ id: number; addon_price: string }>>`
      SELECT id, addon_price::text AS addon_price
      FROM merchant_menu_item_addons
      WHERE id IN ${sql(addonIds)}
    `;
    for (const r of rows) {
      const p = parseFloat(r.addon_price);
      if (Number.isFinite(p) && p >= 0) addonPriceById.set(Number(r.id), p);
    }
  }

  return items.map((it) => {
    // Pick the merchant's net price for this line.
    const variantNet =
      it.variantId != null && it.variantId > 0 ? variantPriceById.get(it.variantId) : undefined;
    const itemNet = itemPriceById.get(it.menuItemId);
    const net = variantNet ?? itemNet;
    const rewrittenBase =
      net != null ? markupRupees(net, pct) : it.basePrice; // fallback: keep client value

    const rewrittenAddons = it.addons.map((a) => {
      const addonNet = addonPriceById.get(a.addonId);
      if (addonNet == null) return a;
      return { ...a, addonPrice: markupRupees(addonNet, pct) };
    });

    return { ...it, basePrice: rewrittenBase, addons: rewrittenAddons };
  });
}
