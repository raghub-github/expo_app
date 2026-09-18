/**
 * Expo Go new-order fallback (SDK 53+ has no remote FCM in Expo Go).
 *
 * Production / dev client: backend FCM owns tray + channel sound — this is idle.
 * Expo Go: when a CREATED order appears on the board (realtime / poll), schedule a
 * local heads-up with default sound and start the JS chime (plays in silent mode).
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { useOrdersContext } from "@/context/OrdersContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useOrderAcceptanceSettings } from "@/hooks/useOrderAcceptanceSettings";
import { readDeviceOrderAlertsAsync } from "@/lib/deviceOrderAlerts";
import { presentLocalNewOrderAlert } from "@/lib/presentLocalNewOrderAlert";
import {
  continueOrStartNewOrderAlert,
  extractNewOrderEventId,
  rememberIncomingOrderAlertConfig,
} from "@/lib/newOrderAlertManager";
import { installMerchantForegroundNotificationHandler } from "@/lib/merchantNotificationHandler";
import { isIncomingOrderDismissed } from "@/lib/incomingOrderDismissed";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function BackgroundNewOrderLocalAlert() {
  const { orders, loading, refetch } = useOrdersContext();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { settings } = useOrderAcceptanceSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const storeIdRef = useRef(storeId);
  storeIdRef.current = storeId;

  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  // Keep OS presentation rules installed in Expo Go (local alerts).
  useEffect(() => {
    if (!isExpoGo()) return;
    void installMerchantForegroundNotificationHandler();
  }, []);

  // Expo Go: poll even while backgrounded — Android often suspends realtime.
  useEffect(() => {
    if (!isExpoGo() || !storeId) return;
    const id = setInterval(() => {
      void refetch();
    }, 12_000);
    return () => clearInterval(id);
  }, [storeId, refetch]);

  useEffect(() => {
    if (!isExpoGo() || Platform.OS === "web") return;

    const created = orders.filter(
      (o) => o.status === "created" && !String(o.id).startsWith("core-")
    );

    if (!seededRef.current) {
      // Wait until first board load settles so we don't alert for stale CREATED rows.
      if (loading && orders.length === 0) return;
      for (const o of created) seenRef.current.add(o.id);
      seededRef.current = true;
      return;
    }

    for (const order of created) {
      if (seenRef.current.has(order.id)) continue;
      // Merchant already accepted / rejected / X-dismissed — never re-chime or re-tray.
      if (isIncomingOrderDismissed(order.ordersCoreId)) {
        seenRef.current.add(order.id);
        continue;
      }
      seenRef.current.add(order.id);

      const orderId = String(order.id);
      const displayId = order.formattedOrderId ?? orderId;
      const sid = storeIdRef.current;

      void (async () => {
        try {
          await presentLocalNewOrderAlert({
            orderId,
            displayId,
            storeId: sid,
          });
        } catch {
          /* local schedule best-effort */
        }

        // JS chime works in phone silent mode; OS default may still be muted.
        try {
          const device = sid ? await readDeviceOrderAlertsAsync(sid) : null;
          if (sid && device) {
            rememberIncomingOrderAlertConfig(settingsRef.current, device);
          }
          await continueOrStartNewOrderAlert({
            orderId,
            eventId: extractNewOrderEventId(
              {
                template_code: "MERCHANT_NEW_ORDER",
                foodOrderId: orderId,
                localFallback: true,
              },
              orderId
            ),
            // Expo Go has no Partner FCM channel sound — JS owns the chime
            // (playsInSilentMode) even while backgrounded.
            source: "FOREGROUND",
            settings: settingsRef.current,
            device,
            notificationDate: Date.now(),
          });
        } catch {
          /* JS alert best-effort */
        }
      })();
    }

    // Keep ids for orders that left CREATED so a laggy refetch still showing
    // CREATED cannot treat them as brand-new and re-fire sound/modal.
    // (Re-offers after a true cancel use a new food row id.)
  }, [orders, loading]);

  return null;
}
