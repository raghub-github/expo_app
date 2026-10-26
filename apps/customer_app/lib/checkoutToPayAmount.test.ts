import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCheckoutStrikethroughTotal,
  computeCheckoutToPayAmount,
  grandTotalWithoutUnconfirmedDelivery,
  isDeliverySpecificDiscount,
} from "./checkoutToPayAmount";

test("grand total drops an unconfirmed delivery fee and its waiver", () => {
  const grand = grandTotalWithoutUnconfirmedDelivery({
    grandTotalBeforeDiscounts: 416.02,
    deliveryFeePending: true,
    deliveryType: "delivery",
    pendingDeliveryFee: 74.21,
    deliverySpecificDiscount: 0,
  });
  assert.equal(grand, 341.81);
});

test("a locked address keeps the delivery fee inside grand total", () => {
  const grand = grandTotalWithoutUnconfirmedDelivery({
    grandTotalBeforeDiscounts: 416.02,
    deliveryFeePending: false,
    deliveryType: "delivery",
    pendingDeliveryFee: 74.21,
    deliverySpecificDiscount: 0,
  });
  assert.equal(grand, 416.02);
});

test("takeaway grand total is not rewritten as a pending delivery fee", () => {
  const grand = grandTotalWithoutUnconfirmedDelivery({
    grandTotalBeforeDiscounts: 341.81,
    deliveryFeePending: false,
    deliveryType: "self_pickup",
    pendingDeliveryFee: 0,
    deliverySpecificDiscount: 0,
  });
  assert.equal(grand, 341.81);
});

test("delivery waiver labels are recognized and other discounts are not", () => {
  assert.equal(
    isDeliverySpecificDiscount({
      label: "Free delivery",
      meta: { offerKind: "FREE_DELIVERY" },
    }),
    true
  );
  assert.equal(isDeliverySpecificDiscount({ label: "Coupon", meta: { offerKind: "CART_PERCENTAGE" } }), false);
});

test("pending delivery fee is excluded until an address locks the quote", () => {
  const toPay = computeCheckoutToPayAmount({
    finalAmount: 186.23,
    deliveryType: "delivery",
    deliveryFeePending: true,
    pendingDeliveryFee: 34.23,
    gatiCashApplyAmount: 0,
    missedOfferUnlockDiscount: 0,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(toPay, 152);
});

test("computeCheckoutToPayAmount subtracts GatiCash from server final amount", () => {
  const toPay = computeCheckoutToPayAmount({
    finalAmount: 281.63,
    deliveryType: "delivery",
    deliveryFeePending: false,
    pendingDeliveryFee: 34.71,
    gatiCashApplyAmount: 281.63,
    missedOfferUnlockDiscount: 0,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(toPay, 0);
});

test("strikethrough without GatiCash shows pre-discount list when savings apply", () => {
  const strike = computeCheckoutStrikethroughTotal({
    toPayAmount: 281.63,
    gatiCashApplyAmount: 0,
    checkoutSavingsTotal: 74.5,
    missedOfferWalletPending: false,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(strike, 356.13);
});

test("strikethrough with 100% GatiCash uses net payable before wallet, not pre-discount list", () => {
  const strike = computeCheckoutStrikethroughTotal({
    toPayAmount: 0,
    gatiCashApplyAmount: 281.63,
    checkoutSavingsTotal: 74.5,
    missedOfferWalletPending: false,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(strike, 281.63);
});

test("strikethrough with partial GatiCash uses pre-wallet net payable", () => {
  const strike = computeCheckoutStrikethroughTotal({
    toPayAmount: 50,
    gatiCashApplyAmount: 231.63,
    checkoutSavingsTotal: 74.5,
    missedOfferWalletPending: false,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(strike, 281.63);
});

test("strikethrough hidden when missed-offer wallet top-up inflates payable", () => {
  const strike = computeCheckoutStrikethroughTotal({
    toPayAmount: 120,
    gatiCashApplyAmount: 0,
    checkoutSavingsTotal: 20,
    missedOfferWalletPending: true,
    missedOfferWalletPendingAmount: 50,
  });
  assert.equal(strike, null);
});

test("to-pay and strikethrough reconcile for wallet-covered order", () => {
  const finalAmount = 281.63;
  const gatiCash = 281.63;
  const toPay = computeCheckoutToPayAmount({
    finalAmount,
    deliveryType: "delivery",
    deliveryFeePending: false,
    pendingDeliveryFee: 34.71,
    gatiCashApplyAmount: gatiCash,
    missedOfferUnlockDiscount: 0,
    missedOfferWalletPendingAmount: 0,
  });
  const strike = computeCheckoutStrikethroughTotal({
    toPayAmount: toPay,
    gatiCashApplyAmount: gatiCash,
    checkoutSavingsTotal: 74.5,
    missedOfferWalletPending: false,
    missedOfferWalletPendingAmount: 0,
  });
  assert.equal(toPay, 0);
  assert.equal(strike, finalAmount);
  assert.equal(round2(strike! + toPay - gatiCash), 0);
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
