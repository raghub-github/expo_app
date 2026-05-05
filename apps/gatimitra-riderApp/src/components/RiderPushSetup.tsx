import { useEffect, useRef, useCallback } from "react";
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
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";

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

  return null;
}
