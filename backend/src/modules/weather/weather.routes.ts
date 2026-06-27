import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { resolveMerchantZoneWeather, resolveZoneWeather } from "./weather.service.js";
import { sanitizeLocationHint } from "./weather.sanitize.js";
import { getWeatherThresholds, invalidateWeatherConfigCache } from "./weather.config.js";
import { getEnv } from "../../config/env.js";
import { countSnapshots } from "./weather.repository.js";
import { getWeatherMonitoringSnapshot } from "./weather.monitoring.js";
import { getWeatherStatus, listActiveWeatherAlerts, getWeatherHistory } from "./weather.cache.js";
import { refreshZoneWeatherFromProvider, ingestRainWeatherEvent } from "./weather.service.js";
import { listActiveZoneSummaries } from "./weather.zones-active.js";
import { handleZonePresenceJoin, handleZonePresenceLeave } from "./weather.presence.js";

const RainEventBodySchema = z.object({
  event: z.enum(["rain_started", "rain_intensity_changed", "rain_stopped"]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  cityHint: z.string().max(120).optional(),
  areaLabel: z.string().max(200).optional(),
  rainIntensityMm: z.coerce.number().min(0).max(500).optional(),
});

const LocationQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  city: z.string().max(120).optional(),
  area: z.string().max(200).optional(),
});

const WeatherContextResponseSchema = z.object({
  severity: z.enum(["CLEAR", "LIGHT_RAIN", "MODERATE_RAIN", "HEAVY_RAIN", "EXTREME_WEATHER"]),
  rainDetected: z.boolean(),
  rainIntensityMm: z.number(),
  temperatureC: z.number().nullable(),
  humidityPct: z.number().nullable(),
  windSpeedKmh: z.number().nullable(),
  weatherCondition: z.string(),
  city: z.string().nullable(),
  zone: z.string().nullable(),
  areaLabel: z.string().nullable(),
  chipLabel: z.string().nullable(),
  bannerTitle: z.string().nullable(),
  bannerSubtitle: z.string().nullable(),
  showChip: z.boolean(),
  showBanner: z.boolean(),
  etaDelayMinutes: z.number(),
  etaImpactLabel: z.string().nullable(),
  trackingMessage: z.string().nullable(),
  updatedAt: z.string().nullable(),
  zoneKey: z.string().nullable(),
  details: z
    .object({
      feelsLikeC: z.number().nullable(),
      pressureHpa: z.number().nullable(),
      visibilityKm: z.number().nullable(),
      cloudCoverPct: z.number().nullable(),
      windGustKmh: z.number().nullable(),
      weatherId: z.number().nullable(),
      weatherMain: z.string().nullable(),
      weatherDescription: z.string().nullable(),
      sunriseAt: z.string().nullable(),
      sunsetAt: z.string().nullable(),
      rainfallMm1h: z.number().nullable(),
      uvIndex: z.number().nullable(),
      aqi: z.number().nullable(),
      aqiLabel: z.string().nullable(),
    })
    .nullable(),
  futureHooks: z.object({
    surgeEligible: z.boolean(),
    weatherPriorityBoost: z.boolean(),
    weatherDispatchWeight: z.number(),
    dispatchPriorityBoost: z.number(),
    zoneAlertActive: z.boolean(),
  }),
});

const MerchantWeatherResponseSchema = z.object({
  severity: z.enum(["CLEAR", "LIGHT_RAIN", "MODERATE_RAIN", "HEAVY_RAIN", "EXTREME_WEATHER"]),
  weatherCondition: z.string(),
  zoneName: z.string().nullable(),
  city: z.string().nullable(),
  chipLabel: z.string().nullable(),
  bannerTitle: z.string().nullable(),
  bannerSubtitle: z.string().nullable(),
  showBanner: z.boolean(),
  etaDelayMinutes: z.number(),
  updatedAt: z.string().nullable(),
  futureHooks: WeatherContextResponseSchema.shape.futureHooks,
});

export async function weatherRoutes(app: FastifyInstance) {
  await app.register(auth, { required: false });

  app.get(
    "/location",
    {
      schema: {
        querystring: LocationQuerySchema,
        response: {
          200: WeatherContextResponseSchema,
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const q = LocationQuerySchema.parse(request.query);
      const ctx = await resolveZoneWeather({
        lat: q.lat,
        lng: q.lng,
        cityHint: sanitizeLocationHint(q.city) ?? undefined,
        areaLabel: sanitizeLocationHint(q.area) ?? sanitizeLocationHint(q.city) ?? undefined,
        trigger: "customer_home",
        actorId: request.auth?.sub ?? undefined,
        actorType: request.auth?.sub ? "customer" : undefined,
      });
      return reply.send(ctx);
    }
  );

  app.get(
    "/merchant",
    {
      schema: {
        querystring: LocationQuerySchema,
        response: {
          200: MerchantWeatherResponseSchema,
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (request, reply) => {
      const q = LocationQuerySchema.parse(request.query);
      const ctx = await resolveMerchantZoneWeather({
        lat: q.lat,
        lng: q.lng,
        cityHint: q.city,
        actorId: request.auth?.sub ?? undefined,
      });
      return reply.send(ctx);
    }
  );

  app.get(
    "/eta-adjustment",
    {
      schema: {
        querystring: LocationQuerySchema.extend({
          baseEtaMinutes: z.coerce.number().positive().max(240),
        }),
        response: {
          200: z.object({
            weather: WeatherContextResponseSchema,
            baseEtaMinutes: z.number(),
            weatherDelayMinutes: z.number(),
            adjustedEtaMinutes: z.number(),
            includesWeatherImpact: z.boolean(),
            impactLabel: z.string().nullable(),
          }),
        },
      },
    },
    async (request, reply) => {
      const q = LocationQuerySchema.extend({
        baseEtaMinutes: z.coerce.number().positive().max(240),
      }).parse(request.query);
      const weather = await resolveZoneWeather({
        lat: q.lat,
        lng: q.lng,
        cityHint: q.city,
        areaLabel: q.area ?? q.city,
        trigger: "eta_calculation",
      });
      const adjusted = Math.round(q.baseEtaMinutes + weather.etaDelayMinutes);
      return reply.send({
        weather,
        baseEtaMinutes: Math.round(q.baseEtaMinutes),
        weatherDelayMinutes: weather.etaDelayMinutes,
        adjustedEtaMinutes: adjusted,
        includesWeatherImpact: weather.etaDelayMinutes > 0,
        impactLabel: weather.etaImpactLabel,
      });
    }
  );

  /** v2 — current weather (Open-Meteo). */
  app.get("/current", async (request, reply) => {
    const q = LocationQuerySchema.parse(request.query);
    const ctx = await resolveZoneWeather({
      lat: q.lat,
      lng: q.lng,
      cityHint: sanitizeLocationHint(q.city) ?? undefined,
      areaLabel: sanitizeLocationHint(q.area) ?? sanitizeLocationHint(q.city) ?? undefined,
      trigger: "customer_home",
      actorId: request.auth?.sub ?? undefined,
      actorType: request.auth?.sub ? "customer" : undefined,
    });
    return reply.send(ctx);
  });

  app.get("/history", async (request, reply) => {
    const q = LocationQuerySchema.extend({
      hours: z.coerce.number().int().min(1).max(720).default(24),
      zoneKey: z.string().max(64).optional(),
    }).parse(request.query);
    const { buildZoneKey } = await import("./weather.classify.js");
    const zoneKey =
      q.zoneKey ??
      buildZoneKey(q.lat, q.lng, q.city ?? "Unknown", null).zoneKey;
    const rows = await getWeatherHistory(zoneKey, q.hours);
    return reply.send({ ok: true, zoneKey, rows });
  });

  app.get("/alerts", async (request, reply) => {
    const zoneKey = (request.query as { zoneKey?: string }).zoneKey;
    const rows = await listActiveWeatherAlerts(zoneKey?.trim() || undefined);
    return reply.send({ ok: true, alerts: rows });
  });

  app.get("/zones", async (_request, reply) => {
    const zones = listActiveZoneSummaries();
    return reply.send({ ok: true, zones, mode: "event_driven" });
  });

  app.get("/status", async (_request, reply) => {
    const status = await getWeatherStatus();
    return reply.send({ ok: true, ...status });
  });

  app.post(
    "/refresh",
    {
      config: { rateLimit: { max: 12, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const q = LocationQuerySchema.parse(request.body ?? request.query);
      const result = await refreshZoneWeatherFromProvider({
        lat: q.lat,
        lng: q.lng,
        cityHint: q.city,
        areaLabel: q.area ?? q.city,
        forceRefresh: true,
        trigger: "manual_refresh",
      });
      if (!result.after) return reply.status(502).send({ error: "weather_refresh_failed" });
      return reply.send({ ok: true, published: result.publishedEvent != null, zoneKey: result.after.zoneKey });
    }
  );
}

/** Internal admin — threshold read/update (dashboard / ops). */
export async function weatherInternalRoutes(app: FastifyInstance) {
  app.get("/weather/health", async (_req, reply) => {
    const token = getEnv().INTERNAL_API_TOKEN;
    const header = String(_req.headers["x-internal-token"] ?? "");
    if (!token || header !== token) return reply.status(401).send({ error: "unauthorized" });

    const zoneCount = await countSnapshots().catch(() => null);
    return reply.send(
      getWeatherMonitoringSnapshot({
        zoneSnapshotCount: zoneCount ?? undefined,
        provider: "open-meteo",
      })
    );
  });

  app.get("/weather/config", async (_req, reply) => {
    const token = getEnv().INTERNAL_API_TOKEN;
    if (!token) return reply.status(503).send({ error: "not_configured" });
    const thresholds = await getWeatherThresholds();
    return reply.send({ ok: true, thresholds });
  });

  app.patch<{ Body: Record<string, number> }>("/weather/config", async (req, reply) => {
    const token = getEnv().INTERNAL_API_TOKEN;
    const header = String(req.headers["x-internal-token"] ?? "");
    if (!token || header !== token) return reply.status(401).send({ error: "unauthorized" });

    const body = (req.body ?? {}) as Record<string, number>;
    const { getSql } = await import("../../db/client.js");
    const sql = getSql();

    const keyMap: Record<string, string> = {
      lightRainThresholdMm: "weather.light_rain_threshold_mm",
      moderateRainThresholdMm: "weather.moderate_rain_threshold_mm",
      heavyRainThresholdMm: "weather.heavy_rain_threshold_mm",
      extremeRainThresholdMm: "weather.extreme_rain_threshold_mm",
      extremeWindSpeedKmh: "weather.extreme_wind_speed_kmh",
      cacheTtlMinutes: "weather.cache_ttl_minutes",
      refreshIntervalMinutes: "weather.refresh_interval_minutes",
      etaDelayLightMinutes: "weather.eta_delay_light_minutes",
      etaDelayModerateMinutes: "weather.eta_delay_moderate_minutes",
      etaDelayHeavyMinutes: "weather.eta_delay_heavy_minutes",
      etaDelayExtremeMinutes: "weather.eta_delay_extreme_minutes",
    };

    for (const [k, configKey] of Object.entries(keyMap)) {
      if (body[k] == null) continue;
      await sql`
        UPDATE system_config
        SET config_value = ${String(body[k])}, updated_at = NOW()
        WHERE config_key = ${configKey}
      `;
    }

    invalidateWeatherConfigCache();
    const thresholds = await getWeatherThresholds();
    return reply.send({ ok: true, thresholds });
  });

  /**
   * Rain alert ingest — triggers Open-Meteo verification fetch and WebSocket fan-out when changed.
   */
  app.post("/weather/rain-events", async (req, reply) => {
    const token = getEnv().INTERNAL_API_TOKEN;
    const header = String(req.headers["x-internal-token"] ?? "");
    if (!token || header !== token) return reply.status(401).send({ error: "unauthorized" });

    const parsed = RainEventBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_body", details: parsed.error.flatten() });
    }

    try {
      const result = await ingestRainWeatherEvent(parsed.data);
      return reply.send(result);
    } catch {
      return reply.status(502).send({ error: "weather_refresh_failed" });
    }
  });

  /** ws-gateway zone presence — join/leave for active zone tracking. */
  app.post("/weather/zone-presence", async (req, reply) => {
    const token = getEnv().INTERNAL_API_TOKEN;
    const header = String(req.headers["x-internal-token"] ?? "");
    if (!token || header !== token) return reply.status(401).send({ error: "unauthorized" });

    const body = z
      .object({
        action: z.enum(["join", "leave"]),
        zoneKey: z.string().min(4).max(64),
        actorId: z.string().min(1).max(128),
        actorType: z.enum(["customer", "rider", "merchant", "order"]).optional(),
        role: z.string().max(32).optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      return reply.status(400).send({ error: "invalid_body", details: body.error.flatten() });
    }

    if (body.data.action === "join") {
      await handleZonePresenceJoin(body.data);
    } else {
      handleZonePresenceLeave(body.data);
    }
    return reply.send({ ok: true });
  });
}
