import { fetchOpenWeatherCurrent } from "./openweather.client.js";
import { sanitizeLocationHint } from "./weather.sanitize.js";

import { getWeatherThresholds } from "./weather.config.js";

import {

  buildZoneKey,

  classifyWeatherSeverity,

  etaDelayForSeverity,

} from "./weather.classify.js";

import {

  buildCustomerWeatherPresentation,

  buildMerchantWeatherPresentation,

} from "./weather.presentation.js";

import {

  getSnapshotByZoneKey,

  upsertZoneSnapshot,

  listRecentZoneSnapshots,

} from "./weather.repository.js";

import { resolveServiceZone } from "./weather.zone-resolver.js";

import {

  recordWeatherCacheHit,

  recordWeatherCacheMiss,

  recordWeatherRefreshFailure,

  recordWeatherStaleFallback,

} from "./weather.monitoring.js";

import type {

  CustomerWeatherContext,

  MerchantWeatherContext,

  WeatherEtaAdjustment,

  WeatherSeverity,

  ZoneWeatherSnapshot,

} from "./weather.types.js";



/** Coalesce parallel requests for the same grid cell (location screen fans out N addresses). */
const inflightByGrid = new Map<string, Promise<CustomerWeatherContext>>();

function weatherGridInflightKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}_${Math.round(lng * 100)}`;
}

function snapshotAgeMinutes(updatedAt: string): number {

  const t = new Date(updatedAt).getTime();

  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;

  return (Date.now() - t) / 60_000;

}



async function refreshFromOpenWeather(args: {

  lat: number;

  lng: number;

  cityHint?: string | null;

}): Promise<ZoneWeatherSnapshot | null> {

  const thresholds = await getWeatherThresholds();

  const serviceZone = await resolveServiceZone({

    lat: args.lat,

    lng: args.lng,

    cityHint: args.cityHint,

  });

  const ow = await fetchOpenWeatherCurrent(args.lat, args.lng);

  if (!ow) {

    recordWeatherRefreshFailure();

    return null;

  }



  const city = ow.city || serviceZone.city || args.cityHint || "Unknown";

  const { zoneKey, zone } = buildZoneKey(args.lat, args.lng, city, serviceZone.zoneName);

  const severity = classifyWeatherSeverity({

    rainIntensityMm: ow.rainIntensityMm,

    windSpeedKmh: ow.windSpeedKmh,

    isThunderstorm: ow.isThunderstorm,

    thresholds,

  });



  const snapshot = await upsertZoneSnapshot({

    zoneKey,

    city,

    zone,

    latitude: args.lat,

    longitude: args.lng,

    weatherCondition: ow.weatherCondition,

    rainDetected:
      ow.rainIntensityMm >= thresholds.lightRainThresholdMm ||
      ow.isThunderstorm ||
      ow.isRainCondition,

    rainIntensityMm: ow.rainIntensityMm,

    temperatureC: ow.temperatureC,

    humidityPct: ow.humidityPct,

    windSpeedKmh: ow.windSpeedKmh,

    weatherSeverity: severity,

    providerPayload: ow.raw,

  });



  return snapshot;

}



async function loadBestSnapshot(args: {

  zoneKey: string;

  lat: number;

  lng: number;

  cityHint?: string | null;

  forceRefresh?: boolean;

}): Promise<ZoneWeatherSnapshot | null> {

  const thresholds = await getWeatherThresholds();

  let snapshot: ZoneWeatherSnapshot | null = null;

  let staleSnapshot: ZoneWeatherSnapshot | null = null;



  if (!args.forceRefresh) {
    snapshot = await getSnapshotByZoneKey(args.zoneKey);
    if (snapshot) recordWeatherCacheHit();
    else recordWeatherCacheMiss();



    if (snapshot) {

      if (snapshotAgeMinutes(snapshot.updatedAt) <= thresholds.cacheTtlMinutes) {

        return snapshot;

      }

      staleSnapshot = snapshot;

      snapshot = null;

    }

  }



  const refreshed = await refreshFromOpenWeather({

    lat: args.lat,

    lng: args.lng,

    cityHint: args.cityHint,

  });

  if (refreshed) return refreshed;



  if (staleSnapshot) {

    recordWeatherStaleFallback();

    return staleSnapshot;

  }



  const dbFallback = await getSnapshotByZoneKey(args.zoneKey);

  if (dbFallback) {

    recordWeatherStaleFallback();

    return dbFallback;

  }



  return null;

}



export async function resolveZoneWeather(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  areaLabel?: string | null;
  forceRefresh?: boolean;
}): Promise<CustomerWeatherContext> {
  if (!args.forceRefresh) {
    const key = weatherGridInflightKey(args.lat, args.lng);
    const pending = inflightByGrid.get(key);
    if (pending) return pending;
    const task = resolveZoneWeatherOnce(args).finally(() => inflightByGrid.delete(key));
    inflightByGrid.set(key, task);
    return task;
  }
  return resolveZoneWeatherOnce(args);
}

async function resolveZoneWeatherOnce(args: {
  lat: number;
  lng: number;
  cityHint?: string | null;
  areaLabel?: string | null;
  forceRefresh?: boolean;
}): Promise<CustomerWeatherContext> {
  const thresholds = await getWeatherThresholds();
  const cityHint = sanitizeLocationHint(args.cityHint) ?? sanitizeLocationHint(args.areaLabel);

  const serviceZone = await resolveServiceZone({
    lat: args.lat,
    lng: args.lng,
    cityHint,
  });

  const city = serviceZone.city || cityHint || "Unknown";

  const { zoneKey } = buildZoneKey(args.lat, args.lng, city, serviceZone.zoneName);



  const snapshot = await loadBestSnapshot({

    zoneKey,

    lat: args.lat,

    lng: args.lng,

    cityHint: cityHint ?? city,
    forceRefresh: args.forceRefresh,
  });

  const areaLabel =
    sanitizeLocationHint(args.areaLabel) ??
    sanitizeLocationHint(snapshot?.city) ??
    sanitizeLocationHint(city) ??
    sanitizeLocationHint(serviceZone.zoneName) ??
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
      city,
      zone: serviceZone.zoneName,
      areaLabel,
      etaDelayMinutes: 0,
      updatedAt: null,
    });
  }

  const etaDelayMinutes = etaDelayForSeverity(snapshot.weatherSeverity, thresholds);

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
    areaLabel,
    etaDelayMinutes,
    updatedAt: snapshot.updatedAt,
  });

}



export async function resolveMerchantZoneWeather(args: {

  lat: number;

  lng: number;

  cityHint?: string | null;

}): Promise<MerchantWeatherContext> {

  const customerCtx = await resolveZoneWeather({

    lat: args.lat,

    lng: args.lng,

    cityHint: args.cityHint,

    areaLabel: args.cityHint,

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



export async function getWeatherSeverityForCoords(

  lat: number,

  lng: number,

  cityHint?: string | null

): Promise<WeatherSeverity> {

  const ctx = await resolveZoneWeather({ lat, lng, cityHint });

  return ctx.severity;

}



export function applyWeatherToEta(baseEtaMinutes: number, weather: CustomerWeatherContext): WeatherEtaAdjustment {

  const delay = weather.etaDelayMinutes;

  const adjusted = Math.round(baseEtaMinutes + delay);

  return {

    baseEtaMinutes: Math.round(baseEtaMinutes),

    weatherDelayMinutes: delay,

    adjustedEtaMinutes: adjusted,

    includesWeatherImpact: delay > 0,

    impactLabel: weather.etaImpactLabel,

  };

}



/** Background tick — refresh recently active zones. */

export async function runWeatherRefreshTick(log?: { info?: (o: unknown, m?: string) => void }): Promise<{

  refreshed: number;

  skipped: number;

  failed: number;

}> {

  const thresholds = await getWeatherThresholds();

  const staleBefore = new Date(Date.now() - thresholds.refreshIntervalMinutes * 60_000);

  const recent = await listRecentZoneSnapshots(30);



  let refreshed = 0;

  let skipped = 0;

  let failed = 0;



  for (const snap of recent) {

    const updated = new Date(snap.updatedAt);

    if (updated >= staleBefore) {

      skipped++;

      continue;

    }

    const next = await refreshFromOpenWeather({

      lat: snap.latitude,

      lng: snap.longitude,

      cityHint: snap.city,

    });

    if (next) refreshed++;

    else failed++;

  }



  log?.info?.({ refreshed, skipped, failed }, "weather_refresh_tick");

  return { refreshed, skipped, failed };

}


