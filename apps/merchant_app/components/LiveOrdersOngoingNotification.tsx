/**
 * Live kitchen sticky — Zomato-style store online + preparing/ready counts.
 * Logic lives in `lib/liveOrdersOngoingNotification.ts` so push handlers can
 * refresh the same row while the app is backgrounded.
 */

import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import { isAppForeground } from "@/lib/appForeground";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  dismissLiveOrdersOngoingNotification,
  refreshLiveOrdersOngoingNotification,
  setKitchenStickyAllowed,
} from "@/lib/liveOrdersOngoingNotification";

const POLL_MS = 25_000;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function LiveOrdersOngoingNotification() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name?.trim() || "Your restaurant";
  const enabled =
    Platform.OS === "android" &&
    !!token &&
    !!storeId &&
    isOnline;

  // Sync gate with online status. No cleanup→false thrash (that caused
  // schedule/dismiss races and Android process crashes under Strict Mode).
  useEffect(() => {
    setKitchenStickyAllowed(enabled);
    if (!enabled) {
      void dismissLiveOrdersOngoingNotification();
    }
  }, [enabled]);

  useEffect(() => {
    if (isExpoGo()) return undefined;

    let cancelled = false;

    async function tick() {
      if (cancelled) return;
      if (!enabled || !token || !storeId) return;
      await refreshLiveOrdersOngoingNotification({
        storeId,
        token,
        storeName,
      });
    }

    if (!enabled) {
      return () => {
        cancelled = true;
      };
    }

    void tick();
    pollTimerRef.current = setInterval(() => {
      if (!isAppForeground()) return;
      void tick();
    }, POLL_MS);

    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") void tick();
    });

    return () => {
      cancelled = true;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      appStateSub.remove();
    };
  }, [enabled, token, storeId, storeName]);

  return null;
}
