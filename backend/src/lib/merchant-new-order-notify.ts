/**
 * Push + in-app notification when a new CREATED food order lands for a merchant store.
 *
 * Latency: after foodId/displayId are known, fire the critical tray push first
 * (amount may be 0). Inbox / sticky / v2 in_app and pricing must not block that push.
 */
import type { Sql } from "postgres";
import { insertMerchantStoreNotification } from "./merchant-push-notify.js";
import { resolveMerchantVisibleOrderNotify } from "./merchant-visible-pricing.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";
import { merchantAppHomeNewOrdersHref } from "./merchant-app-deeplink.js";

export { merchantAppOrderHref, merchantAppOrdersTabHref, merchantAppHomeNewOrdersHref } from "./merchant-app-deeplink.js";

export async function lookupFoodOrderIdByCoreOrderText(
  sql: Sql,
  args: { orderIdText: string; merchantStoreId?: number | null }
): Promise<string | null> {
  const orderIdText = String(args.orderIdText ?? "").trim();
  if (!orderIdText) return null;
  const storeId = args.merchantStoreId != null ? Number(args.merchantStoreId) : null;
  const rows =
    storeId != null && Number.isFinite(storeId) && storeId > 0
      ? await sql`
          SELECT f.id::text AS food_id
          FROM orders_food f
          INNER JOIN orders_core c ON c.id = f.order_id
          WHERE f.merchant_store_id = ${storeId}
            AND (
              c.order_id = ${orderIdText}
              OR c.formatted_order_id = ${orderIdText}
              OR f.formatted_order_id = ${orderIdText}
            )
          ORDER BY f.id DESC
          LIMIT 1
        `
      : await sql`
          SELECT f.id::text AS food_id
          FROM orders_food f
          INNER JOIN orders_core c ON c.id = f.order_id
          WHERE c.order_id = ${orderIdText}
            OR c.formatted_order_id = ${orderIdText}
            OR f.formatted_order_id = ${orderIdText}
          ORDER BY f.id DESC
          LIMIT 1
        `;
  const id = String((rows[0] as { food_id?: string } | undefined)?.food_id ?? "").trim();
  return /^\d+$/.test(id) ? id : null;
}

export async function notifyMerchantStoreNewOrder(
  sql: Sql,
  args: {
    merchantStoreId: number;
    orderIdText: string;
    grandTotal?: number | null;
  }
): Promise<void> {
  const { merchantStoreId, orderIdText } = args;

  const foodId = await lookupFoodOrderIdByCoreOrderText(sql, {
    merchantStoreId,
    orderIdText,
  });
  const href = merchantAppHomeNewOrdersHref();

  const foodRows = await sql`
    SELECT f.formatted_order_id
    FROM orders_food f
    INNER JOIN orders_core c ON c.id = f.order_id
    WHERE f.merchant_store_id = ${merchantStoreId}
      AND c.order_id = ${orderIdText}
    ORDER BY f.id DESC
    LIMIT 1
  `;
  const food = foodRows[0] as { formatted_order_id?: string } | undefined;
  const displayId = (food?.formatted_order_id as string | undefined) ?? orderIdText;

  const title = "🔔 New Order Received";
  const body = `Order #${displayId} is waiting for your acceptance.`;

  // Pricing in parallel with push — never block the critical tray on CTM/pricing.
  const pricingPromise = resolveMerchantVisibleOrderNotify(sql, {
    merchantStoreId,
    orderIdText,
  })
    .then((merchantNotify) => {
      if (merchantNotify != null && merchantNotify.amount > 0) {
        return {
          total: Math.round(merchantNotify.amount * 100) / 100,
          itemCount: Math.max(1, merchantNotify.itemCount),
          customerName: merchantNotify.customerName || "Customer",
        };
      }
      return null;
    })
    .catch(() => null);

  // Fire tray push immediately (amount 0). Pricing enriches inbox / v2 only.
  let total: number | null = null;
  let itemCount = 1;
  let customerName = "Customer";

  const push_dispatch_started_at = Date.now();
  console.info(
    "[merchant-new-order] push_dispatch_started_at",
    JSON.stringify({
      push_dispatch_started_at,
      orderId: orderIdText,
      storeId: merchantStoreId,
      foodId,
      displayId,
    })
  );

  const { notifyMerchantStoreNewOrderPush, notifyMerchantStoreStatus } = await import(
    "./merchant-push-notify.js"
  );

  // Primary tray delivery FIRST — same direct Expo + native FCM path as store-status.
  const pushPromise = notifyMerchantStoreNewOrderPush(sql, {
    storeId: merchantStoreId,
    title,
    body,
    foodOrderId: foodId ? Number(foodId) : null,
    orderIdText,
    displayId,
    href,
    itemCount,
    amount: 0,
    customerName,
  })
    .then(() => {
      console.info(
        "[merchant-new-order] push_done_at",
        JSON.stringify({
          push_done_at: Date.now(),
          push_dispatch_started_at,
          orderId: orderIdText,
          storeId: merchantStoreId,
        })
      );
    })
    .catch((e) =>
      console.warn("[merchant-new-order] direct FCM failed (tolerated)", (e as Error).message)
    );

  // Secondary work after push has started — await pricing for richer inbox/v2.
  const secondaryPromise = (async () => {
    const priced = await pricingPromise;
    if (priced) {
      total = priced.total;
      itemCount = priced.itemCount;
      customerName = priced.customerName;
    }

    await Promise.allSettled([
      // Legacy in-app inbox row (kept for backward compat).
      insertMerchantStoreNotification(sql, {
        storeId: merchantStoreId,
        type: "order",
        title,
        body,
        orderId: foodId ? Number(foodId) : null,
        actionUrl: href,
      }),
      // Keep the ONLINE sticky in sync for killed devices (🔔 N new).
      notifyMerchantStoreStatus(sql, merchantStoreId, "ONLINE", {
        eventId: `STORE_STATUS:NEW_ORDER:${merchantStoreId}:${foodId ?? orderIdText}`,
        kitchenSubtitle: `New order · #${displayId}`,
      }).catch(() => undefined),
      // v2 inbox / audit — push channel omitted so we do not twin the direct FCM above.
      sendNotification({
        templateCode: "MERCHANT_NEW_ORDER",
        variables: {
          orderId: foodId ?? orderIdText,
          foodOrderId: foodId ?? "",
          orderShortId: displayId,
          itemCount,
          amount: total ?? 0,
          customerName,
        },
        target: { store_id: merchantStoreId },
        priority: "critical",
        channel: "in_app",
        idempotencyKey: `MERCHANT_NEW_ORDER:${orderIdText}:${merchantStoreId}`,
        overrides: {
          title,
          body,
        },
        metadata: {
          type: "merchant_new_order",
          event: "NEW_ORDER",
          orderId: orderIdText,
          foodOrderId: foodId,
          storeId: merchantStoreId,
          merchantId: merchantStoreId,
          url: href,
          skip_in_app_banner: true,
          alertStartedAt: String(push_dispatch_started_at),
          alertSessionId: `MERCHANT_NEW_ORDER:${foodId ?? orderIdText}:${merchantStoreId}`,
        },
      }).catch((e) =>
        console.warn("[merchant-new-order] v2 send failed (tolerated)", (e as Error).message)
      ),
    ]);
  })();

  await Promise.allSettled([pushPromise, secondaryPromise]);
}
