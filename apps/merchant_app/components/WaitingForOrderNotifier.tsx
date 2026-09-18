/**
 * Keeps the waiting-for-order inbox row in sync when the store becomes idle.
 * Tray sticky is owned by LiveOrdersOngoingNotification (state machine + dedupe).
 * This component only ensures/deletes the inbox row — never posts duplicate tray alerts.
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
          if (prevOnlineRef.current !== false) {
            await deleteWaitingForOrderNotifications(storeId, token);
            if (!cancelled) void refreshRef.current();
          }
          lastEnsureKeyRef.current = "";
          return;
        }

        if (activeCount > 0) {
          await deleteWaitingForOrderNotifications(storeId, token);
          if (!cancelled) void refreshRef.current();
          lastEnsureKeyRef.current = "";
          return;
        }

        // Online + zero active → ensure waiting-for-order inbox once per idle entry.
        const becameIdle =
          prevOnlineRef.current === false ||
          (prevActiveRef.current != null && prevActiveRef.current > 0) ||
          prevOnlineRef.current == null ||
          prevActiveRef.current == null;
        if (!becameIdle) return;

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
