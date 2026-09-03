import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapOrderTypeToEligibilityService,
  eligibilityEnforcementMode,
} from "./riderEligibility.service.ts";

test("order type maps to eligibility service", () => {
  assert.equal(mapOrderTypeToEligibilityService("food"), "food");
  assert.equal(mapOrderTypeToEligibilityService("parcel"), "parcel");
  assert.equal(mapOrderTypeToEligibilityService("person_ride"), "person_ride");
  assert.equal(mapOrderTypeToEligibilityService("ride"), "person_ride");
  assert.equal(mapOrderTypeToEligibilityService("unknown"), null);
});

test("enforcement mode defaults to shadow and honors the env override", () => {
  const prev = process.env.RIDER_ELIGIBILITY_MODE;
  try {
    delete process.env.RIDER_ELIGIBILITY_MODE;
    assert.equal(eligibilityEnforcementMode(), "shadow");
    process.env.RIDER_ELIGIBILITY_MODE = "enforce";
    assert.equal(eligibilityEnforcementMode(), "enforce");
    process.env.RIDER_ELIGIBILITY_MODE = "off";
    assert.equal(eligibilityEnforcementMode(), "off");
    process.env.RIDER_ELIGIBILITY_MODE = "garbage";
    assert.equal(eligibilityEnforcementMode(), "shadow");
  } finally {
    if (prev === undefined) delete process.env.RIDER_ELIGIBILITY_MODE;
    else process.env.RIDER_ELIGIBILITY_MODE = prev;
  }
});
