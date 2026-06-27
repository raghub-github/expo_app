import { getWeatherThresholds } from "./weather.config.js";
import { fetchOpenMeteoForecast } from "./openmeteo.client.js";
import { mapOpenMeteoForecast } from "./weather.mapper.js";
import {
  getWeatherCache,
  isCacheFresh,
  upsertWeatherCache,
  getProviderPayloadFromCache,
  appendWeatherHistory,
  logWeatherEvent,
  upsertWeatherAlert,
  cacheRowToSnapshot,
  type WeatherCacheRow,
} from "./weather.cache.js";
import { upsertZoneSnapshot, getSnapshotByZoneKey } from "./weather.repository.js";
import {
  detectWeatherChanges,
  hasSignificantWeatherChange,
  mappedToComparable,
  snapshotToComparable,
  type WeatherChangeReason,
} from "./weather.utils.js";
import { buildZoneKey } from "./weather.classify.js";
import { sanitizeLocationHint } from "./weather.sanitize.js";
import { resolveServiceZone } from "./weather.zone-resolver.js";
import {
  buildCustomerWeatherPresentation,
  buildMerchantWeatherPresentation,
} from "./weather.presentation.js";
import { broadcastWeatherUpdate } from "./weather.websocket.js";
import {
  recordWeatherCacheHit,
  recordWeatherCacheMiss,
  recordWeatherRefreshFailure,
  recordWeatherStaleFallback,
} from "./weather.monitoring.js";
import { isZoneActive, touchZonePresence, type ZoneActorType } from "./weather.zones-active.js";
import type {
  CustomerWeatherContext,
  MerchantWeatherContext,
  WeatherEtaAdjustment,
  WeatherRefreshTrigger,
  WeatherSeverity,
  ZoneWeatherSnapshot,
} from "./weather.types.js";

const inflightByZone = new Map<string, Promise<CustomerWeatherContext>>();

function shouldFetchFromProvider(args: {
  trigger: WeatherRefreshTrigger;
  forceRefresh?: boolean;
  cache: WeatherCacheRow | null;
  zoneActive: boolean;
}): boolean {
  if (args.forceRefresh || args.trigger === "manual_refresh" || args.trigger === "rain_event") {
    return true;
  }
  if (args.trigger === "eta_calculation") {
    return false;
  }
  if (isCacheFresh(args.cache)) {
    return false;
  }
  if (!args.cache) {
    return args.zoneActive;
  }
  return args.zoneActive;
}

async function syncLegacySnapshot(
  zoneKey: string,
  lat: number,
  lng: number,
  city: string,
  zoneName: string,
  mapped: ReturnType<typeof mapOpenMeteoForecast> & object
): Promise<ZoneWeatherSnapshot> {
  return upsertZoneSnapshot({
    zoneKey,
    city,
    zone: zoneName,
    latitude: lat,
    longitude: lng,
    weatherCondition: mapped.weatherCondition,
    rainDetected: mapped.rainDetected,
    rainIntensityMm: mapped.rainMm || mapped.precipitationMm,
    temperatureC: mapped.temperatureC,
    humidityPct: mapped.humidityPct,
    windSpeedKmh: mapped.windSpeedKmh,
    weatherSeverity: mapped.weatherSeverity,
    providerPayload: mapped.raw as Record<string, unknown>,
  });
}

function maybeCreateAlerts(zoneKey: string, mapped: NonNullable<ReturnType<typeof mapOpenMeteoForecast>>) {
  const expires = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const temp = mapped.temperatureC;
  if (temp != null && temp > 40) {
    void upsertWeatherAlert({
      zoneKey,
      alertType: "extreme_heat",
      title: "Extreme Heat Alert",
      message: "Extreme heat detected. Stay hydrated.",
      severity: "danger",
      expiresAt: expires,
    });
  }
  if (mapped.weatherSeverity === "HEAVY_RAIN") {
    void upsertWeatherAlert({
      zoneKey,
      alertType: "heavy_rain",
      title: "Heavy Rain Alert",
      message: "Heavy rainfall may delay deliveries.",
      severity: "warning",
      expiresAt: expires,
    });
  }
  if (mapped.weatherSeverity === "EXTREME_WEATHER") {
    void upsertWeatherAlert({
      zoneKey,
      alertType: "storm",
      title: "Storm Alert",
      message: "Severe weather in your area.",
      severity: "danger",
      expiresAt: expires,
    });
  }
}

async function fetchAndStoreZone(args: {
  zoneKey: string;
  lat: number;
  lng: number;
  city: string;
  zoneName: string;
  before: ZoneWeatherSnapshot | null;
  beforePayload: Record<string, unknown> | null;
  areaLabel?: string | null;
  broadcast: boolean;
}): Promise<ZoneWeatherSnapshot | null> {
  const thresholds = await getWeatherThresholds();
  const raw = await fetchOpenMeteoForecast(args.lat, args.lng);
  if (!raw) {
    recordWeatherRefreshFailure();
    return args.before;
  }

  const mapped = mapOpenMeteoForecast(raw, thresholds);
  if (!mapped) {
    recordWeatherRefreshFailure();
    return args.before;
  }

  const beforeCmp = args.before
    ? snapshotToComparable(args.before, args.beforePayload)
    : null;
  const afterCmp = mappedToComparable(mapped);
  const reasons = detectWeatherChanges(beforeCmp, afterCmp);
  const changed = !args.before || hasSignificantWeatherChange(beforeCmp, afterCmp);

  if (!changed && args.before) {
    recordWeatherCacheHit();
    return args.before;
  }

  await upsertWeatherCache({
    zoneKey: args.zoneKey,
    lat: args.lat,
    lng: args.lng,
    city: args.city,
    zoneName: args.zoneName,
    mapped,
  });

  const snapshot = await syncLegacySnapshot(
    args.zoneKey,
    args.lat,
    args.lng,
    args.city,
    args.zoneName,
    mapped
  );

  if (changed) {
    await appendWeatherHistory({ zoneKey: args.zoneKey, mapped });
    await logWeatherEvent({
      zoneKey: args.zoneKey,
      eventType: reasons[0] ?? "weather_changed",
      reasons,
      payload: { weatherCode: mapped.weatherCode, severity: mapped.weatherSeverity },
    });
    maybeCreateAlerts(args.zoneKey, mapped);

    if (args.broadcast) {
      const weather = await buildContextFromSnapshot(snapshot, args.areaLabel);
      await broadcastWeatherUpdate({
        zoneKey: args.zoneKey,
        event: mapReasonsToEvent(reasons),
        reasons,
        weather,
      });
    }
  }

  return snapshot;
}

function mapReasonsToEvent(reasons: WeatherChangeReason[]): string {
  if (reasons.includes("rain_started")) return "rain_started";
  if (reasons.includes("rain_stopped")) return "rain_stopped";
  if (reasons.includes("storm_status")) return "storm_alert";
  if (reasons.some((r) => r === "weather_code" || r === "severity")) return "weather_changed";
  return "weather_changed";
}

async function buildContextFromSnapshot(
  snapshot: ZoneWeatherSnapshot,
  areaLabel?: string | null
): Promise<CustomerWeatherContext> {
  const thresholds = await getWeatherThresholds();
  const { etaDelayForSeverity } = await import("./weather.classify.js");
  const providerPayload = await getProviderPayloadFromCache(snapshot.zoneKey);
  return buildCustomerWeatherPresentation({
    severity: snapshot.weatherSeverity,
    rainDetected: snapshot.rainDetected,
    rainIntensityMm: snapshot.rainIntensityMm,
    temperatureC: snapshot.temperatureC,
    humidityPct: snapshot.humidityPct,
    windSpeedKmh: snapshot.windSpeedKmh,
    weatherCondition: snapshot.weatherCondition,
    city: snapshot.city,
    zone: snapshot.zone,
    areaLabel: areaLabel ?? snapshot.city,
    etaDelayMinutes: etaDelayForSeverity(snapshot.weatherSeverity, thresholds),
    updatedAt: snapshot.updatedAt,
    zoneKey: snapshot.zoneKey,
    providerPayload,
  });
}

async function readCachedSnapshot(zoneKey: string): Promise<ZoneWeatherSnapshot | null> {
  const fromCache = await cacheRowToSnapshot(zoneKey);
  if (fromCache) return fromCache;
  return getSnapshotByZoneKey(zoneKey);
}

async function resolveSnapshot(args: {
  zoneKey: string;
  lat: number;
  lng: number;
  city: string;
  zoneName: string;
  areaLabel?: string | null;
  forceRefresh?: boolean;
  trigger: WeatherRefreshTrigger;
}): Promise<ZoneWeatherSnapshot | null> {
  const cache = await getWeatherCache(args.zoneKey);
  const zoneActive = isZoneActive(args.zoneKey);

  if (!args.forceRefresh && isCacheFresh(cache)) {
    recordWeatherCacheHit();
    const snap = await cacheRowToSnapshot(args.zoneKey);
    if (snap) return snap;
  }

  const before = cache ? await cacheRowToSnapshot(args.zoneKey) : await readCachedSnapshot(args.zoneKey);
  const beforePayload = cache?.payload ?? (await getProviderPayloadFromCache(args.zoneKey));

  const fetchAllowed = shouldFetchFromProvider({
    trigger: args.trigger,
    forceRefresh: args.forceRefresh,
    cache,
    zoneActive,
  });

  if (!fetchAllowed) {
    if (before) {
      recordWeatherStaleFallback();
      return before;
    }
    return null;
  }

  recordWeatherCacheMiss();
  return fetchAndStoreZone({
    zoneKey: args.zoneKey,
    lat: args.lat,
    lng: args.lng,
    city: args.city,
    zoneName: args.zoneName,
    before,
    beforePayload,
    areaLabel: args.areaLabel,
    broadcast: args.trigger !== "eta_calculation" && args.trigger !== "customer_home",
  });
}

export async function resolveZoneWeather(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  areaLabel?: string | null;
  forceRefresh?: boolean;
  trigger?: WeatherRefreshTrigger;
  actorId?: string | null;
  actorType?: ZoneActorType;
}): Promise<CustomerWeatherContext> {
  const trigger = args.trigger ?? "customer_home";
  const cityHint = sanitizeLocationHint(args.cityHint) ?? sanitizeLocationHint(args.areaLabel);
  const serviceZone = await resolveServiceZone({ lat: args.lat, lng: args.lng, cityHint });
  const city = serviceZone.city || cityHint || "Unknown";
  const { zoneKey, zone } = buildZoneKey(args.lat, args.lng, city, serviceZone.zoneName);

  if (args.actorId && args.actorType) {
    touchZonePresence(zoneKey, args.actorType, args.actorId);
  } else if (trigger === "customer_home" || trigger === "zone_enter") {
    touchZonePresence(zoneKey, "customer", `anon:${zoneKey}`);
  }

  if (!args.forceRefresh) {
    const pending = inflightByZone.get(zoneKey);
    if (pending) return pending;
    const task = resolveZoneWeatherOnce({ ...args, trigger, zoneKey, zone, city, serviceZoneZone: serviceZone.zoneName })
      .finally(() => inflightByZone.delete(zoneKey));
    inflightByZone.set(zoneKey, task);
    return task;
  }

  return resolveZoneWeatherOnce({ ...args, trigger, zoneKey, zone, city, serviceZoneZone: serviceZone.zoneName });
}

async function resolveZoneWeatherOnce(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  areaLabel?: string | null;
  forceRefresh?: boolean;
  trigger: WeatherRefreshTrigger;
  zoneKey: string;
  zone: string;
  city: string;
  serviceZoneZone: string | null;
  actorId?: string | null;
  actorType?: ZoneActorType;
}): Promise<CustomerWeatherContext> {
  const snapshot = await resolveSnapshot({
    zoneKey: args.zoneKey,
    lat: args.lat,
    lng: args.lng,
    city: args.city,
    zoneName: args.zone,
    areaLabel: args.areaLabel,
    forceRefresh: args.forceRefresh,
    trigger: args.trigger,
  });

  const areaLabel =
    sanitizeLocationHint(args.areaLabel) ??
    sanitizeLocationHint(snapshot?.city) ??
    sanitizeLocationHint(args.city) ??
    "your area";

  if (!snapshot) {
    return buildCustomerWeatherPresentation({
      severity: "CLEAR",
      rainDetected: false,
      rainIntensityMm: 0,
      temperatureC: null,
      humidityPct: null,
      windSpeedKmh: null,
      weatherCondition: "Clear",
      city: args.city,
      zone: args.serviceZoneZone,
      areaLabel,
      etaDelayMinutes: 0,
      updatedAt: null,
      zoneKey: args.zoneKey,
      providerPayload: null,
    });
  }

  return buildContextFromSnapshot(snapshot, areaLabel);
}

export async function resolveMerchantZoneWeather(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  actorId?: string | null;
}): Promise<MerchantWeatherContext> {
  const customerCtx = await resolveZoneWeather({
    lat: args.lat,
    lng: args.lng,
    cityHint: args.cityHint,
    areaLabel: args.cityHint,
    trigger: "merchant_dashboard",
    actorId: args.actorId ?? undefined,
    actorType: args.actorId ? "merchant" : undefined,
  });
  return buildMerchantWeatherPresentation({
    severity: customerCtx.severity,
    weatherCondition: customerCtx.weatherCondition,
    city: customerCtx.city,
    zoneName: customerCtx.zone,
    etaDelayMinutes: customerCtx.etaDelayMinutes,
    updatedAt: customerCtx.updatedAt,
  });
}

/** ETA reads shared cache only — never calls Open-Meteo directly. */
export async function getWeatherSeverityForCoords(
  lat: number,
  lng: number,
  cityHint?: string | null
): Promise<WeatherSeverity> {
  const ctx = await resolveZoneWeather({ lat, lng, cityHint, trigger: "eta_calculation" });
  return ctx.severity;
}

export function applyWeatherToEta(
  baseEtaMinutes: number,
  weather: CustomerWeatherContext
): WeatherEtaAdjustment {
  const delay = weather.etaDelayMinutes;
  return {
    baseEtaMinutes: Math.round(baseEtaMinutes),
    weatherDelayMinutes: delay,
    adjustedEtaMinutes: Math.round(baseEtaMinutes + delay),
    includesWeatherImpact: delay > 0,
    impactLabel: weather.etaImpactLabel,
  };
}

export async function refreshZoneWeatherFromProvider(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  forceRefresh?: boolean;
  areaLabel?: string | null;
  trigger?: WeatherRefreshTrigger;
  actorId?: string | null;
  actorType?: ZoneActorType;
}) {
  const trigger = args.trigger ?? "manual_refresh";
  const cityHint = sanitizeLocationHint(args.cityHint);
  const serviceZone = await resolveServiceZone({
    lat: args.lat,
    lng: args.lng,
    cityHint,
  });
  const city = serviceZone.city || cityHint || "Unknown";
  const { zoneKey, zone } = buildZoneKey(args.lat, args.lng, city, serviceZone.zoneName);

  if (args.actorId && args.actorType) {
    touchZonePresence(zoneKey, args.actorType, args.actorId);
  }

  const before = await readCachedSnapshot(zoneKey);
  const beforePayload = await getProviderPayloadFromCache(zoneKey);

  const after = await fetchAndStoreZone({
    zoneKey,
    lat: args.lat,
    lng: args.lng,
    city,
    zoneName: zone,
    before,
    beforePayload,
    areaLabel: args.areaLabel,
    broadcast: true,
  });

  const reasons = after
    ? detectWeatherChanges(
        before ? snapshotToComparable(before, beforePayload) : null,
        snapshotToComparable(after, await getProviderPayloadFromCache(zoneKey))
      )
    : [];

  return {
    before,
    after,
    publishedEvent: reasons.length > 0 ? mapReasonsToEvent(reasons) : null,
  };
}

export async function ingestRainWeatherEvent(
  input: import("./weather.events.js").RainWeatherEventInput
) {
  const result = await refreshZoneWeatherFromProvider({
    lat: input.lat,
    lng: input.lng,
    cityHint: input.cityHint,
    areaLabel: input.areaLabel,
    forceRefresh: true,
    trigger: "rain_event",
  });
  if (!result.after) throw new Error("weather_refresh_failed");
  return {
    ok: true as const,
    published: result.publishedEvent != null,
    event: result.publishedEvent,
    zoneKey: result.after.zoneKey,
  };
}

/** Cache-only read for WS ticket bootstrap — no provider fetch. */
export async function getCachedZoneWeatherContext(
  zoneKey: string
): Promise<CustomerWeatherContext | null> {
  const snapshot = await readCachedSnapshot(zoneKey);
  if (!snapshot) return null;
  return buildContextFromSnapshot(snapshot);
}
