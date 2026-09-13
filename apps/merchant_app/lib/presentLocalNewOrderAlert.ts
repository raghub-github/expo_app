/**
 * Local heads-up when Partner is backgrounded (JS alive) but remote FCM did
 * not land. Covers new-order + kitchen lifecycle so shade still rings.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  MERCHANT_NEW_ORDER_CHANNEL_ID,
  MERCHANT_NEW_ORDER_SOUND,
} from "@/lib/merchantNewOrderChannel";
import { merchantHomeNewOrdersHref } from "@/lib/merchantNavigation";
import { GatiMitraMerchant } from "@/constants/theme";

const presentedKeys = new Set<string>();

function isExpoGo(): boolean {
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
  return true;
}

export function rememberRemoteNewOrderAlertPresented(orderId: string | null | undefined): void {
  const id = String(orderId ?? "").trim();
  if (id) rememberKey(`new:${id}`);
}

export function rememberRemoteLifecycleAlertPresented(
  orderId: string | null | undefined,
  stage: string | null | undefined
): void {
  const id = String(orderId ?? "").trim();
  const st = String(stage ?? "").trim().toUpperCase();
  if (id && st) rememberKey(`life:${id}:${st}`);
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

export async function presentLocalNewOrderAlert(args: {
  orderId: string;
  displayId?: string | null;
  storeId?: number | null;
}): Promise<boolean> {
  if (Platform.OS !== "android" || isExpoGo()) return false;
  const orderId = String(args.orderId ?? "").trim();
  if (!orderId || !rememberKey(`new:${orderId}`)) return false;

  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setNotificationChannelAsync(MERCHANT_NEW_ORDER_CHANNEL_ID, {
      name: "New order alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: "#3EB489",
      sound: MERCHANT_NEW_ORDER_SOUND,
      bypassDnd: false,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
    });

    const display = String(args.displayId ?? orderId).trim() || orderId;
    const href = merchantHomeNewOrdersHref();
    await Notifications.scheduleNotificationAsync({
      identifier: `merchant-new-order-${orderId}`,
      content: {
        title: "🔔 New Order Received",
        body: `Order #${display} is waiting for your acceptance.`,
        sound: MERCHANT_NEW_ORDER_SOUND,
        color: GatiMitraMerchant.primary,
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: "merchant_new_order",
          event: "NEW_ORDER",
          template_code: "MERCHANT_NEW_ORDER",
          gmType: "MERCHANT_NEW_ORDER",
          foodOrderId: orderId,
          orderId,
          orderShortId: display,
          storeId: args.storeId ?? "",
          url: href,
          screen: "new_order",
          skip_in_app_banner: true,
          refreshLiveOrders: true,
          alertStartedAt: String(Date.now()),
          alertSessionId: `MERCHANT_NEW_ORDER:${orderId}:${args.storeId ?? ""}`,
          localFallback: true,
        },
        ...(Platform.OS === "android" ? { channelId: MERCHANT_NEW_ORDER_CHANNEL_ID } : {}),
      },
      trigger: null,
    });
    return true;
  } catch {
    presentedKeys.delete(`new:${orderId}`);
    return false;
  }
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
}): Promise<boolean> {
  if (Platform.OS !== "android" || isExpoGo()) return false;
  const orderId = String(args.orderId ?? "").trim();
  const stage = String(args.stage ?? "").trim().toUpperCase();
  if (!orderId || !stage) return false;
  if (!rememberKey(`life:${orderId}:${stage}`)) return false;

  try {
    const Notifications = await import("expo-notifications");
    await ensureLifecycleChannel(Notifications);
    const display = String(args.displayId ?? orderId).trim() || orderId;
    const copy = lifecycleCopy(stage, display);
    const url = `/order/${orderId}`;
    await Notifications.scheduleNotificationAsync({
      identifier: `merchant-lifecycle-${orderId}-${stage}`,
      content: {
        title: copy.title,
        body: copy.body,
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
