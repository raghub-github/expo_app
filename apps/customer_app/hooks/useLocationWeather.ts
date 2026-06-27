import { type QueryClient, useQuery } from "@tanstack/react-query";
import { weatherService, type CustomerWeatherContext } from "@/services/weather.service";
import {
  getBootstrapWeather,
  loadPersistedWeatherSnapshot,
  persistWeatherSnapshot,
  setBootstrapWeather,
} from "@/lib/weatherCacheStorage";
import { resolveHomeWeatherQueryParams } from "@/lib/weather-location";
import { weatherGridKey } from "@/lib/weatherGrid";

export type LocationWeatherParams = {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  area?: string | null;
};

export { weatherGridKey, isSameWeatherGrid } from "@/lib/weatherGrid";

const CLEAR_STALE_MS = 7 * 24 * 60 * 60 * 1000;
const RAIN_STALE_MS = 30 * 60 * 1000;

export function locationWeatherQueryKey(params: LocationWeatherParams) {
  if (
    params.lat != null &&
    params.lng != null &&
    Number.isFinite(params.lat) &&
    Number.isFinite(params.lng)
  ) {
    return ["weather", weatherGridKey(params.lat, params.lng)] as const;
  }
  return ["weather", params.lat, params.lng] as const;
}

function staleTimeForWeather(data: CustomerWeatherContext | undefined): number {
  if (!data) return 0;
  if (data.rainDetected || data.severity !== "CLEAR") return RAIN_STALE_MS;
  return CLEAR_STALE_MS;
}

export function locationWeatherQueryOptions(params: LocationWeatherParams) {
  const lat = params.lat;
  const lng = params.lng;
  const enabled =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);

  return {
    queryKey: locationWeatherQueryKey(params),
    queryFn: async () => {
      const data = await weatherService.getForLocationSafe({
        lat: lat!,
        lng: lng!,
        city: params.city,
        area: params.area,
      });
      if (data.temperatureC != null && Number.isFinite(data.temperatureC)) {
        setBootstrapWeather(lat!, lng!, data);
        void persistWeatherSnapshot(lat!, lng!, data);
      }
      return data;
    },
    enabled,
    staleTime: CLEAR_STALE_MS,
    gcTime: 30 * 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  } as const;
}

export function patchLocationWeatherCache(
  queryClient: QueryClient,
  params: LocationWeatherParams,
  weather: CustomerWeatherContext
) {
  queryClient.setQueryData(locationWeatherQueryKey(params), weather);
  if (
    params.lat != null &&
    params.lng != null &&
    weather.temperatureC != null &&
    Number.isFinite(weather.temperatureC)
  ) {
    void persistWeatherSnapshot(params.lat, params.lng, weather);
  }
}

/** Restore disk cache + warm React Query before home paints. */
export async function restoreAndPrefetchLocationWeather(
  queryClient: QueryClient,
  address: Parameters<typeof resolveHomeWeatherQueryParams>[0],
  coords: { latitude: number; longitude: number } | null
): Promise<void> {
  if (!coords) return;
  const params = resolveHomeWeatherQueryParams(address, coords);
  if (params.lat == null || params.lng == null) return;

  const restored = await loadPersistedWeatherSnapshot(params.lat, params.lng);
  if (restored) {
    queryClient.setQueryData(locationWeatherQueryKey(params), restored);
  }

  const options = locationWeatherQueryOptions(params);
  if (!options.enabled) return;
  void queryClient.prefetchQuery({
    ...options,
    staleTime: restored ? staleTimeForWeather(restored) : CLEAR_STALE_MS,
  });
}

export function prefetchLocationWeather(
  queryClient: QueryClient,
  params: LocationWeatherParams
) {
  const options = locationWeatherQueryOptions(params);
  if (!options.enabled) return Promise.resolve();
  return queryClient.prefetchQuery(options);
}

export function useLocationWeather(
  args: LocationWeatherParams & { enabled?: boolean }
) {
  const lat = args.lat;
  const lng = args.lng;
  const enabled =
    (args.enabled ?? true) &&
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  const bootstrap =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? getBootstrapWeather(lat, lng)
      : undefined;

  return useQuery({
    ...locationWeatherQueryOptions({ lat, lng, city: args.city, area: args.area }),
    enabled,
    initialData: bootstrap,
    initialDataUpdatedAt: bootstrap?.updatedAt
      ? new Date(bootstrap.updatedAt).getTime()
      : undefined,
    placeholderData: (prev) => prev ?? bootstrap,
    staleTime: (query) => staleTimeForWeather(query.state.data ?? bootstrap),
  });
}
