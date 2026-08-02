import test from "node:test";
import assert from "node:assert/strict";
import { rideBillingToSettlementComponents } from "./billingToComponents.js";
import type { BillingResult } from "../../billing/types.js";
import {
  RIDE_FARE_CHARGE_SUBTYPES,
  RIDE_FARE_DISCOUNT_SUBTYPES,
} from "../pricing/rideFareComponents.js";

function baseBilling(overrides: Partial<BillingResult> = {}): BillingResult {
  return {
    item_total: 380,
    addon_total: 0,
    discount_total: 0,
    delivery_fee: 0,
    delivery_fee_gross: 0,
    delivery_subsidy: 0,
    platform_fee: 20,
    packaging_fee: 0,
    surge_fee: 0,
    small_order_fee: 0,
    convenience_fee: 5,
    misc_fee: 0,
    tax_total: 20,
    tip_amount: 0,
    donation_amount: 0,
    final_amount: 425,
    items_net_after_discounts: 380,
    taxes_by_group: {},
    gst_components: {} as unknown as BillingResult["gst_components"],
    gst_totals: { total_discount: 0, total_tax: 20, final_payable: 425 },
    charges: [],
    discounts: [],
    taxes: [],
    breakdown_steps: [],
    ruleset_version: 1,
    eligible_subtotal: 380,
    order_line_eligibility: [],
    order_line_pricing: [],
    ...overrides,
  };
}

test("billing mapper: surface every fee component onto settlement components", () => {
  const c = rideBillingToSettlementComponents(baseBilling());
  assert.equal(c.platformFee, 20);
  assert.equal(c.convenienceFee, 5);
  assert.equal(c.taxTotal, 20);
  assert.equal(c.smallOrderFee, 0);
  assert.equal(c.surgeTotal, 0);
});

test("billing mapper: reads waiting/toll/night/etc from snapshot", () => {
  const c = rideBillingToSettlementComponents(baseBilling(), {
    waiting_charge: 30,
    toll_charge: 15,
    night_charge: 10,
    peak_hour_charge: 5,
    festival_charge: 8,
    airport_charge: 25,
    extra_stops_charge: 12,
  });
  assert.equal(c.waitingCharge, 30);
  assert.equal(c.tollCharge, 15);
  assert.equal(c.nightCharge, 10);
  assert.equal(c.peakHourCharge, 5);
  assert.equal(c.festivalCharge, 8);
  assert.equal(c.airportCharge, 25);
  assert.equal(c.extraStopsCharge, 12);
});

test("billing mapper: default surge split is 100% customer-funded", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({ surge_fee: 40 })
  );
  assert.equal(c.surgeTotal, 40);
  assert.equal(c.surgeCustomerShare, 40);
  assert.equal(c.surgeCompanyShare, 0);
});

test("billing mapper: snapshot can override with a shared surge", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({ surge_fee: 50 }),
    { surge_customer_share: 20 }
  );
  assert.equal(c.surgeTotal, 50);
  assert.equal(c.surgeCustomerShare, 20);
  assert.equal(c.surgeCompanyShare, 30);
});

test("billing mapper: company_funded_discount is separated from coupon discount", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({ discount_total: 30 }),
    { company_funded_discount: 20 }
  );
  assert.equal(c.companyFundedDiscount, 20);
  assert.equal(c.couponDiscount, 10);
});

test("billing mapper: falls back to computing distanceFare when snapshot missing", () => {
  const c = rideBillingToSettlementComponents(baseBilling({ item_total: 250 }));
  assert.equal(c.baseFare, 0);
  assert.equal(c.distanceFare, 250);
});

test("billing mapper: honors explicit base_fare in snapshot", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({ item_total: 250 }),
    { base_fare: 30 }
  );
  assert.equal(c.baseFare, 30);
  assert.equal(c.distanceFare, 220);
});

test("Phase 2: pipeline-emitted charges override empty snapshot", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({
      charges: [
        {
          kind: "charge",
          ruleId: 100,
          label: "Night surcharge",
          amount: 22,
          hidden: false,
          meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.NIGHT },
        },
        {
          kind: "charge",
          ruleId: 101,
          label: "Airport pickup",
          amount: 40,
          hidden: false,
          meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.AIRPORT },
        },
      ],
    })
  );
  assert.equal(c.nightCharge, 22);
  assert.equal(c.airportCharge, 40);
});

test("Phase 2: pipeline charges take precedence over legacy snapshot fields", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({
      charges: [
        {
          kind: "charge",
          ruleId: 100,
          label: "Waiting",
          amount: 18,
          hidden: false,
          meta: { chargeSubtype: RIDE_FARE_CHARGE_SUBTYPES.WAITING },
        },
      ],
    }),
    { waiting_charge: 5, night_charge: 12 }
  );
  assert.equal(c.waitingCharge, 18, "pipeline wins for waiting");
  assert.equal(c.nightCharge, 12, "snapshot still fallback for absent pipeline component");
});

test("Phase 2: Bike Lite discount is classified as company-funded", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({
      discount_total: 12,
      discounts: [
        {
          kind: "discount",
          ruleId: 200,
          label: "Bike Lite discount",
          amount: 12,
          hidden: false,
          meta: { chargeSubtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE },
        },
      ],
    })
  );
  assert.equal(c.companyFundedDiscount, 12);
  assert.equal(c.couponDiscount, 0);
});

test("Phase 2: company-funded discount tops-up snapshot when both present", () => {
  const c = rideBillingToSettlementComponents(
    baseBilling({
      discount_total: 30,
      discounts: [
        {
          kind: "discount",
          ruleId: 200,
          label: "Bike Lite discount",
          amount: 12,
          hidden: false,
          meta: { chargeSubtype: RIDE_FARE_DISCOUNT_SUBTYPES.BIKE_LITE },
        },
      ],
    }),
    { company_funded_discount: 20 }
  );
  // Uses max(snapshot=20, bikeLite=12) = 20
  assert.equal(c.companyFundedDiscount, 20);
  assert.equal(c.couponDiscount, 10);
});
