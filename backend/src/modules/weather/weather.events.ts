import { publishZoneWeatherEvent } from "../realtime/publish.js";
import { etaDelayForSeverity } from "./weather.classify.js";
import { buildCustomerWeatherPresentation } from "./weather.presentation.js";
import { getProviderPayloadFromCache } from "./weather.cache.js";
import type { CustomerWeatherContext, WeatherSeverity, ZoneWeatherSnapshot } from "./weather.types.js";
import { getWeatherThresholds } from "./weather.config.js";

export type RainWeatherEventType = "rain_started" | "rain_intensity_changed" | "rain_stopped";

export type RainWeatherEventInput = {
  event: RainWeatherEventType;
  lat: number;
  lng: number;
  cityHint?: string | null;
  areaLabel?: string | null;
  /** Optional provider hint — verified via Open-Meteo on ingest. */
  rainIntensityMm?: number | null;
};

function severityRank(severity: WeatherSeverity): number {
  switch (severity) {
    case "CLEAR":
      return 0;
    case "LIGHT_RAIN":
      return 1;
    case "MODERATE_RAIN":
      return 2;
    case "HEAVY_RAIN":
      return 3;
    case "EXTREME_WEATHER":
      return 4;
    default:
      return 0;
  }
}

function isMeaningfulRainChange(
  before: ZoneWeatherSnapshot | null,
  after: ZoneWeatherSnapshot
): RainWeatherEventType | null {
  const wasRain = before?.rainDetected === true || (before != null && before.weatherSeverity !== "CLEAR");
  const isRain = after.rainDetected || after.weatherSeverity !== "CLEAR";

  if (!wasRain && isRain) return "rain_started";
  if (wasRain && !isRain) return "rain_stopped";
  if (!isRain) return null;

  if (before == null) return "rain_started";

  if (before.weatherSeverity !== after.weatherSeverity) return "rain_intensity_changed";
  if (Math.abs(before.rainIntensityMm - after.rainIntensityMm) >= 0.5) {
    return "rain_intensity_changed";
  }
  if (severityRank(after.weatherSeverity) !== severityRank(before.weatherSeverity)) {
    return "rain_intensity_changed";
  }

  return null;
}

export async function snapshotToCustomerContext(
  snapshot: ZoneWeatherSnapshot,
  areaLabel?: string | null
): Promise<CustomerWeatherContext> {
  const thresholds = await getWeatherThresholds();
  const etaDelayMinutes = etaDelayForSeverity(snapshot.weatherSeverity, thresholds);
  const providerPayload = await getProviderPayloadFromCache(snapshot.zoneKey);
  return buildCustomerWeatherPresentation({
    severity: snapshot.weatherSeverity,
    rainDetected: snapshot.rainDetected,
    rainIntensityMm: snapshot.rainIntensityMm,
    temperatureC: snapshot.temperatureC,
    humidityPct: snapshot.humidityPct,
    windSpeedKmh: snapshot.windSpeedKmh,
    weatherCondition: snapshot.weatherCondition,
    city: snapshot.city,
    zone: snapshot.zone,
    areaLabel: areaLabel ?? snapshot.city,
    etaDelayMinutes,
    updatedAt: snapshot.updatedAt,
    zoneKey: snapshot.zoneKey,
    providerPayload,
  });
}

/** Push weather updates only when rain state meaningfully changes. */
export async function publishWeatherChangeIfNeeded(args: {
  before: ZoneWeatherSnapshot | null;
  after: ZoneWeatherSnapshot;
  areaLabel?: string | null;
  explicitEvent?: RainWeatherEventType;
}): Promise<RainWeatherEventType | null> {
  const eventType = args.explicitEvent ?? isMeaningfulRainChange(args.before, args.after);
  if (!eventType) return null;

  const weather = await snapshotToCustomerContext(args.after, args.areaLabel);
  await publishZoneWeatherEvent(args.after.zoneKey, {
    type: "weather_changed",
    event: eventType,
    zoneKey: args.after.zoneKey,
    weather,
  });
  return eventType;
}
