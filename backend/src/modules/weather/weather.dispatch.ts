import type { WeatherSeverity } from "./weather.types.js";

/** Dispatch engine weight ladder — do not alter assignment logic yet. */
export function dispatchPriorityBoostForSeverity(severity: WeatherSeverity): number {
  switch (severity) {
    case "MODERATE_RAIN":
      return 1;
    case "HEAVY_RAIN":
      return 2;
    case "EXTREME_WEATHER":
      return 3;
    default:
      return 0;
  }
}

/** Future rider surge / incentive weight (0–3). */
export function weatherDispatchWeightForSeverity(severity: WeatherSeverity): number {
  return dispatchPriorityBoostForSeverity(severity);
}

export function weatherPriorityBoostForSeverity(severity: WeatherSeverity): boolean {
  return severity === "HEAVY_RAIN" || severity === "EXTREME_WEATHER";
}

export function surgeEligibleForSeverity(severity: WeatherSeverity): boolean {
  return severity === "HEAVY_RAIN" || severity === "EXTREME_WEATHER";
}
