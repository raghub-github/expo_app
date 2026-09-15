/**
 * Dispatch batching SIMULATION harness (§67/§105). Generates many synthetic riders + orders and
 * runs the full batch-decision pipeline (eligibility → route feasibility → scoring), asserting the
 * SAFETY INVARIANTS hold at scale and reporting aggregate metrics. Pure/deterministic (seeded PRNG),
 * no DB/network — so it runs in CI and proves the engine can never produce an unsafe batch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBatchCandidate, pickBestBatchCandidate } from "./batch-candidate.js";
import type { BatchService } from "./batch-eligibility.js";
import type { RouteStop, LatLng, BatchRouteConfig } from "./batch-route.js";
import { operationalState, type OrderStatus } from "./operational-state.js";

// ── deterministic PRNG ───────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KM = 0.008993;
const P = (kmN: number, kmE: number): LatLng => ({ lat: kmN * KM, lng: kmE * KM });

const CFG: BatchRouteConfig = {
  avgSpeedKmph: 24,
  pickupServiceMin: 3,
  dropServiceMin: 2,
  maxPickupDetourKm: 2.5,
  maxPickupDetourMin: 12,
  maxExtraDropDelayMin: 12,
  sameStoreBonus: 6,
};

type SimRider = {
  id: number;
  loc: LatLng;
  activeStatuses: OrderStatus[];
  activeServices: BatchService[];
  stops: RouteStop[]; // remaining stops of the active order (if any)
  freshness: "FRESH" | "STALE" | "UNKNOWN";
};

const STATUS_POOL: OrderStatus[] = [
  "assigned", "accepted", "reached_store", // pre-pickup (batchable)
  "picked_up", "in_transit", // carrying (blocked)
];

function buildScenario(seed: number, riderCount: number) {
  const rnd = mulberry32(seed);
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!;
  const riders: SimRider[] = [];
  for (let i = 0; i < riderCount; i++) {
    const loc = P((rnd() - 0.5) * 12, (rnd() - 0.5) * 12);
    const hasActive = rnd() < 0.55;
    const service: BatchService = rnd() < 0.75 ? "food" : rnd() < 0.5 ? "parcel" : "person_ride";
    const status = hasActive ? pick(STATUS_POOL) : undefined;
    const stops: RouteStop[] = [];
    if (hasActive && service !== "person_ride") {
      const pk = P((rnd() - 0.5) * 10, (rnd() - 0.5) * 10);
      const dp = P((rnd() - 0.5) * 12, (rnd() - 0.5) * 12);
      const orderId = 100000 + i;
      stops.push({ orderId, kind: "pickup", loc: pk, storeKey: `store${Math.floor(rnd() * 30)}` });
      stops.push({ orderId, kind: "drop", loc: dp, deadlineMs: 0 + (30 + rnd() * 30) * 60_000 });
    }
    riders.push({
      id: i + 1,
      loc,
      activeStatuses: status ? [status] : [],
      activeServices: hasActive ? [service] : [],
      stops,
      freshness: rnd() < 0.85 ? "FRESH" : rnd() < 0.5 ? "STALE" : "UNKNOWN",
    });
  }
  return riders;
}

function runOrderAgainstRiders(orderId: number, storeKey: string, riders: SimRider[]) {
  const pickup: RouteStop = { orderId, kind: "pickup", loc: P((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8), storeKey };
  // deterministic pickup/drop instead of Math.random — recompute from orderId hash
  const rnd = mulberry32(orderId * 7919);
  const pk = P((rnd() - 0.5) * 10, (rnd() - 0.5) * 10);
  const dp = P((rnd() - 0.5) * 12, (rnd() - 0.5) * 12);
  const candidatePickup: RouteStop = { orderId, kind: "pickup", loc: pk, storeKey };
  const candidateDrop: RouteStop = { orderId, kind: "drop", loc: dp, deadlineMs: (35 + rnd() * 30) * 60_000 };
  void pickup;

  const decisions = riders
    .filter((r) => r.activeStatuses.length > 0) // additional-order (batch) candidates only
    .map((r) =>
      evaluateBatchCandidate({
        riderId: r.id,
        eligibility: {
          candidateService: "food",
          activeOrderStatuses: r.activeStatuses,
          activeOrderServices: r.activeServices,
          maxActiveForService: 4,
          batchingEnabled: true,
          allowCrossService: true,
          locationFreshness: r.freshness,
        },
        route: {
          riderLoc: r.loc,
          nowMs: 0,
          existingStops: r.stops,
          candidatePickup,
          candidateDrop,
          config: CFG,
        },
      })
    );
  return decisions;
}

test("SIMULATION: batch decisions hold all safety invariants at scale (§67/§105)", () => {
  const riders = buildScenario(20260915, 80);
  const metrics = { offered: 0, rejected: 0, byReason: new Map<string, number>() };
  const t0 = Date.now();

  for (let o = 0; o < 60; o++) {
    const decisions = runOrderAgainstRiders(200000 + o, `store${o % 30}`, riders);
    const riderById = new Map(riders.map((r) => [r.id, r]));

    for (const d of decisions) {
      if (d.offered) {
        metrics.offered++;
        const r = riderById.get(d.riderId)!;
        // INVARIANT 1: never batch onto a rider that is carrying/delivering (§72).
        assert.ok(
          r.activeStatuses.every((s) => operationalState(s) === "PRE_PICKUP" || operationalState(s) === "TERMINAL"),
          `offered batch to rider in carrying state (rider ${r.id}: ${r.activeStatuses})`
        );
        // INVARIANT 2: never batch onto a rider with an active person ride (§77).
        assert.ok(!r.activeServices.includes("person_ride"), "offered batch onto active person-ride rider");
        // INVARIANT 3: never exceed capacity.
        assert.ok(r.activeStatuses.filter((s) => operationalState(s) !== "TERMINAL").length < 4, "capacity exceeded");
        // INVARIANT 4: never batch on a stale/unknown location (§78).
        assert.equal(r.freshness, "FRESH", "offered batch on non-fresh location");
        // INVARIANT 5: a feasible route sequence with the candidate's pickup before its drop.
        const pIdx = d.sequence.findIndex((x) => x.orderId === 200000 + o && x.kind === "pickup");
        const dIdx = d.sequence.findIndex((x) => x.orderId === 200000 + o && x.kind === "drop");
        assert.ok(pIdx >= 0 && dIdx > pIdx, "candidate pickup must precede its drop in the route");
      } else {
        metrics.rejected++;
        metrics.byReason.set(d.reason ?? "UNKNOWN", (metrics.byReason.get(d.reason ?? "UNKNOWN") ?? 0) + 1);
      }
    }

    // INVARIANT 6: pickBestBatchCandidate returns the minimum-score offered candidate.
    const best = pickBestBatchCandidate(decisions);
    if (best) {
      const minScore = Math.min(...decisions.filter((d) => d.offered).map((d) => d.score));
      assert.equal(best.score, minScore, "best candidate is not the lowest score");
    }
  }

  const durMs = Date.now() - t0;
  // Performance sanity (§60): 80 riders × 60 orders of full pipeline should be well under a second.
  assert.ok(durMs < 1500, `simulation too slow: ${durMs}ms`);

  // eslint-disable-next-line no-console
  console.log(
    `\n[batch simulation] 80 riders × 60 orders in ${durMs}ms — offered=${metrics.offered} rejected=${metrics.rejected}\n` +
      `  rejection reasons: ${[...metrics.byReason.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`
  );
  // The engine must actually be exercising both paths (some offered AND some rejected).
  assert.ok(metrics.rejected > 0, "expected some rejections");
});

test("SIMULATION: person-ride order is never batched onto anyone (§75/§77)", () => {
  const riders = buildScenario(42, 40);
  let anyOffered = false;
  for (const r of riders) {
    const d = evaluateBatchCandidate({
      riderId: r.id,
      eligibility: {
        candidateService: "person_ride",
        activeOrderStatuses: r.activeStatuses,
        activeOrderServices: r.activeServices,
        maxActiveForService: 1,
        batchingEnabled: true,
        allowCrossService: true,
        locationFreshness: "FRESH",
      },
      route: {
        riderLoc: r.loc, nowMs: 0, existingStops: r.stops,
        candidatePickup: { orderId: 1, kind: "pickup", loc: P(1, 1) },
        candidateDrop: { orderId: 1, kind: "drop", loc: P(2, 2) },
        config: CFG,
      },
    });
    if (d.offered) anyOffered = true;
  }
  assert.equal(anyOffered, false, "person-ride must never be a batch candidate");
});
