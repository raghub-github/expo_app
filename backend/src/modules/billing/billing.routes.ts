import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getEnv } from "../../config/env.js";
import { getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { auth } from "../../plugins/auth.js";
import { normalizeOrderItems } from "../orders/orderNormalizer.js";
import { computeBillForOrder, listCheckoutBillOffers } from "./billing.service.js";
import type { BillingResult } from "./types.js";

const addonSchema = z.object({
  addonId: z.union([z.string(), z.number()]),
  addonName: z.string(),
  addonPrice: z.number(),
  quantity: z.number().int().positive(),
});

const itemSchema = z.object({
  menuItemId: z.union([z.string(), z.number()]),
  itemName: z.string(),
  quantity: z.number().int().positive(),
  basePrice: z.number().nonnegative(),
  variantId: z.union([z.string(), z.number()]).optional().nullable(),
  variantName: z.string().optional().nullable(),
  addons: z.array(addonSchema).optional().default([]),
  itemSnapshot: z.record(z.string(), z.unknown()).optional().nullable(),
});

const checkoutOffersQuerySchema = z.object({
  merchantId: z.string().min(1),
  addressId: z.coerce.number().int().positive(),
  cartSubtotal: z.coerce.number().nonnegative().optional().default(0),
  serviceType: z.enum(["FOOD", "PARCEL", "RIDE", "ALL"]).optional(),
  userSegment: z.enum(["NEW", "EXISTING", "ALL"]).optional(),
  // Live location from the customer app's location store. Preferred over the saved
  // address fields (which may carry "—" placeholders if reverse-geocoding failed
  // when the address was created). Geo inheritance walks pincode→state, but state
  // alone is enough to resolve state-bound offers when the pincode chain is broken.
  pincode: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
});

const calculateBodySchema = z.object({
  merchantId: z.string().min(1),
  items: z.array(itemSchema).min(1),
  addressId: z.union([z.string(), z.number()]).optional(),
  dropLat: z.number().optional(),
  dropLon: z.number().optional(),
  tipAmount: z.number().nonnegative().optional(),
  donationAmount: z.number().nonnegative().optional(),
  couponCode: z.string().optional().nullable(),
  pickupLat: z.number().optional(),
  pickupLon: z.number().optional(),
  serviceType: z.enum(["FOOD", "PARCEL", "RIDE", "ALL"]).optional(),
  cityName: z.string().optional().nullable(),
  userSegment: z.enum(["NEW", "EXISTING", "ALL"]).optional(),
  subscriptionOptIn: z.boolean().optional(),
  checkoutAudience: z.enum(["CUSTOMER", "MERCHANT", "RIDER"]).optional(),
  couponRedemptionsByUser: z.number().int().nonnegative().optional(),
  /** 'delivery' (default) or 'self_pickup' — waives delivery fee on the billing engine side. */
  deliveryType: z.enum(["delivery", "self_pickup"]).optional(),
});

function isSimRequest(req: { headers: Record<string, string | string[] | undefined> }): boolean {
  const env = getEnv();
  if (!env.BILLING_SIM_SECRET) return false;
  const h = req.headers["x-billing-sim-secret"];
  const v = Array.isArray(h) ? h[0] : h;
  return typeof v === "string" && v === env.BILLING_SIM_SECRET;
}

function mapGstLine(g: BillingResult["gst_components"]["items"]) {
  return {
    original: g.original,
    discount: g.discount,
    taxable_value: g.taxable_value,
    gst: g.gst,
  };
}

function traceFromSnapshot(snap: Record<string, unknown> | undefined) {
  if (!snap) {
    return {
      distanceKm: null as number | null,
      durationMin: null as number | null,
      routingSource: null as "mapbox" | "osrm" | "haversine" | null,
      routingApproximate: false,
      routeCached: false,
      dropPostalCode: null as string | null,
      serviceable: true,
      serviceRadiusKm: null as number | null,
      unserviceableReason: null as "out_of_range" | "store_inactive" | null,
    };
  }
  const d = snap.distanceKm;
  const distanceKm = typeof d === "number" && Number.isFinite(d) ? d : null;
  const dm = snap.durationMin;
  const durationMin = typeof dm === "number" && Number.isFinite(dm) ? dm : null;
  const rs = snap.routingSource;
  const routingSource =
    rs === "mapbox" || rs === "osrm" || rs === "haversine" ? rs : null;
  const sr = snap.serviceRadiusKm;
  const serviceRadiusKm = typeof sr === "number" && Number.isFinite(sr) ? sr : null;
  const ur = snap.unserviceableReason;
  const unserviceableReason =
    ur === "out_of_range" || ur === "store_inactive" ? (ur as "out_of_range" | "store_inactive") : null;
  return {
    distanceKm,
    durationMin,
    routingSource,
    routingApproximate: snap.routingApproximate === true,
    routeCached: snap.routeCached === true,
    dropPostalCode:
      typeof snap.dropPostalCode === "string" && snap.dropPostalCode.trim() !== ""
        ? snap.dropPostalCode.trim()
        : null,
    serviceable: snap.serviceable === false ? false : true,
    serviceRadiusKm,
    unserviceableReason,
  };
}

function mapBillingToResponse(b: BillingResult, snapshot?: Record<string, unknown>) {
  const trace = traceFromSnapshot(snapshot);
  const gc = b.gst_components;
  return {
    ...trace,
    deliveryPricingEngine:
      snapshot && typeof snapshot.deliveryPricingEngine === "string"
        ? (snapshot.deliveryPricingEngine as string)
        : null,
    deliverySlabQuote: snapshot?.deliverySlabQuote,
    itemTotal: b.item_total,
    addonTotal: b.addon_total,
    discountTotal: b.discount_total,
    deliveryFee: b.delivery_fee,
    platformFee: b.platform_fee,
    packagingFee: b.packaging_fee,
    surgeFee: b.surge_fee,
    smallOrderFee: b.small_order_fee,
    convenienceFee: b.convenience_fee,
    miscFee: b.misc_fee,
    taxTotal: b.tax_total,
    tipAmount: b.tip_amount,
    donationAmount: b.donation_amount,
    finalAmount: b.final_amount,
    itemsNetAfterDiscounts: b.items_net_after_discounts,
    taxesByGroup: b.taxes_by_group,
    components: {
      items: mapGstLine(gc.items),
      delivery: mapGstLine(gc.delivery),
      platform: mapGstLine(gc.platform),
      surge: mapGstLine(gc.surge),
      packaging: mapGstLine(gc.packaging),
      small_order: mapGstLine(gc.small_order),
      convenience: mapGstLine(gc.convenience),
    },
    totals: {
      total_discount: b.gst_totals.total_discount,
      total_tax: b.gst_totals.total_tax,
      final_payable: b.gst_totals.final_payable,
    },
    charges: b.charges.map((c) => ({
      kind: c.kind,
      ruleId: c.ruleId,
      label: c.label,
      amount: c.amount,
      hidden: c.hidden ?? false,
      meta: c.meta,
    })),
    discounts: b.discounts.map((c) => ({
      kind: c.kind,
      ruleId: c.ruleId,
      label: c.label,
      amount: c.amount,
      hidden: c.hidden ?? false,
      meta: c.meta,
    })),
    taxes: b.taxes.map((c) => ({
      kind: c.kind,
      ruleId: c.ruleId,
      label: c.label,
      amount: c.amount,
      hidden: c.hidden ?? false,
      meta: c.meta,
    })),
    breakdownSteps: b.breakdown_steps.map((s) => ({
      step: s.step,
      amount: s.amount,
      meta: s.meta,
    })),
    rulesetVersion: b.ruleset_version,
  };
}

export async function billingRoutes(app: FastifyInstance) {
  app.post(
    "/calculate",
    {
      schema: {
        body: calculateBodySchema,
        response: {
          200: z.object({
            distanceKm: z.number().nullable(),
            durationMin: z.number().nullable(),
            routingSource: z.enum(["mapbox", "osrm", "haversine"]).nullable(),
            routingApproximate: z.boolean(),
            routeCached: z.boolean(),
            dropPostalCode: z.string().nullable(),
            serviceable: z.boolean(),
            serviceRadiusKm: z.number().nullable(),
            unserviceableReason: z.enum(["out_of_range", "store_inactive"]).nullable(),
            deliveryPricingEngine: z.string().nullable().optional(),
            deliverySlabQuote: z.any().optional(),
            itemTotal: z.number(),
            addonTotal: z.number(),
            discountTotal: z.number(),
            deliveryFee: z.number(),
            platformFee: z.number(),
            packagingFee: z.number(),
            surgeFee: z.number(),
            smallOrderFee: z.number(),
            convenienceFee: z.number(),
            miscFee: z.number(),
            taxTotal: z.number(),
            tipAmount: z.number(),
            donationAmount: z.number(),
            finalAmount: z.number(),
            itemsNetAfterDiscounts: z.number(),
            taxesByGroup: z.record(z.string(), z.number()),
            components: z.object({
              items: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              delivery: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              platform: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              surge: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              packaging: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              small_order: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
              convenience: z.object({
                original: z.number(),
                discount: z.number(),
                taxable_value: z.number(),
                gst: z.number(),
              }),
            }),
            totals: z.object({
              total_discount: z.number(),
              total_tax: z.number(),
              final_payable: z.number(),
            }),
            charges: z.array(z.any()),
            discounts: z.array(z.any()),
            taxes: z.array(z.any()),
            breakdownSteps: z.array(z.any()),
            rulesetVersion: z.number(),
          }),
          400: z.object({ error: z.string(), message: z.string() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const body = req.body as z.infer<typeof calculateBodySchema>;
      const norm = normalizeOrderItems(body.items);
      if (!norm.ok) {
        return reply.status(400).send({ error: norm.code, message: norm.message });
      }

      const db = getDb();
      const sim = isSimRequest(req);

      if (sim) {
        if (body.dropLat == null || body.dropLon == null) {
          return reply.status(400).send({
            error: "INVALID_INPUT",
            message: "Simulator requests require dropLat and dropLon.",
          });
        }
        const result = await computeBillForOrder(db, {
          customerId: 0,
          merchantId: body.merchantId,
          items: norm.items,
          dropLat: body.dropLat,
          dropLon: body.dropLon,
          tipAmount: body.tipAmount,
          donationAmount: body.donationAmount,
          couponCode: body.couponCode,
          pickupLat: body.pickupLat,
          pickupLon: body.pickupLon,
          serviceType: body.serviceType,
          cityName: body.cityName ?? null,
          userSegment: body.userSegment,
          subscriptionOptIn: body.subscriptionOptIn,
          checkoutAudience: body.checkoutAudience,
          couponRedemptionsByUser: body.couponRedemptionsByUser,
          deliveryType: body.deliveryType,
        });
        if (!result.ok) {
          return reply.status(400).send({ error: result.code, message: result.message });
        }
        return reply.send(mapBillingToResponse(result.billing, result.snapshot as Record<string, unknown>));
      }

      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }

      if (body.addressId == null) {
        return reply.status(400).send({ error: "INVALID_ADDRESS_DATA", message: "addressId is required." });
      }

      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const addressIdNum = typeof body.addressId === "number" ? body.addressId : parseInt(String(body.addressId), 10);
      if (Number.isNaN(addressIdNum)) {
        return reply.status(400).send({ error: "INVALID_ADDRESS_DATA", message: "Invalid addressId." });
      }

      const result = await computeBillForOrder(db, {
        customerId: Number(customerPk),
        merchantId: body.merchantId,
        items: norm.items,
        addressId: addressIdNum,
        tipAmount: body.tipAmount,
        donationAmount: body.donationAmount,
        couponCode: body.couponCode,
        pickupLat: body.pickupLat,
        pickupLon: body.pickupLon,
        serviceType: body.serviceType,
        cityName: body.cityName ?? null,
        userSegment: body.userSegment,
        subscriptionOptIn: body.subscriptionOptIn,
        checkoutAudience: body.checkoutAudience,
        couponRedemptionsByUser: body.couponRedemptionsByUser,
      });

      if (!result.ok) {
        return reply.status(400).send({ error: result.code, message: result.message });
      }

      return reply.send(mapBillingToResponse(result.billing, result.snapshot as Record<string, unknown>));
    }
  );

  app.get(
    "/checkout-offers",
    {
      schema: {
        querystring: checkoutOffersQuerySchema,
        response: {
          200: z.object({
            ok: z.literal(true),
            coupons: z.array(
              z.object({
                code: z.string(),
                discountType: z.string(),
                description: z.string(),
              })
            ),
            merchantOffers: z.array(
              z.object({
                id: z.number(),
                title: z.string(),
                summary: z.string(),
              })
            ),
            platformOffers: z.array(
              z.object({
                id: z.number(),
                name: z.string().nullable(),
                offerKind: z.string(),
                summary: z.string(),
              })
            ),
            // Ineligible — shown grayed-out in the app with the rejection reason
            // (e.g. "minCart=399 cart=163"). Lets the customer see exactly which
            // configured offers they could unlock by adjusting the cart.
            platformOffersIneligible: z
              .array(
                z.object({
                  id: z.number(),
                  name: z.string().nullable(),
                  offerKind: z.string(),
                  summary: z.string(),
                  reason: z.string(),
                })
              )
              .optional(),
          }),
          400: z.object({ error: z.string(), message: z.string() }),
          403: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const sub = req.auth?.sub;
      if (!sub || req.auth?.role !== "customer") {
        return reply.status(403).send({ error: "Customer only" });
      }

      const q = req.query as z.infer<typeof checkoutOffersQuerySchema>;
      const db = getDb();

      const [customerRow] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.customerId, sub))
        .limit(1);
      const customerPk = customerRow?.id ?? null;
      if (customerPk == null) {
        return reply.status(403).send({ error: "Customer not found" });
      }

      const result = await listCheckoutBillOffers(db, {
        customerId: Number(customerPk),
        merchantId: q.merchantId,
        addressId: q.addressId,
        cartSubtotal: q.cartSubtotal,
        serviceType: q.serviceType,
        userSegment: q.userSegment,
        livePincode: q.pincode,
        liveState: q.state,
        liveCity: q.city,
      });

      if (!result.ok) {
        return reply.status(400).send({ error: result.code, message: result.message });
      }

      return reply.send(result);
    }
  );
}

/** Customer /billing/* routes (auth required except where handler branches). */
export async function billingModule(app: FastifyInstance) {
  await app.register(auth, { required: false });
  await app.register(billingRoutes);
}
