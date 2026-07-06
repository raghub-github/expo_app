import type { WeatherChangeReason } from "./weather.utils.js";
import type { WeatherSeverity, WeatherThresholds } from "./weather.types.js";

/** User-facing rain alerts only — never wind-only or code-only drizzle without measurable rain. */
export function isRainAlertActive(args: {
  rainDetected: boolean;
  rainIntensityMm: number;
  weatherSeverity: WeatherSeverity;
  isThunderstorm?: boolean;
  thresholds: WeatherThresholds;
}): boolean {
  const mm = Math.max(0, args.rainIntensityMm);
  if (args.isThunderstorm && mm >= args.thresholds.lightRainThresholdMm) return true;
  if (!args.rainDetected) return false;
  if (mm < args.thresholds.lightRainThresholdMm) return false;
  return args.weatherSeverity !== "CLEAR";
}

export function shouldBroadcastWeatherUpdate(
  reasons: WeatherChangeReason[],
  after: { rainDetected: boolean; weatherSeverity: string }
): boolean {
  if (reasons.includes("rain_started") || reasons.includes("rain_stopped")) return true;
  if (!after.rainDetected && after.weatherSeverity === "CLEAR") {
    return reasons.includes("rain_stopped") || reasons.includes("severity");
  }
  if (!after.rainDetected) return false;
  return reasons.some(
    (r) => r === "rain_started" || r === "rain_stopped" || r === "storm_status" || r === "severity"
  );
}

export function normalizeZoneDisplayName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === "unknown" || lower === "unknown area" || lower === "your area") return null;
  if (/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return trimmed;
}
