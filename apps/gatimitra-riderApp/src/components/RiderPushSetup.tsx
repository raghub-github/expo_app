import { useEffect, useMemo, useRef, useCallback } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  navigateFromPushData,
  usePushPermissionController,
  setInAppBannerUiEnabled,
  rememberPushPresented,
  pushPresentationKey,
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
  RIDER_DISPATCH_FOOD_CHANNEL_ID,
  RIDER_DISPATCH_FOOD_SOUND,
  RIDER_DISPATCH_PARCEL_CHANNEL_ID,
  RIDER_DISPATCH_PARCEL_SOUND,
  RIDER_DISPATCH_RIDE_CHANNEL_ID,
  RIDER_DISPATCH_RIDE_SOUND,
  isRiderDispatchOfferPushData,
} from "@/src/lib/riderDispatchOfferChannel";
import { installRiderForegroundNotificationHandler } from "@/src/lib/riderNotificationHandler";
import {
  parseRiderNumericId,
  useRiderWalletFreezeLive,
} from "@/src/hooks/useRiderWalletFreezeLive";
import { useRiderBankStatusLive } from "@/src/hooks/useRiderBankStatusLive";
import { handleRiderWalletRelatedPush } from "@/src/lib/riderWalletPushSync";

// In-app notification pills OFF. Push / FCM / OS shade / token sync stay ON.
setInAppBannerUiEnabled(false);

/**
 * Registers Expo + native tokens via shared push controller (JWT role = rider).
 * Keeps rider-specific inbox, order invalidation, and deep-link callbacks.
 * Does NOT render in-app notification pills — OS shade is the only tray UI.
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
        const nid =
          typeof payload.data?.notification_id === "string"
            ? payload.data.notification_id
            : typeof payload.data?.notificationId === "string"
              ? payload.data.notificationId
              : null;
        rememberPushPresented(
          pushPresentationKey({
            notificationId: nid,
            templateCode: "RIDER_NEW_ORDER",
            orderId:
              typeof payload.data?.orderId === "string" ? payload.data.orderId : null,
          })
        );
        return;
      }

      // No in-app pill enqueue — OS shade owns presentation.
      const type = typeof payload.data.type === "string" ? payload.data.type : "";
      if (
        type === "new_order" ||
        type === "order_assigned" ||
        type.includes("order")
      ) {
        void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
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
      // Own foreground handler so OS shade stays on when pills are disabled.
      skipDefaultNotificationHandler: true,
      androidChannels: [
        {
          channelId: RIDER_DISPATCH_FOOD_CHANNEL_ID,
          name: "Incoming food orders",
          importance: 5,
          sound: RIDER_DISPATCH_FOOD_SOUND,
          vibrationPattern: [0, 450, 120, 450, 120, 450],
          lightColor: "#0d9488",
        },
        {
          channelId: RIDER_DISPATCH_PARCEL_CHANNEL_ID,
          name: "Incoming parcel orders",
          importance: 5,
          sound: RIDER_DISPATCH_PARCEL_SOUND,
          vibrationPattern: [0, 450, 120, 450, 120, 450],
          lightColor: "#0d9488",
        },
        {
          channelId: RIDER_DISPATCH_RIDE_CHANNEL_ID,
          name: "Incoming ride requests",
          importance: 5,
          sound: RIDER_DISPATCH_RIDE_SOUND,
          vibrationPattern: [0, 450, 120, 450, 120, 450],
          lightColor: "#0d9488",
        },
        {
          channelId: RIDER_DISPATCH_OFFER_CHANNEL_ID,
          name: "Incoming order requests",
          importance: 5,
          sound: RIDER_DISPATCH_OFFER_SOUND,
          vibrationPattern: [0, 450, 120, 450, 120, 450],
          lightColor: "#0d9488",
        },
        {
          channelId: "rider_default",
          name: "Orders & alerts",
          importance: 5,
          lightColor: "#0d9488",
        },
        { channelId: "default", name: "Orders & alerts", importance: 5, lightColor: "#0d9488" },
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

  // Install OS presentation handler immediately — never wait on pill host mount.
  useEffect(() => {
    void installRiderForegroundNotificationHandler();
  }, []);

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
    void installRiderForegroundNotificationHandler();
    const restoreHandler = setTimeout(() => {
      void installRiderForegroundNotificationHandler();
    }, 300);
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
      if (
        snap.lastBackendSyncOk === false ||
        snap.syncStatus === "error" ||
        (snap.error && String(snap.error).trim())
      ) {
        console.error("[push:rider] push_token_register_failed", {
          phase: "post-login-refresh",
          osStatus: snap.osStatus,
          syncStatus: snap.syncStatus,
          lastBackendSyncOk: snap.lastBackendSyncOk,
          error: snap.error,
        });
      }
      if (expoGo) return;
      if (snap.osStatus === "granted") {
        const afterSync = await controller.syncTokens();
        if (
          afterSync.lastBackendSyncOk === false ||
          afterSync.syncStatus === "error" ||
          (afterSync.error && String(afterSync.error).trim()) ||
          (!afterSync.expoPushToken && !afterSync.nativePushToken)
        ) {
          console.error("[push:rider] push_token_register_failed", {
            phase: "post-login-sync",
            osStatus: afterSync.osStatus,
            syncStatus: afterSync.syncStatus,
            lastBackendSyncOk: afterSync.lastBackendSyncOk,
            hasExpo: !!afterSync.expoPushToken,
            hasNative: !!afterSync.nativePushToken,
            error: afterSync.error,
          });
        }
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
      if (
        snap.lastBackendSyncOk === false ||
        snap.syncStatus === "error" ||
        (snap.error && String(snap.error).trim())
      ) {
        console.error("[push:rider] push_token_register_failed", {
          phase: "post-login-permission",
          osStatus: snap.osStatus,
          syncStatus: snap.syncStatus,
          lastBackendSyncOk: snap.lastBackendSyncOk,
          error: snap.error,
        });
      }
    })();
    return () => clearTimeout(restoreHandler);
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") return;
      if (!hydrated || !session?.accessToken || session.role !== "rider") return;
      void installRiderForegroundNotificationHandler();
      void (async () => {
        const snap = await controller.refresh({ syncIfGranted: !expoGo });
        if (
          snap.osStatus === "granted" &&
          !expoGo &&
          !snap.expoPushToken &&
          !snap.nativePushToken
        ) {
          const after = await controller.syncTokens();
          if (!after.expoPushToken && !after.nativePushToken) {
            console.error("[push:rider] push_token_register_failed", {
              phase: "resume-self-heal",
              osStatus: after.osStatus,
              syncStatus: after.syncStatus,
              error: after.error,
            });
          }
        }
      })();
    });
    return () => sub.remove();
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "rider") return;
    if (snapshot.osStatus !== "granted" || expoGo) return;
    void (async () => {
      const afterSync = await controller.syncTokens();
      if (
        afterSync.lastBackendSyncOk === false ||
        afterSync.syncStatus === "error" ||
        (afterSync.error && String(afterSync.error).trim()) ||
        (!afterSync.expoPushToken && !afterSync.nativePushToken)
      ) {
        console.error("[push:rider] push_token_register_failed", {
          phase: "os-granted-sync",
          osStatus: afterSync.osStatus,
          syncStatus: afterSync.syncStatus,
          lastBackendSyncOk: afterSync.lastBackendSyncOk,
          hasExpo: !!afterSync.expoPushToken,
          hasNative: !!afterSync.nativePushToken,
          error: afterSync.error,
        });
      }
    })();
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

  // No FloatingInAppBannerHost — pill UI must not gate push lifecycle.
  return null;
}
