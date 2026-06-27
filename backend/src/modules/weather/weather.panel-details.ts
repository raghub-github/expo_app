import type { WeatherPanelDetails } from "./weather.types.js";
import type { MappedOpenMeteoWeather } from "./weather.mapper.js";

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Extract panel fields from Open-Meteo cache payload. */
export function extractWeatherPanelDetails(
  raw: Record<string, unknown> | null | undefined
): WeatherPanelDetails | null {
  if (!raw || typeof raw !== "object") return null;

  const mapped = raw.mapped as MappedOpenMeteoWeather | undefined;
  if (mapped) {
    return {
      feelsLikeC: mapped.feelsLikeC,
      pressureHpa: mapped.pressureHpa,
      visibilityKm: mapped.visibilityKm,
      cloudCoverPct: mapped.cloudCoverPct,
      windGustKmh: mapped.windGustKmh,
      weatherId: mapped.weatherCode,
      weatherMain: mapped.weatherCondition,
      weatherDescription: mapped.weatherDescription,
      sunriseAt: mapped.sunriseAt,
      sunsetAt: mapped.sunsetAt,
      rainfallMm1h: mapped.rainMm > 0 ? mapped.rainMm : mapped.precipitationMm > 0 ? mapped.precipitationMm : null,
      uvIndex: mapped.uvIndex,
      aqi: null,
      aqiLabel: null,
      rainProbabilityPct: mapped.rainProbabilityPct,
      windDirectionDeg: mapped.windDirectionDeg,
      isDay: mapped.isDay,
      snowfallCm: mapped.snowfallCm > 0 ? mapped.snowfallCm : null,
    };
  }

  // Legacy fallback shape
  const current = (raw.current ?? {}) as Record<string, unknown>;
  const daily = (raw.daily ?? {}) as Record<string, unknown>;
  const weatherCode = num(current.weather_code);
  if (weatherCode == null && !current.temperature_2m) return null;

  const sunriseArr = Array.isArray(daily.sunrise) ? daily.sunrise : [];
  const sunsetArr = Array.isArray(daily.sunset) ? daily.sunset : [];
  const visibilityM = num(current.visibility);

  return {
    feelsLikeC: num(current.apparent_temperature) != null ? Math.round(Number(current.apparent_temperature)) : null,
    pressureHpa: num(current.pressure_msl),
    visibilityKm: visibilityM != null ? Math.round((visibilityM / 1000) * 10) / 10 : null,
    cloudCoverPct: num(current.cloud_cover),
    windGustKmh: num(current.wind_gusts_10m) != null ? Math.round(Number(current.wind_gusts_10m) * 3.6) : null,
    weatherId: weatherCode,
    weatherMain: null,
    weatherDescription: null,
    sunriseAt: sunriseArr[0] != null ? String(sunriseArr[0]) : null,
    sunsetAt: sunsetArr[0] != null ? String(sunsetArr[0]) : null,
    rainfallMm1h: num(current.rain) ?? num(current.precipitation),
    uvIndex: num(current.uv_index),
    aqi: null,
    aqiLabel: null,
    rainProbabilityPct: null,
    windDirectionDeg: num(current.wind_direction_10m),
    isDay: current.is_day === 1 || current.is_day === true,
    snowfallCm: num(current.snowfall),
  };
}
