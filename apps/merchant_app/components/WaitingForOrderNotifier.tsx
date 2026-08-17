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
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Depend only on status flips — not on `refresh` identity (avoids effect storms).
  useEffect(() => {
    if (!token || !storeId) return;
    let cancelled = false;
    void (async () => {
      try {
        if (!isOnline) {
          // Only clear + refresh when we actually transitioned online → offline
          // (or first mount while offline). Avoids spam while staying closed.
          if (prevOnlineRef.current !== false) {
            await deleteWaitingForOrderNotifications(storeId, token);
            if (!cancelled) void refreshRef.current();
          }
          return;
        }
        const active = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;
        if (active > 0) {
          await deleteWaitingForOrderNotifications(storeId, token);
          void refreshRef.current();
        } else if (prevOnlineRef.current === false && isOnline) {
          void refreshRef.current();
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
  }, [token, storeId, isOnline]);

  void WAITING_FOR_ORDER_TITLE;
  return null;
}
