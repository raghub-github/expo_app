/**
 * Plays configured alert chime when a new-order push arrives while the app is
 * foregrounded. Background/killed delivery uses the Android notification
 * channel sound (merchant_new_orders_alert) — do not double-chime from JS.
 *
 * Uses the centralized push dispatcher + shared order-key dedupe so dual
 * Expo/FCM delivery cannot chime the same event twice (also shares with modal).
 */
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";
import { playIncomingOrderAlert } from "@/lib/playOrderAlertSound";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";
import { claimNewOrderAlertSound } from "@/lib/newOrderAlertSoundDedupe";

function chimeDedupeKey(data: Record<string, unknown>): string {
  const orderId =
    data.foodOrderId ??
    data.orderId ??
    data.order_id ??
    data.notification_id ??
    data.notificationId ??
    "";
  return String(orderId || "new_order");
}

async function playNewOrderChime(
  storeId: number,
  settings: Parameters<typeof playIncomingOrderAlert>[0]
): Promise<void> {
  const dev = await readDeviceOrderAlertsAsync(storeId);
  if (!dev.orderAlertsEnabled || !dev.soundAlertsEnabled) return;
  await playIncomingOrderAlert(settings, dev);
}

export default function OrderAlertPushHandler() {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { settings: acceptanceSettings } = useOrderAcceptanceSettings();
  const settingsRef = useRef(acceptanceSettings);
  settingsRef.current = acceptanceSettings;
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  useEffect(() => {
    if (Constants.appOwnership === "expo") return;
    return registerMerchantForegroundPushHandler(({ data }) => {
      // Killed/background: OS plays channel sound. Only chime from JS when active.
      if (AppState.currentState !== "active") return;
      const sid = storeIdRef.current;
      if (!isMerchantNewOrderPushData(data) || !sid) return;
      if (!claimNewOrderAlertSound(chimeDedupeKey(data))) return;
      void playNewOrderChime(sid, settingsRef.current);
    });
  }, []);

  return null;
}
