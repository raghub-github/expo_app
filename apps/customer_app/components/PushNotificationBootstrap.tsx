/**
 * Registers Expo + native push tokens via the shared push controller,
 * handles foreground/background opens, optional rich in-app modal, and deep links.
 *
 * Expo Go cannot obtain remote FCM/Expo tokens (SDK 53+). We still mount this
 * host so campaign/in-app inbox polls can surface floating banners; the shared
 * controller soft-skips remote registration there.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { AppText } from "@/components/AppText";

import {
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  type AppStateStatus,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import {
  navigateFromPushData,
  usePushPermissionController,
  enqueueInAppBanner,
  enqueueInAppBannerFromPush,
  FloatingInAppBannerHost,
  isSystemShadeOnlyPush,
  loadInbox,
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
import { setCustomerPushUnregister } from "@/lib/customerPushUnregister";

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

/** Campaign inbox has no realtime channel — poll while foregrounded. */
const CAMPAIGN_INBOX_POLL_MS = 18_000;

export function PushNotificationBootstrap() {
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
  const permissionPromptedRef = useRef(false);
  const expoGo = Constants.appOwnership === "expo";

  const pushOptions = useMemo(
    () => ({
      apiBaseUrl,
      // Must match Firebase google-services.json + app.json package.
      androidPackageName: "com.gatimitra.customer",
      androidChannels: [...CUSTOMER_PUSH_CHANNELS],
      getAuth: () => {
        const { session: s, hydrated: h } = authRef.current;
        // Match Merchant: register as soon as we have a customer access token.
        if (!s?.accessToken || s.role !== "customer") return null;
        if (!h) return null;
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
      log: (message: string, extra?: Record<string, unknown>) => {
        if (extra) console.log(`[push:customer] ${message}`, extra);
        else console.log(`[push:customer] ${message}`);
      },
    }),
    [apiBaseUrl, handleOpen, handleForeground]
  );

  const { controller } = usePushPermissionController(pushOptions, {
    autoStart: true,
  });

  useEffect(() => {
    setCustomerPushUnregister((opts) =>
      controller.unregisterCurrent({ ...opts, role: "customer" })
    );
    return () => setCustomerPushUnregister(null);
  }, [controller]);

  // Foreground: we play CX sound ourselves — skip OS default chime (avoids double play).
  // Never import expo-notifications in Expo Go (SDK 53+ logs a hard error on import).
  useEffect(() => {
    if (expoGo) return;
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
  }, [expoGo]);

  // Re-sync tokens once auth hydrates / session appears (lifecycle may have
  // run earlier with getAuth() === null and skipped registration).
  // Returning users skip onboarding permissions — request OS permission here
  // when still undetermined/denied (same outcome as Merchant post-login gate).
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") {
      permissionPromptedRef.current = false;
      return;
    }
    controller.startLifecycle();
    void (async () => {
      let snap = await controller.refresh({ syncIfGranted: !expoGo });
      console.log("[push:customer] post-login refresh", {
        osStatus: snap.osStatus,
        syncStatus: snap.syncStatus,
        lastBackendSyncOk: snap.lastBackendSyncOk,
        hasExpo: !!snap.expoPushToken,
        hasNative: !!snap.nativePushToken,
        error: snap.error,
        expoGo,
      });
      if (expoGo) return;
      if (snap.osStatus === "granted") return;
      if (permissionPromptedRef.current) return;
      permissionPromptedRef.current = true;
      console.log("[push:customer] requesting notification permission after login");
      const result = await controller.requestOrOpenSettings();
      snap = result.snapshot;
      console.log("[push:customer] post-login permission result", {
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
      if (!hydrated || !session?.accessToken || session.role !== "customer") return;
      void controller.refresh({ syncIfGranted: !expoGo });
    });
    return () => sub.remove();
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo]);
  // In-app campaign delivery: when no Expo/FCM token is registered (Expo Go /
  // permission denied), admin sends still land in notification_dispatch_logs.
  // Poll the inbox and surface new rows as floating banners so announcements
  // are visible without a development build.
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;

    const seenIds = new Set<string>();
    let primed = false;
    let cancelled = false;

    const apiCfg = {
      baseUrl: apiBaseUrl,
      getAuthHeader: async () => {
        const token = authRef.current.session?.accessToken;
        return token ? `Bearer ${token}` : null;
      },
    };

    const poll = async () => {
      if (cancelled) return;
      if (AppState.currentState !== "active") return;
      try {
        const page = await loadInbox(apiCfg, { limit: 40 });
        if (cancelled) return;
        const items = page.items ?? [];
        if (!primed) {
          for (const item of items) {
            if (item.notification_id) seenIds.add(item.notification_id);
          }
          primed = true;
          return;
        }
        for (const item of items) {
          const id = item.notification_id?.trim();
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          if (item.clicked_at) continue;
          const title = (item.title ?? "").trim();
          if (!title) continue;
          const templateCode = item.template_code ?? "";
          if (isSystemShadeOnlyPush({
            template_code: templateCode,
            gmType: templateCode,
            admin_cx: templateCode.toUpperCase().startsWith("ADMIN_CX_"),
          })) {
            continue;
          }
          enqueueInAppBanner({
            id,
            title,
            body: item.body,
            deepLink: item.deep_link,
            templateCode: item.template_code,
            data: {
              notification_id: id,
              gmType: item.template_code ?? "",
              gmTitle: item.title ?? "",
              gmMessage: item.body ?? "",
              deepLink: item.deep_link ?? "",
              imageUrl: item.image_url ?? "",
            },
          });
        }
      } catch {
        // Best-effort — never block the app on inbox poll failures.
      }
    };

    void poll();
    const intervalId = setInterval(() => {
      void poll();
    }, CAMPAIGN_INBOX_POLL_MS);
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") void poll();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      sub.remove();
    };
  }, [hydrated, session?.accessToken, session?.role, apiBaseUrl]);

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
