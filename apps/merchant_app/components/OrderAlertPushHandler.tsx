/**
 * NEW_ORDER sound wiring for production Partner builds.
 *
 *   OPEN       — mute OS; JS Incoming Order modal chime only
 *   BACKGROUND — OS `merchant_new_orders_alert` only (no JS until open/tap)
 *   KILLED     — FCM + channel sound (this handler never runs)
 *   TAP / open — dismiss tray/OS sound, then start remaining JS / modal chime
 */
import { useEffect, useRef } from "react";
import Constants from "expo-constants";
import { AppState, type AppStateStatus } from "react-native";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import {
  registerMerchantForegroundPushHandler,
  registerMerchantNotificationResponseHandler,
} from "@/lib/merchantPushDispatch";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";
import {
  continueOrStartNewOrderAlert,
  dismissNativeNewOrderAlerts,
  extractNewOrderEventId,
  extractNewOrderIdFromPush,
  handleNewOrderNotificationTap,
  hydrateNewOrderAlertManager,
  rememberIncomingOrderAlertConfig,
  startedAtFromPush,
} from "@/lib/newOrderAlertManager";
import { rememberRemoteNewOrderAlertPresented } from "@/lib/presentLocalNewOrderAlert";

export default function OrderAlertPushHandler() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { settings: acceptanceSettings } = useOrderAcceptanceSettings();
  const settingsRef = useRef(acceptanceSettings);
  settingsRef.current = acceptanceSettings;
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  useEffect(() => {
    const sid = storeIdRef.current;
    if (!sid) return;
    void (async () => {
      const dev = await readDeviceOrderAlertsAsync(sid);
      rememberIncomingOrderAlertConfig(settingsRef.current, dev);
    })();
  }, [storeId, acceptanceSettings]);

  useEffect(() => {
    if (Constants.appOwnership === "expo") return;
    void hydrateNewOrderAlertManager();

    async function playFromPushData(
      data: Record<string, unknown>,
      date: number | null | undefined,
      source: "FOREGROUND" | "BACKGROUND" | "COLD_START"
    ) {
      if (!isMerchantNewOrderPushData(data)) return;
      const orderId = extractNewOrderIdFromPush(data);
      if (!orderId) return;
      rememberRemoteNewOrderAlertPresented(orderId);
      const sid = storeIdRef.current;
      const dev = sid ? await readDeviceOrderAlertsAsync(sid) : null;
      if (sid && dev) rememberIncomingOrderAlertConfig(settingsRef.current, dev);
      await continueOrStartNewOrderAlert({
        orderId,
        eventId: extractNewOrderEventId(data, orderId),
        source,
        settings: settingsRef.current,
        device: dev,
        notificationDate: startedAtFromPush(data, date),
      });
    }

    /** Resume into app: stop OS tray chime first, then continue remaining JS. */
    async function drainPresentedNewOrders(source: "COLD_START") {
      try {
        const Notifications = await import("expo-notifications");
        const presented = await Notifications.getPresentedNotificationsAsync();
        for (const n of presented) {
          const data = (n.request?.content?.data ?? {}) as Record<string, unknown>;
          if (!isMerchantNewOrderPushData(data)) continue;
          const orderId = extractNewOrderIdFromPush(data);
          await dismissNativeNewOrderAlerts(orderId);
          // n.date is typed as `number` by the installed expo-notifications types, but tolerate a
          // Date at runtime; widen to unknown so both branches stay valid regardless of typings.
          const rawDate: unknown = n.date;
          const date =
            typeof rawDate === "number"
              ? rawDate
              : rawDate instanceof Date
                ? rawDate.getTime()
                : null;
          await playFromPushData(data, date, source);
        }
      } catch {
        /* best-effort */
      }
    }

    void (async () => {
      try {
        const { getLastNotificationOpenPayload } = await import("@gatimitra/expo-push-kit");
        const last = await getLastNotificationOpenPayload();
        if (last && isMerchantNewOrderPushData(last.data ?? {})) {
          const sid = storeIdRef.current;
          const dev = sid ? await readDeviceOrderAlertsAsync(sid) : null;
          await handleNewOrderNotificationTap({
            data: last.data ?? {},
            notificationDate: startedAtFromPush(last.data ?? {}, last.date),
            settings: settingsRef.current,
            device: dev,
          });
        }
      } catch {
        /* cold-start drain is best-effort; controller also emits onNotificationOpen */
      }
      await drainPresentedNewOrders("COLD_START");
    })();

    const unsubFg = registerMerchantForegroundPushHandler(({ data, date }) => {
      if (!isMerchantNewOrderPushData(data)) return;
      if (AppState.currentState !== "active") {
        // Background: OS channel owns sound — only seed session (no JS playback).
        void playFromPushData(data, date, "BACKGROUND");
        return;
      }
      // Open: dismiss any OS residual, then JS / modal chime only.
      const orderId = extractNewOrderIdFromPush(data);
      void (async () => {
        await dismissNativeNewOrderAlerts(orderId);
        await playFromPushData(data, date, "FOREGROUND");
      })();
    });

    const unsubTap = registerMerchantNotificationResponseHandler((payload) => {
      if (!isMerchantNewOrderPushData(payload.data ?? {})) return;
      const sid = storeIdRef.current;
      void (async () => {
        const dev = sid ? await readDeviceOrderAlertsAsync(sid) : null;
        // Tap: stop notification sound, then Incoming modal / remaining JS.
        await handleNewOrderNotificationTap({
          data: payload.data ?? {},
          notificationDate: startedAtFromPush(payload.data ?? {}, payload.date),
          settings: settingsRef.current,
          device: dev,
        });
      })();
    });

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      void drainPresentedNewOrders("COLD_START");
    };
    const appSub = AppState.addEventListener("change", onAppState);

    return () => {
      unsubFg();
      unsubTap();
      appSub.remove();
    };
  }, []);

  return null;
}
