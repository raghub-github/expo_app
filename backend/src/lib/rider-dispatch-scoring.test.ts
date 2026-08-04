import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clamp01,
  distanceToScore,
  computeRiderDispatchScore,
  rankRidersByScore,
  NEUTRAL_SCORE_SIGNALS,
  type RiderScoreSignals,
} from "./rider-dispatch-scoring.js";
import type { DispatchScoreWeights } from "./dispatch-strategy-config.js";

const WEIGHTS: DispatchScoreWeights = {
  distance: 1.0,
  acceptanceRate: 0.5,
  cancellationRate: -0.5,
  idleBonus: 0.2,
  workloadPenalty: -0.3,
  directionAlignment: 0.3,
};

test("clamp01 bounds to [0,1] and guards non-finite", () => {
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(0.4), 0.4);
  assert.equal(clamp01(Number.NaN), 0);
});

test("distanceToScore: 1 at pickup, 0 at edge, 0 when radius invalid", () => {
  assert.equal(distanceToScore(0, 3000), 1);
  assert.equal(distanceToScore(3000, 3000), 0);
  assert.equal(distanceToScore(1500, 3000), 0.5);
  assert.equal(distanceToScore(9999, 3000), 0); // beyond edge clamps to 0
  assert.equal(distanceToScore(1000, 0), 0); // invalid radius
});

test("computeRiderDispatchScore: pure weighted sum", () => {
  const signals: RiderScoreSignals = {
    distanceScore: 1,
    acceptanceRate: 1,
    cancellationRate: 0,
    idleScore: 0,
    workloadScore: 0,
    directionAlignment: 0,
  };
  // 1*1 + 0.5*1 = 1.5
  assert.equal(computeRiderDispatchScore(signals, WEIGHTS), 1.5);
});

test("computeRiderDispatchScore: penalties reduce score", () => {
  const base: RiderScoreSignals = {
    distanceScore: 1,
    acceptanceRate: 0.5,
    cancellationRate: 0,
    idleScore: 0,
    workloadScore: 0,
    directionAlignment: 0,
  };
  const withCancel = { ...base, cancellationRate: 1 }; // -0.5
  const withLoad = { ...base, workloadScore: 1 }; // -0.3
  assert.ok(
    computeRiderDispatchScore(withCancel, WEIGHTS) <
      computeRiderDispatchScore(base, WEIGHTS)
  );
  assert.ok(
    computeRiderDispatchScore(withLoad, WEIGHTS) <
      computeRiderDispatchScore(base, WEIGHTS)
  );
});

test("rankRidersByScore: nearest wins when only distance differs", () => {
  const ranked = rankRidersByScore(
    [
      { riderId: 1, distanceMeters: 2500 },
      { riderId: 2, distanceMeters: 500 },
      { riderId: 3, distanceMeters: 1500 },
    ],
    WEIGHTS,
    3000
  );
  assert.deepEqual(
    ranked.map((r) => r.riderId),
    [2, 3, 1]
  );
});

test("rankRidersByScore: a high acceptance / idle rider can beat a slightly closer one", () => {
  const ranked = rankRidersByScore(
    [
      // closer but average
      { riderId: 1, distanceMeters: 900, acceptanceRate: 0.5, idleScore: 0 },
      // a bit farther but great acceptance + idle
      { riderId: 2, distanceMeters: 1200, acceptanceRate: 1, idleScore: 1 },
    ],
    WEIGHTS,
    3000
  );
  // rider1: dist .7 + acc .25 = .95 ; rider2: dist .6 + acc .5 + idle .2 = 1.3
  assert.equal(ranked[0].riderId, 2);
});

test("rankRidersByScore: missing signals fall back to neutral (no crash)", () => {
  const ranked = rankRidersByScore(
    [{ riderId: 7, distanceMeters: 100 }],
    WEIGHTS,
    3000
  );
  assert.equal(ranked.length, 1);
  assert.equal(NEUTRAL_SCORE_SIGNALS.acceptanceRate, 0.5);
});
