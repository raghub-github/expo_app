'use client';

/**
 * Order bill print — Partner Site entry.
 * HTML template is owned by @gatimitra/bill-print (single source of truth).
 * No customer preview modal — print goes straight to the system dialog (partnersite parity).
 */

import React, { useEffect } from 'react';
import {
  buildBillHtml,
  type BillLineItem,
  type BillPrintPayload,
  type BillStoreInfo,
} from '@gatimitra/bill-print';
import { printHtmlDocument } from '@gatimitra/print-utils';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { OrderPricingBreakdown } from '@/lib/orderLineItems';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { formatOrderDropAddress } from '@/lib/formatOrderAddress';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';

export type GatiMitraPrintStoreInfo = BillStoreInfo;

function mapBillItem(item: NormalizedOrderLineItem): BillLineItem {
  const special =
    (item as { specialInstructions?: string | null }).specialInstructions ??
    (item as { special_instructions?: string | null }).special_instructions ??
    null;
  return {
    name: item.name,
    quantity: item.quantity || 1,
    price: item.price,
    total: item.total,
    variantName: item.variantName ?? null,
    variantTag: item.variantTag ?? null,
    specialInstructions: special,
    customizationLines: (item.customizationLines ?? []).map((l) => ({
      kind: l.kind,
      name: l.name,
      amount: l.amount ?? null,
      quantity: null,
    })),
    customizations: item.customizations,
    customizationsTotal: item.customizationsTotal ?? null,
    baseAmount: item.baseAmount ?? null,
    capturedBaseAmount: item.capturedBaseAmount ?? null,
    capturedAddonAmount: item.capturedAddonAmount ?? null,
    hasCustomizations: item.hasCustomizations ?? null,
    catalogLineTotal: item.catalogLineTotal ?? null,
    netLineTotal: item.netLineTotal ?? null,
    offerDiscount: item.offerDiscount ?? null,
    offerLabel: item.offerLabel ?? null,
    isItemPromo: item.isItemPromo ?? null,
    appliedOfferType: item.appliedOfferType ?? null,
    ctmFromSnapshot: item.ctmFromSnapshot ?? null,
  };
}

export function orderToBillPayload(
  order: OrdersFoodRow,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo
): BillPrintPayload {
  const items = (order.items ?? []) as NormalizedOrderLineItem[];
  return {
    formattedOrderId: order.formatted_order_id?.trim() || String(order.order_id),
    orderCreatedAt: order.created_at,
    taxInvoiceNumber: order.tax_invoice_number ?? null,
    customerName: order.customer_name?.trim() || null,
    dropAddress: formatOrderDropAddress(order.drop_address_normalized, order.drop_address_raw) || null,
    pickupOtp: isPartnerSelfPickupOrder(order) ? null : order.pickup_otp?.trim() || null,
    items: items.map(mapBillItem),
    pricing: {
      subtotal: pricing.subtotal,
      packaging: pricing.packaging,
      discount: pricing.discount,
      total: pricing.total,
    },
    store,
    printTimestamp: new Date().toISOString(),
  };
}

export function buildPrintHtml(
  order: OrdersFoodRow,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo
): string {
  return buildBillHtml(orderToBillPayload(order, pricing, store));
}

export function printOrderBill(
  order: OrdersFoodRow | null | undefined,
  pricing: OrderPricingBreakdown,
  store: GatiMitraPrintStoreInfo | null | undefined
): void {
  if (typeof document === 'undefined' || !order || !store) return;
  printHtmlDocument(buildPrintHtml(order, pricing, store));
}

export type GatiMitraOrderPrintBillProps = {
  open: boolean;
  onClose: () => void;
  order: OrdersFoodRow | null;
  pricing: OrderPricingBreakdown;
  store: GatiMitraPrintStoreInfo | null;
};

/** @deprecated Preview modal removed — opens system print dialog immediately. */
export function GatiMitraOrderPrintBill({
  open,
  onClose,
  order,
  pricing,
  store,
}: GatiMitraOrderPrintBillProps) {
  useEffect(() => {
    if (!open || !order || !store) return;
    printOrderBill(order, pricing, store);
    onClose();
  }, [open, order, pricing, store, onClose]);

  return null;
}
