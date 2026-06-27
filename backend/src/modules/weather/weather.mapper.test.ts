import test from "node:test";
import assert from "node:assert/strict";
import { wmoCodeToLabel, mapOpenMeteoForecast } from "./weather.mapper.js";
import type { WeatherThresholds } from "./weather.types.js";

const thresholds: WeatherThresholds = {
  lightRainThresholdMm: 0.5,
  moderateRainThresholdMm: 2,
  heavyRainThresholdMm: 8,
  extremeRainThresholdMm: 20,
  extremeWindSpeedKmh: 60,
  cacheTtlMinutes: 8,
  refreshIntervalMinutes: 8,
  etaDelayLightMinutes: 5,
  etaDelayModerateMinutes: 10,
  etaDelayHeavyMinutes: 20,
  etaDelayExtremeMinutes: 30,
};

test("wmoCodeToLabel maps clear and thunderstorm", () => {
  assert.equal(wmoCodeToLabel(0).condition, "Clear");
  assert.equal(wmoCodeToLabel(95).condition, "Thunderstorm");
});

test("mapOpenMeteoForecast maps current conditions", () => {
  const raw = {
    current: {
      time: "2026-06-26T12:00",
      temperature_2m: 32,
      apparent_temperature: 35,
      relative_humidity_2m: 55,
      precipitation: 0,
      rain: 0,
      snowfall: 0,
      weather_code: 2,
      cloud_cover: 40,
      pressure_msl: 1012,
      wind_speed_10m: 5,
      wind_direction_10m: 180,
      wind_gusts_10m: 8,
      is_day: 1,
      uv_index: 7,
      visibility: 12000,
    },
    daily: {
      sunrise: ["2026-06-26T05:30"],
      sunset: ["2026-06-26T19:15"],
      uv_index_max: [8],
    },
    hourly: {
      time: ["2026-06-26T12:00"],
      precipitation_probability: [10],
    },
  };

  const mapped = mapOpenMeteoForecast(raw, thresholds);
  assert.ok(mapped);
  assert.equal(mapped!.temperatureC, 32);
  assert.equal(mapped!.feelsLikeC, 35);
  assert.equal(mapped!.windSpeedKmh, 18);
  assert.equal(mapped!.visibilityKm, 12);
  assert.equal(mapped!.weatherCondition, "Clouds");
  assert.equal(mapped!.rainDetected, false);
  assert.equal(mapped!.weatherSeverity, "CLEAR");
});

test("mapOpenMeteoForecast detects heavy rain", () => {
  const raw = {
    current: {
      temperature_2m: 24,
      weather_code: 65,
      rain: 9,
      precipitation: 9,
      relative_humidity_2m: 90,
      wind_speed_10m: 3,
      is_day: 0,
    },
    daily: { sunrise: [], sunset: [] },
    hourly: { precipitation_probability: [80] },
  };

  const mapped = mapOpenMeteoForecast(raw, thresholds);
  assert.ok(mapped);
  assert.equal(mapped!.rainDetected, true);
  assert.equal(mapped!.weatherSeverity, "HEAVY_RAIN");
});
