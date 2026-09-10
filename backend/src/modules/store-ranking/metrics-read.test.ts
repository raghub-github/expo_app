import test from "node:test";
import assert from "node:assert/strict";
import {
  metricsToHistoricalFeatures,
  neutralHistoricalFeatures,
  type RankingMetricsRow,
} from "./metrics-read.js";

const ROW: RankingMetricsRow = {
  storeId: 1,
  orders7d: 42,
  orders30d: 180,
  totalOrders30d: 200,
  cancellationRate: 0.05,
  refundRate: 0.02,
  complaintRate: 0.01,
  avgRating: 4.4,
  ratingCount: 900,
  kptExpectedMin: 15,
  kptActualMin: 18,
  etaActualMin: 34,
  updatedAt: "2026-01-01T00:00:00Z",
};

test("maps a metrics row to the historical feature slice (velocity = 7d orders)", () => {
  const f = metricsToHistoricalFeatures(ROW);
  assert.equal(f.recentOrders, 42);
  assert.equal(f.avgRating, 4.4);
  assert.equal(f.ratingCount, 900);
  assert.equal(f.expectedKptMin, 15);
  assert.equal(f.actualKptMedianMin, 18);
  assert.equal(f.actualEtaMedianMin, 34);
  assert.equal(f.cancellationRate, 0.05);
  // Promised ETA is not captured historically yet → null (engine treats reliability neutral).
  assert.equal(f.promisedEtaMin, null);
});

test("missing metrics row → neutral historical features (new / no recent orders)", () => {
  const f = metricsToHistoricalFeatures(undefined);
  assert.deepEqual(f, neutralHistoricalFeatures());
  assert.equal(f.recentOrders, 0);
  assert.equal(f.ratingCount, 0); // Bayesian will pull to prior; new-merchant boost handles exposure
  assert.equal(f.cancellationRate, 0); // no penalty on unknown
});
