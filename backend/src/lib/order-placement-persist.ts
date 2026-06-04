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
  contactlessFromCheckout,
  enrichBillingSnapshotForPersistence,
  etaSecondsFromBillingSnapshot,
  isScheduledOrderFromCheckout,
  requiresUtensilsFromCheckout,
  sumFoodItemQuantities,
} from "./food-order-payload.js";
import { generateOrderOtps } from "./food-order-otps.js";
import { recordPlacementTimelines } from "./order-placement-timeline.js";

function sanitizeStringForDb(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = String(s).replace(/\u2014/g, "").replace(/\s*—\s*/g, "").trim();
  return t === "" ? null : t;
}

function firstSqlRow(result: unknown): Record<string, unknown> | null {
  if (Array.isArray(result)) {
    const row = result[0];
    return row && typeof row === "object" ? (row as Record<string, unknown>) : null;
  }
  const rows = (result as { rows?: unknown[] })?.rows;
  if (Array.isArray(rows) && rows[0] && typeof rows[0] === "object") {
    return rows[0] as Record<string, unknown>;
  }
  return null;
}

/** Store default KPT for billing_snapshot / default_system_kpt_minutes on placement. */
async function fetchStoreAvgPrepMinutes(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  merchantStoreId: number
): Promise<number | null> {
  if (!Number.isFinite(merchantStoreId) || merchantStoreId <= 0) return null;
  try {
    const result = await tx.execute(sql`
      SELECT avg_preparation_time_minutes AS pt
      FROM merchant_stores
      WHERE id = ${merchantStoreId}
      LIMIT 1
    `);
    const row = firstSqlRow(result);
    const n = Number(row?.pt);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  } catch {
    /* non-fatal — placement continues without store KPT */
  }
  return null;
}

/**
 * Run optional SQL without aborting the paid-order transaction.
 * postgres.js marks the txn failed on any error until ROLLBACK TO SAVEPOINT.
 */
async function runInSavepoint(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  savepoint: string,
  fn: () => Promise<void>
): Promise<void> {
  const sp = savepoint.replace(/[^a-zA-Z0-9_]/g, "_");
  try {
    await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
    await fn();
    await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
  } catch (e) {
    try {
      await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
    } catch (rollbackErr) {
      console.warn(
        `[order-placement] ${savepoint} rollback failed:`,
        (rollbackErr as Error).message
      );
      throw e;
    }
    console.warn(`[order-placement] ${savepoint} skipped:`, (e as Error).message);
  }
}

/** OTPs on orders_core / orders_food (DB function when present, else JS). */
async function persistOrderOtps(
  tx: PostgresJsDatabase<Record<string, unknown>>,
  orderCorePk: number,
  orderIdText: string
): Promise<void> {
  if (!Number.isFinite(orderCorePk) || orderCorePk <= 0) return;

  let usedDbFn = false;
  await runInSavepoint(tx, "placement_order_otps_fn", async () => {
    await tx.execute(sql`SELECT public.generate_unique_order_otps(${orderCorePk})`);
    usedDbFn = true;
  });

  if (usedDbFn) return;

  const otps = generateOrderOtps();
  await runInSavepoint(tx, "placement_order_otps_js", async () => {
    await tx.execute(sql`
      UPDATE orders_core
      SET
        pickup_otp = ${otps.pickupOtp},
        delivery_otp = ${otps.deliveryOtp},
        rto_otp = ${otps.rtoOtp},
        updated_at = now()
      WHERE id = ${orderCorePk}
    `);
    await tx.execute(sql`
      UPDATE orders_food
      SET
        pickup_otp = ${otps.pickupOtp},
        delivery_otp = ${otps.deliveryOtp},
        rto_otp = ${otps.rtoOtp},
        updated_at = now()
      WHERE order_id = ${orderCorePk}
         OR core_order_id = ${orderIdText}
    `);
  });
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
  const deliveryType = pending.deliveryType ?? "delivery";
  const distanceKm = Number(pending.distanceKm ?? 0);
  const storeKpt = await fetchStoreAvgPrepMinutes(tx, pending.merchantStoreId);
  const durationMinRaw = etaSecondsFromBillingSnapshot(
    pending.billingSnapshot as Record<string, unknown> | null
  );
  const durationMin =
    durationMinRaw != null && durationMinRaw > 0
      ? Math.round(durationMinRaw / 60)
      : null;
  const billingRaw =
    pending.billingSnapshot != null && typeof pending.billingSnapshot === "object"
      ? (pending.billingSnapshot as Record<string, unknown>)
      : null;
  const billing = enrichBillingSnapshotForPersistence(billingRaw, {
    deliveryType,
    distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
    durationMin,
    serviceable:
      billingRaw?.serviceable === false
        ? false
        : billingRaw?.serviceable === true
          ? true
          : true,
    storeKptMinutes: storeKpt,
  });

  const contactless = contactlessFromCheckout(checkoutMeta);
  const checkoutEnriched = {
    ...(checkoutMeta ?? {}),
    leaveAtDoor: contactless === true ? true : checkoutMeta?.leaveAtDoor,
    contactless: contactless ?? checkoutMeta?.contactless,
    deliveryType,
    deliveryInitiator: "customer",
  };

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
      deliveryType,
      billingSnapshot: billing,
      billingRulesetVersion: pending.billingRulesetVersion ?? undefined,
      checkoutMetadata: checkoutEnriched,
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

  await runInSavepoint(tx, "placement_instruction_fields", async () => {
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
  });

  await persistOrderOtps(tx, orderCorePk, orderIdText);

  return { orderCorePk };
}
