/**
 * Persisted last-known *device* location (the live "Current location").
 *
 * This is deliberately separate from the "@gatimitra/last_selected_location_v1" key
 * used for an explicit user-picked pin (which locationStore.hydrate() clears on cold
 * start). This cache exists so a cold start can paint the last real GPS position —
 * and its resolved address — INSTANTLY, then silently refine it in the background.
 *
 * Freshness is surfaced (FRESH / RECENT / STALE / UNKNOWN), never hidden: a stale
 * value is fine to show while a fresh fix is acquired, but callers can tell it apart
 * from a just-acquired fix. It is NEVER treated as a guaranteed-current GPS fix.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ReverseGeocodeResult } from "@/services/location.service";
import type { FastPositionSource } from "@gatimitra/expo-location-kit";

const STORAGE_KEY = "@gatimitra/last_device_location_v1";

/** Freshness thresholds (configurable). */
export const LOCATION_FRESH_MS = 2 * 60_000; // < 2 min
export const LOCATION_RECENT_MS = 15 * 60_000; // 2–15 min
/** Beyond RECENT is STALE. A cache older than this is not loaded at all. */
export const LOCATION_CACHE_MAX_AGE_MS = 24 * 60 * 60_000; // 24 h

export type LocationFreshness = "FRESH" | "RECENT" | "STALE" | "UNKNOWN";

export type PersistedDeviceLocation = {
  lat: number;
  lon: number;
  accuracy: number | null;
  /** ms epoch the fix was captured. */
  updatedAt: number;
  /** How the coordinate was obtained (device GPS path or a cached last-known). */
  source: FastPositionSource | "accurate" | "watch";
  /** Resolved address at save time, if reverse-geocoding had completed. */
  address: ReverseGeocodeResult | null;
};

export function classifyFreshness(updatedAt: number | null | undefined, now = Date.now()): LocationFreshness {
  if (updatedAt == null) return "UNKNOWN";
  const age = now - updatedAt;
  if (age < 0) return "FRESH";
  if (age < LOCATION_FRESH_MS) return "FRESH";
  if (age < LOCATION_RECENT_MS) return "RECENT";
  return "STALE";
}

/** Load the persisted device location, or null when absent/too old/corrupt. */
export async function loadLastKnownLocation(now = Date.now()): Promise<PersistedDeviceLocation | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedDeviceLocation>;
    if (
      typeof parsed?.lat !== "number" ||
      typeof parsed?.lon !== "number" ||
      typeof parsed?.updatedAt !== "number" ||
      !Number.isFinite(parsed.lat) ||
      !Number.isFinite(parsed.lon)
    ) {
      return null;
    }
    if (now - parsed.updatedAt > LOCATION_CACHE_MAX_AGE_MS) return null;
    return {
      lat: parsed.lat,
      lon: parsed.lon,
      accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : null,
      updatedAt: parsed.updatedAt,
      source: (parsed.source as PersistedDeviceLocation["source"]) ?? "last-known",
      address: parsed.address ?? null,
    };
  } catch {
    return null;
  }
}

/** Persist the latest device location (fire-and-forget; never throws). */
export function saveLastKnownLocation(loc: PersistedDeviceLocation): void {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(loc)).catch(() => {});
}

export function clearLastKnownLocation(): void {
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}
