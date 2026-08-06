import { getSql } from "../db/client.js";
import { creditMerchantOrderEarningOnDelivered } from "./credit-merchant-order-on-delivered.js";
import { recordRiderAssignmentDeliveredIfActive } from "./order-rider-assignment-history.js";

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function resolveMerchantGrossForWallet(
  ordersCoreId: number,
  ordersFoodId: number
): Promise<number> {
  const db = getSql();
  // Merchant CTM snapshot (net of merchant-funded offers) is the source of truth for
  // what the merchant is actually owed. order_settlement_breakdown.merchant_gross is
  // written from that snapshot at placement time (writeMerchantCtmPricingSnapshots).
  const ctmRows = await db`
    SELECT merchant_gross
    FROM order_settlement_breakdown
    WHERE order_id = ${ordersCoreId}
    LIMIT 1
  `;
  const ctmRow = ctmRows[0] as { merchant_gross?: unknown } | undefined;
  const fromCtm = num(ctmRow?.merchant_gross);
  if (fromCtm > 0) return round2(fromCtm);

  // Legacy fallback for orders placed before order_settlement_breakdown was populated
  // from the CTM snapshot — preserves backward compatibility for completed orders.
  const rows = await db`
    SELECT f.food_items_total_value
    FROM orders_core c
    INNER JOIN orders_food f ON f.order_id = c.id
    WHERE c.id = ${ordersCoreId}
      AND f.id = ${ordersFoodId}
    LIMIT 1
  `;
  const row = rows[0] as { food_items_total_value?: unknown } | undefined;
  if (!row) return 0;
  const fromFood = num(row.food_items_total_value);
  if (fromFood > 0) return round2(fromFood);
  return 0;
}

/**
 * Mark canonical food order delivered + credit merchant wallet.
 * Idempotent wallet credit via settle:order:{coreId}.
 */
export async function finalizeMerchantOrderDelivered(input: {
  orderIdText: string;
  previousStatus?: string | null;
}): Promise<{ ok: boolean; credited?: boolean; error?: string }> {
  const orderText = input.orderIdText.trim();
  if (!orderText) return { ok: false, error: "missing_order_id" };

  const db = getSql();
  const coreRows = await db`
    SELECT id, merchant_store_id, current_status, status, rider_id, order_id
    FROM orders_core
    WHERE order_id = ${orderText}
    LIMIT 1
  `;
  const core = coreRows[0] as {
    id: number;
    merchant_store_id: number | null;
    current_status: string | null;
    status: string | null;
    rider_id: number | null;
    order_id: string | null;
  } | undefined;
  if (!core?.id || !core.merchant_store_id) {
    return { ok: false, error: "order_not_found" };
  }

  const foodRows = await db`
    SELECT id, order_status
    FROM orders_food
    WHERE order_id = ${core.id}
    LIMIT 1
  `;
  const food = foodRows[0] as { id: number; order_status: string | null } | undefined;
  if (!food?.id) return { ok: false, error: "food_order_not_found" };

  const now = new Date();
  const prev =
    String(input.previousStatus ?? food.order_status ?? core.current_status ?? "").trim() ||
    "OUT_FOR_DELIVERY";

  if (String(food.order_status ?? "").toUpperCase() !== "DELIVERED") {
    await db`
      UPDATE orders_food
      SET
        order_status = 'DELIVERED',
        delivered_at = COALESCE(delivered_at, ${now.toISOString()}::timestamptz),
        updated_at = ${now.toISOString()}::timestamptz
      WHERE id = ${food.id}
    `;
  }

  if (String(core.status ?? "").toLowerCase() !== "delivered") {
    await db`
      UPDATE orders_core
      SET
        status = 'delivered',
        current_status = 'Delivered',
        actual_delivery_time = COALESCE(actual_delivery_time, ${now.toISOString()}::timestamptz),
        updated_at = ${now.toISOString()}::timestamptz
      WHERE id = ${core.id}
    `;
  }

  await recordRiderAssignmentDeliveredIfActive({
    orderCorePk: Number(core.id),
    orderIdText: orderText,
    riderId: core.rider_id,
    occurredAt: now,
    statusMessage: "Order delivered",
  });

  const gross = await resolveMerchantGrossForWallet(core.id, food.id);
  if (gross <= 0) {
    return { ok: true, credited: false, error: "zero_ctm" };
  }

  const credit = await creditMerchantOrderEarningOnDelivered({
    merchantStoreId: Number(core.merchant_store_id),
    ordersFoodId: Number(food.id),
    ordersCoreId: Number(core.id),
    amount: gross,
    newStatus: "DELIVERED",
    previousStatus: prev.toUpperCase() === "DELIVERED" ? "OUT_FOR_DELIVERY" : prev,
  });

  try {
    const { getDb } = await import("../db/client.js");
    const { consumePlatformOfferUsagesOnDelivery } = await import(
      "../modules/billing/platformOfferUsage.service.js"
    );
    await consumePlatformOfferUsagesOnDelivery(
      getDb(),
      String(core.order_id ?? core.id)
    );
  } catch {
    /* non-fatal */
  }

  return { ok: true, credited: credit.credited, error: credit.error };
}
