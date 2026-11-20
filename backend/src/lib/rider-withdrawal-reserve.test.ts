import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * GMR1001, 2026-11-20 10:49 IST: "Withdrawal request #5" took ₹2,271 — the whole
 * wallet — and 19 s later the rider was paused for Ride + Parcel by the ₹200
 * minimum-balance rule (enforce). Withdrawals must leave that minimum behind, and
 * must not subtract pending requests a second time (each is debited from
 * total_balance when it is created).
 */
function setup(
  t: TestContext,
  opts: { balance: number; policy: { minWalletBalance: number; minBalanceMode: string } | "throws" }
) {
  t.mock.module("./rider-subscription-wallet.js", {
    namedExports: { readRiderWalletBalance: async () => opts.balance },
  });
  t.mock.module("../modules/rides/settlement/rideSettlement.repository.js", {
    namedExports: {
      loadRideWalletPolicy: async () => {
        if (opts.policy === "throws") throw new Error("policy unreadable");
        return opts.policy;
      },
    },
  });
  // A pending request must NOT be subtracted again — make it large so a regression shows.
  t.mock.module("../db/client.js", {
    namedExports: {
      getSql: () => async () => [{ total: 999_999, cnt: 1 }],
      getDb: () => ({}),
    },
  });
}

const ENFORCE = { minWalletBalance: 200, minBalanceMode: "enforce" };

test("enforce: a ₹2,271 wallet can withdraw ₹2,071 — ₹200 stays for Ride/Parcel", async (t) => {
  setup(t, { balance: 2271, policy: ENFORCE });
  const m = await import(`./rider-withdrawal.service.js?a=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawReserve(), 200);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 2071);
});

test("pending requests are not subtracted twice (balance is already net of them)", async (t) => {
  setup(t, { balance: 1271, policy: { minWalletBalance: 200, minBalanceMode: "off" } });
  const m = await import(`./rider-withdrawal.service.js?b=${Math.random()}`);
  // Old code: 1271 − pending(999,999) → 0. Correct: the full 1271.
  assert.equal(await m.getRiderWithdrawableBalance(1001), 1271);
});

test("warn / off modes reserve nothing", async (t) => {
  setup(t, { balance: 2271, policy: { minWalletBalance: 200, minBalanceMode: "warn" } });
  const m = await import(`./rider-withdrawal.service.js?c=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 2271);
});

test("at or below the minimum nothing is withdrawable (never negative)", async (t) => {
  setup(t, { balance: 150, policy: ENFORCE });
  const m = await import(`./rider-withdrawal.service.js?d=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 0);
});

test("unreadable policy never blocks a payout on a guess", async (t) => {
  setup(t, { balance: 300, policy: "throws" });
  const m = await import(`./rider-withdrawal.service.js?e=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawReserve(), 0);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 300);
});

test("withdrawableFromBalance: paise-exact, clamps at zero", async (t) => {
  setup(t, { balance: 0, policy: ENFORCE });
  const m = await import(`./rider-withdrawal.service.js?f=${Math.random()}`);
  assert.equal(m.withdrawableFromBalance(200.01, 200), 0.01);
  assert.equal(m.withdrawableFromBalance(199.99, 200), 0);
  assert.equal(m.withdrawableFromBalance(-50, 200), 0);
  assert.equal(m.withdrawableFromBalance(500, 0), 500);
});
