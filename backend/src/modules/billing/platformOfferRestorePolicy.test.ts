import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Contract for first-order FREE_DELIVERY restore vs lifetime lock.
 * Mirrors releaseUsages branching without DB.
 */
function shouldLifetimeLockFirstOrderFd(args: {
  benefitFamily: string | null;
  restoreOnCancel: boolean;
  restoreOnRefund: boolean;
  nextStatus: "cancelled" | "refunded";
}): boolean {
  const family = args.benefitFamily;
  if (family !== "first_order_free_delivery") return false;
  const allow =
    args.nextStatus === "cancelled" ? args.restoreOnCancel !== false : args.restoreOnRefund !== false;
  return !allow;
}

describe("first-order free delivery restore policy", () => {
  it("lifetime-locks when restore toggle is off", () => {
    assert.equal(
      shouldLifetimeLockFirstOrderFd({
        benefitFamily: "first_order_free_delivery",
        restoreOnCancel: false,
        restoreOnRefund: false,
        nextStatus: "cancelled",
      }),
      true
    );
  });

  it("does not lifetime-lock when restore on cancel is on", () => {
    assert.equal(
      shouldLifetimeLockFirstOrderFd({
        benefitFamily: "first_order_free_delivery",
        restoreOnCancel: true,
        restoreOnRefund: false,
        nextStatus: "cancelled",
      }),
      false
    );
  });

  it("does not lifetime-lock when restore on refund is on", () => {
    assert.equal(
      shouldLifetimeLockFirstOrderFd({
        benefitFamily: "first_order_free_delivery",
        restoreOnCancel: false,
        restoreOnRefund: true,
        nextStatus: "refunded",
      }),
      false
    );
  });

  it("ignores non first-order families", () => {
    assert.equal(
      shouldLifetimeLockFirstOrderFd({
        benefitFamily: null,
        restoreOnCancel: false,
        restoreOnRefund: false,
        nextStatus: "cancelled",
      }),
      false
    );
  });
});
