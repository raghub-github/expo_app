import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import {
  DEFAULT_FOOD_HOME_LAYOUT,
  DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW,
  parseGridFirstSubscriptionRowBgColor,
  parseGridFirstSubscriptionRowEnabled,
  type FoodHomeLayoutKey,
} from "@/lib/foodHomeLayout";
import {
  buildFoodHomeLayoutQueryKey,
  fetchFoodHomeLayoutWithCache,
  FOOD_HOME_LAYOUT_GC_MS,
  FOOD_HOME_LAYOUT_STALE_MS,
  getSyncFoodHomeLayoutFromQueryClient,
  hydrateFoodHomeLayoutForHints,
} from "@/lib/foodHomeLayoutCache";
import type { ReverseGeocodeResult } from "@/services/location.service";

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

  useEffect(() => {
    if (!canQuery) return;
    void hydrateFoodHomeLayoutForHints(queryClient, hints);
  }, [canQuery, queryClient, hints]);

  const syncCached = canQuery ? getSyncFoodHomeLayoutFromQueryClient(queryClient, hints) : undefined;

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
    initialData: syncCached,
  });

  useFocusEffect(
    useCallback(() => {
      if (!canQuery) return;
      const updatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      if (Date.now() - updatedAt < FOOD_HOME_LAYOUT_STALE_MS) return;
      void queryClient.invalidateQueries({ queryKey });
    }, [canQuery, queryClient, queryKey])
  );

  const layoutReady = !canQuery || query.data != null || query.isError;
  const layoutKey: FoodHomeLayoutKey | null = layoutReady
    ? (query.data?.layoutKey ?? DEFAULT_FOOD_HOME_LAYOUT)
    : null;

  return {
    ...query,
    layoutKey,
    layoutReady,
    canQuery,
    gridFirstHeroMedia: query.data?.gridFirstHeroMedia ?? [],
    gridFirstSubscriptionRowEnabled: parseGridFirstSubscriptionRowEnabled(
      query.data?.gridFirstSubscriptionRowEnabled
    ),
    gridFirstSubscriptionRowText:
      query.data?.gridFirstSubscriptionRowText ?? DEFAULT_GRID_FIRST_SUBSCRIPTION_ROW.text,
    gridFirstSubscriptionRowBgColor: parseGridFirstSubscriptionRowBgColor(
      query.data?.gridFirstSubscriptionRowBgColor
    ),
  };
}
