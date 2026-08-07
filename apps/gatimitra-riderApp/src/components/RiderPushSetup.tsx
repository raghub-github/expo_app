import { useEffect, useMemo, useRef, useCallback } from "react";
import Constants from "expo-constants";
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
import { setRiderPushUnregister } from "@/src/lib/riderPushUnregister";

/**
 * Registers Expo + native tokens via shared push controller (JWT role = rider).
 * Keeps rider-specific inbox, order invalidation, and deep-link callbacks.
 */
export function RiderPushSetup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const setPermissionStepGranted = usePermissionStore((s) => s.setPermissionStepGranted);

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      navigateFromPushData(router, {
        ...payload.data,
        appRole: "rider",
        orderPath:
          payload.data.orderId != null ? `/order/${String(payload.data.orderId)}` : undefined,
      });
    },
    [router]
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

      const type = typeof payload.data.type === "string" ? payload.data.type : "";
      if (
        type === "new_order" ||
        type === "order_assigned" ||
        type === "dispatch_offer" ||
        type === "incoming_order" ||
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
      androidPackageName:
        Constants.expoConfig?.android?.package || "com.gatimitra.rider",
      androidChannels: [
        { channelId: "default", name: "Orders & alerts", lightColor: "#0d9488" },
      ],
      getAuth: () => {
        const { session: s, hydrated: h } = authRef.current;
        if (!h || !s?.accessToken || s.role !== "rider") return null;
        return { accessToken: s.accessToken, role: "rider" as const };
      },
      onNotificationOpen: handleOpen,
      onForeground: handleForeground,
    }),
    [apiBaseUrl, handleOpen, handleForeground]
  );

  const { snapshot, controller } = usePushPermissionController(pushOptions);

  useEffect(() => {
    setRiderPushUnregister(() => controller.unregisterCurrent());
    return () => setRiderPushUnregister(null);
  }, [controller]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "rider") return;
    void controller.refresh({ syncIfGranted: true });
  }, [hydrated, session?.accessToken, session?.role, controller]);

  useEffect(() => {
    if (snapshot.osStatus === "granted") {
      void controller.syncTokens();
    }
  }, [snapshot.osStatus, controller]);

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
        if (item.data) {
          navigateFromPushData(router, {
            ...item.data,
            appRole: "rider",
            orderPath:
              item.data.orderId != null ? `/order/${String(item.data.orderId)}` : undefined,
          });
        }
      }}
    />
  );
}
