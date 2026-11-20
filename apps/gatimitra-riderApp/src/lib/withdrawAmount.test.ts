import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatRupeesShort,
  maxWithdrawalLimit,
  parseAmount,
  quickAmountOptions,
  sanitizeAmountInput,
  validateWithdrawAmount,
  withdrawButtonState,
} from "./withdrawAmount.js";

test("amount input keeps digits and one dot with two decimals", () => {
  assert.equal(sanitizeAmountInput("2271"), "2271");
  assert.equal(sanitizeAmountInput("₹1,000.509"), "1000.50");
  assert.equal(sanitizeAmountInput("12.3.4"), "12.34");
  assert.equal(sanitizeAmountInput("007"), "7");
  assert.equal(sanitizeAmountInput(".5"), "0.5");
  assert.equal(sanitizeAmountInput("abc"), "");
  assert.equal(sanitizeAmountInput(""), "");
});

test("parse + limit", () => {
  assert.equal(parseAmount(""), 0);
  assert.equal(parseAmount("227"), 227);
  assert.equal(parseAmount("-5"), 0);
  assert.equal(maxWithdrawalLimit(2271, 100000), 2271);
  assert.equal(maxWithdrawalLimit(250000, 100000), 100000);
  assert.equal(maxWithdrawalLimit(-40, 100000), 0);
});

test("quick amounts stay within min..limit and always offer Max", () => {
  assert.deepEqual(quickAmountOptions(300, 2271), [500, 1000, 2000, 2271]);
  assert.deepEqual(quickAmountOptions(300, 800), [500, 800]);
  assert.deepEqual(quickAmountOptions(300, 300), [300]);
  assert.deepEqual(quickAmountOptions(300, 200), [], "nothing to pick below the minimum");
  assert.deepEqual(quickAmountOptions(100, 9000), [1000, 2000, 5000, 9000]);
});

test("validation messages (the screenshot cases)", () => {
  assert.deepEqual(validateWithdrawAmount(2271, 300, 2271), { ok: true, message: null });
  const low = validateWithdrawAmount(227, 300, 2271);
  assert.equal(low.ok, false);
  assert.equal(!low.ok && low.reason, "below_min");
  assert.equal(low.message, "Minimum withdrawal is ₹300.");
  const high = validateWithdrawAmount(5000, 300, 2271);
  assert.equal(!high.ok && high.reason, "above_limit");
  assert.equal(high.message, "You can withdraw up to ₹2,271.");
  assert.equal(validateWithdrawAmount(0, 300, 2271).ok, false);
  const none = validateWithdrawAmount(100, 300, 120);
  assert.equal(!none.ok && none.reason, "unavailable");
});

test("button: ready shows a real label (never blank)", () => {
  const s = withdrawButtonState({ current: 2271, minAmount: 300, readyLabel: "Withdraw ₹2,271" });
  assert.deepEqual(s, { kind: "ready", label: "Withdraw ₹2,271" });
  assert.equal(withdrawButtonState({ current: 2271, minAmount: 300, readyLabel: "  " }).label, "Withdraw");
});

test("button: below the minimum shows how much more, with progress", () => {
  const s = withdrawButtonState({ current: 227, minAmount: 300, readyLabel: "Withdraw" });
  assert.equal(s.kind, "pending");
  assert.equal(s.label, "Add ₹73 more · min ₹300");
  assert.equal(s.kind === "pending" && Math.round(s.progress * 100), 76);
  assert.equal(withdrawButtonState({ current: 0, minAmount: 300, readyLabel: "W" }).label, "Minimum ₹300");
});

test("button: loading and blocked states", () => {
  assert.deepEqual(withdrawButtonState({ current: 500, minAmount: 300, readyLabel: "W", loading: true }), {
    kind: "loading",
    label: "Processing…",
  });
  const b = withdrawButtonState({
    current: 500,
    minAmount: 300,
    readyLabel: "W",
    disabled: true,
    blockedLabel: "Withdrawals paused",
  });
  assert.deepEqual(b, { kind: "blocked", label: "Withdrawals paused" });
});

test("rupee formatting", () => {
  assert.equal(formatRupeesShort(2271), "₹2,271");
  assert.equal(formatRupeesShort(1234.5), "₹1,234.50");
});
