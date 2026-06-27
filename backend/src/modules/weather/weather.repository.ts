import { getDb } from "../../db/client.js";
import { zoneWeatherSnapshots } from "../../db/schema.js";
import { eq, desc, lt, sql } from "drizzle-orm";
import type { ZoneWeatherSnapshot, WeatherSeverity } from "./weather.types.js";

function rowToSnapshot(r: typeof zoneWeatherSnapshots.$inferSelect): ZoneWeatherSnapshot {
  return {
    zoneKey: r.zoneKey,
    city: r.city,
    zone: r.zone,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    weatherCondition: r.weatherCondition,
    rainDetected: r.rainDetected,
    rainIntensityMm: Number(r.rainIntensityMm ?? 0),
    temperatureC: r.temperatureC != null ? Number(r.temperatureC) : null,
    humidityPct: r.humidityPct != null ? Number(r.humidityPct) : null,
    windSpeedKmh: r.windSpeedKmh != null ? Number(r.windSpeedKmh) : null,
    weatherSeverity: r.weatherSeverity as WeatherSeverity,
    updatedAt: r.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function getSnapshotByZoneKey(zoneKey: string): Promise<ZoneWeatherSnapshot | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(zoneWeatherSnapshots)
    .where(eq(zoneWeatherSnapshots.zoneKey, zoneKey))
    .limit(1);
  return row ? rowToSnapshot(row) : null;
}

export async function getProviderPayloadByZoneKey(
  zoneKey: string
): Promise<Record<string, unknown> | null> {
  const db = getDb();
  const [row] = await db
    .select({ providerPayload: zoneWeatherSnapshots.providerPayload })
    .from(zoneWeatherSnapshots)
    .where(eq(zoneWeatherSnapshots.zoneKey, zoneKey))
    .limit(1);
  const payload = row?.providerPayload;
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
}

export async function upsertZoneSnapshot(input: {
  zoneKey: string;
  city: string;
  zone: string;
  latitude: number;
  longitude: number;
  weatherCondition: string;
  rainDetected: boolean;
  rainIntensityMm: number;
  temperatureC: number | null;
  humidityPct: number | null;
  windSpeedKmh: number | null;
  weatherSeverity: WeatherSeverity;
  providerPayload?: Record<string, unknown> | null;
}): Promise<ZoneWeatherSnapshot> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .insert(zoneWeatherSnapshots)
    .values({
      zoneKey: input.zoneKey,
      city: input.city,
      zone: input.zone,
      latitude: String(input.latitude),
      longitude: String(input.longitude),
      weatherCondition: input.weatherCondition,
      rainDetected: input.rainDetected,
      rainIntensityMm: String(input.rainIntensityMm),
      temperatureC: input.temperatureC != null ? String(input.temperatureC) : null,
      humidityPct: input.humidityPct != null ? String(input.humidityPct) : null,
      windSpeedKmh: input.windSpeedKmh != null ? String(input.windSpeedKmh) : null,
      weatherSeverity: input.weatherSeverity,
      providerPayload: input.providerPayload ?? null,
      updatedAt: now,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: zoneWeatherSnapshots.zoneKey,
      set: {
        city: input.city,
        zone: input.zone,
        latitude: String(input.latitude),
        longitude: String(input.longitude),
        weatherCondition: input.weatherCondition,
        rainDetected: input.rainDetected,
        rainIntensityMm: String(input.rainIntensityMm),
        temperatureC: input.temperatureC != null ? String(input.temperatureC) : null,
        humidityPct: input.humidityPct != null ? String(input.humidityPct) : null,
        windSpeedKmh: input.windSpeedKmh != null ? String(input.windSpeedKmh) : null,
        weatherSeverity: input.weatherSeverity,
        providerPayload: input.providerPayload ?? null,
        updatedAt: now,
      },
    })
    .returning();
  return rowToSnapshot(row);
}

/** Zones stale beyond refresh interval — background tick target list. */
export async function listStaleZoneKeys(staleBefore: Date, limit = 40): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ zoneKey: zoneWeatherSnapshots.zoneKey })
    .from(zoneWeatherSnapshots)
    .where(lt(zoneWeatherSnapshots.updatedAt, staleBefore))
    .orderBy(zoneWeatherSnapshots.updatedAt)
    .limit(limit);
  return rows.map((r) => r.zoneKey);
}

/** Recently touched zones for proactive refresh. */
export async function listRecentZoneSnapshots(limit = 40): Promise<ZoneWeatherSnapshot[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(zoneWeatherSnapshots)
    .orderBy(desc(zoneWeatherSnapshots.updatedAt))
    .limit(limit);
  return rows.map(rowToSnapshot);
}

export async function countSnapshots(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(zoneWeatherSnapshots);
  return Number(row?.c ?? 0);
}
