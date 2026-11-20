import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_WALLET_ACTIVE_FLOOR,
  evaluateWalletFloor,
  formatSignedRupees,
  isWalletAtOrBelowFloor,
  neutralMinBalanceStatus,
  normalizeWalletActiveFloor,
  resolveWalletBlockState,
  walletUnlockAmount,
} from "./rider-wallet-min-balance.js";

/**
 * THE wallet rule: a rider is ACTIVE while the wallet balance is ABOVE the floor
 * (Super Admin "Global block threshold", default −₹200). At or below it, every
 * service pauses until the balance is back above it. There is no positive minimum.
 */
const F = -200;

// Spec matrix: active ⇔ balance > −200.
const CASES: Array<[number, boolean]> = [
  [2271, true],
  [200, true],
  [199, true],
  [0, true], // GMR1001 after withdrawing the whole wallet — must stay active
  [-50, true],
  [-199, true],
  [-199.99, true],
  [-200, false],
  [-200.01, false],
  [-250, false],
  [-1000, false],
];

for (const [balance, active] of CASES) {
  test(`balance ${formatSignedRupees(balance)} → ${active ? "ACTIVE" : "all services paused"}`, () => {
    const s = evaluateWalletFloor({ balance, floor: F });
    assert.equal(s.blocked, !active);
    assert.equal(isWalletAtOrBelowFloor(balance, F), !active);
    assert.equal(s.message == null, active);
  });
}

test("default floor is −₹200; bad / positive configs fall back to it", () => {
  assert.equal(DEFAULT_WALLET_ACTIVE_FLOOR, -200);
  assert.equal(normalizeWalletActiveFloor(undefined), -200);
  assert.equal(normalizeWalletActiveFloor(null), -200);
  assert.equal(normalizeWalletActiveFloor(""), -200);
  assert.equal(normalizeWalletActiveFloor("abc"), -200);
  assert.equal(normalizeWalletActiveFloor(200), -200); // the old positive minimum is never a floor
  assert.equal(normalizeWalletActiveFloor("-500.00"), -500); // numeric(10,2) from Postgres
  assert.equal(normalizeWalletActiveFloor(-300), -300);
  assert.equal(normalizeWalletActiveFloor(0), 0);
});

test("a configured floor of −₹500 keeps a −₹300 wallet active", () => {
  assert.equal(evaluateWalletFloor({ balance: -300, floor: -500 }).blocked, false);
  assert.equal(evaluateWalletFloor({ balance: -500, floor: -500 }).blocked, true);
});

test("unlock amount = least whole rupee that lifts the wallet strictly above the floor", () => {
  assert.equal(walletUnlockAmount(-250, F), 51); // −250 + 51 = −199
  assert.equal(walletUnlockAmount(-200, F), 1); // −200 + 1 = −199
  assert.equal(walletUnlockAmount(-200.5, F), 1); // −199.50
  assert.equal(walletUnlockAmount(-250.75, F), 51); // −199.75
  assert.equal(walletUnlockAmount(-199, F), 0);
  assert.equal(walletUnlockAmount(0, F), 0);
  // Exhaustive: for every paise balance in [−400, −200], unlock is minimal and sufficient.
  for (let paise = -40000; paise <= -20000; paise += 1) {
    const b = paise / 100;
    const x = walletUnlockAmount(b, F);
    assert.ok(b + x > F, `insufficient at ${b}`);
    assert.ok(!(b + (x - 1) > F), `not minimal at ${b}`);
  }
});

test("blocked status explains the pause, the unlock and the full dues", () => {
  const s = evaluateWalletFloor({ balance: -250, floor: F });
  assert.equal(s.unlockAmount, 51);
  assert.equal(s.clearDuesAmount, 250);
  assert.equal(
    s.message,
    "Your wallet balance -₹250 is at or below the -₹200 limit, so all services are paused. Recharge at least ₹51 to unlock (₹250 clears all dues)."
  );
  const active = evaluateWalletFloor({ balance: -80, floor: F });
  assert.equal(active.unlockAmount, 0);
  assert.equal(active.clearDuesAmount, 80);
  assert.equal(active.message, null);
});

test("the retired positive minimum never restricts anything", () => {
  for (const balance of [-500, -1, 0, 4, 190, 199.99, 200, 5000]) {
    const s = neutralMinBalanceStatus(balance);
    assert.equal(s.mode, "off");
    assert.equal(s.belowMinimum, false);
    assert.equal(s.restricted, false);
    assert.deepEqual(s.restrictedServices, []);
    assert.equal(s.shortfall, 0);
    assert.equal(s.message, null);
  }
});

// ---- live block state vs stored rows -------------------------------------------
const G = (s: string) => ({ serviceType: s, reason: "global_emergency" });
const N = (s: string) => ({ serviceType: s, reason: "negative_wallet" });

test("a stale global_emergency row never keeps a rider above the floor blocked", () => {
  const r = resolveWalletBlockState({
    balance: -150,
    floor: F,
    storedBlocks: [G("food"), G("parcel"), G("person_ride")],
  });
  assert.equal(r.globalBlocked, false);
  assert.deepEqual(r.effectiveBlocks, []);
  assert.equal(r.staleRows, true);
});

test("at the floor the rider is blocked live even before the sync wrote rows", () => {
  const r = resolveWalletBlockState({ balance: -200, floor: F, storedBlocks: [] });
  assert.equal(r.globalBlocked, true);
  assert.equal(r.staleRows, true, "missing global rows → resync");
  const synced = resolveWalletBlockState({ balance: -200, floor: F, storedBlocks: [G("food")] });
  assert.equal(synced.staleRows, false);
});

test("per-service penalty rows hold while ≤ ₹0 and lift once positive (auto-unblock)", () => {
  const neg = resolveWalletBlockState({ balance: -60, floor: F, storedBlocks: [N("food")] });
  assert.deepEqual(neg.effectiveBlocks, [N("food")]);
  assert.equal(neg.staleRows, false);
  const pos = resolveWalletBlockState({ balance: 10, floor: F, storedBlocks: [N("food")] });
  assert.deepEqual(pos.effectiveBlocks, []);
  assert.equal(pos.staleRows, true);
  const noAuto = resolveWalletBlockState({
    balance: 10,
    floor: F,
    autoUnblockOnZero: false,
    storedBlocks: [N("food")],
  });
  assert.deepEqual(noAuto.effectiveBlocks, [N("food")]);
});

test("fraud / manual blocks are always honoured", () => {
  const fraud = { serviceType: "parcel", reason: "fraud" };
  const r = resolveWalletBlockState({ balance: 5000, floor: F, storedBlocks: [fraud, G("food")] });
  assert.deepEqual(r.effectiveBlocks, [fraud]);
});

test("signed rupee formatting", () => {
  assert.equal(formatSignedRupees(-250), "-₹250");
  assert.equal(formatSignedRupees(199.5), "₹199.50");
  assert.equal(formatSignedRupees(0), "₹0");
});
