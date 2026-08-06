import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkoutCouponRestrictionsPass,
  sanitizeCheckoutCouponConfig,
} from "./checkoutCouponConfig.js";

describe("checkoutCouponRestrictionsPass payment_modes", () => {
  it("treats payment_modes All as unrestricted", () => {
    const cfg = sanitizeCheckoutCouponConfig({
      payment_modes: ["All"],
      min_order_value: 100,
    });
    assert.equal(
      checkoutCouponRestrictionsPass(cfg, {
        serviceType: "FOOD",
        cartSubtotal: 150,
        paymentMode: null,
        userSegment: "NEW",
      }),
      true
    );
    assert.equal(
      checkoutCouponRestrictionsPass(cfg, {
        serviceType: "FOOD",
        cartSubtotal: 150,
        paymentMode: "UPI",
        userSegment: "NEW",
      }),
      true
    );
  });

  it("still enforces specific payment modes", () => {
    const cfg = sanitizeCheckoutCouponConfig({
      payment_modes: ["UPI", "WALLET"],
      min_order_value: 0,
    });
    assert.equal(
      checkoutCouponRestrictionsPass(cfg, {
        serviceType: "FOOD",
        cartSubtotal: 50,
        paymentMode: "UPI",
        userSegment: "ALL",
      }),
      true
    );
    assert.equal(
      checkoutCouponRestrictionsPass(cfg, {
        serviceType: "FOOD",
        cartSubtotal: 50,
        paymentMode: "CASH",
        userSegment: "ALL",
      }),
      false
    );
  });
});
