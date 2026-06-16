/**
 * Merchant-facing item prices from order_item_commission_snapshots (merchant_base_price).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { merchantFundedDiscountFromBilling } from '@/lib/merchant-billing-discount';

export type ItemCommissionSnapshot = {
  orderItemId: number;
  itemName: string;
  quantity: number;
  merchantBasePerUnit: number;
  customerVisiblePerUnit: number;
};

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? '0'));
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
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

type MerchantPricingFields = {
  base_amount?: number;
  baseAmount?: number;
  customizations_total?: number;
  customizationsTotal?: number;
  customization_lines?: Array<{ amount?: number }>;
  customizationLines?: Array<{ amount?: number }>;
};

function customizationsTotalFromItem(item: MerchantPricingFields): number {
  const direct = num(item.customizations_total ?? item.customizationsTotal);
  if (direct > 0.005) return round2(direct);
  const lines = item.customization_lines ?? item.customizationLines;
  if (Array.isArray(lines) && lines.length > 0) {
    return round2(lines.reduce((s, l) => s + num(l.amount), 0));
  }
  return 0;
}

export function merchantSubtotalFromSnapshots(lines: ItemCommissionSnapshot[]): number {
  return round2(lines.reduce((acc, l) => acc + l.merchantBasePerUnit * Math.max(1, l.quantity), 0));
}

export async function loadSnapshotsByOrderTexts(
  db: SupabaseClient,
  orderTexts: string[],
  storeId?: number
): Promise<Map<string, ItemCommissionSnapshot[]>> {
  const unique = [...new Set(orderTexts.map((t) => String(t ?? '').trim()).filter(Boolean))];
  const out = new Map<string, ItemCommissionSnapshot[]>();
  if (unique.length === 0) return out;

  const { data: coreRows } = await db
    .from('orders_core')
    .select('id, order_id')
    .in('order_id', unique);
  if (!coreRows?.length) return out;

  const coreIdToText = new Map<number, string>();
  const coreIds: number[] = [];
  for (const c of coreRows as Array<{ id: number; order_id: string }>) {
    const id = Number(c.id);
    const text = String(c.order_id ?? '').trim();
    if (!Number.isFinite(id) || !text) continue;
    coreIds.push(id);
    coreIdToText.set(id, text);
  }
  if (coreIds.length === 0) return out;

  let snapQ = db
    .from('order_item_commission_snapshots')
    .select('order_id, order_item_id, merchant_base_price, customer_visible_price, store_id')
    .in('order_id', coreIds);
  if (storeId != null && storeId > 0) snapQ = snapQ.eq('store_id', storeId);
  const { data: snapRows } = await snapQ;
  if (!snapRows?.length) return out;

  const itemIds = [
    ...new Set(
      (snapRows as Array<{ order_item_id: number }>)
        .map((r) => Number(r.order_item_id))
        .filter((n) => Number.isFinite(n))
    ),
  ];
  const itemMeta = new Map<number, { item_name: string; quantity: number }>();
  if (itemIds.length > 0) {
    const { data: itemRows } = await db
      .from('orders_core_items')
      .select('id, item_name, quantity')
      .in('id', itemIds);
    for (const ir of itemRows ?? []) {
      const row = ir as { id: number; item_name: string; quantity: number };
      itemMeta.set(Number(row.id), {
        item_name: String(row.item_name ?? ''),
        quantity: Math.max(1, Number(row.quantity) || 1),
      });
    }
  }

  for (const raw of snapRows as Array<Record<string, unknown>>) {
    const coreId = Number(raw.order_id);
    const text = coreIdToText.get(coreId);
    if (!text) continue;
    const itemId = Number(raw.order_item_id);
    const meta = itemMeta.get(itemId);
    const line: ItemCommissionSnapshot = {
      orderItemId: itemId,
      itemName: String(meta?.item_name ?? '').trim(),
      quantity: meta?.quantity ?? 1,
      merchantBasePerUnit: num(raw.merchant_base_price),
      customerVisiblePerUnit: num(raw.customer_visible_price),
    };
    const list = out.get(text) ?? [];
    list.push(line);
    out.set(text, list);
  }
  return out;
}

export function applyMerchantBaseToOrderItems<
  T extends {
    quantity?: number;
    qty?: number;
    name: string;
    price?: number;
    total?: number;
  } & MerchantPricingFields,
>(items: T[], snapshots: ItemCommissionSnapshot[], commissionPercent?: number): {
  items: T[];
  merchantSubtotal: number;
} {
  const used = new Set<number>();
  let subtotal = 0;
  const out: T[] = [];

  for (const item of items) {
    const qty = Math.max(1, Number(item.quantity ?? item.qty) || 1);
    const name = String(item.name ?? '').trim();
    const nn = normName(name);
    const snap =
      snapshots.find(
        (s) => !used.has(s.orderItemId) && normName(s.itemName) === nn && s.quantity === qty
      ) ??
      snapshots.find((s) => !used.has(s.orderItemId) && normName(s.itemName) === nn) ??
      snapshots.find((s) => !used.has(s.orderItemId));

    const oldLineTotal = num(item.total ?? item.price ?? 0);
    const oldCust = customizationsTotalFromItem(item);
    const oldBase =
      num(item.base_amount ?? item.baseAmount) > 0.005
        ? num(item.base_amount ?? item.baseAmount)
        : Math.max(0, oldLineTotal - oldCust);

    let newBaseLine = oldBase > 0.005 ? oldBase : round2(oldLineTotal - oldCust);
    if (snap) {
      used.add(snap.orderItemId);
      newBaseLine = merchantMenuRupee(snap.merchantBasePerUnit) * qty;
    } else if (
      commissionPercent != null &&
      Number.isFinite(commissionPercent) &&
      commissionPercent >= 0 &&
      commissionPercent < 100
    ) {
      const unit = (oldBase > 0.005 ? oldBase : oldLineTotal) / qty;
      newBaseLine = merchantMenuRupee((unit * (100 - commissionPercent)) / 100) * qty;
    }

    let newCust = oldCust;
    if (oldCust > 0.005 && oldBase > 0.005 && newBaseLine > 0) {
      newCust = merchantMenuRupee(oldCust * (newBaseLine / oldBase));
    }

    const lineTotal = merchantMenuRupee(newBaseLine + newCust);
    subtotal += lineTotal;
    out.push({
      ...item,
      quantity: qty,
      qty,
      price: lineTotal,
      total: lineTotal,
    } as T);
  }

  return { items: out, merchantSubtotal: merchantMenuRupee(subtotal) };
}

export function merchantOrderTotalFromBilling(
  merchantItemSubtotal: number,
  billing: Record<string, unknown> | null | undefined,
  packagingFallback = 0
): number {
  const snap = billing && typeof billing === 'object' ? billing : {};
  const packaging = num(snap.packaging_fee) || packagingFallback;
  const merchantDisc = merchantFundedDiscountFromBilling(snap);
  return round2(Math.max(0, merchantItemSubtotal + packaging - merchantDisc));
}
