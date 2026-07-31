import { calculateProgressiveSlabAmount } from "../delivery-slab-pricing/deliverySlabPricing.service.js";
import type { DeliveryActorType, DeliveryRateSlabRow, DeliveryServiceType } from "../delivery-slab-pricing/types.js";
import type {
  RideCustomerPricingRow,
  RideVehiclePricingType,
} from "../rider-payout-pricing/types.js";
import {
  loadEffectiveRideCustomerPricing,
  loadEffectiveServicePayoutRule,
} from "../rider-payout-pricing/riderPayoutPricing.repository.js";
import {
  fallbackSlabsToDeliveryRows,
  loadFallbackCustomerSlabs,
} from "../fallback-pricing/fallbackSlabPricing.repository.js";
import { catalogCodeToPricingVehicle } from "./catalogVehicleMap.js";
import {
  loadRideVehicleLimitsForState,
  resolveRidePricingGeoFromPickup,
  type RideVehicleLimitRow,
} from "./rideStateConfig.repository.js";
import { isCatalogOptionEligibleForTrip } from "./rideEligibility.service.js";
import { applyBikeLiteCustomerFare } from "./rideCustomerFare.js";
import { loadBikeLiteDiscount } from "../rides/pricing/rideVehicleDiscount.js";
import { resolveCustomerRideSurge } from "../rides/pricing/rideSurgeResolver.js";
import { formatRideCustomerRateCardSummary, formatRideWaitingChargeNote } from "./rideRateCardDisplay.js";
import { DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES } from "../../lib/ride-pickup-wait.js";
import { cachedRideQuoteValue } from "./rideQuoteConfigCache.js";

export type RideFareQuoteOk = {
  ok: true;
  stateId: string | null;
  pricingGeoLevel: string | null;
  pricingGeoRefId: string | null;
  pricingVehicle: RideVehiclePricingType | null;
  eligible: boolean;
  maxDistanceKm: number | null;
  baseFare: number;
  distanceFare: number;
  surgeTotal: number;
  finalFare: number;
  appliedSurges: Array<{
    name: string;
    amount: number;
    /** Phase 3 — funding mode for this surge (CUSTOMER_100 / COMPANY_100 / SHARED). */
    fundingMode?: "CUSTOMER_100" | "COMPANY_100" | "SHARED";
    customerShareAmount?: number;
    companyShareAmount?: number;
  }>;
  /** Phase 3 — sum of customer-funded portions across all applied surges. */
  surgeCustomerShare: number;
  /** Phase 3 — sum of company-funded portions across all applied surges. */
  surgeCompanyShare: number;
  rateCardSummary: string | null;
  waitingChargeNote: string | null;
};

export type RideFareQuoteFail = { ok: false; code: string; message: string };

export type RideFareQuoteResult = RideFareQuoteOk | RideFareQuoteFail;

export type RideQuotePickupArgs = {
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLng: number;
  tripKm: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
};

type PricingGeo = { level: string; refId: string };

type VehicleSlabBundle = {
  rideSlabs: DeliveryRateSlabRow[];
  rateCardSlabs: RideCustomerPricingRow[];
  pricingGeoLevel: string | null;
  pricingGeoRefId: string | null;
  fallbackWaitingPerMin: number;
};

export type RideQuoteContext = {
  tripKm: number;
  stateId: string | null;
  pricingGeo: PricingGeo | null;
  limits: RideVehicleLimitRow[];
  freeWaitMinutes: number;
  waitingChargePerMin: number;
  waitingChargeNote: string | null;
  /** Per pricing vehicle — loaded lazily into this map during batch. */
  slabsByVehicle: Map<RideVehiclePricingType, VehicleSlabBundle>;
  timings: {
    geoMs: number;
    configMs: number;
    slabsMs: number;
    pricingMs: number;
  };
};

const isDev = process.env.NODE_ENV !== "production";

function logBatchPerf(label: string, payload: Record<string, unknown>): void {
  if (!isDev) return;
  // eslint-disable-next-line no-console
  console.log(`[ride-quote-batch] ${label}`, JSON.stringify(payload));
}

function toDeliveryRows(slabs: RideCustomerPricingRow[]): DeliveryRateSlabRow[] {
  return slabs.map((s) => ({
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

function fallbackToRateCard(
  fallbackSlabs: Awaited<ReturnType<typeof loadFallbackCustomerSlabs>>,
  vehicleType: RideVehiclePricingType
): RideCustomerPricingRow[] {
  return fallbackSlabs.map((s) => ({
    id: s.id,
    geoLevel: "state" as const,
    geoRefId: "00000000-0000-0000-0000-000000000000",
    vehicleType: s.vehicleType ?? vehicleType,
    minKm: s.minKm,
    maxKm: s.maxKm,
    baseFare: s.baseFare,
    perKmRate: s.perKmRate,
    minCharge: s.minCharge,
    priority: s.priority,
    isActive: s.isActive,
  }));
}

async function loadCachedLimits(stateId: string): Promise<RideVehicleLimitRow[]> {
  return cachedRideQuoteValue(`limits:${stateId}`, () => loadRideVehicleLimitsForState(stateId));
}

async function loadCachedCustomerPricing(args: {
  level: string;
  refId: string;
  vehicleType: RideVehiclePricingType;
}): Promise<Awaited<ReturnType<typeof loadEffectiveRideCustomerPricing>>> {
  return cachedRideQuoteValue(
    `cust-slabs:${args.level}:${args.refId}:${args.vehicleType}`,
    () =>
      loadEffectiveRideCustomerPricing({
        level: args.level as never,
        refId: args.refId,
        vehicleType: args.vehicleType,
      })
  );
}

async function loadCachedFallbackSlabs(
  vehicleType: RideVehiclePricingType
): Promise<Awaited<ReturnType<typeof loadFallbackCustomerSlabs>>> {
  return cachedRideQuoteValue(`fallback-slabs:person_ride:${vehicleType}`, () =>
    loadFallbackCustomerSlabs({ service: "person_ride", vehicleType })
  );
}

async function loadCachedPayoutRule(args: {
  level: string;
  refId: string;
}): Promise<Awaited<ReturnType<typeof loadEffectiveServicePayoutRule>>> {
  return cachedRideQuoteValue(`payout:ride:${args.level}:${args.refId}`, () =>
    loadEffectiveServicePayoutRule({
      level: args.level as never,
      refId: args.refId,
      service: "ride",
    })
  );
}

async function loadVehicleSlabBundle(
  pricingGeo: PricingGeo | null,
  vehicleType: RideVehiclePricingType
): Promise<VehicleSlabBundle> {
  let rideSlabs: DeliveryRateSlabRow[] = [];
  let rateCardSlabs: RideCustomerPricingRow[] = [];
  let pricingGeoLevel: string | null = pricingGeo?.level ?? null;
  let pricingGeoRefId: string | null = pricingGeo?.refId ?? null;
  let fallbackWaitingPerMin = 0;

  if (pricingGeo) {
    const pricing = await loadCachedCustomerPricing({
      level: pricingGeo.level,
      refId: pricingGeo.refId,
      vehicleType,
    });
    rateCardSlabs = pricing.slabs;
    pricingGeoLevel = pricing.applied?.level ?? pricingGeo.level;
    pricingGeoRefId = pricing.applied?.refId ?? pricingGeo.refId;
    if (pricing.slabs.length > 0) {
      rideSlabs = toDeliveryRows(pricing.slabs);
    }
  }

  if (rideSlabs.length === 0) {
    const fallbackSlabs = await loadCachedFallbackSlabs(vehicleType);
    rideSlabs = fallbackSlabsToDeliveryRows(fallbackSlabs, "person_ride");
    rateCardSlabs = fallbackToRateCard(fallbackSlabs, vehicleType);
    fallbackWaitingPerMin = fallbackSlabs[0]?.waitingChargePerMin ?? 0;
    pricingGeoLevel = "fallback";
    pricingGeoRefId = null;
  }

  return {
    rideSlabs,
    rateCardSlabs,
    pricingGeoLevel,
    pricingGeoRefId,
    fallbackWaitingPerMin,
  };
}

/** Resolve geo + limits + wait note once for a pickup (shared across vehicles). */
export async function buildRideQuoteContext(
  args: RideQuotePickupArgs
): Promise<RideQuoteContext> {
  const tripKm = Math.max(0, args.tripKm);
  const t0 = Date.now();

  const { stateId, pricingGeo } = await resolveRidePricingGeoFromPickup({
    pickupLat: args.pickupLat,
    pickupLng: args.pickupLng,
    pickupPincode: args.pickupPincode,
    pickupState: args.pickupState,
  });
  const geoMs = Date.now() - t0;

  const t1 = Date.now();
  const limits = stateId ? await loadCachedLimits(stateId) : [];

  let freeWaitMinutes = DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES;
  let waitingChargePerMin = 0;
  if (pricingGeo) {
    const { rule } = await loadCachedPayoutRule({
      level: pricingGeo.level,
      refId: pricingGeo.refId,
    });
    if (rule) {
      freeWaitMinutes = Math.max(
        0,
        Math.round(rule.waitingFreeMinutes ?? DEFAULT_RIDE_PICKUP_FREE_WAIT_MINUTES)
      );
      waitingChargePerMin = Math.max(0, Number(rule.waitingChargePerMin ?? 0) || 0);
    }
  }
  const configMs = Date.now() - t1;

  const waitingChargeNote = formatRideWaitingChargeNote(freeWaitMinutes, waitingChargePerMin);

  return {
    tripKm,
    stateId,
    pricingGeo: pricingGeo
      ? { level: pricingGeo.level, refId: pricingGeo.refId }
      : null,
    limits,
    freeWaitMinutes,
    waitingChargePerMin,
    waitingChargeNote,
    slabsByVehicle: new Map(),
    timings: { geoMs, configMs, slabsMs: 0, pricingMs: 0 },
  };
}

async function ensureVehicleSlabs(
  ctx: RideQuoteContext,
  vehicleType: RideVehiclePricingType
): Promise<VehicleSlabBundle> {
  const cached = ctx.slabsByVehicle.get(vehicleType);
  if (cached) return cached;
  const t0 = Date.now();
  const bundle = await loadVehicleSlabBundle(ctx.pricingGeo, vehicleType);
  ctx.timings.slabsMs += Date.now() - t0;
  ctx.slabsByVehicle.set(vehicleType, bundle);
  return bundle;
}

function ineligibleOk(
  ctx: RideQuoteContext,
  pricingVehicle: RideVehiclePricingType | null,
  maxDistanceKm: number | null
): RideFareQuoteOk {
  return {
    ok: true,
    stateId: ctx.stateId,
    pricingGeoLevel: ctx.pricingGeo?.level ?? null,
    pricingGeoRefId: ctx.pricingGeo?.refId ?? null,
    pricingVehicle,
    eligible: false,
    maxDistanceKm,
    baseFare: 0,
    distanceFare: 0,
    surgeTotal: 0,
    finalFare: 0,
    appliedSurges: [],
    surgeCustomerShare: 0,
    surgeCompanyShare: 0,
    rateCardSummary: null,
    waitingChargeNote: null,
  };
}

/**
 * Quote one catalog code using a shared context (no re-geo / re-wait lookup).
 * Bike-lite derives from bike fare in memory when `bikeFinalFare` is provided by batch;
 * single-code path loads bike slabs once if needed.
 */
export async function quoteCustomerRideFareWithContext(
  ctx: RideQuoteContext,
  catalogCode: string,
  opts?: { bikeFinalFare?: number; bikeBaseFare?: number }
): Promise<RideFareQuoteResult> {
  const t0 = Date.now();
  const pricingVehicle = catalogCodeToPricingVehicle(catalogCode);
  const eligible = isCatalogOptionEligibleForTrip({
    catalogCode,
    tripKm: ctx.tripKm,
    limits: ctx.limits,
  });

  const maxDistanceKm =
    pricingVehicle && ctx.stateId
      ? (ctx.limits.find((l) => l.vehicleType === pricingVehicle)?.maxDistanceKm ?? null)
      : null;

  if (!eligible) {
    ctx.timings.pricingMs += Date.now() - t0;
    return ineligibleOk(ctx, pricingVehicle, maxDistanceKm);
  }

  if (!pricingVehicle) {
    ctx.timings.pricingMs += Date.now() - t0;
    return { ok: false, code: "NO_PRICING_CONTEXT", message: "Could not resolve ride pricing context" };
  }

  // Bike Lite = bike − ₹12 (customer slabs only). Prefer batch-provided bike fare.
  if (catalogCode === "bike-lite") {
    let bikeFinal = opts?.bikeFinalFare;
    let bikeBase = opts?.bikeBaseFare;
    if (bikeFinal == null || !(bikeFinal > 0)) {
      const bikeQuote = await quoteCustomerRideFareWithContext(ctx, "bike");
      if (bikeQuote.ok && bikeQuote.eligible && bikeQuote.finalFare > 0) {
        bikeFinal = bikeQuote.finalFare;
        bikeBase = bikeQuote.baseFare;
      }
    }
    if (bikeFinal != null && bikeFinal > 0) {
      const bikeLiteDiscount = await loadBikeLiteDiscount();
      const bikeLiteBase = applyBikeLiteCustomerFare(bikeFinal, bikeLiteDiscount);
      const surge = await resolveCustomerRideSurge({
        stateId: ctx.stateId,
        pricingVehicle,
        baseFareForPct: bikeLiteBase,
      });
      const finalFare =
        Math.round((bikeLiteBase + surge.customerShareTotal) * 100) / 100;
      const ratio = bikeFinal > 0 ? bikeLiteBase / bikeFinal : 1;
      const baseFare = Math.round((bikeBase ?? 0) * ratio * 100) / 100;
      const distanceFare = Math.round((bikeLiteBase - baseFare) * 100) / 100;
      const bikeSlabs = await ensureVehicleSlabs(ctx, pricingVehicle);
      ctx.timings.pricingMs += Date.now() - t0;
      return {
        ok: true,
        stateId: ctx.stateId,
        pricingGeoLevel: bikeSlabs.pricingGeoLevel,
        pricingGeoRefId: bikeSlabs.pricingGeoRefId,
        pricingVehicle,
        eligible: true,
        maxDistanceKm,
        baseFare,
        distanceFare,
        surgeTotal: surge.surgeTotal,
        finalFare,
        appliedSurges: surge.appliedSurges.map((a) => ({
          name: a.name,
          amount: a.appliedAmount,
          fundingMode: a.fundingMode,
          customerShareAmount: a.customerShareAmount,
          companyShareAmount: a.companyShareAmount,
        })),
        surgeCustomerShare: surge.customerShareTotal,
        surgeCompanyShare: surge.companyShareTotal,
        rateCardSummary: formatRideCustomerRateCardSummary(bikeSlabs.rateCardSlabs),
        waitingChargeNote: ctx.waitingChargeNote,
      };
    }
  }

  const bundle = await ensureVehicleSlabs(ctx, pricingVehicle);
  if (bundle.rideSlabs.length === 0) {
    ctx.timings.pricingMs += Date.now() - t0;
    return {
      ok: false,
      code: "NO_SLABS",
      message: "No ride customer pricing configured for this pickup area or fallback",
    };
  }

  const slabQuote = calculateProgressiveSlabAmount({
    distanceKm: ctx.tripKm,
    slabs: bundle.rideSlabs,
  });
  if (!slabQuote.ok) {
    ctx.timings.pricingMs += Date.now() - t0;
    return { ok: false, code: slabQuote.code, message: slabQuote.message };
  }

  const subtotal = slabQuote.quote.finalAmount;
  const slabFare = Math.round(subtotal * 100) / 100;
  const baseFare = slabQuote.quote.baseFareApplied;
  const distanceFare = subtotal - slabQuote.quote.baseFareApplied;

  // Phase 3 — apply surge on top of slab fare. Only the customer-funded share
  // is added to `finalFare`; the company-funded share is quoted for downstream
  // settlement so the rider still receives the full surge amount.
  const surge = await resolveCustomerRideSurge({
    stateId: ctx.stateId,
    pricingVehicle,
    baseFareForPct: slabFare,
  });
  const finalFare = Math.round((slabFare + surge.customerShareTotal) * 100) / 100;

  const waitNote =
    ctx.waitingChargeNote ??
    formatRideWaitingChargeNote(
      ctx.freeWaitMinutes,
      ctx.waitingChargePerMin || bundle.fallbackWaitingPerMin
    );

  ctx.timings.pricingMs += Date.now() - t0;
  return {
    ok: true,
    stateId: ctx.stateId,
    pricingGeoLevel: bundle.pricingGeoLevel,
    pricingGeoRefId: bundle.pricingGeoRefId,
    pricingVehicle,
    eligible: true,
    maxDistanceKm,
    baseFare,
    distanceFare,
    surgeTotal: surge.surgeTotal,
    finalFare,
    appliedSurges: surge.appliedSurges.map((a) => ({
      name: a.name,
      amount: a.appliedAmount,
      fundingMode: a.fundingMode,
      customerShareAmount: a.customerShareAmount,
      companyShareAmount: a.companyShareAmount,
    })),
    surgeCustomerShare: surge.customerShareTotal,
    surgeCompanyShare: surge.companyShareTotal,
    rateCardSummary: formatRideCustomerRateCardSummary(bundle.rateCardSlabs),
    waitingChargeNote: waitNote,
  };
}

/** Single-vehicle quote (placement / legacy). Builds a fresh context. */
export async function quoteCustomerRideFare(
  args: RideQuotePickupArgs & { catalogCode: string }
): Promise<RideFareQuoteResult> {
  const tripKm = Math.max(0, args.tripKm);
  // eslint-disable-next-line no-console
  console.log(
    "[ride-quote] fare_distance",
    JSON.stringify({
      catalogCode: args.catalogCode,
      fareCalculationDistanceKm: tripKm,
      pickupLat: args.pickupLat,
      pickupLng: args.pickupLng,
      dropLat: args.dropLat,
      dropLng: args.dropLng,
    })
  );
  const ctx = await buildRideQuoteContext(args);
  return quoteCustomerRideFareWithContext(ctx, args.catalogCode);
}

/** Batch quote: one geo/config resolve, in-memory slab math per vehicle. */
export async function quoteCustomerRideFareBatch(
  args: RideQuotePickupArgs & { catalogCodes: string[] }
): Promise<{
  ctx: RideQuoteContext;
  quotes: Record<string, RideFareQuoteResult>;
  totalMs: number;
}> {
  const t0 = Date.now();
  const codes = [...new Set(args.catalogCodes.map((c) => c.trim()).filter(Boolean))];
  // Bike before bike-lite so lite can reuse bike fare without nested geo.
  codes.sort((a, b) => {
    if (a === "bike" && b === "bike-lite") return -1;
    if (a === "bike-lite" && b === "bike") return 1;
    return a.localeCompare(b);
  });

  const ctx = await buildRideQuoteContext(args);
  const quotes: Record<string, RideFareQuoteResult> = {};
  let bikeFinalFare: number | undefined;
  let bikeBaseFare: number | undefined;

  for (const code of codes) {
    const result = await quoteCustomerRideFareWithContext(ctx, code, {
      bikeFinalFare,
      bikeBaseFare,
    });
    quotes[code] = result;
    if (code === "bike" && result.ok && result.eligible && result.finalFare > 0) {
      bikeFinalFare = result.finalFare;
      bikeBaseFare = result.baseFare;
    }
  }

  const totalMs = Date.now() - t0;
  logBatchPerf("done", {
    vehicleCount: codes.length,
    geoMs: ctx.timings.geoMs,
    configMs: ctx.timings.configMs,
    slabsMs: ctx.timings.slabsMs,
    pricingMs: ctx.timings.pricingMs,
    totalMs,
  });

  return { ctx, quotes, totalMs };
}
