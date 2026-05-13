/**
 * Public offer listing for customers browsing stores.
 * No auth required — used on store detail screen and home banner before checkout.
 *
 * GET /v1/offers/store/:storeId
 *   Returns active merchant offers for the store + platform offers effective
 *   for the customer's location (resolved via pincode → geo hierarchy).
 *
 * GET /v1/offers/featured
 *   Returns GLOBAL-scoped platform offers (no geo filter) for the home screen banner.
 */

import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { eq, and, lte, gte, asc, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import {
  merchantOffers,
  billingPlatformOffers,
} from "../../db/schema.js";
import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
} from "../billing/geoRefFromPincode.js";
import { resolveGeoLocation } from "../billing/geoLocationResolver.js";
import { getStoreByStoreId, getStoreByIdForOrder } from "../merchants/merchant.service.js";

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : null;
}

function buildOfferLabel(type: string, discountPct: number | null, discountVal: number | null, maxDiscount: number | null): string {
  const t = String(type ?? "").toUpperCase();
  if ((t === "PERCENTAGE" || t === "CART_PERCENTAGE") && discountPct != null && discountPct > 0) {
    return `${Math.round(discountPct)}% OFF`;
  }
  if ((t === "FLAT" || t === "CART_FLAT") && discountVal != null && discountVal > 0) {
    return `₹${Math.round(discountVal)} OFF`;
  }
  if (t === "FREE_DELIVERY") return "Free Delivery";
  if (t === "BOGO") return "Buy 1 Get 1";
  if (t === "BUY_X_GET_Y" || t === "BUY_N_GET_M") return "Buy More Save More";
  if (t === "BUNDLE") return "Bundle Deal";
  if (t === "TIERED") return "Spend More Save More";
  if (t === "COUPON") return "Coupon";
  if (t === "FREE_ITEM") return "Free Item";
  if (maxDiscount != null && maxDiscount > 0) return `Up to ₹${Math.round(maxDiscount)} OFF`;
  return "Special Offer";
}

function buildOfferSublabel(minOrder: number | null, maxDiscount: number | null, firstOrderOnly: boolean, newUserOnly: boolean): string {
  const parts: string[] = [];
  if (firstOrderOnly || newUserOnly) parts.push("New users");
  if (minOrder != null && minOrder > 0) parts.push(`on orders above ₹${Math.round(minOrder)}`);
  if (maxDiscount != null && maxDiscount > 0) parts.push(`up to ₹${Math.round(maxDiscount)}`);
  return parts.join(" · ");
}

function buildPlatformLabel(offerKind: string, discountType: string | null, value: number | null, maxDiscount: number | null): string {
  const kind = String(offerKind ?? "DISCOUNT").toUpperCase();
  if (kind === "FREE_DELIVERY") return "Free Delivery";
  if (kind === "BUY_X_GET_Y") return "Buy More Save More";
  if (kind === "CASHBACK" && value != null && value > 0) {
    return discountType === "PERCENTAGE" ? `${Math.round(value)}% Cashback` : `₹${Math.round(value)} Cashback`;
  }
  if (value != null && value > 0) {
    return discountType === "PERCENTAGE"
      ? `${Math.round(value)}% OFF`
      : `₹${Math.round(value)} OFF`;
  }
  if (maxDiscount != null && maxDiscount > 0) return `Up to ₹${Math.round(maxDiscount)} OFF`;
  return "Platform Offer";
}

async function resolveStoreInternalId(storeId: string): Promise<number | null> {
  const parsed = parseInt(String(storeId).trim(), 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    const s = await getStoreByIdForOrder(parsed);
    return s ? parsed : null;
  }
  const s = await getStoreByStoreId(storeId);
  return s ? Number(s.id) : null;
}

async function fetchMerchantOffers(storeInternalId: number) {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select({
      id:                  merchantOffers.id,
      offerId:             merchantOffers.offerId,
      offerTitle:          merchantOffers.offerTitle,
      offerType:           merchantOffers.offerType,
      discountValue:       merchantOffers.discountValue,
      discountPercentage:  merchantOffers.discountPercentage,
      maxDiscountAmount:   merchantOffers.maxDiscountAmount,
      minOrderAmount:      merchantOffers.minOrderAmount,
      couponCode:          merchantOffers.couponCode,
      firstOrderOnly:      merchantOffers.firstOrderOnly,
      newUserOnly:         merchantOffers.newUserOnly,
      autoApply:           merchantOffers.autoApply,
      displayPriority:     merchantOffers.displayPriority,
      priority:            merchantOffers.priority,
    })
    .from(merchantOffers)
    .where(
      and(
        eq(merchantOffers.storeId, storeInternalId),
        eq(merchantOffers.isActive, true),
        lte(merchantOffers.validFrom, now),
        gte(merchantOffers.validTill, now),
      )
    )
    .orderBy(sql`${merchantOffers.displayPriority} DESC NULLS LAST`, asc(merchantOffers.id));

  return rows.map((r) => {
    const discPct  = n(r.discountPercentage);
    const discVal  = n(r.discountValue);
    const maxDisc  = n(r.maxDiscountAmount);
    const minOrder = n(r.minOrderAmount);
    const type     = String(r.offerType ?? "PERCENTAGE");
    return {
      id:           r.id,
      offer_id:     r.offerId ?? null,
      title:        r.offerTitle,
      offer_type:   type,
      coupon_code:  r.couponCode ?? null,
      auto_apply:   r.autoApply ?? true,
      label:        buildOfferLabel(type, discPct, discVal, maxDisc),
      sub_label:    buildOfferSublabel(minOrder, maxDisc, r.firstOrderOnly ?? false, r.newUserOnly ?? false),
      discount_percentage: discPct,
      discount_value:      discVal,
      max_discount_amount: maxDisc,
      min_order_amount:    minOrder,
    };
  });
}

async function fetchPlatformOffers(
  pincode: string | null,
  serviceType: string,
  stateName?: string | null,
  cityName?: string | null,
  latitude?: number | null,
  longitude?: number | null,
): Promise<Array<{
  id: number; name: string | null; offer_kind: string;
  label: string; sub_label: string; is_geo_bound: boolean;
}>> {
  const db = getDb();
  const st = serviceType.toUpperCase();
  const now = new Date();

  // Master geo resolver: live values → reverse-geocode lat/lng → state-name fallback.
  // Caller passes pincode/state/city as "live" since these are public unauthenticated
  // endpoints (no saved address — caller is the customer app's location store).
  const geo = await resolveGeoLocation({
    livePincode: pincode,
    liveState: stateName,
    liveCity: cityName,
    latitude,
    longitude,
  });
  const geoBoundIds = geo.geoBoundOfferIds;

  // Load all active platform offers matching service type + customer audience
  const rows = await db
    .select({
      id:                 billingPlatformOffers.id,
      name:               billingPlatformOffers.name,
      serviceType:        billingPlatformOffers.serviceType,
      offerKind:          billingPlatformOffers.offerKind,
      discountType:       billingPlatformOffers.discountType,
      valueNumeric:       billingPlatformOffers.valueNumeric,
      maxDiscountAmount:  billingPlatformOffers.maxDiscountAmount,
      minOrderAmount:     billingPlatformOffers.minOrderAmount,
      targetScope:        billingPlatformOffers.targetScope,
      offerAudience:      billingPlatformOffers.offerAudience,
      customerSegment:    billingPlatformOffers.customerSegment,
      startsAt:           billingPlatformOffers.startsAt,
      endsAt:             billingPlatformOffers.endsAt,
      priority:           billingPlatformOffers.priority,
    })
    .from(billingPlatformOffers)
    .where(eq(billingPlatformOffers.isActive, true))
    .orderBy(asc(billingPlatformOffers.priority));

  const result: Array<{
    id: number; name: string | null; offer_kind: string;
    label: string; sub_label: string; is_geo_bound: boolean;
  }> = [];

  for (const o of rows) {
    // Service type gate
    const oSt = String(o.serviceType ?? "FOOD").toUpperCase();
    if (oSt !== st && oSt !== "ALL") continue;

    // Customer audience gate
    const audience = String(o.offerAudience ?? "CUSTOMER").toUpperCase();
    if (audience !== "CUSTOMER") continue;

    // Time window gate
    if (o.startsAt && new Date() < o.startsAt) continue;
    if (o.endsAt && new Date() > o.endsAt) continue;

    // Geo gate
    const scope = String(o.targetScope ?? "GLOBAL").toUpperCase();
    let isGeoBound = false;
    if (scope === "GEO" || scope === "GEO_MERCHANT") {
      // Must be in geoBoundIds (effective for this pincode location) OR have legacy geo_targets
      if (!geoBoundIds.has(o.id)) continue;
      isGeoBound = true;
    } else if (scope === "MERCHANT") {
      // Merchant-specific: skip for generic listing (no merchantIds filter applied here)
      continue;
    }
    // GLOBAL scope: always show

    const kind     = String(o.offerKind ?? "DISCOUNT").toUpperCase();
    const value    = n(o.valueNumeric);
    const maxDisc  = n(o.maxDiscountAmount);
    const minOrder = n(o.minOrderAmount);

    result.push({
      id:         o.id,
      name:       o.name ?? null,
      offer_kind: kind,
      label:      buildPlatformLabel(kind, o.discountType, value, maxDisc),
      sub_label:  minOrder != null && minOrder > 0 ? `on orders above ₹${Math.round(minOrder)}` : "",
      is_geo_bound: isGeoBound,
    });
  }

  return result;
}

export async function offersRoutes(app: FastifyInstance) {
  // GET /v1/offers/store/:storeId
  app.get(
    "/store/:storeId",
    {
      schema: {
        description: "Active offers for a store — merchant offers + platform geo/global offers. No auth required.",
        params: z.object({ storeId: z.string().min(1) }),
        querystring: z.object({
          pincode:     z.string().optional(),
          state:       z.string().optional(),
          city:        z.string().optional(),
          lat:         z.coerce.number().optional(),
          lng:         z.coerce.number().optional(),
          serviceType: z.enum(["FOOD", "PARCEL", "RIDE"]).optional().default("FOOD"),
        }),
        response: {
          200: z.object({
            merchant_offers: z.array(z.object({
              id:                  z.number(),
              offer_id:            z.string().nullable(),
              title:               z.string(),
              offer_type:          z.string(),
              coupon_code:         z.string().nullable(),
              auto_apply:          z.boolean(),
              label:               z.string(),
              sub_label:           z.string(),
              discount_percentage: z.number().nullable(),
              discount_value:      z.number().nullable(),
              max_discount_amount: z.number().nullable(),
              min_order_amount:    z.number().nullable(),
            })),
            platform_offers: z.array(z.object({
              id:           z.number(),
              name:         z.string().nullable(),
              offer_kind:   z.string(),
              label:        z.string(),
              sub_label:    z.string(),
              is_geo_bound: z.boolean(),
            })),
          }),
          404: z.object({ error: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const { storeId } = req.params as { storeId: string };
      const q = req.query as { pincode?: string; state?: string; city?: string; lat?: number; lng?: number; serviceType?: string };
      const pincode     = q.pincode?.trim() || null;
      const stateName   = q.state?.trim() || null;
      const cityName    = q.city?.trim() || null;
      const latitude    = q.lat ?? null;
      const longitude   = q.lng ?? null;
      const serviceType = q.serviceType ?? "FOOD";

      const storeInternalId = await resolveStoreInternalId(storeId);
      if (storeInternalId == null) {
        return reply.status(404).send({ error: "Store not found" });
      }

      const [merchant_offers, platform_offers] = await Promise.all([
        fetchMerchantOffers(storeInternalId),
        fetchPlatformOffers(pincode, serviceType, stateName, cityName, latitude, longitude),
      ]);

      return reply.send({ merchant_offers, platform_offers });
    }
  );

  // GET /v1/offers/featured — home screen banner (GLOBAL-scoped platform offers only)
  app.get(
    "/featured",
    {
      schema: {
        description: "GLOBAL platform offers for home screen promo banner. No auth required.",
        querystring: z.object({
          pincode:     z.string().optional(),
          state:       z.string().optional(),
          city:        z.string().optional(),
          lat:         z.coerce.number().optional(),
          lng:         z.coerce.number().optional(),
          serviceType: z.enum(["FOOD", "PARCEL", "RIDE"]).optional().default("FOOD"),
          limit:       z.coerce.number().int().positive().max(10).optional().default(5),
        }),
        response: {
          200: z.object({
            offers: z.array(z.object({
              id:           z.number(),
              name:         z.string().nullable(),
              offer_kind:   z.string(),
              label:        z.string(),
              sub_label:    z.string(),
              is_geo_bound: z.boolean(),
            })),
          }),
        },
      },
    },
    async (req, reply) => {
      const q = req.query as { pincode?: string; state?: string; city?: string; lat?: number; lng?: number; serviceType?: string; limit?: number };
      const pincode     = q.pincode?.trim() || null;
      const stateName   = q.state?.trim() || null;
      const cityName    = q.city?.trim() || null;
      const latitude    = q.lat ?? null;
      const longitude   = q.lng ?? null;
      const serviceType = q.serviceType ?? "FOOD";
      const limit       = Number(q.limit ?? 5);

      const all = await fetchPlatformOffers(pincode, serviceType, stateName, cityName, latitude, longitude);
      return reply.send({ offers: all.slice(0, limit) });
    }
  );
}
