/**
 * Kitchen Order Ticket (KOT) for the Merchant App.
 * HTML template is owned by @gatimitra/kot-print (single source of truth).
 * Matches Partner Site: always prints KOT NUMBER + pickup QR when backend provides them.
 */

import {
  buildKotHtml as buildSharedKotHtml,
  deriveCrnFromOrderId,
  formatKotRestaurantAddress,
  getUtensilsCustomerLabel,
  normalizeThermalPrinterWidthMm,
  type KotLineItem,
  type KotPrintPayload,
  type ThermalPrinterWidthMm,
} from "@gatimitra/kot-print";
import type { ApiFoodOrder, ApiFoodOrderItem } from "@/services/ordersApi";
import { fetchFoodOrder } from "@/services/ordersApi";
import type { OrderRecord } from "@/lib/orderRecord";
import { mapApiOrder } from "@/lib/orderRecord";
import { parseMerchantInstructionsList } from "@/lib/merchant-order-instructions";
import { printHtml } from "@/lib/printHtml";
import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

export type KotPrintContext = {
  storeName?: string | null;
  restaurantAddress?: string | null;
  printerWidthMm?: ThermalPrinterWidthMm | number | null;
  /** Used to refresh pickup_token / kot_number before print when missing. */
  storeId?: number | null;
  authToken?: string | null;
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
  const packaging = getUtensilsCustomerLabel(order)?.trim() || null;
  const specialInstructions = parseMerchantInstructionsList(order.merchant_instructions_list);

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
      specialInstructions,
      packagingInstructions: packaging,
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
  const packaging = getUtensilsCustomerLabel(order)?.trim() || null;
  const specialInstructions = parseMerchantInstructionsList(order.merchantInstructionsList);

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
      specialInstructions,
      packagingInstructions: packaging,
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

function auditKotPrint(args: {
  storeId?: number | null;
  authToken?: string | null;
  orderCoreId: number;
  kotNumber?: string | null;
}): void {
  const storeId = Number(args.storeId);
  const token = args.authToken?.trim();
  const orderCoreId = Number(args.orderCoreId);
  if (!token || !Number.isFinite(storeId) || storeId < 1 || !Number.isFinite(orderCoreId) || orderCoreId < 1) {
    return;
  }
  const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
  void authFetch(`${base}/v1/merchant-partner/stores/${storeId}/food-orders/kot-print`, token, {
    method: "POST",
    body: JSON.stringify({
      order_id: orderCoreId,
      kot_number: args.kotNumber ?? null,
      printed_by: "merchant_app",
      print_channel: "expo_print",
    }),
  }).catch(() => {
    /* best-effort audit */
  });
}

/** Refresh order from API when KOT number or pickup QR token is missing. */
export async function ensureOrderKotPrintFields(
  order: OrderRecord,
  ctx?: KotPrintContext | null
): Promise<OrderRecord> {
  if (order.kotNumber?.trim() && order.pickupToken?.trim()) return order;
  const storeId = Number(ctx?.storeId);
  const token = ctx?.authToken?.trim();
  const foodId = Number.parseInt(String(order.id), 10);
  if (!token || !Number.isFinite(storeId) || storeId < 1 || !Number.isFinite(foodId) || foodId < 1) {
    return order;
  }
  if (String(order.id).startsWith("core-")) return order;
  try {
    const fresh = await fetchFoodOrder(storeId, foodId, token);
    return mapApiOrder(fresh);
  } catch {
    return order;
  }
}

export async function ensureApiOrderKotPrintFields(
  order: ApiFoodOrder,
  ctx?: KotPrintContext | null
): Promise<ApiFoodOrder> {
  if (order.kot_number?.trim() && order.pickup_token?.trim()) return order;
  const storeId = Number(ctx?.storeId);
  const token = ctx?.authToken?.trim();
  const foodId = Number(order.orders_food_id);
  if (!token || !Number.isFinite(storeId) || storeId < 1 || !Number.isFinite(foodId) || foodId < 1) {
    return order;
  }
  try {
    return await fetchFoodOrder(storeId, foodId, token);
  } catch {
    return order;
  }
}

/** Open the system print dialog with the production KOT. */
export async function printKot(
  order: ApiFoodOrder,
  ctx?: KotPrintContext | null
): Promise<void> {
  if (!order) return;
  const ready = await ensureApiOrderKotPrintFields(order, ctx);
  const payload = apiOrderToKotPayload(ready, ctx);
  auditKotPrint({
    storeId: ctx?.storeId,
    authToken: ctx?.authToken,
    orderCoreId: ready.orders_core_id,
    kotNumber: payload.kotNumber,
  });
  await printHtml(buildSharedKotHtml(payload));
}

export async function printKotFromRecord(
  order: OrderRecord,
  ctx?: KotPrintContext | null
): Promise<void> {
  if (!order) return;
  const ready = await ensureOrderKotPrintFields(order, ctx);
  const payload = orderRecordToKotPayload(ready, ctx);
  auditKotPrint({
    storeId: ctx?.storeId,
    authToken: ctx?.authToken,
    orderCoreId: ready.ordersCoreId,
    kotNumber: payload.kotNumber,
  });
  await printHtml(buildSharedKotHtml(payload));
}
