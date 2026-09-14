import test from "node:test";
import assert from "node:assert/strict";
import { orderPoolByRanking } from "./home-food-integration.js";
import { DEFAULT_HOME_FOOD_CONFIG } from "./default-config.js";
import type { RankingMetricsRow } from "./metrics-read.js";
import type { RankingConfig } from "./types.js";

type Row = { id: number; distance_km?: number | null; name: string };

function metric(storeId: number, over: Partial<RankingMetricsRow> = {}): RankingMetricsRow {
  return {
    storeId,
    orders7d: 0,
    orders30d: 0,
    totalOrders30d: 0,
    cancellationRate: 0,
    refundRate: 0,
    complaintRate: 0,
    avgRating: 0,
    ratingCount: 0,
    kptExpectedMin: null,
    kptActualMin: null,
    etaActualMin: null,
    updatedAt: null,
    ...over,
  };
}

const ON: RankingConfig = { ...DEFAULT_HOME_FOOD_CONFIG, enabled: true };
const OFF: RankingConfig = { ...DEFAULT_HOME_FOOD_CONFIG, enabled: false };

test("disabled config is a no-op: pool order is preserved exactly", () => {
  const rows: Row[] = [
    { id: 1, distance_km: 5, name: "far" },
    { id: 2, distance_km: 1, name: "near" },
  ];
  const out = orderPoolByRanking(rows, new Map(), OFF);
  assert.deepEqual(out.map((r) => r.id), [1, 2]);
});

test("ranked pool reorders by quality+proximity, not input order; same row objects returned", () => {
  const rows: Row[] = [
    { id: 1, distance_km: 2, name: "ok-nearby" },
    { id: 2, distance_km: 3, name: "great-slightly-farther" },
  ];
  const metrics = new Map<number, RankingMetricsRow>([
    [1, metric(1, { avgRating: 3.0, ratingCount: 200, orders7d: 5 })],
    [2, metric(2, { avgRating: 4.8, ratingCount: 500, orders7d: 150 })],
  ]);
  const out = orderPoolByRanking(rows, metrics, ON);
  // Store 2 (far better rating + velocity, only slightly farther) should lead.
  assert.equal(out[0].id, 2);
  assert.equal(out[1].id, 1);
  // Returns the SAME objects, never drops rows.
  assert.equal(out.length, 2);
  assert.ok(out.includes(rows[0]) && out.includes(rows[1]));
});

test("rows with no metrics still appear (neutral features), never dropped", () => {
  const rows: Row[] = [
    { id: 10, distance_km: 1, name: "new-a" },
    { id: 11, distance_km: 2, name: "new-b" },
  ];
  const out = orderPoolByRanking(rows, new Map(), ON);
  assert.equal(out.length, 2);
  assert.deepEqual(new Set(out.map((r) => r.id)), new Set([10, 11]));
});

test("bad/duplicate ids are preserved at the end in original order", () => {
  const rows: Row[] = [
    { id: 1, distance_km: 2, name: "valid" },
    { id: 0, distance_km: 1, name: "bad-id" },
  ];
  const metrics = new Map<number, RankingMetricsRow>([
    [1, metric(1, { avgRating: 4.5, ratingCount: 300 })],
  ]);
  const out = orderPoolByRanking(rows, metrics, ON);
  assert.equal(out.length, 2);
  assert.equal(out[out.length - 1].id, 0); // leftover kept at the end
});

test("single-element and empty pools are returned untouched", () => {
  assert.deepEqual(orderPoolByRanking([{ id: 1, name: "solo" } as Row], new Map(), ON).map((r) => r.id), [1]);
  assert.deepEqual(orderPoolByRanking([] as Row[], new Map(), ON), []);
});

test("active-subscription boost nudges but cannot override a clearly better organic store", () => {
  const rows: Row[] = [
    { id: 1, distance_km: 2, name: "subscribed-ok" },
    { id: 2, distance_km: 2, name: "unsubscribed-great" },
  ];
  const metrics = new Map<number, RankingMetricsRow>([
    [1, metric(1, { avgRating: 4.5, ratingCount: 300, orders7d: 100, totalOrders30d: 400 })],
    [2, metric(2, { avgRating: 4.55, ratingCount: 320, orders7d: 110, totalOrders30d: 420 })],
  ]);
  // Store 1 is subscribed (raw boost 6, capped by boostCaps.subscription=6); it may edge ahead of a
  // near-identical store but the boost is bounded — a strongly better store still wins (see below).
  const boosted = orderPoolByRanking(rows, metrics, ON, new Map([[1, 6]]));
  assert.equal(boosted[0].id, 1, "small quality gap + capped boost lets the subscriber lead");

  // Now make store 2 clearly better — the capped boost must NOT float store 1 above it (§15).
  const metrics2 = new Map<number, RankingMetricsRow>([
    [1, metric(1, { avgRating: 3.2, ratingCount: 300, orders7d: 5, totalOrders30d: 40, cancellationRate: 0.2 })],
    [2, metric(2, { avgRating: 4.8, ratingCount: 2000, orders7d: 200, totalOrders30d: 600 })],
  ]);
  const boosted2 = orderPoolByRanking(rows, metrics2, ON, new Map([[1, 6]]));
  assert.equal(boosted2[0].id, 2, "capped subscription boost cannot beat a clearly stronger organic store");
});
