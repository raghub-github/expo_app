import test from "node:test";
import assert from "node:assert/strict";
import {
  detectWeatherChanges,
  hasSignificantWeatherChange,
  mappedToComparable,
} from "./weather.utils.js";
import type { MappedOpenMeteoWeather } from "./weather.mapper.js";

function baseMapped(overrides: Partial<MappedOpenMeteoWeather> = {}): MappedOpenMeteoWeather {
  return {
    weatherCode: 0,
    weatherCondition: "Clear",
    weatherDescription: "Clear sky",
    temperatureC: 28,
    feelsLikeC: 30,
    humidityPct: 50,
    windSpeedKmh: 12,
    windDirectionDeg: 90,
    windGustKmh: 18,
    visibilityKm: 10,
    pressureHpa: 1010,
    surfacePressureHpa: 1008,
    cloudCoverPct: 10,
    uvIndex: 5,
    precipitationMm: 0,
    rainMm: 0,
    snowfallCm: 0,
    rainProbabilityPct: 0,
    isDay: true,
    sunriseAt: null,
    sunsetAt: null,
    rainDetected: false,
    isThunderstorm: false,
    weatherSeverity: "CLEAR",
    raw: {},
    ...overrides,
  };
}

test("detectWeatherChanges returns weather_code on first snapshot", () => {
  const after = mappedToComparable(baseMapped());
  assert.deepEqual(detectWeatherChanges(null, after), ["weather_code"]);
});

test("detectWeatherChanges ignores small temperature drift", () => {
  const before = mappedToComparable(baseMapped({ temperatureC: 28 }));
  const after = mappedToComparable(baseMapped({ temperatureC: 29 }));
  assert.deepEqual(detectWeatherChanges(before, after), []);
  assert.equal(hasSignificantWeatherChange(before, after), false);
});

test("detectWeatherChanges detects rain start and large temp swing", () => {
  const before = mappedToComparable(baseMapped({ rainDetected: false, weatherSeverity: "CLEAR" }));
  const after = mappedToComparable(
    baseMapped({
      rainDetected: true,
      weatherSeverity: "MODERATE_RAIN",
      weatherCode: 63,
      temperatureC: 22,
      rainMm: 3,
    })
  );
  const reasons = detectWeatherChanges(before, after);
  assert.ok(reasons.includes("rain_started"));
  assert.ok(reasons.includes("temperature"));
  assert.ok(reasons.includes("severity"));
});

test("detectWeatherChanges detects wind threshold", () => {
  const before = mappedToComparable(baseMapped({ windSpeedKmh: 10 }));
  const after = mappedToComparable(baseMapped({ windSpeedKmh: 25 }));
  assert.deepEqual(detectWeatherChanges(before, after), ["wind"]);
});
