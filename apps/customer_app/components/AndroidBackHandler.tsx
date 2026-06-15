/**
 * Handles Android hardware back button with stack-based navigation.
 * Uses root navigator so canGoBack() reflects the full stack (tabs -> home -> merchant -> checkout).
 * Mount inside any layout that is under the root stack so useNavigation() is available.
 */

import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { useRouter, useSegments } from "expo-router";
import {
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
      const resolvedFallback = fallback ?? resolveAndroidBackFallback(segments);
      if (preferFallback && resolvedFallback) {
        safeRouterBack(router, resolvedFallback);
        return true;
      }
      if (typeof router.canGoBack === "function" && router.canGoBack()) {
        router.back();
        return true;
      }
      if (resolvedFallback) {
        safeRouterBack(router, resolvedFallback);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [router, segments, fallback, preferFallback]);

  return null;
}
