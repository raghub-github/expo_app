import {
  OPEN_METEO_CURRENT_FIELDS,
  OPEN_METEO_FORECAST_URL,
  OPEN_METEO_GEOCODING_URL,
  WEATHER_API_TIMEOUT_MS,
} from "./weather.constants.js";
import {
  recordWeatherApiCallStart,
  recordWeatherApiFailure,
  recordWeatherApiSuccess,
} from "./weather.monitoring.js";

export type OpenMeteoGeocodeResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

export type OpenMeteoForecastRaw = Record<string, unknown>;

async function fetchJson<T>(url: URL): Promise<T | null> {
  recordWeatherApiCallStart();
  const started = Date.now();
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(WEATHER_API_TIMEOUT_MS) });
    if (!res.ok) {
      recordWeatherApiFailure(`http_${res.status}`);
      return null;
    }
    recordWeatherApiSuccess(Date.now() - started);
    return (await res.json()) as T;
  } catch (e) {
    recordWeatherApiFailure(e instanceof Error ? e.message : "network_error");
    return null;
  }
}

export async function geocodeOpenMeteo(query: string): Promise<OpenMeteoGeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const url = new URL(OPEN_METEO_GEOCODING_URL);
  url.searchParams.set("name", trimmed);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");

  const data = await fetchJson<{ results?: Array<Record<string, unknown>> }>(url);
  const hit = data?.results?.[0];
  if (!hit) return null;
  const lat = Number(hit.latitude);
  const lng = Number(hit.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    name: String(hit.name ?? trimmed),
    latitude: lat,
    longitude: lng,
    country: hit.country != null ? String(hit.country) : undefined,
    admin1: hit.admin1 != null ? String(hit.admin1) : undefined,
  };
}

export async function fetchOpenMeteoForecast(
  lat: number,
  lng: number
): Promise<OpenMeteoForecastRaw | null> {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", OPEN_METEO_CURRENT_FIELDS.join(","));
  url.searchParams.set("hourly", "precipitation_probability,rain,showers,snowfall");
  url.searchParams.set("daily", "sunrise,sunset,uv_index_max");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "2");

  return fetchJson<OpenMeteoForecastRaw>(url);
}
