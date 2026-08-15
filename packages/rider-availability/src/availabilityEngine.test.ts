import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveAvailability, type AvailabilityInputs } from "./availabilityEngine.js";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function baseInput(overrides: Partial<AvailabilityInputs> = {}): AvailabilityInputs {
  return {
    accountStatus: "ACTIVE",
    onboardingStage: "ACTIVE",
    dutyStatus: "ON",
    dutyServiceTypes: ["food"],
    service: "food",
    locationUpdatedAt: new Date(NOW.getTime() - 60_000), // 1 minute ago
    freshnessMaxAgeMinutes: 10,
    currentActiveAssignments: 0,
    maxActiveAssignments: 3,
    now: NOW,
    ...overrides,
  };
}

test("eligible when every gate passes", () => {
  const result = deriveAvailability(baseInput());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
});

test("rejects stale location even when duty ON (the reported bug's root predicate)", () => {
  const result = deriveAvailability(
    baseInput({ locationUpdatedAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000) })
  );
  assert.equal(result.eligible, false);
  assert.equal(result.locationFresh, false);
  assert.ok(result.reasons.includes("location_stale"));
});

test("null location is never fresh", () => {
  const result = deriveAvailability(baseInput({ locationUpdatedAt: null }));
  assert.equal(result.locationFresh, false);
  assert.equal(result.locationAgeSeconds, null);
  assert.ok(result.reasons.includes("location_stale"));
});

test("location exactly at the freshness boundary is fresh (inclusive)", () => {
  const result = deriveAvailability(
    baseInput({ locationUpdatedAt: new Date(NOW.getTime() - 10 * 60_000), freshnessMaxAgeMinutes: 10 })
  );
  assert.equal(result.locationFresh, true);
});

test("location one second past the freshness boundary is stale", () => {
  const result = deriveAvailability(
    baseInput({ locationUpdatedAt: new Date(NOW.getTime() - (10 * 60_000 + 1000)), freshnessMaxAgeMinutes: 10 })
  );
  assert.equal(result.locationFresh, false);
});

test("off duty is rejected regardless of fresh location", () => {
  const result = deriveAvailability(baseInput({ dutyStatus: "OFF" }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("off_duty"));
});

test("duty ON but service not selected is rejected", () => {
  const result = deriveAvailability(baseInput({ dutyServiceTypes: ["parcel"], service: "food" }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("service_not_selected"));
});

test("account not ACTIVE is rejected even if everything else passes", () => {
  const result = deriveAvailability(baseInput({ accountStatus: "BLOCKED" }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("account_not_active"));
});

test("onboarding stage not ACTIVE is rejected", () => {
  const result = deriveAvailability(baseInput({ onboardingStage: "KYC_PENDING" }));
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("account_not_active"));
});

test("at capacity (current === max) has no remaining capacity", () => {
  const result = deriveAvailability(baseInput({ currentActiveAssignments: 3, maxActiveAssignments: 3 }));
  assert.equal(result.hasCapacity, false);
  assert.equal(result.remainingCapacity, 0);
  assert.ok(result.reasons.includes("no_capacity"));
});

test("under capacity is eligible on that dimension", () => {
  const result = deriveAvailability(baseInput({ currentActiveAssignments: 2, maxActiveAssignments: 3 }));
  assert.equal(result.hasCapacity, true);
  assert.equal(result.remainingCapacity, 1);
});

test("misconfigured zero max_active_assignments safely denies rather than allowing unlimited", () => {
  const result = deriveAvailability(baseInput({ currentActiveAssignments: 0, maxActiveAssignments: 0 }));
  assert.equal(result.hasCapacity, false);
  assert.ok(result.reasons.includes("no_capacity"));
});

test("multiple simultaneous failures all appear in reasons", () => {
  const result = deriveAvailability(
    baseInput({
      dutyStatus: "OFF",
      locationUpdatedAt: null,
      currentActiveAssignments: 3,
      maxActiveAssignments: 3,
    })
  );
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("off_duty"));
  assert.ok(result.reasons.includes("location_stale"));
  assert.ok(result.reasons.includes("no_capacity"));
});
