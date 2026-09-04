/**
 * Rider payout BASIS is the gross (pre-discount) service value — a customer
 * offer / free ride / coupon / membership must never shrink it. These tests pin
 * the core financial principle: the discounted customer amount is never the
 * rider basis when a gross value is recoverable.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRideGrossFareForPayout,
  resolveRiderDeliveryFeeFromCore,
  resolveDeliveryFarePaidToRider,
  resolveCompleteOrderValuePaidByCustomer,
} from "./rider-fare-basis.ts";

test("ride: 50% discount does not touch the rider basis (uses gross estimate)", () => {
  const basis = resolveRideGrossFareForPayout({
    estimatedFare: 100, // gross metered fare
    finalFare: 50, // customer's discounted payable
    fareAmount: 100,
    billingSnapshot: { discount_total: 50, ride_fare: 100 },
  });
  assert.equal(basis, 100);
});

test("ride: 100% free ride (final_fare 0) still yields the full gross basis", () => {
  const basis = resolveRideGrossFareForPayout({
    estimatedFare: 120,
    finalFare: 0,
    fareAmount: 120,
    billingSnapshot: { discount_total: 120, ride_fare: 120 },
  });
  assert.equal(basis, 120);
});

test("ride: no estimate → reconstruct gross from snapshot pre-discount fare", () => {
  const basis = resolveRideGrossFareForPayout({
    estimatedFare: null,
    finalFare: 60,
    fareAmount: null,
    billingSnapshot: { ride_fare: 100, discount_total: 40 },
  });
  assert.equal(basis, 100);
});

test("ride: no estimate, no snapshot gross → add discount back onto final", () => {
  const basis = resolveRideGrossFareForPayout({
    estimatedFare: null,
    finalFare: 60,
    fareAmount: null,
    billingSnapshot: { discount_total: 40 },
  });
  assert.equal(basis, 100); // 60 discounted + 40 discount = 100 gross
});

test("ride: no discount → gross equals the plain fare (nothing added)", () => {
  const basis = resolveRideGrossFareForPayout({
    estimatedFare: 85,
    finalFare: 85,
    fareAmount: 85,
    billingSnapshot: {},
  });
  assert.equal(basis, 85);
});

test("food/parcel: free-delivery subsidy does not cut the rider delivery basis", () => {
  const basis = resolveRiderDeliveryFeeFromCore({
    riderEarning: null,
    fareAmount: 0, // net customer fee after free-delivery membership
    billingSnapshot: { delivery_fee_gross: 60, delivery_fee: 0, delivery_subsidy: 60 },
  });
  assert.equal(basis, 60);
});

test("food/parcel: partial coupon on delivery — rider still gets gross", () => {
  const basis = resolveRiderDeliveryFeeFromCore({
    riderEarning: null,
    fareAmount: 20,
    billingSnapshot: { delivery_fee_gross: 50, delivery_fee: 20, delivery_subsidy: 30 },
  });
  assert.equal(basis, 50);
});

test("food/parcel: a frozen rider_earning wins (already resolved at accept)", () => {
  const basis = resolveRiderDeliveryFeeFromCore({
    riderEarning: 59,
    fareAmount: 40,
    billingSnapshot: { delivery_fee_gross: 40 },
  });
  assert.equal(basis, 59);
});

test("food/parcel: pre-migration order without gross falls back to net fee", () => {
  const basis = resolveRiderDeliveryFeeFromCore({
    riderEarning: null,
    fareAmount: 45,
    billingSnapshot: { delivery_fee: 45 },
  });
  assert.equal(basis, 45);
});

test("food: frozen payout snapshot is the rider delivery fare when gross is missing", () => {
  const basis = resolveDeliveryFarePaidToRider({
    riderEarning: null,
    fareAmount: 0,
    billingSnapshot: {
      delivery_fee: 42,
      rider_payout_snapshot: { totalEarning: 42, baseEarning: 42 },
    },
  });
  assert.equal(basis, 42);
});

test("food: payout snapshot wins over zero customer fee (free delivery)", () => {
  const basis = resolveDeliveryFarePaidToRider({
    riderEarning: null,
    fareAmount: 0,
    billingSnapshot: {
      delivery_fee: 0,
      rider_payout_snapshot: {
        baseEarning: 55,
        waitingEarning: 5,
        surgeEarning: 0,
        totalEarning: 60,
      },
    },
  });
  assert.equal(basis, 60);
});

test("complete order value: CTC = grand_total + gati cash", () => {
  assert.equal(
    resolveCompleteOrderValuePaidByCustomer({
      grandTotal: 200,
      billingSnapshot: { gati_cash_applied: 48.5, final_amount: 200 },
    }),
    248.5
  );
});

test("complete order value: uses settlement CTC when present", () => {
  assert.equal(
    resolveCompleteOrderValuePaidByCustomer({
      grandTotal: 248.5,
      billingSnapshot: { final_amount: 1 },
    }),
    248.5
  );
});

test("complete order value: falls back to billing final_amount", () => {
  assert.equal(
    resolveCompleteOrderValuePaidByCustomer({
      grandTotal: 0,
      billingSnapshot: { final_amount: 312 },
    }),
    312
  );
});

test("complete order value: prefers composed bill when grand_total is delivery-fee-only", () => {
  assert.equal(
    resolveCompleteOrderValuePaidByCustomer({
      grandTotal: 40,
      billingSnapshot: {
        item_total: 200,
        delivery_fee: 40,
        tax_total: 20,
        discount_total: 10,
      },
    }),
    250
  );
});

test("complete order value: composes bill lines when totals missing", () => {
  assert.equal(
    resolveCompleteOrderValuePaidByCustomer({
      grandTotal: null,
      billingSnapshot: {
        item_total: 200,
        delivery_fee: 40,
        tax_total: 20,
        discount_total: 10,
      },
    }),
    250
  );
});
