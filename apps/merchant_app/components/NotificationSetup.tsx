"use client";

import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import {
  ensureAndroidChannel,
  getFreshExpoPushToken,
  navigateFromPushData,
  registerExpoPushTokenOnBackend,
  setNotificationHandlerDefaults,
  subscribeToPushNotificationResponse,
} from "@gatimitra/expo-push-kit";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrders, mapApiOrder } from "@/hooks/useOrders";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { fetchFoodOrder } from "@/services/ordersApi";
import { registerStorePushToken } from "@/services/pushTokenApi";
import { getConfig } from "@/config/env";

function deviceType(): "ios" | "android" | "web" | "unknown" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return "unknown";
}

/**
 * Foreground/background push, tap handling, store-level token (closures) + unified role token (broadcasts).
 * Push token is always read fresh from Expo — never from storage/cache.
 */
function isMerchantNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order" || data.screen === "new_order";
}

export default function NotificationSetup() {
  const router = useRouter();
  const { token: authToken } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const responseSubscriptionRef = useRef<{ remove?: () => void } | null>(null);
  const lastUnifiedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      await setNotificationHandlerDefaults();
      await ensureAndroidChannel({
        channelId: "merchant_default",
        name: "Store & Orders",
        lightColor: "#3EB489",
      });
      const token = await getFreshExpoPushToken();
      if (!mounted || !token || !authToken) return;
      if (selectedStore?.id) {
        try {
          await registerStorePushToken(selectedStore.id, token, authToken, Platform.OS);
        } catch {
          // best-effort store token
        }
      }
      if (lastUnifiedTokenRef.current === token) return;
      const { apiBaseUrl } = getConfig();
      const res = await registerExpoPushTokenOnBackend(apiBaseUrl, authToken, {
        expo_push_token: token,
        device_type: deviceType(),
      });
      if (res.ok) lastUnifiedTokenRef.current = token;
    };

    void run();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void run();
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, [authToken, selectedStore?.id]);

  useEffect(() => {
    const sub = subscribeToPushNotificationResponse(({ data }) => {
      if (data?.action === "reopen_prompt" && data?.url && typeof data.url === "string") {
        router.push(`${data.url}${String(data.url).includes("?") ? "&" : "?"}reopen_prompt=1` as never);
        return;
      }
      if (isMerchantNewOrderPush(data)) {
        void (async () => {
          const foodIdRaw =
            data.foodOrderId ??
            (typeof data.url === "string" && data.url.match(/\/order\/(\d+)/)?.[1]);
          const foodId = foodIdRaw != null ? parseInt(String(foodIdRaw), 10) : NaN;
          if (!storeId || !authToken || !Number.isFinite(foodId)) {
            if (Number.isFinite(foodId)) router.push(`/order/${foodId}` as never);
            return;
          }
          let order = ordersRef.current.find((o) => o.id === String(foodId));
          if (!order) {
            try {
              order = mapApiOrder(await fetchFoodOrder(storeId, foodId, authToken));
            } catch {
              router.push(`/order/${foodId}` as never);
              return;
            }
          }
          if (order.status === "created" && !order.id.startsWith("core-")) {
            openIncomingOrderSheet(order);
            return;
          }
          router.push(`/order/${order.id}` as never);
        })();
        return;
      }
      if (data?.url && typeof data.url === "string") {
        router.push(data.url as never);
        return;
      }
      if (data?.screen === "notifications") {
        router.push("/notifications" as never);
        return;
      }
      if (data?.orderId != null) {
        router.push(`/order/${String(data.orderId)}` as never);
        return;
      }
      navigateFromPushData(router, data);
    });
    responseSubscriptionRef.current = sub;
    return () => {
      sub.remove();
      responseSubscriptionRef.current = null;
    };
  }, [router, storeId, authToken, openIncomingOrderSheet]);

  return null;
}
