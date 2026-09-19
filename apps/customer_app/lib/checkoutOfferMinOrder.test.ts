import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMinOrderLockReason,
  parseMinOrderFromText,
  resolveOfferMinOrderGap,
} from "./checkoutOfferMinOrder.ts";

describe("parseMinOrderFromText", () => {
  it("reads Min order ₹199 from summary", () => {
    assert.equal(parseMinOrderFromText("Min order ₹199 • ₹35 off"), 199);
  });
});

describe("resolveOfferMinOrderGap", () => {
  it("locks when eligible cart is below summary min", () => {
    assert.equal(
      resolveOfferMinOrderGap(
        { summary: "Min order ₹199 • ₹35 off" },
        0
      ),
      199
    );
  });

  it("uses description when minOrderAmount is missing", () => {
    assert.equal(
      resolveOfferMinOrderGap(
        { description: "35% OFF up to ₹80 • Min order ₹199 • New customers" },
        40
      ),
      159
    );
  });

  it("is unlocked when cart meets min", () => {
    assert.equal(
      resolveOfferMinOrderGap({ minOrderAmount: 199, summary: "Min order ₹199" }, 200),
      0
    );
  });
});

describe("formatMinOrderLockReason", () => {
  it("formats inline row warning", () => {
    assert.equal(
      formatMinOrderLockReason(199, 199),
      "Add ₹199 more to use this offer (min order ₹199)."
    );
  });
});
