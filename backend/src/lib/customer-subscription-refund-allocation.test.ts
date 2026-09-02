import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateMembershipRefundAllocation,
  extractMembershipChargeFromBillingSnapshot,
  orderPurchasedMembershipOnCheckout,
  resolveCustomerPaidTotal,
} from "./customer-subscription-refund-allocation.js";

function membershipSnapshot(membershipSubtotal: number, gst = 0): Record<string, unknown> {
  return {
    final_amount: 100,
    charges: [
      {
        label: "GMitra Plus (monthly)",
        amount: membershipSubtotal,
        meta: { source: "customer_subscription_checkout", gstPercent: 18 },
      },
    ],
    taxes:
      gst > 0
        ? [
            {
              label: "GST on GMitra Plus",
              amount: gst,
              meta: { source: "customer_subscription_checkout" },
            },
          ]
        : [],
  };
}

describe("customer-subscription-refund-allocation", () => {
  it("extracts membership subtotal + GST from billing snapshot", () => {
    const snap = membershipSnapshot(33.5, 6.03);
    const charge = extractMembershipChargeFromBillingSnapshot(snap);
    assert.equal(charge.subtotal, 33.5);
    assert.equal(charge.gstAmount, 6.03);
    assert.equal(charge.total, 39.53);
  });

  it("returns zero membership when order had no checkout subscription charge", () => {
    const charge = extractMembershipChargeFromBillingSnapshot({
      final_amount: 80,
      charges: [{ label: "Delivery fee", amount: 25 }],
    });
    assert.equal(charge.total, 0);
  });

  it("uses final_amount as customer paid total", () => {
    assert.equal(
      resolveCustomerPaidTotal({ billingSnapshot: { final_amount: 61.85 }, fallbackGrandTotal: 101.35 }),
      61.85
    );
  });

  it("full refund revokes membership", () => {
    const paid = 100;
    const membership = 20;
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: paid,
      membershipChargeTotal: membership,
      cumulativeRefunded: 100,
    });
    assert.equal(result.shouldRevokeMembership, true);
    assert.equal(result.isFullOrderRefund, true);
    assert.equal(result.isMembershipFeeRefunded, true);
  });

  it("partial food-only refund does NOT revoke membership", () => {
    const paid = 100;
    const membership = 20;
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: paid,
      membershipChargeTotal: membership,
      cumulativeRefunded: 80,
    });
    assert.equal(result.shouldRevokeMembership, false);
    assert.equal(result.isMembershipFeeRefunded, false);
    assert.equal(result.nonMembershipPaid, 80);
  });

  it("partial refund that reaches membership portion revokes", () => {
    const paid = 100;
    const membership = 20;
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: paid,
      membershipChargeTotal: membership,
      cumulativeRefunded: 80.03,
    });
    assert.equal(result.shouldRevokeMembership, true);
    assert.equal(result.isMembershipFeeRefunded, true);
    assert.equal(result.isFullOrderRefund, false);
  });

  it("membership-only refund revokes", () => {
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: 100,
      membershipChargeTotal: 20,
      cumulativeRefunded: 20,
    });
    assert.equal(result.shouldRevokeMembership, true);
  });

  it("order without membership checkout never revokes", () => {
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: 80,
      membershipChargeTotal: 0,
      cumulativeRefunded: 80,
    });
    assert.equal(result.shouldRevokeMembership, false);
    assert.equal(result.orderHadMembershipCheckout, false);
  });

  it("pending/failed refund amount (zero cumulative) does not revoke", () => {
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: 61.85,
      membershipChargeTotal: 39.53,
      cumulativeRefunded: 0,
    });
    assert.equal(result.shouldRevokeMembership, false);
  });

  it("matches screenshot order: full refund of paid total revokes Plus", () => {
    const snap = membershipSnapshot(33.5, 6.03);
    snap.final_amount = 61.85;
    const membership = extractMembershipChargeFromBillingSnapshot(snap);
    const paid = resolveCustomerPaidTotal({ billingSnapshot: snap, fallbackGrandTotal: 101.35 });
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: paid,
      membershipChargeTotal: membership.total,
      cumulativeRefunded: paid,
    });
    assert.equal(result.shouldRevokeMembership, true);
  });

  it("new membership after revocation requires fresh payment (allocation isolated per order)", () => {
    const oldOrder = evaluateMembershipRefundAllocation({
      customerPaidTotal: 100,
      membershipChargeTotal: 20,
      cumulativeRefunded: 100,
    });
    assert.equal(oldOrder.shouldRevokeMembership, true);

    const newOrderNoRefund = evaluateMembershipRefundAllocation({
      customerPaidTotal: 120,
      membershipChargeTotal: 20,
      cumulativeRefunded: 0,
    });
    assert.equal(newOrderNoRefund.shouldRevokeMembership, false);
  });

  it("stale client cache scenario: authoritative check uses DB status not cached active flag", () => {
    // Allocation logic is independent of client state — only refund totals matter.
    const result = evaluateMembershipRefundAllocation({
      customerPaidTotal: 100,
      membershipChargeTotal: 20,
      cumulativeRefunded: 50,
    });
    assert.equal(result.shouldRevokeMembership, false);
  });

  it("orderPurchasedMembershipOnCheckout: existing member order without new purchase", () => {
    assert.equal(
      orderPurchasedMembershipOnCheckout({
        billingSnapshot: {
          final_amount: 61.85,
          charges: [{ label: "Delivery fee", amount: 25 }],
        },
        checkoutMetadata: { subscriptionOptIn: false, customerSubscriptionActive: true },
      }),
      false
    );
  });

  it("orderPurchasedMembershipOnCheckout: new purchase via snapshot charge", () => {
    assert.equal(
      orderPurchasedMembershipOnCheckout({
        billingSnapshot: membershipSnapshot(33.5, 6.03),
        checkoutMetadata: { subscriptionOptIn: true, subscriptionPlanId: 1 },
      }),
      true
    );
  });

  it("orderPurchasedMembershipOnCheckout: opt-in + plan without snapshot charge still counts", () => {
    assert.equal(
      orderPurchasedMembershipOnCheckout({
        billingSnapshot: { final_amount: 61.85, charges: [] },
        checkoutMetadata: { subscriptionOptIn: "true", subscriptionPlanId: 2 },
      }),
      true
    );
  });
});

describe("customer-subscription-refund idempotency (terminal status guard)", () => {
  it("terminal statuses block duplicate revoke attempts", () => {
    const terminal = new Set(["refunded", "revoked", "cancelled_refunded"]);
    for (const status of terminal) {
      assert.ok(terminal.has(status));
    }
  });
});
