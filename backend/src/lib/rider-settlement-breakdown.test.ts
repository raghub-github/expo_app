import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRiderSettlementBreakdown } from "./rider-settlement-breakdown.js";

type Snap = {
  baseEarning: number;
  waitingEarning: number;
  surgeEarning: number;
  appliedSurges: { name: string; amount: number }[];
  totalEarning: number;
  pickupDistanceKm?: number;
  tripDistanceKm?: number;
  totalDistanceKm?: number;
  snapshottedAt: string;
};

function snap(partial: Partial<Snap> & Pick<Snap, "totalEarning" | "baseEarning">): Snap {
  return {
    waitingEarning: 0,
    surgeEarning: 0,
    appliedSurges: [],
    snapshottedAt: "2026-11-04T10:00:00.000Z",
    tripDistanceKm: 4.7,
    pickupDistanceKm: 1.2,
    ...partial,
  };
}

describe("buildRiderSettlementBreakdown", () => {
  it("1. Dispatch ₹50 → final ₹50 → Offer amount matched", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 50,
    });
    assert.equal(out.difference_amount, 0);
    assert.equal(out.difference_reason_code, "OFFER_MATCHED");
    assert.equal(out.difference_reason_text, "Offer amount matched");
    assert.equal(out.investigation_required, false);
    assert.equal(out.final_settlement_amount, 50);
    assert.equal(out.dispatch_offer_amount, 50);
  });

  it("2. Dispatch ₹50 → final ₹60 with valid waiting charge", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const final = snap({
      baseEarning: 50,
      waitingEarning: 10,
      totalEarning: 60,
    });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: final,
      walletCreditedAmount: 60,
    });
    assert.equal(out.difference_amount, 10);
    assert.equal(out.difference_reason_code, "WAITING_AFTER_PICKUP");
    assert.match(out.difference_reason_text, /waiting/i);
    assert.equal(out.waiting_charge, 10);
    assert.equal(out.investigation_required, false);
  });

  it("3. Dispatch ₹50 → final ₹40 with valid deduction", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 40,
      deductions: 10,
    });
    assert.equal(out.difference_amount, -10);
    assert.equal(out.difference_reason_code, "DEDUCTION");
    assert.match(out.difference_reason_text, /Deduction/i);
    assert.equal(out.deductions, 10);
    assert.equal(out.investigation_required, false);
  });

  it("4. Dispatch ₹50 → final ₹40 without valid reason → investigation", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 40,
      // no deductions / cancellation evidence
    });
    assert.equal(out.difference_amount, -10);
    assert.equal(out.difference_reason_code, "INVESTIGATION_REQUIRED");
    assert.equal(out.investigation_required, true);
    assert.match(out.difference_reason_text, /investigation/i);
  });

  it("5. Duplicate settlement request is idempotent (same inputs → same breakdown)", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const a = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 50,
      quoteId: "order:GMC1",
    });
    const b = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 50,
      quoteId: "order:GMC1",
    });
    assert.equal(a.difference_reason_code, b.difference_reason_code);
    assert.equal(a.final_settlement_amount, b.final_settlement_amount);
    assert.equal(a.difference_amount, b.difference_amount);
    assert.equal(a.quote_id, b.quote_id);
  });

  it("6. Multiple adjustment components", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const final = snap({
      baseEarning: 50,
      waitingEarning: 8,
      surgeEarning: 5,
      totalEarning: 63,
    });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: final,
      walletCreditedAmount: 63,
    });
    assert.equal(out.difference_amount, 13);
    assert.equal(out.difference_reason_code, "MULTIPLE_ADJUSTMENTS");
    assert.match(out.difference_reason_text, /waiting/i);
    assert.match(out.difference_reason_text, /Surge/i);
    assert.equal(out.investigation_required, false);
  });

  it("7. Cancellation adjustment at settlement", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: snap({ baseEarning: 0, totalEarning: 0 }),
      walletCreditedAmount: 15,
      cancellationAdjustment: 15,
    });
    // Final 15 vs accept 50 → -35, but cancellation +15 and base drop need explaining.
    // With final snap base 0, deltaBase = -50, cancellation +15, wallet 15.
    // difference = 15 - 50 = -35
    // explained: base -50 + cancellation +15 = -35 → MULTIPLE or single if residual 0
    assert.equal(out.difference_amount, -35);
    assert.ok(
      out.difference_reason_code === "MULTIPLE_ADJUSTMENTS" ||
        out.difference_reason_code === "CANCELLATION_ADJUSTMENT" ||
        out.difference_reason_code === "DISTANCE_ADJUSTMENT" ||
        out.difference_reason_code === "ADDITIONAL_ELIGIBLE_CHARGE"
    );
    assert.equal(out.investigation_required, false);
    assert.equal(out.cancellation_adjustment, 15);
  });

  it("8. Waiting charges after pickup", () => {
    const accept = snap({ baseEarning: 45, totalEarning: 45, waitingEarning: 0 });
    const final = snap({ baseEarning: 45, waitingEarning: 12, totalEarning: 57 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: final,
      walletCreditedAmount: 57,
    });
    assert.equal(out.waiting_charge, 12);
    assert.equal(out.difference_reason_code, "WAITING_AFTER_PICKUP");
    assert.match(out.difference_reason_text, /\+₹12/);
  });

  it("9. Paid ride settlement versus v3 payout snapshot", () => {
    const accept = snap({ baseEarning: 50, totalEarning: 50 });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: accept,
      walletCreditedAmount: 55,
      paidRideSettlementEngine: true,
    });
    assert.equal(out.difference_amount, 5);
    assert.equal(out.difference_reason_code, "PAID_RIDE_SETTLEMENT_ENGINE");
    assert.equal(out.investigation_required, false);
  });

  it("10. Food / grocery / parcel consistency (same builder)", () => {
    for (const service of ["food", "parcel", "grocery_as_food"] as const) {
      const accept = snap({
        baseEarning: 42,
        totalEarning: 42,
        tripDistanceKm: 3.2,
      });
      const out = buildRiderSettlementBreakdown({
        acceptedSnapshot: accept,
        finalSnapshot: accept,
        walletCreditedAmount: 42,
        quoteId: `${service}:1`,
      });
      assert.equal(out.difference_reason_code, "OFFER_MATCHED", service);
      assert.equal(out.accepted_distance_km, 3.2, service);
      assert.equal(out.pricing_version, "rider_payout_v3.2", service);
    }
  });

  it("distance reduction with evidence", () => {
    const accept = snap({
      baseEarning: 50,
      totalEarning: 50,
      tripDistanceKm: 5.0,
    });
    const final = snap({
      baseEarning: 42,
      totalEarning: 42,
      tripDistanceKm: 4.0,
    });
    const out = buildRiderSettlementBreakdown({
      acceptedSnapshot: accept,
      finalSnapshot: final,
      walletCreditedAmount: 42,
      finalBillableDistanceKm: 4.0,
    });
    assert.equal(out.difference_amount, -8);
    assert.equal(out.difference_reason_code, "DISTANCE_ADJUSTMENT");
    assert.match(out.difference_reason_text, /distance/i);
  });
});
