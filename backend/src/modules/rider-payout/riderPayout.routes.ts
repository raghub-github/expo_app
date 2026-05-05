import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { loadEffectiveDeliveryRateSlabs } from "../delivery-slab-pricing/deliverySlabPricing.repository.js";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";

const calculateBodySchema = z.object({
  serviceType: z.enum(["food", "parcel", "person_ride"]),
  geoLevel: z.enum(["state", "region", "district", "division", "post_office", "pincode"]),
  geoRefId: z.string().uuid(),
  pickupLat: z.number(),
  pickupLon: z.number(),
  dropLat: z.number(),
  dropLon: z.number(),
  waitingMinutes: z.number().nonnegative().optional().default(0),
});

export async function riderPayoutRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post(
    "/calculate",
    {
      schema: {
        body: calculateBodySchema,
        response: {
          200: z.object({
            distanceKm: z.number(),
            routingSource: z.enum(["mapbox", "osrm", "haversine"]),
            routingApproximate: z.boolean(),
            routeCached: z.boolean(),
            payoutAmount: z.number(),
            quote: z.any(),
          }),
          400: z.object({ error: z.string(), message: z.string() }),
          403: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      if (!req.auth?.sub || req.auth.role !== "rider") {
        return reply.status(403).send({ error: "RIDER_ONLY", message: "Rider only" });
      }

      const body = req.body as z.infer<typeof calculateBodySchema>;
      const db = getDb();
      const env = getEnv();

      const route = await getRoute({
        origin: { lat: body.pickupLat, lng: body.pickupLon },
        destination: { lat: body.dropLat, lng: body.dropLon },
        profile: "driving",
        mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
        osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
      });

      const slabs = await loadEffectiveDeliveryRateSlabs(db, {
        geoLevel: body.geoLevel,
        geoRefId: body.geoRefId,
        serviceType: body.serviceType,
        actorType: "rider",
      });

      const calc = calculateProgressiveSlabAmount({
        distanceKm: route.distanceKm,
        slabs,
        waitingMinutes: body.waitingMinutes,
        applyRiderExtras: true,
      });
      if (!calc.ok) {
        return reply.status(400).send({ error: calc.code, message: calc.message });
      }

      return reply.send({
        distanceKm: route.distanceKm,
        routingSource: route.source,
        routingApproximate: route.approximate,
        routeCached: route.cached,
        payoutAmount: calc.quote.finalAmount,
        quote: calc.quote,
      });
    }
  );
}

