/**
 * Keeps the single STORE STATUS tray notification in sync with backend
 * store availability. Clearing the notification does not change store status;
 * the next app open re-posts if the store is still ONLINE / out of timings.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { dismissLiveOrdersOngoingNotification } from "@/lib/liveOrdersOngoingNotification";
import {
  reconcileStoreStatusNotification,
  removeStoreStatusNotification,
} from "@/lib/storeStatusNotification";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function LiveOrdersOngoingNotification() {
  const { token, isAuthenticated, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { isOnline, statusReason, unavailableReason, loading } = useStoreStatus();
  const storeId = selectedStore?.id ?? null;
  const storeName = selectedStore?.store_name ?? null;
  const merchantId = partner?.parent?.parent_merchant_id ?? null;
  const prevStoreId = useRef<number | null>(null);
  const didStartRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    void dismissLiveOrdersOngoingNotification();
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    if (!isAuthenticated) {
      void removeStoreStatusNotification("LOGOUT");
      return;
    }
    if (loading) return;

    const prev = prevStoreId.current;
    if (prev != null && storeId != null && prev !== storeId) {
      void removeStoreStatusNotification("STORE_SWITCH");
    }
    prevStoreId.current = storeId;

    const source = didStartRef.current ? "STATUS_CHANGE" : "APP_START";
    didStartRef.current = true;

    void reconcileStoreStatusNotification({
      authenticated: true,
      storeId,
      merchantId,
      storeName,
      isOnline,
      statusReason,
      unavailableReason,
      source,
    });
  }, [
    isAuthenticated,
    loading,
    storeId,
    storeName,
    merchantId,
    isOnline,
    statusReason,
    unavailableReason,
  ]);

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    if (!isAuthenticated || !token || storeId == null) return;

    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void reconcileStoreStatusNotification({
        authenticated: true,
        storeId,
        merchantId,
        storeName,
        isOnline,
        statusReason,
        unavailableReason,
        source: "APP_RESUME",
      });
    });
    return () => sub.remove();
  }, [
    isAuthenticated,
    token,
    storeId,
    storeName,
    merchantId,
    isOnline,
    statusReason,
    unavailableReason,
  ]);

  return null;
}
