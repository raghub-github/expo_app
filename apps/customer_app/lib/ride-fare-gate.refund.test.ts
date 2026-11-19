import { test } from "node:test";
import assert from "node:assert/strict";
import { isFarePaidElsewhereRefundError, isRideFareAlreadyPaidError } from "./ride-fare-gate";

const axiosLike = (status: number, message: string) => ({ response: { status, data: { error: "conflict", message } } });

test("in-app payment after the captain already took cash → refund notice, not a success screen", () => {
  const e = axiosLike(409, "This ride was already paid. Your online payment is being refunded to the original payment method.");
  assert.match(String(isFarePaidElsewhereRefundError(e)), /refunded/);
  assert.equal(isRideFareAlreadyPaidError(e), true);
});

test("plain 'already paid' (our own payment confirmed twice) is not a refund", () => {
  assert.equal(isFarePaidElsewhereRefundError(axiosLike(409, "Ride fare is already paid")), null);
  assert.equal(isRideFareAlreadyPaidError(axiosLike(409, "Ride fare is already paid")), true);
});

test("other errors are neither", () => {
  assert.equal(isFarePaidElsewhereRefundError(axiosLike(400, "Invalid payment signature")), null);
  assert.equal(isFarePaidElsewhereRefundError(new Error("network")), null);
});
