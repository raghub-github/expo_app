/**
 * Progressive Home skeleton gates — Zomato-style: first paint is always skeletons,
 * then each section reveals when its data is ready.
 *
 * Critical: content reveal is deferred to useEffect so the first commit after splash
 * always paints shimmer even when disk cache already has offers/location/assets.
 * Without that, Home mounted with cache and skipped skeletons entirely.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSplashExitedFlag } from "@/lib/splashLifecycle";
import {
  getForcedHomeSkeletonHoldMs,
  homeSkeletonLog,
  shouldForceHomeSkeletons,
} from "@/lib/homeSkeletonTelemetry";

export type HomeSkeletonInput = {
  /** True once featured-offers query has resolved (cache or network). */
  offersResolved?: boolean;
  /** True when CMS/home assets are available (disk seed counts). */
  assetsReady?: boolean;
  /** True when location store has hydrated (cached or fresh). */
  locationReady?: boolean;
  /** True when weather payload is paint-ready (or not applicable). */
  weatherReady?: boolean;
};

export type HomeSkeletonFlags = {
  forceSkeletons: boolean;
  showLocationSkeleton: boolean;
  showWeatherSkeleton: boolean;
  showPromoSkeleton: boolean;
  showServicesSkeleton: boolean;
  showBrandSkeleton: false;
  splashExited: boolean;
};

export function useHomeSkeletonFlags(
  input: HomeSkeletonInput = {}
): HomeSkeletonFlags {
  const {
    offersResolved = true,
    assetsReady = true,
    locationReady = true,
    weatherReady = true,
  } = input;

  const splashExited = useSplashExitedFlag();
  const [splashExitedAtMs, setSplashExitedAtMs] = useState<number | null>(null);
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
  const lastLoggedRef = useRef<string>("");

  // Zomato shell: header stays real (location updates from store). Never grey-box the header.
  const showLocationSkeleton = false;
  const showWeatherSkeleton = forceSkeletons || !weatherReady;
  const showPromoSkeleton = forceSkeletons || !offersResolved;
  const showServicesSkeleton = forceSkeletons || !assetsReady;
  const showBrandSkeleton = false as const;

  useEffect(() => {
    const key = [
      showWeatherSkeleton,
      showPromoSkeleton,
      showServicesSkeleton,
      forceSkeletons,
    ].join("|");
    if (lastLoggedRef.current === key) return;
    lastLoggedRef.current = key;
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "location", "header_live");
    homeSkeletonLog(
      showWeatherSkeleton ? "CONTENT_FETCH_STARTED" : "SKELETON_SKIPPED_CACHE_HIT",
      "weather",
      showWeatherSkeleton ? "awaiting_weather" : "weather_ready"
    );
    homeSkeletonLog(
      showServicesSkeleton ? "CONTENT_FETCH_STARTED" : "SKELETON_SKIPPED_CACHE_HIT",
      "services",
      showServicesSkeleton ? "awaiting_assets" : "cards_ready"
    );
    homeSkeletonLog("SKELETON_SKIPPED_CACHE_HIT", "brand", "shell_instant");
    homeSkeletonLog(
      showPromoSkeleton ? "CONTENT_FETCH_STARTED" : "SKELETON_SKIPPED_CACHE_HIT",
      "promo",
      showPromoSkeleton ? "awaiting_offers" : "offers_ready"
    );
  }, [
    forceSkeletons,
    showWeatherSkeleton,
    showPromoSkeleton,
    showServicesSkeleton,
  ]);

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
    [
      forceSkeletons,
      showLocationSkeleton,
      showWeatherSkeleton,
      showPromoSkeleton,
      showServicesSkeleton,
      splashExited,
    ]
  );
}
