/**
 * Location search – popular_locations + optional customer addresses.
 * Powers local fallback when Mapbox confidence is low; city→area suggestions.
 */

import { getDb } from "../../db/client.js";
import { popularLocations, customerAddresses } from "../../db/schema.js";
import { or, ilike, desc, and, eq, isNull } from "drizzle-orm";

export type LocalSuggestion = {
  primary: string;
  secondary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  source: "popular" | "saved_address";
  usageCount?: number;
  city?: string;
  area?: string;
};

/** Search popular_locations by query (ILIKE on city_name, area_name, display_name). */
export async function searchPopularLocations(
  query: string,
  options: { limit?: number; proximityLat?: number; proximityLng?: number } = {}
): Promise<LocalSuggestion[]> {
  const db = getDb();
  const limit = Math.min(options.limit ?? 10, 20);
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const pattern = `%${q}%`;
  let stmt = db
    .select({
      cityName: popularLocations.cityName,
      areaName: popularLocations.areaName,
      displayName: popularLocations.displayName,
      latitude: popularLocations.latitude,
      longitude: popularLocations.longitude,
      usageCount: popularLocations.usageCount,
    })
    .from(popularLocations)
    .where(
      or(
        ilike(popularLocations.cityName, pattern),
        ilike(popularLocations.areaName, pattern),
        ilike(popularLocations.displayName, pattern)
      )
    )
    .orderBy(desc(popularLocations.usageCount))
    .limit(limit * 2);

  const rows = await stmt;

  const out: LocalSuggestion[] = rows.map((r) => {
    const lat = parseFloat(String(r.latitude));
    const lng = parseFloat(String(r.longitude));
    const primary = r.areaName || r.displayName || r.cityName || "Location";
    const secondary = [r.areaName, r.cityName].filter(Boolean).join(", ") || "—";
    const fullAddress = [r.areaName, r.cityName].filter(Boolean).join(", ") || primary;
    return {
      primary,
      secondary: secondary.slice(0, 80),
      fullAddress,
      latitude: lat,
      longitude: lng,
      source: "popular" as const,
      usageCount: r.usageCount ?? 0,
      city: r.cityName ?? undefined,
      area: r.areaName ?? undefined,
    };
  });

  return out.slice(0, limit);
}

/** Get popular areas for a city (for city→areas expansion). Sorted by usage_count + search_rank. */
export async function getPopularAreasForCity(
  cityName: string,
  options: { limit?: number } = {}
): Promise<LocalSuggestion[]> {
  const db = getDb();
  const limit = Math.min(options.limit ?? 10, 15);
  const city = cityName.trim();
  if (!city) return [];

  const rows = await db
    .select({
      cityName: popularLocations.cityName,
      areaName: popularLocations.areaName,
      displayName: popularLocations.displayName,
      latitude: popularLocations.latitude,
      longitude: popularLocations.longitude,
      usageCount: popularLocations.usageCount,
      searchRank: popularLocations.searchRank,
    })
    .from(popularLocations)
    .where(ilike(popularLocations.cityName, city))
    .orderBy(desc(popularLocations.usageCount), desc(popularLocations.searchRank))
    .limit(limit);

  return rows.map((r) => {
    const lat = parseFloat(String(r.latitude));
    const lng = parseFloat(String(r.longitude));
    const primary = r.areaName || r.displayName || r.cityName || "Location";
    const secondary = [r.cityName].filter(Boolean).join(", ") || "—";
    const fullAddress = [r.areaName, r.cityName].filter(Boolean).join(", ") || primary;
    return {
      primary,
      secondary,
      fullAddress,
      latitude: lat,
      longitude: lng,
      source: "popular" as const,
      usageCount: r.usageCount ?? 0,
      city: r.cityName ?? undefined,
      area: r.areaName ?? undefined,
    };
  });
}

/** Search current user's saved addresses by label/addressLine1/city. */
export async function searchCustomerAddresses(
  customerId: number,
  query: string,
  limit: number = 5
): Promise<LocalSuggestion[]> {
  const db = getDb();
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const pattern = `%${q}%`;
  const rows = await db
    .select({
      customLabel: customerAddresses.customLabel,
      label: customerAddresses.label,
      addressLine1: customerAddresses.addressLine1,
      addressLine2: customerAddresses.addressLine2,
      city: customerAddresses.city,
      latitude: customerAddresses.latitude,
      longitude: customerAddresses.longitude,
    })
    .from(customerAddresses)
    .where(
      and(
        eq(customerAddresses.customerId, customerId),
        eq(customerAddresses.isActive, true),
        isNull(customerAddresses.deletedAt),
        or(
          ilike(customerAddresses.customLabel, pattern),
          ilike(customerAddresses.addressLine1, pattern),
          ilike(customerAddresses.city, pattern)
        )
      )
    )
    .limit(limit);

  return rows.map((r) => {
    const lat = parseFloat(String(r.latitude));
    const lng = parseFloat(String(r.longitude));
    const fullAddress = [r.addressLine1, r.addressLine2].filter(Boolean).join(", ") || r.addressLine1;
    const primary = r.customLabel || r.label || fullAddress.split(",")[0]?.trim() || "Address";
    const secondary = fullAddress.slice(0, 80);
    return {
      primary,
      secondary,
      fullAddress,
      latitude: lat,
      longitude: lng,
      source: "saved_address" as const,
      city: r.city ?? undefined,
    };
  });
}

/** Record a delivery location (self-learning). Call on order placement. */
export async function recordDeliveryLocation(params: {
  cityName: string;
  areaName: string;
  displayName?: string | null;
  latitude: number;
  longitude: number;
}): Promise<void> {
  const db = getDb();
  const city = params.cityName.trim() || "Unknown";
  const area = params.areaName.trim() || params.displayName?.trim() || "Unknown";

  const existing = await db
    .select({ id: popularLocations.id, usageCount: popularLocations.usageCount })
    .from(popularLocations)
    .where(
      and(
        ilike(popularLocations.cityName, city),
        ilike(popularLocations.areaName, area)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(popularLocations)
      .set({
        usageCount: (existing[0].usageCount ?? 0) + 1,
        displayName: params.displayName?.trim() ?? undefined,
        latitude: String(params.latitude),
        longitude: String(params.longitude),
        updatedAt: new Date(),
      })
      .where(eq(popularLocations.id, existing[0].id));
  } else {
    await db.insert(popularLocations).values({
      cityName: city,
      areaName: area,
      displayName: params.displayName?.trim() ?? null,
      latitude: String(params.latitude),
      longitude: String(params.longitude),
      usageCount: 1,
    });
  }
}
