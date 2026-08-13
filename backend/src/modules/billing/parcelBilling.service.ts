import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "../../config/env.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import { getRulesetVersion, loadBillingDatasetUncached } from "./billing.repository.js";
import { resolveGeoLocation, type ResolveGeoLocationResult } from "./geoLocationResolver.js";
import type { BillContext, BillingResult } from "./types.js";
import type { ComputeBillResult } from "./billing.service.js";
import {
  loadPlatformOfferLifetimeUseCounts,
  loadPlatformOfferUsageCountsForUser,
} from "./platformOfferUsage.service.js";
import { platformOfferCouponCodesMatch } from "./platformOfferCouponCode.js";
import {
  applyDynamicSurchargesToBilling,
  resolveActiveDynamicSurchargesFromRefs,
} from "../../lib/dynamic-pricing.js";
import { resolveOrderLegVehicleType } from "../../lib/resolve-rider-legs-for-order.js";

function sanitizePlaceholder(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (t === "—" || t === "–" || t === "-" || t === "--" || t === "---") return null;
  const lower = t.toLowerCase();
  if (lower === "n/a" || lower === "na" || lower === "null" || lower === "none" || lower === "unknown") {
    return null;
  }
  return t;
}

function normalizePincode(raw: unknown): string | null {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D/g, "").trim();
  return digits.length >= 3 ? digits : null;
}

export type ComputeBillForParcelInput = {
  customerId: number;
  /** Slab-quoted parcel fare (excludes billing surcharges and tip). */
  parcelFare: number;
  distanceKm: number;
  pickupLat: number;
  pickupLng: number;
  tipAmount?: number;
  couponCode?: string | null;
  pickupPincode?: string | null;
  pickupState?: string | null;
  cityName?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
  selectedPlatformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  /** Parcel vehicle category (2_wheeler, 3_wheeler, …) for vehicle-specific offers. */
  vehicleType?: string | null;
  /** Payment mode at placement (online, cash, …). */
  paymentMode?: string | null;
  now?: Date;
  useCache?: boolean;
  /** When provided (batch/quote path), skip reverse-geocode / geo resolve. */
  resolvedGeo?: ResolveGeoLocationResult | null;
};

export function enrichParcelBillingSnapshot(
  billingSnapshot: Record<string, unknown> | null | undefined,
  opts: { parcelFare: number; distanceKm: number }
): Record<string, unknown> {
  const base =
    billingSnapshot && typeof billingSnapshot === "object" ? { ...billingSnapshot } : {};
  const parcelFare = Math.max(0, Math.round(opts.parcelFare * 100) / 100);
  if (base.parcel_fare == null) base.parcel_fare = parcelFare;
  if (base.fare_amount == null) base.fare_amount = parcelFare;
  if (base.item_total == null) base.item_total = parcelFare;
  if (base.serviceType == null) base.serviceType = "PARCEL";
  if (base.distanceKm == null && Number.isFinite(opts.distanceKm)) base.distanceKm = opts.distanceKm;
  if (base.computedAt == null) base.computedAt = new Date().toISOString();
  return base;
}

/**
 * Parcel billing — same config-driven rule engine as FOOD/RIDE, with the slab-quoted
 * parcel fare as the item subtotal. Applies PARCEL charge rules (platform/booking fee,
 * surge, …), platform offers/coupons (geo-mapped, backend-authoritative) and PARCEL tax
 * (GST) rules. Distance is already priced into the fare, so delivery is 0.
 *
 * Mirrors computeBillForRide (no first-ride person-ride gate). Backend is the single
 * source of truth: the returned final_amount is the authoritative customer payable.
 */
export async function computeBillForParcel(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: ComputeBillForParcelInput
): Promise<ComputeBillResult> {
  const env = getEnv();
  const parcelFare = Math.max(0, Math.round(input.parcelFare * 100) / 100);
  const tipAmount = input.tipAmount ?? 0;

  if (!env.BILLING_RULES_ENABLED) {
    const finalAmount = parcelFare + tipAmount;
    const snapshot = enrichParcelBillingSnapshot(null, {
      parcelFare,
      distanceKm: input.distanceKm,
    });
    return {
      ok: true,
      billing: {
        item_total: parcelFare,
        addon_total: 0,
        discount_total: 0,
        delivery_fee: 0,
        delivery_fee_gross: 0,
        delivery_subsidy: 0,
        platform_fee: 0,
        packaging_fee: 0,
        surge_fee: 0,
        small_order_fee: 0,
        convenience_fee: 0,
        misc_fee: 0,
        tax_total: 0,
        tip_amount: tipAmount,
        donation_amount: 0,
        final_amount: finalAmount,
        items_net_after_discounts: parcelFare,
        taxes_by_group: {},
        gst_components: {
          items: { original: parcelFare, discount: 0, taxable_value: parcelFare, gst: 0 },
          delivery: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          platform: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          surge: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          packaging: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          small_order: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          convenience: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          subscription: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        },
        gst_totals: { total_discount: 0, total_tax: 0, final_payable: finalAmount },
        charges: [],
        discounts: [],
        taxes: [],
        breakdown_steps: [],
        ruleset_version: 1,
        eligible_subtotal: parcelFare,
        order_line_eligibility: [
          { menuItemId: "parcel", lineTotal: parcelFare, quantity: 1, isDiscountEligible: true, ineligibilityReason: null },
        ],
        order_line_pricing: [
          {
            menuItemId: "parcel",
            quantity: 1,
            catalogLineTotal: parcelFare,
            effectiveLineTotal: parcelFare,
            offerDiscountAmount: 0,
            appliedOfferId: null,
            appliedOfferLabel: null,
            appliedOfferType: null,
            appliedOfferDiscountPct: null,
            appliedOfferDiscountFlat: null,
            isDiscountEligible: true,
            ineligibilityReason: null,
          },
        ],
      } satisfies BillingResult,
      snapshot: { ...snapshot, final_amount: finalAmount },
    };
  }

  const couponCode = input.couponCode?.trim() || null;
  const serviceType = "PARCEL";
  const distanceKm = Math.max(0, input.distanceKm);
  const vehicleType = (input.vehicleType ?? "").trim().toLowerCase() || null;
  const paymentMode = (input.paymentMode ?? "").trim().toLowerCase() || null;

  const pickupPostalCode = normalizePincode(input.pickupPincode);
  const pickupStateName = sanitizePlaceholder(input.pickupState);
  const cityName = sanitizePlaceholder(input.cityName);

  const calcGeo =
    input.resolvedGeo ??
    (await resolveGeoLocation({
      savedPincode: pickupPostalCode,
      savedState: pickupStateName,
      savedCity: cityName,
      latitude: input.pickupLat,
      longitude: input.pickupLng,
    }));
  const dropGeoRefByLevel = calcGeo.refs;
  const platformOfferGeoBindingEffectiveIds = calcGeo.geoBoundOfferIds;
  const checkoutCouponGeoBindingEffectiveIds = calcGeo.geoBoundCouponIds;

  const userSegRaw = input.userSegment ?? "ALL";
  const userSegment: "NEW" | "EXISTING" | "ALL" =
    userSegRaw === "NEW" || userSegRaw === "EXISTING" ? userSegRaw : "ALL";

  const version = await getRulesetVersion(db);
  const merchantStoreId = 0;
  const cacheKey = billingDatasetCacheKey(version, merchantStoreId, couponCode, serviceType);
  const useCache = input.useCache !== false;
  let dataset = useCache ? getCachedBillingDataset(cacheKey) : null;
  if (!dataset) {
    dataset = await loadBillingDatasetUncached(db, {
      merchantStoreId,
      couponCode,
      serviceType,
      ...(input.customerId > 0 ? { userId: input.customerId } : {}),
    } as Parameters<typeof loadBillingDatasetUncached>[1] & { userId?: number });
    if (useCache) setCachedBillingDataset(cacheKey, dataset);
  }

  const ctx: BillContext = {
    itemSubtotal: parcelFare,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [{ menuItemId: "parcel", lineTotal: parcelFare, quantity: 1, discountEligible: true }],
    distanceKm,
    merchantStoreId,
    merchantParentId: null,
    now: input.now ?? new Date(),
    userType: "customer",
    userSegment,
    couponCode,
    lineCategories: [{ categoryName: "parcel" }],
    itemPackagingTotal: 0,
    packagingChargeAmount: 0,
    deliveryChargePerKm: 0,
    serviceType,
    cityName,
    dropPostalCode: pickupPostalCode,
    dropGeoRefByLevel,
    platformOfferGeoBindingEffectiveIds,
    checkoutCouponGeoBindingEffectiveIds,
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromSlabsGeoV2: 0,
    deliverySlabsGeoV2Quote: null,
    deliverySlabsGeoV2AppliedGeo: null,
    deliveryFeeFromGeo: null,
    deliveryMinimumInr: 0,
    deliveryDefaultBaseInr: 0,
    deliveryDefaultPerKmInr: 0,
    tipAmount,
    donationAmount: 0,
    subscriptionOptIn: false,
    customerSubscriptionActive: false,
    customerSubscriptionFreeDeliveryEligible: false,
    isSelfPickup: true,
    deliveryPricingEngine: undefined,
    checkoutAudience: "CUSTOMER",
    completedPersonRideCount: null,
    rideType: null,
    vehicleType,
    paymentMode,
    selectedPlatformOfferId: (() => {
      const explicit = input.selectedPlatformOfferId ?? null;
      if (explicit != null) return explicit;
      if (couponCode && !dataset.coupon) {
        const matched = dataset.platformOffers.find((o) =>
          platformOfferCouponCodesMatch(o.couponCode, couponCode)
        );
        if (matched) return matched.id;
      }
      return null;
    })(),
    selectedMerchantOfferId: null,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
  };

  // Per-user / lifetime platform offer caps.
  if (input.customerId > 0) {
    const platformWithLimits = dataset.platformOffers.filter(
      (o) =>
        (o.maxUsesPerUser != null && o.maxUsesPerUser > 0) ||
        (o.maxUsesPerDay != null && o.maxUsesPerDay > 0) ||
        (o.maxUsesPerMonth != null && o.maxUsesPerMonth > 0)
    );
    if (platformWithLimits.length > 0) {
      ctx.platformOfferUsagesByUser = await loadPlatformOfferUsageCountsForUser(
        db,
        input.customerId,
        platformWithLimits.map((o) => o.id)
      );
    }
    const platformWithTotal = dataset.platformOffers.filter(
      (o) => o.maxUsesTotal != null && o.maxUsesTotal > 0
    );
    if (platformWithTotal.length > 0) {
      ctx.platformOfferLifetimeUseCounts = await loadPlatformOfferLifetimeUseCounts(
        db,
        platformWithTotal.map((o) => o.id)
      );
    }
  }

  const billing = executeBillingPipeline(ctx, dataset);

  // Dynamic pricing (night/rain/peak/festival/…): customer portion → bill, company portion
  // recorded. vehicleType: the order's booked vehicle_category, so a vehicle-specific surge
  // actually applies to real orders instead of only the all-vehicle rule.
  const dyn = await resolveActiveDynamicSurchargesFromRefs({
    refs: calcGeo.refs,
    service: "parcel",
    vehicleType: resolveOrderLegVehicleType({
      service: "parcel",
      parcelVehicleCategory: vehicleType,
    }),
    base: billing.items_net_after_discounts,
    distanceKm,
    now: input.now,
  }).catch(() => null);
  let companyDynamicSubsidy = 0;
  if (dyn) companyDynamicSubsidy = applyDynamicSurchargesToBilling(billing, dyn).companySubsidy;

  const snapshot = enrichParcelBillingSnapshot(
    { ...(billing as unknown as Record<string, unknown>) },
    { parcelFare, distanceKm }
  );
  if (dyn && dyn.surcharges.length > 0) {
    snapshot.dynamic_surcharges = dyn.surcharges;
    snapshot.company_dynamic_subsidy = companyDynamicSubsidy;
  }

  return { ok: true, billing, snapshot };
}

/** Resolve pickup geo once for a parcel quote-batch billing pass. */
export async function resolveParcelBillingGeo(input: {
  pickupLat: number;
  pickupLng: number;
  pickupPincode?: string | null;
  pickupState?: string | null;
  cityName?: string | null;
}): Promise<ResolveGeoLocationResult> {
  return resolveGeoLocation({
    savedPincode: normalizePincode(input.pickupPincode),
    savedState: sanitizePlaceholder(input.pickupState),
    savedCity: sanitizePlaceholder(input.cityName),
    latitude: input.pickupLat,
    longitude: input.pickupLng,
  });
}
