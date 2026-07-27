/**
 * Zomato-style live progress — one sticky Android notification per active trip.
 * Supports food, person-ride, and parcel. Updates in place (progress bar) instead
 * of stacking shade rows.
 *
 * Driven by:
 *   1) activeOrders in orderStore (hydration + polling)
 *   2) push metadata with gmLiveProgress (backend lifecycle templates)
 */

import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import Constants from "expo-constants";
import { useOrderStore, type ActiveOrder, type ActiveOrderService } from "@/store/orderStore";
import { GatiMitraColors } from "@/constants/gatimitra";

const CHANNEL_ID = "customer_live_order";
const BAR_LEN = 10;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function ongoingId(orderId: string): string {
  return `customer-live-order-${orderId}`;
}

function progressBar(step: number, steps: number): string {
  const filled = Math.max(0, Math.min(BAR_LEN, Math.round((step / Math.max(1, steps)) * BAR_LEN)));
  return `${"█".repeat(filled)}${"░".repeat(BAR_LEN - filled)}`;
}

type LiveUi = {
  title: string;
  body: string;
  step: number;
  steps: number;
  terminal?: boolean;
};

function liveUiFood(order: ActiveOrder): LiveUi {
  const s = String(order.status ?? "").toUpperCase();
  const eta = order.etaMinutes > 0 ? order.etaMinutes : null;
  const store = order.storeName?.trim() || "Store";

  if (s === "DELIVERED") {
    return { title: "Delivered", body: "Enjoy your meal!", step: 5, steps: 5, terminal: true };
  }
  if (s === "CANCELLED") {
    return { title: "Order cancelled", body: "This order was cancelled", step: 0, steps: 5, terminal: true };
  }
  if (s === "REACHED_CUSTOMER" || s === "ARRIVED" || s === "AT_CUSTOMER") {
    return { title: "Nearby", body: "Rider is almost there", step: 4, steps: 5 };
  }
  if (
    s === "OUT_FOR_DELIVERY" ||
    s === "ON_THE_WAY" ||
    s === "PICKED_UP" ||
    s === "IN_TRANSIT" ||
    s === "DISPATCHED"
  ) {
    return {
      title: "On The Way",
      body: eta != null ? `Arriving in ${eta} mins` : "Your order is on the way",
      step: 3,
      steps: 5,
    };
  }
  if (s === "RIDER_AT_PICKUP" || s === "REACHED_STORE" || s === "AT_STORE") {
    return { title: "Ready for Pickup", body: "Rider at the store", step: 2, steps: 5 };
  }
  if (s === "READY_FOR_PICKUP" || s === "READY" || s === "RIDER_ASSIGNED" || s === "ASSIGNED") {
    return { title: "Ready for Pickup", body: "Rider arriving at store", step: 2, steps: 5 };
  }
  if (s === "PREPARING" || s === "ACCEPTED") {
    return {
      title: "Preparing Your Order",
      body: eta != null ? `Preparing • ${eta} mins` : `${store} is preparing your order`,
      step: 1,
      steps: 5,
    };
  }
  if (s === "ORDER_PLACED" || s === "CREATED" || s === "PLACED") {
    return { title: "Order placed", body: "Waiting for store confirmation", step: 1, steps: 5 };
  }
  return {
    title: "Tracking your order",
    body: eta != null ? `ETA ${eta} mins` : "Tap to open tracking",
    step: 1,
    steps: 5,
  };
}

function liveUiRide(order: ActiveOrder): LiveUi {
  const s = String(order.status ?? "").toUpperCase();
  const eta = order.etaMinutes > 0 ? order.etaMinutes : null;

  if (s === "DELIVERED" || s === "COMPLETED") {
    return { title: "Ride Completed", body: "Please rate your rider", step: 6, steps: 6, terminal: true };
  }
  if (s === "CANCELLED") {
    return { title: "Ride cancelled", body: "This trip was cancelled", step: 0, steps: 6, terminal: true };
  }
  if (s === "REACHED_CUSTOMER" || s === "NEAR_DESTINATION" || s === "AT_DROP") {
    return { title: "Approaching Destination", body: "Almost there — check belongings", step: 5, steps: 6 };
  }
  if (s === "RIDE_IN_PROGRESS" || s === "PICKED_UP" || s === "IN_TRANSIT" || s === "STARTED") {
    return {
      title: "Trip Started",
      body: eta != null ? `On trip · ${eta} mins` : "Have a safe ride",
      step: 4,
      steps: 6,
    };
  }
  if (
    s === "RIDER_AT_PICKUP" ||
    s === "REACHED_USER" ||
    s === "PICKUP_OTP_VERIFIED" ||
    s === "AT_PICKUP"
  ) {
    return { title: "Rider Has Arrived", body: "Meet your rider to begin", step: 3, steps: 6 };
  }
  if (s === "RIDER_WAITING_FOR_OTP" || s === "REACHED_STORE" || s === "NEAR_PICKUP") {
    return { title: "Rider Nearby", body: "Be ready at the pickup location", step: 2, steps: 6 };
  }
  if (
    s === "ACCEPTED" ||
    s === "ASSIGNED" ||
    s === "RIDER_ASSIGNED" ||
    s === "OUT_FOR_DELIVERY"
  ) {
    return {
      title: "Ride Accepted",
      body: eta != null ? `Captain arriving · ${eta} mins` : "Captain is on the way",
      step: 1,
      steps: 6,
    };
  }
  if (s === "SEARCHING_RIDER" || s === "ORDER_PLACED" || s === "CREATED" || s === "PLACED") {
    return { title: "Finding a captain", body: "Hang tight — matching nearby riders", step: 1, steps: 6 };
  }
  return {
    title: "Tracking your ride",
    body: eta != null ? `ETA ${eta} mins` : "Tap to open tracking",
    step: 1,
    steps: 6,
  };
}

function liveUiParcel(order: ActiveOrder): LiveUi {
  const s = String(order.status ?? "").toUpperCase();
  const eta = order.etaMinutes > 0 ? order.etaMinutes : null;

  if (s === "DELIVERED") {
    return { title: "Parcel Delivered", body: "Delivered successfully", step: 5, steps: 5, terminal: true };
  }
  if (s === "CANCELLED") {
    return { title: "Parcel cancelled", body: "This parcel was cancelled", step: 0, steps: 5, terminal: true };
  }
  if (s === "REACHED_CUSTOMER" || s === "ARRIVED" || s === "AT_CUSTOMER" || s === "AT_DROP") {
    return { title: "Rider Nearby", body: "Please be ready for handover", step: 4, steps: 5 };
  }
  if (
    s === "OUT_FOR_DELIVERY" ||
    s === "PICKED_UP" ||
    s === "IN_TRANSIT" ||
    s === "ON_THE_WAY" ||
    s === "DISPATCHED"
  ) {
    return {
      title: "Parcel On The Way",
      body: eta != null ? `Arriving in ${eta} mins` : "Your parcel is on the way",
      step: 3,
      steps: 5,
    };
  }
  if (s === "RIDER_AT_PICKUP" || s === "REACHED_STORE" || s === "AT_PICKUP" || s === "READY_FOR_PICKUP") {
    return { title: "Rider Collecting", body: "Rider is collecting your parcel", step: 2, steps: 5 };
  }
  if (s === "ACCEPTED" || s === "ASSIGNED" || s === "RIDER_ASSIGNED") {
    return {
      title: "Rider On The Way",
      body: eta != null ? `Collecting soon · ${eta} mins` : "Rider heading to collect",
      step: 2,
      steps: 5,
    };
  }
  if (s === "ORDER_PLACED" || s === "CREATED" || s === "PLACED" || s === "PREPARING") {
    return { title: "Parcel Accepted", body: "Your parcel request is confirmed", step: 1, steps: 5 };
  }
  return {
    title: "Tracking your parcel",
    body: eta != null ? `ETA ${eta} mins` : "Tap to open tracking",
    step: 1,
    steps: 5,
  };
}

function liveUiFromOrder(order: ActiveOrder): LiveUi {
  const service: ActiveOrderService = order.serviceType ?? "food";
  if (service === "ride") return liveUiRide(order);
  if (service === "parcel") return liveUiParcel(order);
  return liveUiFood(order);
}

function screenForService(service: ActiveOrderService | string | undefined, orderId: string): string {
  return `/orders/${orderId}`;
}

/** Apply a live-progress push into the sticky shade (food / ride / parcel). */
export async function applyLiveProgressFromPush(data: Record<string, unknown>): Promise<void> {
  if (Platform.OS !== "android" || isExpoGo()) return;
  const live = data.gmLiveProgress === true || data.gmLiveProgress === "true";
  if (!live) return;

  const serviceRaw = String(data.liveService ?? "food").trim().toLowerCase();
  const service: ActiveOrderService =
    serviceRaw === "ride" || serviceRaw === "person_ride"
      ? "ride"
      : serviceRaw === "parcel"
        ? "parcel"
        : "food";

  const orderId = typeof data.orderId === "string" ? data.orderId.trim() : "";
  if (!orderId) return;

  const step = Number(data.liveStep);
  const defaultSteps = service === "ride" ? 6 : 5;
  const steps = Number(data.liveSteps) || defaultSteps;
  const title =
    typeof data.liveTitle === "string" && data.liveTitle.trim()
      ? data.liveTitle.trim()
      : service === "ride"
        ? "Ride update"
        : service === "parcel"
          ? "Parcel update"
          : "Order update";
  let body =
    typeof data.liveBody === "string" && data.liveBody.trim() ? data.liveBody.trim() : "Tap to track";
  const eta = Number(data.etaMinutes);
  if (Number.isFinite(eta) && eta > 0 && !/min/i.test(body)) {
    body = `${body} · ${Math.round(eta)} mins`;
  }

  const terminal =
    (Number.isFinite(step) && step >= steps) ||
    /delivered|completed|cancelled/i.test(title) ||
    String(data.gmType ?? "").includes("DELIVERED") ||
    String(data.gmType ?? "").includes("COMPLETED") ||
    String(data.gmType ?? "").includes("CANCELLED");

  await postOrUpdateLiveNotification({
    orderId,
    title,
    body,
    step: Number.isFinite(step) ? step : 1,
    steps,
    terminal,
    service,
  });
}

async function ensureChannel(Notifications: typeof import("expo-notifications")) {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Live trip progress",
    importance: Notifications.AndroidImportance.LOW,
    sound: undefined,
    vibrationPattern: undefined,
    enableVibrate: false,
    showBadge: true,
  });
}

async function postOrUpdateLiveNotification(args: {
  orderId: string;
  title: string;
  body: string;
  step: number;
  steps: number;
  terminal?: boolean;
  service?: ActiveOrderService;
}): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await ensureChannel(Notifications);
    const id = ongoingId(args.orderId);
    if (args.terminal) {
      await Notifications.dismissNotificationAsync(id).catch(() => undefined);
      return;
    }
    const bar = progressBar(args.step, args.steps);
    const href = screenForService(args.service, args.orderId);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: {
        title: args.title,
        body: `${args.body}\n${bar}`,
        data: {
          type: "live_order_progress",
          liveService: args.service ?? "food",
          orderId: args.orderId,
          screen: href,
          deepLink: href,
        },
        color: GatiMitraColors.deepMintStart,
        sticky: true,
        autoDismiss: false,
        sound: undefined,
        ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
      },
      trigger: null,
    });
  } catch {
    // best-effort
  }
}

async function dismissLive(orderId: string): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.dismissNotificationAsync(ongoingId(orderId));
  } catch {
    // ignore
  }
}

export function LiveOrderProgressNotification() {
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const lastSigRef = useRef<Record<string, string>>({});
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return undefined;

    const sync = () => {
      const nextIds = new Set<string>();
      for (const order of activeOrders) {
        if (!order.orderId) continue;
        nextIds.add(order.orderId);
        const ui = liveUiFromOrder(order);
        const sig = `${order.serviceType ?? "food"}|${ui.title}|${ui.body}|${ui.step}|${order.etaMinutes}|${ui.terminal ? 1 : 0}`;
        if (lastSigRef.current[order.orderId] === sig) continue;
        lastSigRef.current[order.orderId] = sig;
        if (ui.terminal) {
          void dismissLive(order.orderId);
          delete lastSigRef.current[order.orderId];
          continue;
        }
        void postOrUpdateLiveNotification({
          orderId: order.orderId,
          title: ui.title,
          body: ui.body,
          step: ui.step,
          steps: ui.steps,
          service: order.serviceType ?? "food",
        });
      }

      for (const id of knownIdsRef.current) {
        if (!nextIds.has(id)) {
          void dismissLive(id);
          delete lastSigRef.current[id];
        }
      }
      knownIdsRef.current = nextIds;
    };

    sync();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => sub.remove();
  }, [activeOrders]);

  return null;
}
