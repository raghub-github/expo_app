/**
 * Merchant store push + in-app notifications (orders, ratings, rider pickup, online status).
 */
import type { Sql } from "postgres";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
};

export async function getMerchantStorePushTokens(sql: Sql, storeId: number): Promise<string[]> {
  const tokenRows = await sql`
    SELECT token FROM merchant_store_push_tokens WHERE store_id = ${storeId}
  `;
  return (tokenRows as unknown as Array<{ token: string }>)
    .map((t) => t.token)
    .filter(Boolean);
}

async function sendMerchantExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({
    to,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    priority: "high",
    channelId: payload.channelId ?? "merchant_default",
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

export async function insertMerchantStoreNotification(
  sql: Sql,
  args: {
    storeId: number;
    type: "order" | "store" | "system" | "earning";
    title: string;
    body: string;
    orderId?: number | null;
    actionUrl?: string | null;
  }
): Promise<void> {
  await sql`
    INSERT INTO merchant_store_notifications (store_id, type, title, body, read, order_id, action_url)
    VALUES (
      ${args.storeId},
      ${args.type},
      ${args.title},
      ${args.body},
      FALSE,
      ${args.orderId ?? null},
      ${args.actionUrl ?? null}
    )
  `;
}

async function notifyMerchantStore(
  sql: Sql,
  args: {
    storeId: number;
    type: "order" | "store" | "system" | "earning";
    title: string;
    body: string;
    orderId?: number | null;
    actionUrl?: string | null;
    pushData?: Record<string, unknown>;
    channelId?: string;
  }
): Promise<void> {
  await insertMerchantStoreNotification(sql, args);
  const tokens = await getMerchantStorePushTokens(sql, args.storeId);
  await sendMerchantExpoPush(tokens, {
    title: args.title,
    body: args.body,
    data: args.pushData,
    channelId: args.channelId,
  });
}

/** Zomato-style idle / online reminder when store is accepting orders. */
export async function notifyMerchantStoreOnline(sql: Sql, storeId: number): Promise<void> {
  const title = "🟢 Your restaurant is online";
  const body = "Waiting for orders";
  await notifyMerchantStore(sql, {
    storeId,
    type: "system",
    title,
    body,
    actionUrl: "/(tabs)/",
    pushData: { type: "store_online", screen: "notifications" },
    channelId: "merchant_online",
  });
}

export async function notifyMerchantNewRating(
  sql: Sql,
  args: {
    storeId: number;
    stars: number;
    customerName: string;
    displayOrderId: string;
    foodOrderId: number | null;
  }
): Promise<void> {
  const shortName = args.customerName.trim() || "Customer";
  const title = `${args.stars} stars given by ${shortName}`;
  const body = `New rating on order ID: ${args.displayOrderId}. Click to view details.`;
  const actionUrl = args.foodOrderId != null ? `/order/${args.foodOrderId}` : "/(tabs)/reviews";
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "system",
    title,
    body,
    orderId: args.foodOrderId,
    actionUrl,
    pushData: {
      type: "merchant_rating",
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
      screen: "reviews",
    },
  });
}

export async function notifyMerchantRiderReachedPickup(
  sql: Sql,
  args: {
    storeId: number;
    displayOrderId: string;
    riderName: string;
    foodOrderId: number | null;
  }
): Promise<void> {
  const rider = args.riderName.trim() || "Rider";
  const title = `Order ID: ${args.displayOrderId}, hand over asap!`;
  const body = `${rider} has reached nearby for pickup. Click to view details.`;
  const actionUrl = args.foodOrderId != null ? `/order/${args.foodOrderId}` : "/(tabs)/orders";
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "order",
    title,
    body,
    orderId: args.foodOrderId,
    actionUrl,
    pushData: {
      type: "merchant_rider_pickup",
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
      screen: "orders",
    },
  });
}
