import assert from "node:assert/strict";
import { test } from "node:test";
import {
  estimateRidePickupWaitingCharge,
  buildRidePickupWaitRiderLabel,
  type RidePickupWaitFields,
} from "./ride-pickup-wait.js";

const MIN = 60_000;

/** started N minutes ago, with a given free budget + per-min rate. */
function waitingSince(minsAgo: number, extra: Partial<RidePickupWaitFields> = {}): {
  fields: RidePickupWaitFields;
  now: number;
} {
  const now = 1_000_000_000_000;
  return {
    now,
    fields: {
      pickupWaitStartedAt: new Date(now - minsAgo * MIN).toISOString(),
      pickupTimerBudgetSeconds: 120, // 2 free minutes
      ridePickupWaitingChargePerMin: 2,
      ...extra,
    },
  };
}

test("no charge while inside the free window", () => {
  const { fields, now } = waitingSince(1.5); // 90s elapsed, 120s free
  assert.equal(estimateRidePickupWaitingCharge(fields, now), 0);
});

test("charges per billable minute after the free window (ceil)", () => {
  const { fields, now } = waitingSince(5); // 300s elapsed − 120s free = 180s billable = 3 min
  assert.equal(estimateRidePickupWaitingCharge(fields, now), 6); // 3 × ₹2
});

test("respects the max-charge cap", () => {
  const { fields, now } = waitingSince(60, { ridePickupWaitingMaxCharge: 20 });
  // 60min − 2 free = 58 billable min × ₹2 = ₹116, capped to ₹20
  assert.equal(estimateRidePickupWaitingCharge(fields, now), 20);
});

test("no charge when no per-min rate is configured", () => {
  const { fields, now } = waitingSince(10, { ridePickupWaitingChargePerMin: 0 });
  assert.equal(estimateRidePickupWaitingCharge(fields, now), 0);
});

test("rider label shows free countdown, then billable timer + live ₹", () => {
  const free = waitingSince(1); // still free
  assert.match(buildRidePickupWaitRiderLabel(free.fields, free.now), /Free wait/);

  const billed = waitingSince(5); // 3 billable min × ₹2 = ₹6
  const label = buildRidePickupWaitRiderLabel(billed.fields, billed.now);
  assert.match(label, /Waiting for OTP/);
  assert.match(label, /\+₹6/);
});
