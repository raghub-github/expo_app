/**
 * Writes one row per order_item into order_item_commission_snapshots, locking
 * the resolved commission %, the merchant's payout, the customer-visible price,
 * and the platform earning for each line.
 *
 * Why this exists:
 *   Future commission rule changes must never retroactively change the
 *   economics of a placed order. The billingSnapshot JSON on orders_core
 *   captures *something*, but a structured per-line snapshot is required by
 *   settlement/reporting queries which JOIN rather than parse JSON.
 *
 * Note on semantics of input `customerVisiblePerUnit`:
 *   By the time finalizeOrder runs, the value in items[i].basePrice is what
 *   the customer saw when they added the item to cart (the commission-included
 *   selling_price returned by the menu API). We treat it as customer_visible
 *   and compute the merchant base by working the formula backwards. This keeps
 *   the snapshot consistent with what the customer was charged even if rules
 *   shift between cart and finalize.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { resolveStoreCommission, type ResolvedCommission } from "./commission.resolver.js";

type ItemForSnapshot = {
  /** order_id text (e.g. GM10000001) — used to look up the inserted order's PK */
  orderIdText: string;
  /** the BIGINT PK returned by orders_core_items.insert(...).returning({ id }) */
  orderItemId: number;
  /** Per-unit customer-visible price (this is what items[i].basePrice carries today) */
  customerVisiblePerUnitRupees: number;
  /** quantity for this item line */
  quantity: number;
};

export async function resolveOrdersCorePk(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  orderIdText: string,
): Promise<number | null> {
  const rows = await tx.execute(
    sql`SELECT id FROM orders_core WHERE order_id = ${orderIdText} LIMIT 1`,
  );
  const orderRow = (rows as unknown as Array<{ id: number | string }>)[0];
  if (!orderRow) return null;
  const n = Number(orderRow.id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function writeOrderItemCommissionSnapshots(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  storeId: number,
  items: ItemForSnapshot[],
  orderIdNumOverride?: number,
  /** Pre-resolved outside db.transaction() to avoid a second pool connection mid-txn. */
  commissionOverride?: ResolvedCommission | null,
): Promise<void> {
  if (items.length === 0) return;
  const commission = commissionOverride ?? (await resolveStoreCommission(storeId));
  const pct = commission.percent;
  // If somehow commission resolved to 100% (invalid) we skip writing and let
  // upstream alert us — better to drop the snapshot than insert nonsense.
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
    console.warn(`[commission] resolver returned invalid percent ${pct} for store ${storeId} — skipping snapshot`);
    return;
  }

  let orderIdNum: number | null =
    orderIdNumOverride != null && orderIdNumOverride > 0 ? orderIdNumOverride : null;
  if (orderIdNum == null) {
    const orderText = items[0]!.orderIdText;
    orderIdNum = await resolveOrdersCorePk(tx, orderText);
  }
  if (orderIdNum == null || orderIdNum <= 0) {
    console.warn(`[commission] orders_core row missing — skipping item snapshot`);
    return;
  }

  for (const it of items) {
    const customer = it.customerVisiblePerUnitRupees;
    if (!Number.isFinite(customer) || customer <= 0) continue;
    // merchant_base = customer * (100 - pct) / 100
    const merchantBaseRupees = (customer * (100 - pct)) / 100;
    const platformEarningRupees = customer - merchantBaseRupees;
    try {
      await tx.execute(sql`
        INSERT INTO order_item_commission_snapshots (
          order_id, order_item_id, store_id,
          merchant_base_price, commission_percent,
          customer_visible_price, platform_earning,
          source_rule_kind, source_rule_id, source_plan_id, source_subscription_id
        ) VALUES (
          ${orderIdNum},
          ${it.orderItemId},
          ${storeId},
          ${merchantBaseRupees.toFixed(2)},
          ${pct.toFixed(2)},
          ${customer.toFixed(2)},
          ${platformEarningRupees.toFixed(2)},
          ${commission.sourceKind},
          ${commission.sourceRuleId},
          ${commission.sourcePlanId},
          ${commission.sourceSubscriptionId}
        )
      `);
    } catch (err) {
      // 42P01 = order_item_commission_snapshots not yet created (migration 0227
      // not applied). We do NOT want order placement to fail in this case — log
      // and skip so the order succeeds; settlement can backfill once migrations run.
      const code = (err as { code?: string })?.code;
      if (code === "42P01") {
        console.warn(
          "[commission] order_item_commission_snapshots missing — apply 0227. Order placed without snapshot.",
        );
        return;
      }
      throw err;
    }
  }
}
