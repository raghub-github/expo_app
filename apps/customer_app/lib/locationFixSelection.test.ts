import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldReplaceFix,
  isImplausibleJump,
  metresBetween,
  pinStillHolds,
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

test("a sharp GPS fix replaces a km-off cell fix from seconds ago (not an impossible jump)", () => {
  const cell = at(BASE_LAT, BASE_LON, 3000, T0);
  const gps = at(BASE_LAT + 0.02, BASE_LON, 12, T0 + 5_000); // ~2.2 km away
  assert.equal(shouldReplaceFix(cell, gps), true);
});

test("a coarse reading inside its own error radius does not displace a sharp recent fix", () => {
  const gps = at(BASE_LAT, BASE_LON, 12, T0);
  const cell = at(BASE_LAT + 0.002, BASE_LON, 400, T0 + 20_000); // ~220 m away, +-400 m
  assert.equal(shouldReplaceFix(gps, cell), false);
});

test("a coarse reading well outside its error radius is a real move", () => {
  const gps = at(BASE_LAT, BASE_LON, 12, T0);
  const cell = at(BASE_LAT + 0.02, BASE_LON, 400, T0 + 600_000); // ~2.2 km away, 10 min on
  assert.equal(shouldReplaceFix(gps, cell), true);
});

test("a stale fix earns no protection from a coarse live reading", () => {
  const yesterday = at(BASE_LAT, BASE_LON, 12, T0);
  const live = at(BASE_LAT + 0.002, BASE_LON, 400, T0 + 24 * 3_600_000);
  assert.equal(shouldReplaceFix(yesterday, live), true);
});

// --- pinStillHolds: noise must not move the pin, a real move must ---
const PIN = { latitude: BASE_LAT, longitude: BASE_LON };
const northOf = (metres: number) => BASE_LAT + metres / 111_320;

test("pin holds against a fix inside the fix's own error radius", () => {
  assert.equal(pinStillHolds(PIN, { latitude: northOf(25), longitude: BASE_LON, accuracy: 30 }), true);
});

test("pin moves for a sharp fix that puts it outside the error radius", () => {
  assert.equal(pinStillHolds(PIN, { latitude: northOf(25), longitude: BASE_LON, accuracy: 12 }), false);
});

test("pin holds against small jitter on a very sharp fix", () => {
  assert.equal(pinStillHolds(PIN, { latitude: northOf(8), longitude: BASE_LON, accuracy: 4 }), true);
  assert.equal(pinStillHolds(PIN, { latitude: northOf(12), longitude: BASE_LON, accuracy: 4 }), false);
});

test("a rough fix cannot hold the pin at long range just by claiming a wide radius", () => {
  assert.equal(pinStillHolds(PIN, { latitude: northOf(200), longitude: BASE_LON, accuracy: 500 }), false);
});

test("unknown accuracy holds only within GPS noise", () => {
  assert.equal(pinStillHolds(PIN, { latitude: northOf(8), longitude: BASE_LON, accuracy: null }), true);
  assert.equal(pinStillHolds(PIN, { latitude: northOf(15), longitude: BASE_LON, accuracy: null }), false);
});
