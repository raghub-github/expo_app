import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";

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

/**
 * Public geo resolve — uses DB RPC `geo_resolve_pincode` (see dashboard/drizzle 0172).
 */
export async function geoRoutes(app: FastifyInstance) {
  app.get("/geo/resolve", async (request, reply) => {
    const q = ResolveQuerySchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const sql = getSql();
    const { pincode, service, lat, lng } = q.data;
    try {
      const rows = await sql<[{ geo_resolve_pincode: unknown }]>`
        SELECT geo_resolve_pincode(
          ${pincode.trim()},
          ${service},
          ${lat ?? null},
          ${lng ?? null}
        ) AS geo_resolve_pincode
      `;
      const payload = rows[0]?.geo_resolve_pincode ?? { found: false };
      return reply.send(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "geo_resolve_failed");
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });

  /** Rider payout preview — uses DB RPC `geo_resolve_rider_payout` (dashboard/drizzle 0175). */
  app.get("/geo/rider-payout/resolve", async (request, reply) => {
    const q = RiderPayoutResolveSchema.safeParse(request.query);
    if (!q.success) {
      return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    }
    const sql = getSql();
    const { pincode, service, distanceKm, waitingMin } = q.data;
    try {
      const rows = await sql<[{ geo_resolve_rider_payout: unknown }]>`
        SELECT geo_resolve_rider_payout(
          ${pincode.trim()},
          ${service}::geo_service,
          ${distanceKm},
          ${waitingMin ?? 0}
        ) AS geo_resolve_rider_payout
      `;
      const payload = rows[0]?.geo_resolve_rider_payout ?? null;
      return reply.send(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "resolve_failed";
      request.log.error({ err: e }, "rider_payout_resolve_failed");
      return reply.code(500).send({ error: "resolve_failed", message: msg });
    }
  });
}
