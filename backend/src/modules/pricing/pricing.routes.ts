/**
 * Offer Engine V3 — pricing & preview HTTP routes.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { PricingService } from "./pricing.service.js";
import { detectOfferConflicts } from "./offer-conflict.service.js";
import { getStoreByStoreId } from "../merchants/merchant.service.js";
import { reconcileRiderLegs } from "@gatimitra/slab-pricing";
import { resolveOrderRiderPayoutBreakdown } from "../../lib/resolve-order-rider-payout.js";
import { resolveRiderLegPricing, type LegVehicleType } from "../../lib/rider-leg-pricing.js";
import type { DispatchServiceType } from "../../lib/order-assignment-engine.js";

const riderSimulateSchema = z.object({
  service: z.enum(["food", "parcel", "person_ride"]),
  vehicleType: z.enum(["2_wheeler", "3_wheeler", "4_wheeler_non_ac", "4_wheeler_ac"]).optional(),
  weightKg: z.number().nonnegative().optional(),
  /** Eligible delivery fee = the pool basis. For GatiMitra Plus pass the GROSS entitlement. */
  customerFare: z.number().positive(),
  /** rider → pickup (first-mile). */
  pickupKm: z.number().nonnegative(),
  /** pickup → drop (delivery leg). */
  dropKm: z.number().nonnegative(),
  pincode: z.string().optional(),
  state: z.string().optional(),
  pickupLat: z.number().optional(),
  pickupLng: z.number().optional(),
  dropLat: z.number().optional(),
  dropLng: z.number().optional(),
  waitingMinutes: z.number().nonnegative().optional(),
  tip: z.number().nonnegative().optional(),
  riderId: z.number().int().positive().optional(),
  /** true (default) caps customer-funded legs at the pool; false company-funds the overflow. */
  capExcessToPool: z.boolean().optional(),
});

const productPriceSchema = z.object({
  storeId: z.union([z.string(), z.number()]),
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive().optional(),
});

const previewSchema = z.object({
  storeId: z.number().int().positive(),
  menuItemId: z.number().int().positive().optional(),
  sampleQuantity: z.number().int().positive().optional(),
  excludeOfferId: z.number().int().positive().optional().nullable(),
  draftOffer: z.record(z.string(), z.unknown()).optional(),
});

const conflictSchema = z.object({
  storeId: z.number().int().positive(),
  validFrom: z.string(),
  validTill: z.string(),
  menuItemIds: z.array(z.string()).optional(),
  categoryIds: z.array(z.number()).optional(),
  priority: z.number().optional(),
  isStackable: z.boolean().optional(),
  excludeOfferId: z.number().int().positive().optional().nullable(),
  applicableOnDays: z.array(z.string()).optional().nullable(),
  applicableTimeStart: z.string().optional().nullable(),
  applicableTimeEnd: z.string().optional().nullable(),
});

const settlementSchema = z.object({
  billingSnapshot: z.record(z.string(), z.unknown()),
});

async function resolveInternalStoreId(storeIdParam: string | number): Promise<number | null> {
  const trimmed = String(storeIdParam).trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  const store = await getStoreByStoreId(trimmed);
  return store?.id ?? null;
}

function requireInternalSecret(
  headers: Record<string, string | string[] | undefined>
): boolean {
  const secret = process.env.BACKEND_SCHEDULE_TICK_SECRET;
  if (!secret) return false;
  const hdr = headers["x-internal-secret"];
  return hdr === secret;
}

export async function pricingRoutes(app: FastifyInstance): Promise<void> {
  /** GET /v1/pricing/product?storeId=&menuItemId=&quantity= */
  app.get("/product", async (req, reply) => {
    const parsed = productPriceSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const storeId = await resolveInternalStoreId(parsed.data.storeId);
    if (!storeId) {
      return reply.code(404).send({ error: "store_not_found" });
    }
    try {
      const result = await PricingService.calculateProductPrice({
        storeId,
        menuItemId: parsed.data.menuItemId,
        quantity: parsed.data.quantity,
      });
      return reply.send({ ok: true, pricing: result });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "menu_item_not_found") {
        return reply.code(404).send({ error: msg });
      }
      req.log.error(e);
      return reply.code(500).send({ error: "pricing_failed" });
    }
  });

  /** POST /v1/pricing/preview — Partner Site live preview (internal or merchant session via proxy) */
  app.post("/preview", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = previewSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const result = await PricingService.previewOfferPricing(parsed.data);
      return reply.send({ ok: true, ...result });
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ error: "preview_failed" });
    }
  });

  /** POST /v1/pricing/conflicts */
  app.post("/conflicts", async (req, reply) => {
    if (!requireInternalSecret(req.headers as Record<string, string | string[] | undefined>)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = conflictSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    try {
      const conflicts = await detectOfferConflicts(parsed.data);
      return reply.send({ ok: true, conflicts });
    } catch (e) {
      req.log.error(e);
      return reply.code(500).send({ error: "conflict_check_failed" });
    }
  });

  /** POST /v1/pricing/settlement — read-only snapshot interpretation */
  app.post("/settlement", async (req, reply) => {
    const parsed = settlementSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const settlement = PricingService.calculateSettlement(parsed.data.billingSnapshot);
    return reply.send({ ok: true, settlement });
  });

  /**
   * POST /v1/pricing/simulate — authoritative rider payout with INDEPENDENT pre/post legs
   * (Geo Delivery Pricing v3.2). Resolves pre (rider→pickup) and post (pickup→drop) from
   * their OWN rules/rates/slabs, then reconciles against the rider % pool. Read-only; the
   * dashboard simulator, and later order-creation/settlement, all call this one engine so
   * the numbers can never diverge. Returns rule IDs, distances, rates, and both ledgers.
   */
  app.post("/simulate", async (req, reply) => {
    const parsed = riderSimulateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }
    const b = parsed.data;
    const payoutService: "food" | "parcel" | "ride" =
      b.service === "person_ride" ? "ride" : b.service;
    const legService = b.service as DispatchServiceType;
    const legGeo = {
      pincode: b.pincode ?? null,
      state: b.state ?? null,
      latitude: b.pickupLat ?? null,
      longitude: b.pickupLng ?? null,
    };

    try {
      // 1) Rider % pool from the production payout engine (customerFare × rider%, geo rule).
      const breakdown = await resolveOrderRiderPayoutBreakdown({
        service: payoutService,
        customerFare: b.customerFare,
        pickupLat: b.pickupLat ?? 0,
        pickupLng: b.pickupLng ?? 0,
        dropLat: b.dropLat ?? 0,
        dropLng: b.dropLng ?? 0,
        pickupKm: b.pickupKm,
        dropKm: b.dropKm,
        pincode: b.pincode ?? null,
        state: b.state ?? null,
        riderId: b.riderId ?? null,
        vehicleType: null,
        rideCatalogCode: null,
        waitingMinutes: b.waitingMinutes ?? 0,
      });
      if (!breakdown) {
        return reply.code(422).send({
          error: "no_payout_rule",
          message: "No rider payout (% of fare) rule is configured for this service/location.",
        });
      }

      const waiting = Math.max(0, breakdown.waitingAmount);
      const surge = Math.max(0, breakdown.surgeTotal);
      const pool = Math.max(0, Math.round((breakdown.subtotalBeforeSurge - waiting) * 100) / 100);

      // 2) Resolve the TWO legs INDEPENDENTLY (own rules, own distances, own rates).
      const vehicle: LegVehicleType = b.vehicleType ?? null;
      const [preLeg, postLeg] = await Promise.all([
        resolveRiderLegPricing({
          leg: "pre",
          service: legService,
          vehicleType: vehicle,
          weightKg: b.weightKg ?? null,
          distanceKm: b.pickupKm,
          geo: legGeo,
        }),
        resolveRiderLegPricing({
          leg: "post",
          service: legService,
          vehicleType: vehicle,
          weightKg: b.weightKg ?? null,
          distanceKm: b.dropKm,
          geo: legGeo,
        }),
      ]);

      // 3) Reconcile the independent legs against the pool.
      const reconciled = reconcileRiderLegs({
        pool,
        pre: {
          rawAmount: preLeg.rawAmount,
          funding: preLeg.funding,
          customerSharePct: preLeg.customerSharePct,
          distanceKm: preLeg.distanceKm,
          ratePerKm: preLeg.ratePerKm,
          ruleId: preLeg.ruleId,
        },
        post: {
          rawAmount: postLeg.rawAmount,
          funding: postLeg.funding,
          customerSharePct: postLeg.customerSharePct,
          distanceKm: postLeg.distanceKm,
          ratePerKm: postLeg.ratePerKm,
          ruleId: postLeg.ruleId,
        },
        surge,
        waiting,
        tip: b.tip ?? 0,
        capExcessToPool: b.capExcessToPool,
      });

      return reply.send({
        ok: true,
        engine: "rider_leg_pricing_v3_2",
        customer: { eligibleDeliveryFee: Math.round(b.customerFare * 100) / 100 },
        pool: { riderPool: pool, waiting, surge, appliedSurges: breakdown.appliedSurges },
        legs: {
          pre: {
            leg: "pre",
            distanceKm: preLeg.distanceKm,
            ratePerKm: preLeg.ratePerKm,
            baseAmount: preLeg.baseAmount,
            rawAmount: preLeg.rawAmount,
            allocated: reconciled.pre.allocated,
            customerFunded: reconciled.pre.customerFunded,
            companyFunded: reconciled.pre.companyFunded,
            funding: preLeg.funding,
            ruleId: preLeg.ruleId,
            matched: preLeg.matched,
            sourceLevel: preLeg.sourceLevel,
          },
          post: {
            leg: "post",
            distanceKm: postLeg.distanceKm,
            ratePerKm: postLeg.ratePerKm,
            baseAmount: postLeg.baseAmount,
            rawAmount: postLeg.rawAmount,
            allocated: reconciled.post.allocated,
            customerFunded: reconciled.post.customerFunded,
            companyFunded: reconciled.post.companyFunded,
            funding: postLeg.funding,
            ruleId: postLeg.ruleId,
            matched: postLeg.matched,
            sourceLevel: postLeg.sourceLevel,
          },
        },
        rider: {
          pool: reconciled.pool,
          allocatedPrePickup: reconciled.pre.allocated,
          allocatedPostPickup: reconciled.post.allocated,
          poolExcess: reconciled.poolExcess,
          companyExcessTopup: reconciled.companyExcessTopup,
          surge: reconciled.surge,
          waiting: reconciled.waiting,
          tip: reconciled.tip,
          deliveryFeeFunded: reconciled.deliveryFeeFundedTotal,
          companyFunded: reconciled.companyFundedTotal,
          riderDeliveryCredit: reconciled.riderDeliveryCredit,
          riderTotal: reconciled.riderTotal,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "simulate_failed";
      req.log.error({ err: e }, "pricing_simulate_failed");
      return reply.code(500).send({ error: "simulate_failed", message: msg });
    }
  });
}
