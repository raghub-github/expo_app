/**
 * Registers a fresh Expo push token with the API (never trusts cached tokens),
 * handles foreground/background opens, optional rich in-app modal, and deep links.
 */

import { useEffect, useRef, useState, useCallback } from "react";
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
import Constants from "expo-constants";
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
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;
    await setNotificationHandlerDefaults();
    await ensureAndroidChannel({
      channelId: "customer_default",
      name: "Orders & updates",
      lightColor: "#14b8a6",
    });
    const token = await getFreshExpoPushToken();
    if (!token) return;
    if (lastRegisteredRef.current === token) return;
    const { apiBaseUrl } = getConfig();
    const res = await registerExpoPushTokenOnBackend(apiBaseUrl, session.accessToken, {
      expo_push_token: token,
      device_type: deviceType(),
    });
    if (res.ok) {
      lastRegisteredRef.current = token;
    }
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
            {richModal.title ? <Text style={styles.title}>{richModal.title}</Text> : null}
            {richModal.body ? <Text style={styles.body}>{richModal.body}</Text> : null}
            <Pressable style={styles.closeBtn} onPress={() => setRichModal(null)}>
              <Text style={styles.closeText}>Close</Text>
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
