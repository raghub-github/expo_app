import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveFoodWaitingFreeBudgetSeconds,
  normalizeWaitingStartMode,
} from "./food-waiting-start.ts";

const T0 = 1_700_000_000_000;
const MIN = 60_000;

test("normalizeWaitingStartMode", () => {
  assert.equal(normalizeWaitingStartMode("KPT_PLUS_GRACE"), "KPT_PLUS_GRACE");
  assert.equal(normalizeWaitingStartMode("kpt_plus_grace"), "KPT_PLUS_GRACE");
  assert.equal(normalizeWaitingStartMode("FIXED_GRACE"), "FIXED_GRACE");
  assert.equal(normalizeWaitingStartMode(null), "FIXED_GRACE");
  assert.equal(normalizeWaitingStartMode("garbage"), "FIXED_GRACE");
});

test("FIXED_GRACE ignores KPT — always the fixed grace from arrival", () => {
  const sec = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "FIXED_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 10,
    arrivalAtMs: T0 + 15 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN,
  });
  assert.equal(sec, 120); // 2 min, KPT irrelevant
});

test("KPT_PLUS_GRACE: rider arrives BEFORE KPT+grace → free stretches to cover it", () => {
  // KPT ready at T0+20, grace 5 → charge starts T0+25. Rider arrives T0+15 → 10 min free.
  const sec = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 5,
    arrivalAtMs: T0 + 15 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN,
  });
  assert.equal(sec, 10 * 60);
});

test("KPT_PLUS_GRACE: rider arrives AFTER KPT+grace → falls back to the base grace", () => {
  // Charge starts T0+25; rider arrives T0+40 (late) → untilChargeStart 0 → base grace 2 min.
  const sec = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 5,
    arrivalAtMs: T0 + 40 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN,
  });
  assert.equal(sec, 120);
});

test("KPT_PLUS_GRACE never drops below the base grace", () => {
  // Charge starts T0+21 (KPT 20 + grace 1); rider arrives exactly at T0+20 → 1 min < base 3 min.
  const sec = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 3,
    kptGraceMinutes: 1,
    arrivalAtMs: T0 + 20 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN,
  });
  assert.equal(sec, 180); // base 3 min wins over the 1 min KPT window
});

test("KPT_PLUS_GRACE with no original prep commitment falls back to fixed grace (§6 safe default)", () => {
  const sec = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 10,
    arrivalAtMs: T0 + 15 * MIN,
    originalPrepReadyByMs: null,
  });
  assert.equal(sec, 120);
});

test("anti-manipulation: the anchor is the ORIGINAL commitment, so inflating KPT can't defer waiting", () => {
  // The caller passes the FROZEN prep_ready_by_at (accept-time). A later "need more time"
  // that pushes expected_ready_at out is NOT this value, so the free window is unchanged.
  const original = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 5,
    arrivalAtMs: T0 + 15 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN, // original 20-min KPT
  });
  // Same call again represents "merchant padded KPT to 60 min" but original anchor is unchanged.
  const afterPadding = resolveFoodWaitingFreeBudgetSeconds({
    startMode: "KPT_PLUS_GRACE",
    freeMinutes: 2,
    kptGraceMinutes: 5,
    arrivalAtMs: T0 + 15 * MIN,
    originalPrepReadyByMs: T0 + 20 * MIN, // caller must NOT pass the inflated value
  });
  assert.equal(original, afterPadding);
  assert.equal(original, 10 * 60);
});
