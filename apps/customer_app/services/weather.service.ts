/**
 * Customer weather client — all data from backend /v1/weather/* (never OpenWeather directly).
 */
import api from "./api";

export type WeatherSeverity =
  | "CLEAR"
  | "LIGHT_RAIN"
  | "MODERATE_RAIN"
  | "HEAVY_RAIN"
  | "EXTREME_WEATHER";

export type WeatherPanelDetails = {
  feelsLikeC: number | null;
  pressureHpa: number | null;
  visibilityKm: number | null;
  cloudCoverPct: number | null;
  windGustKmh: number | null;
  weatherId: number | null;
  weatherMain: string | null;
  weatherDescription: string | null;
  sunriseAt: string | null;
  sunsetAt: string | null;
  rainfallMm1h: number | null;
  uvIndex: number | null;
  aqi: number | null;
  aqiLabel: string | null;
  rainProbabilityPct?: number | null;
  windDirectionDeg?: number | null;
  isDay?: boolean | null;
  snowfallCm?: number | null;
};

export type CustomerWeatherContext = {
  severity: WeatherSeverity;
  rainDetected: boolean;
  rainIntensityMm: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  weatherCondition: string;
  city: string | null;
  zone: string | null;
  areaLabel: string | null;
  chipLabel: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  showChip: boolean;
  showBanner: boolean;
  etaDelayMinutes: number;
  etaImpactLabel: string | null;
  trackingMessage: string | null;
  updatedAt: string | null;
  zoneKey?: string | null;
  details?: WeatherPanelDetails | null;
  futureHooks: {
    surgeEligible: boolean;
    weatherPriorityBoost: boolean;
    weatherDispatchWeight: number;
    dispatchPriorityBoost: number;
    zoneAlertActive: boolean;
  };
};

export type WeatherEtaAdjustment = {
  weather: CustomerWeatherContext;
  baseEtaMinutes: number;
  weatherDelayMinutes: number;
  adjustedEtaMinutes: number;
  includesWeatherImpact: boolean;
  impactLabel: string | null;
};

/** Silent fallback — weather must never block ordering or spam logs when backend is slow/down. */
export const CLEAR_WEATHER_CONTEXT: CustomerWeatherContext = {
  severity: "CLEAR",
  rainDetected: false,
  rainIntensityMm: 0,
  temperatureC: null,
  humidityPct: null,
  windSpeedKmh: null,
  weatherCondition: "Clear",
  city: null,
  zone: null,
  areaLabel: null,
  chipLabel: null,
  bannerTitle: null,
  bannerSubtitle: null,
  showChip: false,
  showBanner: false,
  etaDelayMinutes: 0,
  etaImpactLabel: null,
  trackingMessage: null,
  updatedAt: null,
  zoneKey: null,
  futureHooks: {
    surgeEligible: false,
    weatherPriorityBoost: false,
    weatherDispatchWeight: 0,
    dispatchPriorityBoost: 0,
    zoneAlertActive: false,
  },
};

const WEATHER_API_TIMEOUT_MS = 5_000;

function sanitizeWeatherParam(value?: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location"
  ) {
    return undefined;
  }
  return trimmed;
}

async function fetchWeatherLocation(args: {
  lat: number;
  lng: number;
  city?: string | null;
  area?: string | null;
}): Promise<CustomerWeatherContext> {
  const city = sanitizeWeatherParam(args.city);
  const area = sanitizeWeatherParam(args.area);
  const { data } = await api.get<CustomerWeatherContext>("/v1/weather/location", {
    params: {
      lat: args.lat,
      lng: args.lng,
      ...(city ? { city } : {}),
      ...(area ? { area } : {}),
    },
    timeout: WEATHER_API_TIMEOUT_MS,
    // Skip global axios dev warning — failures are handled via getForLocationSafe.
    headers: { "X-Silent-Error": "1" },
  });
  return data;
}

/** Never throws — returns CLEAR on timeout/network/backend errors. */
export async function getForLocationSafe(args: {
  lat: number;
  lng: number;
  city?: string | null;
  area?: string | null;
}): Promise<CustomerWeatherContext> {
  try {
    return await fetchWeatherLocation(args);
  } catch {
    return CLEAR_WEATHER_CONTEXT;
  }
}

export const weatherService = {
  getForLocation: fetchWeatherLocation,
  getForLocationSafe,

  async getEtaAdjustment(args: {
    lat: number;
    lng: number;
    baseEtaMinutes: number;
    city?: string | null;
    area?: string | null;
  }): Promise<WeatherEtaAdjustment> {
    const { data } = await api.get<WeatherEtaAdjustment>("/v1/weather/eta-adjustment", {
      params: {
        lat: args.lat,
        lng: args.lng,
        baseEtaMinutes: args.baseEtaMinutes,
        ...(args.city ? { city: args.city } : {}),
        ...(args.area ? { area: args.area } : {}),
      },
      timeout: 12_000,
    });
    return data;
  },
};

/** Apply backend weather delay to a local ETA preview range. */
export function applyWeatherToEtaRange(
  etaMin: number,
  etaMax: number,
  delayMinutes: number
): { etaMinMinutes: number; etaMaxMinutes: number; includesWeatherImpact: boolean } {
  if (!delayMinutes || delayMinutes <= 0) {
    return { etaMinMinutes: etaMin, etaMaxMinutes: etaMax, includesWeatherImpact: false };
  }
  return {
    etaMinMinutes: etaMin + delayMinutes,
    etaMaxMinutes: etaMax + delayMinutes,
    includesWeatherImpact: true,
  };
}
