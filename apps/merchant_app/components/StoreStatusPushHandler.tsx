/**
 * Applies STORE_STATUS FCM while JS is alive. Native FCM owns the tray when
 * the process is dead. Never plays NEW_ORDER alert sound.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { registerMerchantForegroundPushHandler } from "@/lib/merchantPushDispatch";
import {
  applyStoreStatusFromPush,
  isStoreStatusPushData,
} from "@/lib/storeStatusNotification";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function StoreStatusPushHandler() {
  const { selectedStore } = useSelectedStore();
  const storeIdRef = useRef(selectedStore?.id ?? null);
  storeIdRef.current = selectedStore?.id ?? null;

  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    return registerMerchantForegroundPushHandler(({ data }) => {
      if (!isStoreStatusPushData(data)) return;
      // Background/killed: native FCM notification block owns the tray.
      if (AppState.currentState !== "active") return;
      void applyStoreStatusFromPush(data, { expectedStoreId: storeIdRef.current });
    });
  }, []);

  return null;
}
