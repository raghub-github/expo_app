import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { resolveMerchantZoneWeather, resolveZoneWeather } from "./weather.service.js";
import { sanitizeLocationHint } from "./weather.sanitize.js";
import { getWeatherThresholds, invalidateWeatherConfigCache } from "./weather.config.js";
import { getEnv } from "../../config/env.js";
import { countSnapshots } from "./weather.repository.js";
import { getWeatherMonitoringSnapshot } from "./weather.monitoring.js";

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
        zoneSnapshotCount: zoneCount,
        apiKeyConfigured: Boolean(getEnv().OPENWEATHER_API_KEY),
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
}
