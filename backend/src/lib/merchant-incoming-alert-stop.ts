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

/**
 * How long a request handler is willing to wait for the cross-device stop.
 *
 * Accept / reject used to fire this and return immediately, which let the
 * acting phone's HTTP success beat the FCM stop to the other phones. Awaiting
 * it closes that race, but it also moves an unbounded network call onto the
 * most latency-critical action in the Partner app: `sendFcmV1` has no timeout
 * of its own, so a stalled FCM connection would hang the accept itself.
 *
 * 2500ms is well past a healthy FCM round trip and well short of a merchant
 * deciding the button is broken.
 */
export const MERCHANT_ALERT_STOP_DEADLINE_MS = 2500;

/**
 * Wait for a stop fan-out, but never longer than the deadline.
 *
 * The underlying promise is NOT cancelled - it keeps running to completion in
 * the background, so nothing is lost by giving up on waiting. This only bounds
 * how long the caller's response is held. Use it on request paths; background
 * workers should await the stop directly.
 */
export async function awaitAlertStopWithin(
  work: Promise<unknown>,
  deadlineMs: number = MERCHANT_ALERT_STOP_DEADLINE_MS
): Promise<"settled" | "timed-out"> {
  // Swallow here too: an unhandled rejection after the race resolves would
  // otherwise crash the process rather than the request.
  const guarded = work.then(
    () => "settled" as const,
    () => "settled" as const
  );
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), Math.max(1, deadlineMs));
    // Do not keep the event loop alive just for this guard.
    timer.unref?.();
  });
  try {
    return await Promise.race([guarded, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
