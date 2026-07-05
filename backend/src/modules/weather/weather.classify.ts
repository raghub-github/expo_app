import type { WeatherSeverity, WeatherThresholds } from "./weather.types.js";

export function buildZoneKey(
  lat: number,
  lng: number,
  city?: string | null,
  zoneName?: string | null
): {
  zoneKey: string;
  zone: string;
  city: string;
} {
  const zLat = Math.round(lat * 100) / 100;
  const zLng = Math.round(lng * 100) / 100;
  const cityName = (city ?? "Unknown").trim() || "Unknown";
  const zone = zoneName?.trim() || `${zLat},${zLng}`;
  // Grid-first key — avoids one stale snapshot for an entire state (e.g. cityHint = "Bihar").
  return {
    zoneKey: `grid:${zLat}_${zLng}`,
    zone,
    city: cityName,
  };
}

export function classifyWeatherSeverity(args: {
  rainIntensityMm: number;
  windSpeedKmh: number | null;
  isThunderstorm: boolean;
  rainDetected?: boolean;
  thresholds: WeatherThresholds;
}): WeatherSeverity {
  const { rainIntensityMm, isThunderstorm, thresholds } = args;
  const rainDetected = args.rainDetected ?? rainIntensityMm >= thresholds.lightRainThresholdMm;

  if (!rainDetected && !isThunderstorm) {
    return "CLEAR";
  }

  if (isThunderstorm || rainIntensityMm >= thresholds.extremeRainThresholdMm) {
    return "EXTREME_WEATHER";
  }
  if (rainIntensityMm >= thresholds.heavyRainThresholdMm) return "HEAVY_RAIN";
  if (rainIntensityMm >= thresholds.moderateRainThresholdMm) return "MODERATE_RAIN";
  if (rainIntensityMm >= thresholds.lightRainThresholdMm) return "LIGHT_RAIN";
  return "CLEAR";
}

export function etaDelayForSeverity(
  severity: WeatherSeverity,
  thresholds: WeatherThresholds
): number {
  switch (severity) {
    case "LIGHT_RAIN":
      return thresholds.etaDelayLightMinutes;
    case "MODERATE_RAIN":
      return thresholds.etaDelayModerateMinutes;
    case "HEAVY_RAIN":
      return thresholds.etaDelayHeavyMinutes;
    case "EXTREME_WEATHER":
      return thresholds.etaDelayExtremeMinutes;
    default:
      return 0;
  }
}

/** Maps weather severity → legacy ETA engine WeatherState. */
export function toEtaEngineWeatherState(severity: WeatherSeverity): import("../eta/etaContext.js").WeatherState {
  switch (severity) {
    case "LIGHT_RAIN":
      return "LIGHT_RAIN";
    case "MODERATE_RAIN":
      return "MODERATE_RAIN";
    case "HEAVY_RAIN":
      return "HEAVY_RAIN";
    case "EXTREME_WEATHER":
      return "EXTREME_WEATHER";
    default:
      return "CLEAR";
  }
}
