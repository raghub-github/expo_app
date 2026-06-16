/**
 * Handles Android hardware back button with stack-based navigation.
 * Uses root navigator so canGoBack() reflects the full stack (tabs -> home -> merchant -> checkout).
 * Mount inside any layout that is under the root stack so useNavigation() is available.
 */

import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";

export function AndroidBackHandler() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onHardwareBack = () => {
      if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [router]);

  return null;
}
