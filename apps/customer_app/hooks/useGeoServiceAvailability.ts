import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { getGeoServiceAvailability } from "@/services/geoServices.service";
import { pollIntervalWithBackoff } from "@/lib/query-poll-backoff";
import { merchantsGeoBucket } from "@/lib/merchantsListCache";

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

/** No pin / no data — food, ride (person), parcel tiles paint inactive. */
const ALL_DISABLED: GeoEnabledServices = {
  food: false,
  ride: false,
  parcels: false,
};

/** Stable React Query key — pincode-first; coords bucketed ~110m like merchants. */
export function geoServicesQueryKey(args: {
  pincode?: string | null;
  state?: string | null;
  lat?: number | null;
  lng?: number | null;
}): readonly unknown[] {
  const pincode = args.pincode?.trim() || null;
  const state = args.state?.trim() || null;
  const lat = args.lat != null && Number.isFinite(args.lat) ? args.lat : null;
  const lng = args.lng != null && Number.isFinite(args.lng) ? args.lng : null;
  const geoBucket =
    lat != null && lng != null ? merchantsGeoBucket(lat, lng) : null;
  return ["geo", "services", pincode, state, geoBucket] as const;
}

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
    queryKey: geoServicesQueryKey({ pincode, state, lat, lng }),
    queryFn: async () => {
      const result = await getGeoServiceAvailability({
        ...(pincode ? { pincode } : {}),
        ...(state ? { state } : {}),
        ...(lat != null && lng != null ? { lat, lng } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.availability;
    },
    // Prefer waiting for a real pin — never fire geo/services with only a UI label.
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
    // Home tiles + Food tab: use merged food/ride/parcel (coverage AND Prevent).
    // Inactive services grey out like E-Commerce; inner gates still apply on enter.
    return {
      food: query.data.food === true,
      ride: query.data.ride === true,
      parcels: query.data.parcel === true,
    };
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
