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
import { collectOrderAliases } from "@/lib/customer-order-status-machine";
import {
  applyLiveProgressFromPush as applyLiveProgressNative,
  dismissStaleLiveOrderTrayNotifications,
  postOrUpdateLiveNotification as postOrUpdateLiveNative,
} from "@/lib/customerLiveOrderNotificationNative";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
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

/** Apply a live-progress push into the sticky shade (food / ride / parcel). */
export async function applyLiveProgressFromPush(data: Record<string, unknown>): Promise<void> {
  if (Platform.OS !== "android" || isExpoGo()) return;
  await applyLiveProgressNative(data);
}

async function dismissLive(orderId: string): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.dismissNotificationAsync(`customer-live-order-${orderId}`);
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
      const dismissIds = new Set<string>();
      for (const order of activeOrders) {
        if (!order.orderId) continue;
        nextIds.add(order.orderId);
        for (const alias of collectOrderAliases(order.orderId, order.formattedOrderId)) {
          dismissIds.add(alias);
        }
        const ui = liveUiFromOrder(order);
        // Step / title only — raw ETA ticks were rescheduling the sticky every poll (ANR).
        const sig = `${order.serviceType ?? "food"}|${ui.title}|${ui.step}|${ui.terminal ? 1 : 0}`;
        if (lastSigRef.current[order.orderId] === sig) continue;
        lastSigRef.current[order.orderId] = sig;
        if (ui.terminal) {
          void dismissLive(order.orderId);
          delete lastSigRef.current[order.orderId];
          continue;
        }
        void postOrUpdateLiveNative({
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
      void dismissStaleLiveOrderTrayNotifications(dismissIds);
    };

    const t = setTimeout(sync, 400);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        // Resume: drop leftover FCM shade rows. Do not convert current
        // order status history into new heads-up notifications.
        const dismissIds = new Set<string>();
        for (const order of useOrderStore.getState().activeOrders) {
          for (const alias of collectOrderAliases(order.orderId, order.formattedOrderId)) {
            dismissIds.add(alias);
          }
        }
        void dismissStaleLiveOrderTrayNotifications(dismissIds, { force: true });
        sync();
      }
    });
    return () => {
      clearTimeout(t);
      sub.remove();
    };
  }, [activeOrders]);

  return null;
}
