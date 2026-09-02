import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeCheckoutStrikethroughTotal,
  computeCheckoutToPayAmount,
} from "./checkoutToPayAmount";

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
