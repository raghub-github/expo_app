/**
 * Live-orders ongoing notification — the Play-compliant replacement for the old
 * "floating bubble over other apps" (expo-floating-bubble).
 *
 * WHY THIS INSTEAD OF AN OVERLAY:
 * The previous FloatingOrdersManager drew a chat-head OVER OTHER APPS, which on
 * Android 14 forced a foreground service with `FOREGROUND_SERVICE_SPECIAL_USE`
 * (+ SYSTEM_ALERT_WINDOW). Google Play scrutinises those heavily and an order-
 * count overlay is a weak special-use case. An ONGOING notification delivers the
 * exact same value — a persistent, always-visible live order count reachable
 * from any app, one tap to manage — with ZERO special permissions and no
 * foreground service. It is also more reliable (overlays need a user-granted
 * "draw over other apps" permission and get killed by aggressive OEM battery
 * managers; a notification does not).
 *
 * WHAT STILL HANDLES THE OTHER PIECES (unchanged):
 *   • Instant new-order alert while backgrounded/killed → FCM push (heads-up
 *     over other apps) via NotificationSetup / OrderAlertPushHandler.
 *   • Full accept sheet on tap → IncomingOrderModal / IncomingOrderSheet.
 *   • In-app pill while using the app → FloatingPendingOrdersBar.
 * This component adds back only the persistent, cross-app live COUNT.
 *
 * Gated behind the same `settings.show_floating_orders` toggle the bubble used,
 * so merchants keep one switch for "show me my live order count".
 */

import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";
import { GatiMitraMerchant } from "@/constants/theme";

/** Stable id so every update REPLACES the row instead of stacking new ones. */
const ONGOING_ID = "merchant-live-orders-ongoing";
/** Dedicated LOW-importance channel: silent + collapsed, so frequent count updates never buzz. */
const CHANNEL_ID = "merchant_live_orders";
const POLL_MS = 15_000;
/** Where a tap lands — routed by NotificationSetup's existing `data.url` handler. */
const ORDERS_HREF = "/(tabs)/orders?tab=active";

function isExpoGo(): boolean {
  // expo-notifications' native module is unavailable in Expo Go (SDK 53+); guard
  // the dynamic import so we never throw there.
  return Constants.appOwnership === "expo";
}

export default function LiveOrdersOngoingNotification() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { settings } = useStoreSettings();
  const { isOnline } = useStoreStatus();

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef<number | null>(null);
  const channelReadyRef = useRef(false);
  const inFlightRef = useRef(false);

  const storeId = selectedStore?.id ?? null;
  const enabled =
    Platform.OS === "android" &&
    !!token &&
    !!storeId &&
    settings.show_floating_orders &&
    isOnline;

  useEffect(() => {
    if (isExpoGo()) return undefined;

    let cancelled = false;

    const loadNotifications = () => import("expo-notifications");

    async function ensureChannel(Notifications: typeof import("expo-notifications")) {
      if (channelReadyRef.current) return;
      try {
        await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Live order count",
          importance: Notifications.AndroidImportance.LOW, // silent, no heads-up on updates
          sound: undefined,
          vibrationPattern: undefined,
          enableVibrate: false,
          showBadge: true,
        });
        channelReadyRef.current = true;
      } catch {
        // channel creation is best-effort; posting still falls back to default
      }
    }

    async function dismiss() {
      lastCountRef.current = null;
      try {
        const Notifications = await loadNotifications();
        await Notifications.dismissNotificationAsync(ONGOING_ID);
      } catch {
        // best-effort
      }
    }

    async function showOrUpdate(count: number) {
      if (count === lastCountRef.current) return; // nothing changed — skip redundant re-post
      try {
        const Notifications = await loadNotifications();
        await ensureChannel(Notifications);
        await Notifications.scheduleNotificationAsync({
          identifier: ONGOING_ID,
          content: {
            title: `${count} active order${count === 1 ? "" : "s"}`,
            body: "Tap to manage your live orders",
            data: { type: "live_orders", url: ORDERS_HREF, screen: "orders" },
            color: GatiMitraMerchant.primary,
            // Ongoing = persistent + not swipe-dismissible while orders are live.
            sticky: true,
            autoDismiss: false,
            sound: undefined,
            ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
          },
          trigger: null,
        });
        lastCountRef.current = count;
      } catch {
        // best-effort; the FCM new-order push remains the primary alert
      }
    }

    async function tick() {
      if (cancelled || inFlightRef.current) return;
      if (!enabled || !token || !storeId) {
        await dismiss();
        return;
      }
      inFlightRef.current = true;
      try {
        const count = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;
        if (count > 0) await showOrUpdate(count);
        else await dismiss(); // no live orders → clear the ongoing row
      } catch {
        // keep the last shown count on a transient failure
      } finally {
        inFlightRef.current = false;
      }
    }

    if (!enabled) {
      void dismiss();
      return () => {
        cancelled = true;
      };
    }

    void tick();
    pollTimerRef.current = setInterval(() => void tick(), POLL_MS);

    // Refresh promptly when the app returns to the foreground (interval can lag).
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") void tick();
    });

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      appStateSub.remove();
      // Leave the row in place on unmount ONLY if still enabled+active; otherwise clear.
      if (!enabled) void dismiss();
    };
  }, [enabled, token, storeId]);

  return null;
}
