/**
 * Ride pickup/drop location search helpers – Rapido-style autocomplete + browse.
 */

import type { EnrichedPlaceResult } from "@/services/locationSearch.service";
import type { RecentLocationItem } from "@/store/recentLocationStore";

export const RIDE_SEARCH_DEBOUNCE_MS = 400;
export const RIDE_SEARCH_MIN_CHARS = 2;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** City hint from a full pickup address for empty-query browse near pickup. */
export function extractPickupCityHint(pickupText: string): string {
  const parts = pickupText
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) return parts[parts.length - 3];
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? "";
}

export function recentItemsToEnrichedResults(
  items: RecentLocationItem[],
  proximity?: { latitude: number; longitude: number },
  filterQuery?: string
): EnrichedPlaceResult[] {
  const q = filterQuery?.trim().toLowerCase() ?? "";
  return items
    .filter((item) => {
      if (!q) return true;
      const hay = `${item.primary} ${item.fullAddress ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .map((item) => ({
      primary: item.primary,
      secondary: item.fullAddress?.slice(0, 80) ?? "",
      fullAddress: item.fullAddress ?? item.primary,
      latitude: item.latitude,
      longitude: item.longitude,
      distanceKm:
        proximity != null
          ? haversineKm(proximity.latitude, proximity.longitude, item.latitude, item.longitude)
          : undefined,
      confidenceScore: 0.82,
      source: "local" as const,
    }))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
}

export function mergeRideSearchResults(...lists: EnrichedPlaceResult[][]): EnrichedPlaceResult[] {
  const byKey = new Map<string, EnrichedPlaceResult>();
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)},${item.primary.slice(0, 40)}`;
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

export function localSuggestionsToEnriched(
  local: Array<{
    primary: string;
    secondary: string;
    fullAddress: string;
    latitude: number;
    longitude: number;
    usageCount?: number;
    city?: string;
    area?: string;
  }>,
  proximity?: { latitude: number; longitude: number }
): EnrichedPlaceResult[] {
  return local.map((loc) => ({
    primary: loc.primary,
    secondary: loc.secondary.slice(0, 80),
    fullAddress: loc.fullAddress,
    latitude: loc.latitude,
    longitude: loc.longitude,
    area: loc.area,
    city: loc.city,
    usageCount: loc.usageCount,
    distanceKm:
      proximity != null
        ? haversineKm(proximity.latitude, proximity.longitude, loc.latitude, loc.longitude)
        : undefined,
    confidenceScore: 0.78,
    source: "local" as const,
  }));
}
