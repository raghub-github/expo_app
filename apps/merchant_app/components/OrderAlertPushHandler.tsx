/**
 * Owns NEW_ORDER JS alert playback while the merchant app is ACTIVE.
 * Background/killed delivery uses native FCM + merchant_new_orders_alert
 * (bundled `notification` wav). Tapping transfers remaining repeats here.
 */
import { useEffect, useRef } from "react";
import Constants from "expo-constants";
import { AppState } from "react-native";
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
  extractNewOrderEventId,
  extractNewOrderIdFromPush,
  handleNewOrderNotificationTap,
  hydrateNewOrderAlertManager,
  rememberIncomingOrderAlertConfig,
  startedAtFromPush,
} from "@/lib/newOrderAlertManager";

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
    void (async () => {
      try {
        const { getLastNotificationOpenPayload } = await import("@gatimitra/expo-push-kit");
        const last = await getLastNotificationOpenPayload();
        if (!last || !isMerchantNewOrderPushData(last.data ?? {})) return;
        const sid = storeIdRef.current;
        const dev = sid ? await readDeviceOrderAlertsAsync(sid) : null;
        await handleNewOrderNotificationTap({
          data: last.data ?? {},
          notificationDate: startedAtFromPush(last.data ?? {}, last.date),
          settings: settingsRef.current,
          device: dev,
        });
      } catch {
        /* cold-start drain is best-effort; controller also emits onNotificationOpen */
      }
    })();

    const unsubFg = registerMerchantForegroundPushHandler(({ data, date }) => {
      if (!isMerchantNewOrderPushData(data)) return;
      const orderId = extractNewOrderIdFromPush(data);
      if (!orderId) return;
      const sid = storeIdRef.current;
      const source = AppState.currentState === "active" ? "FOREGROUND" : "BACKGROUND";
      void (async () => {
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
      })();
    });

    const unsubTap = registerMerchantNotificationResponseHandler((payload) => {
      if (!isMerchantNewOrderPushData(payload.data ?? {})) return;
      const sid = storeIdRef.current;
      void (async () => {
        const dev = sid ? await readDeviceOrderAlertsAsync(sid) : null;
        await handleNewOrderNotificationTap({
          data: payload.data ?? {},
          notificationDate: startedAtFromPush(payload.data ?? {}, payload.date),
          settings: settingsRef.current,
          device: dev,
        });
      })();
    });

    return () => {
      unsubFg();
      unsubTap();
    };
  }, []);

  return null;
}
