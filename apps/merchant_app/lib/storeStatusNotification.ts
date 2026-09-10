/**
 * Single persistent STORE STATUS notification (not NEW_ORDER).
 *
 * States (only one visible):
 *   ONLINE            🟢 The {store} is online / Waiting for orders OR Prep·Ready·Out
 *   OUT_OF_TIMINGS    🔴 The {store} is out of delivery timings / Go online now…
 *   RECONNECT         Reconnect to receive orders / device was restarted…
 *
 * Same Android identifier is reused so updates replace instead of stacking.
 * Clearing the tray item never changes backend store availability.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import { GatiMitraMerchant } from "@/constants/theme";

export const STORE_STATUS_NOTIFICATION_ID = "merchant-store-status";
/** v2 — Android channels are immutable; v1 may have been created too quiet to show. */
export const STORE_STATUS_CHANNEL_ID = "merchant_store_status_v2";
export const STORE_STATUS_SESSION_FILE = "merchant_store_status_session.json";

/** Legacy kitchen / online / boot ids — always dismiss so only one status row exists. */
const LEGACY_STATUS_IDS = [
  "merchant-live-orders-ongoing",
  "merchant-store-online-status",
] as const;

export type StoreStatusNotifState = "ONLINE" | "OUT_OF_TIMINGS" | "RECONNECT";

export type StoreStatusNotifArgs = {
  state: StoreStatusNotifState;
  storeId: number;
  merchantId?: string | null;
  storeName?: string | null;
  source?: string;
  eventId?: string | null;
  force?: boolean;
  /** When ONLINE: kitchen progress body (else default "Waiting for orders"). */
  bodyOverride?: string | null;
};

const OUT_OF_TIMINGS_REASONS = new Set([
  "outside_operating_hours",
  "schedule_closed",
  "schedule_expired",
  "schedule_end_timeout",
]);

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

/** Local tray sticky works in Expo Go; remote FCM does not. */
function canPostLocalStoreStatus(): boolean {
  return Platform.OS === "android";
}

function logStatus(fields: Record<string, string | number | boolean | null | undefined>): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v ?? ""}`);
  console.log(`[STORE_STATUS_NOTIFICATION] ${parts.join(" ")}`);
}

/** Never reuse another merchant's name. Empty → generic copy, never a fake restaurant. */
export function sanitizeStoreDisplayName(raw: string | null | undefined): string | null {
  const name = String(raw ?? "").trim();
  return name.length > 0 ? name : null;
}

function withThe(name: string): string {
  return /^the\s/i.test(name) ? name : `The ${name}`;
}

export function formatStoreStatusCopy(
  state: StoreStatusNotifState,
  storeName: string | null | undefined
): { title: string; body: string; url: string } {
  const name = sanitizeStoreDisplayName(storeName);
  if (state === "ONLINE") {
    return {
      title: name ? `🟢 ${withThe(name)} is online` : "🟢 Your store is online",
      body: "Waiting for orders",
      url: "/(tabs)/",
    };
  }
  if (state === "OUT_OF_TIMINGS") {
    return {
      title: name
        ? `🔴 ${withThe(name)} is out of delivery timings`
        : "🔴 Your store is out of delivery timings",
      body: "Go online now to receive orders",
      url: "/restaurant-status",
    };
  }
  return {
    title: "Reconnect to receive orders",
    body: name
      ? `${name}: Your device was restarted. Open the app to resume order notifications.`
      : "Your device was restarted. Open the app to resume order notifications.",
    url: "/",
  };
}

export function isStoreStatusPushData(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const t = String(data.type ?? data.notificationType ?? data.event ?? "").toUpperCase();
  return (
    t === "STORE_STATUS" ||
    t === "STORE_ONLINE" ||
    t === "STORE_OUT_OF_TIMINGS" ||
    t === "STORE_RECONNECT_REQUIRED" ||
    t === "MERCHANT_OUTSIDE_DELIVERY" ||
    t === "MERCHANT_GO_ONLINE"
  );
}

export function storeStatusStateFromPush(
  data: Record<string, unknown>
): StoreStatusNotifState | null {
  const state = String(data.state ?? "").toUpperCase();
  if (state === "ONLINE" || state === "WAITING_FOR_ORDERS") return "ONLINE";
  if (state === "OUT_OF_TIMINGS" || state === "OUT_OF_DELIVERY_TIMINGS") return "OUT_OF_TIMINGS";
  if (state === "RECONNECT" || state === "RECONNECT_REQUIRED") return "RECONNECT";
  const t = String(data.type ?? data.notificationType ?? data.event ?? "").toLowerCase();
  if (t === "store_online") return "ONLINE";
  if (t === "merchant_outside_delivery" || t === "merchant_go_online" || t === "store_out_of_timings") {
    return "OUT_OF_TIMINGS";
  }
  if (t === "store_reconnect_required") return "RECONNECT";
  return null;
}

export function isOutOfDeliveryTimingsReason(
  statusReason?: string | null,
  unavailableReason?: string | null
): boolean {
  const a = String(statusReason ?? "").trim().toLowerCase();
  const b = String(unavailableReason ?? "").trim().toLowerCase();
  return OUT_OF_TIMINGS_REASONS.has(a) || OUT_OF_TIMINGS_REASONS.has(b);
}

function sessionUri(): string {
  const base = FileSystem.documentDirectory ?? "";
  return `${base}${STORE_STATUS_SESSION_FILE}`;
}

async function persistNativeSession(args: {
  active: boolean;
  storeId?: number | null;
  merchantId?: string | null;
  storeName?: string | null;
}): Promise<void> {
  try {
    if (!args.active) {
      await FileSystem.deleteAsync(sessionUri(), { idempotent: true });
      return;
    }
    const payload = JSON.stringify({
      active: true,
      storeId: args.storeId ?? null,
      merchantId: args.merchantId ?? null,
      storeName: sanitizeStoreDisplayName(args.storeName),
      updatedAt: Date.now(),
    });
    await FileSystem.writeAsStringAsync(sessionUri(), payload);
  } catch {
    /* native boot helper reads this file; failure is non-fatal */
  }
}

let lastSignature = "";
let lastEventKey = "";
let posting = false;
let pendingPost: StoreStatusNotifArgs | null = null;
/** Last ONLINE kitchen body — used so FCM "Waiting" does not wipe live progress. */
let lastOnlineKitchenBody = "";

async function loadNotifications() {
  return import("expo-notifications");
}

async function ensureChannel(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync(STORE_STATUS_CHANNEL_ID, {
      name: "Store status",
      // HIGH — shade must stay visible for Waiting / Prep·Ready·Out while open.
      importance: Notifications.AndroidImportance.HIGH,
      sound: undefined,
      enableVibrate: false,
      showBadge: true,
      bypassDnd: false,
    });
  } catch {
    /* best-effort */
  }
}

async function ensureNotificationPermission(
  Notifications: typeof import("expo-notifications")
): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const next = await Notifications.requestPermissionsAsync();
    return Boolean(next.granted);
  } catch {
    return false;
  }
}

async function isStoreStatusPresented(
  Notifications: typeof import("expo-notifications")
): Promise<boolean> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    return presented.some((n) => {
      const id = String(n.request?.identifier ?? "");
      if (id === STORE_STATUS_NOTIFICATION_ID) return true;
      return looksLikeStoreStatusNotification(n);
    });
  } catch {
    return false;
  }
}

function looksLikeStoreStatusNotification(n: {
  request?: {
    identifier?: string;
    content?: { title?: string | null; data?: Record<string, unknown> };
  };
}): boolean {
  const id = String(n.request?.identifier ?? "");
  if (
    id === STORE_STATUS_NOTIFICATION_ID ||
    LEGACY_STATUS_IDS.includes(id as (typeof LEGACY_STATUS_IDS)[number])
  ) {
    return true;
  }
  const data = n.request?.content?.data ?? {};
  if (isStoreStatusPushData(data)) return true;
  const title = String(n.request?.content?.title ?? "");
  return (
    /is online/i.test(title) ||
    /out of delivery timings/i.test(title) ||
    /reconnect to receive orders/i.test(title)
  );
}

async function dismissPresentedStoreStatus(
  Notifications: typeof import("expo-notifications"),
  keepCurrent = false
): Promise<void> {
  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const id = n.request?.identifier;
      if (!id) continue;
      if (keepCurrent && id === STORE_STATUS_NOTIFICATION_ID) continue;
      if (looksLikeStoreStatusNotification(n)) {
        try {
          await Notifications.dismissNotificationAsync(id);
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
  for (const id of LEGACY_STATUS_IDS) {
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch {
      /* ignore */
    }
  }
}

export async function removeStoreStatusNotification(reason: string): Promise<void> {
  lastSignature = "";
  lastEventKey = "";
  lastOnlineKitchenBody = "";
  pendingPost = null;
  await persistNativeSession({ active: false });
  if (!canPostLocalStoreStatus()) return;
  try {
    const Notifications = await loadNotifications();
    await Notifications.dismissNotificationAsync(STORE_STATUS_NOTIFICATION_ID);
    await dismissPresentedStoreStatus(Notifications, false);
    logStatus({ action: "REMOVED", reason });
  } catch {
    /* best-effort */
  }
}

export async function postStoreStatusNotification(args: StoreStatusNotifArgs): Promise<void> {
  if (!canPostLocalStoreStatus()) return;
  const storeId = Number(args.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  // Never drop a kitchen progress update while another post is in flight.
  if (posting) {
    pendingPost = args;
    return;
  }

  const name = sanitizeStoreDisplayName(args.storeName);
  const copy = formatStoreStatusCopy(args.state, name);
  // Never schedule a blank shade row (Android may show icon-only sticky).
  const title = String(copy.title ?? "").trim() || "🟢 Your store is online";
  let body =
    args.state === "ONLINE" && typeof args.bodyOverride === "string" && args.bodyOverride.trim()
      ? args.bodyOverride.trim()
      : copy.body;
  body = String(body ?? "").trim() || "Waiting for orders";

  // FCM / bare ONLINE must not wipe Prep·Ready·Out with "Waiting for orders".
  if (
    args.state === "ONLINE" &&
    !(typeof args.bodyOverride === "string" && args.bodyOverride.trim()) &&
    body === "Waiting for orders" &&
    lastOnlineKitchenBody &&
    lastOnlineKitchenBody !== "Waiting for orders"
  ) {
    body = lastOnlineKitchenBody;
  }

  const hasKitchenProgress =
    args.state === "ONLINE" &&
    body !== "Waiting for orders" &&
    /preparing|ready|out|new/i.test(body);
  const url = hasKitchenProgress ? "/(tabs)/orders?tab=active" : copy.url;
  const signature = `${storeId}|${args.state}|${title}|${body}`;
  const eventKey = [args.eventId, args.merchantId, storeId, args.state].filter(Boolean).join(":");

  posting = true;
  try {
    const Notifications = await loadNotifications();
    const permitted = await ensureNotificationPermission(Notifications);
    if (!permitted) {
      logStatus({
        storeId,
        action: "SKIPPED",
        reason: "NOTIFICATION_PERMISSION_DENIED",
        source: args.source ?? "JS",
      });
      return;
    }

    // Clearing the tray must NOT auto-repost the SAME notification (§4/§23) — a dismissed tray is a
    // user action, not a new event. So `!stillVisible` no longer forces a re-post; only an explicit
    // caller `force` (a genuine new transition/session or a real kitchen-body change) does.
    const force = args.force === true;
    if (eventKey && eventKey === lastEventKey && !force) {
      return;
    }
    if (signature === lastSignature && !force) {
      await persistNativeSession({
        active: true,
        storeId,
        merchantId: args.merchantId,
        storeName: name,
      });
      return;
    }

    await ensureChannel(Notifications);
    await dismissPresentedStoreStatus(Notifications, true);
    await Notifications.scheduleNotificationAsync({
      identifier: STORE_STATUS_NOTIFICATION_ID,
      content: {
        title,
        body,
        data: {
          type: "STORE_STATUS",
          state: args.state,
          storeId,
          merchantId: args.merchantId ?? "",
          storeName: name ?? "",
          eventId: args.eventId ?? `STORE_STATUS:${args.state}:${storeId}`,
          timestamp: new Date().toISOString(),
          url,
          screen: args.state === "OUT_OF_TIMINGS" ? "restaurant_status" : "home",
          kitchenBody: args.state === "ONLINE" ? body : "",
        },
        color: GatiMitraMerchant.primary,
        sticky: args.state === "ONLINE",
        autoDismiss: args.state !== "ONLINE",
        sound: undefined,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" ? { channelId: STORE_STATUS_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    lastSignature = signature;
    lastEventKey = eventKey;
    if (args.state === "ONLINE") {
      lastOnlineKitchenBody = body;
    } else {
      lastOnlineKitchenBody = "";
    }
    await persistNativeSession({
      active: true,
      storeId,
      merchantId: args.merchantId,
      storeName: name,
    });

    // Verify shade row exists — Android sometimes drops the first schedule.
    const visible = await isStoreStatusPresented(Notifications);
    if (!visible) {
      await Notifications.scheduleNotificationAsync({
        identifier: STORE_STATUS_NOTIFICATION_ID,
        content: {
          title,
          body,
          data: {
            type: "STORE_STATUS",
            state: args.state,
            storeId,
            merchantId: args.merchantId ?? "",
            storeName: name ?? "",
            eventId: args.eventId ?? `STORE_STATUS:${args.state}:${storeId}:retry`,
            timestamp: new Date().toISOString(),
            url,
            screen: args.state === "OUT_OF_TIMINGS" ? "restaurant_status" : "home",
            kitchenBody: args.state === "ONLINE" ? body : "",
          },
          color: GatiMitraMerchant.primary,
          sticky: args.state === "ONLINE",
          autoDismiss: args.state !== "ONLINE",
          sound: undefined,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          ...(Platform.OS === "android" ? { channelId: STORE_STATUS_CHANNEL_ID } : {}),
        },
        trigger: null,
      });
      logStatus({
        storeId,
        action: "REPOST_AFTER_MISS",
        source: args.source ?? "JS",
        bodyPreview: body.slice(0, 80),
      });
    }

    logStatus({
      merchantId: args.merchantId ?? "",
      storeId,
      storeName: name ?? "Your store",
      state: args.state,
      source: args.source ?? "JS",
      notificationId: STORE_STATUS_NOTIFICATION_ID,
      action: args.source === "APP_START" ? "REPOST_AFTER_APP_START" : "POSTED",
      bodyPreview: body.slice(0, 80),
      expoGo: isExpoGo() ? 1 : 0,
    });
  } catch (err) {
    logStatus({
      storeId,
      action: "ERROR",
      source: args.source ?? "JS",
      reason: err instanceof Error ? err.message.slice(0, 120) : "POST_FAILED",
    });
  } finally {
    posting = false;
    const next = pendingPost;
    pendingPost = null;
    if (next) {
      void postStoreStatusNotification({ ...next, force: true });
    }
  }
}

/**
 * Update ONLINE sticky body with kitchen progress / Waiting for orders.
 */
export async function updateOnlineStoreStatusKitchenBody(args: {
  storeId: number;
  storeName?: string | null;
  merchantId?: string | null;
  body: string;
  force?: boolean;
}): Promise<void> {
  const storeId = Number(args.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;
  const body = String(args.body ?? "").trim() || "Waiting for orders";
  await postStoreStatusNotification({
    state: "ONLINE",
    storeId,
    merchantId: args.merchantId,
    storeName: args.storeName,
    source: "KITCHEN_PROGRESS",
    bodyOverride: body,
    force: args.force === true,
    eventId: `KITCHEN:${storeId}:${body.slice(0, 48)}`,
  });
}

/**
 * App launch / store-status refresh. Does not treat a missing tray item as OFFLINE.
 */
export async function reconcileStoreStatusNotification(args: {
  authenticated: boolean;
  storeId: number | null;
  merchantId?: string | null;
  storeName?: string | null;
  isOnline: boolean;
  statusReason?: string | null;
  unavailableReason?: string | null;
  source?: string;
}): Promise<void> {
  if (!args.authenticated || args.storeId == null) {
    await removeStoreStatusNotification(args.authenticated ? "NO_STORE" : "LOGOUT");
    return;
  }
  const force = args.source === "APP_START" || args.source === "APP_RESUME";

  if (args.isOnline) {
    await postStoreStatusNotification({
      state: "ONLINE",
      storeId: args.storeId,
      merchantId: args.merchantId,
      storeName: args.storeName,
      source: args.source ?? "RECONCILE",
      force,
      ...(lastOnlineKitchenBody ? { bodyOverride: lastOnlineKitchenBody } : {}),
    });
    return;
  }

  // Any offline (manual / schedule / out of hours) → Zomato offline tray.
  // Never silently remove the shade item while the merchant is logged in.
  await postStoreStatusNotification({
    state: "OUT_OF_TIMINGS",
    storeId: args.storeId,
    merchantId: args.merchantId,
    storeName: args.storeName,
    source: args.source ?? "RECONCILE",
    force: true,
  });
  if (args.source !== "APP_START") {
    logStatus({
      storeId: args.storeId,
      storeName: sanitizeStoreDisplayName(args.storeName) ?? "Your store",
      state: "OUT_OF_TIMINGS",
      action: "UPDATED",
      reason: args.statusReason ?? args.unavailableReason ?? "STORE_OFFLINE",
    });
  }
}

export async function applyStoreStatusFromPush(
  data: Record<string, unknown>,
  opts?: { expectedStoreId?: number | null }
): Promise<void> {
  if (!isStoreStatusPushData(data)) return;
  const state = storeStatusStateFromPush(data);
  if (!state) return;
  const storeId = Number(data.storeId ?? data.store_id ?? 0);
  if (!Number.isInteger(storeId) || storeId < 1) return;
  const expected = opts?.expectedStoreId;
  if (expected != null && Number(expected) !== storeId) {
    logStatus({
      storeId,
      expectedStoreId: expected,
      action: "IGNORED",
      reason: "STORE_MISMATCH",
    });
    return;
  }
  const pushState = String(data.state ?? "").toUpperCase();
  if (pushState === "OFFLINE") {
    await removeStoreStatusNotification("SERVER_OFFLINE");
    return;
  }
  // Already ONLINE with kitchen progress — do not let a bare FCM "Waiting"
  // (missing counts) overwrite live Prep/Ready/Out. Explicit zero counts may.
  const pushActiveRaw = data.activeOrdersCount ?? data.active_orders_count;
  const pushActive =
    typeof pushActiveRaw === "number"
      ? pushActiveRaw
      : Number.isFinite(Number(pushActiveRaw))
        ? Number(pushActiveRaw)
        : null;
  const stageNum = (...keys: string[]) => {
    for (const k of keys) {
      const n = Number(data[k]);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    return 0;
  };
  const stageSum =
    stageNum("preparing") +
    stageNum("ready") +
    stageNum("outForDelivery", "out_for_delivery") +
    stageNum("pendingAccept", "pending_accept");
  const hasExplicitCounts =
    data.activeOrdersCount != null ||
    data.active_orders_count != null ||
    data.preparing != null ||
    data.ready != null ||
    data.outForDelivery != null ||
    data.out_for_delivery != null ||
    data.pendingAccept != null ||
    data.pending_accept != null;
  const pushSaysIdle =
    (pushActive != null && pushActive <= 0) ||
    (hasExplicitCounts && stageSum === 0) ||
    (typeof data.kitchenBody === "string" &&
      /waiting for orders/i.test(data.kitchenBody));
  const kitchenBodyFromPush =
    typeof data.kitchenBody === "string" && data.kitchenBody.trim()
      ? data.kitchenBody.trim()
      : null;

  if (
    state === "ONLINE" &&
    !pushSaysIdle &&
    !kitchenBodyFromPush &&
    lastOnlineKitchenBody &&
    lastOnlineKitchenBody !== "Waiting for orders" &&
    lastSignature.startsWith(`${storeId}|ONLINE|`)
  ) {
    logStatus({
      storeId,
      action: "IGNORED",
      reason: "KEEP_KITCHEN_PROGRESS",
    });
    return;
  }

  const bodyOverride =
    kitchenBodyFromPush ??
    (pushSaysIdle
      ? "Waiting for orders"
      : state === "ONLINE" && lastOnlineKitchenBody
        ? lastOnlineKitchenBody
        : null);

  await postStoreStatusNotification({
    state,
    storeId,
    merchantId: data.merchantId != null ? String(data.merchantId) : null,
    storeName: typeof data.storeName === "string" ? data.storeName : null,
    source: "FCM",
    eventId: data.eventId != null ? String(data.eventId) : null,
    force: pushSaysIdle === true || state !== "ONLINE",
    ...(state === "ONLINE" && bodyOverride ? { bodyOverride } : {}),
  });
}

export function resetStoreStatusNotificationCache(): void {
  lastSignature = "";
  lastEventKey = "";
  posting = false;
  pendingPost = null;
  lastOnlineKitchenBody = "";
}
