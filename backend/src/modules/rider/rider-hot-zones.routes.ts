import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSql } from "../../db/client.js";
import { computeHotZonesForRider } from "../../lib/hot-zones/hot-zone.service.js";
import { computeRiderEligibleDispatchServices } from "../../lib/order-assignment-engine.js";

function parseRiderIdFromAuth(sub: string): number | null {
  const match = sub.match(/usr_(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/**
 * GET /v1/rider/hot-zones?lat=&lng=
 *
 * Backend-authoritative hot zones for the rider's H3 neighbourhood. The rider app never
 * computes hotness — it renders what this returns (Part 32/57). Service/vehicle filtering
 * uses `computeRiderEligibleDispatchServices` (the SAME resolver dispatch uses: enabled
 * duty services ∩ vehicle-eligible ∩ unrestricted), so an off-duty or service-disabled
 * rider simply gets no zones for that service — never a client-side filter (Part 37/38).
 */
export function registerRiderHotZonesRoutes(app: FastifyInstance) {
  app.get("/hot-zones", async (req, reply) => {
    const riderId = parseRiderIdFromAuth(req.auth!.sub);
    if (riderId == null) {
      return reply.code(403).send({ success: false, error: "rider_not_found" });
    }
    const q = querySchema.safeParse(req.query ?? {});
    if (!q.success) {
      return reply.code(400).send({ success: false, error: "invalid_query" });
    }
    try {
      const eligible = (await computeRiderEligibleDispatchServices(riderId)) ?? [];
      if (eligible.length === 0) {
        // Off duty / no eligible service — nothing to show (matches app gating on ON-duty).
        return reply.send({ success: true, zones: [], services: [], resolution: null, validUntilSeconds: 0 });
      }
      const { zones, config } = await computeHotZonesForRider({
        riderLat: q.data.lat,
        riderLng: q.data.lng,
        services: eligible,
        sql: getSql(),
      });
      return reply.send({
        success: true,
        zones,
        services: eligible,
        resolution: config.h3Resolution,
        validUntilSeconds: config.validitySeconds,
      });
    } catch (err) {
      app.log.error({ err }, "GET /rider/hot-zones failed");
      return reply.code(500).send({ success: false, error: "failed_to_load_hot_zones" });
    }
  });
}
