/**
 * When the user backgrounds the app with items in a food cart and never places
 * an order, schedule CUSTOMER_ABANDONED_CART. Cancel on foreground / clear / order.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import {
  cancelAbandonedCartReminder,
  scheduleAbandonedCartReminder,
} from "@/services/abandonedCart.service";

export function AbandonedCartReminderBootstrap() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;

    const onChange = (next: AppStateStatus) => {
      const prev = appState.current;
      appState.current = next;

      const goingBackground =
        (prev === "active" || prev === "inactive") &&
        (next === "background" || next === "inactive");
      const goingForeground = prev.match(/inactive|background/) && next === "active";

      if (goingBackground) {
        const { merchantId, merchantName, items } = useCartStore.getState();
        if (!merchantId || items.length === 0) {
          void cancelAbandonedCartReminder().catch(() => undefined);
          return;
        }
        void scheduleAbandonedCartReminder({
          storeId: merchantId,
          storeName: (merchantName ?? "your store").trim() || "your store",
        }).catch(() => undefined);
        return;
      }

      if (goingForeground) {
        void cancelAbandonedCartReminder().catch(() => undefined);
      }
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [hydrated, session?.accessToken, session?.role]);

  // Cart cleared → cancel any pending reminder.
  useEffect(() => {
    if (!hydrated || !session?.accessToken || session.role !== "customer") return;
    let prevCount = useCartStore.getState().items.length;
    return useCartStore.subscribe((state) => {
      const next = state.items.length;
      if (prevCount > 0 && next === 0) {
        void cancelAbandonedCartReminder().catch(() => undefined);
      }
      prevCount = next;
    });
  }, [hydrated, session?.accessToken, session?.role]);

  return null;
}
