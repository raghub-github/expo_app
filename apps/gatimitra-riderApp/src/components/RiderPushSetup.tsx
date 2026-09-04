import { useEffect, useMemo, useRef, useCallback } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  navigateFromPushData,
  usePushPermissionController,
  enqueueInAppBannerFromPush,
  FloatingInAppBannerHost,
  type PushNotificationOpenPayload,
} from "@gatimitra/expo-push-kit";
import { useSessionStore } from "@/src/stores/sessionStore";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { getRiderAppConfig } from "@/src/config/env";
import {
  notificationFromPushPayload,
  useNotificationInboxStore,
} from "@/src/stores/notificationInboxStore";
import { RIDER_AVAILABLE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";
import { ingestIncomingDispatchOffer } from "@/src/lib/ingestIncomingDispatchOffer";
import { setRiderPushUnregister } from "@/src/lib/riderPushUnregister";
import { setRiderPushRefresh } from "@/src/lib/riderPushRefresh";
import {
  RIDER_DISPATCH_OFFER_CHANNEL_ID,
  RIDER_DISPATCH_OFFER_SOUND,
  isRiderDispatchOfferPushData,
} from "@/src/lib/riderDispatchOfferChannel";
import {
  parseRiderNumericId,
  useRiderWalletFreezeLive,
} from "@/src/hooks/useRiderWalletFreezeLive";
import { useRiderBankStatusLive } from "@/src/hooks/useRiderBankStatusLive";
import { handleRiderWalletRelatedPush } from "@/src/lib/riderWalletPushSync";

/**
 * Registers Expo + native tokens via shared push controller (JWT role = rider).
 * Keeps rider-specific inbox, order invalidation, and deep-link callbacks.
 * Package + Firebase client must be `com.gatimitra.rider` (same as Merchant pattern).
 */
export function RiderPushSetup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const setPermissionStepGranted = usePermissionStore((s) => s.setPermissionStepGranted);
  const permissionPromptedRef = useRef(false);
  const expoGo = Constants.appOwnership === "expo";
  const riderId = parseRiderNumericId(session);
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useRiderWalletFreezeLive({
    riderId,
    accessToken: session?.accessToken ?? null,
    enabled: Boolean(hydrated && session?.accessToken && session.role === "rider" && riderId),
    queryClient,
  });

  useRiderBankStatusLive({
    riderId,
    accessToken: session?.accessToken ?? null,
    enabled: Boolean(hydrated && session?.accessToken && session.role === "rider" && riderId),
    queryClient,
  });

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      handleRiderWalletRelatedPush(
        queryClient,
        sessionRef.current,
        payload.data ?? {},
        typeof payload.body === "string" ? payload.body : null,
      );
      const data = payload.data ?? {};
      if (isRiderDispatchOfferPushData(data)) {
        ingestIncomingDispatchOffer(
          queryClient,
          typeof data.orderId === "string" ? data.orderId : undefined,
          "push_open"
        );
        router.replace("/(tabs)/orders");
        return;
      }
      navigateFromPushData(router, {
        ...data,
        appRole: "rider",
        orderPath:
          data.orderId != null ? `/order/${String(data.orderId)}` : undefined,
      });
    },
    [router, queryClient]
  );

  const handleForeground = useCallback(
    (payload: PushNotificationOpenPayload) => {
      const title =
        (typeof payload.title === "string" && payload.title) ||
        (typeof payload.data.gmTitle === "string" ? payload.data.gmTitle : "") ||
        "GatiMitra";
      const body =
        (typeof payload.body === "string" && payload.body) ||
        (typeof payload.data.gmMessage === "string" ? payload.data.gmMessage : "") ||
        "";
      useNotificationInboxStore.getState().add(notificationFromPushPayload(title, body, payload.data));
      enqueueInAppBannerFromPush(payload);

      handleRiderWalletRelatedPush(
        queryClient,
        sessionRef.current,
        payload.data ?? {},
        body,
      );

      if (isRiderDispatchOfferPushData(payload.data ?? {})) {
        ingestIncomingDispatchOffer(
          queryClient,
          typeof payload.data?.orderId === "string" ? payload.data.orderId : undefined,
          "push_foreground"
        );
      } else {
        const type = typeof payload.data.type === "string" ? payload.data.type : "";
        if (
          type === "new_order" ||
          type === "order_assigned" ||
          type.includes("order")
        ) {
          void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
        }
      }
    },
    [queryClient]
  );

  const { apiBaseUrl } = getRiderAppConfig();
  const authRef = useRef({ session, hydrated });
  authRef.current = { session, hydrated };

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      androidPackageName: "com.gatimitra.rider",
      androidChannels: [
        {
          channelId: RIDER_DISPATCH_OFFER_CHANNEL_ID,
          name: "Incoming order requests",
          importance: 5,
          sound: RIDER_DISPATCH_OFFER_SOUND,
          vibrationPattern: [0, 450, 120, 450, 120, 450],
          lightColor: "#0d9488",
        },
        { channelId: "default", name: "Orders & alerts", lightColor: "#0d9488" },
        { channelId: "rider_default", name: "Orders & alerts", lightColor: "#0d9488" },
      ],
      getAuth: () => {
        const { session: s, hydrated: h } = authRef.current;
        if (!h || !s?.accessToken || s.role !== "rider") return null;
        return { accessToken: s.accessToken, role: "rider" as const };
      },
      collectDeviceMetadata: async () => ({
        device_model: Device.modelName ?? null,
        device_brand: Device.brand ?? null,
        os_name: Device.osName ?? Platform.OS,
        os_version: Device.osVersion ?? String(Platform.Version ?? ""),
        app_version:
          (Constants.expoConfig?.version as string | undefined) ??
          (Constants.expoConfig?.runtimeVersion as string | undefined) ??
          null,
        locale: Intl.DateTimeFormat().resolvedOptions().locale ?? null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null,
      }),
      onNotificationOpen: handleOpen,
      onForeground: handleForeground,
      log: (message: string, extra?: Record<string, unknown>) => {
        if (extra) console.log(`[push:rider] ${message}`, extra);
        else console.log(`[push:rider] ${message}`);
      },
    }),
    [apiBaseUrl, handleOpen, handleForeground]
  );

  const { snapshot, controller } = usePushPermissionController(pushOptions, {
    autoStart: true,
  });

  useEffect(() => {
    setRiderPushUnregister((opts) =>
      controller.unregisterCurrent({ ...opts, role: "rider" })
    );
    return () => setRiderPushUnregister(null);
  }, [controller]);

  useEffect(() => {
    setRiderPushRefresh(async () => {
      const snap = await controller.refresh({ syncIfGranted: !expoGo });
      console.log("[push:rider] refresh after permission grant", {
        osStatus: snap.osStatus,
        syncStatus: snap.syncStatus,
        lastBackendSyncOk: snap.lastBackendSyncOk,
        hasExpo: !!snap.expoPushToken,
        hasNative: !!snap.nativePushToken,
        error: snap.error,
      });
    });
    return () => setRiderPushRefresh(null);
  }, [controller, expoGo]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "rider") {
      permissionPromptedRef.current = false;
      return;
    }
    controller.startLifecycle();
    void (async () => {
      let snap = await controller.refresh({ syncIfGranted: !expoGo });
      console.log("[push:rider] post-login refresh", {
        osStatus: snap.osStatus,
        syncStatus: snap.syncStatus,
        lastBackendSyncOk: snap.lastBackendSyncOk,
        hasExpo: !!snap.expoPushToken,
        hasNative: !!snap.nativePushToken,
        error: snap.error,
        expoGo,
      });
      if (expoGo) return;
      if (snap.osStatus === "granted") {
        await controller.syncTokens();
        return;
      }
      // Returning riders who skipped /(permissions) still need a grant + register.
      if (permissionPromptedRef.current) return;
      permissionPromptedRef.current = true;
      console.log("[push:rider] requesting notification permission after login");
      const result = await controller.requestOrOpenSettings();
      snap = result.snapshot;
      console.log("[push:rider] post-login permission result", {
        granted: result.granted,
        openedSettings: result.openedSettings,
        osStatus: snap.osStatus,
        syncStatus: snap.syncStatus,
        lastBackendSyncOk: snap.lastBackendSyncOk,
        hasExpo: !!snap.expoPushToken,
        hasNative: !!snap.nativePushToken,
        error: snap.error,
      });
    })();
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") return;
      if (!hydrated || !session?.accessToken || session.role !== "rider") return;
      void controller.refresh({ syncIfGranted: !expoGo });
    });
    return () => sub.remove();
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "rider") return;
    if (snapshot.osStatus !== "granted" || expoGo) return;
    void controller.syncTokens();
  }, [snapshot.osStatus, controller, hydrated, session?.accessToken, session?.role, expoGo]);

  useEffect(() => {
    const granted = snapshot.osStatus === "granted";
    setPermissionStepGranted("notifications", granted);
    const prev = usePermissionStore.getState().permissions;
    const notifStatus = granted
      ? "granted"
      : snapshot.osStatus === "blocked"
        ? "blocked"
        : snapshot.osStatus === "undetermined"
          ? "undetermined"
          : "denied";
    if (prev) {
      usePermissionStore.getState().setPermissions({
        ...prev,
        notifications: notifStatus,
      });
    }
  }, [snapshot.osStatus, setPermissionStepGranted]);

  return (
    <FloatingInAppBannerHost
      onPressBanner={(item) => {
        if (!item.data) return;
        if (isRiderDispatchOfferPushData(item.data)) {
          ingestIncomingDispatchOffer(
            queryClient,
            typeof item.data.orderId === "string" ? item.data.orderId : undefined,
            "push_banner"
          );
          router.replace("/(tabs)/orders");
          return;
        }
        navigateFromPushData(router, {
          ...item.data,
          appRole: "rider",
          orderPath:
            item.data.orderId != null ? `/order/${String(item.data.orderId)}` : undefined,
        });
      }}
    />
  );
}
