import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateMinWalletBalance,
  normalizeMinBalanceMode,
  riderWalletRechargeDue,
} from "./rider-wallet-min-balance.js";

const T = 200;

// Spec wallet matrix: ₹500, ₹220, ₹200, ₹199, ₹180 (+ negative).
const CASES: Array<[number, boolean, number]> = [
  [500, false, 0],
  [220, false, 0],
  [200, false, 0],
  [199, true, 1],
  [180, true, 20],
  [0, true, 200],
  [-30, true, 230],
];

for (const [balance, below, shortfall] of CASES) {
  test(`enforce: balance ₹${balance} → ${below ? `restricted, recharge ₹${shortfall}` : "eligible"}`, () => {
    const s = evaluateMinWalletBalance({ balance, threshold: T, mode: "enforce" });
    assert.equal(s.belowMinimum, below);
    assert.equal(s.restricted, below);
    assert.equal(s.shortfall, shortfall);
    assert.deepEqual(s.restrictedServices, below ? ["parcel", "person_ride"] : []);
    if (below) {
      assert.equal(
        s.message,
        "Your available wallet balance is below ₹200. Recharge your wallet to continue receiving new assignments."
      );
    } else {
      assert.equal(s.message, null);
    }
  });
}

test("food is never restricted by the minimum-balance rule", () => {
  const s = evaluateMinWalletBalance({ balance: 10, threshold: T, mode: "enforce" });
  assert.ok(!(s.restrictedServices as string[]).includes("food"));
});

test("warn mode shows the shortfall but never restricts dispatch", () => {
  const s = evaluateMinWalletBalance({ balance: 150, threshold: T, mode: "warn" });
  assert.equal(s.belowMinimum, true);
  assert.equal(s.restricted, false);
  assert.deepEqual(s.restrictedServices, []);
  assert.equal(s.shortfall, 50);
  assert.match(s.message ?? "", /Recharge ₹50/);
});

test("off mode and a ₹0 threshold do nothing", () => {
  for (const s of [
    evaluateMinWalletBalance({ balance: -50, threshold: T, mode: "off" }),
    evaluateMinWalletBalance({ balance: -50, threshold: 0, mode: "enforce" }),
  ]) {
    assert.equal(s.belowMinimum, false);
    assert.equal(s.restricted, false);
    assert.equal(s.shortfall, 0);
  }
});

test("a cash-ride debit that crosses the minimum restricts; a recharge back to it restores", () => {
  const before = evaluateMinWalletBalance({ balance: 210, threshold: T, mode: "enforce" });
  assert.equal(before.restricted, false);
  const afterDebit = evaluateMinWalletBalance({ balance: 210 - 20, threshold: T, mode: "enforce" });
  assert.equal(afterDebit.restricted, true);
  assert.equal(afterDebit.shortfall, 10);
  const afterRecharge = evaluateMinWalletBalance({
    balance: 190 + afterDebit.shortfall,
    threshold: T,
    mode: "enforce",
  });
  assert.equal(afterRecharge.restricted, false);
});

test("paise-level balances keep an exact shortfall", () => {
  const s = evaluateMinWalletBalance({ balance: 199.99, threshold: T, mode: "enforce" });
  assert.equal(s.shortfall, 0.01);
  assert.match(s.message ?? "", /below ₹200\./);
});

test("recharge due covers the larger of the negative balance and the shortfall", () => {
  assert.equal(riderWalletRechargeDue({ balance: -30, threshold: T, mode: "off" }), 30);
  assert.equal(riderWalletRechargeDue({ balance: -30, threshold: T, mode: "warn" }), 230);
  assert.equal(riderWalletRechargeDue({ balance: 150, threshold: T, mode: "enforce" }), 50);
  assert.equal(riderWalletRechargeDue({ balance: 150, threshold: T, mode: "off" }), 0);
  assert.equal(riderWalletRechargeDue({ balance: 500, threshold: T, mode: "enforce" }), 0);
});

test("unknown modes fail safe to off", () => {
  assert.equal(normalizeMinBalanceMode("ENFORCE"), "enforce");
  assert.equal(normalizeMinBalanceMode("warn"), "warn");
  assert.equal(normalizeMinBalanceMode("block"), "off");
  assert.equal(normalizeMinBalanceMode(null), "off");
});
