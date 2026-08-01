/**
 * Registers Expo + native push tokens via the shared push controller,
 * handles foreground/background opens, optional rich in-app modal, and deep links.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AppText } from "@/components/AppText";

import { Modal, Platform, Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  navigateFromPushData,
  usePushPermissionController,
  enqueueInAppBannerFromPush,
  FloatingInAppBannerHost,
  type PushNotificationOpenPayload,
} from "@gatimitra/expo-push-kit";
import { useAuthStore } from "@/store/authStore";
import { useOrderStore } from "@/store/orderStore";
import { buildPrepDelayMessage } from "@/lib/order-eta-display";
import { getConfig } from "@/config/env";
import { colors } from "@/theme";
import { applyLiveProgressFromPush } from "@/components/LiveOrderProgressNotification";
import { playCustomerNotificationSound } from "@/lib/playCustomerNotificationSound";
import { isRideServicePush } from "@/lib/isRideServicePush";
import {
  isWalletAffectingPush,
  refreshCustomerWallet,
} from "@/lib/refreshCustomerWallet";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Ride-only CX chime channel (sound is immutable after first Android create).
 * Other customer channels keep the OS default so food/parcel stay quiet.
 */
const CX_SOUND = "cx_notification";
const CUSTOMER_PUSH_CHANNELS = [
  {
    channelId: "customer_ride_cx",
    name: "Ride updates",
    lightColor: "#14b8a6",
    sound: CX_SOUND,
  },
  { channelId: "customer_default", name: "Orders & updates", lightColor: "#14b8a6" },
  { channelId: "customer_live_order", name: "Live trip progress", lightColor: "#14b8a6" },
  { channelId: "customer_cx", name: "Orders & updates", lightColor: "#14b8a6" },
  { channelId: "default", name: "Orders & updates", lightColor: "#14b8a6" },
] as const;

const isExpoGo = Constants.appOwnership === "expo";

export function PushNotificationBootstrap() {
  if (isExpoGo) return null;
  return <PushNotificationBootstrapInner />;
}

function PushNotificationBootstrapInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const showPrepDelayBanner = useOrderStore((s) => s.showPrepDelayBanner);

  const [richModal, setRichModal] = useState<{
    title: string;
    body: string;
    imageUrl: string;
  } | null>(null);

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

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      handlePrepDelayPush(payload.data);
      void applyLiveProgressFromPush(payload.data);
      if (isWalletAffectingPush(payload.data)) {
        void refreshCustomerWallet(queryClient);
      }
      navigateFromPushData(router, payload.data);
      const gmType = typeof payload.data.gmType === "string" ? payload.data.gmType : "";
      const imageUrl =
        typeof payload.data.imageUrl === "string" ? payload.data.imageUrl.trim() : "";
      if (gmType === "RICH" && imageUrl.length > 0) {
        setRichModal({
          title: typeof payload.data.gmTitle === "string" ? payload.data.gmTitle : "",
          body: typeof payload.data.gmMessage === "string" ? payload.data.gmMessage : "",
          imageUrl,
        });
      }
    },
    [handlePrepDelayPush, queryClient, router]
  );

  const handleForeground = useCallback(
    (payload: PushNotificationOpenPayload) => {
      // CX chime only for ride-service floating updates (accept / nearby / drop / …).
      if (isRideServicePush(payload.data)) {
        void playCustomerNotificationSound();
      }
      handlePrepDelayPush(payload.data);
      void applyLiveProgressFromPush(payload.data);
      if (isWalletAffectingPush(payload.data)) {
        void refreshCustomerWallet(queryClient);
      }
      enqueueInAppBannerFromPush(payload);
      const gmType = typeof payload.data.gmType === "string" ? payload.data.gmType : "";
      const imageUrl =
        typeof payload.data.imageUrl === "string" ? payload.data.imageUrl.trim() : "";
      if (gmType === "RICH" && imageUrl.length > 0) {
        setRichModal({
          title: typeof payload.data.gmTitle === "string" ? payload.data.gmTitle : "",
          body: typeof payload.data.gmMessage === "string" ? payload.data.gmMessage : "",
          imageUrl,
        });
      }
    },
    [handlePrepDelayPush, queryClient]
  );

  const { apiBaseUrl } = getConfig();
  const authRef = useRef({ session, hydrated });
  authRef.current = { session, hydrated };

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      androidPackageName: Constants.expoConfig?.android?.package,
      androidChannels: [...CUSTOMER_PUSH_CHANNELS],
      getAuth: () => {
        const { session: s, hydrated: h } = authRef.current;
        if (!h || !s?.accessToken || s.role !== "customer") return null;
        return { accessToken: s.accessToken, role: "customer" as const };
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
        locale: Localization.getLocales?.()?.[0]?.languageTag ?? null,
        timezone: Localization.getCalendars?.()?.[0]?.timeZone ?? null,
      }),
      onNotificationOpen: handleOpen,
      onForeground: handleForeground,
    }),
    [apiBaseUrl, handleOpen, handleForeground]
  );

  const { controller } = usePushPermissionController(pushOptions);

  // Foreground: we play CX sound ourselves — skip OS default chime (avoids double play).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-sync tokens once auth hydrates / session appears (lifecycle may have
  // run earlier with getAuth() === null and skipped registration).
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;
    void controller.refresh({ syncIfGranted: true });
  }, [hydrated, session?.accessToken, session?.role, controller]);

  return (
    <>
      <FloatingInAppBannerHost
        onPressBanner={(item) => {
          if (item.data) navigateFromPushData(router, item.data);
        }}
      />
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
    </>
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
