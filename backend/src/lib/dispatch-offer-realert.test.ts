import test from "node:test";
import assert from "node:assert/strict";
import { shouldRealertWave, dispatchRealertDedupKey } from "./dispatch-offer-realert.js";

const NOW = 1_800_000_000_000; // fixed nowMs
const DELAY = 8; // seconds

test("before the delay has elapsed → no re-alert", () => {
  assert.equal(
    shouldRealertWave({ lastWaveAtMs: NOW - 5_000, nextWaveAtMs: null, nowMs: NOW, delaySeconds: DELAY }),
    false
  );
});

test("after the delay, wave not yet expanded → re-alert", () => {
  assert.equal(
    shouldRealertWave({ lastWaveAtMs: NOW - 10_000, nextWaveAtMs: NOW + 12_000, nowMs: NOW, delaySeconds: DELAY }),
    true
  );
});

test("after the delay but wave already due to expand → defer to wave engine (no re-alert)", () => {
  assert.equal(
    shouldRealertWave({ lastWaveAtMs: NOW - 30_000, nextWaveAtMs: NOW - 1, nowMs: NOW, delaySeconds: DELAY }),
    false
  );
});

test("next_wave_at null (no expansion scheduled) + past delay → re-alert", () => {
  assert.equal(
    shouldRealertWave({ lastWaveAtMs: NOW - 20_000, nextWaveAtMs: null, nowMs: NOW, delaySeconds: DELAY }),
    true
  );
});

test("missing/invalid last_wave_at → never re-alert", () => {
  assert.equal(shouldRealertWave({ lastWaveAtMs: null, nextWaveAtMs: null, nowMs: NOW, delaySeconds: DELAY }), false);
  assert.equal(shouldRealertWave({ lastWaveAtMs: NaN, nextWaveAtMs: null, nowMs: NOW, delaySeconds: DELAY }), false);
});

test("exactly at the delay boundary → re-alert (inclusive)", () => {
  assert.equal(
    shouldRealertWave({ lastWaveAtMs: NOW - DELAY * 1000, nextWaveAtMs: null, nowMs: NOW, delaySeconds: DELAY }),
    true
  );
});

test("dedup key is stable and unique per (session, wave, rider)", () => {
  assert.equal(dispatchRealertDedupKey(12, 2, 345), "dispatch:realert:12:2:345");
  assert.notEqual(dispatchRealertDedupKey(12, 2, 345), dispatchRealertDedupKey(12, 3, 345));
  assert.notEqual(dispatchRealertDedupKey(12, 2, 345), dispatchRealertDedupKey(12, 2, 346));
});
