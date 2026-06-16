import { getEnv } from "../../config/env.js";
import {
  recordWeatherApiCallStart,
  recordWeatherApiFailure,
  recordWeatherApiSuccess,
} from "./weather.monitoring.js";

export type OpenWeatherCurrent = {
  city: string;
  zone: string;
  weatherCondition: string;
  rainIntensityMm: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  isThunderstorm: boolean;
  isRainCondition: boolean;
  raw: Record<string, unknown>;
};

export async function fetchOpenWeatherCurrent(lat: number, lng: number): Promise<OpenWeatherCurrent | null> {
  const apiKey = getEnv().OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");

  const started = Date.now();
  recordWeatherApiCallStart();
  let res: Response;
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) });
  } catch (e) {
    recordWeatherApiFailure(e instanceof Error ? e.message : "network_error");
    return null;
  }
  if (!res.ok) {
    recordWeatherApiFailure(`http_${res.status}`);
    return null;
  }
  recordWeatherApiSuccess(Date.now() - started);
  const data = (await res.json()) as Record<string, unknown>;

  const weatherArr = Array.isArray(data.weather) ? data.weather : [];
  const w0 = (weatherArr[0] ?? {}) as Record<string, unknown>;
  const main = (data.main ?? {}) as Record<string, unknown>;
  const wind = (data.wind ?? {}) as Record<string, unknown>;
  const rain = (data.rain ?? {}) as Record<string, unknown>;

  const weatherId = Number(w0.id ?? 0);
  const weatherMain = String(w0.main ?? "").toLowerCase();
  const isThunderstorm = weatherId >= 200 && weatherId < 300;
  const isRainCondition =
    isThunderstorm ||
    (weatherId >= 300 && weatherId < 400) ||
    (weatherId >= 500 && weatherId < 600) ||
    weatherMain === "rain" ||
    weatherMain === "drizzle";
  const rain1h = Number(rain["1h"] ?? rain["3h"] ?? 0);
  let rainIntensityMm = Number.isFinite(rain1h) ? rain1h : 0;
  // OpenWeather often omits rain.1h while still reporting Rain/Drizzle in weather[].
  if (rainIntensityMm <= 0 && isRainCondition) {
    if (weatherId >= 502 || weatherMain === "thunderstorm") rainIntensityMm = 8;
    else if (weatherId >= 501) rainIntensityMm = 3;
    else rainIntensityMm = 0.8;
  }
  const windMs = Number(wind.speed ?? 0);

  const city =
    String((data.name as string | undefined) ?? "").trim() ||
    String(((data.sys as Record<string, unknown> | undefined)?.country as string | undefined) ?? "Unknown");

  return {
    city,
    zone: `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}`,
    weatherCondition: String(w0.main ?? w0.description ?? "Clear"),
    rainIntensityMm,
    temperatureC: main.temp != null ? Math.round(Number(main.temp)) : null,
    humidityPct: main.humidity != null ? Number(main.humidity) : null,
    windSpeedKmh: Number.isFinite(windMs) ? Number((windMs * 3.6).toFixed(2)) : null,
    isThunderstorm,
    isRainCondition,
    raw: data,
  };
}
