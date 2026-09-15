import { test } from "node:test";
import assert from "node:assert/strict";
import { operationalState, isActiveOrder, riderStatePermitsBatching } from "./operational-state.js";
import { evaluateBatchEligibility } from "./batch-eligibility.js";
import { evaluateBatchInsertion, type RouteStop, type BatchRouteConfig, type LatLng } from "./batch-route.js";

// ── operational state (§37–39, §85) ──────────────────────────────────────────
test("operational state maps statuses correctly", () => {
  assert.equal(operationalState("assigned"), "PRE_PICKUP");
  assert.equal(operationalState("reached_store"), "PRE_PICKUP"); // arrived at pickup
  assert.equal(operationalState("picked_up"), "CARRYING");
  assert.equal(operationalState("in_transit"), "CARRYING");
  assert.equal(operationalState("reached_user"), "CARRYING"); // at drop, not yet delivered
  assert.equal(operationalState("delivered"), "TERMINAL");
  assert.equal(operationalState("weird_unknown"), "CARRYING"); // conservative
  assert.equal(isActiveOrder("delivered"), false);
  assert.equal(isActiveOrder("assigned"), true);
});

test("rider state permits batching only while everything is pre-pickup", () => {
  assert.equal(riderStatePermitsBatching([]), true); // idle
  assert.equal(riderStatePermitsBatching(["assigned", "reached_store"]), true);
  assert.equal(riderStatePermitsBatching(["picked_up"]), false); // §72 carrying → blocked
  assert.equal(riderStatePermitsBatching(["accepted", "picked_up"]), false);
  assert.equal(riderStatePermitsBatching(["delivered"]), true); // §73 terminal ignored
});

// ── batch eligibility (hard gate) ────────────────────────────────────────────
const baseElig = {
  candidateService: "food" as const,
  activeOrderStatuses: ["assigned"] as string[],
  activeOrderServices: ["food"] as ("food" | "parcel" | "person_ride")[],
  maxActiveForService: 4,
  batchingEnabled: true,
  allowCrossService: true,
  locationFreshness: "FRESH" as const,
};

test("person ride is never batchable (§75)", () => {
  assert.equal(evaluateBatchEligibility({ ...baseElig, candidateService: "person_ride" }).reason, "PERSON_RIDE_NOT_BATCHABLE");
  assert.equal(evaluateBatchEligibility({ ...baseElig, activeOrderServices: ["person_ride"] }).reason, "PERSON_RIDE_NOT_BATCHABLE");
});

test("batching disabled → not eligible", () => {
  assert.equal(evaluateBatchEligibility({ ...baseElig, batchingEnabled: false }).reason, "BATCHING_DISABLED");
});

test("capacity reached (§74)", () => {
  const r = evaluateBatchEligibility({ ...baseElig, maxActiveForService: 2, activeOrderStatuses: ["assigned", "accepted"] });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "CAPACITY_REACHED");
});

test("stale location blocks a dynamic batch (§78)", () => {
  assert.equal(evaluateBatchEligibility({ ...baseElig, locationFreshness: "STALE" }).reason, "STALE_LOCATION");
  assert.equal(evaluateBatchEligibility({ ...baseElig, locationFreshness: "UNKNOWN" }).reason, "STALE_LOCATION");
});

test("picked-up state blocks a new batch offer (§72)", () => {
  const r = evaluateBatchEligibility({ ...baseElig, activeOrderStatuses: ["picked_up"] });
  assert.equal(r.eligible, false);
  assert.equal(r.reason, "RIDER_IN_PICKUP_TO_DROP_STATE");
});

test("at-pickup (reached_store) still allows a batch (§71)", () => {
  const r = evaluateBatchEligibility({ ...baseElig, activeOrderStatuses: ["reached_store"] });
  assert.equal(r.eligible, true);
});

test("cross-service off + other active service → mismatch", () => {
  const r = evaluateBatchEligibility({ ...baseElig, allowCrossService: false, activeOrderServices: ["parcel"] });
  assert.equal(r.reason, "SERVICE_MISMATCH_CROSS_SERVICE_OFF");
});

test("happy path → eligible", () => {
  assert.equal(evaluateBatchEligibility(baseElig).eligible, true);
});

// ── route insertion / feasibility ────────────────────────────────────────────
const CFG: BatchRouteConfig = {
  avgSpeedKmph: 30, // 2 min/km
  pickupServiceMin: 2,
  dropServiceMin: 1,
  maxPickupDetourKm: 3,
  maxPickupDetourMin: 15,
  maxExtraDropDelayMin: 15,
  sameStoreBonus: 6,
};
const KM = 0.008993; // ~1 km in latitude degrees
const P = (km: number): LatLng => ({ lat: km * KM, lng: 0 }); // point km north of origin
const RIDER = P(0);
// Existing order A: pickup at storeX (1 km), drop at 2 km.
const existingStops: RouteStop[] = [
  { orderId: 1, kind: "pickup", loc: P(1), storeKey: "storeX" },
  { orderId: 1, kind: "drop", loc: P(2) },
];

test("SAME STORE candidate is feasible and earns the same-store bonus (§68/§16)", () => {
  const sameStore = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0, existingStops,
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(1), storeKey: "storeX" },
    candidateDrop: { orderId: 2, kind: "drop", loc: P(2.2) },
    config: CFG,
  });
  const diffStore = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0, existingStops,
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(1), storeKey: "storeY" }, // same loc, diff store key
    candidateDrop: { orderId: 2, kind: "drop", loc: P(2.2) },
    config: CFG,
  });
  assert.equal(sameStore.feasible, true);
  assert.ok(sameStore.score < diffStore.score, "same-store batch scores better (lower)");
});

test("NEARBY store is feasible (§69)", () => {
  const r = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0, existingStops,
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(1.3), storeKey: "storeZ" },
    candidateDrop: { orderId: 2, kind: "drop", loc: P(2.5) },
    config: CFG,
  });
  assert.equal(r.feasible, true);
  assert.ok(r.sequence.length === 4);
});

test("FAR store is rejected on pickup detour (§70)", () => {
  const r = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0, existingStops,
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(10), storeKey: "far" }, // 10 km away
    candidateDrop: { orderId: 2, kind: "drop", loc: P(11) },
    config: CFG,
  });
  assert.equal(r.feasible, false);
  assert.equal(r.reason, "PICKUP_DETOUR_TOO_LARGE");
});

test("SLA ALWAYS WINS — a batch that misses a drop deadline is rejected (§98)", () => {
  const r = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0, existingStops,
    // Same store (no detour) so SLA is the only binding constraint.
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(1), storeKey: "storeX" },
    // Impossible deadline: must be delivered within 2 minutes, but travel alone takes longer.
    candidateDrop: { orderId: 2, kind: "drop", loc: P(2.2), deadlineMs: 2 * 60_000 },
    config: CFG,
  });
  assert.equal(r.feasible, false);
  assert.equal(r.reason, "SLA_RISK");
});

test("existing drop with a comfortable SLA still passes when batched", () => {
  const r = evaluateBatchInsertion({
    riderLoc: RIDER, nowMs: 0,
    existingStops: [
      { orderId: 1, kind: "pickup", loc: P(1), storeKey: "storeX" },
      { orderId: 1, kind: "drop", loc: P(2), deadlineMs: 60 * 60_000 }, // 60 min — plenty
    ],
    candidatePickup: { orderId: 2, kind: "pickup", loc: P(1), storeKey: "storeX" },
    candidateDrop: { orderId: 2, kind: "drop", loc: P(2.2), deadlineMs: 60 * 60_000 },
    config: CFG,
  });
  assert.equal(r.feasible, true);
});
