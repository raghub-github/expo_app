/**
 * Clears legacy local "store is online" sticky notifications on mount.
 * Kitchen sticky writers are disabled — merchants rely on server push only.
 */

import { useEffect } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import {
  dismissLiveOrdersOngoingNotification,
  setKitchenStickyAllowed,
} from "@/lib/liveOrdersOngoingNotification";

function isExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export default function LiveOrdersOngoingNotification() {
  useEffect(() => {
    if (Platform.OS !== "android" || isExpoGo()) return;
    setKitchenStickyAllowed(false);
    void dismissLiveOrdersOngoingNotification();
  }, []);

  return null;
}
