import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql, withSqlRetry, isDbConnectionError } from "../../db/client.js";
import { isTransientDbError, hasTransientDbCause } from "../../lib/db/is-transient-db-error.js";
import { resolveGeoServiceAvailability } from "./geoServiceAvailability.service.js";
import { resolveFoodHomeLayout } from "../cxapp-home/cxappFoodHomeLayout.service.js";
import { resolveGroceryHomeLayout } from "../cxapp-home/cxappGroceryHomeLayout.service.js";

const ResolveQuerySchema = z.object({
  pincode: z.string().min(3).max(12),
  service: z.enum(["food", "parcel", "ride"]),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const RiderPayoutResolveSchema = z.object({
  pincode: z.string().min(3).max(12),
  service: z.enum(["food", "parcel", "ride"]),
  distanceKm: z.coerce.number().min(0),
  waitingMin: z.coerce.number().min(0).optional(),
});

const ServicesQuerySchema = z.object({
  pincode: z.string().min(3).max(12).optional(),
  state: z.string().min(2).max(80).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const DispatchServiceabilityQuerySchema = z.object({
  service: z.enum(["food", "parcel", "ride", "person_ride"]),
  fulfillment: z.enum(["self_pickup", "delivery"]).default("delivery"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  pincode: z.string().min(3).max(12).optional(),
  state: z.string().min(2).max(80).optional(),
  merchantStoreId: z.string().min(1).max(80).optional(),
});

/**
 * Public geo resolve — uses DB RPC `geo_resolve_pincode` (see dashboard/drizzle 0172).
 */
export async function geoRoutes(app: FastifyInstance) {
  app.get("/geo/resolve", async (request, reply) => {
    const q = ResolveQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { pincode, service, lat, lng } = q.data;
    try {
      const rows = await withSqlRetry(async () => {
        const sql = getSql();
        return sql<[{ geo_resolve_pincode: unknown }]>`
        SELECT geo_resolve_pincode(
          ${pincode.trim()},
          ${service},
          ${lat ?? null},
          ${lng ?? null}
        ) AS geo_resolve_pincode
      `;
      });
      const payload = rows[0]?.geo_resolve_pincode ?? { found: false };
      return reply.send(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "geo_resolve_failed");
      const transient =
        isDbConnectionError(e) || isTransientDbError(e) || hasTransientDbCause(e);
      if (transient) {
        return reply.code(503).send({
          error: "database_unavailable",
          message: "Database is busy. Please try again in a moment.",
        });
      }
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });

  /** Customer food home — per-state active CXApp Home layout variant. */
  app.get("/geo/food-home-layout", async (request, reply) => {
    const q = ServicesQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { pincode, state, lat, lng } = q.data;
    if (!pincode && !state && (lat == null || lng == null)) {
      return reply.code(400).send({
        error: "missing_location",
        message: "Provide pincode, state, or lat+lng",
      });
    }
    try {
      const result = await withSqlRetry(() => resolveFoodHomeLayout({ pincode, state, lat, lng }));
      void reply.header("Cache-Control", "private, max-age=0, must-revalidate");
      return reply.send({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "food_home_layout_resolve_failed");
      const transient =
        isDbConnectionError(e) || isTransientDbError(e) || hasTransientDbCause(e);
      if (transient) {
        return reply.code(503).send({
          error: "database_unavailable",
          message: "Database is busy. Please try again in a moment.",
        });
      }
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });

  /** Customer grocery home — per-state CXApp Home layout + hero media. */
  app.get("/geo/grocery-home-layout", async (request, reply) => {
    const q = ServicesQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { pincode, state, lat, lng } = q.data;
    if (!pincode && !state && (lat == null || lng == null)) {
      return reply.code(400).send({
        error: "missing_location",
        message: "Provide pincode, state, or lat+lng",
      });
    }
    try {
      const result = await withSqlRetry(() => resolveGroceryHomeLayout({ pincode, state, lat, lng }));
      void reply.header("Cache-Control", "private, max-age=0, must-revalidate");
      return reply.send({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "grocery_home_layout_resolve_failed");
      const transient =
        isDbConnectionError(e) || isTransientDbError(e) || hasTransientDbCause(e);
      if (transient) {
        return reply.code(503).send({
          error: "database_unavailable",
          message: "Database is busy. Please try again in a moment.",
        });
      }
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });

  /** Customer home — FOOD / PARCEL / RIDE toggles from Geo & coverage. */
  app.get("/geo/services", async (request, reply) => {
    const q = ServicesQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { pincode, state, lat, lng } = q.data;
    if (!pincode && !state && (lat == null || lng == null)) {
      return reply.code(400).send({
        error: "missing_location",
        message: "Provide pincode, state, or lat+lng",
      });
    }
    try {
      const result = await withSqlRetry(() =>
        resolveGeoServiceAvailability({
          pincode,
          state,
          lat,
          lng,
        })
      );
      return reply.send({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "geo_services_resolve_failed");
      const transient =
        isDbConnectionError(e) || isTransientDbError(e) || hasTransientDbCause(e);
      if (transient) {
        return reply.code(503).send({
          error: "database_unavailable",
          message: "Database is busy. Please try again in a moment.",
        });
      }
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });

  /**
   * Pre-placement serviceability — can the customer place this order here?
   * Self-pickup skips the rider check; delivery requires an available internal rider
   * within the service radius, or 3PL enabled for the location.
   */
  app.get("/geo/dispatch-serviceability", async (request, reply) => {
    const q = DispatchServiceabilityQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { service, fulfillment, lat, lng, pincode, state, merchantStoreId } = q.data;
    const serviceType = service === "ride" ? "person_ride" : service;
    try {
      const { checkDispatchServiceability } = await import(
        "../../lib/dispatch-serviceability.js"
      );
      const result = await checkDispatchServiceability({
        serviceType,
        fulfillment,
        pickup: { lat, lng, pincode, state, merchantStoreId },
      });
      return reply.send({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "serviceability_failed";
      request.log.error({ err: e }, "dispatch_serviceability_failed");
      return reply.code(500).send({ error: "serviceability_failed", message: msg });
    }
  });

  /** Rider payout preview — uses DB RPC `geo_resolve_rider_payout` (dashboard/drizzle 0175). */
  app.get("/geo/rider-payout/resolve", async (request, reply) => {
    const q = RiderPayoutResolveSchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const { pincode, service, distanceKm, waitingMin } = q.data;
    try {
      const rows = await withSqlRetry(async () => {
        const sql = getSql();
        return sql<[{ geo_resolve_rider_payout: unknown }]>`
        SELECT geo_resolve_rider_payout(
          ${pincode.trim()},
          ${service}::geo_service,
          ${distanceKm},
          ${waitingMin ?? 0}
        ) AS geo_resolve_rider_payout
      `;
      });
      const payload = rows[0]?.geo_resolve_rider_payout ?? null;
      return reply.send(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "rider_payout_resolve_failed");
      const transient =
        isDbConnectionError(e) || isTransientDbError(e) || hasTransientDbCause(e);
      if (transient) {
        return reply.code(503).send({
          error: "database_unavailable",
          message: "Database is busy. Please try again in a moment.",
        });
      }
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });
}
