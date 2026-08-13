/**
 * Push + in-app notification when a new CREATED food order lands for a merchant store.
 */
import type { Sql } from "postgres";
import { getMerchantStorePushTokens, insertMerchantStoreNotification } from "./merchant-push-notify.js";
import { resolveMerchantVisibleOrderTotal } from "./merchant-visible-pricing.js";
import { send as sendNotification } from "../modules/notifications/notificationService.js";

/** Merchant CTM — always 2 decimal places (matches wallet ledger). */
function formatExactMerchantInr(amount: number): string {
  const n = Math.round(amount * 100) / 100;
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

  const foodRows = await sql`
    SELECT f.id::text AS food_id, f.formatted_order_id
    FROM orders_food f
    INNER JOIN orders_core c ON c.id = f.order_id
    WHERE f.merchant_store_id = ${merchantStoreId}
      AND c.order_id = ${orderIdText}
    ORDER BY f.id DESC
    LIMIT 1
  `;
  const food = foodRows[0] as { food_id?: string; formatted_order_id?: string } | undefined;
  const foodId = food?.food_id ?? null;
  const displayId = (food?.formatted_order_id as string | undefined) ?? orderIdText;

  let total: number | null = null;
  try {
    const merchantTotal = await resolveMerchantVisibleOrderTotal(sql, {
      merchantStoreId,
      orderIdText,
    });
    if (merchantTotal != null && merchantTotal > 0) {
      total = Math.round(merchantTotal * 100) / 100;
    }
  } catch {
    /* omit amount rather than show customer grand_total */
  }

  const title = "New Order Received! 🔔";
  const body =
    total != null && total > 0
      ? `You have a new order waiting for confirmation. ${displayId} · ₹${formatExactMerchantInr(total)}`
      : "You have a new order waiting for confirmation.";

  // Legacy in-app inbox row (kept for backward compat with the merchant app's
  // existing notifications tab reading merchant_store_notifications).
  await insertMerchantStoreNotification(sql, {
    storeId: merchantStoreId,
    type: "order",
    title,
    body,
    orderId: foodId ? Number(foodId) : null,
    actionUrl: foodId ? `/order/${foodId}` : "/(tabs)/",
  });

  // v2 send — provides audit log + preference handling + super-admin visibility.
  // Uses direct device_tokens (merchant_store_push_tokens, not expo_push_tokens
  // by user_id) so this works even when the merchant has multiple stores on
  // different phones. Idempotency key = MERCHANT_NEW_ORDER:<order-id>:<store-id>
  // dedupes if the placement service retries mid-transaction.
  const tokens = await getMerchantStorePushTokens(sql, merchantStoreId);
  if (tokens.length > 0) {
    await sendNotification({
      templateCode: "MERCHANT_NEW_ORDER",
      variables: {
        orderId: orderIdText,
        orderShortId: displayId,
        itemCount: 1, // template body uses this — template can be edited to omit
        amount: total ?? 0,
        customerName: "Customer",
      },
      target: { device_tokens: tokens },
      priority: "critical",
      idempotencyKey: `MERCHANT_NEW_ORDER:${orderIdText}:${merchantStoreId}`,
      metadata: {
        type: "merchant_new_order",
        orderId: orderIdText,
        foodOrderId: foodId,
        url: foodId ? `/order/${foodId}` : "/(tabs)/",
        screen: "new_order",
      },
    }).catch((e) =>
      console.warn("[merchant-new-order] v2 send failed (tolerated)", (e as Error).message)
    );
  }
}
