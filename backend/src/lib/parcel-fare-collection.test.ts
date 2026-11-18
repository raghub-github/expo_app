import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isParcelFareCollectionRequired,
  resolveParcelCustomerPayable,
} from "./parcel-fare-collection.js";

describe("resolveParcelCustomerPayable", () => {
  it("grand_total is the authority", () => {
    assert.deepEqual(
      resolveParcelCustomerPayable({ grandTotal: "108.32", fareAmount: "92", billingSnapshot: { final_amount: 108.32 } }),
      { payable: 108.32, free: false }
    );
  });
  it("a ₹0 grand total confirmed by the snapshot is a FREE parcel — never the raw fare", () => {
    // Before: 0 fell through to fare_amount, so the rider was asked to collect ₹92
    // and the collect call then refused (₹0) — the rider was stuck.
    assert.deepEqual(
      resolveParcelCustomerPayable({ grandTotal: "0", fareAmount: "92", billingSnapshot: { final_amount: 0 } }),
      { payable: 0, free: true }
    );
  });
  it("legacy rows without grand_total fall back to snapshot / final / estimate / fare", () => {
    assert.deepEqual(resolveParcelCustomerPayable({ grandTotal: null, billingSnapshot: { final_amount: 48.38 } }), {
      payable: 48.38,
      free: false,
    });
    assert.deepEqual(resolveParcelCustomerPayable({ grandTotal: null, finalFare: "60", fareAmount: "50" }), {
      payable: 60,
      free: false,
    });
    assert.deepEqual(resolveParcelCustomerPayable({ grandTotal: null, fareAmount: "50" }), { payable: 50, free: false });
  });
  it("a 0 grand total WITHOUT a confirming snapshot is not treated as free", () => {
    assert.deepEqual(resolveParcelCustomerPayable({ grandTotal: "0", fareAmount: "50", billingSnapshot: {} }), {
      payable: 50,
      free: false,
    });
  });
  it("nothing known → 0, not free (the collect call refuses it)", () => {
    assert.deepEqual(resolveParcelCustomerPayable({}), { payable: 0, free: false });
  });
});

describe("isParcelFareCollectionRequired", () => {
  const due = { payable: 72.55, free: false };
  it("required only with a pay-at step, nothing collected and something to pay", () => {
    assert.equal(isParcelFareCollectionRequired({ payAt: "pickup", cashCollectedAt: null, paymentStatus: "pending", payable: due }), true);
    assert.equal(isParcelFareCollectionRequired({ payAt: null, cashCollectedAt: null, paymentStatus: "pending", payable: due }), false);
    assert.equal(isParcelFareCollectionRequired({ payAt: "drop", cashCollectedAt: new Date(), paymentStatus: "pending", payable: due }), false);
    assert.equal(isParcelFareCollectionRequired({ payAt: "drop", cashCollectedAt: null, paymentStatus: "completed", payable: due }), false);
  });
  it("a free parcel never asks the rider to collect", () => {
    assert.equal(
      isParcelFareCollectionRequired({
        payAt: "pickup",
        cashCollectedAt: null,
        paymentStatus: "pending",
        payable: { payable: 0, free: true },
      }),
      false
    );
  });
});
