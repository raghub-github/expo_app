import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { splitWalletNegativeBalance } from "./rider-wallet-balance-split.js";

const emptyWallet = {
  negativeUsedFood: "0",
  negativeUsedParcel: "0",
  negativeUsedPersonRide: "0",
  unblockAllocFood: "0",
  unblockAllocParcel: "0",
  unblockAllocPersonRide: "0",
  penaltiesFood: "0",
  penaltiesParcel: "0",
  penaltiesPersonRide: "0",
};

describe("splitWalletNegativeBalance (post-fold: no ₹35 subscription cap)", () => {
  it("positive balance → nothing attributed", () => {
    const s = splitWalletNegativeBalance(120, emptyWallet, {});
    assert.equal(s.penaltyNegative, 0);
    assert.equal(s.subscriptionNegative, 0);
  });

  it("pure subscription negative of -55 stays fully subscription (NOT capped at 35)", () => {
    const s = splitWalletNegativeBalance(-55, emptyWallet, { subscriptionDuesOutstanding: 0 });
    assert.equal(s.penaltyNegative, 0);
    assert.equal(s.subscriptionNegative, 55); // pre-fold this was 35 + 20→penalty
  });

  it("pure penalty negative attributes to penalty, not subscription", () => {
    const wallet = { ...emptyWallet, negativeUsedFood: "30" };
    const s = splitWalletNegativeBalance(-30, wallet, {});
    assert.equal(s.penaltyNegative, 30);
    assert.equal(s.subscriptionNegative, 0);
  });

  it("mixed penalty + subscription: penalty from negativeUsed, rest is subscription (no overflow to penalty)", () => {
    const wallet = { ...emptyWallet, negativeUsedFood: "20" };
    const s = splitWalletNegativeBalance(-55, wallet, { subscriptionDuesOutstanding: 20 });
    assert.equal(s.penaltyNegative, 20);
    assert.equal(s.subscriptionNegative, 35); // pre-fold the 35+ would have been forced to penalty
  });

  it("abs(balance) equals penalty + subscription for any negative (single source of truth)", () => {
    const wallet = { ...emptyWallet, negativeUsedParcel: "40" };
    const s = splitWalletNegativeBalance(-90, wallet, { subscriptionDuesOutstanding: 50 });
    assert.equal(s.penaltyNegative + s.subscriptionNegative, 90);
  });
});
