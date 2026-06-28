import { getSql } from "../../db/client.js";
import type { WeatherThresholds } from "./weather.types.js";

const DEFAULTS: WeatherThresholds = {
  lightRainThresholdMm: 0.5,
  moderateRainThresholdMm: 2.0,
  heavyRainThresholdMm: 7.0,
  extremeRainThresholdMm: 15.0,
  extremeWindSpeedKmh: 50,
  cacheTtlMinutes: 10080,
  /** Deprecated — background refresh removed; rain events drive updates. */
  refreshIntervalMinutes: 0,
  etaDelayLightMinutes: 3,
  etaDelayModerateMinutes: 5,
  etaDelayHeavyMinutes: 8,
  etaDelayExtremeMinutes: 15,
};

let cached: { at: number; value: WeatherThresholds } | null = null;
const CONFIG_CACHE_MS = 60_000;

function parseNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export async function getWeatherThresholds(): Promise<WeatherThresholds> {
  if (cached && Date.now() - cached.at < CONFIG_CACHE_MS) return cached.value;
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT config_key, config_value
      FROM system_config
      WHERE category = 'weather'
    `) as Array<{ config_key: string; config_value: string }>;

    const map = new Map(rows.map((r) => [r.config_key, r.config_value]));
    const value: WeatherThresholds = {
      lightRainThresholdMm: parseNum(map.get("weather.light_rain_threshold_mm"), DEFAULTS.lightRainThresholdMm),
      moderateRainThresholdMm: parseNum(
        map.get("weather.moderate_rain_threshold_mm"),
        DEFAULTS.moderateRainThresholdMm
      ),
      heavyRainThresholdMm: parseNum(map.get("weather.heavy_rain_threshold_mm"), DEFAULTS.heavyRainThresholdMm),
      extremeRainThresholdMm: parseNum(
        map.get("weather.extreme_rain_threshold_mm"),
        DEFAULTS.extremeRainThresholdMm
      ),
      extremeWindSpeedKmh: parseNum(map.get("weather.extreme_wind_speed_kmh"), DEFAULTS.extremeWindSpeedKmh),
      cacheTtlMinutes: parseNum(map.get("weather.cache_ttl_minutes"), DEFAULTS.cacheTtlMinutes),
      refreshIntervalMinutes: parseNum(
        map.get("weather.refresh_interval_minutes"),
        DEFAULTS.refreshIntervalMinutes
      ),
      etaDelayLightMinutes: parseNum(map.get("weather.eta_delay_light_minutes"), DEFAULTS.etaDelayLightMinutes),
      etaDelayModerateMinutes: parseNum(
        map.get("weather.eta_delay_moderate_minutes"),
        DEFAULTS.etaDelayModerateMinutes
      ),
      etaDelayHeavyMinutes: parseNum(map.get("weather.eta_delay_heavy_minutes"), DEFAULTS.etaDelayHeavyMinutes),
      etaDelayExtremeMinutes: parseNum(
        map.get("weather.eta_delay_extreme_minutes"),
        DEFAULTS.etaDelayExtremeMinutes
      ),
    };
    cached = { at: Date.now(), value };
    return value;
  } catch {
    return DEFAULTS;
  }
}

export function invalidateWeatherConfigCache(): void {
  cached = null;
}
