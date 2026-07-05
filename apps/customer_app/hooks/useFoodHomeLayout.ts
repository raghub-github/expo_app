import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  DEFAULT_GRID_FIRST_UNDER_250,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
  parseGridFirstUnder250Enabled,
  parseGridFirstUnder250ImageUrl,
  parseGridFirstUnder250MaxPrice,
  parseGridFirstUnder250Title,
  type FoodHomeLayoutKey,
} from "@/lib/foodHomeLayout";
import {
  buildFoodHomeLayoutQueryKey,
  fetchFoodHomeLayoutWithCache,
  FOOD_HOME_LAYOUT_GC_MS,
  FOOD_HOME_LAYOUT_STALE_MS,
  getSyncFoodHomeLayoutFromQueryClient,
  hydrateFoodHomeLayoutForHints,
  readCachedFoodHomeLayout,
} from "@/lib/foodHomeLayoutCache";
import { prefetchGridFirstHeroMedia } from "@/lib/prefetchGridFirstHeroMedia";
import { prefetchMealsUnder250HeroMedia } from "@/lib/prefetchMealsUnder250HeroMedia";
import { applyGridFirstImmersiveChrome } from "@/lib/gridFirstImmersiveChrome";
import type { ReverseGeocodeResult } from "@/services/location.service";
import type { FoodHomeLayoutResult } from "@/services/foodHomeLayout.service";

export function useFoodHomeLayout(
  address: ReverseGeocodeResult | null | undefined,
  coords?: { latitude: number; longitude: number } | null
) {
  const queryClient = useQueryClient();
  // Round coords so GPS jitter doesn't spawn a new query (and a new network
  // call) on every location tick. ~4 dp ≈ 11 m, far finer than a home layout
  // needs. Memoise hints + queryKey so their references are STABLE across
  // renders — otherwise the useFocusEffect below is recreated every render and
  // re-fires in a tight loop (which is what hammered /v1/geo/food-home-layout).
  const lat = coords?.latitude != null ? Math.round(coords.latitude * 1e4) / 1e4 : null;
  const lng = coords?.longitude != null ? Math.round(coords.longitude * 1e4) / 1e4 : null;
  const roundedCoords = lat != null && lng != null ? { latitude: lat, longitude: lng } : null;
  const pincodeHint = address?.pincode ?? null;
  const stateHint = address?.state ?? null;

  const hints = useMemo(
    () => extractCustomerGeoHints(address, roundedCoords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pincodeHint, stateHint, address?.fullAddress, address?.secondary, lat, lng]
  );
  const canQuery = !!(hints.pincode || hints.state || (hints.lat != null && hints.lng != null));
  const queryKey = useMemo(() => buildFoodHomeLayoutQueryKey(hints), [hints]);

  const syncCached = canQuery ? getSyncFoodHomeLayoutFromQueryClient(queryClient, hints) : undefined;
  const [bootLayout, setBootLayout] = useState<FoodHomeLayoutResult | undefined>(() => syncCached);

  useLayoutEffect(() => {
    if (!canQuery) {
      setBootLayout(undefined);
      return;
    }
    const memoryHit = getSyncFoodHomeLayoutFromQueryClient(queryClient, hints);
    if (memoryHit?.layoutKey) {
      setBootLayout(memoryHit);
      return;
    }
    let cancelled = false;
    void readCachedFoodHomeLayout(hints).then((cached) => {
      if (cancelled || !cached?.layoutKey) return;
      setBootLayout(cached);
      queryClient.setQueryData(queryKey, (prev) => prev ?? cached);
      prefetchGridFirstHeroMedia(cached.gridFirstHeroMedia);
      prefetchMealsUnder250HeroMedia(cached);
    });
    return () => {
      cancelled = true;
    };
  }, [canQuery, hints, queryClient, queryKey]);

  useEffect(() => {
    if (!canQuery) return;
    void hydrateFoodHomeLayoutForHints(queryClient, hints);
  }, [canQuery, queryClient, hints]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchFoodHomeLayoutWithCache(hints),
    enabled: canQuery,
    staleTime: FOOD_HOME_LAYOUT_STALE_MS,
    gcTime: FOOD_HOME_LAYOUT_GC_MS,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    initialData: syncCached ?? bootLayout,
  });

  const effectiveLayout = query.data ?? bootLayout;
  const layoutReady = !canQuery || effectiveLayout != null || query.isError;
  const layoutKey: FoodHomeLayoutKey | null = layoutReady
    ? (effectiveLayout?.layoutKey ?? DEFAULT_FOOD_HOME_LAYOUT)
    : effectiveLayout?.layoutKey ?? null;

  useLayoutEffect(() => {
    if (effectiveLayout?.layoutKey === "grid_first") {
      applyGridFirstImmersiveChrome(true);
    }
  }, [effectiveLayout?.layoutKey]);

  useFocusEffect(
    useCallback(() => {
      if (!canQuery) return;
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      if (Date.now() - updatedAt < FOOD_HOME_LAYOUT_STALE_MS) return;
      void queryClient.invalidateQueries({ queryKey });
    }, [canQuery, queryClient, queryKey])
  );

  return {
    ...query,
    data: effectiveLayout,
    layoutKey,
    cachedLayoutKey: effectiveLayout?.layoutKey ?? null,
    layoutReady,
    canQuery,
    gridFirstHeroMedia: effectiveLayout?.gridFirstHeroMedia ?? [],
    gridFirstSubscriptionRowEnabled: parseGridFirstSubscriptionRowEnabled(
      effectiveLayout?.gridFirstSubscriptionRowEnabled
    ),
    gridFirstSubscriptionRowText:
      effectiveLayout?.gridFirstSubscriptionRowText ?? DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    gridFirstSubscriptionRowBgColor: parseGridFirstSubscriptionRowBgColor(
      effectiveLayout?.gridFirstSubscriptionRowBgColor
    ),
    gridFirstUnder250Enabled: parseGridFirstUnder250Enabled(
      effectiveLayout?.gridFirstUnder250Enabled
    ),
    gridFirstUnder250MaxPrice: parseGridFirstUnder250MaxPrice(
      effectiveLayout?.gridFirstUnder250MaxPrice
    ),
    gridFirstUnder250Title: parseGridFirstUnder250Title(
      effectiveLayout?.gridFirstUnder250Title,
      DEFAULT_GRID_FIRST_UNDER_250.title
    ),
    gridFirstUnder250FilterLabel: parseGridFirstUnder250Title(
      effectiveLayout?.gridFirstUnder250FilterLabel,
      DEFAULT_GRID_FIRST_UNDER_250.filterLabel
    ),
    gridFirstUnder250TabImageUrl: parseGridFirstUnder250ImageUrl(
      effectiveLayout?.gridFirstUnder250TabImageUrl
    ),
    gridFirstUnder250HeroImageUrl: parseGridFirstUnder250ImageUrl(
      effectiveLayout?.gridFirstUnder250HeroImageUrl
    ),
  };
}
