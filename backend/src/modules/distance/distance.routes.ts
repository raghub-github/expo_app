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
  profile: z.enum(["driving", "bike"]).optional().default("driving"),
  skipCache: z.boolean().optional().default(false),
});

const RouteResponseSchema = z.object({
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  distanceKm: z.number(),
  etaMinutes: z.number(),
  geometry: z.string().optional(),
  fromRoutingEngine: z.boolean(),
});

export async function distanceRoutes(app: any) {
  const { getEnv } = await import("../../config/env.js");
  const env = getEnv();
  const osrmBaseUrl = env.OSRM_BASE_URL ?? "";

  app.post(
    "/route",
    {
      schema: {
        description:
          "Get road distance and ETA between two points. Uses routing engine (OSRM) when configured, else Haversine fallback. Shared by Customer, Rider, and Merchant apps.",
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
        profile,
        osrmBaseUrl: osrmBaseUrl || undefined,
        skipCache: body.skipCache,
      });
      return reply.send(result);
    }
  );
}
