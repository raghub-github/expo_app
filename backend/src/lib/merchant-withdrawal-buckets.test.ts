import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateMerchantWithdrawalAccounting,
  roundMoney,
} from "@gatimitra/contracts";

function money(n: number): number {
  return roundMoney(n);
}

/** In-memory lifecycle used to prove remaining = X − Y without hardcoded rupees. */
function reserve(state: { available: number; hold: number; pending: number; paid: number }, y: number) {
  const accounting = calculateMerchantWithdrawalAccounting({
    available_balance: state.available,
    hold_balance: state.hold,
    pending_withdrawal_total: state.pending,
  });
  if (y > accounting.withdrawable_balance + 0.009) {
    throw new Error("insufficient");
  }
  return {
    available: money(state.available - y),
    hold: money(state.hold + y),
    pending: money(state.pending + y),
    paid: state.paid,
  };
}

function complete(state: { available: number; hold: number; pending: number; paid: number }, y: number) {
  return {
    available: state.available,
    hold: money(state.hold - y),
    pending: money(state.pending - y),
    paid: money(state.paid + y),
  };
}

function release(state: { available: number; hold: number; pending: number; paid: number }, y: number) {
  return {
    available: money(state.available + y),
    hold: money(state.hold - y),
    pending: money(Math.max(0, state.pending - y)),
    paid: state.paid,
  };
}

describe("merchant withdrawal accounting lifecycle", () => {
  it("partial reserve leaves remaining = X − Y on both surfaces", () => {
    const x = money(200 + Math.random() * 5000);
    const y = money(Math.min(x - 1, 100 + Math.random() * (x - 101)));
    const after = reserve({ available: x, hold: 0, pending: 0, paid: 0 }, y);
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: after.available,
      hold_balance: after.hold,
      pending_withdrawal_total: after.pending,
    });
    assert.equal(view.withdrawable_balance, money(x - y));
    assert.equal(view.pending_withdrawal, y);
    assert.equal(view.held_balance, y);
  });

  it("uncovered pending payout still reduces withdrawable to X − Y", () => {
    const x = money(300 + Math.random() * 2000);
    const y = money(100 + Math.random() * Math.min(400, x - 101));
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: x,
      hold_balance: 0,
      pending_withdrawal_total: y,
    });
    assert.equal(view.withdrawable_balance, money(x - y));
  });

  it("full reserve leaves withdrawable = 0 while pending remains visible", () => {
    const x = money(400 + Math.random() * 3000);
    const after = reserve({ available: x, hold: 0, pending: 0, paid: 0 }, x);
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: after.available,
      hold_balance: after.hold,
      pending_withdrawal_total: after.pending,
    });
    assert.equal(view.withdrawable_balance, 0);
    assert.equal(view.pending_withdrawal, x);
  });

  it("failed / rejected / cancelled / reversed release restores original X", () => {
    const x = money(500 + Math.random() * 2500);
    const y = money(100 + Math.random() * Math.min(300, x - 101));
    const held = reserve({ available: x, hold: 0, pending: 0, paid: 0 }, y);
    const restored = release(held, y);
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: restored.available,
      hold_balance: restored.hold,
      pending_withdrawal_total: restored.pending,
      failed_amount: y,
    });
    assert.equal(view.withdrawable_balance, x);
    assert.equal(view.held_balance, 0);
    assert.equal(view.failed_amount, y);
  });

  it("successful payout keeps remaining X − Y and moves Y to paid", () => {
    const x = money(600 + Math.random() * 2500);
    const y = money(100 + Math.random() * Math.min(400, x - 101));
    const held = reserve({ available: x, hold: 0, pending: 0, paid: 0 }, y);
    const done = complete(held, y);
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: done.available,
      hold_balance: done.hold,
      pending_withdrawal_total: done.pending,
      paid_amount: done.paid,
    });
    assert.equal(view.withdrawable_balance, money(x - y));
    assert.equal(view.held_balance, 0);
    assert.equal(view.paid_amount, y);
  });

  it("second concurrent reserve cannot spend the same rupees", () => {
    const x = money(800 + Math.random() * 1200);
    const y = money(Math.max(100, money(x * 0.6)));
    const afterFirst = reserve({ available: x, hold: 0, pending: 0, paid: 0 }, y);
    assert.throws(() => reserve(afterFirst, y));
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: afterFirst.available,
      hold_balance: afterFirst.hold,
      pending_withdrawal_total: afterFirst.pending,
    });
    assert.equal(view.withdrawable_balance, money(x - y));
  });

  it("frozen wallet still reports the real withdrawable amount", () => {
    const x = money(250 + Math.random() * 1000);
    const view = calculateMerchantWithdrawalAccounting({
      available_balance: x,
      hold_balance: 0,
      is_frozen: true,
    });
    assert.equal(view.withdrawable_balance, x);
    assert.equal(view.withdrawal_allowed, false);
    assert.equal(view.is_frozen, true);
  });
});
