import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useRiderStatus } from "@/src/hooks/useOnboarding";
import { getGeoServiceAvailability } from "@/src/services/geoServices.service";

export const riderGeoServicesQueryKey = (
  state: string | null,
  pincode: string | null,
  lat: number | null,
  lon: number | null,
) => ["rider", "geo", "services", state, pincode, lat, lon] as const;

export function useRiderGeoServiceAvailability() {
  const session = useSessionStore((s) => s.session);
  const riderId = session?.riderId;
  const { data: riderStatus } = useRiderStatus(riderId);

  const state = riderStatus?.homeAddress?.state?.trim() || null;
  const pincode = riderStatus?.homeAddress?.pincode?.trim() || null;
  const lat = riderStatus?.homeAddress?.lat ?? null;
  const lon = riderStatus?.homeAddress?.lon ?? null;
  const canQuery = !!(state || pincode || (lat != null && lon != null));

  return useQuery({
    queryKey: riderGeoServicesQueryKey(state, pincode, lat, lon),
    queryFn: async () => {
      const result = await getGeoServiceAvailability({
        ...(state ? { state } : {}),
        ...(pincode ? { pincode } : {}),
        ...(lat != null && lon != null ? { lat, lng: lon } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.availability;
    },
    enabled: canQuery,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    gcTime: 10 * 60_000,
    retry: 2,
  });
}
