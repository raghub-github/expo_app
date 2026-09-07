/**
 * Single persistent STORE STATUS notification (not NEW_ORDER).
 *
 * States (only one visible):
 *   ONLINE            🟢 The {store} is online / Waiting for orders
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
export const STORE_STATUS_CHANNEL_ID = "merchant_store_status";
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
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
      showBadge: true,
    });
  } catch {
    /* best-effort */
  }
}

function looksLikeStoreStatusNotification(n: {
  request?: { identifier?: string; content?: { title?: string | null; data?: Record<string, unknown> } };
}): boolean {
  const id = String(n.request?.identifier ?? "");
  if (id === STORE_STATUS_NOTIFICATION_ID || LEGACY_STATUS_IDS.includes(id as (typeof LEGACY_STATUS_IDS)[number])) {
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
  await persistNativeSession({ active: false });
  if (Platform.OS !== "android" || isExpoGo()) return;
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
  if (Platform.OS !== "android" || isExpoGo()) return;
  const storeId = Number(args.storeId);
  if (!Number.isInteger(storeId) || storeId < 1) return;

  const name = sanitizeStoreDisplayName(args.storeName);
  const copy = formatStoreStatusCopy(args.state, name);
  const signature = `${storeId}|${args.state}|${copy.title}|${copy.body}`;
  const eventKey = [args.eventId, args.merchantId, storeId, args.state].filter(Boolean).join(":");
  if (eventKey && eventKey === lastEventKey && !args.force) {
    return;
  }
  if (signature === lastSignature && !args.force && !posting) {
    await persistNativeSession({
      active: true,
      storeId,
      merchantId: args.merchantId,
      storeName: name,
    });
    return;
  }
  if (posting) return;
  posting = true;
  try {
    const Notifications = await loadNotifications();
    await ensureChannel(Notifications);
    await dismissPresentedStoreStatus(Notifications, true);
    await Notifications.scheduleNotificationAsync({
      identifier: STORE_STATUS_NOTIFICATION_ID,
      content: {
        title: copy.title,
        body: copy.body,
        data: {
          type: "STORE_STATUS",
          state: args.state,
          storeId,
          merchantId: args.merchantId ?? "",
          storeName: name ?? "",
          eventId: args.eventId ?? `STORE_STATUS:${args.state}:${storeId}`,
          timestamp: new Date().toISOString(),
          url: copy.url,
          screen: args.state === "OUT_OF_TIMINGS" ? "restaurant_status" : "home",
        },
        color: GatiMitraMerchant.primary,
        sticky: args.state === "ONLINE",
        autoDismiss: args.state !== "ONLINE",
        sound: false,
        ...(Platform.OS === "android" ? { channelId: STORE_STATUS_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    lastSignature = signature;
    lastEventKey = eventKey;
    await persistNativeSession({
      active: true,
      storeId,
      merchantId: args.merchantId,
      storeName: name,
    });
    logStatus({
      merchantId: args.merchantId ?? "",
      storeId,
      storeName: name ?? "Your store",
      state: args.state,
      source: args.source ?? "JS",
      notificationId: STORE_STATUS_NOTIFICATION_ID,
      action: args.source === "APP_START" ? "REPOST_AFTER_APP_START" : "POSTED",
    });
  } catch {
    /* best-effort */
  } finally {
    posting = false;
  }
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
  const outOfTimings =
    !args.isOnline && isOutOfDeliveryTimingsReason(args.statusReason, args.unavailableReason);

  if (args.isOnline) {
    await postStoreStatusNotification({
      state: "ONLINE",
      storeId: args.storeId,
      merchantId: args.merchantId,
      storeName: args.storeName,
      source: args.source ?? "RECONCILE",
      force,
    });
    return;
  }
  if (outOfTimings) {
    await postStoreStatusNotification({
      state: "OUT_OF_TIMINGS",
      storeId: args.storeId,
      merchantId: args.merchantId,
      storeName: args.storeName,
      source: args.source ?? "RECONCILE",
      force,
    });
    if (args.source !== "APP_START") {
      logStatus({
        storeId: args.storeId,
        storeName: sanitizeStoreDisplayName(args.storeName) ?? "Your store",
        state: "OUT_OF_TIMINGS",
        action: "UPDATED",
      });
    }
    return;
  }
  await removeStoreStatusNotification("STORE_OFFLINE");
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
  await postStoreStatusNotification({
    state,
    storeId,
    merchantId: data.merchantId != null ? String(data.merchantId) : null,
    storeName: typeof data.storeName === "string" ? data.storeName : null,
    source: "FCM",
    eventId: data.eventId != null ? String(data.eventId) : null,
  });
}

export function resetStoreStatusNotificationCache(): void {
  lastSignature = "";
  lastEventKey = "";
  posting = false;
}
