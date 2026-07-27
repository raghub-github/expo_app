/**
 * Order bill printing for the Merchant App.
 * HTML template is owned by @gatimitra/bill-print (single source of truth).
 */

import {
  buildBillHtml,
  type BillLineItem,
  type BillPricingBreakdown,
  type BillPrintPayload,
  type BillStoreInfo,
} from "@gatimitra/bill-print";
import type { OrderRecord, LineItem } from "@/lib/orderRecord";
import { resolveMerchantOrderTotal } from "@/lib/resolveMerchantOrderTotal";
import { printHtml } from "@/lib/printHtml";
import type { KotPrintContext } from "@/lib/printKot";
import { buildBillStoreInfo, type MerchantPrintStoreContext } from "@/lib/printContext";

function mapLineItem(item: LineItem): BillLineItem {
  const qty = item.qty || 1;
  const total =
    item.net_line_total != null && Number.isFinite(Number(item.net_line_total))
      ? Number(item.net_line_total)
      : Number(item.price) * qty;

  return {
    name: item.name,
    quantity: qty,
    price: item.price,
    total,
    variantName: item.variant_tag ?? null,
    variantTag: item.variant_tag ?? null,
    specialInstructions: item.specialInstructions ?? item.special_instructions ?? null,
    customizationLines: (item.customization_lines ?? []).map((l) => ({
      kind: l.kind,
      name: l.name,
      amount: l.amount ?? null,
      quantity: null,
    })),
    customizations: item.customizations,
    customizationsTotal: item.customizations_total ?? null,
    baseAmount: item.base_amount ?? null,
    capturedBaseAmount: item.captured_base_amount ?? null,
    capturedAddonAmount: item.captured_addon_amount ?? null,
    hasCustomizations: item.has_customizations ?? null,
    catalogLineTotal: item.catalog_line_total ?? null,
    netLineTotal: item.net_line_total ?? null,
    offerDiscount: item.offer_discount ?? null,
    offerLabel: item.offer_label ?? null,
    isItemPromo: item.is_item_promo ?? null,
    appliedOfferType: item.applied_offer_type ?? null,
    ctmFromSnapshot: item.ctm_from_snapshot ?? null,
  };
}

/** Partner Site parity: prefer API pricing SSOT, else line-sum + resolveMerchantOrderTotal. */
export function resolveOrderBillPricing(order: OrderRecord): BillPricingBreakdown {
  const lineSum = (order.lineItems ?? []).reduce(
    (acc, it) =>
      acc +
      Number(
        it.net_line_total ??
          (Number(it.price) || 0) * (it.qty || 1)
      ),
    0
  );

  if (order.pricing) {
    return {
      subtotal: Number(order.pricing.subtotal) || 0,
      packaging: Number(order.pricing.packaging) || 0,
      discount: Number(order.pricing.discount) || 0,
      total: Number(order.pricing.total) || 0,
    };
  }

  const total = resolveMerchantOrderTotal({
    pricing: order.pricing,
    total: order.total,
    total_ctm: order.totalCtm,
    lineItems: order.lineItems,
    billingSnapshot: order.billingSnapshot,
    merchantPrecisionDiscount: order.merchantPrecisionDiscount,
  });

  return {
    subtotal: lineSum,
    packaging: 0,
    discount: 0,
    total: Number.isFinite(total) ? total : lineSum,
  };
}

export function orderRecordToBillPayload(
  order: OrderRecord,
  store: BillStoreInfo
): BillPrintPayload {
  const formattedOrderId =
    order.formattedOrderId?.trim() || String(order.ordersCoreId);

  return {
    formattedOrderId,
    orderCreatedAt: order.createdAt,
    taxInvoiceNumber: order.taxInvoiceNumber ?? null,
    customerName: order.customerName?.trim() || null,
    dropAddress: order.dropAddress?.trim() || null,
    pickupOtp: order.pickupOtp?.trim() || null,
    items: (order.lineItems ?? []).map(mapLineItem),
    pricing: resolveOrderBillPricing(order),
    store,
    printTimestamp: new Date().toISOString(),
  };
}

export function buildBillHtmlFromRecord(
  order: OrderRecord,
  ctx?: MerchantPrintStoreContext | KotPrintContext | null
): string | null {
  const store =
    buildBillStoreInfo(ctx as MerchantPrintStoreContext) ??
    (ctx?.storeName?.trim()
      ? { storeName: ctx.storeName.trim(), fullAddress: ctx.restaurantAddress ?? null }
      : null);
  if (!store) return null;
  return buildBillHtml(orderRecordToBillPayload(order, store));
}

export async function printBillFromRecord(
  order: OrderRecord,
  ctx?: MerchantPrintStoreContext | KotPrintContext | null
): Promise<void> {
  const html = buildBillHtmlFromRecord(order, ctx);
  if (!html) return;
  await printHtml(html);
}
