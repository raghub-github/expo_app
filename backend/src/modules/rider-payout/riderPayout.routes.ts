import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/client.js";
import { auth } from "../../plugins/auth.js";
import { getEnv } from "../../config/env.js";
import { getRoute } from "../distance/distance.service.js";
import { resolveRiderPayoutQuote } from "../rider-payout-pricing/resolveRiderPayoutQuote.js";
import type { RideVehiclePricingType } from "../rider-payout-pricing/types.js";
import { loadEffectiveDeliveryRateSlabs } from "../delivery-slab-pricing/deliverySlabPricing.repository.js";
import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryServiceType } from "../delivery-slab-pricing/types.js";

const vehicleTypeSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]);

const calculateBodySchema = z.object({
  serviceType: z.enum(["food", "parcel", "person_ride", "ride"]),
  geoLevel: z.enum(["state", "region", "district", "division", "post_office", "pincode"]),
  geoRefId: z.string().uuid(),
  /** Explicit pickup/drop km (preferred). */
  pickupKm: z.number().nonnegative().optional(),
  dropKm: z.number().nonnegative().optional(),
  /** Legacy: single route from pickup→drop coords. */
  pickupLat: z.number().optional(),
  pickupLon: z.number().optional(),
  dropLat: z.number().optional(),
  dropLon: z.number().optional(),
  waitingMinutes: z.number().nonnegative().optional().default(0),
  vehicleType: vehicleTypeSchema.optional(),
});

function mapService(raw: string): "food" | "parcel" | "ride" {
  if (raw === "parcel") return "parcel";
  if (raw === "person_ride" || raw === "ride") return "ride";
  return "food";
}

function toDeliveryServiceType(service: "food" | "parcel" | "ride"): DeliveryServiceType {
  return service === "ride" ? ("person_ride" as DeliveryServiceType) : service;
}

export async function riderPayoutRoutes(app: FastifyInstance) {
  await app.register(auth, { required: true });

  app.post(
    "/calculate",
    {
      schema: {
        body: calculateBodySchema,
        response: {
          200: z.object({
            pickupKm: z.number(),
            dropKm: z.number(),
            distanceKm: z.number(),
            routingSource: z.enum(["mapbox", "osrm", "haversine"]).optional(),
            routingApproximate: z.boolean().optional(),
            routeCached: z.boolean().optional(),
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
      const riderId = Number(req.auth.sub);

      let pickupKm = body.pickupKm ?? 0;
      let dropKm = body.dropKm ?? 0;
      let routingSource: "mapbox" | "osrm" | "haversine" | undefined;
      let routingApproximate: boolean | undefined;
      let routeCached: boolean | undefined;

      if (
        body.pickupKm == null &&
        body.dropKm == null &&
        body.pickupLat != null &&
        body.pickupLon != null &&
        body.dropLat != null &&
        body.dropLon != null
      ) {
        const route = await getRoute({
          origin: { lat: body.pickupLat, lng: body.pickupLon },
          destination: { lat: body.dropLat, lng: body.dropLon },
          profile: "driving",
          mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
          osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
        });
        dropKm = route.distanceKm;
        routingSource = route.source;
        routingApproximate = route.approximate;
        routeCached = route.cached;
      }

      const service = mapService(body.serviceType);

      // Rider Fare Engine v3.0: rider payout is a percentage of the customer
      // fare. This endpoint has no specific order, so estimate the customer
      // fare from the customer delivery-slab engine for the same geo/distance.
      const customerSlabs = await loadEffectiveDeliveryRateSlabs(db, {
        geoLevel: body.geoLevel,
        geoRefId: body.geoRefId,
        serviceType: toDeliveryServiceType(service),
        actorType: "customer",
      });
      const customerCalc =
        customerSlabs.length > 0
          ? calculateProgressiveSlabAmount({
              distanceKm: pickupKm + dropKm,
              slabs: customerSlabs,
              waitingMinutes: 0,
              applyRiderExtras: false,
            })
          : null;
      const customerFare = customerCalc?.ok ? customerCalc.quote.finalAmount : 0;

      if (customerFare <= 0) {
        return reply.status(400).send({
          error: "NO_CUSTOMER_FARE",
          message: "Could not estimate a customer fare for this route",
        });
      }

      const calc = await resolveRiderPayoutQuote({
        level: body.geoLevel,
        refId: body.geoRefId,
        service,
        customerFare,
        pickupKm,
        dropKm,
        waitingMinutes: body.waitingMinutes,
        riderId,
        vehicleType: (body.vehicleType ?? null) as RideVehiclePricingType | null,
      });

      if (!calc.ok) {
        return reply.status(400).send({ error: calc.code, message: calc.message });
      }

      return reply.send({
        pickupKm: calc.quote.pickupKm,
        dropKm: calc.quote.dropKm,
        distanceKm: calc.quote.pickupKm + calc.quote.dropKm,
        routingSource,
        routingApproximate,
        routeCached,
        payoutAmount: calc.quote.finalAmount,
        quote: calc.quote,
      });
    }
  );
}
