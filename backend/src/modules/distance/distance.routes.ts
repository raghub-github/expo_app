/**
 * Distance API — used by Customer App (and later Rider/Merchant).
 * All distance logic lives in distance.service; apps only request via this API.
 */

import { z } from "zod";
import { getRoute } from "./distance.service.js";
import type { RoutingProfile } from "./distance.types.js";

const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const RouteBodySchema = z.object({
  origin: LatLngSchema,
  destination: LatLngSchema,
  waypoints: z.array(LatLngSchema).optional().default([]),
  profile: z.enum(["driving", "bike"]).optional().default("driving"),
  skipCache: z.boolean().optional().default(false),
});

const RouteResponseSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  distanceKm: z.number(),
  etaMinutes: z.number(),
  geometry: z.string().optional(),
  polyline: z.string().optional(),
  source: z.enum(["mapbox", "osrm", "haversine"]),
  cached: z.boolean(),
  approximate: z.boolean(),
  fromRoutingEngine: z.boolean(),
});

const CalculateBodySchema = z.object({
  pickup: LatLngSchema,
  drop: LatLngSchema,
  waypoints: z.array(LatLngSchema).optional().default([]),
  mode: z.enum(["driving", "bike"]).optional().default("driving"),
  skipCache: z.boolean().optional().default(false),
});

const CalculateResponseSchema = z.object({
  distance_km: z.number(),
  duration_min: z.number(),
  polyline: z.string().optional(),
  source: z.enum(["mapbox", "osrm", "haversine"]),
  cached: z.boolean(),
  approximate: z.boolean(),
});

export async function distanceRoutes(app: any) {
  const { getEnv } = await import("../../config/env.js");
  const env = getEnv();
  const osrmBaseUrl = env.OSRM_BASE_URL ?? "";
  const mapboxToken = env.MAPBOX_ACCESS_TOKEN ?? "";

  app.post(
    "/route",
    {
      schema: {
        description:
          "Get route distance and ETA. Uses Mapbox first, then OSRM fallback, then Haversine approximation.",
        body: RouteBodySchema,
        response: {
          200: RouteResponseSchema,
          400: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (request: any, reply: any) => {
      const body = RouteBodySchema.parse(request.body);
      const profile = (body.profile ?? "driving") as RoutingProfile;
      const result = await getRoute({
        origin: body.origin,
        destination: body.destination,
        waypoints: body.waypoints,
        profile,
        mapboxToken: mapboxToken || undefined,
        osrmBaseUrl: osrmBaseUrl || undefined,
        skipCache: body.skipCache,
      });
      return reply.send(result);
    }
  );

  app.post(
    "/calculate",
    {
      schema: {
        description:
          "Canonical distance API for all clients. Route wise distance with provider fallback and cache metadata.",
        body: CalculateBodySchema,
        response: {
          200: CalculateResponseSchema,
          400: z.object({ error: z.string(), message: z.string().optional() }),
        },
      },
    },
    async (request: any, reply: any) => {
      const body = CalculateBodySchema.parse(request.body);
      const mode = (body.mode ?? "driving") as RoutingProfile;
      const result = await getRoute({
        origin: body.pickup,
        destination: body.drop,
        waypoints: body.waypoints,
        profile: mode,
        mapboxToken: mapboxToken || undefined,
        osrmBaseUrl: osrmBaseUrl || undefined,
        skipCache: body.skipCache,
      });
      return reply.send({
        distance_km: result.distanceKm,
        duration_min: result.etaMinutes,
        polyline: result.polyline ?? result.geometry,
        source: result.source,
        cached: result.cached,
        approximate: result.approximate,
      });
    }
  );
}
