/**
 * Merchant push notification bootstrap — shared dual-token controller +
 * permission recovery gate for authenticated merchants.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AppStateStatus,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  navigateFromPushData,
  usePushPermissionController,
  type PushNotificationOpenPayload,
} from "@gatimitra/expo-push-kit";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrders, mapApiOrder } from "@/hooks/useOrders";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { fetchFoodOrder } from "@/services/ordersApi";
import { registerStorePushToken } from "@/services/pushTokenApi";
import { getConfig } from "@/config/env";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function isMerchantNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order" || data.screen === "new_order";
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
  const [gateVisible, setGateVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const dismissedRef = useRef(false);

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      const data = payload.data;
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
      navigateFromPushData({ push: (href) => router.push(href as never) }, {
        ...data,
        appRole: "merchant",
      });
    },
    [router, storeId, authToken, openIncomingOrderSheet, upsertOrder]
  );

  const { apiBaseUrl } = getConfig();
  const authRef = useRef({ authToken, storeId });
  authRef.current = { authToken, storeId };

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      androidPackageName: "com.gatimitra.partner",
      androidChannels: [
        { channelId: "merchant_default", name: "Store & Orders", lightColor: "#3EB489" },
        { channelId: "merchant_online", name: "Store online status", lightColor: "#3EB489" },
        { channelId: "default", name: "Store & Orders", lightColor: "#3EB489" },
      ],
      getAuth: () => {
        const { authToken: t, storeId: sid } = authRef.current;
        if (!t) return null;
        return {
          accessToken: t,
          role: "merchant" as const,
          storeId: sid,
        };
      },
      registerStoreExpoToken: async ({
        storeId: sid,
        expoPushToken,
        accessToken,
        platform,
      }: {
        storeId: number;
        expoPushToken: string;
        accessToken: string;
        platform: string;
      }) => {
        await registerStorePushToken(sid, expoPushToken, accessToken, platform);
      },
      onNotificationOpen: handleOpen,
    }),
    [apiBaseUrl, handleOpen]
  );

  const { snapshot, controller } = usePushPermissionController(pushOptions, {
    autoStart: !isExpoGo(),
  });

  // Re-register when auth or selected store changes (merchant_store_<id> topic).
  useEffect(() => {
    if (isExpoGo() || !authToken) return;
    void controller.refresh({ syncIfGranted: true });
  }, [authToken, storeId, controller]);

  useEffect(() => {
    if (isExpoGo()) return;
    if (!authToken) {
      setGateVisible(false);
      return;
    }
    if (snapshot.osStatus === "granted") {
      setGateVisible(false);
      dismissedRef.current = false;
      return;
    }
    if (
      !dismissedRef.current &&
      (snapshot.osStatus === "denied" ||
        snapshot.osStatus === "blocked" ||
        snapshot.osStatus === "undetermined")
    ) {
      setGateVisible(true);
    }
  }, [authToken, snapshot.osStatus]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active" && authToken) {
        void controller.refresh({ syncIfGranted: true }).then((snap) => {
          if (snap.osStatus === "granted") setGateVisible(false);
        });
      }
    });
    return () => sub.remove();
  }, [authToken, controller]);

  const onAllow = async () => {
    setBusy(true);
    try {
      const result = await controller.requestOrOpenSettings();
      if (result.granted) setGateVisible(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={gateVisible && !!authToken && !isExpoGo()}
      transparent
      animationType="fade"
      onRequestClose={() => {
        dismissedRef.current = true;
        setGateVisible(false);
      }}
    >
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          dismissedRef.current = true;
          setGateVisible(false);
        }}
      >
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Enable notifications</Text>
          <Text style={styles.body}>
            Allow notifications so you receive new orders, ratings, and rider pickup alerts.
            {snapshot.osStatus === "blocked"
              ? " Notifications are blocked — open Settings to turn them back on."
              : ""}
          </Text>
          <Pressable
            style={[styles.btn, busy && styles.btnDisabled]}
            onPress={() => void onAllow()}
            disabled={busy}
          >
            <Text style={styles.btnText}>
              {snapshot.osStatus === "blocked" || !snapshot.canAskAgain
                ? "Open Settings"
                : "Allow notifications"}
            </Text>
          </Pressable>
          <Pressable
            style={styles.later}
            onPress={() => {
              dismissedRef.current = true;
              setGateVisible(false);
            }}
          >
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
    padding: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    marginBottom: Platform.OS === "ios" ? 24 : 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: "#475569",
    marginBottom: 16,
  },
  btn: {
    backgroundColor: "#3EB489",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  later: { alignItems: "center", paddingVertical: 12 },
  laterText: { color: "#64748b", fontSize: 14, fontWeight: "600" },
});
