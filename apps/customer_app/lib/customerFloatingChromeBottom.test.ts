import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveCustomerFloatingChromeBottomPure,
  resolveTabBarBottomInsetPure,
  CUSTOMER_TAB_BAR_FLOAT_GAP_PURE,
} from "./customerFloatingChromeBottom";

describe("resolveCustomerFloatingChromeBottomPure", () => {
  it("sits float-gap above tab-bar bottom inset (nav and Track share Y)", () => {
    for (const raw of [0, 16, 24, 34, 48]) {
      for (const platform of ["ios", "android"] as const) {
        const chrome = resolveCustomerFloatingChromeBottomPure(raw, platform);
        const expected =
          resolveTabBarBottomInsetPure(raw, platform) + CUSTOMER_TAB_BAR_FLOAT_GAP_PURE;
        assert.equal(chrome, expected);
      }
    }
  });

  it("float gap is zero — sheet connects to screen bottom; icons use safe-area inset", () => {
    assert.equal(CUSTOMER_TAB_BAR_FLOAT_GAP_PURE, 0);
  });

  it("is stable across repeated calls with the same inset", () => {
    const a = resolveCustomerFloatingChromeBottomPure(24, "android");
    const b = resolveCustomerFloatingChromeBottomPure(24, "android");
    assert.equal(a, b);
  });

  it("does not change when only order/Track visibility would flip (same inset)", () => {
    // Simulates Home↔Food / Track on↔off with identical safe-area — chrome Y must match.
    const homeY = resolveCustomerFloatingChromeBottomPure(34, "android");
    const foodWithTrackY = resolveCustomerFloatingChromeBottomPure(34, "android");
    assert.equal(homeY, foodWithTrackY);
  });

  it("does not re-pad Android when the window already clears system nav", () => {
    assert.equal(resolveTabBarBottomInsetPure(48, "android", true), 0);
    assert.equal(resolveCustomerFloatingChromeBottomPure(48, "android", true), 0);
  });

  it("edge-to-edge Android still pads by the safe-area inset", () => {
    assert.equal(resolveTabBarBottomInsetPure(48, "android", false), 48);
    assert.equal(resolveTabBarBottomInsetPure(0, "android", false), 24);
  });
});
