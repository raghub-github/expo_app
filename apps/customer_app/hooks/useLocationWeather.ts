import { useQuery } from "@tanstack/react-query";
import { weatherService } from "@/services/weather.service";

export function useLocationWeather(args: {
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  area?: string | null;
  enabled?: boolean;
}) {
  const lat = args.lat;
  const lng = args.lng;
  const enabled =
    (args.enabled ?? true) &&
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);

  return useQuery({
    queryKey: ["weather", lat, lng, args.city, args.area],
    queryFn: () =>
      weatherService.getForLocationSafe({
        lat: lat!,
        lng: lng!,
        city: args.city,
        area: args.area,
      }),
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    retry: 1,
  });
}
