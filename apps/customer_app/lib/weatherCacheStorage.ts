/**
 * Persist last weather snapshot for instant home banner on cold start.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerWeatherContext } from "@/services/weather.service";
import { weatherGridKey, isSameWeatherGrid } from "@/lib/weatherGrid";

const STORAGE_KEY = "weather.lastSnapshot.v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type PersistedWeatherSnapshot = {
  gridKey: string;
  latitude: number;
  longitude: number;
  weather: CustomerWeatherContext;
  savedAt: number;
};

let memoryBootstrap: { gridKey: string; weather: CustomerWeatherContext } | null = null;

export function getBootstrapWeather(lat: number, lng: number): CustomerWeatherContext | undefined {
  if (!memoryBootstrap) return undefined;
  if (memoryBootstrap.gridKey === weatherGridKey(lat, lng)) {
    return memoryBootstrap.weather;
  }
  return undefined;
}

export function setBootstrapWeather(lat: number, lng: number, weather: CustomerWeatherContext): void {
  if (weather.temperatureC == null || !Number.isFinite(weather.temperatureC)) return;
  memoryBootstrap = { gridKey: weatherGridKey(lat, lng), weather };
}

export async function persistWeatherSnapshot(
  lat: number,
  lng: number,
  weather: CustomerWeatherContext
): Promise<void> {
  if (weather.temperatureC == null || !Number.isFinite(weather.temperatureC)) return;
  setBootstrapWeather(lat, lng, weather);
  const payload: PersistedWeatherSnapshot = {
    gridKey: weatherGridKey(lat, lng),
    latitude: lat,
    longitude: lng,
    weather,
    savedAt: Date.now(),
  };
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export async function loadPersistedWeatherSnapshot(
  lat: number,
  lng: number
): Promise<CustomerWeatherContext | null> {
  const mem = getBootstrapWeather(lat, lng);
  if (mem) return mem;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedWeatherSnapshot;
    if (!parsed?.weather || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (
      parsed.gridKey !== weatherGridKey(lat, lng) &&
      !isSameWeatherGrid(
        { latitude: lat, longitude: lng },
        { latitude: parsed.latitude, longitude: parsed.longitude }
      )
    ) {
      return null;
    }
    if (parsed.weather.temperatureC == null) return null;
    setBootstrapWeather(lat, lng, parsed.weather);
    return parsed.weather;
  } catch {
    return null;
  }
}
