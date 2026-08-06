/**
 * Ride/Parcel promo eligibility + discount math unit tests.
 * Food offers (empty promo_config) must remain unaffected.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BillContext, PlatformOfferRow } from "./types.js";
import {
  computeRideParcelPromoDiscount,
  rideParcelPromoEligibilityReason,
  rideParcelPromoPasses,
} from "./rideParcelPromoApply.js";
import { platformOfferEligible } from "./platformOffersApply.js";

const baseCtx = (overrides: Partial<BillContext> = {}): BillContext => ({
  itemSubtotal: 200,
  addonSubtotal: 0,
  addonQtyTotal: 0,
  orderLines: [],
  distanceKm: 8,
  merchantStoreId: 0,
  merchantParentId: null,
  now: new Date("2026-08-04T10:00:00+05:30"), // morning peak weekday
  userType: "customer",
  userSegment: "ALL",
  couponCode: null,
  lineCategories: [],
  itemPackagingTotal: 0,
  packagingChargeAmount: 0,
  deliveryChargePerKm: 0,
  serviceType: "RIDE",
  cityName: null,
  dropPostalCode: null,
  dropGeoRefByLevel: {},
  platformOfferGeoBindingEffectiveIds: new Set(),
    checkoutCouponGeoBindingEffectiveIds: new Set(),
  deliveryFeeFromRateCard: 0,
  deliveryFeeFromGeo: null,
  deliveryDefaultBaseInr: 0,
  deliveryDefaultPerKmInr: 0,
  tipAmount: 0,
  donationAmount: 0,
  checkoutAudience: "CUSTOMER",
  subscriptionOptIn: false,
  completedPersonRideCount: 0,
  completedParcelCount: 0,
  rideType: "bike",
  vehicleType: "bike",
  paymentMode: "online",
  ...overrides,
});

const baseOffer = (overrides: Partial<PlatformOfferRow> = {}): PlatformOfferRow => ({
  id: 501,
  name: "Ride promo",
  couponCode: "RIDE50",
  promoConfig: {},
  serviceType: "RIDE",
  discountType: "FIXED",
  valueNumeric: 50,
  deliveryDiscountType: null,
  deliveryDiscountValue: null,
  offerKind: "DISCOUNT",
  offerAudience: "CUSTOMER",
  fundingMode: "PLATFORM_ONLY",
  platformSharePct: 100,
  merchantSharePct: 0,
  maxPlatformContribution: null,
  maxMerchantContribution: null,
  targetScope: "GLOBAL",
  geoLevel: null,
  geoIds: [],
  merchantIds: [],
  customerSegment: "ALL",
  minOrderAmount: null,
  maxDiscountAmount: null,
  buyQty: null,
  getQty: null,
  isStackable: false,
  exclusionGroup: null,
  startsAt: null,
  endsAt: null,
  budgetTotal: null,
  budgetUsed: null,
  maxUsesTotal: null,
  maxUsesPerUser: null,
  maxUsesPerDay: null,
  maxUsesPerMonth: null,
  consumeMode: "ON_PLACED",
  restoreOnCancel: true,
  restoreOnRefund: true,
  priority: 0,
  isHidden: false,
  conditions: {},
  ...overrides,
});

describe("rideParcelPromo — Food untouched", () => {
  it("empty promo_config does not block Food eligibility gates", () => {
    const ctx = baseCtx({ serviceType: "FOOD", distanceKm: 1 });
    const o = baseOffer({ serviceType: "FOOD", promoConfig: {} });
    assert.equal(rideParcelPromoPasses(ctx, o), true);
    assert.equal(rideParcelPromoEligibilityReason(ctx, o), null);
  });

  it("ride promo_config does not apply on Food service", () => {
    const ctx = baseCtx({ serviceType: "FOOD" });
    const o = baseOffer({
      promoConfig: { promo_type: "PAY_FIXED", pay_fixed: 49 },
    });
    assert.equal(rideParcelPromoPasses(ctx, o), false);
  });
});

describe("rideParcelPromo — eligibility", () => {
  it("first N rides: passes when completed < N", () => {
    const ctx = baseCtx({ completedPersonRideCount: 1 });
    const o = baseOffer({
      promoConfig: { promo_type: "FREE_FIRST_N", first_n_completed: 3 },
    });
    assert.equal(rideParcelPromoPasses(ctx, o), true);
  });

  it("first N rides: fails when completed >= N", () => {
    const ctx = baseCtx({ completedPersonRideCount: 3 });
    const o = baseOffer({
      promoConfig: { promo_type: "FREE_FIRST_N", first_n_completed: 3 },
    });
    assert.match(rideParcelPromoEligibilityReason(ctx, o) ?? "", /first_n=/);
  });

  it("vehicle filter: bike-only rejects auto", () => {
    const ctx = baseCtx({ rideType: "auto", vehicleType: "auto" });
    const o = baseOffer({
      promoConfig: { promo_type: "FLAT_OFF", vehicle_types: ["bike"] },
    });
    assert.equal(rideParcelPromoPasses(ctx, o), false);
  });

  it("payment mode: cashless accepts online/upi (prepaid + postpaid digital)", () => {
    const o = baseOffer({
      promoConfig: { promo_type: "PAYMENT_MODE", payment_modes: ["cashless"] },
    });
    assert.equal(rideParcelPromoPasses(baseCtx({ paymentMode: "online" }), o), true);
    assert.equal(rideParcelPromoPasses(baseCtx({ paymentMode: "upi" }), o), true);
    assert.equal(rideParcelPromoPasses(baseCtx({ paymentMode: "cash" }), o), false);
  });

  it("parcel first N uses completedParcelCount", () => {
    const ctx = baseCtx({
      serviceType: "PARCEL",
      completedParcelCount: 0,
      completedPersonRideCount: 99,
    });
    const o = baseOffer({
      serviceType: "PARCEL",
      promoConfig: { promo_type: "FREE_FIRST_N", first_n_completed: 1 },
    });
    assert.equal(rideParcelPromoPasses(ctx, o), true);
  });
});

describe("rideParcelPromo — discount math", () => {
  it("PAY_FIXED discounts fare minus fixed amount", () => {
    const ctx = baseCtx();
    const o = baseOffer({
      promoConfig: { promo_type: "PAY_FIXED", pay_fixed: 49 },
      maxDiscountAmount: null,
    });
    const amt = computeRideParcelPromoDiscount(ctx, o, 200);
    assert.equal(amt, 151);
  });

  it("FARE_CAP discounts excess over cap", () => {
    const ctx = baseCtx();
    const o = baseOffer({
      promoConfig: { promo_type: "FARE_CAP", fare_cap: 99 },
    });
    assert.equal(computeRideParcelPromoDiscount(ctx, o, 180), 81);
  });

  it("FLAT_FARE_UP_TO_KM within max km", () => {
    const ctx = baseCtx({ distanceKm: 4 });
    const o = baseOffer({
      promoConfig: { promo_type: "FLAT_FARE_UP_TO_KM", flat_fare: 19, max_km: 5 },
    });
    assert.equal(computeRideParcelPromoDiscount(ctx, o, 120), 101);
  });

  it("FLAT_FARE_UP_TO_KM fails eligibility when trip exceeds max km", () => {
    const ctx = baseCtx({ distanceKm: 12 });
    const o = baseOffer({
      promoConfig: { promo_type: "FLAT_FARE_UP_TO_KM", flat_fare: 19, max_km: 5 },
    });
    assert.match(rideParcelPromoEligibilityReason(ctx, o) ?? "", /distance=/);
  });

  it("FREE_UP_TO_KM prorates by covered distance", () => {
    const ctx = baseCtx({ distanceKm: 10 });
    const o = baseOffer({
      promoConfig: { promo_type: "FREE_UP_TO_KM", max_km: 5 },
    });
    const amt = computeRideParcelPromoDiscount(ctx, o, 200);
    assert.equal(amt, 100);
  });

  it("FREE_FIRST_N waives full fare (capped by max_fare_covered)", () => {
    const ctx = baseCtx({ completedPersonRideCount: 0 });
    const o = baseOffer({
      promoConfig: {
        promo_type: "FREE_FIRST_N",
        first_n_completed: 1,
        max_fare_covered: 80,
      },
    });
    assert.equal(computeRideParcelPromoDiscount(ctx, o, 200), 80);
  });

  it("FLAT_OFF / PERCENT_OFF return null (use standard cart math)", () => {
    const ctx = baseCtx();
    assert.equal(
      computeRideParcelPromoDiscount(
        ctx,
        baseOffer({ promoConfig: { promo_type: "FLAT_OFF" } }),
        200
      ),
      null
    );
    assert.equal(
      computeRideParcelPromoDiscount(
        ctx,
        baseOffer({
          promoConfig: { promo_type: "PERCENT_OFF" },
          discountType: "PERCENTAGE",
          valueNumeric: 20,
        }),
        200
      ),
      null
    );
  });

  it("platformOfferEligible integrates promo gates on RIDE", () => {
    const o = baseOffer({
      promoConfig: {
        promo_type: "FREE_FIRST_N",
        first_n_completed: 1,
        vehicle_types: ["bike"],
      },
      valueNumeric: 0,
      discountType: "FIXED",
    });
    const ctx = baseCtx({
      completedPersonRideCount: 0,
      rideType: "bike",
      platformOfferGeoBindingEffectiveIds: new Set([o.id]),
    checkoutCouponGeoBindingEffectiveIds: new Set([o.id]),
    });
    assert.equal(platformOfferEligible(ctx, o, 200), true);
  });
});
