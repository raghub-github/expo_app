/**
 * Android ongoing tray: "🟢 {store} is online · Waiting for orders" (Zomato-style).
 * Updates when active-order breakdown changes; dismissed when store goes offline.
 */

import { useEffect, useRef } from "react";
import { isAppForeground } from "@/lib/appForeground";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import {
  dismissLiveOrdersOngoingNotification,
  refreshLiveOrdersOngoingNotification,
  setKitchenStickyAllowed,
} from "@/lib/liveOrdersOngoingNotification";

const REFRESH_MS = 120_000;

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function LiveOrdersOngoingNotification() {
  const { token, isAuthenticated } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline } = useStoreStatus();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name ?? null;
  const refreshRef = useRef(refreshLiveOrdersOngoingNotification);
  refreshRef.current = refreshLiveOrdersOngoingNotification;

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;

    const allowed = Boolean(isAuthenticated && token && storeId && isOnline);
    setKitchenStickyAllowed(allowed);

    if (!allowed) {
      void dismissLiveOrdersOngoingNotification();
      return;
    }

    void refreshRef.current({
      storeId: storeId!,
      token: token!,
      storeName,
      force: true,
    });
  }, [isAuthenticated, token, storeId, storeName, isOnline]);

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    if (!isAuthenticated || !token || !storeId || !isOnline) return;

    const tick = () => {
      if (!isAppForeground()) return;
      void refreshRef.current({ storeId, token, storeName });
    };

    const interval = setInterval(tick, REFRESH_MS);
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") tick();
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [isAuthenticated, token, storeId, storeName, isOnline]);

  return null;
}
