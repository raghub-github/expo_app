/**
 * After orders_core INSERT, enrich orders_food + OTP rows with full checkout payload.
 * Used from finalizeOrder / webhook / legacy POST so DB rows are never sparse.
 */

import { eq, inArray, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { customers, ordersCore, ordersFood } from "../db/schema.js";
import type { NormalizedOrderItem } from "../modules/orders/orderNormalizer.js";
import {
  buildFoodOrderItemsPayload,
  deliveryInstructionsFromCheckout,
  requiresUtensilsFromCheckout,
  sumFoodItemQuantities,
} from "./food-order-payload.js";
import { aggregateVegWithStoreFallback, resolveItemsWithFoodTypes } from "./food-order-veg.js";
import { generateOrderOtps } from "./food-order-otps.js";
import { getStoreDetailsForFoodOrder } from "../modules/merchants/merchant.service.js";

export type FoodOrderEnrichmentInput = {
  ordersCorePk: number;
  orderIdText: string;
  customerId: number;
  merchantStoreId: number;
  merchantParentId: number | null;
  items: NormalizedOrderItem[];
  grandTotal: string;
  checkoutMetadata?: Record<string, unknown> | null;
  formattedOrderId?: string | null;
};

export async function enrichFoodOrderAfterPlacement(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  input: FoodOrderEnrichmentInput
): Promise<void> {
  const {
    ordersCorePk,
    orderIdText,
    customerId,
    merchantStoreId,
    merchantParentId,
    items,
    grandTotal,
    checkoutMetadata,
  } = input;

  const [customerRow] = await tx
    .select({
      fullName: customers.fullName,
      primaryMobile: customers.primaryMobile,
      email: customers.email,
    })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  const store = await getStoreDetailsForFoodOrder(merchantStoreId);
  const itemsWithVeg = await resolveItemsWithFoodTypes(tx, merchantStoreId, items, store?.isPureVeg);
  const itemsPayload = buildFoodOrderItemsPayload(itemsWithVeg);
  const vegAgg = aggregateVegWithStoreFallback(itemsPayload, store?.isPureVeg);
  const foodItemsCount = sumFoodItemQuantities(items);
  const deliveryInstructions = deliveryInstructionsFromCheckout(checkoutMetadata ?? null);
  const requiresUtensils = requiresUtensilsFromCheckout(checkoutMetadata ?? null);
  const [otpExisting] = await tx
    .select({
      pickupOtp: ordersCore.pickupOtp,
      deliveryOtp: ordersCore.deliveryOtp,
      rtoOtp: ordersCore.rtoOtp,
    })
    .from(ordersCore)
    .where(eq(ordersCore.id, ordersCorePk))
    .limit(1);

  const otps =
    otpExisting?.pickupOtp && otpExisting?.deliveryOtp && otpExisting?.rtoOtp
      ? {
          pickupOtp: otpExisting.pickupOtp,
          deliveryOtp: otpExisting.deliveryOtp,
          rtoOtp: otpExisting.rtoOtp,
        }
      : generateOrderOtps();

  let formattedOrderId = input.formattedOrderId ?? null;
  if (!formattedOrderId) {
    const [coreFmt] = await tx
      .select({ formattedOrderId: ordersCore.formattedOrderId })
      .from(ordersCore)
      .where(eq(ordersCore.id, ordersCorePk))
      .limit(1);
    formattedOrderId = coreFmt?.formattedOrderId ?? null;
  }

  await tx
    .update(ordersCore)
    .set({
      items: itemsPayload as unknown as Record<string, unknown>,
      pickupOtp: otps.pickupOtp,
      deliveryOtp: otps.deliveryOtp,
      rtoOtp: otps.rtoOtp,
      updatedAt: new Date(),
    })
    .where(eq(ordersCore.id, ordersCorePk));

  const restaurantPhone =
    store?.storePhones?.[0] != null ? String(store.storePhones[0]).trim() : null;

  await tx
    .update(ordersFood)
    .set({
      orderId: ordersCorePk,
      coreOrderId: orderIdText,
      merchantStoreId,
      merchantParentId: merchantParentId ?? undefined,
      restaurantName: store?.storeDisplayName ?? store?.storeName ?? undefined,
      restaurantPhone: restaurantPhone ?? undefined,
      preparationTimeMinutes: store?.avgPreparationTimeMinutes ?? undefined,
      foodItemsCount,
      foodItemsTotalValue: grandTotal,
      items: itemsPayload as unknown as Record<string, unknown>,
      requiresUtensils,
      vegNonVeg: vegAgg ?? undefined,
      deliveryInstructions: deliveryInstructions ?? undefined,
      customerId,
      customerName: customerRow?.fullName ?? undefined,
      customerPhone: customerRow?.primaryMobile ?? undefined,
      customerEmail: customerRow?.email ?? undefined,
      formattedOrderId: formattedOrderId ?? undefined,
      pickupOtp: otps.pickupOtp,
      deliveryOtp: otps.deliveryOtp,
      rtoOtp: otps.rtoOtp,
      updatedAt: new Date(),
    })
    .where(eq(ordersFood.coreOrderId, orderIdText));

  if (!otpExisting?.pickupOtp) {
    try {
      await tx.execute(sql`
        INSERT INTO order_food_otps (order_id, otp_code, otp_type)
        VALUES
          (${ordersCorePk}, ${otps.pickupOtp}, 'PICKUP'),
          (${ordersCorePk}, ${otps.deliveryOtp}, 'DELIVERY'),
          (${ordersCorePk}, ${otps.rtoOtp}, 'RTO')
        ON CONFLICT (order_id, otp_type) DO UPDATE SET
          otp_code = EXCLUDED.otp_code,
          attempt_count = 0,
          locked_until = NULL,
          verified_at = NULL,
          updated_at = now()
      `);
      for (const otpType of ["PICKUP", "DELIVERY", "RTO"] as const) {
        await tx.execute(sql`
          INSERT INTO order_food_otp_audit (order_id, action, otp_type)
          VALUES (${ordersCorePk}, 'GENERATE', ${otpType})
        `);
      }
    } catch {
      /* order_food_otps row shape may predate 0225; columns on orders_core/orders_food still hold OTPs */
    }
  }
}

export type OrdersFoodListSummary = {
  orderId: number | null;
  coreOrderId: string | null;
  restaurantName: string | null;
  foodItemsTotalValue: string | null;
  vegNonVeg: string | null;
  orderStatus: string | null;
  rejectedReason: string | null;
  cancelledByLabel: string | null;
};

/** Batch-load orders_food rows for customer order list (food orders only). */
export async function loadOrdersFoodSummariesByCoreRows(
  db: PostgresJsDatabase<Record<string, unknown>>,
  rows: Array<{ id: number; orderId: string | null; orderType: string | null }>
): Promise<Map<number, OrdersFoodListSummary>> {
  const foodCoreRows = rows.filter((r) => r.orderType === "food");
  const out = new Map<number, OrdersFoodListSummary>();
  if (foodCoreRows.length === 0) return out;

  const corePks = foodCoreRows.map((r) => r.id);
  const orderIdTexts = [
    ...new Set(
      foodCoreRows
        .map((r) => r.orderId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const matchClause =
    orderIdTexts.length > 0
      ? or(
          inArray(ordersFood.orderId, corePks),
          sql`${ordersFood.coreOrderId}::text IN (${sql.join(
            orderIdTexts.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
      : inArray(ordersFood.orderId, corePks);

  const foodRows = await db
    .select({
      orderId: ordersFood.orderId,
      coreOrderId: ordersFood.coreOrderId,
      restaurantName: ordersFood.restaurantName,
      foodItemsTotalValue: ordersFood.foodItemsTotalValue,
      vegNonVeg: sql<string | null>`${ordersFood.vegNonVeg}::text`.as("veg_non_veg"),
      orderStatus: ordersFood.orderStatus,
      rejectedReason: ordersFood.rejectedReason,
      cancelledByLabel: ordersFood.cancelledByLabel,
    })
    .from(ordersFood)
    .where(matchClause);

  for (const core of foodCoreRows) {
    const textId = core.orderId?.trim() ?? null;
    const hit = foodRows.find(
      (f) =>
        f.orderId === core.id ||
        (textId != null && String(f.coreOrderId ?? "").trim() === textId)
    );
    if (hit) out.set(core.id, hit);
  }

  return out;
}

export function ordersFoodMatchForCoreRow(
  corePk: number,
  coreOrderIdText: string | null
) {
  const textId = coreOrderIdText?.trim() ?? null;
  return or(
    eq(ordersFood.orderId, corePk),
    textId != null ? sql`${ordersFood.coreOrderId}::text = ${textId}` : sql`false`
  );
}
