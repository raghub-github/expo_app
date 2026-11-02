/**
 * Keeps the waiting-for-order inbox row in sync when the store becomes idle.
 * Tray sticky is owned by LiveOrdersOngoingNotification (state machine + dedupe).
 * This component only ensures/deletes the inbox row — never posts duplicate tray alerts.
 *
 * Critical: cold start / remount must NOT call ensure again while already online+idle.
 * Only real transitions (offline→online idle, or active→idle) create/ensure the inbox row.
 */

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useNotifications } from "@/context/NotificationContext";
import { useOrders } from "@/hooks/useOrders";
import { isActiveMerchantOrderStage } from "@/lib/merchantActiveOrders";
import {
  ensureWaitingForOrderNotification,
  deleteWaitingForOrderNotifications,
} from "@/services/storeNotificationsApi";

export default function WaitingForOrderNotifier() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();
  const { refresh } = useNotifications();
  const { orders } = useOrders();

  const storeId = selectedStore?.id ?? null;
  const activeCount = useMemo(
    () => orders.filter((o) => isActiveMerchantOrderStage(o.status)).length,
    [orders]
  );

  const prevOnlineRef = useRef<boolean | null>(null);
  const prevActiveRef = useRef<number | null>(null);
  const ensureInFlightRef = useRef(false);
  const lastEnsureKeyRef = useRef<string>("");
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!token || !storeId) return;
    let cancelled = false;

    void (async () => {
      try {
        if (!isOnline) {
          if (prevOnlineRef.current === true) {
            await deleteWaitingForOrderNotifications(storeId, token);
            if (!cancelled) void refreshRef.current();
          }
          lastEnsureKeyRef.current = "";
          return;
        }

        if (activeCount > 0) {
          if (prevActiveRef.current === 0 || prevActiveRef.current == null) {
            // Entering active — clear idle inbox once.
            await deleteWaitingForOrderNotifications(storeId, token);
            if (!cancelled) void refreshRef.current();
          } else if (prevActiveRef.current != null && prevActiveRef.current > 0) {
            // Already had actives — keep cleared.
            await deleteWaitingForOrderNotifications(storeId, token);
          }
          lastEnsureKeyRef.current = "";
          return;
        }

        // Online + zero active.
        // Only ensure on a real transition into idle — never on cold start / remount
        // when we have no prior snapshot (that re-created inbox + felt like a new push).
        const becameIdleFromOffline = prevOnlineRef.current === false;
        const becameIdleFromActive =
          prevActiveRef.current != null && prevActiveRef.current > 0;
        if (!becameIdleFromOffline && !becameIdleFromActive) {
          return;
        }

        const ensureKey = `${storeId}:idle`;
        if (lastEnsureKeyRef.current === ensureKey || ensureInFlightRef.current) return;
        ensureInFlightRef.current = true;
        try {
          await ensureWaitingForOrderNotification(storeId, token);
          lastEnsureKeyRef.current = ensureKey;
          if (!cancelled) void refreshRef.current();
        } finally {
          ensureInFlightRef.current = false;
        }
      } catch {
        // ignore — tray sticky still owned by LiveOrdersOngoingNotification
      } finally {
        if (!cancelled) {
          prevOnlineRef.current = isOnline;
          prevActiveRef.current = activeCount;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, storeId, isOnline, activeCount]);

  return null;
}
