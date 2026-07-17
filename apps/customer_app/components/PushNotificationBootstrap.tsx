/**
 * Registers a fresh Expo push token with the API (never trusts cached tokens),
 * handles foreground/background opens, optional rich in-app modal, and deep links.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { AppText } from "@/components/AppText";

import { AppState, Modal, Platform, Pressable, StyleSheet, View, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  ensureAndroidChannel,
  getFreshExpoPushToken,
  navigateFromPushData,
  registerExpoPushTokenOnBackend,
  setNotificationHandlerDefaults,
  subscribeToForegroundNotifications,
  subscribeToPushNotificationResponse,
} from "@gatimitra/expo-push-kit";
import { useAuthStore } from "@/store/authStore";
import { useOrderStore } from "@/store/orderStore";
import { buildPrepDelayMessage } from "@/lib/order-eta-display";
import { getConfig } from "@/config/env";
import { colors } from "@/theme";

function deviceType(): "ios" | "android" | "web" | "unknown" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  if (Platform.OS === "web") return "web";
  return "unknown";
}

const isExpoGo = Constants.appOwnership === "expo";

export function PushNotificationBootstrap() {
  if (isExpoGo) return null;

  return <PushNotificationBootstrapInner />;
}

function PushNotificationBootstrapInner() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const lastRegisteredRef = useRef<string | null>(null);

  const [richModal, setRichModal] = useState<{
    title: string;
    body: string;
    imageUrl: string;
  } | null>(null);

  const showPrepDelayBanner = useOrderStore((s) => s.showPrepDelayBanner);

  const handlePrepDelayPush = useCallback(
    (data: Record<string, unknown>) => {
      const gmType = typeof data.gmType === "string" ? data.gmType : "";
      if (gmType !== "ORDER_PREP_DELAY") return;
      const orderId = typeof data.orderId === "string" ? data.orderId : "";
      if (!orderId) return;
      const additionalMinutes = Number(data.additionalMinutes);
      const etaMinutes = Number(data.etaMinutes);
      const gmMessage = typeof data.gmMessage === "string" ? data.gmMessage.trim() : "";
      const message =
        gmMessage ||
        buildPrepDelayMessage(
          Number.isFinite(additionalMinutes) ? additionalMinutes : 5,
          Number.isFinite(etaMinutes) ? etaMinutes : null
        );
      showPrepDelayBanner(orderId, message, 20_000);
    },
    [showPrepDelayBanner]
  );

  const syncToken = useCallback(async () => {
    // Reasons we might skip — logged so devs can see WHY the token never
    // registered from Metro / logcat instead of the previous silent no-op.
    if (!hydrated) {
      console.log("[push] skip: auth store not hydrated yet");
      return;
    }
    if (!session?.accessToken) {
      console.log("[push] skip: no session access token (user not logged in)");
      return;
    }
    if (session.role !== "customer") {
      console.log(`[push] skip: session role is '${session.role}', not 'customer'`);
      return;
    }
    await setNotificationHandlerDefaults();
    await ensureAndroidChannel({
      channelId: "customer_default",
      name: "Orders & updates",
      lightColor: "#14b8a6",
    });
    const token = await getFreshExpoPushToken();
    if (!token) {
      console.warn(
        "[push] getFreshExpoPushToken returned null — check: physical device, notification permission granted, EAS projectId in app.config.js, not running in Expo Go",
      );
      return;
    }
    if (lastRegisteredRef.current === token) {
      // Silent — already registered this exact token in this session.
      return;
    }
    const { apiBaseUrl } = getConfig();

    // Gather device fingerprint — best-effort. Any missing bit is sent as
    // null; server accepts + stores what it gets. Never throw here — if
    // even one call blows up we still want the token to register.
    let metadata: Record<string, string | null> = {};
    try {
      metadata = {
        device_model: Device.modelName ?? null,
        device_brand: Device.brand ?? null,
        os_name: Device.osName ?? Platform.OS,
        os_version: Device.osVersion ?? String(Platform.Version ?? ""),
        app_version:
          (Constants.expoConfig?.version as string | undefined) ??
          (Constants.expoConfig?.runtimeVersion as string | undefined) ??
          null,
        locale: Localization.getLocales?.()?.[0]?.languageTag ?? null,
        timezone: Localization.getCalendars?.()?.[0]?.timeZone ?? null,
      };
    } catch (e) {
      console.warn("[push] device metadata gather failed (non-fatal):", (e as Error)?.message);
    }

    // Retry with exponential backoff — a single transient failure (LAN
    // hiccup, backend restart mid-request) shouldn't leave the user with
    // no notifications forever. 3 attempts × up to ~7s.
    const attempts = [0, 1500, 5000];
    for (let i = 0; i < attempts.length; i++) {
      if (attempts[i]) await new Promise((r) => setTimeout(r, attempts[i]));
      const res = await registerExpoPushTokenOnBackend(apiBaseUrl, session.accessToken, {
        expo_push_token: token,
        device_type: deviceType(),
        ...metadata,
      });
      if (res.ok) {
        lastRegisteredRef.current = token;
        console.log(
          `[push] token registered (${metadata.device_model ?? "unknown device"}, ` +
            `${metadata.os_name ?? "?"} ${metadata.os_version ?? "?"}, app ${metadata.app_version ?? "?"})`,
        );
        return;
      }
      console.warn(
        `[push] register attempt ${i + 1}/${attempts.length} failed: status=${res.status} error=${res.error ?? "?"}`,
      );
      // Auth failure won't recover from retry — user needs to re-login.
      if (res.status === 401 || res.status === 403) break;
    }
    console.error(
      "[push] token registration gave up after all retries. Notifications will NOT arrive for this device until next app open.",
    );
  }, [hydrated, session?.accessToken, session?.role]);

  useEffect(() => {
    void setNotificationHandlerDefaults();
  }, []);

  useEffect(() => {
    void syncToken();
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") void syncToken();
    });
    return () => sub.remove();
  }, [syncToken]);

  useEffect(() => {
    const subOpen = subscribeToPushNotificationResponse(({ data }) => {
      handlePrepDelayPush(data);
      navigateFromPushData(router, data);
      const gmType = typeof data.gmType === "string" ? data.gmType : "";
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
      if (gmType === "RICH" && imageUrl.length > 0) {
        const title = typeof data.gmTitle === "string" ? data.gmTitle : "";
        const body = typeof data.gmMessage === "string" ? data.gmMessage : "";
        setRichModal({ title, body, imageUrl });
      }
    });

    const subFg = subscribeToForegroundNotifications(({ data }) => {
      handlePrepDelayPush(data);
      const gmType = typeof data.gmType === "string" ? data.gmType : "";
      const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
      if (gmType === "RICH" && imageUrl.length > 0) {
        const title = typeof data.gmTitle === "string" ? data.gmTitle : "";
        const body = typeof data.gmMessage === "string" ? data.gmMessage : "";
        setRichModal({ title, body, imageUrl });
      }
    });

    return () => {
      subOpen.remove();
      subFg.remove();
    };
  }, [router, handlePrepDelayPush]);

  return (
    <Modal visible={!!richModal} transparent animationType="fade" onRequestClose={() => setRichModal(null)}>
      {richModal ? (
        <Pressable style={styles.backdrop} onPress={() => setRichModal(null)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Image source={{ uri: richModal.imageUrl }} style={styles.image} contentFit="cover" />
            {richModal.title ? <AppText style={styles.title}>{richModal.title}</AppText> : null}
            {richModal.body ? <AppText style={styles.body}>{richModal.body}</AppText> : null}
            <Pressable style={styles.closeBtn} onPress={() => setRichModal(null)}>
              <AppText style={styles.closeText}>Close</AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  image: { width: "100%", height: 200, backgroundColor: "#f4f4f5" },
  title: { fontSize: 18, fontWeight: "700", paddingHorizontal: 16, paddingTop: 14, color: "#0f172a" },
  body: { fontSize: 15, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, color: "#475569" },
  closeBtn: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary[500],
    alignItems: "center",
  },
  closeText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
