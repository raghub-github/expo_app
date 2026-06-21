/**
 * Handles Android hardware back button with stack-based navigation.
 * Uses root navigator so canGoBack() reflects the full stack (tabs -> home -> merchant -> checkout).
 * Mount inside any layout that is under the root stack so useNavigation() is available.
 */

import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";
import {
  HOME_TAB_FALLBACK,
  resolveAndroidBackFallback,
  safeRouterBack,
  type SafeRouterBackFallback,
} from "@/lib/safeRouterBack";

type AndroidBackHandlerProps = {
  /** When set, used instead of segment-based fallback when the stack cannot go back. */
  fallback?: SafeRouterBackFallback;
  /** When true, always navigate to `fallback` instead of router.back(). */
  preferFallback?: boolean;
};

export function AndroidBackHandler({ fallback, preferFallback = false }: AndroidBackHandlerProps = {}) {
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const onHardwareBack = () => {
      const root = segments[0];
      // Main tabs sit on top of index/auth screens opened via replace — router.back() throws GO_BACK.
      if (root === "(tabs)" && !fallback) {
        return false;
      }

      const resolvedFallback = fallback ?? resolveAndroidBackFallback(segments);
      if (preferFallback && resolvedFallback) {
        router.replace(resolvedFallback);
        return true;
      }

      // Food listing — always replace to tabs (opened from tab bar push; back() fails after reload).
      if (
        root === "home" &&
        (segments.length === 1 || segments[1] === "index")
      ) {
        router.replace(HOME_TAB_FALLBACK);
        return true;
      }

      safeRouterBack(router, resolvedFallback ?? HOME_TAB_FALLBACK);
      return true;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [router, segments, fallback, preferFallback]);

  return null;
}
