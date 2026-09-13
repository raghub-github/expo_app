/**
 * When Partner is backgrounded (process alive) and the live board sees a new
 * CREATED order or kitchen stage change without remote FCM, post a local
 * heads-up so merchants still get shade + sound.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrders } from "@/hooks/useOrders";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import {
  presentLocalLifecycleAlert,
  presentLocalNewOrderAlert,
  rememberRemoteLifecycleAlertPresented,
  rememberRemoteNewOrderAlertPresented,
} from "@/lib/presentLocalNewOrderAlert";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";
import { extractNewOrderIdFromPush } from "@/lib/newOrderAlertManager";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

const LIFECYCLE_STATUSES = new Set([
  "preparing",
  "ready",
  "picked_up",
  "delivered",
  "rejected",
  "rto",
]);

function boardStage(status: string): string | null {
  const s = String(status ?? "").toLowerCase();
  if (s === "preparing") return "PREPARING";
  if (s === "ready") return "READY";
  if (s === "picked_up") return "OUT_FOR_DELIVERY";
  if (s === "delivered") return "DELIVERED";
  if (s === "rejected") return "CANCELLED";
  if (s === "rto") return "RTO";
  return null;
}

export default function BackgroundNewOrderLocalAlert() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders } = useOrders();
  const seenCreatedRef = useRef<Set<string>>(new Set());
  const lastStageRef = useRef<Map<string, string>>(new Map());
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    seenCreatedRef.current = new Set();
    lastStageRef.current = new Map();
    bootstrappedRef.current = false;
  }, [storeId]);

  // Remote FCM already landed → do not double-post locally.
  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    return registerMerchantForegroundPushHandler(({ data }) => {
      if (isMerchantNewOrderPushData(data)) {
        const id = extractNewOrderIdFromPush(data);
        rememberRemoteNewOrderAlertPresented(id);
        if (id) seenCreatedRef.current.add(id);
        return;
      }
      const t = String(data.type ?? "").toLowerCase();
      if (t === "merchant_order_lifecycle" || t.includes("merchant_order")) {
        const id = String(data.foodOrderId ?? data.orderId ?? "").trim();
        const stage = String(data.stage ?? "").trim().toUpperCase();
        rememberRemoteLifecycleAlertPresented(id, stage);
        if (id && stage) lastStageRef.current.set(id, stage);
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo() || storeId == null) return;

    const created = orders.filter(
      (o) => String(o.status ?? "").toLowerCase() === "created" && !String(o.id).startsWith("core-")
    );
    const lifecycle = orders.filter(
      (o) =>
        !String(o.id).startsWith("core-") &&
        LIFECYCLE_STATUSES.has(String(o.status ?? "").toLowerCase())
    );

    if (!bootstrappedRef.current) {
      for (const o of created) seenCreatedRef.current.add(o.id);
      for (const o of lifecycle) {
        const stage = boardStage(String(o.status));
        if (stage) lastStageRef.current.set(o.id, stage);
      }
      bootstrappedRef.current = true;
      return;
    }

    // Foreground: in-app UI owns the experience; still track to avoid catch-up spam.
    if (AppState.currentState === "active") {
      for (const o of created) seenCreatedRef.current.add(o.id);
      for (const o of lifecycle) {
        const stage = boardStage(String(o.status));
        if (stage) lastStageRef.current.set(o.id, stage);
      }
      return;
    }

    void (async () => {
      const device = await readDeviceOrderAlertsAsync(storeId);
      if (!device.orderAlertsEnabled) return;

      for (const o of created) {
        if (seenCreatedRef.current.has(o.id)) continue;
        seenCreatedRef.current.add(o.id);
        await presentLocalNewOrderAlert({
          orderId: o.id,
          displayId: o.formattedOrderId ?? o.id,
          storeId,
        });
      }

      for (const o of lifecycle) {
        const stage = boardStage(String(o.status));
        if (!stage) continue;
        const prev = lastStageRef.current.get(o.id);
        if (prev === stage) continue;
        lastStageRef.current.set(o.id, stage);
        await presentLocalLifecycleAlert({
          orderId: o.id,
          displayId: o.formattedOrderId ?? o.id,
          stage,
          storeId,
        });
      }
    })();
  }, [orders, storeId]);

  return null;
}
