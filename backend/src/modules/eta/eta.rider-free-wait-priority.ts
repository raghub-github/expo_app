/**
 * When rider free-wait (3 min) expires at store, push PRIORITY to merchant.
 * Runs from live ETA ticks so it works with the app closed.
 */
import { getSql } from "../../db/client.js";
import { FOOD_RIDER_FREE_WAIT_SECONDS } from "../../lib/food-rider-free-wait.js";
import { notifyMerchantRiderFreeWaitExceeded } from "../../lib/merchant-push-notify.js";

const sentThisProcess = new Set<number>();

export async function processRiderFreeWaitPriority(args: {
  orderCoreId: number;
  orderIdText: string;
  merchantStoreId: number;
  riderId: number | null;
  riderReachedPickupAt: Date;
  pickedUpAt: Date | null;
  now: Date;
}): Promise<void> {
  if (args.pickedUpAt) return;
  if (!Number.isInteger(args.merchantStoreId) || args.merchantStoreId < 1) return;

  const waitSeconds = Math.max(
    0,
    Math.floor((args.now.getTime() - args.riderReachedPickupAt.getTime()) / 1000)
  );
  if (waitSeconds < FOOD_RIDER_FREE_WAIT_SECONDS) return;

  const sql = getSql();
  const foodRows = await sql<
    Array<{
      food_id: number;
      formatted_order_id: string | null;
      pickup_otp: string | null;
      rider_picked_up_at: Date | string | null;
    }>
  >`
    SELECT
      of.id AS food_id,
      COALESCE(of.formatted_order_id, oc.formatted_order_id) AS formatted_order_id,
      of.pickup_otp,
      of.rider_picked_up_at
    FROM orders_food of
    JOIN orders_core oc ON oc.id = of.order_id
    WHERE of.order_id = ${args.orderCoreId}
    LIMIT 1
  `;
  const food = foodRows[0];
  if (!food?.food_id) return;
  if (food.rider_picked_up_at) return;

  const foodId = Number(food.food_id);
  if (sentThisProcess.has(foodId)) return;

  // Inbox dedupe: same title within 6h — use stable PRIORITY title.
  const displayOrderId =
    (food.formatted_order_id && String(food.formatted_order_id).trim()) ||
    args.orderIdText;

  let riderName = "Rider";
  if (args.riderId != null && args.riderId > 0) {
    const r = await sql`SELECT name FROM riders WHERE id = ${args.riderId} LIMIT 1`;
    const n = String((r[0] as { name?: string } | undefined)?.name ?? "").trim();
    if (n) riderName = n;
  }

  try {
    await notifyMerchantRiderFreeWaitExceeded(sql, {
      storeId: args.merchantStoreId,
      displayOrderId,
      riderName,
      foodOrderId: foodId,
      waitSeconds,
      pickupOtp: food.pickup_otp,
    });
    sentThisProcess.add(foodId);
  } catch (e) {
    console.warn(
      "[eta] processRiderFreeWaitPriority failed",
      (e as Error).message
    );
  }
}
