/**
 * When a new CREATED-order notification appears in the merchant inbox feed,
 * fetch that food order, upsert into the live board, and open the accept sheet.
 * Inbox refresh is owned by NotificationProvider (realtime + throttled poll).
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
import { isIncomingOrderResolved } from "@/lib/incomingOrderDismissed";
import type { MerchantNotification } from "@/context/NotificationContext";

export default function IncomingOrderNotificationBridge() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const { notifications } = useNotifications();
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
        if (isIncomingOrderResolved(order.ordersCoreId, order.id)) {
          if (order.status === "created") {
            upsertRef.current({
              ...order,
              status: "rejected",
              pipelineStatus: "CANCELLED",
            });
          }
          return;
        }
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
