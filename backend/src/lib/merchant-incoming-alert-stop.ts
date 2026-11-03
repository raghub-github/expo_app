/**
 * Authoritative cross-device stop for merchant incoming-order buzzers.
 *
 * Device-local mute / app-open silence must NEVER live here.
 * This path runs only after a backend-confirmed terminal transition
 * (accept / reject / cancel / timeout) and wakes every registered Partner
 * device with a silent FCM stop + WS incoming.resolved fan-out.
 */
import type { Sql } from "postgres";
import { broadcastMerchantIncomingResolved } from "./merchant-incoming-resolved-broadcast.js";
import { notifyMerchantOrderAlertStop } from "./merchant-push-notify.js";

export type MerchantIncomingAlertStopArgs = {
  storeId: number;
  foodOrderId: number;
  coreId?: number | null;
  status: string;
  /** Opaque stop generation — clients ignore older STARTs after this. */
  stopAtMs?: number;
};

/**
 * Idempotent: safe to call from the Partner App route, eventBus, and
 * partnersite/dashboard internal notify handlers for the same order.
 */
export async function stopMerchantIncomingAlertEverywhere(
  sql: Sql,
  args: MerchantIncomingAlertStopArgs
): Promise<void> {
  const storeId = Number(args.storeId);
  const foodOrderId = Number(args.foodOrderId);
  if (!Number.isInteger(storeId) || storeId < 1) return;
  if (!Number.isInteger(foodOrderId) || foodOrderId < 1) return;
  const status = String(args.status ?? "").trim().toUpperCase() || "TERMINAL";
  const stopAtMs = args.stopAtMs ?? Date.now();
  let formattedOrderId: string | null = null;
  try {
    const rows = await sql`
      SELECT COALESCE(
        NULLIF(TRIM(oc.formatted_order_id), ''),
        NULLIF(TRIM(oc.order_id), '')
      ) AS formatted_order_id
      FROM orders_food f
      JOIN orders_core oc ON oc.id = f.order_id
      WHERE f.id = ${foodOrderId}
      LIMIT 1
    `;
    const raw = (rows[0] as { formatted_order_id?: string | null } | undefined)?.formatted_order_id;
    formattedOrderId = raw != null && String(raw).trim() ? String(raw).trim() : null;
  } catch {
    /* optional identity enrichment */
  }

  await Promise.allSettled([
    notifyMerchantOrderAlertStop(sql, {
      storeId,
      foodOrderId,
      formattedOrderId,
      stopAtMs,
      status,
    }),
    broadcastMerchantIncomingResolved({
      storeId,
      coreId: args.coreId != null && Number.isFinite(Number(args.coreId)) ? Number(args.coreId) : null,
      foodId: foodOrderId,
      status,
    }),
  ]);
}

/** Resolve food row from orders_core pk, then stop every Partner device alert. */
export async function stopMerchantIncomingAlertForCoreOrder(
  sql: Sql,
  args: {
    ordersCoreId: number;
    status: string;
    merchantStoreId?: number | null;
  }
): Promise<void> {
  const coreId = Number(args.ordersCoreId);
  if (!Number.isInteger(coreId) || coreId < 1) return;
  const storeHint =
    args.merchantStoreId != null && Number.isFinite(Number(args.merchantStoreId))
      ? Number(args.merchantStoreId)
      : null;

  const rows =
    storeHint != null && storeHint > 0
      ? await sql`
          SELECT f.id::int AS food_id, f.merchant_store_id::int AS store_id
          FROM orders_food f
          WHERE f.order_id = ${coreId}
            AND f.merchant_store_id = ${storeHint}
          ORDER BY f.id DESC
          LIMIT 1
        `
      : await sql`
          SELECT f.id::int AS food_id, f.merchant_store_id::int AS store_id
          FROM orders_food f
          WHERE f.order_id = ${coreId}
          ORDER BY f.id DESC
          LIMIT 1
        `;

  const row = rows[0] as { food_id?: number; store_id?: number } | undefined;
  const foodId = Number(row?.food_id);
  const storeId = Number(row?.store_id);
  if (!Number.isInteger(foodId) || foodId < 1) return;
  if (!Number.isInteger(storeId) || storeId < 1) return;

  await stopMerchantIncomingAlertEverywhere(sql, {
    storeId,
    foodOrderId: foodId,
    coreId,
    status: args.status,
  });
}
