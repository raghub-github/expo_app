/**
 * Customer parcel quote + place routes — geo slab fares and order placement.
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { quoteParcelVehicleFareBatch } from "./parcelQuote.service.js";
import {
  DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC,
  placeParcelOrder,
  cancelParcelOrder,
} from "./parcelPlacement.service.js";
import { resolveCustomerPkFromSub } from "../rides/ride.placement.service.js";

const vehicleSchema = z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac"]);

const batchBodySchema = z.object({
  pickupLat: z.coerce.number(),
  pickupLng: z.coerce.number(),
  tripKm: z.coerce.number().nonnegative(),
  pickupPincode: z.string().optional().nullable(),
  pickupState: z.string().optional().nullable(),
  vehicleTypes: z.array(vehicleSchema).optional(),
});

const placeBodySchema = z.object({
  pickupAddress: z.string().min(1),
  pickupLabel: z.string().optional().nullable(),
  pickupLat: z.coerce.number(),
  pickupLng: z.coerce.number(),
  dropAddress: z.string().min(1),
  dropLabel: z.string().optional().nullable(),
  dropLat: z.coerce.number(),
  dropLng: z.coerce.number(),
  vehicleCategory: vehicleSchema,
  estimatedFare: z.coerce.number().positive(),
  tripKm: z.coerce.number().nonnegative().optional().nullable(),
  payAt: z.enum(["pickup", "drop"]).optional(),
  receiverName: z.string().min(1),
  receiverMobile: z.string().min(10),
  paymentMethod: z.enum(["cash", "cod", "online"]).optional(),
  couponCode: z.string().optional().nullable(),
  selectedPlatformOfferId: z.coerce.number().int().positive().optional().nullable(),
  forceNoAutoOffer: z.boolean().optional(),
  offerSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
  appliedOfferDiscount: z.coerce.number().nonnegative().optional().nullable(),
  weightKg: z.coerce.number().positive().optional().nullable(),
  lengthCm: z.coerce.number().positive().optional().nullable(),
  widthCm: z.coerce.number().positive().optional().nullable(),
  heightCm: z.coerce.number().positive().optional().nullable(),
});

const cancelBodySchema = z.object({
  reasonCode: z.string().optional(),
  reasonText: z.string().optional().nullable(),
  cancelMode: z.enum(["manual", "auto", "timeout"]).optional(),
});

export const parcelRoutes: FastifyPluginAsync = async (app) => {
  await app.register(async function authedParcelRoutes(sub) {
    await sub.register(auth, { required: true });

    sub.post("/quote-batch", async (req, reply) => {
      const parsed = batchBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const { quotes } = await quoteParcelVehicleFareBatch(parsed.data);
        return reply.send({ ok: true, quotes });
      } catch (e) {
        req.log.error({ err: e }, "parcel quote-batch failed");
        return reply.status(500).send({
          error: e instanceof Error ? e.message : "Quote failed",
          code: "PARCEL_QUOTE_FAILED",
        });
      }
    });

    sub.post("/", async (req, reply) => {
      const subAuth = req.auth?.sub;
      const role = req.auth?.role;
      if (!subAuth || role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }

      const customerPk = await resolveCustomerPkFromSub(subAuth);
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const parsed = placeBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await placeParcelOrder({
          customerPk,
          ...parsed.data,
          payAt: parsed.data.payAt ?? "pickup",
          paymentMethod: parsed.data.paymentMethod ?? "cash",
          couponCode: parsed.data.couponCode ?? null,
          selectedPlatformOfferId: parsed.data.selectedPlatformOfferId ?? null,
          forceNoAutoOffer: parsed.data.forceNoAutoOffer === true,
          offerSnapshot: parsed.data.offerSnapshot ?? null,
          appliedOfferDiscount: parsed.data.appliedOfferDiscount ?? null,
        });
        return reply.send({
          ...result,
          searchTimeoutSec: result.searchTimeoutSec ?? DEFAULT_PARCEL_SEARCH_TIMEOUT_SEC,
        });
      } catch (e) {
        const err = e as Error & {
          statusCode?: number;
          code?: string;
          cause?: { code?: string; detail?: string; message?: string; constraint?: string };
        };
        const cause = err.cause;
        const pgCode = cause?.code || err.code;
        const isUnique =
          pgCode === "23505" ||
          /duplicate key|unique constraint/i.test(String(cause?.message || err.message));
        const status = err.statusCode ?? (isUnique ? 409 : 500);
        const message = isUnique
          ? "Could not place parcel — please try again"
          : cause?.detail ||
            cause?.message ||
            err.message ||
            "Failed to place parcel order";
        req.log.error(
          { err: e, pgCode, constraint: cause?.constraint, detail: cause?.detail },
          "parcel place failed"
        );
        return reply.status(status as 400).send({
          error: isUnique ? "ORDER_ID_CONFLICT" : err.code || message,
          message,
          code: isUnique ? "ORDER_ID_CONFLICT" : err.code || pgCode,
        });
      }
    });

    sub.post("/:id/cancel", async (req, reply) => {
      const subAuth = req.auth?.sub;
      const role = req.auth?.role;
      if (!subAuth || role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }
      const customerPk = await resolveCustomerPkFromSub(subAuth);
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const { id } = req.params as { id: string };
      const parsed = cancelBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Validation failed",
          details: parsed.error.flatten(),
        });
      }

      try {
        const result = await cancelParcelOrder({
          customerPk,
          orderRef: id,
          reasonCode: parsed.data.reasonCode,
          reasonText: parsed.data.reasonText,
          cancelMode: parsed.data.cancelMode ?? "manual",
          cancelledByType: parsed.data.cancelMode === "timeout" ? "system" : "customer",
        });
        return reply.send(result);
      } catch (e) {
        const err = e as Error & { statusCode?: number; code?: string };
        const status = err.statusCode ?? 500;
        req.log.error({ err: e }, "parcel cancel failed");
        return reply.status(status as 400).send({
          error: err.code || err.message || "Failed to cancel parcel order",
          message: err.message || "Failed to cancel parcel order",
          code: err.code,
        });
      }
    });
  });
};
