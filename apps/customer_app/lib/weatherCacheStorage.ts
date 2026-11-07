/**
 * Persist last weather snapshot for instant home banner on cold start.
 * Sync peek via fastKv (MMKV / memory) so Home never waits on AsyncStorage.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CustomerWeatherContext } from "@/services/weather.service";
import { weatherGridKey, isSameWeatherGrid } from "@/lib/weatherGrid";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

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
let hydratePromise: Promise<void> | null = null;

void ensureWeatherCacheHydrated();

function parsePersisted(raw: string | null | undefined): PersistedWeatherSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedWeatherSnapshot;
    if (!parsed?.weather || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    if (parsed.weather.temperatureC == null || !Number.isFinite(parsed.weather.temperatureC)) {
      return null;
    }
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number" ||
      !Number.isFinite(parsed.latitude) ||
      !Number.isFinite(parsed.longitude)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function applyParsed(parsed: PersistedWeatherSnapshot): CustomerWeatherContext {
  setBootstrapWeather(parsed.latitude, parsed.longitude, parsed.weather);
  return parsed.weather;
}

/** Pull AsyncStorage → fastKv/memory and seed in-memory bootstrap. */
export async function ensureWeatherCacheHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      await hydrateFastKvFromAsyncStorage([STORAGE_KEY]);
      const parsed = parsePersisted(fastGetString(STORAGE_KEY));
      if (parsed) applyParsed(parsed);
    })().catch(() => {
      /* ignore */
    });
  }
  await hydratePromise;
}

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

/** Sync read for matching weather grid — used for first paint / RQ initialData. */
export function peekPersistedWeatherSnapshot(
  lat: number,
  lng: number
): CustomerWeatherContext | null {
  const mem = getBootstrapWeather(lat, lng);
  if (mem) return mem;

  const parsed = parsePersisted(fastGetString(STORAGE_KEY));
  if (!parsed) return null;
  if (
    parsed.gridKey !== weatherGridKey(lat, lng) &&
    !isSameWeatherGrid(
      { latitude: lat, longitude: lng },
      { latitude: parsed.latitude, longitude: parsed.longitude }
    )
  ) {
    return null;
  }
  return applyParsed(parsed);
}

/** Last saved weather regardless of grid — soft placeholder while a new grid fetches. */
export function peekAnyPersistedWeather(): CustomerWeatherContext | null {
  if (
    memoryBootstrap?.weather?.temperatureC != null &&
    Number.isFinite(memoryBootstrap.weather.temperatureC)
  ) {
    return memoryBootstrap.weather;
  }
  const parsed = parsePersisted(fastGetString(STORAGE_KEY));
  if (!parsed) return null;
  return applyParsed(parsed);
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
    fastSetString(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }
}

export async function loadPersistedWeatherSnapshot(
  lat: number,
  lng: number
): Promise<CustomerWeatherContext | null> {
  const peeked = peekPersistedWeatherSnapshot(lat, lng);
  if (peeked) return peeked;

  await ensureWeatherCacheHydrated();
  const afterHydrate = peekPersistedWeatherSnapshot(lat, lng);
  if (afterHydrate) return afterHydrate;

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = parsePersisted(raw);
    if (!parsed) return null;
    if (
      parsed.gridKey !== weatherGridKey(lat, lng) &&
      !isSameWeatherGrid(
        { latitude: lat, longitude: lng },
        { latitude: parsed.latitude, longitude: parsed.longitude }
      )
    ) {
      return null;
    }
    return applyParsed(parsed);
  } catch {
    return null;
  }
}
