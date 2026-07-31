import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import {
  cancelRideOrder,
  DEFAULT_RIDE_SEARCH_TIMEOUT_SEC,
  getRideOrderForCustomer,
  placeRideOrder,
  resolveCustomerPkFromSub,
} from "./ride.placement.service.js";
import {
  extendRideSearch,
  markRideSearchWindowEnded,
} from "./ride.tip-boost.service.js";
import { getNearbyRideSupply } from "./ride.availability.service.js";
import { quoteCustomerRideFare, quoteCustomerRideFareBatch } from "../ride-state-config/rideQuote.service.js";
import { getDb } from "../../db/client.js";
import { computeBillForRide, resolveRideBillingGeo } from "../billing/rideBilling.service.js";
import { buildRideComponentBreakdown } from "./pricing/rideFareComponents.js";

const rideStopSchema = z.object({
  sequence: z.number().int().min(1).max(2),
  address: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const placeRideBodySchema = z.object({
  pickupAddress: z.string().min(1),
  pickupLabel: z.string().optional().nullable(),
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropAddress: z.string().min(1),
  dropLabel: z.string().optional().nullable(),
  dropLat: z.number(),
  dropLng: z.number(),
  intermediateStops: z.array(rideStopSchema).max(2).optional(),
  rideType: z.string().min(1),
  vehicleTypeRequired: z.string().optional(),
  estimatedFare: z.number().nonnegative(),
  tripKm: z.number().nonnegative().optional(),
  paymentMethod: z
    .enum(["cash", "cod", "upi", "card", "wallet", "online"])
    .optional()
    .default("cash"),
  bookedForSelf: z.boolean().optional().default(true),
  passengerName: z.string().optional().nullable(),
  passengerPhone: z.string().optional().nullable(),
  pickupDistanceFromBookerKm: z.number().optional().nullable(),
  farPickupPromptShown: z.boolean().optional(),
  farPickupAcknowledged: z.boolean().optional(),
  searchTimeoutSec: z.number().int().min(60).max(600).optional(),
  customerTipAmount: z.number().int().min(0).optional().default(0),
  pickupPincode: z.string().optional().nullable(),
  pickupState: z.string().optional().nullable(),
});

const cancelRideBodySchema = z.object({
  reasonCode: z.string().optional(),
  reasonText: z.string().optional().nullable(),
  cancelMode: z.enum(["manual", "auto", "timeout"]).optional().default("manual"),
});

const extendSearchBodySchema = z.object({
  tipAmount: z.number().int().min(0).optional(),
});

const extendSearchResponseSchema = z.object({
  orderId: z.string(),
  searchExpiresAt: z.string(),
  searchExtendedUntil: z.string(),
  dispatchRetryCount: z.number(),
  customerTipAmount: z.number(),
  prebookTipAmount: z.number(),
  searchBoostTip1: z.number(),
  searchBoostTip2: z.number(),
  tipBoostApplied: z.boolean(),
  higherDispatchPriority: z.boolean(),
  extensionSec: z.number(),
});

const availabilityQuerySchema = z.object({
  pickupLat: z.coerce.number(),
  pickupLng: z.coerce.number(),
  radiusKm: z.coerce.number().min(0.5).max(15).optional(),
  rideType: z.string().min(1).optional(),
  tripKm: z.coerce.number().min(0).max(500).optional(),
  pickupPincode: z.string().optional(),
  pickupState: z.string().optional(),
});

const rideQuoteBodySchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropLat: z.number(),
  dropLng: z.number(),
  tripKm: z.number().nonnegative(),
  catalogCode: z.string().min(1),
  pickupPincode: z.string().optional().nullable(),
  pickupState: z.string().optional().nullable(),
});

const rideQuoteBatchBodySchema = z.object({
  pickupLat: z.number(),
  pickupLng: z.number(),
  dropLat: z.number(),
  dropLng: z.number(),
  tripKm: z.number().nonnegative(),
  catalogCodes: z.array(z.string().min(1)).min(1).max(20),
  pickupPincode: z.string().optional().nullable(),
  pickupState: z.string().optional().nullable(),
});

const rideQuoteComponentLineSchema = z.object({
  subtype: z.string(),
  label: z.string(),
  amount: z.number(),
  kind: z.enum(["charge", "discount"]),
});

const rideQuoteBillingSchema = z
  .object({
    finalAmount: z.number(),
    rideFare: z.number(),
    platformFee: z.number(),
    convenienceFee: z.number(),
    taxTotal: z.number(),
    tipAmount: z.number(),
    charges: z.array(z.any()).optional(),
    taxes: z.array(z.any()).optional(),
    breakdownSteps: z.array(z.any()).optional(),
    /** Phase 2: typed fare component breakdown (waiting / night / peak / …) */
    componentBreakdown: z.array(rideQuoteComponentLineSchema).optional(),
  })
  .nullable()
  .optional();

const rideQuoteOkFields = {
  ok: z.literal(true),
  stateId: z.string().nullable(),
  pricingGeoLevel: z.string().nullable(),
  pricingGeoRefId: z.string().nullable(),
  pricingVehicle: z.string().nullable(),
  eligible: z.boolean(),
  maxDistanceKm: z.number().nullable(),
  baseFare: z.number(),
  distanceFare: z.number(),
  surgeTotal: z.number(),
  finalFare: z.number(),
  appliedSurges: z.array(
    z.object({
      name: z.string(),
      amount: z.number(),
      fundingMode: z.enum(["CUSTOMER_100", "COMPANY_100", "SHARED"]).optional(),
      customerShareAmount: z.number().optional(),
      companyShareAmount: z.number().optional(),
    })
  ),
  surgeCustomerShare: z.number(),
  surgeCompanyShare: z.number(),
  rateCardSummary: z.string().nullable(),
  waitingChargeNote: z.string().nullable(),
  billing: rideQuoteBillingSchema,
} as const;

const availabilityOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  subtitle: z.string().nullable(),
  baseFare: z.number(),
  etaMins: z.number(),
  capacity: z.number().nullable(),
  tag: z.enum(["FASTEST", "SAVE"]).nullable(),
  imageKey: z.string(),
  nearbyRiderCount: z.number(),
  nearestRiderKm: z.number().nullable(),
  nearestRiderEtaMins: z.number().nullable(),
});

const availabilityRiderSchema = z.object({
  riderId: z.number(),
  lat: z.number(),
  lng: z.number(),
  heading: z.number().nullable(),
  distanceKm: z.number(),
  vehicleType: z.string(),
  vehicleTypes: z.array(z.string()).optional(),
  acType: z.string().nullable().optional(),
});

export async function rideRoutes(app: FastifyInstance) {
  app.get(
    "/availability",
    {
      schema: {
        querystring: availabilityQuerySchema,
        response: {
          200: z.object({
            radiusKm: z.number(),
            nearbyRiderCount: z.number(),
            onDutyRiderCount: z.number(),
            catalogCodes: z.array(z.string()),
            options: z.array(availabilityOptionSchema),
            riders: z.array(availabilityRiderSchema),
          }),
          400: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const q = req.query as z.infer<typeof availabilityQuerySchema>;
      if (!Number.isFinite(q.pickupLat) || !Number.isFinite(q.pickupLng)) {
        return reply.status(400).send({ error: "Invalid pickup coordinates" });
      }
      return getNearbyRideSupply({
        pickupLat: q.pickupLat,
        pickupLng: q.pickupLng,
        radiusKm: q.radiusKm,
        rideType: q.rideType,
        tripKm: q.tripKm,
        pickupPincode: q.pickupPincode,
        pickupState: q.pickupState,
      });
    }
  );

  app.post(
    "/quote",
    {
      schema: {
        body: rideQuoteBodySchema,
        response: {
          200: z.object(rideQuoteOkFields),
          400: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof rideQuoteBodySchema>;
      const result = await quoteCustomerRideFare(body);
      if (!result.ok) {
        return reply.status(400).send({ error: result.message, code: result.code });
      }

      let billing: {
        finalAmount: number;
        rideFare: number;
        platformFee: number;
        convenienceFee: number;
        taxTotal: number;
        tipAmount: number;
        charges?: unknown[];
        taxes?: unknown[];
        breakdownSteps?: unknown[];
        componentBreakdown?: ReturnType<typeof buildRideComponentBreakdown>;
      } | null = null;

      if (result.eligible && result.finalFare > 0) {
        const db = getDb();
        const billRes = await computeBillForRide(db, {
          customerId: 0,
          rideFare: result.finalFare,
          distanceKm: body.tripKm,
          pickupLat: body.pickupLat,
          pickupLng: body.pickupLng,
          dropLat: body.dropLat,
          dropLon: body.dropLng,
          pickupPincode: body.pickupPincode,
          pickupState: body.pickupState,
        });
        if (billRes.ok) {
          billing = {
            finalAmount: billRes.billing.final_amount,
            rideFare: result.finalFare,
            platformFee: billRes.billing.platform_fee,
            convenienceFee: billRes.billing.convenience_fee,
            taxTotal: billRes.billing.tax_total,
            tipAmount: billRes.billing.tip_amount,
            charges: billRes.billing.charges,
            taxes: billRes.billing.taxes,
            breakdownSteps: billRes.billing.breakdown_steps,
            componentBreakdown: buildRideComponentBreakdown(
              billRes.billing.charges,
              billRes.billing.discounts
            ),
          };
        }
      }

      return { ...result, billing };
    }
  );

  app.post(
    "/quote-batch",
    {
      schema: {
        body: rideQuoteBatchBodySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            quotes: z.record(z.string(), z.any()),
            timings: z
              .object({
                geoMs: z.number(),
                configMs: z.number(),
                slabsMs: z.number(),
                pricingMs: z.number(),
                billingMs: z.number(),
                totalMs: z.number(),
              })
              .optional(),
          }),
          400: z.object({ error: z.string(), code: z.string().optional() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof rideQuoteBatchBodySchema>;
      if (!Number.isFinite(body.pickupLat) || !Number.isFinite(body.pickupLng)) {
        return reply.status(400).send({ error: "Invalid pickup coordinates", code: "BAD_COORDS" });
      }

      const batchStarted = Date.now();
      const { ctx, quotes, totalMs: quoteTotalMs } = await quoteCustomerRideFareBatch(body);

      const db = getDb();
      const billingT0 = Date.now();
      const resolvedGeo = await resolveRideBillingGeo({
        pickupLat: body.pickupLat,
        pickupLng: body.pickupLng,
        pickupPincode: body.pickupPincode,
        pickupState: body.pickupState,
      });

      const out: Record<string, unknown> = {};

      for (const [code, result] of Object.entries(quotes)) {
        if (!result.ok) {
          out[code] = result;
          continue;
        }

        let billing: {
          finalAmount: number;
          rideFare: number;
          platformFee: number;
          convenienceFee: number;
          taxTotal: number;
          tipAmount: number;
          charges?: unknown[];
          taxes?: unknown[];
          breakdownSteps?: unknown[];
          componentBreakdown?: ReturnType<typeof buildRideComponentBreakdown>;
        } | null = null;

        if (result.eligible && result.finalFare > 0) {
          const billRes = await computeBillForRide(db, {
            customerId: 0,
            rideFare: result.finalFare,
            distanceKm: body.tripKm,
            pickupLat: body.pickupLat,
            pickupLng: body.pickupLng,
            dropLat: body.dropLat,
            dropLon: body.dropLng,
            pickupPincode: body.pickupPincode,
            pickupState: body.pickupState,
            resolvedGeo,
          });
          if (billRes.ok) {
            billing = {
              finalAmount: billRes.billing.final_amount,
              rideFare: result.finalFare,
              platformFee: billRes.billing.platform_fee,
              convenienceFee: billRes.billing.convenience_fee,
              taxTotal: billRes.billing.tax_total,
              tipAmount: billRes.billing.tip_amount,
              charges: billRes.billing.charges,
              taxes: billRes.billing.taxes,
              breakdownSteps: billRes.billing.breakdown_steps,
              componentBreakdown: buildRideComponentBreakdown(
                billRes.billing.charges,
                billRes.billing.discounts
              ),
            };
          }
        }

        out[code] = { ...result, billing };
      }

      const billingMs = Date.now() - billingT0;
      const totalMs = Date.now() - batchStarted;
      const timings =
        process.env.NODE_ENV !== "production"
          ? {
              geoMs: ctx.timings.geoMs,
              configMs: ctx.timings.configMs,
              slabsMs: ctx.timings.slabsMs,
              pricingMs: ctx.timings.pricingMs,
              billingMs,
              totalMs,
            }
          : undefined;

      if (timings) {
        // eslint-disable-next-line no-console
        console.log(
          "[ride-quote-batch] route",
          JSON.stringify({ ...timings, quoteTotalMs, vehicleCount: Object.keys(out).length })
        );
      }

      return { ok: true as const, quotes: out, timings };
    }
  );

  await app.register(async function authedRideRoutes(sub) {
    await sub.register(auth, { required: true });

    sub.post(
      "/",
      {
        schema: {
          body: placeRideBodySchema,
          response: {
            200: z.object({
              orderId: z.string(),
              formattedOrderId: z.string().nullable(),
              coreOrderId: z.number(),
              status: z.string(),
              totalAmount: z.number(),
              searchTimeoutSec: z.number(),
              searchExpiresAt: z.string(),
              createdAt: z.string(),
              pickupOtp: z.string(),
            }),
            400: z.object({ error: z.string(), message: z.string().optional() }),
            403: z.object({ error: z.string(), message: z.string().optional() }),
          },
        },
      },
      async (req, reply) => {
        const sub = req.auth?.sub;
        const role = req.auth?.role;
        if (!sub || role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }

        const customerPk = await resolveCustomerPkFromSub(sub);
        if (customerPk == null) {
          return reply.status(403).send({ error: "Customer not found" });
        }

        const body = req.body as z.infer<typeof placeRideBodySchema>;

        try {
          const result = await placeRideOrder({
            customerPk,
            pickupAddress: body.pickupAddress,
            pickupLabel: body.pickupLabel,
            pickupLat: body.pickupLat,
            pickupLng: body.pickupLng,
            dropAddress: body.dropAddress,
            dropLabel: body.dropLabel,
            dropLat: body.dropLat,
            dropLng: body.dropLng,
            intermediateStops: body.intermediateStops,
            rideType: body.rideType,
            vehicleTypeRequired: body.vehicleTypeRequired,
            estimatedFare: body.estimatedFare,
            tripKm: body.tripKm,
            paymentMethod: body.paymentMethod,
            bookedForSelf: body.bookedForSelf,
            passengerName: body.passengerName,
            passengerPhone: body.passengerPhone,
            pickupDistanceFromBookerKm: body.pickupDistanceFromBookerKm,
            farPickupPromptShown: body.farPickupPromptShown,
            farPickupAcknowledged: body.farPickupAcknowledged,
            searchTimeoutSec: body.searchTimeoutSec ?? DEFAULT_RIDE_SEARCH_TIMEOUT_SEC,
            customerTipAmount: body.customerTipAmount ?? 0,
            pickupPincode: body.pickupPincode,
            pickupState: body.pickupState,
          });
          return result;
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          const status = err.statusCode ?? 500;
          return reply.status(status as 400).send({
            error: err.message || "Failed to place ride order",
          });
        }
      }
    );

    sub.get(
      "/:id",
      {
        schema: {
          params: z.object({ id: z.string().min(1) }),
          response: {
            200: z.object({
              orderId: z.string(),
              coreOrderId: z.number(),
              status: z.string(),
              appStatus: z.string(),
              riderId: z.number().nullable(),
              riderAssigned: z.boolean(),
              rider: z
                .object({
                  name: z.string(),
                  phone: z.string().optional(),
                  photoUrl: z.string().nullable().optional(),
                  rating: z.number().nullable().optional(),
                  deliveredOrdersCount: z.number().int().nonnegative().nullable().optional(),
                  vehicleRegistration: z.string().nullable().optional(),
                  vehicleModel: z.string().nullable().optional(),
                })
                .nullable(),
              totalAmount: z.number(),
              searchExpiresAt: z.string().nullable(),
              cancelled: z.boolean(),
              pickupOtp: z.string().nullable(),
              rideStarted: z.boolean(),
              riderReachedPickupAt: z.string().nullable(),
              pickupOtpVerifiedAt: z.string().nullable(),
              pickupWaitSeconds: z.number().nullable(),
              pickupWaitFreeMinutes: z.number(),
              pickupWaitingChargePerMin: z.number(),
              estimatedPickupWaitingCharge: z.number(),
              awaitingTipBoost: z.boolean(),
              dispatchRetryCount: z.number(),
              dispatchDeclinedCount: z.number(),
              customerTipAmount: z.number(),
              prebookTipAmount: z.number(),
              searchBoostTip1: z.number(),
              searchBoostTip2: z.number(),
              estimatedFare: z.number(),
            }),
            404: z.object({ error: z.string() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const sub = req.auth?.sub;
        const role = req.auth?.role;
        if (!sub || role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }
        const customerPk = await resolveCustomerPkFromSub(sub);
        if (customerPk == null) {
          return reply.status(403).send({ error: "Customer not found" });
        }

        const { id } = req.params as { id: string };
        const row = await getRideOrderForCustomer(customerPk, id);
        if (!row) return reply.status(404).send({ error: "Ride order not found" });
        return row;
      }
    );

    sub.post(
      "/:id/cancel",
      {
        schema: {
          params: z.object({ id: z.string().min(1) }),
          body: cancelRideBodySchema,
          response: {
            200: z.object({
              orderId: z.string(),
              status: z.string(),
            }),
            404: z.object({ error: z.string() }),
            409: z.object({ error: z.string() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const sub = req.auth?.sub;
        const role = req.auth?.role;
        if (!sub || role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }
        const customerPk = await resolveCustomerPkFromSub(sub);
        if (customerPk == null) {
          return reply.status(403).send({ error: "Customer not found" });
        }

        const { id } = req.params as { id: string };
        const body = req.body as z.infer<typeof cancelRideBodySchema>;

        try {
          const result = await cancelRideOrder({
            customerPk,
            orderRef: id,
            reasonCode: body.reasonCode,
            reasonText: body.reasonText,
            cancelMode: body.cancelMode,
            cancelledByType: body.cancelMode === "timeout" ? "system" : "customer",
          });
          return result;
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          const status = err.statusCode ?? 500;
          return reply.status(status as 409).send({ error: err.message || "Failed to cancel ride" });
        }
      }
    );

    sub.post(
      "/:id/search-window-ended",
      {
        schema: {
          params: z.object({ id: z.string().min(1) }),
          response: {
            200: z.object({
              orderId: z.string(),
              awaitingTipBoost: z.boolean(),
              searchExpiresAt: z.string(),
            }),
            404: z.object({ error: z.string() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const sub = req.auth?.sub;
        const role = req.auth?.role;
        if (!sub || role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }
        const customerPk = await resolveCustomerPkFromSub(sub);
        if (customerPk == null) {
          return reply.status(403).send({ error: "Customer not found" });
        }
        const { id } = req.params as { id: string };
        try {
          return await markRideSearchWindowEnded(customerPk, id);
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          const status = err.statusCode ?? 500;
          return reply.status(status as 404).send({ error: err.message || "Failed" });
        }
      }
    );

    sub.post(
      "/:id/extend-search",
      {
        schema: {
          params: z.object({ id: z.string().min(1) }),
          body: extendSearchBodySchema,
          response: {
            200: extendSearchResponseSchema,
            404: z.object({ error: z.string() }),
            409: z.object({ error: z.string() }),
            403: z.object({ error: z.string() }),
          },
        },
      },
      async (req, reply) => {
        const sub = req.auth?.sub;
        const role = req.auth?.role;
        if (!sub || role !== "customer") {
          return reply.status(403).send({ error: "Customer only" });
        }
        const customerPk = await resolveCustomerPkFromSub(sub);
        if (customerPk == null) {
          return reply.status(403).send({ error: "Customer not found" });
        }
        const { id } = req.params as { id: string };
        const body = req.body as z.infer<typeof extendSearchBodySchema>;
        try {
          return await extendRideSearch({
            customerPk,
            orderRef: id,
            tipAmount: body.tipAmount,
          });
        } catch (e) {
          const err = e as Error & { statusCode?: number };
          const status = err.statusCode ?? 500;
          return reply.status(status as 409).send({ error: err.message || "Failed to extend search" });
        }
      }
    );
  });
}
