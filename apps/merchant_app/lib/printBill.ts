/**
 * Order bill printing for the Merchant App.
 * HTML template is owned by @gatimitra/bill-print (single source of truth).
 */

import {
  buildBillHtml,
  type BillLineItem,
  type BillPrintPayload,
  type BillStoreInfo,
} from "@gatimitra/bill-print";
import type { OrderRecord, LineItem } from "@/lib/orderRecord";
import { merchantBillPartsFromOrder } from "@/lib/resolveMerchantOrderTotal";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import { printHtml } from "@/lib/printHtml";
import type { KotPrintContext } from "@/lib/printKot";
import { buildBillStoreInfo, type MerchantPrintStoreContext } from "@/lib/printContext";

function mapLineItem(item: LineItem): BillLineItem {
  return {
    name: item.name,
    quantity: item.qty || 1,
    price: item.price,
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
    ctmFromSnapshot: true,
  };
}

export function orderRecordToBillPayload(
  order: OrderRecord,
  store: BillStoreInfo
): BillPrintPayload {
  const bill = merchantBillPartsFromOrder(order);
  const formattedOrderId =
    formatOrderIdDisplay(order.formattedOrderId, order.ordersCoreId) ||
    String(order.ordersCoreId);

  return {
    formattedOrderId,
    orderCreatedAt: order.createdAt,
    customerName: order.customerName?.trim() || null,
    dropAddress: order.dropAddress?.trim() || null,
    pickupOtp: order.pickupOtp?.trim() || null,
    items: (order.lineItems ?? []).map(mapLineItem),
    pricing: {
      subtotal: bill.itemsSubtotal,
      packaging: bill.packaging,
      discount: bill.discount,
      total: bill.total,
    },
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
