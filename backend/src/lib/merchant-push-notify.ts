/**
 * Merchant store push + in-app notifications (orders, ratings, rider pickup, online status).
 */
import type { Sql } from "postgres";
import { randomUUID } from "node:crypto";
import { isExpoPushTokenString } from "@gatimitra/contracts";
import { sendFcmV1 } from "../modules/notifications/fcmProvider.js";
import {
  merchantAppOrderHref,
  merchantAppOrdersTabHref,
} from "./merchant-app-deeplink.js";

type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  collapseKey?: string;
  tag?: string;
  playSound?: boolean;
  skipExpo?: boolean;
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

/** Native Android FCM tokens for this store (and parent merchant user). */
export async function getMerchantStoreNativeFcmTokens(
  sql: Sql,
  storeId: number
): Promise<string[]> {
  try {
    const rows = await sql`
      SELECT DISTINCT nd.native_token AS token
      FROM public.native_device_push_tokens nd
      WHERE nd.token_type = 'fcm'
        AND lower(nd.role) = 'merchant'
        AND (
          nd.store_id = ${storeId}
          OR nd.user_id IN (
            SELECT mp.parent_merchant_id::text
            FROM public.merchant_stores ms
            INNER JOIN public.merchant_parents mp ON mp.id = ms.parent_id
            WHERE ms.id = ${storeId}
              AND ms.deleted_at IS NULL
          )
        )
        AND (nd.last_seen_at IS NULL OR nd.last_seen_at >= now() - interval '90 days')
    `;
    return [
      ...new Set(
        (rows as unknown as Array<{ token: string }>)
          .map((r) => String(r.token ?? "").trim())
          .filter((t) => t.length > 0 && !isExpoPushTokenString(t))
      ),
    ];
  } catch {
    return [];
  }
}

function flattenPushData(data: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = { appRole: "merchant" };
  if (!data) return out;
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === "string" ? v : JSON.stringify(v);
  }
  return out;
}

async function sendMerchantNativeFcm(tokens: string[], payload: PushPayload): Promise<void> {
  if (!tokens.length) return;
  const data = flattenPushData(payload.data);
  const deepLink =
    typeof payload.data?.url === "string"
      ? String(payload.data.url)
      : typeof payload.data?.deepLink === "string"
        ? String(payload.data.deepLink)
        : typeof payload.data?.deep_link === "string"
          ? String(payload.data.deep_link)
          : null;
  const isNewOrderAlert = payload.channelId === "merchant_new_orders_alert";
  const playSound = payload.playSound !== false;
  await Promise.all(
    tokens.map((token) =>
      sendFcmV1({
        notificationId: randomUUID(),
        token,
        title: payload.title,
        body: payload.body,
        channelId: payload.channelId ?? "merchant_default",
        sound: isNewOrderAlert ? "notification" : playSound ? "default" : null,
        playSound,
        appRole: "merchant",
        priority: "high",
        collapseKey: payload.collapseKey ?? null,
        tag: payload.tag ?? null,
        data,
        deepLink,
      }).catch(() => ({ ok: false as const }))
    )
  );
}

async function sendMerchantExpoPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (payload.skipExpo) return;
  const expoTokens = tokens.filter((t) => isExpoPushTokenString(t));
  if (!expoTokens.length) return;
  const silent = payload.playSound === false;
  const messages = expoTokens.map((to) => ({
    to,
    sound: payload.channelId === "merchant_new_orders_alert" ? "notification" : silent ? null : "default",
    title: payload.title,
    body: payload.body,
    data: {
      ...(payload.data ?? {}),
      skip_in_app_banner: true,
      appRole: "merchant",
    },
    priority: "high",
    channelId: payload.channelId ?? "merchant_default",
    collapseId: payload.collapseKey ?? undefined,
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
    collapseKey?: string;
    tag?: string;
    playSound?: boolean;
    skipExpo?: boolean;
    /** Skip merchant_store_notifications inbox (push-only). */
    skipInbox?: boolean;
    /** Skip native FCM when another path (notificationService) already fans out. */
    skipNative?: boolean;
  }
): Promise<void> {
  if (!args.skipInbox) {
    await insertMerchantStoreNotification(sql, args);
  }
  const tokens = await getMerchantStorePushTokens(sql, args.storeId);
  const pushPayload: PushPayload = {
    title: args.title,
    body: args.body,
    data: args.pushData,
    channelId: args.channelId,
    collapseKey: args.collapseKey,
    tag: args.tag,
    playSound: args.playSound,
    skipExpo: args.skipExpo,
  };
  await sendMerchantExpoPush(tokens, pushPayload);
  if (args.skipNative) return;
  const nativeTokens = [
    ...new Set([
      ...tokens.filter((t) => !isExpoPushTokenString(t)),
      ...(await getMerchantStoreNativeFcmTokens(sql, args.storeId)),
    ]),
  ];
  await sendMerchantNativeFcm(nativeTokens, pushPayload);
}

async function getMerchantStoreScopedNativeFcmTokens(
  sql: Sql,
  storeId: number
): Promise<string[]> {
  try {
    const rows = await sql`
      SELECT DISTINCT nd.native_token AS token
      FROM public.native_device_push_tokens nd
      WHERE nd.token_type = 'fcm'
        AND lower(nd.role) = 'merchant'
        AND nd.store_id = ${storeId}
        AND (nd.last_seen_at IS NULL OR nd.last_seen_at >= now() - interval '90 days')
    `;
    const scoped = [
      ...new Set(
        (rows as unknown as Array<{ token: string }>)
          .map((r) => String(r.token ?? "").trim())
          .filter((t) => t.length > 0 && !isExpoPushTokenString(t))
      ),
    ];
    if (scoped.length > 0) return scoped;
  } catch {
    /* fall through to parent-scoped tokens */
  }
  return getMerchantStoreNativeFcmTokens(sql, storeId);
}

const STORE_STATUS_FCM_TAG = "merchant-store-status";
const STORE_STATUS_CHANNEL_ID = "merchant_store_status";

type StoreStatusPushState = "ONLINE" | "OUT_OF_TIMINGS" | "RECONNECT";

function withTheStoreName(name: string): string {
  return /^the\s/i.test(name) ? name : `The ${name}`;
}

async function merchantStoreStatusContext(
  sql: Sql,
  storeId: number
): Promise<{ storeName: string | null; merchantId: string | null }> {
  const rows = await sql`
    SELECT ms.store_name AS store_name, mp.parent_merchant_id AS merchant_id
    FROM merchant_stores ms
    LEFT JOIN merchant_parents mp ON mp.id = ms.parent_id
    WHERE ms.id = ${storeId} AND ms.deleted_at IS NULL
    LIMIT 1
  `;
  const row = rows[0] as { store_name?: string | null; merchant_id?: string | null } | undefined;
  const storeName = String(row?.store_name ?? "").trim();
  const merchantId = String(row?.merchant_id ?? "").trim();
  return {
    storeName: storeName.length > 0 ? storeName : null,
    merchantId: merchantId.length > 0 ? merchantId : null,
  };
}

function storeStatusCopy(
  state: StoreStatusPushState,
  storeName: string | null
): { title: string; body: string; url: string; screen: string } {
  if (state === "ONLINE") {
    return {
      title: storeName ? `🟢 ${withTheStoreName(storeName)} is online` : "🟢 Your store is online",
      body: "Waiting for orders",
      url: "/(tabs)/",
      screen: "home",
    };
  }
  if (state === "OUT_OF_TIMINGS") {
    return {
      title: storeName
        ? `🔴 ${withTheStoreName(storeName)} is out of delivery timings`
        : "🔴 Your store is out of delivery timings",
      body: "Go online now to receive orders",
      url: "/restaurant-status",
      screen: "restaurant_status",
    };
  }
  return {
    title: "Reconnect to receive orders",
    body: storeName
      ? `${storeName}: Your device was restarted. Open the app to resume order notifications.`
      : "Your device was restarted. Open the app to resume order notifications.",
    url: "/",
    screen: "home",
  };
}

/**
 * Persistent store-status tray (ONLINE / OUT_OF_TIMINGS / RECONNECT).
 * Native FCM with a stable tag updates in place. Not a NEW_ORDER alert.
 */
export async function notifyMerchantStoreStatus(
  sql: Sql,
  storeId: number,
  state: StoreStatusPushState,
  opts?: { eventId?: string }
): Promise<void> {
  const { storeName, merchantId } = await merchantStoreStatusContext(sql, storeId);
  const copy = storeStatusCopy(state, storeName);
  const eventId = opts?.eventId ?? `STORE_STATUS:${state}:${storeId}:${Date.now()}`;
  const timestamp = new Date().toISOString();
  const nativeTokens = await getMerchantStoreScopedNativeFcmTokens(sql, storeId);
  const expoTokens = nativeTokens.length > 0 ? [] : await getMerchantStorePushTokens(sql, storeId);
  const pushPayload: PushPayload = {
    title: copy.title,
    body: copy.body,
    channelId: STORE_STATUS_CHANNEL_ID,
    collapseKey: `gm_store_status_${storeId}`,
    tag: STORE_STATUS_FCM_TAG,
    playSound: false,
    skipExpo: nativeTokens.length > 0,
    data: {
      type: "STORE_STATUS",
      notificationType: "STORE_STATUS",
      state,
      merchantId: merchantId ?? String(storeId),
      storeId,
      storeName: storeName ?? "",
      eventId,
      timestamp,
      url: copy.url,
      screen: copy.screen,
    },
  };
  console.info(
    `[STORE_STATUS_NOTIFICATION] merchantId=${merchantId ?? ""} storeId=${storeId} storeName=${storeName ?? "Your store"} state=${state} source=FCM notificationId=${STORE_STATUS_FCM_TAG} action=POSTED eventId=${eventId}`
  );
  if (nativeTokens.length > 0) {
    await sendMerchantNativeFcm(nativeTokens, pushPayload);
    return;
  }
  await sendMerchantExpoPush(expoTokens, pushPayload);
}

/** Idle / online reminder when store starts accepting orders — same copy as waiting-for-order inbox. */
export async function notifyMerchantStoreOnline(sql: Sql, storeId: number): Promise<void> {
  const { ensureWaitingForOrderInbox } = await import("./merchant-waiting-for-order.js");
  await ensureWaitingForOrderInbox(storeId);
  // Tray FCM is independent of inbox idempotency — always update the same tag.
  await notifyMerchantStoreStatus(sql, storeId, "ONLINE");
}

async function merchantStoreDisplayName(sql: Sql, storeId: number): Promise<string | null> {
  const { storeName } = await merchantStoreStatusContext(sql, storeId);
  return storeName;
}

/** Outside scheduled delivery slot — opens restaurant status screen. */
export async function notifyMerchantOutsideDeliveryTimings(sql: Sql, storeId: number): Promise<void> {
  const storeName = await merchantStoreDisplayName(sql, storeId);
  const titled = storeName
    ? `🔴 ${withTheStoreName(storeName)} is out of delivery timings`
    : "🔴 Your store is out of delivery timings";
  const body = "Go online now to receive orders";
  const recent = await sql`
    SELECT 1 FROM merchant_store_notifications
    WHERE store_id = ${storeId}
      AND title = ${titled}
      AND created_at > now() - interval '12 hours'
    LIMIT 1
  `;
  if (recent.length === 0) {
    await insertMerchantStoreNotification(sql, {
      storeId,
      type: "store",
      title: titled,
      body,
      actionUrl: "/restaurant-status",
    }).catch(() => undefined);
  }
  await notifyMerchantStoreStatus(sql, storeId, "OUT_OF_TIMINGS");
}

/** Delivery slot is active but store is still offline — prompt merchant to go online. */
/** Delivery slot is active but store is still offline — inbox prompt (not the persistent status tray). */
export async function notifyMerchantGoOnlinePrompt(sql: Sql, storeId: number): Promise<void> {
  const storeName = await merchantStoreDisplayName(sql, storeId);
  const title = storeName
    ? `🔴 ${withTheStoreName(storeName)} is out of delivery timings`
    : "🔴 Your store is out of delivery timings";
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
    channelId: STORE_STATUS_CHANNEL_ID,
    playSound: false,
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
    channelId: "merchant_order_lifecycle",
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
    // CANCELLED already fans out native FCM via MERCHANT_ORDER_CANCELLED.
    skipNative: stage === "CANCELLED",
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
