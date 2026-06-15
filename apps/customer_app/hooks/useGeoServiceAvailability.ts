import { useQuery } from "@tanstack/react-query";
import { getGeoServiceAvailability } from "@/services/geoServices.service";

export type GeoEnabledServices = {
  food: boolean;
  ride: boolean;
  parcels: boolean;
};

const DEFAULT_WHILE_LOADING: GeoEnabledServices = {
  food: true,
  ride: true,
  parcels: false,
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
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const enabledServices: GeoEnabledServices = (() => {
    if (!canQuery) return ALL_DISABLED;
    if (query.isLoading && !query.data) return DEFAULT_WHILE_LOADING;
    if (query.isError || !query.data) return ALL_DISABLED;
    return {
      food: query.data.food,
      ride: query.data.ride,
      parcels: query.data.parcel,
    };
  })();

  return {
    ...query,
    enabledServices,
    canQuery,
  };
}
