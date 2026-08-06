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
import { loadDirectDeliveryRateSlabs } from "../delivery-slab-pricing/deliverySlabPricing.repository.js";
import {
  calculateProgressiveSlabAmount,
  type SelectedSlabQuote,
} from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import {
  computeDeliveryFallbackFee,
  getDeliveryFallbackRates,
} from "../delivery/deliveryFallback.config.js";
import { computeFallbackCustomerFee } from "../fallback-pricing/fallbackSlabPricing.service.js";
import { buildCustomerPricingBreakdown } from "../../lib/customer-pricing-breakdown.js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import { resolveRiderPayoutQuote } from "../rider-payout-pricing/resolveRiderPayoutQuote.js";
import { loadEffectiveRideCustomerPricing, loadEffectiveParcelCustomerPricing } from "../rider-payout-pricing/riderPayoutPricing.repository.js";
import type { GeoHierarchyLevel, RideVehiclePricingType } from "../rider-payout-pricing/types.js";

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
  drop?: { lat: number; lng: number; pincode?: string | null; city?: string | null; state?: string | null } | null;
  /** Defaults to "customer". Rider uses progressive slab calc. */
  actor?: StoreQuoteActor;
  /** FOOD | PARCEL | RIDE — maps to DeliveryServiceType. Default FOOD. */
  serviceType?: "FOOD" | "PARCEL" | "RIDE";
  /** Optional override for waiting minutes (rider actor only). */
  riderWaitingMinutes?: number;
  /** Rider payout v2: separate pickup (rider→merchant) and drop (merchant→customer) km. */
  riderPickupKm?: number;
  riderDropKm?: number;
  /** Ride / parcel vehicle type for vehicle-scoped customer pricing. */
  rideVehicleType?: RideVehiclePricingType;
  /** Rider id for GMitra Max surge/waiting eligibility. */
  riderId?: number | null;
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
        unserviceable_reason?: "out_of_range" | "store_inactive" | "no_delivery_slab" | "no_geo_match" | null;
        service_radius_km: number;
        source: "mapbox" | "osrm" | "haversine";
        cached: boolean;
        approximate: boolean;
        pricing_engine:
          | "slab_geo"
          | "fallback_slab"
          | "fallback_per_km"
          | "no_slab_configured"
          | "no_geo_match"
          | "slab_invalid";
        /** Geo level at which slabs were resolved (pincode/post_office/district/region/state). */
        applied_geo_level?: string | null;
        /** Raw slab quote for debugging / breakdowns. */
        slab_quote?: SelectedSlabQuote | null;
        /**
         * Populated when slabs WERE found at some geo level but `validateEffectiveSlabs`
         * rejected them (overlap / gap / missing zero slab / etc). Lets the dashboard
         * surface the exact reason so ops can fix the offending rate card immediately.
         */
        slab_validation_error?: { code: string; message: string } | null;
        /** Base route duration before weather messaging adjustment. */
        base_duration_min?: number;
        weather_delay_minutes?: number;
        weather_adjusted_duration_min?: number;
        weather_impact_label?: string | null;
        weather_severity?: string | null;
        weather_chip_label?: string | null;
        weather_show_impact?: boolean;
        /**
         * Itemised customer-facing breakdown (base fare, distance fare, min
         * charge, GST, source). Built by `buildCustomerPricingBreakdown` so
         * the checkout sheet and customer support tools see the same line
         * items the billing engine used.
         */
        customer_pricing?: import("@gatimitra/contracts").CustomerPricingBreakdown;
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
  | { ok: true; lat: number; lng: number; pincode: string | null; city: string | null; state: string | null }
  | { ok: false; code: string; message: string }
> {
  if (input.addressId != null && input.customerId != null && input.customerId > 0) {
    const db = getDb();
    const [row] = await db
      .select({
        latitude: customerAddresses.latitude,
        longitude: customerAddresses.longitude,
        city: customerAddresses.city,
        state: customerAddresses.state,
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
      // State name (e.g. "West Bengal") used by resolveDropGeoRefsFromPincode
      // as a fallback when pincode→state chain is broken in the geo tables.
      // Without it, valid state-level slabs go un-applied and we drop to env
      // defaults silently.
      state: normalizeCity(row.state),
    };
  }
  if (input.drop?.lat != null && input.drop.lng != null) {
    return {
      ok: true,
      lat: Number(input.drop.lat),
      lng: Number(input.drop.lng),
      pincode: normalizePincode(input.drop.pincode),
      city: normalizeCity(input.drop.city),
      state: normalizeCity(input.drop.state ?? null),
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

  // Geo slab resolution (must run before serviceability is computed).
  //
  // Pass `drop.state` as the fallback so that when `pincode_post_offices` is
  // incomplete for this pincode (e.g. a newly-onboarded area where the chain
  // hasn't been seeded), state-level slabs still resolve via the state-name
  // lookup. Without this, the engine silently drops to env defaults (₹25 base
  // + ₹5/km) and the customer's bill shows that instead of the configured
  // rate card.
  const dropGeoRefs = await resolveDropGeoRefsFromPincode(drop.pincode, drop.state);

  let slabQuote: SelectedSlabQuote | null = null;
  let deliveryFee = 0;
  let pricingEngine:
    | "slab_geo"
    | "fallback_slab"
    | "fallback_per_km"
    | "no_slab_configured"
    | "no_geo_match"
    | "slab_invalid" = "fallback_per_km";
  let appliedGeoLevel: string | null = null;
  /** Diagnostic — populated when slabs were found but rejected by validateEffectiveSlabs. */
  let slabValidationError: { code: string; message: string } | null = null;

  if (dropGeoRefs && distanceKm > 0) {
    // Walk ancestor levels from most-specific to least-specific using UUIDs already resolved
    // by resolveDropGeoRefsFromPincode (LEFT JOINs — robust even when chain links are missing).
    // This avoids the SQL chain walk in delivery_rate_slabs_effective() which uses INNER JOINs
    // and silently stops at pincode level when pincode_post_offices has no row for the pincode.
    type GeoCandidate = { level: "state" | "region" | "district" | "division" | "post_office" | "pincode"; refId: string };
    const geoLevelsToTry: GeoCandidate[] = [];
    if (dropGeoRefs.pincode)     geoLevelsToTry.push({ level: "pincode",     refId: dropGeoRefs.pincode });
    if (dropGeoRefs.post_office) geoLevelsToTry.push({ level: "post_office", refId: dropGeoRefs.post_office });
    if (dropGeoRefs.division)    geoLevelsToTry.push({ level: "division",    refId: dropGeoRefs.division });
    if (dropGeoRefs.district)    geoLevelsToTry.push({ level: "district",    refId: dropGeoRefs.district });
    if (dropGeoRefs.region)      geoLevelsToTry.push({ level: "region",      refId: dropGeoRefs.region });
    if (dropGeoRefs.state)       geoLevelsToTry.push({ level: "state",       refId: dropGeoRefs.state });

    let slabs: DeliveryRateSlabRow[] = [];
    const slabWalkAttempts: Array<{ level: string; refId: string; rows: number }> = [];

    // PARCEL + vehicle: prefer parcel_customer_pricing (RIDE-style), then fall back to delivery_rate_slabs.
    let usedParcelVehiclePricing = false;
    if (
      actor !== "rider" &&
      serviceTypeSlab === "parcel" &&
      input.rideVehicleType &&
      geoLevelsToTry.length > 0
    ) {
      const start = geoLevelsToTry[0]!;
      try {
        const parcelPricing = await loadEffectiveParcelCustomerPricing({
          level: start.level,
          refId: start.refId,
          vehicleType: input.rideVehicleType,
        });
        if (parcelPricing.slabs.length > 0) {
          usedParcelVehiclePricing = true;
          appliedGeoLevel = parcelPricing.applied?.level ?? start.level;
          slabs = parcelPricing.slabs.map((s) => ({
            id: s.id,
            geoLevel: s.geoLevel,
            geoRefId: s.geoRefId,
            serviceType: "parcel" as DeliveryServiceType,
            actorType: "customer" as DeliveryActorType,
            minKm: s.minKm,
            maxKm: s.maxKm,
            baseFare: s.baseFare,
            perKmRate: s.perKmRate,
            minCharge: s.minCharge,
            priority: s.priority,
            isActive: s.isActive,
          }));
          slabWalkAttempts.push({
            level: appliedGeoLevel ?? start.level,
            refId: parcelPricing.applied?.refId ?? start.refId,
            rows: slabs.length,
          });
        }
      } catch {
        // fall through to delivery_rate_slabs
      }
    }

    try {
      if (!usedParcelVehiclePricing) {
        const db = getDb();
        for (const geo of geoLevelsToTry) {
          const result = await loadDirectDeliveryRateSlabs(db, {
            geoLevel: geo.level,
            geoRefId: geo.refId,
            serviceType: serviceTypeSlab,
            actorType: (actor === "rider" ? "rider" : "customer") as DeliveryActorType,
          });
          slabWalkAttempts.push({ level: geo.level, refId: geo.refId, rows: result.length });
          if (result.length > 0) {
            slabs = result;
            appliedGeoLevel = geo.level;
            break;
          }
        }
      }
    } catch {
      // fall through to no_slab_configured / fallback
    }
    // One log line per quote so ops can see (1) which pincode/state UUIDs we
    // resolved, (2) every level we tried, (3) how many rows each level returned.
    // Tagged for easy grepping: `grep [delivery-slabs] server.log`.
    // eslint-disable-next-line no-console
    console.log(
      "[delivery-slabs] walk",
      JSON.stringify({
        store_id: store.storeId,
        actor,
        service: serviceTypeSlab,
        drop_pincode: drop.pincode,
        drop_state: drop.state,
        distance_km: distanceKm,
        geo_refs: dropGeoRefs,
        attempts: slabWalkAttempts,
        matched_level: appliedGeoLevel,
        matched_count: slabs.length,
      })
    );

    if (slabs.length > 0) {
      if (actor === "rider") {
        const geoLevel = (appliedGeoLevel ?? "pincode") as GeoHierarchyLevel;
        const geoRefId =
          geoLevelsToTry.find((g) => g.level === appliedGeoLevel)?.refId ??
          dropGeoRefs.pincode ??
          dropGeoRefs.state ??
          "";

        if (geoRefId) {
          const pickupKm = input.riderPickupKm ?? 0;
          const dropKm = input.riderDropKm ?? distanceKm;
          // Rider Fare Engine v3.0: rider payout is a percentage of the
          // customer's fare, so resolve the customer-side quote for this
          // same store/drop/distance first (route is cached, so this is
          // cheap) rather than duplicating the customer slab-walk logic here.
          const customerQuote = await resolveStoreDeliveryQuote({ ...input, actor: "customer" });
          const customerFare = customerQuote.ok ? customerQuote.quote.delivery_fee : 0;
          const riderQuote =
            customerFare > 0
              ? await resolveRiderPayoutQuote({
                  level: geoLevel,
                  refId: geoRefId,
                  service:
                    serviceTypeSlab === "parcel"
                      ? "parcel"
                      : serviceTypeSlab === "person_ride"
                        ? "ride"
                        : "food",
                  customerFare,
                  pickupKm,
                  dropKm,
                  waitingMinutes: input.riderWaitingMinutes ?? 0,
                  riderId: input.riderId,
                  vehicleType: input.rideVehicleType ?? null,
                })
              : { ok: false as const, code: "NO_CUSTOMER_FARE", message: "" };
          if (riderQuote.ok) {
            slabQuote = {
              distanceKm: riderQuote.quote.pickupKm + riderQuote.quote.dropKm,
              slabId: riderQuote.quote.ruleId,
              minKm: 0,
              maxKm: null,
              baseFareApplied: 0,
              perKmRate: 0,
              rawDistanceAmount: riderQuote.quote.pickupAmount + riderQuote.quote.dropAmount,
              preMinChargeTotal: riderQuote.quote.subtotalBeforeSurge,
              minCharge: null,
              finalAmount: riderQuote.quote.finalAmount,
            };
            deliveryFee = riderQuote.quote.finalAmount;
            pricingEngine = "slab_geo";
          }
        }

        if (pricingEngine !== "slab_geo") {
          const calc = calculateProgressiveSlabAmount({
            distanceKm,
            slabs,
            waitingMinutes: input.riderWaitingMinutes ?? 0,
            applyRiderExtras: true,
          });
          if (calc.ok) {
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
        }
      } else if (serviceTypeSlab === "person_ride" && input.rideVehicleType) {
        const geoLevel = (appliedGeoLevel ?? "pincode") as GeoHierarchyLevel;
        const geoRefId =
          geoLevelsToTry.find((g) => g.level === appliedGeoLevel)?.refId ??
          dropGeoRefs.pincode ??
          dropGeoRefs.state ??
          "";
        let rideSlabs: DeliveryRateSlabRow[] = slabs;
        if (geoRefId) {
          const ridePricing = await loadEffectiveRideCustomerPricing({
            level: geoLevel,
            refId: geoRefId,
            vehicleType: input.rideVehicleType,
          });
          if (ridePricing.slabs.length > 0) {
            rideSlabs = ridePricing.slabs.map((s) => ({
              id: s.id,
              geoLevel: s.geoLevel,
              geoRefId: s.geoRefId,
              serviceType: "person_ride" as DeliveryServiceType,
              actorType: "customer" as DeliveryActorType,
              minKm: s.minKm,
              maxKm: s.maxKm,
              baseFare: s.baseFare,
              perKmRate: s.perKmRate,
              minCharge: s.minCharge,
              priority: s.priority,
              isActive: s.isActive,
            }));
          }
        }
        const calc = calculateProgressiveSlabAmount({
          distanceKm,
          slabs: rideSlabs,
          applyRiderExtras: false,
        });
        if (calc.ok) {
          const sortedSlabs = [...rideSlabs].sort(
            (a, b) =>
              a.minKm - b.minKm ||
              ((a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)) ||
              b.priority - a.priority ||
              a.id - b.id
          );
          const includedKm = Math.max(0, Number(sortedSlabs[0]?.maxKm ?? 0) || 0);
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
            segments: calc.quote.segments,
            includedKm,
          };
          deliveryFee = calc.quote.finalAmount;
          pricingEngine = "slab_geo";
        } else {
          pricingEngine = "slab_invalid";
          slabValidationError = { code: calc.code, message: calc.message };
          console.warn(
            "[delivery-slabs] validation failed — bill falling back to env defaults",
            JSON.stringify({
              store_id: store.storeId,
              actor,
              distance_km: distanceKm,
              applied_geo_level: appliedGeoLevel,
              error: slabValidationError,
              slab_ids: rideSlabs.map((s) => s.id),
            })
          );
        }
      } else {
        const calc = calculateProgressiveSlabAmount({
          distanceKm,
          slabs,
          applyRiderExtras: false,
        });
        if (calc.ok) {
          const sortedSlabs = [...slabs].sort(
            (a, b) =>
              a.minKm - b.minKm ||
              ((a.maxKm ?? 1e9) - (b.maxKm ?? 1e9)) ||
              b.priority - a.priority ||
              a.id - b.id
          );
          const includedKm = Math.max(0, Number(sortedSlabs[0]?.maxKm ?? 0) || 0);
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
            segments: calc.quote.segments,
            includedKm,
          };
          deliveryFee = calc.quote.finalAmount;
          pricingEngine = "slab_geo";
        } else {
          pricingEngine = "slab_invalid";
          slabValidationError = { code: calc.code, message: calc.message };
          console.warn(
            "[delivery-slabs] validation failed — bill falling back to env defaults",
            JSON.stringify({
              store_id: store.storeId,
              actor,
              distance_km: distanceKm,
              applied_geo_level: appliedGeoLevel,
              error: slabValidationError,
              slab_ids: slabs.map((s) => s.id),
              slabs: slabs.map((s) => ({
                id: s.id,
                min: s.minKm,
                max: s.maxKm,
                base: s.baseFare,
                perKm: s.perKmRate,
                min_charge: s.minCharge,
                priority: s.priority,
                active: s.isActive,
              })),
            })
          );
        }
      }
    } else {
      // Pincode is known in geo tables but no delivery slab is configured at any ancestor level.
      // Mark area as not serviceable — do NOT silently fall back to env defaults here.
      pricingEngine = "no_slab_configured";
      deliveryFee = 0;
    }
  } else if (!dropGeoRefs) {
    // Pincode is completely unknown in the geo tables — use env defaults as a last resort
    // so existing stores in unmapped areas stay operational during data onboarding.
    pricingEngine = "no_geo_match";
    // eslint-disable-next-line no-console
    console.warn(
      "[delivery-slabs] no_geo_match — env defaults will be used",
      JSON.stringify({
        store_id: store.storeId,
        drop_pincode: drop.pincode,
        drop_state: drop.state,
        hint:
          "Either add this pincode to `pincodes` + `pincode_post_offices`, or save the state name on customer_addresses.state. The state-name fallback resolves to a state UUID and reuses your state-level slabs.",
      })
    );
  }

  if (
    pricingEngine === "fallback_per_km" ||
    pricingEngine === "no_geo_match" ||
    pricingEngine === "slab_invalid"
  ) {
    const fallback = await computeFallbackCustomerFee({
      service: serviceTypeSlab,
      distanceKm,
      vehicleType: input.rideVehicleType,
    });
    deliveryFee = fallback.fee;
    if (fallback.engine === "fallback_slab" && fallback.slabQuote) {
      pricingEngine = "fallback_slab";
      const sq = fallback.slabQuote;
      slabQuote = {
        distanceKm: sq.distanceKm,
        slabId: sq.segments[0]?.slabId ?? 0,
        minKm: sq.segments[0]?.minKm ?? 0,
        maxKm: sq.segments[0]?.maxKm ?? null,
        baseFareApplied: sq.baseFareApplied,
        perKmRate: sq.segments[0]?.perKmRate ?? 0,
        rawDistanceAmount: fallback.distanceFare,
        preMinChargeTotal: sq.finalAmount,
        minCharge: null,
        finalAmount: sq.finalAmount,
        segments: sq.segments,
      };
    } else if (pricingEngine === "fallback_per_km") {
      const fallbackRates = await getDeliveryFallbackRates();
      deliveryFee = computeDeliveryFallbackFee(distanceKm, fallbackRates);
    }
  }

  deliveryFee = round2(deliveryFee);

  // Serviceability: not serviceable when store inactive, out of range, OR no slab configured for this geo.
  const noSlabConfigured = pricingEngine === "no_slab_configured";
  const serviceable = store.active && !outOfRange && !noSlabConfigured;

  const gstPct = env.APPLY_GST_ON_DELIVERY_FEE
    ? Math.max(0, Math.min(100, env.DELIVERY_FEE_GST_PERCENT ?? 5))
    : 0;
  const deliveryGst = gstPct > 0 ? round2(deliveryFee * (gstPct / 100)) : 0;
  const finalDeliveryFee = round2(deliveryFee + deliveryGst);

  let weatherDelayMinutes = 0;
  let weatherImpactLabel: string | null = null;
  let weatherSeverity: string | null = null;
  let weatherChipLabel: string | null = null;
  let weatherShowImpact = false;
  try {
    const { resolveZoneWeather } = await import("../weather/weather.service.js");
    const weather = await resolveZoneWeather({
      lat: drop.lat,
      lng: drop.lng,
      cityHint: drop.city,
      trigger: "eta_calculation",
    });
    weatherDelayMinutes = weather.etaDelayMinutes;
    weatherImpactLabel = weather.etaImpactLabel;
    weatherSeverity = weather.severity;
    weatherChipLabel = weather.chipLabel;
    weatherShowImpact = weather.etaDelayMinutes > 0;
  } catch {
    // non-blocking — quote still valid without weather
  }

  const adjustedDurationMin = round2(durationMin + weatherDelayMinutes);

  const customerPricing = buildCustomerPricingBreakdown({
    service: serviceTypeSlab,
    pricingEngine,
    distanceKm,
    deliveryFee,
    deliveryGst,
    slabQuote,
    appliedGeoLevel,
    rideVehicleType: input.rideVehicleType ?? null,
  });

  return {
    ok: true,
    quote: {
      store_id: store.storeId,
      actor,
      distance_km: round2(distanceKm),
      duration_min: adjustedDurationMin,
      base_duration_min: round2(durationMin),
      weather_delay_minutes: weatherDelayMinutes,
      weather_adjusted_duration_min: adjustedDurationMin,
      weather_impact_label: weatherImpactLabel,
      weather_severity: weatherSeverity,
      weather_chip_label: weatherChipLabel,
      weather_show_impact: weatherShowImpact,
      delivery_fee: deliveryFee,
      delivery_gst: deliveryGst,
      final_delivery_fee: finalDeliveryFee,
      serviceable,
      unserviceable_reason: !store.active
        ? "store_inactive"
        : outOfRange
          ? "out_of_range"
          : noSlabConfigured
            ? "no_delivery_slab"
            : null,
      applied_geo_level: appliedGeoLevel,
      service_radius_km: round2(serviceRadiusKm),
      source: route.source,
      cached: route.cached,
      approximate: route.approximate,
      pricing_engine: pricingEngine,
      slab_quote: slabQuote,
      slab_validation_error: slabValidationError,
      customer_pricing: customerPricing,
    },
  };
}
