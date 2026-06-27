import type { ZoneWeatherSnapshot } from "./weather.types.js";
import type { MappedOpenMeteoWeather } from "./weather.mapper.js";
import {
  WEATHER_CHANGE_CLOUD_PCT,
  WEATHER_CHANGE_HUMIDITY_PCT,
  WEATHER_CHANGE_TEMP_C,
  WEATHER_CHANGE_VISIBILITY_KM,
  WEATHER_CHANGE_WIND_KMH,
} from "./weather.constants.js";

export type WeatherComparable = {
  weatherCode: number | null;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  visibilityKm: number | null;
  cloudCoverPct: number | null;
  rainDetected: boolean;
  weatherSeverity: string;
};

export function snapshotToComparable(s: ZoneWeatherSnapshot, payload?: Record<string, unknown> | null): WeatherComparable {
  const mapped = payload?.mapped as MappedOpenMeteoWeather | undefined;
  if (mapped) return mappedToComparable(mapped);

  const current = (payload?.current ?? {}) as Record<string, unknown>;
  const code = payload?.weatherCode != null ? Number(payload.weatherCode) : num(current.weather_code);
  return {
    weatherCode: Number.isFinite(code) ? code : null,
    temperatureC: s.temperatureC,
    humidityPct: s.humidityPct,
    windSpeedKmh: s.windSpeedKmh,
    visibilityKm: num(payload?.visibilityKm) ?? visibilityFromRaw(payload),
    cloudCoverPct: num(payload?.cloudCoverPct) ?? num(current.cloud_cover),
    rainDetected: s.rainDetected,
    weatherSeverity: s.weatherSeverity,
  };
}

export function mappedToComparable(m: MappedOpenMeteoWeather): WeatherComparable {
  return {
    weatherCode: m.weatherCode,
    temperatureC: m.temperatureC,
    humidityPct: m.humidityPct,
    windSpeedKmh: m.windSpeedKmh,
    visibilityKm: m.visibilityKm,
    cloudCoverPct: m.cloudCoverPct,
    rainDetected: m.rainDetected,
    weatherSeverity: m.weatherSeverity,
  };
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function visibilityFromRaw(payload?: Record<string, unknown> | null): number | null {
  const current = (payload?.current ?? {}) as Record<string, unknown>;
  const visibilityM = num(current.visibility);
  if (visibilityM == null) return null;
  return Math.round((visibilityM / 1000) * 10) / 10;
}

export type WeatherChangeReason =
  | "weather_code"
  | "rain_started"
  | "rain_stopped"
  | "temperature"
  | "wind"
  | "humidity"
  | "visibility"
  | "cloud_cover"
  | "storm_status"
  | "severity";

/** Returns change reasons — empty array means no meaningful update. */
export function detectWeatherChanges(
  before: WeatherComparable | null,
  after: WeatherComparable
): WeatherChangeReason[] {
  if (!before) {
    return ["weather_code"];
  }

  const reasons: WeatherChangeReason[] = [];

  if (before.weatherCode !== after.weatherCode && after.weatherCode != null) {
    reasons.push("weather_code");
  }

  if (!before.rainDetected && after.rainDetected) reasons.push("rain_started");
  if (before.rainDetected && !after.rainDetected) reasons.push("rain_stopped");

  if (
    before.temperatureC != null &&
    after.temperatureC != null &&
    Math.abs(before.temperatureC - after.temperatureC) >= WEATHER_CHANGE_TEMP_C
  ) {
    reasons.push("temperature");
  }

  if (
    before.windSpeedKmh != null &&
    after.windSpeedKmh != null &&
    Math.abs(before.windSpeedKmh - after.windSpeedKmh) >= WEATHER_CHANGE_WIND_KMH
  ) {
    reasons.push("wind");
  }

  if (
    before.humidityPct != null &&
    after.humidityPct != null &&
    Math.abs(before.humidityPct - after.humidityPct) >= WEATHER_CHANGE_HUMIDITY_PCT
  ) {
    reasons.push("humidity");
  }

  if (
    before.visibilityKm != null &&
    after.visibilityKm != null &&
    Math.abs(before.visibilityKm - after.visibilityKm) >= WEATHER_CHANGE_VISIBILITY_KM
  ) {
    reasons.push("visibility");
  }

  if (
    before.cloudCoverPct != null &&
    after.cloudCoverPct != null &&
    Math.abs(before.cloudCoverPct - after.cloudCoverPct) >= WEATHER_CHANGE_CLOUD_PCT
  ) {
    reasons.push("cloud_cover");
  }

  if (before.weatherSeverity !== after.weatherSeverity) {
    reasons.push("severity");
    if (after.weatherSeverity === "EXTREME_WEATHER" || before.weatherSeverity === "EXTREME_WEATHER") {
      reasons.push("storm_status");
    }
  }

  return reasons;
}

export function hasSignificantWeatherChange(
  before: WeatherComparable | null,
  after: WeatherComparable
): boolean {
  return detectWeatherChanges(before, after).length > 0;
}

export function normalizeGeocodeKey(city: string, district?: string | null): string {
  return `${city.trim().toLowerCase()}|${(district ?? "").trim().toLowerCase()}`;
}

export function gridCoordKey(lat: number, lng: number): string {
  const zLat = Math.round(lat * 100) / 100;
  const zLng = Math.round(lng * 100) / 100;
  return `${zLat},${zLng}`;
}
