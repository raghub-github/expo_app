/**
 * GAP 1 — durable at-least-once order side effects (merchant new-order alert + rider dispatch start).
 *
 * Order placement fires `notifyMerchantStoreNewOrder` + `maybeStartOrderDispatch` INLINE
 * (fire-and-forget) after the order commits. That is the fast, happy path. But if the process dies,
 * the network blips, or the inline call throws before it runs, the merchant can silently never get
 * the audible new-order alert and dispatch may never start — a permanently missed order.
 *
 * This reconciler is the SELF-HEALING backstop. It never touches the placement transaction (so it
 * can never block or fail an order), and both effects it triggers are already idempotent:
 *   - dispatch start: `order_dispatch_sessions` has `ON CONFLICT (order_core_id) DO NOTHING`
 *   - merchant notify: inbox 6h dedup + `recentlySentStoreTitle` guard
 *
 * "Needs healing" is derived purely from existing state — a recent, still-unassigned, dispatchable
 * food order that has NO dispatch session and/or NO merchant order-notification row. The lookback
 * window bounds re-attempts naturally (an order older than the window is left alone), and the small
 * lower bound avoids racing the inline path's first attempt.
 */
import { getSql } from "../db/client.js";
import { isSelfPickupFulfillment } from "./self-pickup.js";

/** Only heal orders at least this old — let the inline fast-path run first (avoid double work). */
const MIN_AGE_SECONDS = 30;
/** Stop healing after this — a still-stuck order is a separate problem, not a missed side effect. */
const MAX_AGE_MINUTES = 20;

export type OrderSideEffectDecision = {
  startDispatch: boolean;
  notifyMerchant: boolean;
};

/**
 * PURE: given what already exists for an order, decide which side effects are still missing.
 * Self-pickup food never needs a rider, so dispatch is never started for it.
 */
export function decideOrderSideEffects(input: {
  hasDispatchSession: boolean;
  hasMerchantNotification: boolean;
  isSelfPickup: boolean;
}): OrderSideEffectDecision {
  return {
    startDispatch: !input.isSelfPickup && !input.hasDispatchSession,
    notifyMerchant: !input.hasMerchantNotification,
  };
}

type ReconcileCandidateRow = {
  order_core_id: number;
  order_id: string | null;
  merchant_store_id: number | null;
  food_id: number | null;
  delivery_type: string | null;
  billing_snapshot: unknown;
  checkout_metadata: unknown;
  has_session: boolean;
  has_merchant_notif: boolean;
};

export type OrderSideEffectsReconcileResult = {
  scanned: number;
  dispatchStarted: number;
  merchantNotified: number;
};

/**
 * Find recent unassigned dispatchable food orders that are missing a side effect and heal them.
 * Fail-open per order: one failure never blocks the batch. Returns counts for observability.
 */
export async function runOrderSideEffectsReconcile(
  limit = 50
): Promise<OrderSideEffectsReconcileResult> {
  const sql = getSql();
  const { fetchFoodDispatchableStatusesForFlow } = await import("./food-rider-accept-flow.js");
  const dispatchable = [...(await fetchFoodDispatchableStatusesForFlow())];

  const rows = (await sql`
    SELECT
      oc.id AS order_core_id,
      oc.order_id,
      of.merchant_store_id,
      of.id AS food_id,
      oc.delivery_type,
      oc.billing_snapshot,
      oc.checkout_metadata,
      EXISTS (
        SELECT 1 FROM order_dispatch_sessions ods WHERE ods.order_core_id = oc.id
      ) AS has_session,
      EXISTS (
        SELECT 1 FROM merchant_store_notifications n
        WHERE n.store_id = of.merchant_store_id
          AND n.order_id = of.id
          AND n.type = 'order'
      ) AS has_merchant_notif
    FROM orders_core oc
    INNER JOIN orders_food of ON of.order_id = oc.id
    WHERE oc.order_type = 'food'
      AND oc.created_at <= NOW() - (${MIN_AGE_SECONDS} * INTERVAL '1 second')
      AND oc.created_at >= NOW() - (${MAX_AGE_MINUTES} * INTERVAL '1 minute')
      AND oc.rider_id IS NULL
      AND of.rider_id IS NULL
      AND of.cancelled_at IS NULL
      AND of.order_status = ANY(${dispatchable})
      AND oc.status NOT IN ('delivered', 'cancelled', 'failed')
      AND (
        NOT EXISTS (SELECT 1 FROM order_dispatch_sessions ods WHERE ods.order_core_id = oc.id)
        OR NOT EXISTS (
          SELECT 1 FROM merchant_store_notifications n
          WHERE n.store_id = of.merchant_store_id AND n.order_id = of.id AND n.type = 'order'
        )
      )
    ORDER BY oc.created_at ASC
    LIMIT ${limit}
  `) as ReconcileCandidateRow[];

  let dispatchStarted = 0;
  let merchantNotified = 0;

  for (const row of rows ?? []) {
    const orderCoreId = Number(row.order_core_id);
    const storeId = row.merchant_store_id != null ? Number(row.merchant_store_id) : null;
    const orderIdText = String(row.order_id ?? "").trim();
    if (!Number.isFinite(orderCoreId) || orderCoreId <= 0) continue;

    const isSelfPickup = isSelfPickupFulfillment(
      row.delivery_type,
      row.billing_snapshot,
      row.checkout_metadata
    );
    const decision = decideOrderSideEffects({
      hasDispatchSession: row.has_session === true,
      hasMerchantNotification: row.has_merchant_notif === true,
      isSelfPickup,
    });

    if (decision.notifyMerchant && storeId != null && orderIdText) {
      try {
        const { notifyMerchantStoreNewOrder } = await import("./merchant-new-order-notify.js");
        await notifyMerchantStoreNewOrder(sql, { merchantStoreId: storeId, orderIdText });
        merchantNotified += 1;
        console.info(
          "[order-reconcile] HEALED_MERCHANT_NOTIFY",
          JSON.stringify({ orderCoreId, storeId, orderId: orderIdText })
        );
      } catch (err) {
        console.warn(
          "[order-reconcile] merchant notify heal failed (will retry next tick)",
          JSON.stringify({ orderCoreId, message: (err as Error).message })
        );
      }
    }

    if (decision.startDispatch) {
      try {
        const { maybeStartOrderDispatch } = await import("./order-dispatch.service.js");
        await maybeStartOrderDispatch(orderCoreId);
        dispatchStarted += 1;
        console.info(
          "[order-reconcile] HEALED_START_DISPATCH",
          JSON.stringify({ orderCoreId, orderId: orderIdText })
        );
      } catch (err) {
        console.warn(
          "[order-reconcile] start dispatch heal failed (will retry next tick)",
          JSON.stringify({ orderCoreId, message: (err as Error).message })
        );
      }
    }
  }

  return { scanned: rows?.length ?? 0, dispatchStarted, merchantNotified };
}
