/**
 * Distance API — used by Customer App (and later Rider/Merchant).
 * All distance logic lives in distance.service; apps only request via this API.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getRoute } from "./distance.service.js";
import { resolveStoreDeliveryQuote } from "./storeQuote.service.js";
import type { RoutingProfile } from "./distance.types.js";
import { auth } from "../../plugins/auth.js";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";

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

const StoreQuoteBodySchema = z.object({
  storeId: z.string().min(1),
  addressId: z.coerce.number().int().positive().optional(),
  drop: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      pincode: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
    })
    .optional(),
  actor: z.enum(["customer", "rider"]).optional().default("customer"),
  serviceType: z.enum(["FOOD", "PARCEL", "RIDE"]).optional().default("FOOD"),
  riderWaitingMinutes: z.number().nonnegative().optional(),
  skipCache: z.boolean().optional().default(false),
});

const StoreQuoteResponseSchema = z.object({
  store_id: z.string(),
  actor: z.enum(["customer", "rider"]),
  distance_km: z.number(),
  duration_min: z.number(),
  delivery_fee: z.number(),
  delivery_gst: z.number(),
  final_delivery_fee: z.number(),
  serviceable: z.boolean(),
  unserviceable_reason: z.enum(["out_of_range", "store_inactive"]).nullable().optional(),
  service_radius_km: z.number(),
  source: z.enum(["mapbox", "osrm", "haversine"]),
  cached: z.boolean(),
  approximate: z.boolean(),
  pricing_engine: z.enum(["slab_geo", "fallback_per_km"]),
  slab_quote: z.any().optional().nullable(),
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

  app.post(
    "/store-quote",
    {
      schema: {
        description:
          "Canonical store delivery quote: single source of truth for distance_km, duration_min, delivery_fee, delivery_gst, final_delivery_fee, serviceable. Used by home list, store details, cart, checkout, order details and tracking so every page shows the SAME numbers.",
        body: StoreQuoteBodySchema,
        response: {
          200: StoreQuoteResponseSchema,
          400: z.object({ error: z.string(), message: z.string().optional() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (request: any, reply: any) => {
      const body = StoreQuoteBodySchema.parse(request.body);

      // addressId requires authenticated customer; coords-only mode is open (e.g. guest home list).
      let customerId: number | null = null;
      if (body.addressId != null) {
        const sub = request.auth?.sub;
        if (!sub || request.auth?.role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }
        const db = getDb();
        const [row] = await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.customerId, sub))
          .limit(1);
        if (!row?.id) return reply.status(403).send({ error: "Customer not found" });
        customerId = Number(row.id);
      } else if (!body.drop) {
        return reply
          .status(400)
          .send({ error: "INVALID_INPUT", message: "addressId or drop {lat,lng} required." });
      }

      const result = await resolveStoreDeliveryQuote({
        storeId: body.storeId,
        customerId,
        addressId: body.addressId ?? null,
        drop: body.drop ?? null,
        actor: body.actor,
        serviceType: body.serviceType,
        riderWaitingMinutes: body.riderWaitingMinutes,
        skipCache: body.skipCache,
      });
      if (!result.ok) {
        return reply.status(400).send({ error: result.code, message: result.message });
      }
      return reply.send(result.quote);
    }
  );
}

/** Distance module with optional auth so /route and /calculate remain public while /store-quote can read req.auth. */
export async function distanceModule(app: any) {
  await app.register(auth, { required: false });
  await app.register(distanceRoutes);
}
