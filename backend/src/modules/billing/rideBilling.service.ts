import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { getEnv } from "../../config/env.js";
import {
  billingDatasetCacheKey,
  getCachedBillingDataset,
  setCachedBillingDataset,
} from "./ruleCache.js";
import { executeBillingPipeline } from "./executeBillingPipeline.js";
import { getRulesetVersion, loadBillingDatasetUncached } from "./billing.repository.js";
import { resolveGeoLocation } from "./geoLocationResolver.js";
import type { BillContext, BillingResult } from "./types.js";
import type { ComputeBillResult } from "./billing.service.js";

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

export type ComputeBillForRideInput = {
  customerId: number;
  /** Slab-quoted ride fare (excludes billing surcharges and tip). */
  rideFare: number;
  distanceKm: number;
  pickupLat: number;
  pickupLng: number;
  dropLat: number;
  dropLon: number;
  tipAmount?: number;
  donationAmount?: number;
  couponCode?: string | null;
  pickupPincode?: string | null;
  pickupState?: string | null;
  cityName?: string | null;
  userSegment?: "NEW" | "EXISTING" | "ALL";
  selectedPlatformOfferId?: number | null;
  forceNoAutoOffer?: boolean;
  now?: Date;
  useCache?: boolean;
};

export function enrichRideBillingSnapshot(
  billingSnapshot: Record<string, unknown> | null | undefined,
  opts: {
    rideFare: number;
    distanceKm: number;
    serviceType?: string;
  }
): Record<string, unknown> {
  const base =
    billingSnapshot && typeof billingSnapshot === "object" ? { ...billingSnapshot } : {};
  const rideFare = Math.max(0, Math.round(opts.rideFare * 100) / 100);
  if (base.ride_fare == null) base.ride_fare = rideFare;
  if (base.fare_amount == null) base.fare_amount = rideFare;
  if (base.item_total == null) base.item_total = rideFare;
  if (base.serviceType == null) base.serviceType = opts.serviceType ?? "RIDE";
  if (base.distanceKm == null && Number.isFinite(opts.distanceKm)) {
    base.distanceKm = opts.distanceKm;
  }
  if (base.computedAt == null) {
    base.computedAt = new Date().toISOString();
  }
  return base;
}

/**
 * Person-ride billing — same rule engine as FOOD, with slab fare as item subtotal.
 * Skips merchant store + delivery fallback (ride distance is already in the fare).
 */
export async function computeBillForRide(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: ComputeBillForRideInput
): Promise<ComputeBillResult> {
  const env = getEnv();
  if (!env.BILLING_RULES_ENABLED) {
    const tip = input.tipAmount ?? 0;
    const donation = input.donationAmount ?? 0;
    const rideFare = Math.max(0, Math.round(input.rideFare));
    const finalAmount = rideFare + tip + donation;
    const snapshot = enrichRideBillingSnapshot(null, {
      rideFare,
      distanceKm: input.distanceKm,
    });
    return {
      ok: true,
      billing: {
        item_total: rideFare,
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
        tip_amount: tip,
        donation_amount: donation,
        final_amount: finalAmount,
        items_net_after_discounts: rideFare,
        taxes_by_group: {},
        gst_components: {
          items: { original: rideFare, discount: 0, taxable_value: rideFare, gst: 0 },
          delivery: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          platform: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          surge: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          packaging: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          small_order: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          convenience: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
          subscription: { original: 0, discount: 0, taxable_value: 0, gst: 0 },
        },
        gst_totals: {
          total_discount: 0,
          total_tax: 0,
          final_payable: finalAmount,
        },
        charges: [],
        discounts: [],
        taxes: [],
        breakdown_steps: [],
        ruleset_version: 1,
        eligible_subtotal: rideFare,
        order_line_eligibility: [
          {
            menuItemId: "ride",
            lineTotal: rideFare,
            quantity: 1,
            isDiscountEligible: true,
            ineligibilityReason: null,
          },
        ],
        order_line_pricing: [
          {
            menuItemId: "ride",
            quantity: 1,
            catalogLineTotal: rideFare,
            effectiveLineTotal: rideFare,
            offerDiscountAmount: 0,
            appliedOfferId: null,
            appliedOfferLabel: null,
            appliedOfferType: null,
            // Fields introduced by the offer engine (allset merge). A ride
            // line has no per-item offer, so both discount modifiers are null.
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

  const rideFare = Math.max(0, Math.round(input.rideFare * 100) / 100);
  const tipAmount = input.tipAmount ?? 0;
  const donationAmount = input.donationAmount ?? 0;
  const couponCode = input.couponCode?.trim() || null;
  const serviceType = "RIDE";
  const distanceKm = Math.max(0, input.distanceKm);

  const pickupPostalCode = normalizePincode(input.pickupPincode);
  const pickupStateName = sanitizePlaceholder(input.pickupState);
  const cityName = sanitizePlaceholder(input.cityName);

  const calcGeo = await resolveGeoLocation({
    savedPincode: pickupPostalCode,
    savedState: pickupStateName,
    savedCity: cityName,
    latitude: input.pickupLat,
    longitude: input.pickupLng,
  });
  const dropGeoRefByLevel = calcGeo.refs;
  const platformOfferGeoBindingEffectiveIds = calcGeo.geoBoundOfferIds;

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
    itemSubtotal: rideFare,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [{ menuItemId: "ride", lineTotal: rideFare, quantity: 1, discountEligible: true }],
    distanceKm,
    merchantStoreId,
    merchantParentId: null,
    now: input.now ?? new Date(),
    userType: "customer",
    userSegment,
    couponCode,
    lineCategories: [{ categoryName: "ride" }],
    itemPackagingTotal: 0,
    packagingChargeAmount: 0,
    deliveryChargePerKm: 0,
    serviceType,
    cityName,
    dropPostalCode: pickupPostalCode,
    dropGeoRefByLevel,
    platformOfferGeoBindingEffectiveIds,
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromSlabsGeoV2: 0,
    deliverySlabsGeoV2Quote: null,
    deliverySlabsGeoV2AppliedGeo: null,
    deliveryFeeFromGeo: null,
    deliveryMinimumInr: 0,
    deliveryDefaultBaseInr: 0,
    deliveryDefaultPerKmInr: 0,
    tipAmount,
    donationAmount,
    subscriptionOptIn: false,
    customerSubscriptionActive: false,
    customerSubscriptionFreeDeliveryEligible: false,
    isSelfPickup: true,
    deliveryPricingEngine: undefined,
    checkoutAudience: "CUSTOMER",
    selectedPlatformOfferId: input.selectedPlatformOfferId ?? null,
    selectedMerchantOfferId: null,
    forceNoAutoOffer: input.forceNoAutoOffer === true,
  };

  const billing = executeBillingPipeline(ctx, dataset);

  const snapshot = enrichRideBillingSnapshot(
    { ...(billing as unknown as Record<string, unknown>) },
    { rideFare, distanceKm, serviceType }
  );

  return { ok: true, billing, snapshot };
}
