/**
 * Keeps the ONLINE store-status tray body in sync when order lifecycle pushes
 * arrive — including while the app is backgrounded (JS process still alive).
 *
 * Killed apps still get OS heads-up from FCM (merchant_order_lifecycle /
 * merchant_new_order / rider / rating / complaint); sticky refreshes on next open.
 */

import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  applyLiveOrdersCountFromPush,
  refreshLiveOrdersOngoingNotification,
} from "@/lib/liveOrdersOngoingNotification";
import {
  registerMerchantForegroundPushHandler,
  registerMerchantNotificationResponseHandler,
} from "@/lib/merchantPushDispatch";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function isLifecycleRefreshPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? data.gmType ?? "").toLowerCase();
  return (
    t === "merchant_order_lifecycle" ||
    t === "merchant_order_cancelled" ||
    t === "merchant_new_order" ||
    t === "new_order" ||
    t === "merchant_rider_pickup" ||
    t === "merchant_rider_assigned" ||
    t === "merchant_rider_wait_priority" ||
    t === "rider_wait_escalation" ||
    t === "merchant_rating" ||
    t === "merchant_complaint" ||
    data.refreshLiveOrders === true ||
    data.refreshLiveOrders === "true"
  );
}

function subtitleFromData(data: Record<string, unknown>): string | null {
  const s = data.stickySubtitle ?? data.subtitle;
  return typeof s === "string" && s.trim() ? s.trim() : null;
}

function countFromData(data: Record<string, unknown>): number | null {
  const raw = data.activeOrdersCount ?? data.active_orders_count;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function stageNum(data: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const raw = data[k];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export default function LiveOrdersStickyPushRefresh() {
  const { token, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name?.trim() || "Your restaurant";
  const merchantId = partner?.parent?.parent_merchant_id ?? null;
  const enabled = Platform.OS === "android" && !!token && !!storeId;

  const tokenRef = useRef(token);
  const storeIdRef = useRef(storeId);
  const storeNameRef = useRef(storeName);
  const merchantIdRef = useRef(merchantId);
  const enabledRef = useRef(enabled);
  tokenRef.current = token;
  storeIdRef.current = storeId;
  storeNameRef.current = storeName;
  merchantIdRef.current = merchantId;
  enabledRef.current = enabled;

  useEffect(() => {
    if (isExpoGo() || Platform.OS !== "android") return;

    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        await Notifications.setNotificationChannelAsync("merchant_order_lifecycle", {
          name: "Order updates",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250],
          enableVibrate: true,
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync("merchant_complaints", {
          name: "Complaints",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250],
          enableVibrate: true,
          showBadge: true,
        });
      } catch {
        /* expo-notifications unavailable */
      }
    })();

    async function applyFromData(data: Record<string, unknown>) {
      if (!enabledRef.current) return;
      if (!isLifecycleRefreshPush(data)) return;
      const subtitle = subtitleFromData(data);
      const embedded = countFromData(data);
      const name = storeNameRef.current;
      const sid = storeIdRef.current;
      if (embedded != null) {
        await applyLiveOrdersCountFromPush({
          activeOrdersCount: embedded,
          storeName: name,
          subtitle,
          storeId: sid,
          merchantId: merchantIdRef.current,
          preparing: stageNum(data, "preparing"),
          ready: stageNum(data, "ready"),
          outForDelivery: stageNum(data, "outForDelivery", "out_for_delivery"),
          pendingAccept: stageNum(data, "pendingAccept", "pending_accept"),
        });
        return;
      }
      const tok = tokenRef.current;
      if (sid == null || !tok) return;
      await refreshLiveOrdersOngoingNotification({
        storeId: sid,
        token: tok,
        storeName: name,
        merchantId: merchantIdRef.current,
        subtitle,
        force: true,
      });
    }

    const removeForeground = registerMerchantForegroundPushHandler(({ data }) => {
      void applyFromData(data);
    });
    const removeResponse = registerMerchantNotificationResponseHandler(({ data }) => {
      void applyFromData(data);
    });

    const appSub = AppState.addEventListener("change", (s) => {
      if (s !== "active" || !enabledRef.current) return;
      const sid = storeIdRef.current;
      const tok = tokenRef.current;
      if (sid == null || !tok) return;
      void refreshLiveOrdersOngoingNotification({
        storeId: sid,
        token: tok,
        storeName: storeNameRef.current,
        merchantId: merchantIdRef.current,
        force: true,
      });
    });

    return () => {
      removeForeground();
      removeResponse();
      appSub.remove();
    };
  }, []);

  return null;
}
