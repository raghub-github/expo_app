import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildServiceEligibilityRows,
  hasBlockedService,
  resolveSelectableServices,
  GENERIC_SERVICE_BLOCK,
  RIDER_SERVICE_DISPLAY_ORDER,
} from "./rider-service-eligibility-rows";

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

test("blocked service with no backend reason falls back to a single generic reason", () => {
  const rows = buildServiceEligibilityRows({
    selectableServices: ["food"],
    backend: { parcel: { eligible: true, blocking: [] } },
  });
  const parcel = rows.find((r) => r.service === "parcel")!;
  assert.equal(parcel.state, "blocked");
  assert.deepEqual(parcel.reasons, [GENERIC_SERVICE_BLOCK]);

  // Also when there is no backend data at all.
  const person = rows.find((r) => r.service === "person_ride")!;
  assert.equal(person.state, "blocked");
  assert.deepEqual(person.reasons, [GENERIC_SERVICE_BLOCK]);
});

test("selectability wins over a shadow backend block (no UI regression before enforcement)", () => {
  // Backend says food is ineligible, but the client pool still lets the rider select it
  // (enforcement is shadow) — the row must stay selectable, not scare the rider.
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
  assert.equal(food.state, "selectable");
  assert.equal(food.reasons.length, 0);
});

test("resolveSelectableServices: enforcement OFF never restricts the client pool", () => {
  const pool = ["food", "parcel", "person_ride"] as const;
  const backend = {
    person_ride: { eligible: false, blocking: [{ code: "DL_REQUIRED_NOT_VERIFIED", reason: "x" }] },
  };
  assert.deepEqual(
    resolveSelectableServices({ clientPool: [...pool], backend, enforced: false }),
    [...pool]
  );
});

test("resolveSelectableServices: enforced removes only explicitly-ineligible services", () => {
  const selectable = resolveSelectableServices({
    clientPool: ["food", "parcel", "person_ride"],
    backend: {
      food: { eligible: true, blocking: [] },
      parcel: { eligible: true, blocking: [] },
      person_ride: {
        eligible: false,
        blocking: [{ code: "COMMERCIAL_VEHICLE_REQUIRED", reason: "x" }],
      },
    },
    enforced: true,
  });
  assert.deepEqual(selectable, ["food", "parcel"]);
});

test("resolveSelectableServices: enforced but missing backend data is fail-open (no lockout)", () => {
  // Backend unreachable → null → keep the whole pool.
  assert.deepEqual(
    resolveSelectableServices({ clientPool: ["food"], backend: null, enforced: true }),
    ["food"]
  );
  // Enforced, backend present but no entry for a pooled service → keep it (fail-open).
  assert.deepEqual(
    resolveSelectableServices({
      clientPool: ["food", "parcel"],
      backend: { food: { eligible: true, blocking: [] } },
      enforced: true,
    }),
    ["food", "parcel"]
  );
});

test("resolveSelectableServices: a service outside the pool is never added back", () => {
  // Backend eligible for person_ride, but it's not in the client pool → stays out.
  assert.deepEqual(
    resolveSelectableServices({
      clientPool: ["food"],
      backend: { person_ride: { eligible: true, blocking: [] } },
      enforced: true,
    }),
    ["food"]
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
