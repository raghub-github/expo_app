// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { useEffect, useRef, useCallback } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ensureAndroidChannel,
  getFreshExpoPushToken,
  navigateFromPushData,
  registerExpoPushTokenOnBackend,
  setNotificationHandlerDefaults,
  subscribeToPushNotificationResponse,
} from "@gatimitra/expo-push-kit";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import {
  notificationFromPushPayload,
  useNotificationInboxStore,
} from "@/src/stores/notificationInboxStore";
import { RIDER_AVAILABLE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";

function deviceType(): "ios" | "android" | "web" | "unknown" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return "unknown";
}

/**
 * Registers a fresh Expo token with /v1/push/register (JWT role = rider).
 */
export function RiderPushSetup() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const lastTokenRef = useRef<string | null>(null);

  const sync = useCallback(async () => {
    if (!hydrated || !session?.accessToken || session.role !== "rider") return;
    await setNotificationHandlerDefaults();
    await ensureAndroidChannel({
      channelId: "default",
      name: "Orders & alerts",
      lightColor: "#0d9488",
    });
    const token = await getFreshExpoPushToken();
    if (!token || lastTokenRef.current === token) return;
    const { apiBaseUrl } = getRiderAppConfig();
    const res = await registerExpoPushTokenOnBackend(apiBaseUrl, session.accessToken, {
      expo_push_token: token,
      device_type: deviceType(),
    });
    if (res.ok) lastTokenRef.current = token;
  }, [hydrated, session?.accessToken, session?.role]);

  useEffect(() => {
    void setNotificationHandlerDefaults();
  }, []);

  useEffect(() => {
    void sync();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void sync();
    });
    return () => sub.remove();
  }, [sync]);

  useEffect(() => {
    const a = subscribeToPushNotificationResponse(({ data }) => {
      navigateFromPushData(router, data);
    });
    return () => {
      a.remove();
    };
  }, [router]);

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const content = notification.request.content;
      const data = (content.data ?? {}) as Record<string, unknown>;
      const title =
        (typeof content.title === "string" && content.title) ||
        (typeof data.gmTitle === "string" ? data.gmTitle : "") ||
        "GatiMitra";
      const body =
        (typeof content.body === "string" && content.body) ||
        (typeof data.gmMessage === "string" ? data.gmMessage : "") ||
        "";
      useNotificationInboxStore.getState().add(notificationFromPushPayload(title, body, data));

      const type = typeof data.type === "string" ? data.type : "";
      if (
        type === "new_order" ||
        type === "order_assigned" ||
        type === "dispatch_offer" ||
        type === "incoming_order" ||
        type.includes("order")
      ) {
        void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
      }
    });
    return () => sub.remove();
  }, [queryClient]);

  return null;
}
