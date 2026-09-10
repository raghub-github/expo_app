import test from "node:test";
import assert from "node:assert/strict";
import { orderPoolByRanking, homeFoodRankingConfig } from "./home-food-integration.js";
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

test("config reflects the STORE_RANKING_HOME_FOOD_ENABLED env flag (default OFF)", () => {
  const prev = process.env.STORE_RANKING_HOME_FOOD_ENABLED;
  try {
    delete process.env.STORE_RANKING_HOME_FOOD_ENABLED;
    assert.equal(homeFoodRankingConfig().enabled, false);
    process.env.STORE_RANKING_HOME_FOOD_ENABLED = "true";
    assert.equal(homeFoodRankingConfig().enabled, true);
    process.env.STORE_RANKING_HOME_FOOD_ENABLED = "false";
    assert.equal(homeFoodRankingConfig().enabled, false);
  } finally {
    if (prev === undefined) delete process.env.STORE_RANKING_HOME_FOOD_ENABLED;
    else process.env.STORE_RANKING_HOME_FOOD_ENABLED = prev;
  }
});
