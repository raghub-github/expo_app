import type { SupabaseClient } from '@supabase/supabase-js';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { parseMerchantBillingBreakdown } from '@/lib/orderLineItems';
import { merchantFundedDiscountFromBilling } from '@/lib/merchant-billing-discount';
import {
  applyMerchantBaseToOrderItems,
  loadSnapshotsByOrderTexts,
  type ItemCommissionSnapshot,
} from '@/lib/merchant-visible-pricing';
import {
  merchantBillPartsFromItems,
  resolveMerchantCtm as resolveMerchantCtmFromOrder,
} from '@/lib/merchant-order-item-display';
import {
  collectCoreItemOrderKeys,
  loadCoreDbItemsByOrderTextIds,
  resolvePartnerOrderItems,
} from '@/lib/partnerFoodOrderItems';

export { resolveMerchantCtmFromOrder as resolveMerchantCtm };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mapItemsWithMerchantBase(
  items: NormalizedOrderLineItem[],
  snaps: ItemCommissionSnapshot[]
): NormalizedOrderLineItem[] {
  const { items: merchantMapped } = applyMerchantBaseToOrderItems(
    items.map((it) => ({
      ...it,
      qty: it.quantity,
      price: it.total,
      total: it.total,
      base_amount: it.baseAmount,
      baseAmount: it.baseAmount,
      customizations_total: it.customizationsTotal,
      customizationsTotal: it.customizationsTotal,
      customization_lines: it.customizationLines,
      customizationLines: it.customizationLines,
    })),
    snaps ?? []
  );

  return items.map((it, i) => {
    const m = merchantMapped[i];
    if (!m) return it;
    const qty = Math.max(1, it.quantity || 1);
    const lineTotal = Number(m.total ?? m.price ?? it.total);
    const oldBase =
      Number(it.baseAmount) > 0.005
        ? Number(it.baseAmount)
        : Number(it.capturedBaseAmount) > 0.005
          ? Number(it.capturedBaseAmount)
          : 0;
    const oldCust =
      Number(it.customizationsTotal) > 0.005
        ? Number(it.customizationsTotal)
        : Number(it.capturedAddonAmount) > 0.005
          ? Number(it.capturedAddonAmount)
          : 0;
    const oldLine =
      oldBase + oldCust > 0.005 ? oldBase + oldCust : Number(it.total) || lineTotal;
    const factor = oldLine > 0.005 ? lineTotal / oldLine : 1;
    const newBase = Math.round(oldBase * factor * 100) / 100;
    const newCust = Math.round(oldCust * factor * 100) / 100;
    const finalLine = Math.round((newBase + newCust) * 100) / 100 || lineTotal;
    return {
      ...it,
      baseAmount: newBase > 0.005 ? newBase : it.baseAmount,
      customizationsTotal: newCust > 0.005 ? newCust : it.customizationsTotal,
      capturedBaseAmount:
        it.capturedBaseAmount != null
          ? Math.round(Number(it.capturedBaseAmount) * factor * 100) / 100
          : undefined,
      capturedAddonAmount:
        it.capturedAddonAmount != null
          ? Math.round(Number(it.capturedAddonAmount) * factor * 100) / 100
          : undefined,
      customizationLines: it.customizationLines?.map((l) => ({
        ...l,
        amount: Math.round((Number(l.amount) || 0) * factor * 100) / 100,
      })),
      total: finalLine,
      price: finalLine / qty,
    };
  });
}

/** Merchant bill total (CTM) from core + food rows — same formula as live order list. */
export async function computeMerchantCtmForPartnerOrder(
  db: SupabaseClient,
  ordersCoreId: number,
  storeId: number
): Promise<number | null> {
  const { data: core } = await db.from('orders_core').select('*').eq('id', ordersCoreId).maybeSingle();
  if (!core) return null;

  const { data: food } = await db
    .from('orders_food')
    .select('*')
    .eq('order_id', ordersCoreId)
    .maybeSingle();

  const coreRow = core as Record<string, unknown>;
  const foodRow = (food as Record<string, unknown> | null) ?? null;
  const orderText = String(coreRow.order_id ?? '').trim();
  const keys = collectCoreItemOrderKeys(coreRow, foodRow);
  const rawItemsByOrderTextId = await loadCoreDbItemsByOrderTextIds(db, keys);
  const snapshotsByOrderText = orderText
    ? await loadSnapshotsByOrderTexts(db, [orderText], storeId)
    : new Map();
  const snaps = orderText ? snapshotsByOrderText.get(orderText) ?? [] : [];

  let items = resolvePartnerOrderItems(coreRow, foodRow, rawItemsByOrderTextId);
  items = mapItemsWithMerchantBase(items, snaps);

  const foodTotalRaw = foodRow?.food_items_total_value;
  const coreGrandRaw = coreRow.grand_total ?? coreRow.item_total;
  const pricingTotal =
    foodTotalRaw != null && foodTotalRaw !== ''
      ? Number(foodTotalRaw)
      : coreGrandRaw != null && coreGrandRaw !== ''
        ? Number(coreGrandRaw)
        : null;
  const customerPricing = parseMerchantBillingBreakdown(coreRow, pricingTotal);
  const billingSnap =
    coreRow.billing_snapshot && typeof coreRow.billing_snapshot === 'object'
      ? (coreRow.billing_snapshot as Record<string, unknown>)
      : null;
  const merchantDiscount = merchantFundedDiscountFromBilling(billingSnap);
  const bill = merchantBillPartsFromItems(items, {
    subtotal: 0,
    packaging: customerPricing.packaging,
    discount: merchantDiscount,
    total: 0,
  });

  return bill.total > 0 ? round2(bill.total) : null;
}

/** Freeze merchant CTM at accept — same amount shown on all later stages + wallet credit. */
export async function persistMerchantCtmAtAccept(
  db: SupabaseClient,
  input: { ordersCoreId: number; ordersFoodId: number; storeId: number }
): Promise<number | null> {
  const { data: core } = await db
    .from('orders_core')
    .select('total_ctm')
    .eq('id', input.ordersCoreId)
    .maybeSingle();
  const existingCtm = Number((core as { total_ctm?: unknown } | null)?.total_ctm);
  if (Number.isFinite(existingCtm) && existingCtm > 0) {
    await db
      .from('orders_food')
      .update({ food_items_total_value: existingCtm })
      .eq('id', input.ordersFoodId);
    return round2(existingCtm);
  }

  const ctm = await computeMerchantCtmForPartnerOrder(db, input.ordersCoreId, input.storeId);
  if (ctm == null || ctm <= 0) return null;

  const now = new Date().toISOString();
  await db
    .from('orders_food')
    .update({ food_items_total_value: ctm, updated_at: now })
    .eq('id', input.ordersFoodId);
  await db
    .from('orders_core')
    .update({ total_ctm: ctm, updated_at: now })
    .eq('id', input.ordersCoreId);

  return ctm;
}

/** Wallet credit uses frozen CTM from accept, never customer grand_total. */
export async function resolveMerchantWalletCreditAmount(
  db: SupabaseClient,
  input: { ordersCoreId: number; ordersFoodId: number; storeId: number }
): Promise<number> {
  const { data: core } = await db
    .from('orders_core')
    .select('total_ctm')
    .eq('id', input.ordersCoreId)
    .maybeSingle();
  const frozen = Number((core as { total_ctm?: unknown } | null)?.total_ctm);
  if (Number.isFinite(frozen) && frozen > 0) return round2(frozen);

  const { data: food } = await db
    .from('orders_food')
    .select('food_items_total_value, accepted_at')
    .eq('id', input.ordersFoodId)
    .maybeSingle();
  const foodRow = food as { food_items_total_value?: unknown; accepted_at?: string | null } | null;
  if (foodRow?.accepted_at) {
    const computed = await computeMerchantCtmForPartnerOrder(
      db,
      input.ordersCoreId,
      input.storeId
    );
    if (computed != null && computed > 0) return computed;
  }

  const fromFood = Number(foodRow?.food_items_total_value);
  if (Number.isFinite(fromFood) && fromFood > 0) return round2(fromFood);

  const computed = await computeMerchantCtmForPartnerOrder(
    db,
    input.ordersCoreId,
    input.storeId
  );
  if (computed != null && computed > 0) return computed;

  return 0;
}
