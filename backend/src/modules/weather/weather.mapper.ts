import type { WeatherSeverity, WeatherThresholds } from "./weather.types.js";
import { classifyWeatherSeverity } from "./weather.classify.js";
import type { OpenMeteoForecastRaw } from "./openmeteo.client.js";

export type MappedOpenMeteoWeather = {
  weatherCode: number;
  weatherCondition: string;
  weatherDescription: string;
  temperatureC: number | null;
  feelsLikeC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  windGustKmh: number | null;
  visibilityKm: number | null;
  pressureHpa: number | null;
  surfacePressureHpa: number | null;
  cloudCoverPct: number | null;
  uvIndex: number | null;
  precipitationMm: number;
  rainMm: number;
  snowfallCm: number;
  rainProbabilityPct: number | null;
  isDay: boolean;
  sunriseAt: string | null;
  sunsetAt: string | null;
  rainDetected: boolean;
  isThunderstorm: boolean;
  weatherSeverity: WeatherSeverity;
  raw: OpenMeteoForecastRaw;
};

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function msToKmh(ms: number | null): number | null {
  if (ms == null) return null;
  return Math.round(ms * 3.6 * 10) / 10;
}

/** WMO Weather interpretation codes (Open-Meteo). */
export function wmoCodeToLabel(code: number): { condition: string; description: string } {
  if (code === 0) return { condition: "Clear", description: "Clear sky" };
  if (code <= 3) return { condition: "Clouds", description: code === 1 ? "Mainly clear" : code === 2 ? "Partly cloudy" : "Overcast" };
  if (code <= 48) return { condition: "Fog", description: code <= 45 ? "Foggy" : "Depositing rime fog" };
  if (code <= 57) return { condition: "Drizzle", description: "Drizzle" };
  if (code <= 67) return { condition: "Rain", description: code <= 65 ? "Rain" : "Freezing rain" };
  if (code <= 77) return { condition: "Snow", description: "Snow" };
  if (code <= 82) return { condition: "Rain", description: code === 80 ? "Rain showers" : "Heavy rain showers" };
  if (code <= 86) return { condition: "Snow", description: "Snow showers" };
  if (code <= 99) return { condition: "Thunderstorm", description: "Thunderstorm" };
  return { condition: "Unknown", description: "Unknown" };
}

export function mapOpenMeteoForecast(
  raw: OpenMeteoForecastRaw,
  thresholds: WeatherThresholds
): MappedOpenMeteoWeather | null {
  const current = (raw.current ?? {}) as Record<string, unknown>;
  const daily = (raw.daily ?? {}) as Record<string, unknown>;
  const hourly = (raw.hourly ?? {}) as Record<string, unknown>;

  const weatherCode = num(current.weather_code);
  if (weatherCode == null) return null;

  const labels = wmoCodeToLabel(weatherCode);
  const precipitationMm = num(current.precipitation) ?? 0;
  const rainMm = num(current.rain) ?? precipitationMm;
  const snowfallCm = num(current.snowfall) ?? 0;
  const windSpeedKmh = msToKmh(num(current.wind_speed_10m));
  const windGustKmh = msToKmh(num(current.wind_gusts_10m));
  const isThunderstorm = weatherCode >= 95;
  const rainDetected =
    rainMm > 0 ||
    precipitationMm >= thresholds.lightRainThresholdMm ||
    (weatherCode >= 51 && weatherCode <= 67) ||
    (weatherCode >= 80 && weatherCode <= 82) ||
    isThunderstorm;

  const rainIntensityMm = Math.max(rainMm, precipitationMm, snowfallCm > 0 ? 0.5 : 0);

  const weatherSeverity = classifyWeatherSeverity({
    rainIntensityMm,
    windSpeedKmh,
    isThunderstorm,
    thresholds,
  });

  const sunriseArr = Array.isArray(daily.sunrise) ? daily.sunrise : [];
  const sunsetArr = Array.isArray(daily.sunset) ? daily.sunset : [];
  const uvMaxArr = Array.isArray(daily.uv_index_max) ? daily.uv_index_max : [];
  const precipProbArr = Array.isArray(hourly.precipitation_probability)
    ? hourly.precipitation_probability
    : [];

  const visibilityM = num(current.visibility);

  return {
    weatherCode,
    weatherCondition: labels.condition,
    weatherDescription: labels.description,
    temperatureC: num(current.temperature_2m) != null ? Math.round(Number(current.temperature_2m)) : null,
    feelsLikeC:
      num(current.apparent_temperature) != null
        ? Math.round(Number(current.apparent_temperature))
        : null,
    humidityPct: num(current.relative_humidity_2m),
    windSpeedKmh,
    windDirectionDeg: num(current.wind_direction_10m),
    windGustKmh,
    visibilityKm: visibilityM != null ? Math.round((visibilityM / 1000) * 10) / 10 : null,
    pressureHpa: num(current.pressure_msl),
    surfacePressureHpa: num(current.surface_pressure),
    cloudCoverPct: num(current.cloud_cover),
    uvIndex: num(current.uv_index) ?? (uvMaxArr[0] != null ? num(uvMaxArr[0]) : null),
    precipitationMm,
    rainMm,
    snowfallCm,
    rainProbabilityPct: precipProbArr[0] != null ? num(precipProbArr[0]) : null,
    isDay: current.is_day === 1 || current.is_day === true,
    sunriseAt: sunriseArr[0] != null ? String(sunriseArr[0]) : null,
    sunsetAt: sunsetArr[0] != null ? String(sunsetArr[0]) : null,
    rainDetected,
    isThunderstorm,
    weatherSeverity,
    raw,
  };
}
