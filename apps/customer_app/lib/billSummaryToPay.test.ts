import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeGrandToPayLeftover,
  computeUnlistedDiscountTotal,
  resolveBillSummaryToPay,
} from "./billSummaryToPay";

const base = {
  tipAmountServer: 0,
  donationAmountServer: 0,
  tipAmountLive: 0,
  donationAmountLive: 0,
  deliveryType: "delivery" as const,
  deliveryFeePending: false,
  pendingDeliveryFee: 0,
  gatiCashApplyAmount: 0,
  missedOfferUnlockDiscount: 0,
  missedOfferWalletPendingAmount: 0,
};

test("free delivery only: unlisted remainder is 0 when the row covers discountTotal", () => {
  assert.equal(
    computeUnlistedDiscountTotal({
      discountTotal: 74.31,
      listedDiscountAmount: 74.31,
    }),
    0
  );
});

test("free delivery + genuine extra discount: unlisted shows only the extra", () => {
  assert.equal(
    computeUnlistedDiscountTotal({
      discountTotal: 94.49,
      listedDiscountAmount: 74.31,
    }),
    20.18
  );
});

test("multiple listed discounts are not double-counted in unlisted remainder", () => {
  assert.equal(
    computeUnlistedDiscountTotal({
      discountTotal: 100,
      listedDiscountAmount: 40 + 35 + 25,
    }),
    0
  );
});

test("BOGO folded out of listed is also folded out of unlisted remainder", () => {
  assert.equal(
    computeUnlistedDiscountTotal({
      discountTotal: 90,
      listedDiscountAmount: 50,
      bogoDiscountTotal: 40,
    }),
    0
  );
});

test("Bill Summary ignores divergent optimistic To pay (no fabricated Other savings bridge)", () => {
  // Settled final 179.14; optimistic footer showed 158.96 → leftover would be ~20.18
  // if the sheet trusted the prop. Sheet must keep server 179.14.
  const resolved = resolveBillSummaryToPay({
    ...base,
    serverFinalAmount: 179.14,
    toPayAmountProp: 158.96,
  });
  assert.equal(resolved.serverToPay, 179.14);
  assert.equal(resolved.toPayDisplay, 179.14);
  assert.equal(resolved.ignoredDivergentProp, true);

  const leftoverIfTrustedProp = computeGrandToPayLeftover({
    grandTotalShown: 253.45,
    toPayDisplay: 158.96,
    listedPayDeductions: 74.31,
  });
  assert.equal(leftoverIfTrustedProp, 20.18);

  const leftoverAuthoritative = computeGrandToPayLeftover({
    grandTotalShown: 253.45,
    toPayDisplay: resolved.toPayDisplay,
    listedPayDeductions: 74.31,
  });
  assert.equal(leftoverAuthoritative, 0);
});

test("matching prop (within eps) is kept for live tip sync", () => {
  const resolved = resolveBillSummaryToPay({
    ...base,
    serverFinalAmount: 158.96,
    toPayAmountProp: 158.97,
  });
  assert.equal(resolved.toPayDisplay, 158.97);
  assert.equal(resolved.ignoredDivergentProp, false);
});

test("no prop → server to pay", () => {
  const resolved = resolveBillSummaryToPay({
    ...base,
    serverFinalAmount: 158.96,
    toPayAmountProp: null,
  });
  assert.equal(resolved.toPayDisplay, 158.96);
  assert.equal(resolved.ignoredDivergentProp, false);
});

test("live tip is included in authoritative sheet to pay", () => {
  const resolved = resolveBillSummaryToPay({
    ...base,
    serverFinalAmount: 150,
    tipAmountServer: 0,
    tipAmountLive: 10,
    toPayAmountProp: null,
  });
  assert.equal(resolved.toPayDisplay, 160);
});
