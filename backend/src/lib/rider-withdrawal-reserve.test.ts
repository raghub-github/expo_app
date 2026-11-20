import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * Withdrawals. A rider stays active while the wallet is above the −₹200 floor, so
 * nothing is reserved: the whole positive balance is withdrawable. Pending requests
 * are already debited from total_balance at creation, so they must not be
 * subtracted a second time.
 */
function setup(t: TestContext, opts: { balance: number }) {
  t.mock.module("./rider-subscription-wallet.js", {
    namedExports: { readRiderWalletBalance: async () => opts.balance },
  });
  // A pending request must NOT be subtracted again — make it large so a regression shows.
  t.mock.module("../db/client.js", {
    namedExports: {
      getSql: () => async () => [{ total: 999_999, cnt: 1 }],
      getDb: () => ({}),
    },
  });
}

test("GMR1001: a ₹2,271 wallet can withdraw all ₹2,271 (₹0 is still well above −₹200)", async (t) => {
  setup(t, { balance: 2271 });
  const m = await import(`./rider-withdrawal.service.js?a=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 2271);
});

test("pending requests are not subtracted twice (balance is already net of them)", async (t) => {
  setup(t, { balance: 1271 });
  const m = await import(`./rider-withdrawal.service.js?b=${Math.random()}`);
  // Old code: 1271 − pending(999,999) → 0. Correct: the full 1271.
  assert.equal(await m.getRiderWithdrawableBalance(1001), 1271);
});

test("a zero or negative wallet has nothing to withdraw (never negative)", async (t) => {
  setup(t, { balance: -150 });
  const m = await import(`./rider-withdrawal.service.js?c=${Math.random()}`);
  assert.equal(await m.getRiderWithdrawableBalance(1001), 0);
  assert.equal(m.withdrawableFromBalance(0), 0);
  assert.equal(m.withdrawableFromBalance(-0.01), 0);
});

test("paise-exact", async (t) => {
  setup(t, { balance: 0 });
  const m = await import(`./rider-withdrawal.service.js?d=${Math.random()}`);
  assert.equal(m.withdrawableFromBalance(199.99), 199.99);
  assert.equal(m.withdrawableFromBalance(0.01), 0.01);
});
