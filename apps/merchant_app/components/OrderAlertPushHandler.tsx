/**
 * Plays configured alert chime when a new-order push arrives (foreground / background JS alive).
 * When the app is fully killed, the OS plays the push notification's default sound.
 *
 * Uses the centralized push dispatcher + short-window dedupe so dual Expo/FCM
 * delivery cannot chime the same event twice.
 */
import { useEffect, useRef } from "react";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";
import { playIncomingOrderAlert } from "@/lib/playOrderAlertSound";

const DEDUPE_WINDOW_MS = 8000;
const recentChimes = new Map<string, number>();

function isNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order";
}

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

function shouldChimeOnce(key: string): boolean {
  const now = Date.now();
  for (const [k, at] of recentChimes) {
    if (now - at > DEDUPE_WINDOW_MS) recentChimes.delete(k);
  }
  const last = recentChimes.get(key);
  if (last != null && now - last < DEDUPE_WINDOW_MS) return false;
  recentChimes.set(key, now);
  return true;
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
      const sid = storeIdRef.current;
      if (!isNewOrderPush(data) || !sid) return;
      if (!shouldChimeOnce(chimeDedupeKey(data))) return;
      void playNewOrderChime(sid, settingsRef.current);
    });
  }, []);

  return null;
}
