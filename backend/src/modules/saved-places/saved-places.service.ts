/**
 * Customer favorite pins + favorite journeys.
 * Point lookups by customer_id + rounded coord keys — no scans, no usage_count churn.
 */

import { getSql, withSqlRetry } from "../../db/client.js";

export type JourneyKind = "ride" | "parcel";

export type SavedLocationDto = {
  latitude: number;
  longitude: number;
  primary: string;
  fullAddress: string;
  savedAt: number;
};

export type SavedJourneyDto = {
  serviceKind: JourneyKind;
  pickup: SavedLocationDto;
  drop: SavedLocationDto;
  savedAt: number;
};

const MAX_LOCATIONS = 40;
const MAX_JOURNEYS = 12;

export function coordKey(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

function epochMs(value: Date | string | null | undefined): number {
  if (!value) return Date.now();
  const t = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function asNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export async function listSavedPlaces(customerId: number): Promise<{
  locations: SavedLocationDto[];
  journeys: SavedJourneyDto[];
}> {
  return withSqlRetry(async () => {
    const sql = getSql();
    const [locRows, journeyRows] = await Promise.all([
      sql`
        SELECT location_name, formatted_address, latitude, longitude, updated_at
        FROM public.customer_saved_locations
        WHERE customer_id = ${customerId}
          AND is_favorite IS TRUE
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${MAX_LOCATIONS}
      `,
      sql`
        SELECT
          service_kind,
          pickup_name, pickup_address, pickup_lat, pickup_lng,
          drop_name, drop_address, drop_lat, drop_lng,
          updated_at
        FROM public.customer_saved_journeys
        WHERE customer_id = ${customerId}
          AND is_favorite IS TRUE
        ORDER BY updated_at DESC NULLS LAST
        LIMIT ${MAX_JOURNEYS * 2}
      `,
    ]);

    const locations: SavedLocationDto[] = locRows.map((row) => ({
      latitude: asNumber(row.latitude),
      longitude: asNumber(row.longitude),
      primary: String(row.location_name ?? ""),
      fullAddress: String(row.formatted_address ?? row.location_name ?? ""),
      savedAt: epochMs(row.updated_at as Date | string | null),
    }));

    const journeys: SavedJourneyDto[] = journeyRows.map((row) => {
      const savedAt = epochMs(row.updated_at as Date | string | null);
      return {
        serviceKind: row.service_kind === "parcel" ? "parcel" : "ride",
        pickup: {
          latitude: asNumber(row.pickup_lat),
          longitude: asNumber(row.pickup_lng),
          primary: String(row.pickup_name ?? ""),
          fullAddress: String(row.pickup_address ?? row.pickup_name ?? ""),
          savedAt,
        },
        drop: {
          latitude: asNumber(row.drop_lat),
          longitude: asNumber(row.drop_lng),
          primary: String(row.drop_name ?? ""),
          fullAddress: String(row.drop_address ?? row.drop_name ?? ""),
          savedAt,
        },
        savedAt,
      };
    });

    return { locations, journeys };
  });
}

export async function upsertSavedLocation(
  customerId: number,
  input: { primary: string; fullAddress?: string; latitude: number; longitude: number }
): Promise<void> {
  const name = clip(input.primary || input.fullAddress || "Favorite", 120);
  const address = clip(input.fullAddress || name, 500);
  const latKey = coordKey(input.latitude);
  const lngKey = coordKey(input.longitude);

  await withSqlRetry(async () => {
    const sql = getSql();
    await sql`
      INSERT INTO public.customer_saved_locations (
        customer_id, location_name, location_type, formatted_address,
        latitude, longitude, lat_key, lng_key, is_favorite, last_used_at, updated_at
      ) VALUES (
        ${customerId}, ${name}, 'FAVORITE', ${address},
        ${input.latitude}, ${input.longitude}, ${latKey}, ${lngKey},
        TRUE, NOW(), NOW()
      )
      ON CONFLICT (customer_id, lat_key, lng_key)
      DO UPDATE SET
        location_name = EXCLUDED.location_name,
        formatted_address = EXCLUDED.formatted_address,
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        location_type = 'FAVORITE',
        is_favorite = TRUE,
        last_used_at = NOW(),
        updated_at = NOW()
    `;
  });
}

export async function deleteSavedLocation(
  customerId: number,
  latitude: number,
  longitude: number
): Promise<void> {
  const latKey = coordKey(latitude);
  const lngKey = coordKey(longitude);
  await withSqlRetry(async () => {
    const sql = getSql();
    await sql`
      DELETE FROM public.customer_saved_locations
      WHERE customer_id = ${customerId}
        AND lat_key = ${latKey}
        AND lng_key = ${lngKey}
    `;
  });
}

type JourneyInput = {
  serviceKind: JourneyKind;
  pickup: { primary: string; fullAddress?: string; latitude: number; longitude: number };
  drop: { primary: string; fullAddress?: string; latitude: number; longitude: number };
};

export async function upsertSavedJourney(customerId: number, input: JourneyInput): Promise<void> {
  const pickupName = clip(input.pickup.primary || input.pickup.fullAddress || "Pickup", 120);
  const dropName = clip(input.drop.primary || input.drop.fullAddress || "Drop", 120);
  const pickupAddress = clip(input.pickup.fullAddress || pickupName, 500);
  const dropAddress = clip(input.drop.fullAddress || dropName, 500);
  const pickupLatKey = coordKey(input.pickup.latitude);
  const pickupLngKey = coordKey(input.pickup.longitude);
  const dropLatKey = coordKey(input.drop.latitude);
  const dropLngKey = coordKey(input.drop.longitude);

  await withSqlRetry(async () => {
    const sql = getSql();
    await sql`
      INSERT INTO public.customer_saved_journeys (
        customer_id, service_kind,
        pickup_name, pickup_address, pickup_lat, pickup_lng,
        drop_name, drop_address, drop_lat, drop_lng,
        pickup_lat_key, pickup_lng_key, drop_lat_key, drop_lng_key,
        is_favorite, last_used_at, updated_at
      ) VALUES (
        ${customerId}, ${input.serviceKind},
        ${pickupName}, ${pickupAddress}, ${input.pickup.latitude}, ${input.pickup.longitude},
        ${dropName}, ${dropAddress}, ${input.drop.latitude}, ${input.drop.longitude},
        ${pickupLatKey}, ${pickupLngKey}, ${dropLatKey}, ${dropLngKey},
        TRUE, NOW(), NOW()
      )
      ON CONFLICT (customer_id, service_kind, pickup_lat_key, pickup_lng_key, drop_lat_key, drop_lng_key)
      DO UPDATE SET
        pickup_name = EXCLUDED.pickup_name,
        pickup_address = EXCLUDED.pickup_address,
        pickup_lat = EXCLUDED.pickup_lat,
        pickup_lng = EXCLUDED.pickup_lng,
        drop_name = EXCLUDED.drop_name,
        drop_address = EXCLUDED.drop_address,
        drop_lat = EXCLUDED.drop_lat,
        drop_lng = EXCLUDED.drop_lng,
        is_favorite = TRUE,
        last_used_at = NOW(),
        updated_at = NOW()
    `;
  });
}

export async function deleteSavedJourney(customerId: number, input: JourneyInput): Promise<void> {
  const pickupLatKey = coordKey(input.pickup.latitude);
  const pickupLngKey = coordKey(input.pickup.longitude);
  const dropLatKey = coordKey(input.drop.latitude);
  const dropLngKey = coordKey(input.drop.longitude);

  await withSqlRetry(async () => {
    const sql = getSql();
    await sql`
      DELETE FROM public.customer_saved_journeys
      WHERE customer_id = ${customerId}
        AND service_kind = ${input.serviceKind}
        AND pickup_lat_key = ${pickupLatKey}
        AND pickup_lng_key = ${pickupLngKey}
        AND drop_lat_key = ${dropLatKey}
        AND drop_lng_key = ${dropLngKey}
    `;
  });
}

export async function syncSavedPlaces(
  customerId: number,
  locations: Array<{ primary: string; fullAddress?: string; latitude: number; longitude: number }>,
  journeys: JourneyInput[]
): Promise<void> {
  const locSlice = locations.slice(0, MAX_LOCATIONS);
  const journeySlice = journeys.slice(0, MAX_JOURNEYS * 2);
  for (const loc of locSlice) {
    await upsertSavedLocation(customerId, loc);
  }
  for (const journey of journeySlice) {
    await upsertSavedJourney(customerId, journey);
  }
}
