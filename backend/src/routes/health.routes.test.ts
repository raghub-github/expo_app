import { test } from "node:test";
import assert from "node:assert/strict";
import { decideOnDbProbeFailure } from "./health.routes.js";

const T0 = 1_000_000;

test("before the first DB success, a failure is a 503 (deploys must not promote it)", () => {
  const d = decideOnDbProbeFailure({ everConnected: false, failingSince: null, lastPoolResetAt: 0 }, T0);
  assert.equal(d.report503, true);
  assert.equal(d.resetPool, false);
});

test("a single slow probe on a working backend stays healthy and keeps the pool", () => {
  const d = decideOnDbProbeFailure({ everConnected: true, failingSince: null, lastPoolResetAt: 0 }, T0);
  assert.deepEqual(d, { report503: false, resetPool: false });
});

test("failures under 30s never rebuild the pool", () => {
  const d = decideOnDbProbeFailure({ everConnected: true, failingSince: T0, lastPoolResetAt: 0 }, T0 + 29_999);
  assert.equal(d.resetPool, false);
  assert.equal(d.report503, false);
});

test("after 30s of continuous failure the pool is rebuilt, at most once a minute", () => {
  const first = decideOnDbProbeFailure({ everConnected: true, failingSince: T0, lastPoolResetAt: 0 }, T0 + 30_000);
  assert.equal(first.resetPool, true);
  const again = decideOnDbProbeFailure(
    { everConnected: true, failingSince: T0, lastPoolResetAt: T0 + 30_000 },
    T0 + 60_000,
  );
  assert.equal(again.resetPool, false);
  const later = decideOnDbProbeFailure(
    { everConnected: true, failingSince: T0, lastPoolResetAt: T0 + 30_000 },
    T0 + 90_000,
  );
  assert.equal(later.resetPool, true);
});

test("a wedge lasting 90s reports 503 so autoheal can still restart it", () => {
  const d = decideOnDbProbeFailure({ everConnected: true, failingSince: T0, lastPoolResetAt: 0 }, T0 + 90_000);
  assert.equal(d.report503, true);
});
