'use client';

/**
 * Kitchen Order Ticket (KOT) — Partner Site print entry.
 * HTML template is owned by @gatimitra/kot-print (single source of truth).
 */

import {
  buildKotHtml as buildSharedKotHtml,
  deriveCrnFromOrderId,
  formatKotRestaurantAddress,
  normalizeThermalPrinterWidthMm,
  type KotLineItem,
  type KotPrintPayload,
  getUtensilsCustomerLabel,
  isKotSelfPickupOrderType,
  type ThermalPrinterWidthMm,
} from '@gatimitra/kot-print';
import { printHtmlDocument } from '@gatimitra/print-utils';
import type { OrdersFoodRow } from '@/hooks/useFoodOrders';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import { parseMerchantInstructionsList } from '@/lib/merchant-order-instructions';
import { isPartnerSelfPickupOrder } from '@/lib/partner-delivery-type';

export type GatiMitraKotStoreInfo = {
  storeName?: string | null;
  storePhone?: string | null;
  storeAddress?: string | null;
  thermalPrinterWidthMm?: ThermalPrinterWidthMm | number | null;
  address?: {
    full_address?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    postal_code?: string | null;
  } | null;
};

function formatKotOrderId(order: OrdersFoodRow): string {
  return (order.formatted_order_id?.trim() || String(order.order_id) || '').replace(/^#/, '');
}

function resolveStoreAddress(store?: GatiMitraKotStoreInfo | null): string | null {
  if (store?.storeAddress?.trim()) return store.storeAddress.trim();
  if (store?.address) {
    const formatted = formatKotRestaurantAddress({
      fullAddress: store.address.full_address,
      landmark: store.address.landmark,
      city: store.address.city,
      state: store.address.state,
      postalCode: store.address.postal_code,
    });
    return formatted || null;
  }
  return null;
}

function mapItems(order: OrdersFoodRow): KotLineItem[] {
  const items = (order.items ?? []) as NormalizedOrderLineItem[];
  return items.map((item) => {
    const special =
      (item as { specialInstructions?: string | null }).specialInstructions ??
      (item as { special_instructions?: string | null }).special_instructions ??
      null;
    return {
      name: item.name,
      quantity: item.quantity || 1,
      variantName: item.variantName ?? null,
      variantTag: item.variantTag ?? null,
      specialInstructions: special,
      customizationLines: (item.customizationLines ?? []).map((l) => ({
        kind: l.kind,
        name: l.name,
        quantity: null,
      })),
    };
  });
}

export function orderToKotPayload(
  order: OrdersFoodRow,
  store?: GatiMitraKotStoreInfo | null
): KotPrintPayload {
  const orderId = formatKotOrderId(order);
  const packaging = getUtensilsCustomerLabel(order)?.trim() || null;
  const specialInstructions = parseMerchantInstructionsList(order.merchant_instructions_list);
  const orderType = order.delivery_type ?? order.order_type ?? 'food';
  const selfPickup =
    isPartnerSelfPickupOrder(order) || isKotSelfPickupOrderType(orderType);

  return {
    kotNumber: order.kot_number?.trim() || null,
    orderId,
    crn: deriveCrnFromOrderId(orderId),
    internalReferenceId: order.core_order_id ?? order.order_id,
    restaurantName:
      store?.storeName?.trim() ||
      order.restaurant_name?.trim() ||
      null,
    restaurantPhone: null,
    restaurantAddress: resolveStoreAddress(store),
    customerName: order.customer_name?.trim() || null,
    customerPhone: order.customer_phone?.trim() || null,
    orderCreatedAt: order.created_at ?? null,
    printTimestamp: new Date().toISOString(),
    orderType,
    paymentMode: order.payment_method ?? null,
    pickupToken: selfPickup ? null : order.pickup_token?.trim() || null,
    pickupOtp: selfPickup ? null : order.pickup_otp?.trim() || null,
    items: mapItems(order),
    specialInstructions,
    packagingInstructions: packaging,
    printerWidthMm: normalizeThermalPrinterWidthMm(store?.thermalPrinterWidthMm ?? 80),
  };
}

export function buildKotHtml(order: OrdersFoodRow, store?: GatiMitraKotStoreInfo | null): string {
  return buildSharedKotHtml(orderToKotPayload(order, store));
}

function auditKotPrint(order: OrdersFoodRow): void {
  const orderId = Number(order.core_order_id ?? order.order_id);
  if (!Number.isFinite(orderId) || orderId < 1) return;
  void fetch('/api/food-orders/kot-print', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      order_id: orderId,
      store_id: order.merchant_store_id ?? null,
      kot_number: order.kot_number ?? null,
      printed_by: 'partner_site',
      print_channel: 'browser',
    }),
  }).catch(() => {
    /* best-effort audit */
  });
}

/**
 * Print a KOT via a hidden same-origin iframe (never popup-blocked).
 */
export function printOrderKot(
  order: OrdersFoodRow | null | undefined,
  store?: GatiMitraKotStoreInfo | null
): void {
  if (typeof document === 'undefined' || !order) return;
  const html = buildKotHtml(order, store);
  auditKotPrint(order);
  printHtmlDocument(html);
}
