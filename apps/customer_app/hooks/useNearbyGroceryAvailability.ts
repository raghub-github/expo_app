/**
 * Grocery tile is active when at least one GROCERY store is nearby
 * (same pin as merchant listing / food home).
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import {
  fetchAndCacheMerchantsList,
  MERCHANTS_LIST_STALE_MS,
  merchantsQueryKey,
  readSyncMerchantsList,
} from "@/lib/merchantsListCache";
import { useDietaryPreferenceStore } from "@/store/dietaryPreferenceStore";

export function useNearbyGroceryAvailability() {
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const debouncedCoords = useDebouncedCoords(coords);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();
  const vegOnly = useDietaryPreferenceStore((s) => s.vegOnly);

  const listingCoords = locationSource === "selected" ? coords : debouncedCoords;
  const servicePin = useMemo(
    () =>
      resolveMerchantListingCoords({
        locationSource,
        listingCoords,
        addresses,
        activeLocation,
      }),
    [locationSource, listingCoords, addresses, activeLocation]
  );

  const lat = servicePin?.latitude;
  const lng = servicePin?.longitude;
  const canQuery = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  const cached = canQuery ? readSyncMerchantsList(lat!, lng!, false, "GROCERY") : undefined;

  const query = useQuery({
    queryKey: canQuery
      ? merchantsQueryKey(lat!, lng!, false, "GROCERY")
      : (["merchants", "grocery-pending"] as const),
    queryFn: () => fetchAndCacheMerchantsList(lat!, lng!, false, "GROCERY"),
    enabled: canQuery,
    staleTime: MERCHANTS_LIST_STALE_MS,
    initialData: cached && cached.length > 0 ? cached : undefined,
    placeholderData: (prev) => prev,
  });

  // Veg preference must not hide the grocery tile — use non-veg list for presence.
  void vegOnly;

  const groceryEnabled =
    canQuery &&
    ((query.data?.length ?? 0) > 0 ||
      (query.isLoading && (cached?.length ?? 0) > 0));

  return {
    groceryEnabled,
    isLoading: query.isLoading,
    count: query.data?.length ?? 0,
  };
}
