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

const POLL_MS = 8000;
const RETRIGGER_DELAY_MS = 4000;

function isExpoGo(): boolean {
  // Expo Go is where expo-notifications remote push APIs are disabled (SDK 53+),
  // and importing expo-notifications can throw due to auto-registration side effects.
  return Constants.appOwnership === "expo";
}

function isWaitingTitle(title: string): boolean {
  return title.trim() === WAITING_FOR_ORDER_TITLE;
}

async function maybePresentBackgroundNotice(): Promise<void> {
  if (AppState.currentState === "active") return;
  if (isExpoGo()) return;
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.scheduleNotificationAsync({
      content: {
        title: WAITING_FOR_ORDER_TITLE,
        body: "You are online. No active orders in the queue.",
        data: { screen: "notifications" },
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

  const skipRetriggerRef = useRef(false);
  const prevHadWaitingRef = useRef(false);
  const retriggerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRef = useRef(token);
  const storeIdRef = useRef(storeId);
  const isOnlineRef = useRef(isOnline);
  const refreshRef = useRef(refresh);

  tokenRef.current = token;
  storeIdRef.current = storeId;
  isOnlineRef.current = isOnline;
  refreshRef.current = refresh;

  const hasWaitingInList = notifications.some((n) => isWaitingTitle(n.title));

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
            if (created) await maybePresentBackgroundNotice();
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

  useEffect(() => {
    if (!token || !storeId) return undefined;

    let cancelled = false;

    const run = async () => {
      if (cancelled) return;
      try {
        const active = await getActiveOrdersCount(storeId, token);
        if (cancelled) return;

        if (active > 0) {
          skipRetriggerRef.current = true;
          try {
            await deleteWaitingForOrderNotifications(storeId, token);
            void refresh();
          } finally {
            setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        if (!isOnline) {
          skipRetriggerRef.current = true;
          try {
            await deleteWaitingForOrderNotifications(storeId, token);
            void refresh();
          } finally {
            setTimeout(() => {
              skipRetriggerRef.current = false;
            }, 800);
          }
          return;
        }

        const { created } = await ensureWaitingForOrderNotification(storeId, token);
        if (cancelled) return;
        if (created) {
          void refresh();
          await maybePresentBackgroundNotice();
        }
      } catch {
        // network / auth — skip cycle
      }
    };

    void run();
    const id = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token, storeId, isOnline, refresh]);

  return null;
}
