/**
 * Locks commission economics per add-on line at order placement
 * (same semantics as order_item_commission_snapshots for base items).
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { orderItemAddonCommissionSnapshots } from "../../db/schema.js";
import { resolveStoreCommission } from "./commission.resolver.js";

export type AddonForCommissionSnapshot = {
  orderItemAddonId: number;
  menuAddonId: string;
  customizationId: string | null;
  menuAddonPk: number | null;
  addonName: string;
  quantity: number;
  /** Per-unit customer-visible add-on price (commission-included). */
  customerVisiblePerUnitRupees: number;
};

export async function writeOrderAddonCommissionSnapshots(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  storeId: number,
  orderIdNum: number,
  orderItemId: number,
  addons: AddonForCommissionSnapshot[],
): Promise<void> {
  if (addons.length === 0 || !Number.isFinite(orderIdNum) || orderIdNum <= 0) return;

  const commission = await resolveStoreCommission(storeId);
  const pct = commission.percent;
  if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
    console.warn(
      `[commission] invalid percent ${pct} for store ${storeId} — skipping addon snapshots`,
    );
    return;
  }

  const rows: (typeof orderItemAddonCommissionSnapshots.$inferInsert)[] = [];

  for (const ad of addons) {
    const customer = ad.customerVisiblePerUnitRupees;
    if (!Number.isFinite(customer) || customer <= 0) continue;
    const merchantBaseRupees = (customer * (100 - pct)) / 100;
    const platformEarningRupees = customer - merchantBaseRupees;
    let menuAddonId = String(ad.menuAddonId ?? "").trim();
    if (menuAddonId === "0" || menuAddonId === "undefined" || menuAddonId === "null") {
      menuAddonId = "";
    }
    if (!menuAddonId) continue;

    rows.push({
      orderId: orderIdNum,
      orderItemId,
      orderItemAddonId: ad.orderItemAddonId,
      storeId,
      menuAddonId,
      customizationId: ad.customizationId,
      menuAddonPk: ad.menuAddonPk,
      addonName: ad.addonName || null,
      quantity: Math.max(1, ad.quantity),
      merchantBasePrice: merchantBaseRupees.toFixed(2),
      commissionPercent: pct.toFixed(2),
      customerVisiblePrice: customer.toFixed(2),
      platformEarning: platformEarningRupees.toFixed(2),
      sourceRuleKind: commission.sourceKind,
      sourceRuleId: commission.sourceRuleId,
      sourcePlanId: commission.sourcePlanId,
      sourceSubscriptionId: commission.sourceSubscriptionId,
    });
  }

  if (rows.length === 0) return;

  try {
    await tx.insert(orderItemAddonCommissionSnapshots).values(rows);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01") {
      console.warn(
        "[commission] order_item_addon_commission_snapshots missing — apply 0236. Add-on snapshot skipped.",
      );
      return;
    }
    console.error(
      `[commission] failed to write ${rows.length} addon snapshot(s) for order ${orderIdNum} item ${orderItemId}:`,
      err,
    );
    throw err;
  }
}
