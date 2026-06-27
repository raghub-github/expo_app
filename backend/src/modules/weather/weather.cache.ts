import { getSql } from "../../db/client.js";
import type { MappedOpenMeteoWeather } from "./weather.mapper.js";
import type { ZoneWeatherSnapshot } from "./weather.types.js";
import type { WeatherChangeReason } from "./weather.utils.js";
import { WEATHER_CACHE_TTL_MS } from "./weather.constants.js";

export type WeatherCacheRow = {
  zoneKey: string;
  latitude: number;
  longitude: number;
  city: string;
  zoneName: string;
  weatherCode: number | null;
  weatherSeverity: string;
  rainDetected: boolean;
  payload: Record<string, unknown>;
  expiresAt: string;
  updatedAt: string;
};

function rowToSnapshot(row: WeatherCacheRow): ZoneWeatherSnapshot {
  const mapped = row.payload.mapped as MappedOpenMeteoWeather | undefined;
  return {
    zoneKey: row.zoneKey,
    city: row.city,
    zone: row.zoneName,
    latitude: row.latitude,
    longitude: row.longitude,
    weatherCondition: mapped?.weatherCondition ?? "Clear",
    rainDetected: row.rainDetected,
    rainIntensityMm: mapped?.rainMm ?? mapped?.precipitationMm ?? 0,
    temperatureC: mapped?.temperatureC ?? null,
    humidityPct: mapped?.humidityPct ?? null,
    windSpeedKmh: mapped?.windSpeedKmh ?? null,
    weatherSeverity: row.weatherSeverity as ZoneWeatherSnapshot["weatherSeverity"],
    updatedAt: row.updatedAt,
  };
}

export async function getWeatherCache(zoneKey: string): Promise<WeatherCacheRow | null> {
  const sql = getSql();
  const rows = (await sql`
    SELECT zone_key, latitude, longitude, city, zone_name, weather_code, weather_severity,
           rain_detected, payload, expires_at, updated_at
    FROM weather_cache
    WHERE zone_key = ${zoneKey}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    zoneKey: String(r.zone_key),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: String(r.city ?? ""),
    zoneName: String(r.zone_name ?? ""),
    weatherCode: r.weather_code != null ? Number(r.weather_code) : null,
    weatherSeverity: String(r.weather_severity),
    rainDetected: Boolean(r.rain_detected),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    expiresAt: new Date(String(r.expires_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

export function isCacheFresh(row: WeatherCacheRow | null, ttlMs = WEATHER_CACHE_TTL_MS): boolean {
  if (!row) return false;
  return new Date(row.expiresAt).getTime() > Date.now();
}

export async function upsertWeatherCache(args: {
  zoneKey: string;
  lat: number;
  lng: number;
  city: string;
  zoneName: string;
  mapped: MappedOpenMeteoWeather;
  ttlMs?: number;
}): Promise<WeatherCacheRow> {
  const sql = getSql();
  const expiresAt = new Date(Date.now() + (args.ttlMs ?? WEATHER_CACHE_TTL_MS));
  const payload = { ...args.mapped.raw, mapped: args.mapped, provider: "open-meteo" };

  const rows = (await sql`
    INSERT INTO weather_cache (
      zone_key, latitude, longitude, city, zone_name, weather_code, weather_severity,
      rain_detected, payload, expires_at, updated_at
    ) VALUES (
      ${args.zoneKey},
      ${String(args.lat)},
      ${String(args.lng)},
      ${args.city},
      ${args.zoneName},
      ${args.mapped.weatherCode},
      ${args.mapped.weatherSeverity},
      ${args.mapped.rainDetected},
      ${JSON.stringify(payload)}::jsonb,
      ${expiresAt.toISOString()},
      NOW()
    )
    ON CONFLICT (zone_key) DO UPDATE SET
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      city = EXCLUDED.city,
      zone_name = EXCLUDED.zone_name,
      weather_code = EXCLUDED.weather_code,
      weather_severity = EXCLUDED.weather_severity,
      rain_detected = EXCLUDED.rain_detected,
      payload = EXCLUDED.payload,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
    RETURNING zone_key, latitude, longitude, city, zone_name, weather_code, weather_severity,
              rain_detected, payload, expires_at, updated_at
  `) as Array<Record<string, unknown>>;

  const r = rows[0]!;

  await sql`
    INSERT INTO weather_zones (zone_key, latitude, longitude, city, is_active, last_access)
    VALUES (${args.zoneKey}, ${String(args.lat)}, ${String(args.lng)}, ${args.city}, TRUE, NOW())
    ON CONFLICT (zone_key) DO UPDATE SET last_access = NOW(), is_active = TRUE
  `;

  return {
    zoneKey: String(r.zone_key),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: String(r.city),
    zoneName: String(r.zone_name),
    weatherCode: r.weather_code != null ? Number(r.weather_code) : null,
    weatherSeverity: String(r.weather_severity),
    rainDetected: Boolean(r.rain_detected),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    expiresAt: new Date(String(r.expires_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
  };
}

export async function cacheRowToSnapshot(zoneKey: string): Promise<ZoneWeatherSnapshot | null> {
  const row = await getWeatherCache(zoneKey);
  return row ? rowToSnapshot(row) : null;
}

export async function getProviderPayloadFromCache(zoneKey: string): Promise<Record<string, unknown> | null> {
  const row = await getWeatherCache(zoneKey);
  return row?.payload ?? null;
}

export async function appendWeatherHistory(args: {
  zoneKey: string;
  mapped: MappedOpenMeteoWeather;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO weather_history (zone_key, weather_code, weather_severity, temperature_c, payload)
    VALUES (
      ${args.zoneKey},
      ${args.mapped.weatherCode},
      ${args.mapped.weatherSeverity},
      ${args.mapped.temperatureC != null ? String(args.mapped.temperatureC) : null},
      ${JSON.stringify({ mapped: args.mapped })}::jsonb
    )
  `;
}

export async function logWeatherEvent(args: {
  zoneKey: string;
  eventType: string;
  reasons: WeatherChangeReason[];
  payload?: Record<string, unknown>;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO weather_events (zone_key, event_type, reasons, payload)
    VALUES (
      ${args.zoneKey},
      ${args.eventType},
      ${JSON.stringify(args.reasons)}::jsonb,
      ${args.payload ? JSON.stringify(args.payload) : null}::jsonb
    )
  `;
}

export async function upsertWeatherAlert(args: {
  zoneKey: string;
  alertType: string;
  title: string;
  message: string;
  severity?: string;
  expiresAt: Date;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO weather_alerts (zone_key, alert_type, title, message, severity, expires_at)
    VALUES (
      ${args.zoneKey},
      ${args.alertType},
      ${args.title},
      ${args.message},
      ${args.severity ?? "warning"},
      ${args.expiresAt.toISOString()}
    )
  `;
}

export async function listActiveWeatherAlerts(zoneKey?: string) {
  const sql = getSql();
  if (zoneKey) {
    return sql`
      SELECT id, zone_key, alert_type, title, message, severity, expires_at, created_at
      FROM weather_alerts
      WHERE resolved_at IS NULL AND expires_at > NOW() AND zone_key = ${zoneKey}
      ORDER BY created_at DESC
      LIMIT 20
    `;
  }
  return sql`
    SELECT id, zone_key, alert_type, title, message, severity, expires_at, created_at
    FROM weather_alerts
    WHERE resolved_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 100
  `;
}

export async function getZoneCoords(
  zoneKey: string
): Promise<{ latitude: number; longitude: number; city: string } | null> {
  const row = await getWeatherCache(zoneKey);
  if (row) {
    return { latitude: row.latitude, longitude: row.longitude, city: row.city };
  }
  const sql = getSql();
  const rows = (await sql`
    SELECT latitude, longitude, city
    FROM weather_zones
    WHERE zone_key = ${zoneKey}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return {
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: String(r.city ?? ""),
  };
}

export async function listSchedulerZones(limit: number): Promise<
  Array<{ zoneKey: string; latitude: number; longitude: number; city: string | null }>
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT zone_key, latitude, longitude, city
    FROM weather_zones
    WHERE is_active = TRUE
    ORDER BY last_access DESC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    zoneKey: String(r.zone_key),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: r.city != null ? String(r.city) : null,
  }));
}

export async function listStaleCacheZones(limit: number): Promise<
  Array<{ zoneKey: string; latitude: number; longitude: number; city: string }>
> {
  const sql = getSql();
  const rows = (await sql`
    SELECT zone_key, latitude, longitude, city
    FROM weather_cache
    WHERE expires_at <= NOW()
    ORDER BY updated_at ASC
    LIMIT ${limit}
  `) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    zoneKey: String(r.zone_key),
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    city: String(r.city ?? ""),
  }));
}

export async function getWeatherHistory(zoneKey: string, hours = 24) {
  const sql = getSql();
  return sql`
    SELECT id, zone_key, weather_code, weather_severity, temperature_c, payload, recorded_at
    FROM weather_history
    WHERE zone_key = ${zoneKey} AND recorded_at >= NOW() - (${hours}::text || ' hours')::interval
    ORDER BY recorded_at DESC
    LIMIT 500
  `;
}

export async function getWeatherStatus() {
  const sql = getSql();
  const { listActiveZoneSummaries } = await import("./weather.zones-active.js");
  const [cacheCount] = (await sql`SELECT COUNT(*)::int AS c FROM weather_cache`) as Array<{ c: number }>;
  const activeZones = listActiveZoneSummaries();
  const [alertCount] = (await sql`
    SELECT COUNT(*)::int AS c FROM weather_alerts WHERE resolved_at IS NULL AND expires_at > NOW()
  `) as Array<{ c: number }>;
  return {
    provider: "open-meteo",
    mode: "event_driven",
    cacheEntries: cacheCount?.c ?? 0,
    activeZones: activeZones.length,
    activeActors: activeZones.reduce((n, z) => n + z.total, 0),
    activeAlerts: alertCount?.c ?? 0,
  };
}
