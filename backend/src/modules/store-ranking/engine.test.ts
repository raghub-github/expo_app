import test from "node:test";
import assert from "node:assert/strict";
import { rankStores, fallbackRank } from "./engine.js";
import { DEFAULT_HOME_FOOD_CONFIG } from "./default-config.js";
import {
  bayesianRating,
  distanceScore,
  promiseReliability,
  ratePenalty,
  velocityScore,
  applyCap,
  clamp01,
} from "./normalize.js";
import type { StoreFeatures, RankingConfig } from "./types.js";

const CFG: RankingConfig = { ...DEFAULT_HOME_FOOD_CONFIG, enabled: true };

function store(id: number, over: Partial<StoreFeatures> = {}): StoreFeatures {
  return {
    storeId: id,
    roadDistanceKm: 2,
    avgRating: 4.3,
    ratingCount: 500,
    promisedEtaMin: 30,
    actualEtaMedianMin: 31,
    expectedKptMin: 15,
    actualKptMedianMin: 15,
    recentOrders: 300,
    availabilityFraction: 1,
    cancellationRate: 0.02,
    refundRate: 0.01,
    complaintRate: 0.01,
    oosRate: 0.02,
    ...over,
  };
}

function idsInOrder(fs: StoreFeatures[]): number[] {
  return rankStores(fs, CFG).map((r) => r.storeId);
}

// ── normalizers ──────────────────────────────────────────────────────────────
test("distance score is bounded, decreasing, stable near zero (no 1/d blowup)", () => {
  assert.equal(distanceScore(0, 8), 1);
  assert.equal(distanceScore(8, 8), 0);
  assert.equal(distanceScore(20, 8), 0);
  assert.ok(distanceScore(2, 8) > distanceScore(4, 8));
  assert.ok(distanceScore(0.0001, 8) <= 1); // no explosion near zero
});

test("bayesian rating: few reviews pulled toward the prior, high-volume dominates", () => {
  // 5.0 with 8 reviews should NOT beat 4.7 with 2500 reviews.
  const few = bayesianRating(5.0, 8, 4.0, 20);
  const many = bayesianRating(4.7, 2500, 4.0, 20);
  assert.ok(many > few, `many ${many} should beat few ${few}`);
  assert.ok(few >= 0 && few <= 1 && many >= 0 && many <= 1);
});

test("promise reliability rewards accuracy, penalizes over-promising, neutral on unknown", () => {
  assert.ok(promiseReliability(35, 36) > 0.9); // accurate
  assert.ok(promiseReliability(25, 45) < 0.6); // over-promised
  assert.equal(promiseReliability(30, 15), 1); // faster than promised
  assert.equal(promiseReliability(null, 30), 0.5); // unknown → neutral, never free 1
});

test("velocity: log-scaled, neutral below min sample", () => {
  assert.equal(velocityScore(5, 200, 20), 0.5); // below minSample → neutral
  assert.ok(velocityScore(200, 200, 20) > velocityScore(50, 200, 20));
  assert.ok(velocityScore(1e9, 200, 20) <= 1); // bounded
});

test("rate penalty: bounded by cap, and zero below min sample (tiny-sample protection)", () => {
  assert.equal(ratePenalty(1, 5, 0.2, 14, 20), 0); // 5 orders < minSample → no penalty
  assert.equal(ratePenalty(1, 500, 0.2, 14, 20), 14); // huge rate capped at 14
  assert.ok(ratePenalty(0.1, 500, 0.2, 14, 20) < 14);
});

test("applyCap / clamp01 guard NaN and negatives", () => {
  assert.equal(applyCap(NaN, 6), 0);
  assert.equal(applyCap(10, 6), 6);
  assert.equal(clamp01(-1), 0);
  assert.equal(clamp01(2), 1);
  assert.equal(clamp01(Infinity), 0);
});

// ── engine behavior ──────────────────────────────────────────────────────────
test("reliable-but-farther store can outrank a near-but-unreliable one (§7)", () => {
  const near = store(1, { roadDistanceKm: 0.3, actualEtaMedianMin: 55, cancellationRate: 0.25, recentOrders: 300 });
  const far = store(2, { roadDistanceKm: 0.9, actualEtaMedianMin: 31, cancellationRate: 0.01 });
  assert.deepEqual(idsInOrder([near, far]), [2, 1]);
});

test("chronic over-promise + high cancellation ranks below a steady store", () => {
  const flaky = store(1, { promisedEtaMin: 25, actualEtaMedianMin: 45, cancellationRate: 0.22 });
  const steady = store(2, { promisedEtaMin: 35, actualEtaMedianMin: 36, cancellationRate: 0.01 });
  assert.deepEqual(idsInOrder([flaky, steady]), [2, 1]);
});

test("subscription boost is capped — cannot float a poor store above a strong one (§14/§15)", () => {
  const poorPaid = store(1, {
    avgRating: 3.2, ratingCount: 400, cancellationRate: 0.18, actualEtaMedianMin: 50,
    subscriptionBoostRaw: 1000, // absurd — must be capped to boostCaps.subscription
  });
  const strongOrganic = store(2, { avgRating: 4.6, ratingCount: 2000, cancellationRate: 0.01 });
  const ranked = rankStores([poorPaid, strongOrganic], CFG);
  assert.equal(ranked[0]!.storeId, 2, "strong organic stays on top");
  assert.ok((ranked.find((r) => r.storeId === 1)!.breakdown.boosts.subscription ?? 0) <= CFG.boostCaps.subscription);
});

test("availability penalizes / OOS-heavy store drops", () => {
  const full = store(1, { availabilityFraction: 1, oosRate: 0.0 });
  const empty = store(2, { availabilityFraction: 0.2, oosRate: 0.8 });
  assert.deepEqual(idsInOrder([full, empty]), [1, 2]);
});

test("new-merchant exploration boost is bounded and time-boxed", () => {
  const newbie = store(1, { ratingCount: 0, recentOrders: 0, avgRating: 0, isNewMerchantInExplorationWindow: true });
  const ranked = rankStores([newbie, store(2)], CFG);
  const nb = ranked.find((r) => r.storeId === 1)!;
  assert.ok((nb.breakdown.boosts.newMerchant ?? 0) <= CFG.boostCaps.newMerchant);
});

test("deterministic + stable sort (same input → same order)", () => {
  const fs = [store(3), store(1), store(2)];
  assert.deepEqual(idsInOrder(fs), idsInOrder([...fs].reverse()));
});

test("ranking disabled → deterministic fallback (availability ▸ distance ▸ id), flagged", () => {
  const disabled: RankingConfig = { ...CFG, enabled: false };
  const out = rankStores([store(2, { roadDistanceKm: 5 }), store(1, { roadDistanceKm: 1 })], disabled);
  assert.equal(out.every((r) => r.fallback), true);
  assert.deepEqual(out.map((r) => r.storeId), [1, 2]); // nearer first when availability equal
});

test("fallbackRank orders by availability then distance then id", () => {
  const out = fallbackRank(
    [store(1, { availabilityFraction: 0.3, roadDistanceKm: 1 }), store(2, { availabilityFraction: 1, roadDistanceKm: 4 })],
    "v1",
    "HOME_FOOD"
  );
  assert.deepEqual(out.map((r) => r.storeId), [2, 1]); // more available first despite being farther
});

test("empty candidate list → empty result (no throw)", () => {
  assert.deepEqual(rankStores([], CFG), []);
});

test("breakdown sums (signals + boosts + penalties) reconcile to score", () => {
  const [r] = rankStores([store(1, { subscriptionBoostRaw: 3, cancellationRate: 0.25, recentOrders: 500 })], CFG);
  const b = r!.breakdown;
  const total =
    Object.values(b.signals).reduce((s, v) => s + (v ?? 0), 0) +
    Object.values(b.boosts).reduce((s, v) => s + (v ?? 0), 0) +
    Object.values(b.penalties).reduce((s, v) => s + (v ?? 0), 0);
  assert.ok(Math.abs(Math.max(0, total) - r!.score) < 0.05, `breakdown ${total} vs score ${r!.score}`);
});
