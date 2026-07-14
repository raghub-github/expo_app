/**
 * Merchant push notification bootstrap — permissions, channels, token registration.
 */
import { useEffect, useRef } from "react";
import { Alert, AppState, Platform, type AppStateStatus } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
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

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function resolveEasProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const eas = extra?.eas as Record<string, unknown> | undefined;
  return typeof eas?.projectId === "string" && eas.projectId.trim() ? eas.projectId.trim() : undefined;
}

function isMerchantNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order" || data.screen === "new_order";
}

async function ensurePushChannels(): Promise<void> {
  await ensureAndroidChannel({
    channelId: "merchant_default",
    name: "Store & Orders",
    lightColor: "#3EB489",
  });
  await ensureAndroidChannel({
    channelId: "merchant_online",
    name: "Store online status",
    lightColor: "#3EB489",
  });
}

/**
 * Foreground/background push, tap handling, store-level token + unified role token.
 * Requires a dev/production build (not Expo Go) + FCM via google-services.json + EAS credentials.
 */
export default function NotificationSetup() {
  const router = useRouter();
  const { token: authToken } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { orders, upsertOrder } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const lastUnifiedTokenRef = useRef<string | null>(null);
  const warnedMissingProjectRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (isExpoGo()) {
        if (!warnedMissingProjectRef.current) {
          warnedMissingProjectRef.current = true;
          console.warn("[push] Expo Go does not support remote push — use a dev/production build.");
        }
        return;
      }

      if (!resolveEasProjectId() && !warnedMissingProjectRef.current) {
        warnedMissingProjectRef.current = true;
        console.warn("[push] EAS projectId missing — set EAS_PROJECT_ID in .env for push tokens.");
      }

      await setNotificationHandlerDefaults();
      await ensurePushChannels();

      const token = await getFreshExpoPushToken();
      if (!mounted) return;

      if (!token) {
        if (authToken && Platform.OS === "android") {
          Alert.alert(
            "Notifications disabled",
            "Allow notifications so you receive new orders, ratings, and rider pickup alerts."
          );
        }
        return;
      }

      if (!authToken) return;

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
          upsertOrder(order);
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
      if (data?.screen === "reviews" || String(data.type ?? "") === "merchant_rating") {
        router.push("/(tabs)/reviews" as never);
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
      navigateFromPushData({ push: (href) => router.push(href as never) }, data);
    });
    return () => sub.remove();
  }, [router, storeId, authToken, openIncomingOrderSheet, upsertOrder]);

  return null;
}
