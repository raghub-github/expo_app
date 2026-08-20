import assert from "node:assert/strict";
import { test } from "node:test";
import { penaltyFullyStopsDuty } from "./rider-account-restrictions.js";

test("sub-threshold penalty (no blocks) does NOT stop duty — the reported bug", () => {
  // Penalty made the balance negative but stayed below the configured block
  // threshold, so no service block was written. Duty must stay ON.
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: false,
      hasGlobalEmergencyBlock: false,
      penaltyBlockedServiceTypes: [],
    }),
    false
  );
});

test("partial penalty block (one service) does NOT fully stop duty", () => {
  // Only food crossed the per-service threshold; rider keeps parcel/ride.
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: false,
      hasGlobalEmergencyBlock: false,
      penaltyBlockedServiceTypes: ["food"],
    }),
    false
  );
});

test("all three services penalty-blocked stops duty", () => {
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: false,
      hasGlobalEmergencyBlock: false,
      penaltyBlockedServiceTypes: ["food", "parcel", "person_ride"],
    }),
    true
  );
});

test("service alias 'ride' normalises to person_ride when completing the set", () => {
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: false,
      hasGlobalEmergencyBlock: false,
      penaltyBlockedServiceTypes: ["food", "parcel", "ride"],
    }),
    true
  );
});

test("global-emergency block stops duty regardless of per-service blocks", () => {
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: false,
      hasGlobalEmergencyBlock: true,
      penaltyBlockedServiceTypes: [],
    }),
    true
  );
});

test("account-level blocked status defers to that path (not penalty duty-stop)", () => {
  assert.equal(
    penaltyFullyStopsDuty({
      blockedStatus: true,
      hasGlobalEmergencyBlock: true,
      penaltyBlockedServiceTypes: ["food", "parcel", "person_ride"],
    }),
    false
  );
});
