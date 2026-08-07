/**
 * Read-only refresh helper for waiting-for-order inbox rows.
 * Creation/deletion is owned by the backend (store open/close + order pipeline).
 * This component only refreshes the inbox when online status flips.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useNotifications } from "@/context/NotificationContext";
import {
  WAITING_FOR_ORDER_TITLE,
  deleteWaitingForOrderNotifications,
} from "@/services/storeNotificationsApi";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";

export default function WaitingForOrderNotifier() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();
  const { refresh } = useNotifications();

  const storeId = selectedStore?.id ?? null;
  const prevOnlineRef = useRef<boolean | null>(null);

  // When store goes offline or active orders appear, ask backend to clear waiting row
  // (backend also clears on close; this covers pipeline becoming busy while online).
  useEffect(() => {
    if (!token || !storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!isOnline) {
          await deleteWaitingForOrderNotifications(storeId, token);
          if (!cancelled) void refresh();
          return;
        }
        const active = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;
        if (active > 0) {
          await deleteWaitingForOrderNotifications(storeId, token);
          void refresh();
        } else if (prevOnlineRef.current === false && isOnline) {
          // Store just went online — backend ensure already ran; refresh inbox.
          void refresh();
        }
      } catch {
        // ignore
      } finally {
        prevOnlineRef.current = isOnline;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, storeId, isOnline, refresh]);

  // Silence unused import warning for title constant used by services.
  void WAITING_FOR_ORDER_TITLE;
  return null;
}
