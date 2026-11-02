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
import { shouldClearOrderNotifications } from "./clear-merchant-order-notifications.js";

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
  /**
   * Is the order still waiting for the merchant to accept or reject it?
   *
   * Required, not optional-defaulting-to-true: forgetting to pass it must be a
   * type error, because defaulting it is exactly how the bug below survived.
   *
   * Accepting an order DELETES its merchant_store_notifications row (see
   * clearMerchantStoreOrderNotifications). Without this gate the reconciler
   * then sees "no merchant notification" for an order that is ACCEPTED or
   * PREPARING - both of which are in the rider-dispatchable status list the
   * candidate query filters on - and re-sends the NEW ORDER alert, which
   * carries gmAlertAction:"start" and rings the buzzer again. It repeats every
   * tick until a rider is assigned or the order ages out of the lookback
   * window. A merchant reported exactly that: the alert returning after they
   * had already accepted.
   *
   * There is nothing to heal once the merchant has acted, so the only safe
   * answer is to not re-notify. Derive it from the SAME predicate that decides
   * to clear the notification, so the two can never disagree: if a status
   * clears merchant order notifications, the reconciler must not recreate them.
   */
  awaitingMerchantAcceptance: boolean;
}): OrderSideEffectDecision {
  return {
    // Dispatch is unaffected: a rider is legitimately dispatched for ACCEPTED /
    // PREPARING / READY_FOR_PICKUP orders, so that healing must keep working.
    startDispatch: !input.isSelfPickup && !input.hasDispatchSession,
    notifyMerchant: !input.hasMerchantNotification && input.awaitingMerchantAcceptance,
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
  food_order_status: string | null;
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
      ) AS has_merchant_notif,
      of.order_status AS food_order_status
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
    // Same predicate that clears merchant order notifications, negated: if a
    // status is past "waiting for the merchant", it clears them and we must not
    // recreate them.
    const awaitingMerchantAcceptance = !shouldClearOrderNotifications(
      String(row.food_order_status ?? "")
    );
    const decision = decideOrderSideEffects({
      hasDispatchSession: row.has_session === true,
      hasMerchantNotification: row.has_merchant_notif === true,
      isSelfPickup,
      awaitingMerchantAcceptance,
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
