/**
 * Merchant push notification bootstrap — shared dual-token controller +
 * permission recovery gate for authenticated merchants.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { AppState, Platform, Pressable, StyleSheet, View, type AppStateStatus } from "react-native";
import { useRouter, usePathname } from "expo-router";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import {
  navigateFromPushData,
  usePushPermissionController,
  enqueueInAppBannerFromPush,
  FloatingInAppBannerHost,
  type PushNotificationOpenPayload,
} from "@gatimitra/expo-push-kit";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useNotifications } from "@/context/NotificationContext";
import { useOrders, mapApiOrder } from "@/hooks/useOrders";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { fetchFoodOrder } from "@/services/ordersApi";
import { registerStorePushToken, unregisterAllStorePushTokens } from "@/services/pushTokenApi";
import { getConfig } from "@/config/env";
import { setMerchantPushUnregister } from "@/lib/merchantPushUnregister";
import { openOrderDetailOnce } from "@/lib/openOrderDetailOnce";
import { isSafeMerchantPushHref } from "@/lib/merchantNavigation";
import {
  dispatchMerchantForegroundPush,
  dispatchMerchantNotificationResponse,
} from "@/lib/merchantPushDispatch";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";
import { useNotificationPermissionGate } from "@/context/NotificationPermissionGateContext";
import type { PartnerData } from "@/context/AuthContext";
import * as SecureStore from "expo-secure-store";
import { useMerchantWalletFreezeLive } from "@/hooks/useMerchantWalletFreezeLive";
import { useMerchantStoreDelistLive } from "@/hooks/useMerchantStoreDelistLive";

const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const MERCHANT_TEAL = "#0D9488";
/** Survives remount so logout can scrub store tokens even if controller snapshot is empty. */
const CACHED_EXPO_PUSH_TOKEN_KEY = "merchant_cached_expo_push_token_v1";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

function isMerchantNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order" || data.screen === "new_order";
}

/**
 * Foreground/background push, tap handling, store-level token + unified role token.
 * Permission sheet UI still shows in Expo Go so partners can review the flow;
 * remote push registration is skipped there.
 */
export default function NotificationSetup() {
  return <NotificationSetupImpl />;
}

function NotificationSetupImpl() {
  const router = useRouter();
  const pathname = usePathname();
  const { token: authToken, isAuthenticated, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  useMerchantWalletFreezeLive({
    storeId,
    authToken,
    enabled: Boolean(isAuthenticated && authToken && storeId),
  });
  useMerchantStoreDelistLive({
    storeId,
    authToken,
    enabled: Boolean(isAuthenticated && authToken && storeId),
  });
  const { refresh: refreshNotifications, applyIncomingPush } = useNotifications();
  const refreshNotificationsRef = useRef(refreshNotifications);
  refreshNotificationsRef.current = refreshNotifications;
  const applyIncomingPushRef = useRef(applyIncomingPush);
  applyIncomingPushRef.current = applyIncomingPush;
  const partnerRef = useRef<PartnerData | null>(partner);
  partnerRef.current = partner;
  const { orders, upsertOrder } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();
  const { forceOpen, closePermissionGate, signalNotificationsGranted, setNotificationsGranted } =
    useNotificationPermissionGate();
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const [autoGateVisible, setAutoGateVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [osStatus, setOsStatus] = useState<"granted" | "denied" | "blocked" | "undetermined">(
    "undetermined"
  );
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [permReady, setPermReady] = useState(false);
  const dismissedRef = useRef(false);
  const expoGo = isExpoGo();

  const refreshOsPermission = useCallback(async () => {
    const { readMerchantNotificationPermission } = await import(
      "@/lib/merchantNotificationPermission"
    );
    const perm = await readMerchantNotificationPermission();
    setOsStatus(perm.osStatus);
    setCanAskAgain(perm.canAskAgain);
    setPermReady(true);
    setNotificationsGranted(perm.osStatus === "granted");
    if (perm.osStatus === "granted") {
      setAutoGateVisible(false);
      closePermissionGate();
      signalNotificationsGranted();
    }
    return perm;
  }, [closePermissionGate, setNotificationsGranted, signalNotificationsGranted]);

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      const data = payload.data;
      if (data?.action === "reopen_prompt" && data?.url && typeof data.url === "string") {
        if (isSafeMerchantPushHref(data.url)) {
          router.push(`${data.url}${String(data.url).includes("?") ? "&" : "?"}reopen_prompt=1` as never);
        }
        return;
      }
      if (isMerchantNewOrderPush(data)) {
        void (async () => {
          const foodIdRaw =
            data.foodOrderId ??
            (typeof data.url === "string" && data.url.match(/\/order\/(\d+)/)?.[1]);
          const foodId = foodIdRaw != null ? parseInt(String(foodIdRaw), 10) : NaN;
          if (!storeId || !authToken || !Number.isFinite(foodId)) {
            if (Number.isFinite(foodId)) {
              openOrderDetailOnce(router, String(foodId), { currentPath: pathname });
            }
            return;
          }
          let order = ordersRef.current.find((o) => o.id === String(foodId));
          if (!order) {
            try {
              order = mapApiOrder(await fetchFoodOrder(storeId, foodId, authToken));
            } catch {
              openOrderDetailOnce(router, String(foodId), { currentPath: pathname });
              return;
            }
          }
          upsertOrder(order);
          if (order.status === "created" && !order.id.startsWith("core-")) {
            openIncomingOrderSheet(order);
            return;
          }
          openOrderDetailOnce(router, order.id, { currentPath: pathname });
        })();
        return;
      }
      if (data?.url && typeof data.url === "string") {
        if (isSafeMerchantPushHref(data.url)) {
          router.push(data.url as never);
        } else {
          const foodId = data.url.match(/\/order\/(\d+)/)?.[1];
          if (foodId) {
            openOrderDetailOnce(router, foodId, { currentPath: pathname });
          }
        }
        return;
      }
      if (data?.screen === "reviews" || String(data.type ?? "") === "merchant_rating") {
        router.push("/(tabs)/reviews" as never);
        return;
      }
      if (data?.screen === "orders" || data?.type === "store_online") {
        router.push("/(tabs)/orders" as never);
        return;
      }
      if (
        data?.screen === "restaurant_status" ||
        data?.type === "merchant_go_online" ||
        data?.type === "merchant_outside_delivery"
      ) {
        router.push("/restaurant-status" as never);
        return;
      }
      if (data?.screen === "notifications") {
        router.push("/(tabs)/orders" as never);
        return;
      }
      if (data?.orderId != null) {
        openOrderDetailOnce(router, String(data.orderId), { currentPath: pathname });
        return;
      }
      navigateFromPushData({ push: (href) => router.push(href as never) }, {
        ...data,
        appRole: "merchant",
      });
    },
    [router, pathname, storeId, authToken, openIncomingOrderSheet, upsertOrder]
  );

  const { apiBaseUrl } = getConfig();
  const authRef = useRef({ authToken, storeId });
  authRef.current = { authToken, storeId };

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      androidPackageName: "com.gatimitra.partner",
      androidChannels: [
        {
          channelId: "merchant_new_orders",
          name: "New orders",
          lightColor: "#3EB489",
          // AndroidImportance.MAX
          importance: 5,
        },
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
        try {
          await SecureStore.setItemAsync(CACHED_EXPO_PUSH_TOKEN_KEY, expoPushToken);
        } catch {
          /* ignore */
        }
        // Fan-out to every child store so background new-order pushes work even if
        // this device's selected outlet changes / app stays closed after login.
        const ids = new Set<number>();
        if (Number.isInteger(sid) && sid > 0) ids.add(sid);
        for (const child of partnerRef.current?.childStores ?? []) {
          const id = Number(child.id);
          if (Number.isInteger(id) && id > 0) ids.add(id);
        }
        if (ids.size === 0) return;
        await Promise.all(
          [...ids].map((id) =>
            registerStorePushToken(id, expoPushToken, accessToken, platform).catch(() => {
              /* one store failure must not block others */
            })
          )
        );
      },
      unregisterStoreExpoToken: async ({
        expoPushToken,
        accessToken,
      }: {
        expoPushToken: string;
        accessToken: string;
      }) => {
        await unregisterAllStorePushTokens(expoPushToken, accessToken);
        try {
          await SecureStore.deleteItemAsync(CACHED_EXPO_PUSH_TOKEN_KEY);
        } catch {
          /* ignore */
        }
      },
      onNotificationOpen: (payload: PushNotificationOpenPayload) => {
        dispatchMerchantNotificationResponse(payload);
        handleOpen(payload);
      },
      onForeground: (payload: PushNotificationOpenPayload) => {
        // Move the bell badge on arrival, then reconcile with the server.
        const data = payload.data ?? {};
        const pick = (...keys: string[]): string | null => {
          for (const k of keys) {
            const v = data[k];
            if (typeof v === "string" && v.trim()) return v.trim();
          }
          return null;
        };
        applyIncomingPushRef.current({
          notificationId: pick("notification_id", "notificationId"),
          title: pick("gmTitle", "title") ?? payload.title ?? null,
          body: pick("gmMessage", "body") ?? payload.body ?? null,
          deepLink: pick("deepLink", "deep_link", "url"),
          templateCode: pick("template_code", "gmType"),
          orderId: pick("foodOrderId", "orderId", "order_id"),
        });
        dispatchMerchantForegroundPush(payload);
        if (isMerchantNewOrderPush(data)) return;
        enqueueInAppBannerFromPush(payload);
      },
    }),
    [apiBaseUrl, handleOpen]
  );

  const { controller } = usePushPermissionController(pushOptions, {
    autoStart: true,
  });

  useEffect(() => {
    setMerchantPushUnregister(async (opts) => {
      await controller.unregisterCurrent({ ...opts, role: "merchant" });
    });
    return () => setMerchantPushUnregister(null);
  }, [controller]);

  // Login / store change: restart listeners (logout calls stopLifecycle) and re-sync tokens.
  useEffect(() => {
    if (!authToken) return;
    controller.startLifecycle();
    void controller.refresh({ syncIfGranted: !expoGo });
  }, [authToken, storeId, partner?.childStores?.length, controller, expoGo]);

  // Source of truth for the sheet: Android POST_NOTIFICATIONS / Settings toggle.
  useEffect(() => {
    if (!authToken && !isAuthenticated) {
      setAutoGateVisible(false);
      setPermReady(false);
      return;
    }
    void refreshOsPermission().then((perm) => {
      if (perm.osStatus === "granted") return;
      if (!dismissedRef.current) setAutoGateVisible(true);
    });
  }, [authToken, isAuthenticated, refreshOsPermission]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active" || (!authToken && !isAuthenticated)) return;
      void refreshOsPermission().then((perm) => {
        if (perm.osStatus === "granted") {
          void controller.refresh({ syncIfGranted: !expoGo });
          return;
        }
        if (!dismissedRef.current) setAutoGateVisible(true);
      });
    });
    return () => sub.remove();
  }, [authToken, isAuthenticated, controller, expoGo, refreshOsPermission]);

  const permissionNeeded = osStatus !== "granted";

  useEffect(() => {
    if (forceOpen && !permissionNeeded) {
      closePermissionGate();
    }
  }, [forceOpen, permissionNeeded, closePermissionGate]);

  const dismiss = () => {
    dismissedRef.current = true;
    setAutoGateVisible(false);
    closePermissionGate();
  };

  const onAllow = async () => {
    setBusy(true);
    try {
      const { requestMerchantNotificationPermission } = await import(
        "@/lib/merchantNotificationPermission"
      );
      const { openMerchantNotificationSettings } = await import(
        "@/lib/androidBackgroundPermissions"
      );

      let perm = await requestMerchantNotificationPermission();
      if (perm.osStatus === "granted") {
        setOsStatus("granted");
        setAutoGateVisible(false);
        dismissedRef.current = false;
        closePermissionGate();
        signalNotificationsGranted();
        void controller.refresh({ syncIfGranted: !expoGo });
        return;
      }

      // Dialog denied / blocked / Settings toggle off → open the exact Android screen.
      await openMerchantNotificationSettings();
      setOsStatus(perm.canAskAgain ? "denied" : "blocked");
      setCanAskAgain(perm.canAskAgain);
    } finally {
      setBusy(false);
    }
  };

  const loggedIn = Boolean(authToken || isAuthenticated);
  // Android Settings master toggle is often off even after a prior grant — always
  // guide users to turn ON “Allow notifications” when not granted.
  const needsSettings =
    Platform.OS === "android" || osStatus === "blocked" || !canAskAgain;
  const showGate =
    loggedIn &&
    permReady &&
    permissionNeeded &&
    (forceOpen || autoGateVisible);

  return (
    <>
      <FloatingInAppBannerHost
        onPressBanner={(item) => {
          if (item.data) handleOpen({ title: item.title, body: item.body ?? null, data: item.data });
        }}
      />
      <PermissionBottomSheetShell visible={showGate} dismissible onDismiss={dismiss}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="notifications" size={32} color={MERCHANT_TEAL} />
        </View>

        <Text style={styles.title}>Enable notifications</Text>
        <Text style={styles.body}>
          Notifications are currently off for GatiMitra Partner. Turn them on so you receive new
          orders, ratings, and rider pickup alerts.
        </Text>

        <View style={styles.noteBox}>
          <Text style={styles.noteTitle}>What to do</Text>
          <View style={styles.noteRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <Text style={styles.noteText}>Tap Allow below</Text>
          </View>
          <View style={styles.noteRow}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>2</Text>
            </View>
            <Text style={styles.noteText}>
              {needsSettings
                ? "Turn ON the “Allow notifications” switch for GatiMitra Partner"
                : "Allow when your phone asks for permission"}
            </Text>
          </View>
        </View>

        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          onPress={() => void onAllow()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Allow"
        >
          <Text style={styles.btnText}>{busy ? "Please wait…" : "Allow"}</Text>
        </Pressable>

        <Pressable style={styles.later} onPress={dismiss} hitSlop={8}>
          <Text style={styles.laterText}>Not now</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
  },
  iconWrap: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "rgba(13, 148, 136, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontFamily: LORA,
    lineHeight: 21,
    color: "#475569",
    textAlign: "center",
    marginBottom: 18,
  },
  noteBox: {
    backgroundColor: "#F0FDFA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CCFBF1",
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  noteTitle: {
    fontSize: 12,
    fontFamily: LORA_BOLD,
    color: MERCHANT_TEAL,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: MERCHANT_TEAL,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: LORA_BOLD,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: LORA,
    color: "#334155",
    lineHeight: 19,
  },
  btn: {
    backgroundColor: MERCHANT_TEAL,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#0F766E",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.22,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: "#FFFFFF",
    fontFamily: LORA_BOLD,
    fontSize: 16,
  },
  later: { alignItems: "center", paddingVertical: 14 },
  laterText: {
    color: "#64748B",
    fontSize: 14,
    fontFamily: LORA_BOLD,
  },
});
