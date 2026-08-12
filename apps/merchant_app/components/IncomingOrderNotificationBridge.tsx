/**
 * Expo Go has no remote push — but the inbox notification row is written at placement.
 * Poll notifications and, on a new CREATED order row, fetch that food order, upsert
 * into the live board, and open the accept sheet. This recovers the path when
 * postgres_changes/realtime is dead and food-orders list was stuck empty.
 */

import { useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useNotifications } from "@/context/NotificationContext";
import { useIncomingOrderSheet } from "@/context/IncomingOrderSheetContext";
import { useOrders } from "@/hooks/useOrders";
import { mapApiOrder, type OrderRecord } from "@/lib/orderRecord";
import { fetchFoodOrder } from "@/services/ordersApi";
import { isNewOrderAcceptNotification } from "@/lib/merchant-notification-display";
import type { MerchantNotification } from "@/context/NotificationContext";

import { AppState } from "react-native";

export default function IncomingOrderNotificationBridge() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { notifications, refresh } = useNotifications();
  const { upsertOrder } = useOrders();
  const { openIncomingOrderSheet } = useIncomingOrderSheet();

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const bootstrappedRef = useRef(false);
  const openingRef = useRef<Set<string>>(new Set());
  const tokenRef = useRef(token);
  const storeIdRef = useRef(storeId);
  const upsertRef = useRef(upsertOrder);
  const openRef = useRef(openIncomingOrderSheet);
  tokenRef.current = token;
  storeIdRef.current = storeId;
  upsertRef.current = upsertOrder;
  openRef.current = openIncomingOrderSheet;

  useEffect(() => {
    seenNotifIdsRef.current = new Set();
    bootstrappedRef.current = false;
  }, [storeId]);

  useEffect(() => {
    if (!token || !storeId) return;
    void refresh();
    const onResume = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => onResume.remove();
  }, [token, storeId, refresh]);

  useEffect(() => {
    const t = tokenRef.current;
    const sid = storeIdRef.current;
    if (!t || !sid) return;

    const orderNotifs = notifications.filter(isNewOrderAcceptNotification);

    const openFromNotification = async (n: MerchantNotification) => {
      const foodIdRaw = n.orderId;
      if (!foodIdRaw) return;
      const foodId = parseInt(String(foodIdRaw), 10);
      if (!Number.isFinite(foodId) || foodId <= 0) return;
      const key = String(foodId);
      if (openingRef.current.has(key)) return;
      openingRef.current.add(key);
      try {
        const auth = tokenRef.current;
        const store = storeIdRef.current;
        if (!auth || !store) return;
        const order: OrderRecord = mapApiOrder(
          await fetchFoodOrder(store, foodId, auth)
        );
        upsertRef.current(order);
        if (order.status === "created" && !order.id.startsWith("core-")) {
          openRef.current(order);
        }
      } catch {
        /* next poll / food-orders refresh retries */
      } finally {
        openingRef.current.delete(key);
      }
    };

    if (!bootstrappedRef.current) {
      for (const n of orderNotifs) seenNotifIdsRef.current.add(n.id);
      bootstrappedRef.current = true;
      const unread = orderNotifs.filter((n) => !n.read);
      if (unread[0]) void openFromNotification(unread[0]);
      return;
    }

    for (const n of orderNotifs) {
      if (seenNotifIdsRef.current.has(n.id)) continue;
      seenNotifIdsRef.current.add(n.id);
      void openFromNotification(n);
      break;
    }
  }, [notifications]);

  return null;
}
