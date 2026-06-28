/** Open-Meteo — no API key required. */
export const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export const WEATHER_CACHE_TTL_MS = 8 * 60 * 1000;
export const WEATHER_API_TIMEOUT_MS = 12_000;

/** Change-detection thresholds (PRD). */
export const WEATHER_CHANGE_TEMP_C = 2;
export const WEATHER_CHANGE_WIND_KMH = 10;
export const WEATHER_CHANGE_HUMIDITY_PCT = 10;
export const WEATHER_CHANGE_CLOUD_PCT = 15;
export const WEATHER_CHANGE_VISIBILITY_KM = 1;

export const OPEN_METEO_CURRENT_FIELDS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "surface_pressure",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "is_day",
  "uv_index",
  "visibility",
] as const;
