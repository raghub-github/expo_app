/**
 * Merchant-facing prices: show order_item_commission_snapshots.merchant_base_price
 * (not customer_visible_price) across merchant app, partner site, and dashboard.
 */
import type { Sql } from "postgres";
import { merchantFundedDiscountFromBilling } from "./merchant-billing-discount.js";
import { resolveStoreCommission } from "../modules/commission/commission.resolver.js";

export type ItemCommissionSnapshot = {
  orderItemId: number;
  itemName: string;
  quantity: number;
  merchantBasePerUnit: number;
  customerVisiblePerUnit: number;
};

export type MerchantOrderItemLike = {
  qty: number;
  name: string;
  price: number;
  veg_nonveg?: string | null;
  customizations?: string[];
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
  customization_lines?: Array<{ amount?: number; kind?: string; name?: string }>;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function customizationsTotalFromItem(item: MerchantOrderItemLike): number {
  const direct = num(item.customizations_total);
  if (direct > 0.005) return round2(direct);
  const lines = item.customization_lines;
  if (Array.isArray(lines) && lines.length > 0) {
    return round2(lines.reduce((s, l) => s + num(l.amount), 0));
  }
  return 0;
}

/** Sum of merchant_base_price × qty for all snapshot lines. */
export function merchantSubtotalFromSnapshots(lines: ItemCommissionSnapshot[]): number {
  return round2(lines.reduce((acc, l) => acc + l.merchantBasePerUnit * Math.max(1, l.quantity), 0));
}

export async function loadSnapshotsByOrderTexts(
  sql: Sql,
  orderTexts: string[],
  storeId?: number
): Promise<Map<string, ItemCommissionSnapshot[]>> {
  const unique = [...new Set(orderTexts.map((t) => String(t ?? "").trim()).filter(Boolean))];
  const out = new Map<string, ItemCommissionSnapshot[]>();
  if (unique.length === 0) return out;

  const rows = await sql<
    Array<{
      order_text: string;
      order_item_id: number;
      item_name: string | null;
      quantity: number | null;
      merchant_base_price: string | number;
      customer_visible_price: string | number;
    }>
  >`
    SELECT
      oc.order_id AS order_text,
      s.order_item_id,
      oci.item_name,
      oci.quantity,
      s.merchant_base_price::text AS merchant_base_price,
      s.customer_visible_price::text AS customer_visible_price
    FROM order_item_commission_snapshots s
    JOIN orders_core oc ON oc.id = s.order_id
    JOIN orders_core_items oci ON oci.id = s.order_item_id
    WHERE oc.order_id = ANY(${unique})
      ${storeId != null && storeId > 0 ? sql`AND s.store_id = ${storeId}` : sql``}
    ORDER BY s.id ASC
  `;

  for (const r of rows) {
    const key = String(r.order_text ?? "").trim();
    if (!key) continue;
    const line: ItemCommissionSnapshot = {
      orderItemId: Number(r.order_item_id),
      itemName: String(r.item_name ?? "").trim(),
      quantity: Math.max(1, Number(r.quantity) || 1),
      merchantBasePerUnit: num(r.merchant_base_price),
      customerVisiblePerUnit: num(r.customer_visible_price),
    };
    const list = out.get(key) ?? [];
    list.push(line);
    out.set(key, list);
  }
  return out;
}

export async function merchantBaseFromCustomerUnit(
  storeId: number,
  customerVisiblePerUnit: number
): Promise<number> {
  if (!Number.isFinite(customerVisiblePerUnit) || customerVisiblePerUnit <= 0) return 0;
  try {
    const c = await resolveStoreCommission(storeId);
    const pct = c.percent;
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) return customerVisiblePerUnit;
    return round2((customerVisiblePerUnit * (100 - pct)) / 100);
  } catch {
    return customerVisiblePerUnit;
  }
}

/**
 * Replace line totals with merchant_base × qty; returns merchant item subtotal.
 */
export async function applyMerchantBaseToOrderItems(
  items: MerchantOrderItemLike[],
  snapshots: ItemCommissionSnapshot[],
  opts?: { storeId?: number; commissionPercent?: number }
): Promise<{ items: MerchantOrderItemLike[]; merchantSubtotal: number }> {
  if (items.length === 0) {
    return { items: [], merchantSubtotal: 0 };
  }

  let pct = opts?.commissionPercent;
  if (pct == null && opts?.storeId != null && opts.storeId > 0) {
    try {
      const c = await resolveStoreCommission(opts.storeId);
      pct = c.percent;
    } catch {
      pct = undefined;
    }
  }

  const usedSnapIds = new Set<number>();
  let subtotal = 0;
  const out: MerchantOrderItemLike[] = [];

  for (const item of items) {
    const qty = Math.max(1, Number(item.qty) || 1);
    const name = String(item.name ?? "").trim();
    const nn = normName(name);

    let snap =
      snapshots.find(
        (s) =>
          !usedSnapIds.has(s.orderItemId) &&
          normName(s.itemName) === nn &&
          s.quantity === qty
      ) ??
      snapshots.find(
        (s) => !usedSnapIds.has(s.orderItemId) && normName(s.itemName) === nn
      ) ??
      snapshots.find((s) => !usedSnapIds.has(s.orderItemId));

    const oldLineTotal = num(item.price);
    const oldCust = customizationsTotalFromItem(item);
    const oldBase =
      num(item.base_amount) > 0.005
        ? num(item.base_amount)
        : Math.max(0, oldLineTotal - oldCust);

    let newBaseLine = oldBase > 0.005 ? oldBase : round2(oldLineTotal - oldCust);
    if (snap) {
      usedSnapIds.add(snap.orderItemId);
      newBaseLine = round2(snap.merchantBasePerUnit * qty);
    } else if (pct != null && Number.isFinite(pct) && pct >= 0 && pct < 100) {
      const unitCustomer = (oldBase > 0.005 ? oldBase : oldLineTotal) / qty;
      newBaseLine = round2(((unitCustomer * (100 - pct)) / 100) * qty);
    }

    let newCust = oldCust;
    if (oldCust > 0.005 && oldBase > 0.005 && newBaseLine > 0) {
      newCust = round2(oldCust * (newBaseLine / oldBase));
    }

    const lineTotal = round2(newBaseLine + newCust);
    subtotal += lineTotal;
    out.push({ ...item, qty, name, price: lineTotal });
  }

  if (snapshots.length > 0 && usedSnapIds.size < snapshots.length) {
    for (const s of snapshots) {
      if (usedSnapIds.has(s.orderItemId)) continue;
      const line = round2(s.merchantBasePerUnit * Math.max(1, s.quantity));
      subtotal += line;
    }
  }

  return { items: out, merchantSubtotal: round2(subtotal) };
}

/**
 * After applyMerchantBaseToOrderItems, scale base/add-on breakdown to match merchant line total
 * (same logic as partnersite food-orders API and dashboard load-store-food-orders).
 */
export function scaleMerchantOrderItemBreakdown(
  item: MerchantOrderItemLike,
  merchantLineTotal: number
): MerchantOrderItemLike {
  const lineTotal = round2(merchantLineTotal);
  const oldBase =
    num(item.base_amount) > 0.005
      ? num(item.base_amount)
      : num(item.captured_base_amount) || 0;
  const oldCust =
    num(item.customizations_total) > 0.005
      ? num(item.customizations_total)
      : num(item.captured_addon_amount) || 0;
  const oldLine =
    oldBase + oldCust > 0.005 ? round2(oldBase + oldCust) : num(item.price) || lineTotal;
  const factor = oldLine > 0.005 ? lineTotal / oldLine : 1;
  const newBase = round2(oldBase * factor);
  const newCust = round2(oldCust * factor);
  const recomposed = round2(newBase + newCust);
  const finalLine = recomposed > 0.005 ? recomposed : lineTotal;

  return {
    ...item,
    price: finalLine,
    base_amount: newBase > 0.005 ? newBase : item.base_amount,
    customizations_total: newCust > 0.005 ? newCust : item.customizations_total,
    captured_base_amount:
      item.captured_base_amount != null
        ? round2(num(item.captured_base_amount) * factor)
        : undefined,
    captured_addon_amount:
      item.captured_addon_amount != null
        ? round2(num(item.captured_addon_amount) * factor)
        : undefined,
    customization_lines: item.customization_lines?.map((l) => ({
      ...l,
      amount: round2(num(l.amount) * factor),
    })),
  };
}

/** Merchant-facing order total: item subtotal (merchant base) + packaging − merchant-funded discount. */
export function merchantOrderTotalFromBilling(
  merchantItemSubtotal: number,
  billing: Record<string, unknown> | null | undefined,
  packagingFallback = 0
): number {
  const snap = billing && typeof billing === "object" ? billing : {};
  const packaging = num(snap.packaging_fee) || packagingFallback;
  const merchantDisc = merchantFundedDiscountFromBilling(snap);
  return round2(Math.max(0, merchantItemSubtotal + packaging - merchantDisc));
}
