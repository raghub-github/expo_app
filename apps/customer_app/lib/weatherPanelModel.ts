import type { CustomerWeatherContext } from "@/services/weather.service";

export type WeatherDisplayState =
  | "thunderstorm"
  | "storm_alert"
  | "heavy_rain"
  | "moderate_rain"
  | "light_rain"
  | "drizzle"
  | "snow"
  | "fog"
  | "mist"
  | "haze"
  | "dust_storm"
  | "very_windy"
  | "windy"
  | "cloudy"
  | "partly_cloudy"
  | "clear_sky"
  | "extreme_heat"
  | "hot"
  | "pleasant"
  | "cold"
  | "very_cold"
  | "extreme_cold";

export type DeliveryImpactLevel = "normal" | "minor" | "moderate" | "severe";

export type WeatherMetricCard = {
  key: string;
  label: string;
  value: string;
  icon: string;
  tint: string;
  bg: string;
};

export type WeatherPanelModel = {
  stateId: WeatherDisplayState;
  title: string;
  subtitle: string;
  heroMessage: string;
  badgeLabel: string;
  badgeVariant: "neutral" | "warning" | "danger" | "success" | "info";
  gradient: [string, string, string];
  animation: "sun" | "moon" | "clouds" | "rain" | "thunder" | "snow" | "wind" | "fog" | "heat" | "cold" | "none";
  heroIcon: string;
  deliveryImpact: {
    level: DeliveryImpactLevel;
    label: string;
    color: string;
    bg: string;
    border: string;
    icon: string;
  };
  customerAdvisory: string[];
  metrics: WeatherMetricCard[];
  cacheKey: string;
};

const VERY_WINDY_KMH = 50;
const WINDY_KMH = 30;

function weatherId(ctx: CustomerWeatherContext): number | null {
  return ctx.details?.weatherId ?? null;
}

function weatherMainNorm(ctx: CustomerWeatherContext): string {
  const fromDetails = ctx.details?.weatherMain?.trim().toLowerCase();
  if (fromDetails) return fromDetails;
  return ctx.weatherCondition.trim().toLowerCase();
}

function isNight(sunriseAt: string | null | undefined, sunsetAt: string | null | undefined): boolean {
  if (!sunriseAt || !sunsetAt) return false;
  const now = Date.now();
  const rise = new Date(sunriseAt).getTime();
  const set = new Date(sunsetAt).getTime();
  if (!Number.isFinite(rise) || !Number.isFinite(set)) return false;
  return now < rise || now > set;
}

function tempBand(temp: number | null): WeatherDisplayState | null {
  if (temp == null || !Number.isFinite(temp)) return null;
  if (temp < 0) return "extreme_cold";
  if (temp < 10) return "very_cold";
  if (temp < 18) return "cold";
  if (temp < 28) return "pleasant";
  if (temp < 35) return "hot";
  if (temp <= 40) return "hot";
  return "extreme_heat";
}

function resolveWeatherPriorityState(ctx: CustomerWeatherContext): WeatherDisplayState | null {
  const id = weatherId(ctx);
  const main = weatherMainNorm(ctx);
  const wind = ctx.windSpeedKmh ?? 0;
  const gust = ctx.details?.windGustKmh ?? wind;
  const maxWind = Math.max(wind, gust);

  if (id != null && id >= 200 && id < 300) return "thunderstorm";
  if (ctx.severity === "EXTREME_WEATHER") return "storm_alert";
  if (main === "thunderstorm") return "thunderstorm";

  if (ctx.severity === "HEAVY_RAIN" || (ctx.rainIntensityMm >= 7 && ctx.rainDetected)) return "heavy_rain";
  if (ctx.severity === "MODERATE_RAIN" || (ctx.rainIntensityMm >= 2 && ctx.rainDetected)) return "moderate_rain";
  if (ctx.severity === "LIGHT_RAIN" || ctx.rainDetected) return "light_rain";

  if (id != null && id >= 300 && id < 400) return "drizzle";
  if (main === "drizzle") return "drizzle";
  if (main === "rain") return ctx.rainIntensityMm >= 2 ? "moderate_rain" : "light_rain";

  if (id != null && id >= 600 && id < 700) return "snow";
  if (main === "snow") return "snow";

  if (main === "fog" || (id != null && id >= 741 && id < 762)) return "fog";
  if (main === "mist") return "mist";
  if (main === "haze" || main === "smoke") return "haze";
  if (main === "dust" || main === "sand" || main === "ash" || main === "squall") return "dust_storm";

  if (maxWind >= VERY_WINDY_KMH) return "very_windy";
  if (maxWind >= WINDY_KMH) return "windy";

  if (main === "clouds" || main === "overcast") {
    const cover = ctx.details?.cloudCoverPct;
    if (cover != null && cover < 45) return "partly_cloudy";
    return "cloudy";
  }

  if (main === "clear") return "clear_sky";

  return null;
}

const STATE_META: Record<
  WeatherDisplayState,
  Omit<WeatherPanelModel, "stateId" | "metrics" | "deliveryImpact" | "customerAdvisory" | "cacheKey">
> = {
  thunderstorm: {
    title: "Thunderstorm",
    subtitle: "Severe conditions in your area",
    heroMessage: "Thunderstorm detected. Ride carefully.",
    badgeLabel: "Storm Alert",
    badgeVariant: "danger",
    gradient: ["#1F2937", "#374151", "#4B5563"],
    animation: "thunder",
    heroIcon: "⚡",
  },
  storm_alert: {
    title: "Storm Alert",
    subtitle: "Extreme weather conditions",
    heroMessage: "Severe weather detected. Stay safe and avoid unnecessary travel.",
    badgeLabel: "Severe Alert",
    badgeVariant: "danger",
    gradient: ["#1E1B4B", "#312E81", "#4338CA"],
    animation: "thunder",
    heroIcon: "🚨",
  },
  heavy_rain: {
    title: "Heavy Rain",
    subtitle: "Intense rainfall",
    heroMessage: "Heavy rainfall may delay deliveries.",
    badgeLabel: "Heavy Rain",
    badgeVariant: "warning",
    gradient: ["#0C4A6E", "#075985", "#0369A1"],
    animation: "rain",
    heroIcon: "🌧",
  },
  moderate_rain: {
    title: "Moderate Rain",
    subtitle: "Rain in your area",
    heroMessage: "Rain may slightly increase delivery times.",
    badgeLabel: "Rain",
    badgeVariant: "info",
    gradient: ["#0E7490", "#0891B2", "#06B6D4"],
    animation: "rain",
    heroIcon: "🌦",
  },
  light_rain: {
    title: "Light Rain",
    subtitle: "Light showers nearby",
    heroMessage: "Light rain — deliveries may take a little longer.",
    badgeLabel: "Light Rain",
    badgeVariant: "info",
    gradient: ["#0F766E", "#14B8A6", "#2DD4BF"],
    animation: "rain",
    heroIcon: "🌦",
  },
  drizzle: {
    title: "Drizzle",
    subtitle: "Light drizzle",
    heroMessage: "Drizzle in your area — ride carefully on wet roads.",
    badgeLabel: "Drizzle",
    badgeVariant: "info",
    gradient: ["#115E59", "#0F766E", "#14B8A6"],
    animation: "rain",
    heroIcon: "💧",
  },
  snow: {
    title: "Snow",
    subtitle: "Snowfall detected",
    heroMessage: "Snowy conditions — expect slower deliveries.",
    badgeLabel: "Snow",
    badgeVariant: "warning",
    gradient: ["#1E3A8A", "#3B82F6", "#93C5FD"],
    animation: "snow",
    heroIcon: "❄️",
  },
  fog: {
    title: "Fog",
    subtitle: "Low visibility",
    heroMessage: "Low visibility due to fog.",
    badgeLabel: "Fog",
    badgeVariant: "warning",
    gradient: ["#6B7280", "#9CA3AF", "#D1D5DB"],
    animation: "fog",
    heroIcon: "🌫",
  },
  mist: {
    title: "Mist",
    subtitle: "Misty conditions",
    heroMessage: "Misty weather — maintain safe distance on the road.",
    badgeLabel: "Mist",
    badgeVariant: "info",
    gradient: ["#64748B", "#94A3B8", "#CBD5E1"],
    animation: "fog",
    heroIcon: "🌁",
  },
  haze: {
    title: "Haze",
    subtitle: "Reduced air clarity",
    heroMessage: "Hazy conditions — visibility may be reduced.",
    badgeLabel: "Haze",
    badgeVariant: "warning",
    gradient: ["#78716C", "#A8A29E", "#D6D3D1"],
    animation: "fog",
    heroIcon: "😶‍🌫️",
  },
  dust_storm: {
    title: "Dust Storm",
    subtitle: "Poor air & visibility",
    heroMessage: "Dust in the air — deliveries may be affected.",
    badgeLabel: "Dust",
    badgeVariant: "danger",
    gradient: ["#92400E", "#B45309", "#D97706"],
    animation: "wind",
    heroIcon: "🌪",
  },
  very_windy: {
    title: "Very Windy",
    subtitle: "Strong winds",
    heroMessage: "Strong winds in your area.",
    badgeLabel: "High Wind",
    badgeVariant: "warning",
    gradient: ["#0284C7", "#0EA5E9", "#38BDF8"],
    animation: "wind",
    heroIcon: "💨",
  },
  windy: {
    title: "Windy",
    subtitle: "Breezy conditions",
    heroMessage: "Windy weather — secure your deliveries.",
    badgeLabel: "Windy",
    badgeVariant: "info",
    gradient: ["#0369A1", "#0284C7", "#7DD3FC"],
    animation: "wind",
    heroIcon: "🌬",
  },
  cloudy: {
    title: "Cloudy",
    subtitle: "Overcast skies",
    heroMessage: "Cloudy skies today — deliveries running normally.",
    badgeLabel: "Cloudy",
    badgeVariant: "neutral",
    gradient: ["#475569", "#64748B", "#94A3B8"],
    animation: "clouds",
    heroIcon: "☁️",
  },
  partly_cloudy: {
    title: "Partly Cloudy",
    subtitle: "Mixed skies",
    heroMessage: "Partly cloudy — good conditions for deliveries.",
    badgeLabel: "Partly Cloudy",
    badgeVariant: "neutral",
    gradient: ["#0E7490", "#38BDF8", "#BAE6FD"],
    animation: "clouds",
    heroIcon: "⛅",
  },
  clear_sky: {
    title: "Clear Sky",
    subtitle: "Bright conditions",
    heroMessage: "Clear skies — great day for deliveries!",
    badgeLabel: "Clear",
    badgeVariant: "success",
    gradient: ["#0284C7", "#0EA5E9", "#7DD3FC"],
    animation: "sun",
    heroIcon: "☀️",
  },
  extreme_heat: {
    title: "Extreme Heat",
    subtitle: "Very high temperature",
    heroMessage: "Extreme heat detected. Stay hydrated and avoid long exposure.",
    badgeLabel: "Heat Warning",
    badgeVariant: "danger",
    gradient: ["#C2410C", "#EA580C", "#FB923C"],
    animation: "heat",
    heroIcon: "🔥",
  },
  hot: {
    title: "Hot",
    subtitle: "High temperature",
    heroMessage: "Hot weather today. Drink water regularly.",
    badgeLabel: "Hot",
    badgeVariant: "warning",
    gradient: ["#EA580C", "#F97316", "#FDBA74"],
    animation: "heat",
    heroIcon: "☀️",
  },
  pleasant: {
    title: "Pleasant",
    subtitle: "Comfortable temperature",
    heroMessage: "Perfect weather for deliveries.",
    badgeLabel: "Pleasant",
    badgeVariant: "success",
    gradient: ["#059669", "#10B981", "#6EE7B7"],
    animation: "sun",
    heroIcon: "🌤",
  },
  cold: {
    title: "Cold",
    subtitle: "Cool temperature",
    heroMessage: "Cold weather. Ride safely.",
    badgeLabel: "Cold",
    badgeVariant: "info",
    gradient: ["#1D4ED8", "#3B82F6", "#93C5FD"],
    animation: "cold",
    heroIcon: "🧥",
  },
  very_cold: {
    title: "Very Cold",
    subtitle: "Low temperature",
    heroMessage: "Very cold outside. Wear warm layers.",
    badgeLabel: "Very Cold",
    badgeVariant: "warning",
    gradient: ["#1E3A8A", "#1D4ED8", "#60A5FA"],
    animation: "cold",
    heroIcon: "🥶",
  },
  extreme_cold: {
    title: "Extreme Cold",
    subtitle: "Freezing conditions",
    heroMessage: "Extreme cold detected. Wear proper winter gear.",
    badgeLabel: "Freeze Alert",
    badgeVariant: "danger",
    gradient: ["#0C1E3D", "#1E3A8A", "#3B82F6"],
    animation: "snow",
    heroIcon: "❄️",
  },
};

function resolveDeliveryImpact(
  ctx: CustomerWeatherContext,
  stateId: WeatherDisplayState
): WeatherPanelModel["deliveryImpact"] {
  if (ctx.severity === "EXTREME_WEATHER" || stateId === "thunderstorm" || stateId === "storm_alert") {
    return {
      level: "severe",
      label: "Severe Weather Alert",
      color: "#B91C1C",
      bg: "#FEF2F2",
      border: "#FECACA",
      icon: "🔴",
    };
  }
  if (ctx.severity === "HEAVY_RAIN" || stateId === "heavy_rain" || stateId === "snow" || stateId === "dust_storm") {
    return {
      level: "moderate",
      label: "Moderate Delays Expected",
      color: "#C2410C",
      bg: "#FFF7ED",
      border: "#FED7AA",
      icon: "🟠",
    };
  }
  if (
    ctx.etaDelayMinutes > 0 ||
    ctx.severity === "MODERATE_RAIN" ||
    ctx.severity === "LIGHT_RAIN" ||
    ["moderate_rain", "light_rain", "drizzle", "fog", "very_windy"].includes(stateId)
  ) {
    return {
      level: "minor",
      label: "Minor Delivery Delays",
      color: "#A16207",
      bg: "#FEFCE8",
      border: "#FEF08A",
      icon: "🟡",
    };
  }
  return {
    level: "normal",
    label: "Normal Operations",
    color: "#047857",
    bg: "#F0FDF9",
    border: "#A7F3D0",
    icon: "🟢",
  };
}

function customerAdvisoryFor(ctx: CustomerWeatherContext, stateId: WeatherDisplayState): string[] {
  const msgs: string[] = [];
  if (ctx.etaDelayMinutes > 0) {
    msgs.push(`Delivery may take ~${ctx.etaDelayMinutes} min longer due to weather.`);
  } else if (stateId.includes("rain") || stateId === "drizzle") {
    msgs.push("Delivery may take slightly longer due to rain.");
  }
  if (stateId === "thunderstorm" || stateId === "storm_alert" || ctx.severity === "EXTREME_WEATHER") {
    msgs.push("Severe weather may affect rider availability.");
  }
  if (stateId === "fog" || stateId === "mist" || stateId === "haze") {
    msgs.push("Riders may take longer to locate your address.");
  }
  if (stateId === "extreme_heat" || stateId === "hot") {
    msgs.push("Keep your phone reachable for rider updates.");
  }
  if (msgs.length === 0) {
    msgs.push("Please keep your phone reachable.", "Your order is on track.");
  } else {
    msgs.push("Please keep your phone reachable.");
  }
  return msgs.slice(0, 3);
}

function formatTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildMetrics(ctx: CustomerWeatherContext): WeatherMetricCard[] {
  const d = ctx.details;
  const cards: WeatherMetricCard[] = [];

  if (ctx.temperatureC != null) {
    cards.push({
      key: "temp",
      label: "Temperature",
      value: `${Math.round(ctx.temperatureC)}°C`,
      icon: "thermometer-outline",
      tint: "#EA580C",
      bg: "#FFF7ED",
    });
  }
  if (d?.feelsLikeC != null) {
    cards.push({
      key: "feels",
      label: "Feels Like",
      value: `${d.feelsLikeC}°C`,
      icon: "body-outline",
      tint: "#DC2626",
      bg: "#FEF2F2",
    });
  }
  if (ctx.humidityPct != null) {
    cards.push({
      key: "humidity",
      label: "Humidity",
      value: `${Math.round(ctx.humidityPct)}%`,
      icon: "water-outline",
      tint: "#2563EB",
      bg: "#EFF6FF",
    });
  }
  if (ctx.windSpeedKmh != null) {
    cards.push({
      key: "wind",
      label: "Wind Speed",
      value: `${Math.round(ctx.windSpeedKmh)} km/h`,
      icon: "flag-outline",
      tint: "#7C3AED",
      bg: "#F5F3FF",
    });
  }
  if (d?.visibilityKm != null) {
    cards.push({
      key: "visibility",
      label: "Visibility",
      value: `${d.visibilityKm} km`,
      icon: "eye-outline",
      tint: "#0891B2",
      bg: "#ECFEFF",
    });
  }
  if (d?.uvIndex != null) {
    cards.push({
      key: "uv",
      label: "UV Index",
      value: String(d.uvIndex),
      icon: "sunny-outline",
      tint: "#D97706",
      bg: "#FFFBEB",
    });
  }
  if (d?.pressureHpa != null) {
    cards.push({
      key: "pressure",
      label: "Air Pressure",
      value: `${Math.round(d.pressureHpa)} hPa`,
      icon: "speedometer-outline",
      tint: "#4B5563",
      bg: "#F9FAFB",
    });
  }
  if (d?.aqi != null) {
    cards.push({
      key: "aqi",
      label: "Air Quality",
      value: d.aqiLabel ? `${d.aqi} · ${d.aqiLabel}` : String(d.aqi),
      icon: "leaf-outline",
      tint: "#16A34A",
      bg: "#F0FDF4",
    });
  }
  const sunrise = formatTime(d?.sunriseAt);
  if (sunrise) {
    cards.push({
      key: "sunrise",
      label: "Sunrise",
      value: sunrise,
      icon: "sunny-outline",
      tint: "#F59E0B",
      bg: "#FFFBEB",
    });
  }
  const sunset = formatTime(d?.sunsetAt);
  if (sunset) {
    cards.push({
      key: "sunset",
      label: "Sunset",
      value: sunset,
      icon: "moon-outline",
      tint: "#6366F1",
      bg: "#EEF2FF",
    });
  }
  if (ctx.rainDetected) {
    cards.push({
      key: "rain_chance",
      label: "Chance of Rain",
      value: "High",
      icon: "rainy-outline",
      tint: "#0284C7",
      bg: "#F0F9FF",
    });
  }
  const rainfall = d?.rainfallMm1h ?? (ctx.rainDetected ? ctx.rainIntensityMm : null);
  if (rainfall != null && rainfall > 0) {
    cards.push({
      key: "rainfall",
      label: "Rainfall",
      value: `${rainfall.toFixed(1)} mm/h`,
      icon: "water-outline",
      tint: "#0369A1",
      bg: "#E0F2FE",
    });
  }
  if (d?.cloudCoverPct != null) {
    cards.push({
      key: "clouds",
      label: "Cloud Cover",
      value: `${Math.round(d.cloudCoverPct)}%`,
      icon: "cloud-outline",
      tint: "#64748B",
      bg: "#F8FAFC",
    });
  }

  return cards;
}

export function resolveWeatherDisplayState(ctx: CustomerWeatherContext): WeatherDisplayState {
  const weatherState = resolveWeatherPriorityState(ctx);
  let stateId: WeatherDisplayState;

  if (weatherState) {
    stateId = weatherState;
  } else {
    const band = tempBand(ctx.temperatureC);
    stateId = band ?? (ctx.severity === "CLEAR" ? "pleasant" : "cloudy");
  }

  return applyTemperatureOverride(stateId, ctx.temperatureC);
}

const TEMP_OVERRIDABLE = new Set<WeatherDisplayState>([
  "cloudy",
  "partly_cloudy",
  "clear_sky",
  "pleasant",
]);

function applyTemperatureOverride(
  stateId: WeatherDisplayState,
  temp: number | null | undefined
): WeatherDisplayState {
  if (temp == null || !Number.isFinite(temp) || !TEMP_OVERRIDABLE.has(stateId)) {
    return stateId;
  }
  if (temp > 40) return "extreme_heat";
  if (temp >= 35) return "hot";
  if (temp < 0) return "extreme_cold";
  if (temp < 10) return "very_cold";
  if (temp < 18) return "cold";
  return stateId;
}

export function buildWeatherPanelModel(ctx: CustomerWeatherContext): WeatherPanelModel {
  const stateId = resolveWeatherDisplayState(ctx);
  const meta = STATE_META[stateId];

  const nightClear =
    stateId === "clear_sky" && isNight(ctx.details?.sunriseAt, ctx.details?.sunsetAt);
  const animation = nightClear ? "moon" : meta.animation;
  const heroIcon = nightClear ? "🌙" : meta.heroIcon;

  return {
    stateId,
    ...meta,
    animation,
    heroIcon,
    deliveryImpact: resolveDeliveryImpact(ctx, stateId),
    customerAdvisory: customerAdvisoryFor(ctx, stateId),
    metrics: buildMetrics(ctx),
    cacheKey: [
      stateId,
      ctx.updatedAt ?? "",
      ctx.temperatureC ?? "",
      ctx.severity,
      ctx.rainIntensityMm,
      ctx.details?.weatherId ?? "",
    ].join("|"),
  };
}
