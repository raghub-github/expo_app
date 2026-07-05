import type { CustomerWeatherContext, MerchantWeatherContext, WeatherSeverity } from "./weather.types.js";
import { extractWeatherPanelDetails } from "./weather.panel-details.js";
import {
  dispatchPriorityBoostForSeverity,
  surgeEligibleForSeverity,
  weatherDispatchWeightForSeverity,
  weatherPriorityBoostForSeverity,
} from "./weather.dispatch.js";
import { isRainAlertActive, normalizeZoneDisplayName } from "./weather.alerts.js";
import type { WeatherThresholds } from "./weather.types.js";

export function buildCustomerWeatherPresentation(args: {
  severity: WeatherSeverity;
  rainDetected: boolean;
  rainIntensityMm: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  weatherCondition: string;
  city: string | null;
  zone: string | null;
  areaLabel?: string | null;
  etaDelayMinutes: number;
  updatedAt: string | null;
  zoneKey?: string | null;
  providerPayload?: Record<string, unknown> | null;
  isThunderstorm?: boolean;
  alertThresholds?: WeatherThresholds;
}): CustomerWeatherContext {
  const area = normalizeZoneDisplayName(args.areaLabel) ?? normalizeZoneDisplayName(args.city) ?? "your area";
  const { severity } = args;
  const details = extractWeatherPanelDetails(args.providerPayload);
  const thresholds = args.alertThresholds;
  const alertActive =
    thresholds != null
      ? isRainAlertActive({
          rainDetected: args.rainDetected,
          rainIntensityMm: args.rainIntensityMm,
          weatherSeverity: severity,
          isThunderstorm: args.isThunderstorm,
          thresholds,
        })
      : args.rainDetected && severity !== "CLEAR";

  if (severity === "CLEAR" || !alertActive) {
    return {
      severity,
      rainDetected: false,
      rainIntensityMm: args.rainIntensityMm,
      temperatureC: args.temperatureC,
      humidityPct: args.humidityPct,
      windSpeedKmh: args.windSpeedKmh,
      weatherCondition: args.weatherCondition,
      city: args.city,
      zone: args.zone,
      areaLabel: args.areaLabel ?? args.city,
      chipLabel: "☀ Clear Weather",
      bannerTitle: null,
      bannerSubtitle: null,
      showChip: false,
      showBanner: false,
      etaDelayMinutes: 0,
      etaImpactLabel: null,
      trackingMessage: null,
      updatedAt: args.updatedAt,
      zoneKey: args.zoneKey ?? null,
      details,
      futureHooks: buildFutureHooks("CLEAR"),
    };
  }

  const chipBySeverity: Record<Exclude<WeatherSeverity, "CLEAR">, string> = {
    LIGHT_RAIN: `🌦 Light rain in your area`,
    MODERATE_RAIN: `🌧 Rain in ${area}`,
    HEAVY_RAIN: `⚠ Weather Delay Active`,
    EXTREME_WEATHER: `🚨 Severe weather`,
  };

  const bannerBySeverity: Record<Exclude<WeatherSeverity, "CLEAR">, { title: string; subtitle: string }> = {
    LIGHT_RAIN: {
      title: `Light rain in ${area}`,
      subtitle: "Delivery may take a little longer than usual",
    },
    MODERATE_RAIN: {
      title: `Rain in ${area}`,
      subtitle: "Rain may slightly increase delivery times",
    },
    HEAVY_RAIN: {
      title: `Heavy rain in ${area}`,
      subtitle: "Deliveries may take longer than usual",
    },
    EXTREME_WEATHER: {
      title: `Severe weather in ${area}`,
      subtitle: "Delivery availability may be limited",
    },
  };

  const trackingMessage =
    "🌧 Rain in your area — delivery partners may take longer to reach you.";

  const etaImpactLabel =
    args.etaDelayMinutes > 0 ? `Includes weather impact (+${args.etaDelayMinutes} mins)` : null;

  const banner = bannerBySeverity[severity];

  return {
    severity,
    rainDetected: args.rainDetected,
    rainIntensityMm: args.rainIntensityMm,
    temperatureC: args.temperatureC,
    humidityPct: args.humidityPct,
    windSpeedKmh: args.windSpeedKmh,
    weatherCondition: args.weatherCondition,
    city: args.city,
    zone: args.zone,
    areaLabel: args.areaLabel ?? args.city,
    chipLabel: chipBySeverity[severity],
    bannerTitle: banner.title,
    bannerSubtitle: banner.subtitle,
    showChip: true,
    showBanner: true,
    etaDelayMinutes: args.etaDelayMinutes,
    etaImpactLabel,
    trackingMessage,
    updatedAt: args.updatedAt,
    zoneKey: args.zoneKey ?? null,
    details,
    futureHooks: buildFutureHooks(severity),
  };
}

function buildFutureHooks(severity: WeatherSeverity): CustomerWeatherContext["futureHooks"] {
  return {
    surgeEligible: surgeEligibleForSeverity(severity),
    weatherPriorityBoost: weatherPriorityBoostForSeverity(severity),
    weatherDispatchWeight: weatherDispatchWeightForSeverity(severity),
    dispatchPriorityBoost: dispatchPriorityBoostForSeverity(severity),
    zoneAlertActive: severity === "EXTREME_WEATHER",
  };
}

export function buildMerchantWeatherPresentation(args: {
  severity: WeatherSeverity;
  weatherCondition: string;
  city: string | null;
  zoneName: string | null;
  etaDelayMinutes: number;
  updatedAt: string | null;
  rainDetected?: boolean;
  rainIntensityMm?: number;
  isThunderstorm?: boolean;
  alertThresholds?: WeatherThresholds;
}): MerchantWeatherContext {
  const area = normalizeZoneDisplayName(args.zoneName) ?? normalizeZoneDisplayName(args.city) ?? "your area";
  const hooks = buildFutureHooks(args.severity);
  const thresholds = args.alertThresholds;
  const alertActive =
    thresholds != null
      ? isRainAlertActive({
          rainDetected: !!args.rainDetected,
          rainIntensityMm: args.rainIntensityMm ?? 0,
          weatherSeverity: args.severity,
          isThunderstorm: args.isThunderstorm,
          thresholds,
        })
      : !!args.rainDetected && args.severity !== "CLEAR";

  if (!alertActive || args.severity === "CLEAR" || args.severity === "LIGHT_RAIN") {
    return {
      severity: alertActive ? args.severity : "CLEAR",
      weatherCondition: args.weatherCondition,
      zoneName: normalizeZoneDisplayName(args.zoneName),
      city: normalizeZoneDisplayName(args.city),
      chipLabel: null,
      bannerTitle: null,
      bannerSubtitle: null,
      showBanner: false,
      etaDelayMinutes: alertActive ? args.etaDelayMinutes : 0,
      updatedAt: args.updatedAt,
      futureHooks: hooks,
    };
  }

  const merchantCopy: Record<
    Exclude<WeatherSeverity, "CLEAR" | "LIGHT_RAIN">,
    { title: string; subtitle: string }
  > = {
    MODERATE_RAIN: {
      title: "🌧 Rain in your area",
      subtitle: "Delivery partners may take slightly longer to arrive.",
    },
    HEAVY_RAIN: {
      title: "🌧 Heavy rain detected in your area",
      subtitle: "Delivery partners may take longer to arrive.",
    },
    EXTREME_WEATHER: {
      title: "⚠ Weather may affect dispatch speed",
      subtitle: "Severe conditions — riders may need extra time to reach your store.",
    },
  };

  const copy = merchantCopy[args.severity as keyof typeof merchantCopy];
  return {
    severity: args.severity,
    weatherCondition: args.weatherCondition,
    zoneName: normalizeZoneDisplayName(args.zoneName),
    city: normalizeZoneDisplayName(args.city),
    chipLabel: copy?.title ?? null,
    bannerTitle: copy?.title ?? null,
    bannerSubtitle: copy?.subtitle ?? null,
    showBanner: true,
    etaDelayMinutes: args.etaDelayMinutes,
    updatedAt: args.updatedAt,
    futureHooks: hooks,
  };
}
