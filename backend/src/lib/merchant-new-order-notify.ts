/**
 * Push + in-app notification when a new CREATED food order lands for a merchant store.
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

  let total: number | null = null;
  let itemCount = 1;
  let customerName = "Customer";
  try {
    const merchantNotify = await resolveMerchantVisibleOrderNotify(sql, {
      merchantStoreId,
      orderIdText,
    });
    if (merchantNotify != null && merchantNotify.amount > 0) {
      total = Math.round(merchantNotify.amount * 100) / 100;
      itemCount = Math.max(1, merchantNotify.itemCount);
      customerName = merchantNotify.customerName || "Customer";
    }
  } catch {
    /* omit amount rather than show customer grand_total */
  }

  const title = "🔔 New Order Received";
  const body = `Order #${displayId} is waiting for your acceptance.`;

  // Legacy in-app inbox row (kept for backward compat with the merchant app's
  // existing notifications tab reading merchant_store_notifications).
  await insertMerchantStoreNotification(sql, {
    storeId: merchantStoreId,
    type: "order",
    title,
    body,
    orderId: foodId ? Number(foodId) : null,
    actionUrl: href,
  });

  // v2 send — store_id resolves Expo + native FCM for this store's merchants
  // (multi-device). Idempotency key = MERCHANT_NEW_ORDER:<order-id>:<store-id>
  // dedupes if the placement service retries mid-transaction.
  await sendNotification({
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
    idempotencyKey: `MERCHANT_NEW_ORDER:${orderIdText}:${merchantStoreId}`,
    overrides: {
      title,
      body,
    },
    metadata: {
      type: "merchant_new_order",
      orderId: orderIdText,
      foodOrderId: foodId,
      url: href,
      skip_in_app_banner: true,
    },
  }).catch((e) =>
    console.warn("[merchant-new-order] v2 send failed (tolerated)", (e as Error).message)
  );
}
