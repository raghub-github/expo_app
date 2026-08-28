import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getGeoServiceAvailability } from "@/services/geoServices.service";
import { pollIntervalWithBackoff } from "@/lib/query-poll-backoff";

export type GeoEnabledServices = {
  food: boolean;
  ride: boolean;
  parcels: boolean;
};

/** Optimistic while coverage loads — all three tiles stay tappable/painted. */
const DEFAULT_WHILE_LOADING: GeoEnabledServices = {
  food: true,
  ride: true,
  parcels: true,
};

const ALL_DISABLED: GeoEnabledServices = {
  food: false,
  ride: false,
  parcels: false,
};

export function useGeoServiceAvailability(args: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const pincode = args.pincode?.trim() || null;
  const state = args.state?.trim() || null;
  const lat = args.lat != null && Number.isFinite(args.lat) ? args.lat : null;
  const lng = args.lng != null && Number.isFinite(args.lng) ? args.lng : null;

  const canQuery = !!(pincode || state || (lat != null && lng != null));

  const query = useQuery({
    queryKey: ["geo", "services", pincode, state, lat, lng],
    queryFn: async () => {
      const result = await getGeoServiceAvailability({
        ...(pincode ? { pincode } : {}),
        ...(state ? { state } : {}),
        ...(lat != null && lng != null ? { lat, lng } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.availability;
    },
    enabled: canQuery,
    // Emergency blocks must surface without a manual refresh. usePreventServicesRealtime
    // pushes an invalidation within ~1s of an admin change; these settings are the
    // safety net when Realtime is unavailable and for schedule-based expiry.
    staleTime: 30_000,
    refetchInterval: (query) => pollIntervalWithBackoff(query, 60_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    // Keep prior coverage while coords/pincode change so tiles don't flash disabled
    // and remount (which was blanking service-card images on Android).
    placeholderData: keepPreviousData,
  });

  const enabledServices: GeoEnabledServices = (() => {
    if (!canQuery) return ALL_DISABLED;
    if (query.isLoading && !query.data) return DEFAULT_WHILE_LOADING;
    if (!query.data) return ALL_DISABLED;
    // Main home / tab bar: use coverage* so Prevent Services does not grey out
    // tiles — user can enter the inner page, where ServiceBlockedGateHost runs.
    // On error, keepPreviousData still supplies last successful coverage.
    const food = query.data.coverageFood ?? query.data.food;
    const ride = query.data.coverageRide ?? query.data.ride;
    const parcels = query.data.coverageParcel ?? query.data.parcel;
    return { food, ride, parcels };
  })();

  /**
   * Services turned off right now by an emergency Prevent Services rule.
   * Empty when the location is simply outside coverage, so callers can show the
   * "Service Temporarily Unavailable" copy only when it is actually accurate.
   */
  const preventBlocked: string[] = query.data?.preventBlocked ?? [];
  const preventReason: string | null = query.data?.preventReason ?? null;
  const preventLocationName: string | null = query.data?.preventLocationName ?? null;
  const preventRuleId: string | null = query.data?.preventRuleId ?? null;
  const preventStartsAt: string | null = query.data?.preventStartsAt ?? null;
  const preventEndsAt: string | null = query.data?.preventEndsAt ?? null;

  return {
    ...query,
    enabledServices,
    preventBlocked,
    preventReason,
    preventLocationName,
    preventRuleId,
    preventStartsAt,
    preventEndsAt,
    canQuery,
  };
}
