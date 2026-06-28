export type WeatherRefreshTrigger =
  | "zone_enter"
  | "customer_home"
  | "rider_online"
  | "merchant_dashboard"
  | "order_created"
  | "eta_calculation"
  | "manual_refresh"
  | "ws_connect"
  | "rain_event";

export type WeatherSeverity =
  | "CLEAR"
  | "LIGHT_RAIN"
  | "MODERATE_RAIN"
  | "HEAVY_RAIN"
  | "EXTREME_WEATHER";

export type WeatherThresholds = {
  lightRainThresholdMm: number;
  moderateRainThresholdMm: number;
  heavyRainThresholdMm: number;
  extremeRainThresholdMm: number;
  extremeWindSpeedKmh: number;
  cacheTtlMinutes: number;
  refreshIntervalMinutes: number;
  etaDelayLightMinutes: number;
  etaDelayModerateMinutes: number;
  etaDelayHeavyMinutes: number;
  etaDelayExtremeMinutes: number;
};

export type ZoneWeatherSnapshot = {
  zoneKey: string;
  city: string;
  zone: string;
  latitude: number;
  longitude: number;
  weatherCondition: string;
  rainDetected: boolean;
  rainIntensityMm: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  weatherSeverity: WeatherSeverity;
  updatedAt: string;
};

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

/** Payload returned to customer app surfaces. */
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
  /** Compact chip copy for location/home screens. */
  chipLabel: string | null;
  /** Longer banner copy for tracking / moderate+ states. */
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  /** Whether any weather UI should render. */
  showChip: boolean;
  showBanner: boolean;
  /** Customer-facing ETA adjustment (messaging only). */
  etaDelayMinutes: number;
  etaImpactLabel: string | null;
  trackingMessage: string | null;
  updatedAt: string | null;
  /** Grid cell key for WebSocket `zone:{zoneKey}` subscriptions. */
  zoneKey: string | null;
  details: WeatherPanelDetails | null;
  /** Future: rider surge / dispatch hooks (infrastructure only — not active yet). */
  futureHooks: {
    surgeEligible: boolean;
    weatherPriorityBoost: boolean;
    weatherDispatchWeight: number;
    dispatchPriorityBoost: number;
    zoneAlertActive: boolean;
  };
};

export type MerchantWeatherContext = {
  severity: WeatherSeverity;
  weatherCondition: string;
  zoneName: string | null;
  city: string | null;
  chipLabel: string | null;
  bannerTitle: string | null;
  bannerSubtitle: string | null;
  showBanner: boolean;
  etaDelayMinutes: number;
  updatedAt: string | null;
  futureHooks: CustomerWeatherContext["futureHooks"];
};

export type OrderWeatherSnapshotRecord = {
  orderCoreId: number;
  orderId: string;
  weatherCondition: string;
  weatherSeverity: WeatherSeverity;
  rainDetected: boolean;
  rainIntensityMm: number;
  temperatureC: number | null;
  weatherDelayMinutes: number;
  zoneName: string | null;
  zoneKey: string | null;
  city: string | null;
  dispatchPriorityBoost: number;
  surgeEligible: boolean;
  weatherPriorityBoost: boolean;
  weatherDispatchWeight: number;
  snapshotTimestamp: string;
};

export type WeatherEtaAdjustment = {
  baseEtaMinutes: number;
  weatherDelayMinutes: number;
  adjustedEtaMinutes: number;
  includesWeatherImpact: boolean;
  impactLabel: string | null;
};
