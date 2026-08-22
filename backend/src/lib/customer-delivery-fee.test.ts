import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  expectedCustomerDeliveryFeeNet,
  isCustomerDeliveryFeeCorruptedByRiderPayout,
  resolveCustomerDeliveryFeeFromBilling,
  restoreCustomerDeliveryFieldsInSnapshot,
} from "./customer-delivery-fee.js";

describe("customer-delivery-fee", () => {
  it("returns stored customer fee when not corrupted", () => {
    const snap = {
      delivery_fee: 74.0,
      delivery_fee_gross: 74.0,
      delivery_subsidy: 0,
    };
    assert.equal(resolveCustomerDeliveryFeeFromBilling(snap), 74);
    assert.equal(isCustomerDeliveryFeeCorruptedByRiderPayout(snap), false);
  });

  it("reconstructs customer fee when overwritten by rider payout", () => {
    const snap = {
      delivery_fee: 59,
      delivery_fee_gross: 74,
      delivery_subsidy: 0,
      rider_payout_snapshot: { totalEarning: 59, baseEarning: 59 },
    };
    assert.equal(expectedCustomerDeliveryFeeNet(snap), 74);
    assert.equal(isCustomerDeliveryFeeCorruptedByRiderPayout(snap), true);
    assert.equal(resolveCustomerDeliveryFeeFromBilling(snap), 74);
  });

  it("respects subsidy when reconstructing", () => {
    const snap = {
      delivery_fee: 40, // rider payout leaked
      delivery_fee_gross: 74,
      delivery_subsidy: 20, // customer paid 54
      rider_payout_snapshot: { totalEarning: 40 },
    };
    assert.equal(resolveCustomerDeliveryFeeFromBilling(snap), 54);
  });

  it("restore helper rewrites corrupted delivery_fee on write path", () => {
    const prev = {
      delivery_fee: 59,
      final_delivery_fee: 59,
      delivery_fee_gross: 74,
      delivery_subsidy: 0,
      tax_total: 13.74,
    };
    const next = restoreCustomerDeliveryFieldsInSnapshot(prev, 59);
    assert.equal(next.delivery_fee, 74);
    assert.equal(next.final_delivery_fee, 74);
    assert.equal(next.tax_total, 13.74);
  });

  it("never uses rider payout as customer fee fallback", () => {
    const snap = {
      delivery_fee: 0,
      delivery_fee_gross: 0,
      rider_payout_snapshot: { totalEarning: 59 },
    };
    assert.equal(resolveCustomerDeliveryFeeFromBilling(snap), 0);
  });
});
