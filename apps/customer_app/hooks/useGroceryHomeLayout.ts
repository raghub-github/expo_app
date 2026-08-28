import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { extractCustomerGeoHints } from "@/lib/customer-geo-hints";
import type { FoodHomeLayoutKey } from "@/lib/foodHomeLayout";
import { getGroceryHomeLayout } from "@/services/groceryHomeLayout.service";
import type { ReverseGeocodeResult } from "@/services/location.service";

const STALE_MS = 10 * 60 * 1000;
const GC_MS = 30 * 60 * 1000;

export function buildGroceryHomeLayoutQueryKey(hints: ReturnType<typeof extractCustomerGeoHints>) {
  return ["grocery-home-layout", hints.pincode, hints.state, hints.lat, hints.lng] as const;
}

export function useGroceryHomeLayout(
  address: ReverseGeocodeResult | null | undefined,
  coords?: { latitude: number; longitude: number } | null
) {
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
  const queryKey = useMemo(() => buildGroceryHomeLayoutQueryKey(hints), [hints]);

  const query = useQuery({
    queryKey,
    queryFn: () => getGroceryHomeLayout(hints),
    enabled: canQuery,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

  const effectiveLayout = query.data;
  const layoutReady = !canQuery || effectiveLayout != null || query.isError;
  const layoutKey: FoodHomeLayoutKey | null = layoutReady
    ? (effectiveLayout?.layoutKey ?? "grid_first")
    : effectiveLayout?.layoutKey ?? null;

  const gridFirstHeroMedia = effectiveLayout?.gridFirstHeroMedia ?? [];

  return {
    ...query,
    data: effectiveLayout,
    layoutKey,
    layoutReady,
    canQuery,
    gridFirstHeroMedia,
  };
}
