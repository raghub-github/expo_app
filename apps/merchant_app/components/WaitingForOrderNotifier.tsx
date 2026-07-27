/**
 * When the store is online and there are no active pipeline orders, ensures a single
 * in-app "Waiting for Order" notification (server-deduped). Re-triggers after the user
 * deletes that row while still idle. Removes waiting rows when active orders appear.
 * Optional local notification when the app is backgrounded and a new row was created.
 */

import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { useNotifications } from "@/context/NotificationContext";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";
import {
  WAITING_FOR_ORDER_TITLE,
  ensureWaitingForOrderNotification,
  deleteWaitingForOrderNotifications,
} from "@/services/storeNotificationsApi";

const POLL_MS = 15_000;
const RETRIGGER_DELAY_MS = 4000;

function isExpoGo(): boolean {
  // Expo Go is where expo-notifications remote push APIs are disabled (SDK 53+),
  // and importing expo-notifications can throw due to auto-registration side effects.
  return Constants.appOwnership === "expo";
}

function isWaitingTitle(title: string): boolean {
  return title.trim() === WAITING_FOR_ORDER_TITLE;
}

async function maybePresentBackgroundNotice(storeName: string): Promise<void> {
  if (AppState.currentState === "active") return;
  if (isExpoGo()) return;
  try {
    const Notifications = await import("expo-notifications");
    const name = storeName.trim() || "Your restaurant";
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🟢 ${name}`,
        body: "Waiting for orders",
        data: { type: "store_online", screen: "orders" },
      },
      trigger: null,
    });
  } catch {
    // best-effort
  }
}

export default function WaitingForOrderNotifier() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();
  const { notifications, refresh } = useNotifications();

  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name?.trim() || "Your restaurant";

  const skipRetriggerRef = useRef(false);
  const prevHadWaitingRef = useRef(false);
  const retriggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const tokenRef = useRef(token);
  const storeIdRef = useRef(storeId);
  const storeNameRef = useRef(storeName);
  const isOnlineRef = useRef(isOnline);
  const refreshRef = useRef(refresh);
  const hasWaitingRef = useRef(false);

  tokenRef.current = token;
  storeIdRef.current = storeId;
  storeNameRef.current = storeName;
  isOnlineRef.current = isOnline;
  refreshRef.current = refresh;

  const hasWaitingInList = notifications.some((n) => isWaitingTitle(n.title));
  hasWaitingRef.current = hasWaitingInList;

  // User removed "Waiting for Order" from the sheet (delete) while still idle → ensure again after delay.
  useEffect(() => {
    const prev = prevHadWaitingRef.current;
    prevHadWaitingRef.current = hasWaitingInList;

    const t = tokenRef.current;
    const sid = storeIdRef.current;
    const online = isOnlineRef.current;

    if (!t || !sid || !online) {
      return;
    }

    if (prev === true && hasWaitingInList === false && !skipRetriggerRef.current) {
      if (retriggerTimerRef.current) clearTimeout(retriggerTimerRef.current);
      retriggerTimerRef.current = setTimeout(() => {
        retriggerTimerRef.current = null;
        void (async () => {
          try {
            const active = await getActiveOrdersCount(sid, t);
            if (active > 0 || !isOnlineRef.current) return;
            const { created } = await ensureWaitingForOrderNotification(sid, t);
            void refreshRef.current();
            if (created) await maybePresentBackgroundNotice(storeNameRef.current);
          } catch {
            // ignore
          }
        })();
      }, RETRIGGER_DELAY_MS);
    }

    return () => {
      if (retriggerTimerRef.current) {
        clearTimeout(retriggerTimerRef.current);
        retriggerTimerRef.current = null;
      }
    };
  }, [hasWaitingInList]);

  // Stable poll: do not depend on `refresh` / flicker `isOnline` identity — those remounted
  // the interval and caused overlapping ensure POSTs every few hundred ms.
  useEffect(() => {
    if (!token || !storeId) return undefined;

    let cancelled = false;

    const run = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const t = tokenRef.current;
        const sid = storeIdRef.current;
        if (!t || !sid) return;

        const active = await getActiveOrdersCount(sid, t);
        if (cancelled) return;

        if (active > 0) {
          skipRetriggerRef.current = true;
          try {
            await deleteWaitingForOrderNotifications(sid, t);
            void refreshRef.current();
          } finally {
            setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        if (!isOnlineRef.current) {
          skipRetriggerRef.current = true;
          try {
            await deleteWaitingForOrderNotifications(sid, t);
            void refreshRef.current();
          } finally {
            setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        // Already showing waiting — no need to hammer ensure.
        if (hasWaitingRef.current) return;

        const { created } = await ensureWaitingForOrderNotification(sid, t);
        if (cancelled) return;
        if (created) {
          void refreshRef.current();
          await maybePresentBackgroundNotice(storeNameRef.current);
        }
      } catch {
        // network / auth — skip cycle
      } finally {
        inFlightRef.current = false;
      }
    };

    void run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, storeId]);

  // React quickly when online flips (interval alone can lag up to POLL_MS).
  useEffect(() => {
    if (!token || !storeId) return;
    if (inFlightRef.current) return;
    void (async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (!isOnline) {
          skipRetriggerRef.current = true;
          try {
            await deleteWaitingForOrderNotifications(storeId, token);
            void refreshRef.current();
          } finally {
            setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }
        if (hasWaitingRef.current) return;
        const active = await getActiveOrdersCount(storeId, token);
        if (active > 0) return;
        const { created } = await ensureWaitingForOrderNotification(storeId, token);
        if (created) {
          void refreshRef.current();
          await maybePresentBackgroundNotice(storeNameRef.current);
        }
      } catch {
        // ignore
      } finally {
        inFlightRef.current = false;
      }
    })();
  }, [token, storeId, isOnline]);

  return null;
}
