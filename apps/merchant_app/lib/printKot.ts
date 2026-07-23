/**
 * Kitchen Order Ticket (KOT) for the Merchant App.
 * HTML template is owned by @gatimitra/kot-print (single source of truth).
 */

import {
  buildKotHtml as buildSharedKotHtml,
  deriveCrnFromOrderId,
  formatKotRestaurantAddress,
  normalizeThermalPrinterWidthMm,
  type KotLineItem,
  type KotPrintPayload,
  type ThermalPrinterWidthMm,
} from "@gatimitra/kot-print";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import type { OrderRecord } from "@/lib/orderRecord";
import { printHtml } from "@/lib/printHtml";

export type KotPrintContext = {
  storeName?: string | null;
  restaurantAddress?: string | null;
  printerWidthMm?: ThermalPrinterWidthMm | number | null;
};

function kotOrderId(order: ApiFoodOrder): string {
  return (order.formatted_order_id?.trim() || String(order.orders_core_id) || "").replace(/^#/, "");
}

function mapApiItems(items: ApiFoodOrderItem[]): KotLineItem[] {
  return (items ?? []).map((item) => ({
    name: item.name,
    quantity: item.qty || 1,
    variantName: item.variant_tag ?? null,
    variantTag: item.variant_tag ?? null,
    specialInstructions: item.specialInstructions ?? item.special_instructions ?? null,
    customizationLines: (item.customization_lines ?? []).map((l) => ({
      kind: l.kind,
      name: l.name,
      quantity: null,
    })),
  }));
}

function packagingLabel(order: {
  requires_utensils?: boolean | null;
  requiresUtensils?: boolean | null;
}): string | null {
  const flag = order.requires_utensils ?? order.requiresUtensils;
  if (flag === true) return "Send cutlery & utensils";
  if (flag === false) return "Don't send cutlery";
  return null;
}

function instructionsFromList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

function withPrintContext(
  payload: KotPrintPayload,
  ctx?: KotPrintContext | null
): KotPrintPayload {
  return {
    ...payload,
    restaurantName: ctx?.storeName?.trim() || payload.restaurantName,
    restaurantAddress: ctx?.restaurantAddress?.trim() || payload.restaurantAddress || null,
    printerWidthMm: normalizeThermalPrinterWidthMm(
      ctx?.printerWidthMm ?? payload.printerWidthMm ?? 80
    ),
  };
}

export function apiOrderToKotPayload(
  order: ApiFoodOrder,
  ctx?: KotPrintContext | null
): KotPrintPayload {
  const orderId = kotOrderId(order);
  return withPrintContext(
    {
      kotNumber: order.kot_number?.trim() || null,
      orderId,
      crn: deriveCrnFromOrderId(orderId),
      internalReferenceId: order.orders_core_id,
      restaurantName: ctx?.storeName?.trim() || null,
      restaurantPhone: null,
      customerName: order.customer_name?.trim() || null,
      customerPhone: order.customer_phone?.trim() || null,
      orderCreatedAt: order.created_at ?? null,
      printTimestamp: new Date().toISOString(),
      orderType: order.delivery_type ?? "food",
      paymentMode: order.payment_method ?? null,
      pickupToken: order.pickup_token?.trim() || null,
      pickupOtp: order.pickup_otp?.trim() || null,
      items: mapApiItems(order.items ?? []),
      specialInstructions: instructionsFromList(order.merchant_instructions_list),
      packagingInstructions: packagingLabel(order),
    },
    ctx
  );
}

function mapRecordItems(order: OrderRecord): KotLineItem[] {
  return (order.lineItems ?? []).map((item) => ({
    name: item.name,
    quantity: item.qty || 1,
    variantName: item.variant_tag ?? null,
    variantTag: item.variant_tag ?? null,
    specialInstructions: item.specialInstructions ?? item.special_instructions ?? null,
    customizationLines: (item.customization_lines ?? []).map((l) => ({
      kind: l.kind,
      name: l.name,
      quantity: null,
    })),
  }));
}

export function orderRecordToKotPayload(
  order: OrderRecord,
  ctx?: KotPrintContext | null
): KotPrintPayload {
  const orderId = (order.formattedOrderId?.trim() || String(order.ordersCoreId) || "").replace(
    /^#/,
    ""
  );
  return withPrintContext(
    {
      kotNumber: order.kotNumber?.trim() || null,
      orderId,
      crn: deriveCrnFromOrderId(orderId),
      internalReferenceId: order.ordersCoreId,
      restaurantName: ctx?.storeName?.trim() || null,
      restaurantPhone: null,
      customerName: order.customerName?.trim() || null,
      customerPhone: order.customerPhone?.trim() || null,
      orderCreatedAt: order.createdAt ?? null,
      printTimestamp: new Date().toISOString(),
      orderType: order.deliveryType ?? "food",
      paymentMode: order.paymentMethod ?? null,
      pickupToken: order.pickupToken?.trim() || null,
      pickupOtp: order.pickupOtp?.trim() || null,
      items: mapRecordItems(order),
      specialInstructions: instructionsFromList(order.merchantInstructionsList),
      packagingInstructions: packagingLabel({ requiresUtensils: order.requiresUtensils }),
    },
    ctx
  );
}

export function buildKotHtml(
  order: ApiFoodOrder,
  ctx?: KotPrintContext | null
): string {
  return buildSharedKotHtml(apiOrderToKotPayload(order, ctx));
}

export { formatKotRestaurantAddress };

/** Open the system print dialog with the production KOT. */
export async function printKot(
  order: ApiFoodOrder,
  ctx?: KotPrintContext | null
): Promise<void> {
  if (!order) return;
  await printHtml(buildKotHtml(order, ctx));
}

export async function printKotFromRecord(
  order: OrderRecord,
  ctx?: KotPrintContext | null
): Promise<void> {
  if (!order) return;
  await printHtml(buildSharedKotHtml(orderRecordToKotPayload(order, ctx)));
}
