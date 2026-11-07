import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { weatherService, type CustomerWeatherContext } from "@/services/weather.service";
import {
  getBootstrapWeather,
  loadPersistedWeatherSnapshot,
  peekAnyPersistedWeather,
  peekPersistedWeatherSnapshot,
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

/** Clear weather can sit for half an hour; rain refreshes sooner. Not 7 days. */
const CLEAR_STALE_MS = 30 * 60 * 1000;
const RAIN_STALE_MS = 15 * 60 * 1000;

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

  return queryOptions({
    queryKey: locationWeatherQueryKey(params),
    queryFn: async ({ client, queryKey }) => {
      if (__DEV__) {
        try {
          const { startupInc } = require("@/lib/startupPerf") as typeof import("@/lib/startupPerf");
          startupInc("weather_requests");
        } catch {
          /* ignore */
        }
      }
      const data = await weatherService.getForLocationSafe({
        lat: lat!,
        lng: lng!,
        city: params.city,
        area: params.area,
      });
      if (data.temperatureC != null && Number.isFinite(data.temperatureC)) {
        setBootstrapWeather(lat!, lng!, data);
        void persistWeatherSnapshot(lat!, lng!, data);
        return data;
      }
      // Never cache null-temp CLEAR over a good snapshot — that hides the Home weather pill.
      const existing = client.getQueryData<CustomerWeatherContext>(queryKey);
      if (existing?.temperatureC != null && Number.isFinite(existing.temperatureC)) {
        return existing;
      }
      const boot = getBootstrapWeather(lat!, lng!);
      if (boot?.temperatureC != null && Number.isFinite(boot.temperatureC)) {
        return boot;
      }
      // Fail the fetch (do not cache null-temp CLEAR). useQuery has throwOnError:false
      // so this never hits an ErrorBoundary; callers of prefetchQuery must catch.
      throw new Error("weather_missing_temperature");
    },
    enabled,
    staleTime: CLEAR_STALE_MS,
    gcTime: 30 * 24 * 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
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

/** Seed RQ from disk immediately; network prefetch runs in background (does not block UI). */
export async function restoreAndPrefetchLocationWeather(
  queryClient: QueryClient,
  address: Parameters<typeof resolveHomeWeatherQueryParams>[0],
  coords: { latitude: number; longitude: number } | null
): Promise<void> {
  if (!coords) return;
  const params = resolveHomeWeatherQueryParams(address, coords);
  if (params.lat == null || params.lng == null) return;

  // Sync peek first — Home can paint without awaiting AsyncStorage / network.
  let restored =
    peekPersistedWeatherSnapshot(params.lat, params.lng) ??
    getBootstrapWeather(params.lat, params.lng) ??
    null;
  if (!restored) {
    restored = await loadPersistedWeatherSnapshot(params.lat, params.lng);
  }
  if (restored) {
    queryClient.setQueryData(locationWeatherQueryKey(params), restored);
  }

  const options = locationWeatherQueryOptions(params);
  if (!options.enabled) return;

  // Fire-and-forget network warm — never block Home on weather API latency.
  void queryClient
    .prefetchQuery({
      ...options,
      staleTime: restored ? staleTimeForWeather(restored) : CLEAR_STALE_MS,
    })
    .catch(() => {
      // weather_missing_temperature / network — keep disk seed if present.
    });
}

export function prefetchLocationWeather(
  queryClient: QueryClient,
  params: LocationWeatherParams
) {
  const options = locationWeatherQueryOptions(params);
  if (!options.enabled) return Promise.resolve();
  return queryClient.prefetchQuery(options).catch(() => undefined);
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

  const exactBootstrap =
    lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
      ? getBootstrapWeather(lat, lng) ?? peekPersistedWeatherSnapshot(lat, lng) ?? undefined
      : undefined;
  // Soft last-known weather so the banner never sits on skeleton while a new grid fetches.
  const softBootstrap = exactBootstrap ?? peekAnyPersistedWeather() ?? undefined;

  return useQuery({
    ...locationWeatherQueryOptions({ lat, lng, city: args.city, area: args.area }),
    enabled,
    initialData: exactBootstrap,
    initialDataUpdatedAt: exactBootstrap?.updatedAt
      ? new Date(exactBootstrap.updatedAt).getTime()
      : undefined,
    placeholderData: (prev) => {
      const candidate = prev ?? exactBootstrap ?? softBootstrap;
      if (
        candidate?.temperatureC != null &&
        Number.isFinite(candidate.temperatureC)
      ) {
        return candidate;
      }
      return undefined;
    },
    staleTime: (query) => staleTimeForWeather(query.state.data ?? exactBootstrap),
    // If a prior failure cached null-temp CLEAR, refetch so the Home pill can recover.
    refetchOnMount: (query) => {
      const data = query.state.data;
      if (data == null) return true;
      if (data.temperatureC == null || !Number.isFinite(data.temperatureC)) return "always";
      const updated = query.state.dataUpdatedAt;
      const maxAge = staleTimeForWeather(data);
      if (!updated || Date.now() - updated > maxAge) return true;
      return false;
    },
    select: (data) => {
      if (data?.temperatureC != null && Number.isFinite(data.temperatureC)) return data;
      return exactBootstrap ?? softBootstrap ?? data;
    },
  });
}
