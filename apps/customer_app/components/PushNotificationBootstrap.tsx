/**
 * Registers Expo + native push tokens via the shared push controller,
 * handles foreground/background opens, optional rich in-app modal, and deep links.
 *
 * Expo Go cannot obtain remote FCM/Expo tokens (SDK 53+). We still mount this
 * host so campaign/in-app inbox polls can surface floating banners; the shared
 * controller soft-skips remote registration there.
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

import {
  AppState,
  Modal,
  Platform,
  Alert,
  type AppStateStatus,
} from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Localization from "expo-localization";
import { useRouter } from "expo-router";
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
import { applyLiveProgressFromPush } from "@/components/LiveOrderProgressNotification";
import { isOrderLifecycleNotification } from "@/lib/notificationDedupe";
import { isCustomerOrderLifecyclePushData } from "@/lib/customer-push-tray-match";
import { liveProgressHandlerResult } from "@/lib/customerLiveOrderNotificationNative";
import { playCustomerNotificationSound } from "@/lib/playCustomerNotificationSound";
import { isRideServicePush } from "@/lib/isRideServicePush";
import {
  isWalletAffectingPush,
  refreshCustomerWallet,
} from "@/lib/refreshCustomerWallet";
import { useQueryClient } from "@tanstack/react-query";
import { setCustomerPushUnregister } from "@/lib/customerPushUnregister";
import { setNotificationPushAllowHandler } from "@/lib/notificationPushAllow";
import { useNotificationPushPromptStore } from "@/store/notificationPushPromptStore";
import { CampaignAnnouncementCard } from "@/components/campaign/CampaignAnnouncementCard";
import { applyServerCustomerOrderStatus } from "@/lib/apply-customer-order-status";
import {
  isCustomerOrderCompletionPush,
  statusFromCustomerLifecyclePush,
} from "@/lib/customer-order-status-machine";
import {
  announcementDedupeKey,
  isCustomerAnnouncementData,
  parseAnnouncementCampaign,
  shouldShowRichCampaignCard,
  OFFER_EXPIRED_MESSAGE,
  type AnnouncementCampaignPayload,
} from "@/lib/announcementCampaign";

/**
 * Ride-only CX chime channel (sound is immutable after first Android create).
 * Other customer channels keep the OS default so food/parcel stay quiet.
 */
/** Campaign inbox poll must not reset seen ids on remount (would replay history). */
const campaignInboxSeenByUser = new Map<string, Set<string>>();

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
const CAMPAIGN_INBOX_POLL_MS = 120_000;

export function PushNotificationBootstrap() {
  return <PushNotificationBootstrapInner />;
}

function PushNotificationBootstrapInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const showPrepDelayBanner = useOrderStore((s) => s.showPrepDelayBanner);

  const [campaignCard, setCampaignCard] = useState<AnnouncementCampaignPayload | null>(null);
  const campaignCardDataRef = useRef<Record<string, unknown> | null>(null);
  const routedKeysRef = useRef(new Set<string>());

  const handleOrderLifecyclePush = useCallback(
    (data: Record<string, unknown>) => {
      const orderId =
        typeof data.orderId === "string"
          ? data.orderId
          : typeof data.order_id === "string"
            ? data.order_id
            : "";
      const status = statusFromCustomerLifecyclePush(data);
      if (!orderId || !status) return;
      applyServerCustomerOrderStatus({
        queryClient,
        orderIds: [orderId],
        status,
      });
      void queryClient.invalidateQueries({ queryKey: ["order", orderId] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      if (isCustomerOrderCompletionPush(data) || isWalletAffectingPush(data)) {
        void refreshCustomerWallet(queryClient);
      }
    },
    [queryClient]
  );

  const handlePrepDelayPush = useCallback(
    (data: Record<string, unknown>) => {
      const gmType = typeof data.gmType === "string" ? data.gmType : "";
      if (gmType !== "ORDER_PREP_DELAY") return;
      const orderId = typeof data.orderId === "string" ? data.orderId : "";
      if (!orderId) return;
      const additionalMinutes = Number(data.additionalMinutes);
      const extraMins =
        Number.isFinite(additionalMinutes) && additionalMinutes > 0 ? additionalMinutes : 5;
      const etaMinutes = Number(data.etaMinutes);
      const gmMessage = typeof data.gmMessage === "string" ? data.gmMessage.trim() : "";
      const message =
        gmMessage ||
        buildPrepDelayMessage(
          extraMins,
          Number.isFinite(etaMinutes) ? etaMinutes : null
        );
      showPrepDelayBanner(orderId, message, 20_000, extraMins);
    },
    [showPrepDelayBanner]
  );

  const { apiBaseUrl } = getConfig();

  const routeCampaignOnce = useCallback(
    async (data: Record<string, unknown>, source: "open" | "cta") => {
      const isAnnouncement = isCustomerAnnouncementData(data);
      if (isAnnouncement) {
        const key = announcementDedupeKey(data);
        if (routedKeysRef.current.has(key)) return;
        routedKeysRef.current.add(key);
        setTimeout(() => routedKeysRef.current.delete(key), 10_000);
      }

      if (!authRef.current.hydrated) {
        const started = Date.now();
        while (Date.now() - started < 4000) {
          await new Promise((r) => setTimeout(r, 150));
          if (authRef.current.hydrated) break;
        }
      }

      const nid =
        typeof data.notification_id === "string"
          ? data.notification_id
          : typeof data.message_id === "string"
            ? data.message_id
            : "";
      const token = authRef.current.session?.accessToken;
      if (isAnnouncement && nid && /^[0-9a-f-]{36}$/i.test(nid) && token) {
        try {
          const res = await fetch(
            `${apiBaseUrl.replace(/\/$/, "")}/v1/notifications/${nid}/resolve-campaign`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ source }),
            },
          );
          if (res.ok) {
            const j = (await res.json()) as {
              expired?: boolean;
              deepLink?: string;
              fallbackDeepLink?: string;
              message?: string | null;
            };
            if (j.expired) {
              Alert.alert("Offer expired", j.message || OFFER_EXPIRED_MESSAGE);
              router.push((j.fallbackDeepLink || "/home") as never);
              return;
            }
            if (typeof j.deepLink === "string" && j.deepLink.startsWith("/")) {
              router.push(j.deepLink as never);
              return;
            }
          }
        } catch {
          /* offline — still try local resolve */
        }
      }
      navigateFromPushData(router, data);
    },
    [apiBaseUrl, router],
  );

  const handleOpen = useCallback(
    (payload: PushNotificationOpenPayload) => {
      handlePrepDelayPush(payload.data);
      handleOrderLifecyclePush(payload.data);
      void applyLiveProgressFromPush(payload.data);
      if (isWalletAffectingPush(payload.data)) {
        void refreshCustomerWallet(queryClient);
      }
      const isCta =
        Boolean(payload.actionIdentifier) &&
        payload.actionIdentifier !== "expo.modules.notifications.actions.DEFAULT";
      void routeCampaignOnce(payload.data, isCta ? "cta" : "open");
    },
    [handlePrepDelayPush, handleOrderLifecyclePush, queryClient, routeCampaignOnce]
  );

  const handleForeground = useCallback(
    (payload: PushNotificationOpenPayload) => {
      if (isRideServicePush(payload.data)) {
        void playCustomerNotificationSound();
      }
      handlePrepDelayPush(payload.data);
      handleOrderLifecyclePush(payload.data);
      if (isWalletAffectingPush(payload.data)) {
        void refreshCustomerWallet(queryClient);
      }
      if (isCustomerOrderLifecyclePushData(payload.data)) {
        void applyLiveProgressFromPush(payload.data);
        return;
      }
      enqueueInAppBannerFromPush(payload);
      if (!isCustomerAnnouncementData(payload.data)) return;
      const parsed = parseAnnouncementCampaign(
        payload.data,
        payload.title ?? "",
        payload.body ?? "",
      );
      if (!shouldShowRichCampaignCard(parsed)) return;
      campaignCardDataRef.current = payload.data;
      setCampaignCard(parsed);
    },
    [handlePrepDelayPush, handleOrderLifecyclePush, queryClient]
  );
  const authRef = useRef({ session, hydrated });
  authRef.current = { session, hydrated };
  const foregroundSyncAtRef = useRef(0);
  const expoGo = Constants.appOwnership === "expo";

  const evaluatePushPrompt = useCallback(
    async (snap: {
      expoPushToken?: string | null;
      nativePushToken?: string | null;
      lastBackendSyncOk?: boolean | null;
      osStatus?: string;
    }) => {
      const hasPushToken = Boolean(
        (snap.expoPushToken && snap.expoPushToken.length > 8) ||
          (snap.nativePushToken && snap.nativePushToken.length > 8)
      );
      const store = useNotificationPushPromptStore.getState();
      if (hasPushToken) {
        // Token present — never show the sheet. Backend sync may still retry.
        if (snap.lastBackendSyncOk !== false) {
          await store.markTokenRegistered();
        } else {
          store.setShowSheet(false);
        }
        return;
      }
      await store.markTokenMissing();
      await store.promptIfNeeded({ hasPushToken: false, expoGo });
    },
    [expoGo]
  );

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
    setNotificationPushAllowHandler(async () => {
      const store = useNotificationPushPromptStore.getState();
      store.beginAllow();
      try {
        const result = await controller.requestOrOpenSettings();
        let snap = result.snapshot;
        if (result.granted || snap.osStatus === "granted") {
          snap = await controller.syncTokens();
          if (!expoGo && !snap.nativePushToken) {
            await new Promise((r) => setTimeout(r, 1200));
            snap = await controller.syncTokens();
          }
        }
        const hasPushToken = Boolean(
          (snap.expoPushToken && snap.expoPushToken.length > 8) ||
            (snap.nativePushToken && snap.nativePushToken.length > 8)
        );
        if (hasPushToken && snap.lastBackendSyncOk !== false) {
          await store.markTokenRegistered();
          return true;
        }
        // Technical register failure — leave sheet dismissible; background sync continues.
        store.setShowSheet(false);
        return false;
      } finally {
        store.endAllow();
      }
    });
    return () => {
      setCustomerPushUnregister(null);
      setNotificationPushAllowHandler(null);
    };
  }, [controller, expoGo]);

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
          handleNotification: async (notification) => {
            const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
            if (liveProgressHandlerResult(data).suppress) {
              await applyLiveProgressFromPush(data);
            }
            const result = liveProgressHandlerResult(data);
            return {
              shouldShowAlert: result.shouldShowAlert,
              shouldPlaySound: false,
              shouldSetBadge: result.shouldSetBadge,
              shouldShowBanner: result.shouldShowBanner,
              shouldShowList: result.shouldShowList,
            };
          },
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expoGo]);

  // Sync tokens when auth is ready. Permission OS dialog is owned by the
  // notification sheet (Skip = 7-day cooldown) — do not auto-prompt here.
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") {
      return;
    }
    controller.startLifecycle();
    // Remount storms (Fast Refresh / Expo Go) were re-running refresh every few
    // seconds and heating the device — throttle hard syncs.
    const now = Date.now();
    if (now - (foregroundSyncAtRef.current || 0) < 12_000) {
      return;
    }
    foregroundSyncAtRef.current = now;
    void (async () => {
      let snap = await controller.refresh({ syncIfGranted: true });
      console.log("[push:customer] post-login refresh", {
        osStatus: snap.osStatus,
        syncStatus: snap.syncStatus,
        lastBackendSyncOk: snap.lastBackendSyncOk,
        hasExpo: !!snap.expoPushToken,
        hasNative: !!snap.nativePushToken,
        error: snap.error,
        expoGo,
      });
      if (snap.osStatus === "granted") {
        if (!expoGo && !snap.nativePushToken) {
          snap = await controller.syncTokens();
          console.log("[push:customer] native-retry sync", {
            syncStatus: snap.syncStatus,
            hasNative: !!snap.nativePushToken,
            error: snap.error,
          });
        }
      }
      await evaluatePushPrompt(snap);
    })();
  }, [hydrated, session?.accessToken, session?.role, controller, expoGo, evaluatePushPrompt]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s !== "active") return;
      if (!hydrated || !session?.accessToken || session.role !== "customer") return;
      // Throttle foreground sync — remount storms were heating the device.
      const now = Date.now();
      if (now - (foregroundSyncAtRef.current || 0) < 15_000) return;
      foregroundSyncAtRef.current = now;
      void (async () => {
        const snap = await controller.refresh({ syncIfGranted: true });
        const hasPushToken = Boolean(
          (snap.expoPushToken && snap.expoPushToken.length > 8) ||
            (snap.nativePushToken && snap.nativePushToken.length > 8)
        );
        if (hasPushToken && snap.lastBackendSyncOk !== false) {
          await useNotificationPushPromptStore.getState().markTokenRegistered();
        }
      })();
    });
    return () => sub.remove();
  }, [hydrated, session?.accessToken, session?.role, controller]);
  // In-app campaign delivery: when no Expo/FCM token is registered (Expo Go /
  // permission denied), admin sends still land in notification_dispatch_logs.
  // Poll the inbox and surface new rows as floating banners so announcements
  // are visible without a development build.
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;

    const userKey = session.userId ?? session.accessToken.slice(0, 24);
    let seenIds = campaignInboxSeenByUser.get(userKey);
    if (!seenIds) {
      seenIds = new Set<string>();
      campaignInboxSeenByUser.set(userKey, seenIds);
    }
    let primed = seenIds.size > 0;
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
          // Never convert historical order-status inbox rows into new banners.
          if (isOrderLifecycleNotification(item)) continue;
          const meta = item.metadata ?? {};
          const title =
            (typeof meta.liveTitle === "string" && meta.liveTitle.trim()) ||
            (item.title ?? "").trim();
          if (!title) continue;
          const templateCode = item.template_code ?? "";
          if (isSystemShadeOnlyPush({
            template_code: templateCode,
            gmType: templateCode,
            admin_cx: templateCode.toUpperCase().startsWith("ADMIN_CX_"),
            ...meta,
          })) {
            continue;
          }
          enqueueInAppBanner({
            id,
            title,
            body:
              (typeof meta.liveBody === "string" && meta.liveBody.trim()) ||
              item.body,
            deepLink: item.deep_link,
            templateCode: item.template_code,
            data: {
              ...meta,
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
  }, [hydrated, session?.accessToken, session?.role, session?.userId, apiBaseUrl]);

  return (
    <>
      <FloatingInAppBannerHost
        onPressBanner={(item) => {
          if (!item.data) return;
          void routeCampaignOnce(item.data, "open");
        }}
      />
      <Modal
        visible={!!campaignCard}
        transparent
        animationType="fade"
        onRequestClose={() => setCampaignCard(null)}
      >
        {campaignCard ? (
          <CampaignAnnouncementCard
            campaign={campaignCard}
            onClose={() => setCampaignCard(null)}
            onOpenTarget={() => {
              const data = campaignCardDataRef.current;
              setCampaignCard(null);
              if (data) void routeCampaignOnce(data, "open");
            }}
            onCta={() => {
              const data = campaignCardDataRef.current;
              setCampaignCard(null);
              if (data) void routeCampaignOnce(data, "cta");
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}
