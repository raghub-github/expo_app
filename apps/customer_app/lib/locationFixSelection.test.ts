import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldReplaceFix,
  isImplausibleJump,
  metresBetween,
  type FixLike,
} from "./locationFixSelection";

const at = (lat: number, lon: number, accuracy: number | null, tMs: number): FixLike => ({
  latitude: lat,
  longitude: lon,
  accuracy,
  timestampMs: tMs,
});

// Karnal, Haryana reference point used across cases.
const BASE_LAT = 29.6857;
const BASE_LON = 76.9905;
// Realistic ms-epoch base (real fixes are never timestamp 0 — that means "unknown").
const T0 = 1_700_000_000_000;

test("metresBetween: ~0 for identical points, ~111km per degree lat", () => {
  assert.equal(Math.round(metresBetween(BASE_LAT, BASE_LON, BASE_LAT, BASE_LON)), 0);
  const oneDeg = metresBetween(0, 0, 1, 0);
  assert.ok(oneDeg > 110_000 && oneDeg < 112_000, `1° lat ≈ ${Math.round(oneDeg)}m`);
});

test("isImplausibleJump: null prev is never a jump", () => {
  assert.equal(isImplausibleJump(null, at(BASE_LAT, BASE_LON, 10, 1000)), false);
});

test("isImplausibleJump: prev with no timestamp is never a jump", () => {
  const prev = at(BASE_LAT, BASE_LON, 10, 0);
  const next = at(BASE_LAT + 0.1, BASE_LON, 10, 1000);
  assert.equal(isImplausibleJump(prev, next), false);
});

test("isImplausibleJump: small move within threshold is fine", () => {
  const prev = at(BASE_LAT, BASE_LON, 10, T0);
  const next = at(BASE_LAT + 0.001, BASE_LON, 10, T0 + 1000); // ~111m
  assert.equal(isImplausibleJump(prev, next), false);
});

test("isImplausibleJump: 5km in 1s is impossible → rejected", () => {
  const prev = at(BASE_LAT, BASE_LON, 10, T0);
  const next = at(BASE_LAT + 0.045, BASE_LON, 10, T0 + 1000); // ~5km, 1s → 5000 m/s
  assert.equal(isImplausibleJump(prev, next), true);
});

test("isImplausibleJump: same 5km jump over 3 hours is plausible (relocation)", () => {
  const prev = at(BASE_LAT, BASE_LON, 10, T0);
  const next = at(BASE_LAT + 0.045, BASE_LON, 10, T0 + 3 * 3600 * 1000);
  assert.equal(isImplausibleJump(prev, next), false);
});

test("shouldReplaceFix: no current → accept", () => {
  assert.equal(shouldReplaceFix(null, at(BASE_LAT, BASE_LON, 50, 1000)), true);
});

test("§30 core: do NOT replace an 8m fix with a 120m fix at the same spot", () => {
  const current = at(BASE_LAT, BASE_LON, 8, 1000);
  const worse = at(BASE_LAT, BASE_LON, 120, 2000); // same place, much worse accuracy
  assert.equal(shouldReplaceFix(current, worse), false);
});

test("§22: replace an 8m fix with a 6m fix at the same spot (improvement)", () => {
  const current = at(BASE_LAT, BASE_LON, 8, 1000);
  const better = at(BASE_LAT, BASE_LON, 6, 2000);
  assert.equal(shouldReplaceFix(current, better), true);
});

test("shouldReplaceFix: genuine move (>30m) always wins even if less accurate", () => {
  const current = at(BASE_LAT, BASE_LON, 8, 1000);
  const moved = at(BASE_LAT + 0.001, BASE_LON, 40, 2000); // ~111m away
  assert.equal(shouldReplaceFix(current, moved), true);
});

test("shouldReplaceFix: current has unknown accuracy → accept the new fix", () => {
  const current = at(BASE_LAT, BASE_LON, null, 1000);
  const next = at(BASE_LAT, BASE_LON, 50, 2000);
  assert.equal(shouldReplaceFix(current, next), true);
});

test("shouldReplaceFix: do not drop a known-accuracy fix for an unknown-accuracy one", () => {
  const current = at(BASE_LAT, BASE_LON, 12, 1000);
  const next = at(BASE_LAT, BASE_LON, null, 2000);
  assert.equal(shouldReplaceFix(current, next), false);
});

test("shouldReplaceFix: reject an implausible teleport (outlier) at the same instant", () => {
  const current = at(BASE_LAT, BASE_LON, 10, T0);
  const outlier = at(BASE_LAT + 0.045, BASE_LON, 5, T0 + 500); // ~5km in 0.5s, even if 'accurate'
  assert.equal(shouldReplaceFix(current, outlier), false);
});

test("shouldReplaceFix: accept a real relocation when enough time elapsed", () => {
  const current = at(BASE_LAT, BASE_LON, 10, T0);
  const relocated = at(BASE_LAT + 0.045, BASE_LON, 15, T0 + 3 * 3600 * 1000); // ~5km, 3h later
  assert.equal(shouldReplaceFix(current, relocated), true);
});
