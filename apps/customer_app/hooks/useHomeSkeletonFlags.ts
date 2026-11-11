/**
 * Progressive Home skeleton gates — skeletons are the exception.
 *
 * Instant (never skeleton): header, tabs, service cards, brand shell, default promo art.
 * Skeleton only via explicit EXPO_PUBLIC_FORCE_HOME_SKELETON_MS (QA).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { isSplashExited, useSplashExitedFlag } from "@/lib/splashLifecycle";
import {
  getForcedHomeSkeletonHoldMs,
  homeSkeletonLog,
  shouldForceHomeSkeletons,
} from "@/lib/homeSkeletonTelemetry";

export type HomeSkeletonFlags = {
  forceSkeletons: boolean;
  showLocationSkeleton: false;
  showWeatherSkeleton: false;
  showPromoSkeleton: boolean;
  showServicesSkeleton: false;
  showBrandSkeleton: false;
  splashExited: boolean;
};

export function useHomeSkeletonFlags(): HomeSkeletonFlags {
  const splashExited = useSplashExitedFlag();
  const [splashExitedAtMs, setSplashExitedAtMs] = useState<number | null>(() =>
    isSplashExited() ? Date.now() : null
  );
  const [, bump] = useState(0);

  useEffect(() => {
    if (splashExited && splashExitedAtMs == null) {
      setSplashExitedAtMs(Date.now());
    }
  }, [splashExited, splashExitedAtMs]);

  useEffect(() => {
    const hold = getForcedHomeSkeletonHoldMs();
    if (hold <= 0 || splashExitedAtMs == null) return;
    const left = hold - (Date.now() - splashExitedAtMs);
    if (left <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), left + 16);
    return () => clearTimeout(t);
  }, [splashExitedAtMs]);

  const forceSkeletons = shouldForceHomeSkeletons(splashExitedAtMs);
  const lastForceRef = useRef<boolean | null>(null);

  const showLocationSkeleton = false as const;
  const showWeatherSkeleton = false as const;
  const showServicesSkeleton = false as const;
  const showBrandSkeleton = false as const;
  const showPromoSkeleton = forceSkeletons;

  useEffect(() => {
    if (lastForceRef.current === forceSkeletons) return;
    lastForceRef.current = forceSkeletons;
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "location", "header_instant");
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "weather", "header_instant");
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "services", "static_cards_instant");
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "brand", "shell_instant");
    homeSkeletonLog(
      showPromoSkeleton ? "CONTENT_FETCH_STARTED" : "SKELETON_SKIPPED_CACHE_HIT",
      "promo",
      showPromoSkeleton ? "force_hold" : "default_or_cached_art"
    );
  }, [forceSkeletons, showPromoSkeleton]);

  return useMemo(
    () => ({
      forceSkeletons,
      showLocationSkeleton,
      showWeatherSkeleton,
      showPromoSkeleton,
      showServicesSkeleton,
      showBrandSkeleton,
      splashExited,
    }),
    [forceSkeletons, showPromoSkeleton, splashExited]
  );
}
