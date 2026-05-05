/**
 * Canonical store delivery quote engine.
 *
 * Single source of truth used by the customer app (home list, store details, cart,
 * checkout, order details, tracking) AND rider payout flows to ensure the SAME
 * numbers are displayed everywhere:
 *
 *   { distance_km, duration_min, delivery_fee, delivery_gst, final_delivery_fee,
 *     serviceable, source, cached, approximate, actor, slab_quote }
 *
 * - Distance: Mapbox Directions → OSRM → Haversine fallback (via `distance.service.ts`),
 *   memory + DB cache by (origin,destination,profile). Mapbox input format is lng,lat.
 * - Delivery fee: geo slab engine (`delivery_rate_slabs_effective`) resolved via
 *   `resolveDropGeoRefsFromPincode`, then computed progressively/cumulatively:
 *     base_fare (first slab only) + Σ(segment_km × per_km_rate), then first-slab min_charge floor.
 *   This guarantees monotonic pricing (no price drop when distance increases).
 *   (Rider payout uses the same progressive core + waiting/surge extras.)
 * - GST: applied via `APPLY_GST_ON_DELIVERY_FEE` + `DELIVERY_FEE_GST_PERCENT` env.
 *   (DB-driven GST on the bill is handled by the billing pipeline; this engine emits
 *    a flat GST line for display purposes only so the same numbers render on any page.)
 * - Serviceability: store.delivery_radius_km when set, else SERVICE_RADIUS_KM_DEFAULT.
 */

import { getDb } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import { getSupabase } from "../../lib/supabase.js";
import { and, eq, isNull } from "drizzle-orm";
import { customerAddresses } from "../../db/schema.js";
import { getRoute } from "./distance.service.js";
import {
  getStoreByIdForOrder,
  getStoreByStoreId,
} from "../merchants/merchant.service.js";
import { resolveDropGeoRefsFromPincode } from "../billing/geoRefFromPincode.js";
import { loadEffectiveDeliveryRateSlabs } from "../delivery-slab-pricing/deliverySlabPricing.repository.js";
import {
  calculateProgressiveSlabAmount,
  type SelectedSlabQuote,
} from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryActorType, DeliveryServiceType } from "../delivery-slab-pricing/types.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeCity(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).replace(/\u2014/g, "").trim(); // strip EM_DASH placeholder
  return s.length ? s : null;
}

function normalizePincode(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "").trim();
  return digits.length >= 3 ? digits : null;
}

export type StoreQuoteActor = "customer" | "rider";

export type StoreQuoteInput = {
  storeId: string;
  /** Either addressId (with customerId) OR explicit drop coords. */
  customerId?: number | null;
  addressId?: number | null;
  drop?: { lat: number; lng: number; pincode?: string | null; city?: string | null } | null;
  /** Defaults to "customer". Rider uses progressive slab calc. */
  actor?: StoreQuoteActor;
  /** FOOD | PARCEL | RIDE — maps to DeliveryServiceType. Default FOOD. */
  serviceType?: "FOOD" | "PARCEL" | "RIDE";
  /** Optional override for waiting minutes (rider actor only). */
  riderWaitingMinutes?: number;
  /** Skip route cache if true. */
  skipCache?: boolean;
};

export type StoreQuoteResult =
  | {
      ok: true;
      /** Canonical shape used across customer app. */
      quote: {
        store_id: string;
        actor: StoreQuoteActor;
        distance_km: number;
        duration_min: number;
        delivery_fee: number;
        delivery_gst: number;
        final_delivery_fee: number;
        serviceable: boolean;
        /** Reason when not serviceable, for UI copy. */
        unserviceable_reason?: "out_of_range" | "store_inactive" | null;
        service_radius_km: number;
        source: "mapbox" | "osrm" | "haversine";
        cached: boolean;
        approximate: boolean;
        pricing_engine: "slab_geo" | "fallback_per_km";
        /** Raw slab quote for debugging / breakdowns. */
        slab_quote?: SelectedSlabQuote | null;
      };
    }
  | { ok: false; code: string; message: string };

async function getStoreServiceRadiusKm(storeId: number): Promise<number | null> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("merchant_stores")
      .select("delivery_radius_km")
      .eq("id", storeId)
      .single();
    if (error || !data) return null;
    const raw = (data as { delivery_radius_km?: number | string | null }).delivery_radius_km;
    const n = raw == null ? null : typeof raw === "number" ? raw : parseFloat(String(raw));
    return Number.isFinite(n ?? NaN) && (n as number) > 0 ? (n as number) : null;
  } catch {
    return null;
  }
}

async function resolveStore(
  storeId: string
): Promise<
  | { ok: true; id: number; storeId: string; lat: number; lng: number; active: boolean; radiusKm: number | null }
  | { ok: false; code: string; message: string }
> {
  const parsed = parseInt(String(storeId).trim(), 10);
  if (!Number.isNaN(parsed) && parsed >= 1) {
    const s = await getStoreByIdForOrder(parsed);
    if (!s) return { ok: false, code: "INVALID_STORE", message: "Store not found." };
    const radius = await getStoreServiceRadiusKm(parsed);
    return {
      ok: true,
      id: parsed,
      storeId: String(storeId),
      lat: s.latitude != null ? Number(s.latitude) : 0,
      lng: s.longitude != null ? Number(s.longitude) : 0,
      active: s.is_accepting_orders === true,
      radiusKm: radius,
    };
  }
  const s = await getStoreByStoreId(storeId);
  if (!s) return { ok: false, code: "INVALID_STORE", message: "Store not found." };
  const id = Number(s.id);
  const radius = await getStoreServiceRadiusKm(id);
  return {
    ok: true,
    id,
    storeId: s.store_id,
    lat: s.latitude != null ? Number(s.latitude) : 0,
    lng: s.longitude != null ? Number(s.longitude) : 0,
    active: (s as { is_accepting_orders?: boolean | null }).is_accepting_orders === true,
    radiusKm: (s as { delivery_radius_km?: number | string | null }).delivery_radius_km != null
      ? Number((s as { delivery_radius_km?: number | string | null }).delivery_radius_km)
      : radius,
  };
}

async function resolveDrop(
  input: StoreQuoteInput
): Promise<
  | { ok: true; lat: number; lng: number; pincode: string | null; city: string | null }
  | { ok: false; code: string; message: string }
> {
  if (input.addressId != null && input.customerId != null && input.customerId > 0) {
    const db = getDb();
    const [row] = await db
      .select({
        latitude: customerAddresses.latitude,
        longitude: customerAddresses.longitude,
        city: customerAddresses.city,
        postalCode: customerAddresses.postalCode,
      })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, input.addressId),
          eq(customerAddresses.customerId, input.customerId),
          eq(customerAddresses.isActive, true),
          isNull(customerAddresses.deletedAt)
        )
      )
      .limit(1);
    if (!row) return { ok: false, code: "INVALID_ADDRESS_DATA", message: "Address not found." };
    const lat = row.latitude != null ? Number(row.latitude) : 0;
    const lng = row.longitude != null ? Number(row.longitude) : 0;
    return {
      ok: true,
      lat,
      lng,
      pincode: normalizePincode(row.postalCode),
      city: normalizeCity(row.city),
    };
  }
  if (input.drop?.lat != null && input.drop.lng != null) {
    return {
      ok: true,
      lat: Number(input.drop.lat),
      lng: Number(input.drop.lng),
      pincode: normalizePincode(input.drop.pincode),
      city: normalizeCity(input.drop.city),
    };
  }
  return { ok: false, code: "INVALID_INPUT", message: "addressId or drop coords required." };
}

/**
 * Compute the canonical store quote. Same function is used by:
 *  - /v1/distance/store-quote (customer app anchor)
 *  - /v1/merchants/:id/menu (optional embedded quote, future)
 *  - /v1/billing/calculate (for `serviceable` flag)
 *  - rider payout preview
 */
export async function resolveStoreDeliveryQuote(
  input: StoreQuoteInput
): Promise<StoreQuoteResult> {
  const env = getEnv();
  const actor: StoreQuoteActor = input.actor === "rider" ? "rider" : "customer";
  const serviceTypeUpper = (input.serviceType ?? "FOOD").toUpperCase();
  const serviceTypeSlab: DeliveryServiceType =
    serviceTypeUpper === "RIDE" ? ("person_ride" as DeliveryServiceType) : (serviceTypeUpper.toLowerCase() as DeliveryServiceType);

  const store = await resolveStore(input.storeId);
  if (!store.ok) return store;

  const drop = await resolveDrop(input);
  if (!drop.ok) return drop;

  const route = await getRoute({
    origin: { lat: store.lat, lng: store.lng },
    destination: { lat: drop.lat, lng: drop.lng },
    profile: "driving",
    mapboxToken: env.MAPBOX_ACCESS_TOKEN ?? undefined,
    osrmBaseUrl: env.OSRM_BASE_URL ?? undefined,
    skipCache: input.skipCache === true,
  });

  const distanceKm = route.distanceKm;
  const durationMin = route.etaMinutes;

  const serviceRadiusKm = store.radiusKm ?? env.SERVICE_RADIUS_KM_DEFAULT;
  const outOfRange = distanceKm > serviceRadiusKm;
  const serviceable = store.active && !outOfRange;

  // Geo slab resolution
  const dropGeoRefs = await resolveDropGeoRefsFromPincode(drop.pincode);

  let slabQuote: SelectedSlabQuote | null = null;
  let deliveryFee = 0;
  let pricingEngine: "slab_geo" | "fallback_per_km" = "fallback_per_km";

  if (dropGeoRefs && distanceKm > 0) {
    const pickGeo =
      (dropGeoRefs.pincode && { level: "pincode" as const, refId: dropGeoRefs.pincode }) ||
      (dropGeoRefs.post_office && { level: "post_office" as const, refId: dropGeoRefs.post_office }) ||
      (dropGeoRefs.division && { level: "division" as const, refId: dropGeoRefs.division }) ||
      (dropGeoRefs.district && { level: "district" as const, refId: dropGeoRefs.district }) ||
      (dropGeoRefs.region && { level: "region" as const, refId: dropGeoRefs.region }) ||
      (dropGeoRefs.state && { level: "state" as const, refId: dropGeoRefs.state }) ||
      null;
    if (pickGeo) {
      try {
        const db = getDb();
        const slabs = await loadEffectiveDeliveryRateSlabs(db, {
          geoLevel: pickGeo.level,
          geoRefId: pickGeo.refId,
          serviceType: serviceTypeSlab,
          actorType: (actor === "rider" ? "rider" : "customer") as DeliveryActorType,
        });
        if (slabs.length > 0) {
          if (actor === "rider") {
            const calc = calculateProgressiveSlabAmount({
              distanceKm,
              slabs,
              waitingMinutes: input.riderWaitingMinutes ?? 0,
              applyRiderExtras: true,
            });
            if (calc.ok) {
              // Project rider progressive quote into selected-slab shape for consistent UI.
              slabQuote = {
                distanceKm: calc.quote.distanceKm,
                slabId: calc.quote.segments[0]?.slabId ?? 0,
                minKm: calc.quote.segments[0]?.minKm ?? 0,
                maxKm: calc.quote.segments[0]?.maxKm ?? null,
                baseFareApplied: calc.quote.baseFareApplied,
                perKmRate: calc.quote.segments[0]?.perKmRate ?? 0,
                rawDistanceAmount: calc.quote.preMinChargeTotal - calc.quote.baseFareApplied,
                preMinChargeTotal: calc.quote.preMinChargeTotal,
                minCharge: null,
                finalAmount: calc.quote.finalAmount,
              };
              deliveryFee = calc.quote.finalAmount;
              pricingEngine = "slab_geo";
            }
          } else {
            const calc = calculateProgressiveSlabAmount({
              distanceKm,
              slabs,
              applyRiderExtras: false,
            });
            if (calc.ok) {
              // Project customer progressive quote into selected-slab shape for
              // backward-compatible response payloads (`slab_quote`).
              slabQuote = {
                distanceKm: calc.quote.distanceKm,
                slabId: calc.quote.segments[0]?.slabId ?? 0,
                minKm: calc.quote.segments[0]?.minKm ?? 0,
                maxKm: calc.quote.segments[0]?.maxKm ?? null,
                baseFareApplied: calc.quote.baseFareApplied,
                perKmRate: calc.quote.segments[0]?.perKmRate ?? 0,
                rawDistanceAmount: calc.quote.preMinChargeTotal - calc.quote.baseFareApplied,
                preMinChargeTotal: calc.quote.preMinChargeTotal,
                // minCharge floor comes from the first slab in progressive mode.
                minCharge: null,
                finalAmount: calc.quote.finalAmount,
              };
              deliveryFee = calc.quote.finalAmount;
              pricingEngine = "slab_geo";
            }
          }
        }
      } catch {
        // fall through to fallback
      }
    }
  }

  if (pricingEngine === "fallback_per_km") {
    const base = env.DELIVERY_DEFAULT_BASE_INR ?? 25;
    const perKm = env.DELIVERY_DEFAULT_PER_KM_INR ?? 5;
    const computed = round2(base + distanceKm * perKm);
    const floor = env.DELIVERY_MIN_FEE_INR ?? 0;
    deliveryFee = Math.max(computed, floor);
  }

  deliveryFee = round2(deliveryFee);

  const gstPct = env.APPLY_GST_ON_DELIVERY_FEE
    ? Math.max(0, Math.min(100, env.DELIVERY_FEE_GST_PERCENT ?? 5))
    : 0;
  const deliveryGst = gstPct > 0 ? round2(deliveryFee * (gstPct / 100)) : 0;
  const finalDeliveryFee = round2(deliveryFee + deliveryGst);

  return {
    ok: true,
    quote: {
      store_id: store.storeId,
      actor,
      distance_km: round2(distanceKm),
      duration_min: round2(durationMin),
      delivery_fee: deliveryFee,
      delivery_gst: deliveryGst,
      final_delivery_fee: finalDeliveryFee,
      serviceable,
      unserviceable_reason: !store.active ? "store_inactive" : outOfRange ? "out_of_range" : null,
      service_radius_km: round2(serviceRadiusKm),
      source: route.source,
      cached: route.cached,
      approximate: route.approximate,
      pricing_engine: pricingEngine,
      slab_quote: slabQuote,
    },
  };
}
