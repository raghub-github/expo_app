import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildServiceEligibilityRows,
  dedupeCommercialVehicleReasons,
  hasBlockedService,
  overlayOnboardingSummaryWithEligibility,
  resolveSelectableServices,
  resolveEligibilitySloganMode,
  GENERIC_SERVICE_BLOCK,
  RIDER_SERVICE_DISPLAY_ORDER,
} from "./rider-service-eligibility-rows";

test("overlayOnboardingSummaryWithEligibility uses the live engine result", () => {
  const summary = {
    onboarding: {
      eligibleServices: ["food"],
      blockedServices: [
        { service: "parcel", missingDocuments: ["DRIVING_LICENSE"], reasons: ["stale"] },
      ],
      allEligible: false,
    },
  };
  const overlaid = overlayOnboardingSummaryWithEligibility(summary, {
    food: { eligible: true, blocking: [] },
    parcel: { eligible: true, blocking: [] },
    person_ride: {
      eligible: false,
      blocking: [{ code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "A commercial vehicle is required." }],
    },
  });
  assert.deepEqual(overlaid.onboarding.eligibleServices, ["food", "parcel"]);
  assert.equal(overlaid.onboarding.blockedServices.length, 1);
  assert.equal(overlaid.onboarding.blockedServices[0]!.service, "person_ride");
  assert.equal(
    overlaid.onboarding.blockedServices[0]!.reasons[0],
    "A commercial vehicle is required.",
  );
});

test("selectable services render as selectable with no reasons", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food", "parcel", "person_ride"],
    backend: null,
  });
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.service),
    RIDER_SERVICE_DISPLAY_ORDER
  );
  assert.ok(rows.every((r) => r.state === "selectable" && r.reasons.length === 0));
  assert.equal(hasBlockedService(rows), false);
});

test("a service missing from the pool is blocked and shows the backend reasons", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food"],
    backend: {
      person_ride: {
        eligible: false,
        blocking: [
          {
            code: "COMMERCIAL_VEHICLE_REQUIRED",
            reason: "A commercial vehicle is required for Person Ride at this location.",
            requiredAction: "Register a commercial vehicle for this service.",
          },
        ],
      },
    },
  });
  const ride = rows.find((r) => r.service === "person_ride")!;
  assert.equal(ride.state, "blocked");
  assert.equal(ride.reasons.length, 1);
  assert.equal(ride.reasons[0]!.code, "COMMERCIAL_VEHICLE_REQUIRED");
  assert.equal(hasBlockedService(rows), true);
});

test("backend-eligible services are selectable even if missing from the client pool", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food"],
    backend: { parcel: { eligible: true, blocking: [] } },
  });
  const parcel = rows.find((r) => r.service === "parcel")!;
  assert.equal(parcel.state, "selectable");
});

test("blocked service with no backend reason falls back to a single generic reason", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food"],
    backend: { parcel: { eligible: false, blocking: [] } },
  });
  const parcel = rows.find((r) => r.service === "parcel")!;
  assert.equal(parcel.state, "blocked");
  assert.deepEqual(parcel.reasons, [GENERIC_SERVICE_BLOCK]);

  const person = rows.find((r) => r.service === "person_ride")!;
  assert.equal(person.state, "blocked");
  assert.deepEqual(person.reasons, [GENERIC_SERVICE_BLOCK]);
});

test("engine ineligible wins over a client-pool selectable row", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food"],
    backend: {
      food: {
        eligible: false,
        blocking: [{ code: "DL_REQUIRED_NOT_VERIFIED", reason: "DL not verified." }],
      },
    },
  });
  const food = rows.find((r) => r.service === "food")!;
  assert.equal(food.state, "blocked");
  assert.equal(food.reasons[0]!.code, "DL_REQUIRED_NOT_VERIFIED");
});

test("resolveSelectableServices: complete backend is the selectable source of truth", () => {
  const selectable = resolveSelectableServices({
    clientPool: ["food"],
    backend: {
      food: { eligible: true, blocking: [] },
      parcel: { eligible: true, blocking: [] },
      person_ride: {
        eligible: false,
        blocking: [{ code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "x" }],
      },
    },
    enforced: false,
  });
  assert.deepEqual(selectable, ["food", "parcel"]);
});

test("resolveSelectableServices: missing backend data is fail-open (no lockout)", () => {
  assert.deepEqual(
    resolveSelectableServices({ clientPool: ["food"], backend: null, enforced: true }),
    ["food"]
  );
});

test("resolveSelectableServices: partial backend still respects known ineligible services", () => {
  assert.deepEqual(
    resolveSelectableServices({
      clientPool: ["food", "parcel", "person_ride"],
      backend: {
        person_ride: {
          eligible: false,
          blocking: [{ code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "x" }],
        },
      },
      enforced: true,
    }),
    ["food", "parcel"],
  );
});

test("resolveSelectableServices: engine-eligible services are added even if outside the client pool", () => {
  assert.deepEqual(
    resolveSelectableServices({
      clientPool: ["food"],
      backend: {
        food: { eligible: true, blocking: [] },
        parcel: { eligible: false, blocking: [] },
        person_ride: { eligible: true, blocking: [] },
      },
      enforced: true,
    }),
    ["food", "person_ride"],
  );
});

test("a custom order is honoured", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: [],
    backend: null,
    order: ["person_ride", "food", "parcel"],
  });
  assert.deepEqual(
    rows.map((r) => r.service),
    ["person_ride", "food", "parcel"]
  );
});

test("eligibility slogan: docs → docs; vehicle/commercial → vehicle; geo OFF → area", () => {
  assert.equal(
    resolveEligibilitySloganMode([
      { code: "DL_REQUIRED_NOT_VERIFIED", reason: "DL required" },
    ]),
    "docs"
  );
  assert.equal(
    resolveEligibilitySloganMode([
      { code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "Commercial required" },
    ]),
    "vehicle"
  );
  assert.equal(
    resolveEligibilitySloganMode([
      { code: "SERVICE_DISABLED", reason: "Not at this location" },
    ]),
    "area"
  );
  assert.equal(
    resolveEligibilitySloganMode([
      { code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "Commercial" },
      { code: "SERVICE_DISABLED", reason: "Geo off" },
    ]),
    "vehicle"
  );
  assert.equal(resolveEligibilitySloganMode([GENERIC_SERVICE_BLOCK]), "area");
});

test("dedupeCommercialVehicleReasons keeps a single commercial line", () => {
  const out = dedupeCommercialVehicleReasons([
    {
      code: "COMMERCIAL_VEHICLE_REQUIRED",
      reason: "A commercial vehicle is required for Person Ride at this location.",
    },
    {
      code: "OWNERSHIP_NOT_ALLOWED",
      reason: "Non-commercial vehicles are not allowed for Person Ride at this location.",
    },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.code, "COMMERCIAL_VEHICLE_REQUIRED");
  assert.equal(
    out[0]!.reason,
    "Person Ride isn’t available — commercial vehicles are required.",
  );
});
