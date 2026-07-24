/**
 * Plays configured alert chime when a new-order push arrives (foreground / background JS alive).
 * When the app is fully killed, the OS plays the push notification's default sound.
 */
import { useEffect, useRef } from "react";
import Constants from "expo-constants";
import { subscribeToForegroundNotifications } from "@gatimitra/expo-push-kit";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import { playIncomingOrderAlert } from "@/lib/playOrderAlertSound";

function isNewOrderPush(data: Record<string, unknown>): boolean {
  const t = String(data.type ?? data.event ?? "").toLowerCase();
  return t === "merchant_new_order" || t === "new_order";
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

  useEffect(() => {
    // Expo Go: never touch expo-notifications (SDK 53+ logs a red ERROR on import).
    if (Constants.appOwnership === "expo") return;
    const sub = subscribeToForegroundNotifications(({ data }) => {
      if (!isNewOrderPush(data) || !storeId) return;
      void playNewOrderChime(storeId, settingsRef.current);
    });
    return () => sub.remove();
  }, [storeId]);

  // Background delivery (Android / iOS while JS process still alive).
  useEffect(() => {
    if (!storeId || Constants.appOwnership === "expo") return;
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const Notifications = await import("expo-notifications");
        const sub = Notifications.addNotificationReceivedListener((notification) => {
          const data = (notification.request.content.data ?? {}) as Record<string, unknown>;
          if (!isNewOrderPush(data)) return;
          void playNewOrderChime(storeId, settingsRef.current);
        });
        remove = () => sub.remove();
      } catch {
        /* expo-notifications unavailable */
      }
    })();
    return () => remove?.();
  }, [storeId]);

  return null;
}
