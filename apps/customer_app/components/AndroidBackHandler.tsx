/**
 * Handles Android hardware back button with stack-based navigation.
 * Uses root navigator so canGoBack() reflects the full stack (tabs -> home -> merchant -> checkout).
 * Mount inside any layout that is under the root stack so useNavigation() is available.
 */

import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";

function getRootNavigation(navigation: ReturnType<typeof useNavigation>): ReturnType<typeof useNavigation> {
  let root = navigation;
  while (typeof (root as any).getParent === "function" && (root as any).getParent()) {
    root = (root as any).getParent();
  }
  return root;
}

export function AndroidBackHandler() {
  const router = useRouter();
  const navigation = useNavigation();
  const root = getRootNavigation(navigation);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onHardwareBack = () => {
      if (typeof root.canGoBack === "function" && root.canGoBack()) {
        router.back();
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [root, router]);

  return null;
}
