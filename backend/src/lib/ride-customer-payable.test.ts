import assert from "node:assert/strict";
import {
  isRideCustomerPaymentRequired,
  isRideFareAwaitingCustomerPayment,
  resolvePersonRideCustomerPayable,
  roundRideCustomerPayable,
} from "./ride-customer-payable.js";

assert.equal(roundRideCustomerPayable(-0.01), 0);
assert.equal(roundRideCustomerPayable(0.001), 0);
assert.equal(roundRideCustomerPayable(0.004), 0);
assert.equal(roundRideCustomerPayable(0.006), 0.01);
assert.equal(roundRideCustomerPayable("54.10"), 54.1);

assert.equal(isRideCustomerPaymentRequired(0), false);
assert.equal(isRideCustomerPaymentRequired(0.001), false);
assert.equal(isRideCustomerPaymentRequired(54.1), true);

assert.equal(
  isRideFareAwaitingCustomerPayment({ paymentStatus: "pending", customerPayable: 0 }),
  false
);
assert.equal(
  isRideFareAwaitingCustomerPayment({ paymentStatus: "pending", customerPayable: 30 }),
  true
);
assert.equal(
  isRideFareAwaitingCustomerPayment({ paymentStatus: "completed", customerPayable: 54 }),
  false
);

assert.equal(
  resolvePersonRideCustomerPayable({
    grandTotal: 54.1,
    checkoutMetadata: { quotedGrandTotal: 0 },
    billingSnapshot: { ride_fare: 54.1, discount_total: 54.1, final_amount: 0 },
  }),
  0
);

assert.equal(
  resolvePersonRideCustomerPayable({
    grandTotal: 54.1,
    checkoutMetadata: { quotedGrandTotal: 0 },
    billingSnapshot: { waiting_charge: 10, ride_fare: 54.1 },
  }),
  10
);

assert.equal(
  resolvePersonRideCustomerPayable({
    grandTotal: 100,
    checkoutMetadata: { quotedGrandTotal: 30 },
    billingSnapshot: {},
  }),
  30
);

assert.equal(
  resolvePersonRideCustomerPayable({
    grandTotal: 100,
    checkoutMetadata: { quotedGrandTotal: 30 },
    billingSnapshot: { waiting_charge: 5 },
  }),
  35
);

assert.equal(
  resolvePersonRideCustomerPayable({
    grandTotal: 250,
    checkoutMetadata: { quotedGrandTotal: 0 },
    billingSnapshot: { ride_fare: 250, discount_total: 250, final_amount: 54.1 },
  }),
  0
);

assert.equal(
  isRideFareAwaitingCustomerPayment({ paymentStatus: "pending", customerPayable: "0" }),
  false
);
assert.equal(
  isRideFareAwaitingCustomerPayment({ paymentStatus: "pending" }),
  true
);

console.log("ride-customer-payable.test.ts ok");
