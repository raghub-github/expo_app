/**
 * Merchant store push + in-app notifications (orders, ratings, rider pickup, online status).
 */
import type { Sql } from "postgres";
import {
  merchantAppOrderHref,
  merchantAppOrdersTabHref,
} from "./merchant-app-deeplink.js";
import { attachmentsProxyUrlFromKeyForApi } from "../utils/attachments-proxy-url.js";

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
  const storeTokens = (tokenRows as unknown as Array<{ token: string }>)
    .map((t) => t.token)
    .filter(Boolean);

  // Also fan out to parent merchant Expo tokens (same devices often register
  // only in expo_push_tokens with parent_merchant_id as user_id).
  let parentTokens: string[] = [];
  try {
    const parentRows = await sql`
      SELECT ept.expo_push_token AS token
      FROM public.merchant_stores ms
      INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
      INNER JOIN public.expo_push_tokens ept
        ON ept.user_id = mp.parent_merchant_id
       AND lower(coalesce(ept.role, 'merchant')) = 'merchant'
      WHERE ms.id = ${storeId}
        AND ms.deleted_at IS NULL
        AND ept.expo_push_token IS NOT NULL
    `;
    parentTokens = (parentRows as unknown as Array<{ token: string }>)
      .map((t) => t.token)
      .filter(Boolean);
  } catch {
    /* parent fan-out is best-effort */
  }

  return [...new Set([...storeTokens, ...parentTokens])];
}

async function sendMerchantExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({
    to,
    sound: payload.channelId === "merchant_new_orders_alert" ? "notification" : "default",
    title: payload.title,
    body: payload.body,
    data: {
      ...(payload.data ?? {}),
      skip_in_app_banner: true,
      appRole: "merchant",
    },
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

const STORE_NOTIFY_LAST_META_KEY = "store_notify_last";
const STORE_NOTIFY_IDEM_HOURS = 6;

function readMetaObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

async function recentlySentStoreTitle(sql: Sql, storeId: number, title: string): Promise<boolean> {
  const rows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  const meta = readMetaObject((rows[0] as { settings_metadata?: unknown } | undefined)?.settings_metadata);
  const lastMap = readMetaObject(meta[STORE_NOTIFY_LAST_META_KEY]);
  const lastIso = typeof lastMap[title] === "string" ? String(lastMap[title]) : "";
  if (!lastIso) return false;
  const lastMs = new Date(lastIso).getTime();
  if (!Number.isFinite(lastMs)) return false;
  return Date.now() - lastMs < STORE_NOTIFY_IDEM_HOURS * 60 * 60 * 1000;
}

async function stampStoreNotifyTitle(sql: Sql, storeId: number, title: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = await sql`
    SELECT settings_metadata
    FROM merchant_store_settings
    WHERE store_id = ${storeId}
    LIMIT 1
  `;
  const prevMeta = readMetaObject((rows[0] as { settings_metadata?: unknown } | undefined)?.settings_metadata);
  const lastMap = readMetaObject(prevMeta[STORE_NOTIFY_LAST_META_KEY]);
  const nextMeta = {
    ...prevMeta,
    [STORE_NOTIFY_LAST_META_KEY]: { ...lastMap, [title]: now },
  };
  const metaJson = JSON.stringify(nextMeta);
  if (rows[0]) {
    await sql`
      UPDATE merchant_store_settings
      SET settings_metadata = ${metaJson}::text::jsonb, updated_at = NOW()
      WHERE store_id = ${storeId}
    `;
    return;
  }
  await sql`
    INSERT INTO merchant_store_settings (store_id, settings_metadata)
    VALUES (${storeId}, ${metaJson}::text::jsonb)
  `;
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
  // Idempotent for order-linked rows — placement + webhook retries must not
  // create twin "New order!" inbox entries on the same device.
  if (args.orderId != null && Number.isFinite(args.orderId) && args.orderId > 0) {
    await sql`
      INSERT INTO merchant_store_notifications (store_id, type, title, body, read, order_id, action_url)
      SELECT
        ${args.storeId},
        ${args.type},
        ${args.title},
        ${args.body},
        FALSE,
        ${args.orderId},
        ${args.actionUrl ?? null}
      WHERE NOT EXISTS (
        SELECT 1
        FROM merchant_store_notifications n
        WHERE n.store_id = ${args.storeId}
          AND n.order_id = ${args.orderId}
          AND n.title = ${args.title}
          AND n.created_at > now() - interval '6 hours'
      )
    `;
    return;
  }

  // Delist / relist / wallet retries must not recreate an inbox row the merchant
  // already dismissed (Clear all deletes the row, then a retry would bring it back).
  if (await recentlySentStoreTitle(sql, args.storeId, args.title)) {
    return;
  }

  const inserted = await sql`
    INSERT INTO merchant_store_notifications (store_id, type, title, body, read, order_id, action_url)
    SELECT
      ${args.storeId},
      ${args.type},
      ${args.title},
      ${args.body},
      FALSE,
      ${args.orderId ?? null},
      ${args.actionUrl ?? null}
    WHERE NOT EXISTS (
      SELECT 1
      FROM merchant_store_notifications n
      WHERE n.store_id = ${args.storeId}
        AND n.title = ${args.title}
        AND n.created_at > now() - interval '6 hours'
    )
    RETURNING id
  `;
  if ((inserted as unknown as Array<unknown>).length > 0) {
    try {
      await stampStoreNotifyTitle(sql, args.storeId, args.title);
    } catch {
      /* stamp is best-effort; live-row idempotency still holds */
    }
  }
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
    /** Skip merchant_store_notifications inbox (push-only). */
    skipInbox?: boolean;
  }
): Promise<void> {
  if (!args.skipInbox) {
    await insertMerchantStoreNotification(sql, args);
  }
  const tokens = await getMerchantStorePushTokens(sql, args.storeId);
  await sendMerchantExpoPush(tokens, {
    title: args.title,
    body: args.body,
    data: args.pushData,
    channelId: args.channelId,
  });
}

/** Idle / online reminder when store starts accepting orders — same copy as waiting-for-order inbox. */
export async function notifyMerchantStoreOnline(sql: Sql, storeId: number): Promise<void> {
  const { WAITING_FOR_ORDER_TITLE, WAITING_FOR_ORDER_BODY, ensureWaitingForOrderInbox } = await import(
    "./merchant-waiting-for-order.js"
  );
  const ensured = await ensureWaitingForOrderInbox(storeId);
  if (ensured.suppressed) return;
  // Only push when the waiting-for-order inbox row is newly created (store just came online).
  // Avoid re-pushing every schedule tick while already online.
  if (!ensured.created) return;

  await notifyMerchantStore(sql, {
    storeId,
    type: "system",
    title: WAITING_FOR_ORDER_TITLE,
    body: WAITING_FOR_ORDER_BODY,
    actionUrl: "/(tabs)/",
    pushData: {
      type: "store_online",
      notificationType: "store_online",
      screen: "home",
      merchantId: storeId,
      url: "/(tabs)/",
    },
    channelId: "merchant_online",
    // Inbox row already inserted by ensureWaitingForOrderInbox.
    skipInbox: true,
  });
}

async function merchantStoreDisplayName(sql: Sql, storeId: number): Promise<string> {
  const rows = await sql`
    SELECT store_name FROM merchant_stores WHERE id = ${storeId} LIMIT 1
  `;
  const name = (rows[0] as { store_name?: string } | undefined)?.store_name?.trim();
  return name && name.length > 0 ? name : "Your restaurant";
}

/** Outside scheduled delivery slot — opens restaurant status screen. */
export async function notifyMerchantOutsideDeliveryTimings(sql: Sql, storeId: number): Promise<void> {
  const storeName = await merchantStoreDisplayName(sql, storeId);
  const title = `🔴 ${storeName} is out of delivery timings`;
  const body = "Go online now to receive orders";
  const recent = await sql`
    SELECT 1 FROM merchant_store_notifications
    WHERE store_id = ${storeId}
      AND title = ${title}
      AND created_at > now() - interval '12 hours'
    LIMIT 1
  `;
  if (recent.length > 0) return;
  await notifyMerchantStore(sql, {
    storeId,
    type: "store",
    title,
    body,
    actionUrl: "/restaurant-status",
    pushData: {
      type: "merchant_outside_delivery",
      screen: "restaurant_status",
      url: "/restaurant-status",
      template_code: "MERCHANT_OUTSIDE_DELIVERY_TIMINGS",
    },
    channelId: "merchant_online",
  });
}

/** Delivery slot is active but store is still offline — prompt merchant to go online. */
export async function notifyMerchantGoOnlinePrompt(sql: Sql, storeId: number): Promise<void> {
  const storeName = await merchantStoreDisplayName(sql, storeId);
  const title = `🔴 ${storeName} is out of delivery timings`;
  const body = "Go online now to receive orders";
  const recent = await sql`
    SELECT 1 FROM merchant_store_notifications
    WHERE store_id = ${storeId}
      AND title = ${title}
      AND created_at > now() - interval '6 hours'
    LIMIT 1
  `;
  if (recent.length > 0) return;
  await notifyMerchantStore(sql, {
    storeId,
    type: "store",
    title,
    body,
    actionUrl: "/restaurant-status",
    pushData: {
      type: "merchant_go_online",
      screen: "restaurant_status",
      url: "/restaurant-status",
      template_code: "MERCHANT_GO_ONLINE_PROMPT",
    },
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
  if (args.stars <= 3) {
    await notifyMerchantNewComplaint(sql, {
      storeId: args.storeId,
      customerName: shortName,
      displayOrderId: args.displayOrderId,
      preview: `${args.stars}★ rating`,
    });
    return;
  }
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

/** OS push only (no in-app inbox / floating bubble) when a store receives a complaint. */
export async function notifyMerchantNewComplaint(
  sql: Sql,
  args: {
    storeId: number;
    customerName: string;
    displayOrderId?: string | null;
    preview?: string | null;
  }
): Promise<void> {
  if (!Number.isInteger(args.storeId) || args.storeId < 1) return;
  const name = args.customerName.trim() || "Customer";
  const orderBit = args.displayOrderId?.trim() ? ` on ${args.displayOrderId.trim()}` : "";
  const preview = (args.preview ?? "").trim();
  const title = "New complaint";
  const body = preview
    ? `${name}: ${preview}`.slice(0, 180)
    : `${name} submitted a complaint${orderBit}.`;
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "system",
    title,
    body,
    skipInbox: true,
    channelId: "merchant_complaints",
    actionUrl: "/(tabs)/complaints",
    pushData: {
      type: "merchant_complaint",
      url: "/(tabs)/complaints",
      screen: "complaints",
    },
  });
}

/** Rider accepted the delivery — merchant gets a lifecycle heads-up. */
export async function notifyMerchantRiderAssigned(
  sql: Sql,
  args: {
    storeId: number;
    displayOrderId: string;
    riderName: string;
    foodOrderId: number | null;
  }
): Promise<void> {
  if (!Number.isInteger(args.storeId) || args.storeId < 1) return;
  const rider = args.riderName.trim() || "Rider";
  const id = args.displayOrderId.startsWith("#")
    ? args.displayOrderId
    : `#${args.displayOrderId}`;
  const title = `Rider assigned · Order ${id}`;
  const body = `${rider} is on the way to your store for pickup.`;
  const actionUrl =
    args.foodOrderId != null ? `/order/${args.foodOrderId}` : "/(tabs)/orders";
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "order",
    title,
    body,
    orderId: args.foodOrderId,
    actionUrl,
    channelId: "merchant_order_lifecycle",
    skipInbox: true,
    pushData: {
      type: "merchant_rider_assigned",
      stage: "RIDER_ASSIGNED",
      refreshLiveOrders: true,
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
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
    pickupOtp?: string | null;
    freeWaitSeconds?: number | null;
  }
): Promise<void> {
  const { FOOD_RIDER_FREE_WAIT_SECONDS } = await import("./food-rider-free-wait.js");
  const breakdown = await countActiveOrdersBreakdownForStore(sql, args.storeId);
  const rider = args.riderName.trim() || "Rider";
  const freeWait =
    args.freeWaitSeconds != null && Number.isFinite(args.freeWaitSeconds)
      ? Math.max(0, Math.floor(args.freeWaitSeconds))
      : FOOD_RIDER_FREE_WAIT_SECONDS;
  const otp = (args.pickupOtp ?? "").trim();
  const title = `Order ID: ${args.displayOrderId}, hand over asap!`;
  const body = otp
    ? `${rider} has reached for pickup. OTP ${otp}. Free wait ${Math.round(freeWait / 60)} min.`
    : `${rider} has reached nearby for pickup. Click to view details.`;
  const actionUrl = args.foodOrderId != null ? `/order/${args.foodOrderId}` : "/(tabs)/orders";
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "order",
    title,
    body,
    orderId: args.foodOrderId,
    actionUrl,
    channelId: "merchant_order_lifecycle",
    pushData: {
      type: "merchant_rider_pickup",
      refreshLiveOrders: true,
      activeOrdersCount: breakdown.active_orders,
      preparing: breakdown.preparing,
      ready: breakdown.ready,
      outForDelivery: breakdown.out_for_delivery,
      pendingAccept: breakdown.pending_accept,
      stickySubtitle: `${rider} at store — hand over asap`,
      freeWaitSeconds: freeWait,
      pickupOtp: otp || undefined,
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
    },
  });
}

/**
 * Free-wait window ended while rider is still at store — PRIORITY push.
 * Idempotent via notification service key MERCHANT_RIDER_FREE_WAIT:{foodOrderId}.
 */
export async function notifyMerchantRiderFreeWaitExceeded(
  sql: Sql,
  args: {
    storeId: number;
    displayOrderId: string;
    riderName: string;
    foodOrderId: number;
    waitSeconds: number;
    pickupOtp?: string | null;
  }
): Promise<void> {
  if (!Number.isInteger(args.foodOrderId) || args.foodOrderId < 1) return;
  const breakdown = await countActiveOrdersBreakdownForStore(sql, args.storeId);
  const rider = args.riderName.trim() || "Rider";
  const mins = Math.max(1, Math.round(args.waitSeconds / 60));
  const otp = (args.pickupOtp ?? "").trim();
  const title = `PRIORITY: Order ${args.displayOrderId}`;
  const body = otp
    ? `${rider} waiting ${mins}+ min. Hand over now · OTP ${otp}`
    : `${rider} has been waiting ${mins}+ min. Hand over the order now.`;
  const actionUrl = `/order/${args.foodOrderId}`;
  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "order",
    title,
    body,
    orderId: args.foodOrderId,
    actionUrl,
    channelId: "merchant_order_lifecycle",
    pushData: {
      type: "merchant_rider_wait_priority",
      refreshLiveOrders: true,
      activeOrdersCount: breakdown.active_orders,
      preparing: breakdown.preparing,
      ready: breakdown.ready,
      outForDelivery: breakdown.out_for_delivery,
      pendingAccept: breakdown.pending_accept,
      stickySubtitle: `PRIORITY · ${rider} waiting`,
      waitSeconds: args.waitSeconds,
      pickupOtp: otp || undefined,
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
      idempotencyKey: `MERCHANT_RIDER_FREE_WAIT:${args.foodOrderId}`,
    },
  });
}

const LIFECYCLE_STAGES = new Set([
  "PREPARING",
  "ACCEPTED",
  "READY",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "PICKED_UP",
  "HANDED_OVER",
  "IN_TRANSIT",
  "DISPATCHED",
  "CANCELLED",
  "DELIVERED",
  "COMPLETED",
  "RTO",
  "SCHEDULED",
  "PREORDER",
  "PRE_ORDER",
]);

function lifecycleCopy(
  stage: string,
  displayOrderId: string,
  reason?: string | null
): { title: string; body: string; subtitle: string } {
  const id = displayOrderId.startsWith("#") ? displayOrderId : `#${displayOrderId}`;
  const s = stage.toUpperCase();
  if (s === "CANCELLED") {
    const why = (reason ?? "").trim();
    return {
      title: `Order ${id} cancelled`,
      body: why ? why : "Order was cancelled. Tap to view.",
      subtitle: `Order ${id} cancelled`,
    };
  }
  if (s === "RTO") {
    return {
      title: `Order ${id} returned (RTO)`,
      body: "Tap to view this order",
      subtitle: `Order ${id} RTO`,
    };
  }
  if (s === "SCHEDULED" || s === "PREORDER" || s === "PRE_ORDER") {
    return {
      title: `Scheduled order ${id}`,
      body: "Tap to view this scheduled order",
      subtitle: `Order ${id} scheduled`,
    };
  }
  if (s === "DELIVERED" || s === "COMPLETED") {
    return {
      title: `Order ${id} delivered`,
      body: "Tap to view this order",
      subtitle: `Order ${id} delivered`,
    };
  }
  if (s === "READY" || s === "READY_FOR_PICKUP") {
    return {
      title: `Order ${id} is ready`,
      body: "Ready for pickup — tap to view",
      subtitle: `Order ${id} is ready`,
    };
  }
  if (s === "OUT_FOR_DELIVERY" || s === "PICKED_UP" || s === "HANDED_OVER") {
    return {
      title: `Order ${id} handed over`,
      body: "Handed over to delivery partner — tap to view",
      subtitle: `Order ${id} handed over`,
    };
  }
  if (s === "IN_TRANSIT" || s === "DISPATCHED") {
    return {
      title: `Order ${id} out for delivery`,
      body: "On the way to customer — tap to view",
      subtitle: `Order ${id} out for delivery`,
    };
  }
  // PREPARING / ACCEPTED
  return {
    title: `Order ${id} is preparing`,
    body: "Kitchen started — tap to view",
    subtitle: `Order ${id} is preparing`,
  };
}

async function countActiveOrdersBreakdownForStore(
  sql: Sql,
  storeId: number
): Promise<{
  active_orders: number;
  pending_accept: number;
  preparing: number;
  ready: number;
  out_for_delivery: number;
}> {
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE upper(COALESCE(f.order_status, '')) IN (
          'CREATED', 'NEW', 'PLACED',
          'ACCEPTED', 'PREPARING',
          'READY_FOR_PICKUP', 'READY',
          'OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DISPATCHED'
        )
      )::int AS active_orders,
      COUNT(*) FILTER (
        WHERE upper(COALESCE(f.order_status, '')) IN ('CREATED', 'NEW', 'PLACED')
      )::int AS pending_accept,
      COUNT(*) FILTER (
        WHERE upper(COALESCE(f.order_status, '')) IN ('ACCEPTED', 'PREPARING')
      )::int AS preparing,
      COUNT(*) FILTER (
        WHERE upper(COALESCE(f.order_status, '')) IN ('READY_FOR_PICKUP', 'READY')
      )::int AS ready,
      COUNT(*) FILTER (
        WHERE upper(COALESCE(f.order_status, '')) IN (
          'OUT_FOR_DELIVERY', 'PICKED_UP', 'IN_TRANSIT', 'DISPATCHED'
        )
      )::int AS out_for_delivery
    FROM orders_food f
    WHERE f.merchant_store_id = ${storeId}
  `;
  const r = rows[0] as Record<string, number> | undefined;
  const n = (v: unknown) => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) && x > 0 ? Math.floor(x) : 0;
  };
  return {
    active_orders: n(r?.active_orders),
    pending_accept: n(r?.pending_accept),
    preparing: n(r?.preparing),
    ready: n(r?.ready),
    out_for_delivery: n(r?.out_for_delivery),
  };
}

async function countActiveOrdersForStore(sql: Sql, storeId: number): Promise<number> {
  const b = await countActiveOrdersBreakdownForStore(sql, storeId);
  return b.active_orders;
}

/**
 * Stage / cancel push to merchant *store* tokens (works in background/killed).
 * Includes activeOrdersCount + stage breakdown so the sticky tray can update
 * without an API call (Zomato-style preparing/ready line).
 */
export async function notifyMerchantOrderLifecycle(
  sql: Sql,
  args: {
    storeId: number;
    foodOrderId: number | null;
    displayOrderId: string;
    stage: string;
    reason?: string | null;
  }
): Promise<void> {
  const stage = String(args.stage ?? "").trim().toUpperCase();
  if (!LIFECYCLE_STAGES.has(stage)) return;
  if (!Number.isInteger(args.storeId) || args.storeId < 1) return;

  const breakdown = await countActiveOrdersBreakdownForStore(sql, args.storeId);
  const activeOrdersCount = breakdown.active_orders;
  const copy = lifecycleCopy(stage, args.displayOrderId, args.reason);
  const actionUrl =
    args.foodOrderId != null
      ? merchantAppOrderHref(args.foodOrderId)
      : merchantAppOrdersTabHref(stage);

  await notifyMerchantStore(sql, {
    storeId: args.storeId,
    type: "order",
    title: copy.title,
    body: copy.body,
    orderId: args.foodOrderId,
    actionUrl,
    channelId: "merchant_order_lifecycle",
    // Cancel/delivered keep an inbox row; prep/ready/OFD are push + sticky only.
    skipInbox:
      stage !== "CANCELLED" && stage !== "DELIVERED",
    pushData: {
      type: "merchant_order_lifecycle",
      stage,
      refreshLiveOrders: true,
      activeOrdersCount,
      preparing: breakdown.preparing,
      ready: breakdown.ready,
      outForDelivery: breakdown.out_for_delivery,
      pendingAccept: breakdown.pending_accept,
      stickySubtitle: copy.subtitle,
      orderId: args.displayOrderId,
      foodOrderId: args.foodOrderId,
      url: actionUrl,
    },
  });
}
