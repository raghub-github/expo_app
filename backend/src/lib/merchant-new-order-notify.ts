/**
 * Push + in-app notification when a new CREATED food order lands for a merchant store.
 */
import type { Sql } from "postgres";
import { resolveMerchantVisibleOrderTotal } from "./merchant-visible-pricing.js";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

async function sendExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: "high",
    channelId: "merchant_default",
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
  } catch {
    /* best-effort */
  }
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
      total = Math.round(merchantTotal);
    }
  } catch {
    /* omit amount rather than show customer grand_total */
  }

  const title = "New order!";
  const body =
    total != null && total > 0
      ? `${displayId} · ₹${total.toLocaleString("en-IN")} — tap to accept`
      : `${displayId} — tap to accept`;

  await sql`
    INSERT INTO merchant_store_notifications (store_id, type, title, body, read, action_url)
    VALUES (
      ${merchantStoreId},
      'order',
      ${title},
      ${body},
      FALSE,
      ${foodId ? `/order/${foodId}` : "/(tabs)/"}
    )
  `;

  const tokenRows = await sql`
    SELECT token FROM merchant_store_push_tokens WHERE store_id = ${merchantStoreId}
  `;
  const tokens = (tokenRows as unknown as Array<{ token: string }>)
    .map((t) => t.token)
    .filter(Boolean);

  await sendExpoPush(tokens, {
    title,
    body,
    data: {
      type: "merchant_new_order",
      orderId: orderIdText,
      foodOrderId: foodId,
      url: foodId ? `/order/${foodId}` : "/(tabs)/",
      screen: "new_order",
    },
  });
}
