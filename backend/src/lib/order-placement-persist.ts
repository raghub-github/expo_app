/**
 * Shared orders_core insert + placement timelines + orders_food sync on finalize.
 */

import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ordersCore } from "../db/schema.js";
import type { NormalizedOrderItem } from "../modules/orders/orderNormalizer.js";
import {
  aggregateVegNonVeg,
  buildDeliveryInstructionsArray,
  buildFoodOrderItemsPayload,
  buildMerchantInstructionsArray,
  etaSecondsFromBillingSnapshot,
  isScheduledOrderFromCheckout,
  requiresUtensilsFromCheckout,
  sumFoodItemQuantities,
} from "./food-order-payload.js";
import { recordPlacementTimelines } from "./order-placement-timeline.js";

function sanitizeStringForDb(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\u2014/g, "").replace(/\s*—\s*/g, "").trim();
  return t === "" ? null : t;
}

export type PendingRowForPlacement = {
  pendingId: string;
  customerId: number;
  merchantStoreId: number;
  merchantParentId: number | null;
  itemTotal: string;
  addonTotal: string | null;
  grandTotal: string;
  tipAmount: string | null;
  pickupAddressNormalized: string | null;
  deliveryAddress: string | null;
  pickupLat: string | null;
  pickupLon: string | null;
  dropLat: string | null;
  dropLon: string | null;
  distanceKm: string | null;
  deliveryType: string | null;
  billingSnapshot: unknown;
  billingRulesetVersion: number | null;
  checkoutMetadata: unknown;
  createdAt: Date;
  paymentStartedAt?: Date | null;
  currency?: string | null;
};

export type InsertPlacedOrderCoreInput = {
  pending: PendingRowForPlacement;
  orderIdText: string;
  items: NormalizedOrderItem[];
  paymentMethodEnum: "upi" | "card" | "wallet" | "online" | "cod" | "other";
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  finalizedAt?: Date;
};

export async function insertPlacedOrderCoreWithTimelines(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: InsertPlacedOrderCoreInput
): Promise<{ orderCorePk: number }> {
  const { pending, orderIdText, items } = input;
  const finalizedAt = input.finalizedAt ?? new Date();

  const checkoutMeta =
    pending.checkoutMetadata != null && typeof pending.checkoutMetadata === "object"
      ? (pending.checkoutMetadata as Record<string, unknown>)
      : null;
  const billing =
    pending.billingSnapshot != null && typeof pending.billingSnapshot === "object"
      ? (pending.billingSnapshot as Record<string, unknown>)
      : null;

  const pickupRaw = sanitizeStringForDb(pending.pickupAddressNormalized ?? undefined) ?? "";
  const dropRaw = sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? "";
  const dropLat = pending.dropLat != null ? String(pending.dropLat) : "0";
  const dropLon = pending.dropLon != null ? String(pending.dropLon) : "0";
  const pickupLat = pending.pickupLat != null ? String(pending.pickupLat) : "0";
  const pickupLon = pending.pickupLon != null ? String(pending.pickupLon) : "0";

  const foodPayload = buildFoodOrderItemsPayload(items);
  const deliveryInstructionsArr = buildDeliveryInstructionsArray(checkoutMeta);
  const merchantInstructionsArr = buildMerchantInstructionsArray(checkoutMeta);
  const isScheduled = isScheduledOrderFromCheckout(checkoutMeta);
  const vegAgg = aggregateVegNonVeg(foodPayload);
  const foodItemsCount = sumFoodItemQuantities(items);
  const etaSeconds = etaSecondsFromBillingSnapshot(billing);

  const [inserted] = await tx
    .insert(ordersCore)
    .values({
      orderId: orderIdText,
      orderType: "food",
      orderSource: "internal",
      customerId: pending.customerId,
      merchantStoreId: pending.merchantStoreId,
      merchantParentId: pending.merchantParentId ?? undefined,
      status: "assigned",
      currentStatus: "CREATED",
      itemTotal: pending.itemTotal,
      addonTotal: pending.addonTotal ?? "0",
      grandTotal: pending.grandTotal,
      tipAmount: pending.tipAmount ?? "0",
      placedAt: finalizedAt,
      pickupAddressRaw: pickupRaw || " ",
      pickupLat,
      pickupLon,
      dropAddressRaw: dropRaw || " ",
      dropLat,
      dropLon,
      deliveryAddress: sanitizeStringForDb(pending.deliveryAddress ?? undefined) ?? undefined,
      deliveryLatitude: dropLat,
      deliveryLongitude: dropLon,
      distanceKm: pending.distanceKm ?? undefined,
      etaSeconds: etaSeconds ?? undefined,
      paymentStatus: "completed",
      paymentMethod: input.paymentMethodEnum,
      deliveryType: pending.deliveryType ?? "delivery",
      billingSnapshot: billing ?? undefined,
      billingRulesetVersion: pending.billingRulesetVersion ?? undefined,
      checkoutMetadata: checkoutMeta ?? undefined,
      items: foodPayload as unknown as Record<string, unknown>[],
    })
    .returning({ id: ordersCore.id });

  const orderCorePk = inserted?.id;
  if (orderCorePk == null || !Number.isFinite(orderCorePk)) {
    throw new Error("orders_core insert did not return id");
  }

  await recordPlacementTimelines(tx, {
    orderCorePk,
    customerId: pending.customerId,
    pendingId: pending.pendingId,
    pendingCreatedAt: pending.createdAt,
    paymentStartedAt: pending.paymentStartedAt ?? null,
    finalizedAt,
    razorpayOrderId: input.razorpayOrderId ?? null,
    razorpayPaymentId: input.razorpayPaymentId ?? null,
    orderIdText,
  });

  const deliveryJson = JSON.stringify(deliveryInstructionsArr);
  const merchantJson = JSON.stringify(merchantInstructionsArr);
  const itemsJson = JSON.stringify(foodPayload);
  const vegLabel = vegAgg ?? null;

  await tx.execute(sql`
    UPDATE orders_core
    SET
      delivery_instructions_list = ${deliveryJson}::jsonb,
      merchant_instructions_list = ${merchantJson}::jsonb,
      is_scheduled_order = ${isScheduled},
      items = ${itemsJson}::jsonb,
      updated_at = now()
    WHERE id = ${orderCorePk}
  `);

  await tx.execute(sql`
    UPDATE orders_food
    SET
      food_items_count = ${foodItemsCount},
      veg_non_veg = ${vegLabel},
      delivery_instructions_list = ${deliveryJson}::jsonb,
      merchant_instructions_list = ${merchantJson}::jsonb,
      is_scheduled_order = ${isScheduled},
      requires_utensils = ${requiresUtensilsFromCheckout(checkoutMeta)},
      items = ${itemsJson}::jsonb,
      delivery_instructions = ${deliveryInstructionsArr.length > 0 ? deliveryInstructionsArr.join(" | ") : null},
      updated_at = now()
    WHERE order_id = ${orderCorePk}
       OR core_order_id = ${orderIdText}
  `);

  return { orderCorePk };
}
