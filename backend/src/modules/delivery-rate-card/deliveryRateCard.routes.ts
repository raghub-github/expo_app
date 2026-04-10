import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { computeDeliveryFee } from "./deliveryRateCard.service.js";

const bodySchema = z.object({
  serviceType: z.enum(["FOOD", "PARCEL", "RIDE", "ALL"]),
  cityName: z.string().optional().nullable(),
  pickup: z.object({ lat: z.number(), lng: z.number() }),
  drop: z.object({ lat: z.number(), lng: z.number() }),
  demandLevel: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME", "UNKNOWN"]).optional(),
  orderValue: z.number().nonnegative().optional(),
});

export async function deliveryRateCardModule(app: FastifyInstance) {
  app.post(
    "/calculate",
    {
      schema: {
        body: bodySchema,
        response: {
          200: z.object({
            distanceKm: z.number(),
            baseFare: z.number(),
            perKmRate: z.number(),
            surgeMultiplier: z.number(),
            zoneMultiplier: z.number(),
            specialDayMultiplier: z.number(),
            demandMultiplier: z.number(),
            totalDeliveryFee: z.number(),
            appliedRateCardId: z.number().nullable(),
            appliedSlabId: z.number().nullable(),
            appliedTimeSlotId: z.number().nullable(),
            appliedZoneId: z.number().nullable(),
            appliedSpecialDayId: z.number().nullable(),
            demandLevel: z.string(),
            debug: z.any(),
            route: z.object({
              distanceKm: z.number(),
              etaMinutes: z.number(),
              source: z.string(),
              cached: z.boolean().optional(),
              approximate: z.boolean().optional(),
              polyline: z.string().optional().nullable(),
            }),
          }),
          400: z.object({ error: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof bodySchema>;
      const env = getEnv();
      const route = await getRoute({
        origin: body.pickup,
        destination: body.drop,
        profile: "driving",
        mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
        osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
      });
      const db = getDb();
      const fee = await computeDeliveryFee(db, {
        serviceType: body.serviceType,
        cityName: body.cityName ?? null,
        pickup: body.pickup,
        drop: body.drop,
        distanceKm: route.distanceKm,
        now: new Date(),
        orderValue: body.orderValue,
        demandLevel: body.demandLevel ?? "UNKNOWN",
      });
      return reply.send({
        ...fee,
        route: {
          distanceKm: route.distanceKm,
          etaMinutes: route.etaMinutes,
          source: route.source,
          cached: route.cached,
          approximate: route.approximate,
          polyline: route.polyline ?? null,
        },
      });
    }
  );
}

