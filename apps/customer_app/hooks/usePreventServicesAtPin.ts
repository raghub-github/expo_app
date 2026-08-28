/**
 * Authoritative Prevent Services state for the customer's **service location**.
 *
 * Decision authority (locks / order eligibility):
 * - Food / Grocery → selected delivery pin lat/lng (same as merchant listing)
 * - Never state / city / pincode / address text alone
 * - Never physical GPS alone when a selected delivery address is active
 *
 * Calls /v1/prevent-services/check with those coordinates so listing lock +
 * bottom sheet stay correct even if geo/services merge lags.
 */

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useLocationStore } from "@/store/locationStore";
import { useDebouncedCoords } from "@/hooks/useDebouncedCoords";
import { useAddresses, useActiveLocation } from "@/hooks/useAddresses";
import { resolveMerchantListingCoords } from "@/lib/resolveMerchantListingCoords";
import { checkPreventServices } from "@/services/preventServices.service";
import { pollIntervalWithBackoff } from "@/lib/query-poll-backoff";

export const PREVENT_CHECK_QUERY_KEY = ["prevent", "check"] as const;

function hasFoodBlock(codes: string[]): boolean {
  const s = new Set(codes.map((c) => c.toLowerCase()));
  return s.has("food") || s.has("grocery") || s.has("pharmacy");
}

function hasRideBlock(codes: string[]): boolean {
  return codes.some((c) => c.toLowerCase() === "ride");
}

function hasParcelBlock(codes: string[]): boolean {
  const s = new Set(codes.map((c) => c.toLowerCase()));
  return s.has("parcel") || s.has("courier");
}

/**
 * Resolves the service-location pin used to allow/deny Food (and default Ride
 * awareness when ride screens share the home pin). Selected delivery address
 * wins; live GPS is only used when it *is* the active delivery pin.
 */
export function usePreventServicesAtPin() {
  const coords = useLocationStore((s) => s.coords);
  const locationSource = useLocationStore((s) => s.locationSource);
  const debouncedCoords = useDebouncedCoords(coords, 250);
  const { data: addresses = [] } = useAddresses();
  const { data: activeLocation } = useActiveLocation();

  // Instant for saved/selected address; debounce only live GPS drift.
  const listingCoords =
    locationSource === "selected" ? coords : debouncedCoords;

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

  const lat =
    servicePin?.latitude != null && Number.isFinite(servicePin.latitude)
      ? servicePin.latitude
      : null;
  const lng =
    servicePin?.longitude != null && Number.isFinite(servicePin.longitude)
      ? servicePin.longitude
      : null;
  // Lat/lng required — never decide from pincode/state/text alone.
  const enabled = lat != null && lng != null;

  const query = useQuery({
    queryKey: [...PREVENT_CHECK_QUERY_KEY, "service-pin", lat, lng],
    queryFn: async () => {
      if (lat == null || lng == null) {
        return {
          blocked: false,
          blockedServices: [] as string[],
          code: null,
          message: null,
          title: null,
          nearest: null,
        };
      }
      return checkPreventServices({ lat, lng });
    },
    enabled,
    staleTime: 45_000,
    refetchInterval: (query) => pollIntervalWithBackoff(query, 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
  });

  const blockedServices = query.data?.blockedServices ?? [];
  const nearest = query.data?.nearest ?? null;

  return useMemo(
    () => ({
      isLoading: query.isLoading,
      isSuccess: query.isSuccess || query.isFetched,
      /** Decision lock: Food/Grocery orders + store cards (service pin only). */
      foodLocked: enabled && hasFoodBlock(blockedServices),
      /** Decision lock: Ride when this pin is the active service location. */
      rideLocked: enabled && hasRideBlock(blockedServices),
      /** Decision lock: Parcel when this pin is the active service location. */
      parcelLocked: enabled && hasParcelBlock(blockedServices),
      preventBlocked: enabled ? blockedServices : [],
      preventReason: nearest?.reason ?? null,
      preventLocationName: nearest?.locationName ?? null,
      preventRuleId: nearest?.ruleId ?? null,
      preventStartsAt: nearest?.startsAt ?? null,
      preventEndsAt: nearest?.endsAt ?? null,
      lat,
      lng,
      locationSource,
    }),
    [
      query.isLoading,
      query.isSuccess,
      query.isFetched,
      blockedServices,
      nearest,
      lat,
      lng,
      enabled,
      locationSource,
    ]
  );
}
