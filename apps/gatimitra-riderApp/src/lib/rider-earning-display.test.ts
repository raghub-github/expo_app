import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRiderRideEarningBreakdown,
  buildRiderDeliveryEarningBreakdown,
} from "./rider-earning-display.js";

/** The breakdown lines (excluding the emphasised Total) must ALWAYS sum to the total. */
function sumOfLines(lines: { amount: number; emphasis?: boolean }[]): number {
  return lines.filter((l) => !l.emphasis).reduce((s, l) => s + l.amount, 0);
}

/** Minimal order-like fixture accepted by the earning resolver (only earning fields matter). */
function order(o: {
  totalEarning: number;
  baseEarning: number;
  waitingEarning: number;
  surgeEarning: number;
  customerTipAmount: number;
  appliedSurges: { name: string; amount: number }[];
}) {
  return { estimatedEarning: 0, ...o } as unknown as Parameters<typeof buildRiderRideEarningBreakdown>[0];
}

test("ride breakdown always sums to total (leg total ₹89, legacy base ₹39 ignored)", () => {
  // Reproduces the reported case: baseEarning (legacy %-pool) ≠ totalEarning (v3.2 leg payout).
  const b = buildRiderRideEarningBreakdown(order({
    totalEarning: 89,
    baseEarning: 39, // legacy field — must NOT create an unexplained gap
    waitingEarning: 0,
    surgeEarning: 0,
    customerTipAmount: 0,
    appliedSurges: [],
  }));
  assert.equal(b.totalEarning, 89);
  assert.equal(sumOfLines(b.lines), 89, "lines must add up to the total");
  // Single derived "Ride fare" line equal to the total when there are no extras.
  assert.equal(b.lines[0]!.label, "Ride fare");
  assert.equal(b.lines[0]!.amount, 89);
  assert.equal(b.lines.some((l) => /company/i.test(l.label)), false, "never shows company earnings");
});

test("ride breakdown itemises waiting + tip and still sums to total", () => {
  const b = buildRiderRideEarningBreakdown(order({
    totalEarning: 120,
    baseEarning: 39,
    waitingEarning: 15,
    surgeEarning: 0,
    customerTipAmount: 20,
    appliedSurges: [],
  }));
  // Ride fare = 120 − 15 − 20 = 85
  assert.equal(b.lines[0]!.amount, 85);
  assert.equal(sumOfLines(b.lines), 120);
  const labels = b.lines.map((l) => l.label);
  assert.ok(labels.includes("Waiting charge"));
  assert.ok(labels.includes("Customer tip"));
});

test("applied surges are itemised and included in the sum", () => {
  const b = buildRiderRideEarningBreakdown(order({
    totalEarning: 100,
    baseEarning: 39,
    waitingEarning: 0,
    surgeEarning: 0,
    customerTipAmount: 0,
    appliedSurges: [{ name: "Rain surge", amount: 10 }],
  }));
  // Ride fare = 100 − 10 = 90
  assert.equal(b.lines[0]!.amount, 90);
  assert.equal(sumOfLines(b.lines), 100);
});

test("delivery breakdown uses 'Delivery Fee' label and sums to total", () => {
  const b = buildRiderDeliveryEarningBreakdown(order({
    totalEarning: 60,
    baseEarning: 22,
    waitingEarning: 5,
    surgeEarning: 0,
    customerTipAmount: 0,
    appliedSurges: [],
  }));
  assert.equal(b.lines[0]!.label, "Delivery Fee");
  assert.equal(b.lines[0]!.amount, 55); // 60 − 5
  assert.equal(sumOfLines(b.lines), 60);
});
