import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveOrderLegVehicleType } from "./resolve-rider-legs-for-order.js";

// ── RIDE: catalog code -> pricing vehicle (same mapping already used for customer fare) ──
test("ride: bike catalog code maps to 2_wheeler", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: "bike" }),
    "2_wheeler"
  );
});

test("ride: auto catalog code maps to 3_wheeler", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: "auto" }),
    "3_wheeler"
  );
});

test("ride: taxi catalog code maps to 4_wheeler_ac", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: "taxi" }),
    "4_wheeler_ac"
  );
});

test("ride: car catalog code maps to 4_wheeler_non_ac", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: "car" }),
    "4_wheeler_non_ac"
  );
});

test("ride: unknown/null catalog code -> null (no vehicle rule can match, safe fallback)", () => {
  assert.equal(resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: null }), null);
  assert.equal(
    resolveOrderLegVehicleType({ service: "ride", rideCatalogCode: "totally-unknown-code" }),
    null
  );
});

// ── PARCEL: booked vehicle_category (already stored as the same enum strings) ──
test("parcel: valid vehicle_category passes through unchanged", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "parcel", parcelVehicleCategory: "3_wheeler" }),
    "3_wheeler"
  );
  assert.equal(
    resolveOrderLegVehicleType({ service: "parcel", parcelVehicleCategory: "2_wheeler" }),
    "2_wheeler"
  );
});

test("parcel: invalid/garbage vehicle_category -> null (never crashes, never mismatches)", () => {
  assert.equal(
    resolveOrderLegVehicleType({ service: "parcel", parcelVehicleCategory: "bogus" }),
    null
  );
  assert.equal(resolveOrderLegVehicleType({ service: "parcel", parcelVehicleCategory: null }), null);
  assert.equal(
    resolveOrderLegVehicleType({ service: "parcel", parcelVehicleCategory: "" }),
    null
  );
});

// ── FOOD: no vehicle dimension — always null regardless of inputs ──
test("food: always null (no vehicle dimension for food legs)", () => {
  assert.equal(
    resolveOrderLegVehicleType({
      service: "food",
      rideCatalogCode: "bike",
      parcelVehicleCategory: "3_wheeler",
    }),
    null
  );
});
