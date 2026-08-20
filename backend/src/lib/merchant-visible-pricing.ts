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
  has_customizations?: boolean;
  catalog_line_total?: number;
  net_line_total?: number;
  offer_discount?: number;
  offer_label?: string | null;
  is_item_promo?: boolean;
  applied_offer_type?: string | null;
  ctm_from_snapshot?: boolean;
};

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole-rupee menu price as merchants set in menu (₹150, not ₹149.60). */
export function merchantMenuRupee(n: number): number {
  return Math.round(Number.isFinite(n) ? n : 0);
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
      newBaseLine = merchantMenuRupee(snap.merchantBasePerUnit) * qty;
    } else if (pct != null && Number.isFinite(pct) && pct >= 0 && pct < 100) {
      const unitCustomer = (oldBase > 0.005 ? oldBase : oldLineTotal) / qty;
      newBaseLine = merchantMenuRupee((unitCustomer * (100 - pct)) / 100) * qty;
    }

    let newCust = oldCust;
    if (oldCust > 0.005 && oldBase > 0.005 && newBaseLine > 0) {
      newCust = merchantMenuRupee(oldCust * (newBaseLine / oldBase));
    }

    const lineTotal = merchantMenuRupee(newBaseLine + newCust);
    subtotal += lineTotal;
    out.push({ ...item, qty, name, price: lineTotal });
  }

  if (snapshots.length > 0 && usedSnapIds.size < snapshots.length) {
    for (const s of snapshots) {
      if (usedSnapIds.has(s.orderItemId)) continue;
      const line = merchantMenuRupee(s.merchantBasePerUnit) * Math.max(1, s.quantity);
      subtotal += line;
    }
  }

  return { items: out, merchantSubtotal: merchantMenuRupee(subtotal) };
}

/**
 * After applyMerchantBaseToOrderItems, scale base/add-on breakdown to match merchant line total
 * (same logic as partnersite food-orders API and dashboard load-store-food-orders).
 */
export function scaleMerchantOrderItemBreakdown(
  item: MerchantOrderItemLike,
  merchantLineTotal: number
): MerchantOrderItemLike {
  const lineTotal = merchantMenuRupee(merchantLineTotal);
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
  const newBase = merchantMenuRupee(oldBase * factor);
  const newCust = merchantMenuRupee(oldCust * factor);
  const recomposed = merchantMenuRupee(newBase + newCust);
  const finalLine = recomposed > 0.005 ? recomposed : lineTotal;

  return {
    ...item,
    price: finalLine,
    base_amount: newBase > 0.005 ? newBase : item.base_amount,
    customizations_total: newCust > 0.005 ? newCust : item.customizations_total,
    captured_base_amount:
      item.captured_base_amount != null
        ? merchantMenuRupee(num(item.captured_base_amount) * factor)
        : undefined,
    captured_addon_amount:
      item.captured_addon_amount != null
        ? merchantMenuRupee(num(item.captured_addon_amount) * factor)
        : undefined,
    customization_lines: item.customization_lines?.map((l) => ({
      ...l,
      amount: merchantMenuRupee(num(l.amount) * factor),
    })),
    catalog_line_total:
      item.catalog_line_total != null
        ? merchantMenuRupee(num(item.catalog_line_total) * factor)
        : finalLine,
    net_line_total:
      item.net_line_total != null
        ? merchantMenuRupee(num(item.net_line_total) * factor)
        : undefined,
    offer_discount:
      item.offer_discount != null
        ? merchantMenuRupee(num(item.offer_discount) * factor)
        : undefined,
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

function normalizeItemsForMerchantTotal(raw: unknown): MerchantOrderItemLike[] {
  if (!Array.isArray(raw)) return [];
  const out: MerchantOrderItemLike[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const qty = Number(r.quantity ?? r.qty ?? 1) || 1;
    const name = String(r.item_name ?? r.name ?? "Item");
    const price = num(r.total_price ?? r.price ?? r.base_price ?? 0);
    out.push({
      qty,
      name,
      price,
      veg_nonveg:
        r.veg_nonveg != null && String(r.veg_nonveg).trim()
          ? String(r.veg_nonveg).trim()
          : undefined,
      customizations: Array.isArray(r.customizations)
        ? (r.customizations as unknown[]).map((c) => String(c).trim()).filter(Boolean)
        : undefined,
      base_amount: r.base_amount != null ? num(r.base_amount) : undefined,
      customizations_total:
        r.customizations_total != null ? num(r.customizations_total) : undefined,
      captured_base_amount:
        r.captured_base_amount != null ? num(r.captured_base_amount) : undefined,
      captured_addon_amount:
        r.captured_addon_amount != null ? num(r.captured_addon_amount) : undefined,
      customization_lines: Array.isArray(r.customization_lines)
        ? (r.customization_lines as Array<Record<string, unknown>>).map((l) => ({
            name: String(l.name ?? ""),
            amount: num(l.amount),
            kind: String(l.kind ?? "addon") as "variant" | "addon" | "note",
          }))
        : undefined,
      has_customizations: Boolean(r.has_customizations),
      catalog_line_total:
        r.catalog_line_total != null || r.catalogLineTotal != null
          ? num(r.catalog_line_total ?? r.catalogLineTotal)
          : undefined,
      net_line_total:
        r.net_line_total != null || r.netLineTotal != null
          ? num(r.net_line_total ?? r.netLineTotal)
          : undefined,
      offer_discount:
        r.offer_discount != null || r.offerDiscount != null
          ? num(r.offer_discount ?? r.offerDiscount)
          : undefined,
      ctm_from_snapshot: Boolean(r.ctm_from_snapshot ?? r.ctmFromSnapshot),
    });
  }
  return out;
}

/** Qty shown in merchant new-order templates (`N item(s)`). */
export function merchantNotifyItemCount(items: Array<{ qty?: number }>): number {
  const n = items.reduce((s, it) => s + Math.max(1, Number(it.qty) || 1), 0);
  return n > 0 ? n : items.length;
}

/**
 * What GatiMitra pays the merchant for frozen CTM lines — discounted MX (net),
 * never original catalog / gross. ₹149 pizza with 40% store offer → ₹89.40, not ₹149.
 */
export function merchantCtmNetSumFromItems(items: MerchantOrderItemLike[]): number {
  return round2(
    items.reduce((s, it) => {
      const net = num(it.net_line_total);
      if (net > 0.005) return s + net;
      const catalog = num(it.catalog_line_total ?? it.price);
      const disc = num(it.offer_discount);
      return s + Math.max(0, catalog - disc);
    }, 0)
  );
}

/** Billing `order_line_pricing[].canonical_pricing.discounted_ctm_line` — MX after store offer. */
export function merchantNetCtmFromBillingCanonical(
  billing: Record<string, unknown> | null | undefined
): number {
  if (!billing || typeof billing !== "object") return 0;
  const rows = billing.order_line_pricing ?? billing.orderLinePricing;
  if (!Array.isArray(rows)) return 0;
  return round2(
    rows.reduce((s, row) => {
      if (!row || typeof row !== "object") return s;
      const r = row as Record<string, unknown>;
      const canon = r.canonical_pricing ?? r.canonicalPricing;
      if (!canon || typeof canon !== "object") return s;
      const c = canon as Record<string, unknown>;
      const net = num(c.discounted_ctm_line ?? c.discountedCtmLine);
      return net > 0.005 ? s + net : s;
    }, 0)
  );
}

export type MerchantVisibleOrderNotify = {
  amount: number;
  itemCount: number;
  customerName: string;
};

/**
 * Same merchant order value as merchant app incoming modal (pricing.total / merchantOrderBillTotal).
 * Used for push + in-app notifications — payout CTM, not original MX catalog / customer grand_total.
 */
export async function resolveMerchantVisibleOrderTotal(
  sql: Sql,
  args: { merchantStoreId: number; orderIdText: string }
): Promise<number | null> {
  const resolved = await resolveMerchantVisibleOrderNotify(sql, args);
  return resolved?.amount ?? null;
}

export async function resolveMerchantVisibleOrderNotify(
  sql: Sql,
  args: { merchantStoreId: number; orderIdText: string }
): Promise<MerchantVisibleOrderNotify | null> {
  const orderIdText = String(args.orderIdText ?? "").trim();
  const storeId = Number(args.merchantStoreId);
  if (!orderIdText || !Number.isFinite(storeId) || storeId <= 0) return null;

  type CoreRow = {
    billing_snapshot: unknown;
    items: unknown;
    merchant_precision_discount: unknown;
    total_ctm?: unknown;
  };
  let coreRows: CoreRow[];
  try {
    coreRows = await sql<CoreRow[]>`
      SELECT billing_snapshot, items, merchant_precision_discount, total_ctm
      FROM orders_core
      WHERE order_id = ${orderIdText}
        AND merchant_store_id = ${storeId}
      LIMIT 1
    `;
  } catch (err) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    coreRows = await sql<CoreRow[]>`
      SELECT billing_snapshot, items, merchant_precision_discount
      FROM orders_core
      WHERE order_id = ${orderIdText}
        AND merchant_store_id = ${storeId}
      LIMIT 1
    `;
  }
  const core = coreRows[0];
  if (!core) return null;

  const billingSnap =
    core.billing_snapshot && typeof core.billing_snapshot === "object"
      ? (core.billing_snapshot as Record<string, unknown>)
      : null;

  const { loadMerchantOrderLineItemsByTextIds } = await import(
    "./load-merchant-order-line-items.js"
  );
  const itemsByText = await loadMerchantOrderLineItemsByTextIds(sql, [orderIdText]);
  let items: MerchantOrderItemLike[] = itemsByText.get(orderIdText) ?? [];
  if (!items.length) {
    items = normalizeItemsForMerchantTotal(core.items);
  }

  const itemCount = merchantNotifyItemCount(items);
  const customerName = "Customer";
  const wrap = (amount: number | null): MerchantVisibleOrderNotify | null =>
    amount != null && amount > 0.005 ? { amount: round2(amount), itemCount, customerName } : null;

  const frozenTotalCtm = num(core.total_ctm);
  if (frozenTotalCtm > 0.005) return wrap(frozenTotalCtm);

  if (!items.length) return null;

  const packaging = num(billingSnap?.packaging_fee ?? 0);
  const precisionFromCore = Math.max(0, num(core.merchant_precision_discount));
  const allCtmFrozen = items.length > 0 && items.every((it) => it.ctm_from_snapshot === true);
  if (allCtmFrozen) {
    const ctmNetSum = merchantCtmNetSumFromItems(items);
    return wrap(Math.max(0, ctmNetSum + packaging - precisionFromCore));
  }

  const canonNet = merchantNetCtmFromBillingCanonical(billingSnap);
  if (canonNet > 0.005) {
    return wrap(Math.max(0, canonNet + packaging - precisionFromCore));
  }

  let commissionPercent: number | undefined;
  try {
    const c = await resolveStoreCommission(storeId);
    commissionPercent = c.percent;
  } catch {
    commissionPercent = undefined;
  }

  const snaps = await loadSnapshotsByOrderTexts(sql, [orderIdText], storeId);
  const snapshotLines = snaps.get(orderIdText) ?? [];

  const { items: merchantItems, merchantSubtotal } = await applyMerchantBaseToOrderItems(
    items,
    snapshotLines,
    { storeId, commissionPercent }
  );

  const itemsSubtotal = round2(
    items.reduce((s, it, i) => {
      const mapped = merchantItems[i];
      const lineTotal = num(mapped?.price ?? it.price);
      return s + lineTotal;
    }, 0)
  );

  const total = merchantOrderTotalFromBilling(
    itemsSubtotal > 0.005 ? itemsSubtotal : merchantSubtotal,
    billingSnap,
    packaging
  );
  return wrap(total);
}
