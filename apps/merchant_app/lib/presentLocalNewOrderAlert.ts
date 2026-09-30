/**
 * Local heads-up helpers for merchant new-order / lifecycle alerts.
 *
 * Production / dev client: backend FCM owns the OS tray. Prefer not to schedule
 * locals there (duplicates). Expo Go (SDK 53+): remote push is unavailable, so
 * board/realtime → local notification + default sound is the only tray path.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  claimPushPresented,
  rememberPushPresented,
  wasPushPresented,
  pushPresentationKey,
} from "@gatimitra/expo-push-kit";
import { GatiMitraMerchant } from "@/constants/theme";

const presentedKeys = new Set<string>();

export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === "expo";
}

function rememberKey(key: string): boolean {
  const k = String(key ?? "").trim();
  if (!k || presentedKeys.has(k)) return false;
  presentedKeys.add(k);
  if (presentedKeys.size > 120) {
    const first = presentedKeys.values().next().value;
    if (first) presentedKeys.delete(first);
  }
  rememberPushPresented(k);
  return true;
}

export function rememberRemoteNewOrderAlertPresented(orderId: string | null | undefined): void {
  const id = String(orderId ?? "").trim();
  if (!id) return;
  const key = `new:${id}`;
  presentedKeys.add(key);
  rememberPushPresented(key);
  rememberPushPresented(
    pushPresentationKey({ templateCode: "MERCHANT_NEW_ORDER", orderId: id })
  );
}

export function rememberRemoteLifecycleAlertPresented(
  orderId: string | null | undefined,
  stage: string | null | undefined
): void {
  const id = String(orderId ?? "").trim();
  const st = String(stage ?? "").trim().toUpperCase();
  if (!id || !st) return;
  const key = `life:${id}:${st}`;
  presentedKeys.add(key);
  rememberPushPresented(key);
}

/** Seed dedupe from OS tray so resume after FCM does not schedule a twin local alert. */
export async function syncPresentedAlertsFromOsTray(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const Notifications = await import("expo-notifications");
    const presented = await Notifications.getPresentedNotificationsAsync();
    for (const n of presented) {
      const data = (n.request?.content?.data ?? {}) as Record<string, unknown>;
      const foodId = String(data.foodOrderId ?? data.orderId ?? "").trim();
      const type = String(data.type ?? data.event ?? data.gmType ?? "").toLowerCase();
      const nid =
        typeof data.notification_id === "string"
          ? data.notification_id
          : typeof data.notificationId === "string"
            ? data.notificationId
            : null;
      if (nid) rememberPushPresented(pushPresentationKey({ notificationId: nid }));
      if (
        foodId &&
        (type.includes("new_order") ||
          type === "merchant_new_order" ||
          String(data.template_code ?? "").toUpperCase() === "MERCHANT_NEW_ORDER")
      ) {
        rememberRemoteNewOrderAlertPresented(foodId);
      }
      const stage = String(data.stage ?? "").trim().toUpperCase();
      if (foodId && stage) rememberRemoteLifecycleAlertPresented(foodId, stage);
    }
  } catch {
    /* best-effort */
  }
}

async function ensureLifecycleChannel(
  Notifications: typeof import("expo-notifications")
): Promise<void> {
  await Notifications.setNotificationChannelAsync("merchant_order_lifecycle", {
    name: "Order updates",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3EB489",
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    enableVibrate: true,
  });
}

/**
 * Schedule a heads-up new-order local notification.
 * Expo Go: default OS sound (no bundled Partner wav / FCM).
 * Native builds: MAX channel + bundled `notification` sound + DND bypass.
 */
export async function presentLocalNewOrderAlert(_args: {
  orderId: string;
  displayId?: string | null;
  storeId?: number | null;
}): Promise<boolean> {
  // The store-status row ("N new") is the only new-order tray alert.
  return false;
}

function lifecycleCopy(
  stage: string,
  displayId: string
): { title: string; body: string } {
  const id = displayId.startsWith("#") ? displayId : `#${displayId}`;
  const s = stage.toUpperCase();
  if (s === "CANCELLED") {
    return { title: `Order ${id} cancelled`, body: "Order was cancelled. Tap to view." };
  }
  if (s === "READY" || s === "READY_FOR_PICKUP") {
    return { title: `Order ${id} is ready`, body: "Ready for pickup — tap to view" };
  }
  if (s === "OUT_FOR_DELIVERY" || s === "PICKED_UP" || s === "HANDED_OVER") {
    return {
      title: `Order ${id} handed over`,
      body: "Handed over to delivery partner — tap to view",
    };
  }
  if (s === "IN_TRANSIT" || s === "DISPATCHED") {
    return { title: `Order ${id} out for delivery`, body: "On the way to customer — tap to view" };
  }
  if (s === "DELIVERED" || s === "COMPLETED") {
    return { title: `Order ${id} delivered`, body: "Tap to view this order" };
  }
  return { title: `Order ${id} is preparing`, body: "Kitchen started — tap to view" };
}

export async function presentLocalLifecycleAlert(args: {
  orderId: string;
  displayId?: string | null;
  stage: string;
  storeId?: number | null;
  reason?: string | null;
}): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const orderId = String(args.orderId ?? "").trim();
  const stage = String(args.stage ?? "").trim().toUpperCase();
  if (!orderId || !stage) return false;

  await syncPresentedAlertsFromOsTray();

  const key = `life:${orderId}:${stage}`;
  if (!claimPushPresented(key)) return false;
  if (!rememberKey(key)) return false;

  try {
    const Notifications = await import("expo-notifications");
    await ensureLifecycleChannel(Notifications);
    const display = String(args.displayId ?? orderId).trim() || orderId;
    const copy = lifecycleCopy(stage, display);
    const why = (args.reason ?? "").trim();
    const body =
      stage === "CANCELLED" && why ? why : copy.body;
    const url = `/order/${orderId}`;
    await Notifications.scheduleNotificationAsync({
      identifier: `merchant-lifecycle-${orderId}-${stage}`,
      content: {
        title: copy.title,
        body,
        sound: "default",
        color: GatiMitraMerchant.primary,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: {
          type: "merchant_order_lifecycle",
          stage,
          foodOrderId: orderId,
          orderId: display,
          url,
          refreshLiveOrders: true,
          localFallback: true,
          storeId: args.storeId ?? "",
        },
        ...(Platform.OS === "android" ? { channelId: "merchant_order_lifecycle" } : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    presentedKeys.delete(`life:${orderId}:${stage}`);
    return false;
  }
}
